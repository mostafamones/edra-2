-- Academy switching keeps one control and its original expiry/return context.
-- The active run changes only when a leased command publishes its new session.
-- Original tokens remain bound to the entry run; each issued receipt retains its own run.
alter table edra_private.dev_controls add column original_run_id uuid references edra_private.dev_runs(id);
update edra_private.dev_controls set original_run_id=run_id;
alter table edra_private.dev_controls alter column original_run_id set not null;
create function edra_private.dev_original_run() returns trigger language plpgsql set search_path='' as $$
begin new.original_run_id := coalesce(new.original_run_id,new.run_id); return new; end $$;
create trigger dev_original_run before insert on edra_private.dev_controls for each row execute function edra_private.dev_original_run();
alter table edra_private.dev_commands add column target_run_id uuid references edra_private.dev_runs(id);
update edra_private.dev_commands m set target_run_id=c.run_id from edra_private.dev_controls c where c.id=m.control_id;
create or replace function public.dev_preview_context(p_developer_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'allowlisted', exists (select 1 from edra_private.dev_developers d where d.user_id = p_developer_id)
      and not exists (select 1 from edra_private.dev_accounts a where a.user_id = p_developer_id),
    'runs', coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'academy_slug',a.slug) order by r.ready_at desc,r.id)
from edra_private.dev_runs r join public.academies a on a.id=r.academy_id where r.developer_id=p_developer_id and r.state='ready'),'[]'::jsonb),
'run', (select jsonb_build_object('id', r.id, 'academy_id', r.academy_id, 'academy_slug', a.slug)
      from edra_private.dev_runs r join public.academies a on a.id = r.academy_id
      where r.developer_id = p_developer_id and r.state = 'ready' order by r.ready_at desc, r.id limit 1)
  );
$$;
create or replace function public.dev_control_state(p_token_hash text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'original_run_id', c.original_run_id, 'id', c.id, 'run_id', c.run_id, 'academy_slug', a.slug, 'developer_id', c.developer_id,
    'original_session_id', c.original_session_id, 'return_path', c.return_path,
    'current_logical_id', c.current_logical_id, 'current_session_id', c.current_session_id,
    'prior_logical_id', c.prior_logical_id, 'prior_return_path', c.prior_return_path,
    'revision', c.revision, 'expires_at', c.expires_at, 'ended_at', c.ended_at,
    'live', edra_private.dev_control_live(c),
    'replay_session_id', (select m.previous_session_id from edra_private.dev_commands m
      where m.control_id = c.id and m.state = 'complete' and m.revision = c.revision)
  )
  from edra_private.dev_controls c
  join edra_private.dev_runs r on r.id = c.run_id
  left join public.academies a on a.id = r.academy_id
  where c.token_hash = p_token_hash;
$$;
create function public.dev_academy_command_begin(p_control_id uuid,p_command_id uuid,p_expected_revision integer,p_kind text,p_target_logical_id text,p_previous_session_id uuid,p_target_run_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c edra_private.dev_controls%rowtype; result jsonb;
begin
 select * into c from edra_private.dev_controls where id=p_control_id for update;
 if not found or not edra_private.dev_control_live(c) then return jsonb_build_object('result','inactive'); end if;
 if exists(select 1 from edra_private.dev_commands where control_id=c.id and command_id=p_command_id) then
 if not exists(select 1 from edra_private.dev_commands where control_id=c.id and command_id=p_command_id and target_run_id=p_target_run_id and target_logical_id is not distinct from p_target_logical_id and kind=p_kind) then return jsonb_build_object('result','stale'); end if;
 return public.dev_command_begin(p_control_id,p_command_id,p_expected_revision,p_kind,p_target_logical_id,p_previous_session_id); end if;
 if c.revision <> p_expected_revision then return jsonb_build_object('result','conflict'); end if;
 if not exists(select 1 from edra_private.dev_runs where id=p_target_run_id and developer_id=c.developer_id and state='ready') then return jsonb_build_object('result','run_unavailable'); end if;
 if p_target_run_id <> c.run_id and (p_target_logical_id is distinct from 'account:staff:owner' or not exists(select 1 from edra_private.dev_accounts where run_id=p_target_run_id and logical_id=p_target_logical_id and state='loaded')) then return jsonb_build_object('result','invalid_target'); end if;
 result := public.dev_command_begin(p_control_id,p_command_id,p_expected_revision,p_kind,p_target_logical_id,p_previous_session_id);
 if result->>'result'='begun' then update edra_private.dev_commands set target_run_id=p_target_run_id where control_id=c.id and command_id=p_command_id; end if;
 return result;
end $$;
revoke all on function public.dev_academy_command_begin(uuid,uuid,integer,text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.dev_academy_command_begin(uuid,uuid,integer,text,text,uuid,uuid) to service_role;
create or replace function public.dev_command_complete(
  p_control_id uuid, p_command_id uuid, p_session_id uuid, p_user_id uuid, p_receipt text,
  p_set_prior boolean, p_prior_logical_id text, p_prior_return_path text, p_original_tokens text
) returns text language plpgsql security definer set search_path = '' as $$
declare
  c edra_private.dev_controls%rowtype;
  m edra_private.dev_commands%rowtype;
begin
  select * into c from edra_private.dev_controls where id = p_control_id for update;
  select * into m from edra_private.dev_commands where control_id = p_control_id and command_id = p_command_id for update;
  if c.id is null or m.control_id is null or m.state <> 'pending' or c.lease_command_id is distinct from p_command_id
    or c.lease_expires_at <= now() or not edra_private.dev_control_live(c) or m.revision <> c.revision + 1
    or (p_session_id is null) <> (m.target_logical_id is null) then
    update edra_private.dev_commands set state = 'abandoned' where control_id = p_control_id and command_id = p_command_id and state = 'pending';
    return 'lost';
  end if;
  if m.target_run_id is not null and not exists(select 1 from edra_private.dev_runs where id=m.target_run_id and developer_id=c.developer_id and state='ready') then return 'lost'; end if;
  if p_session_id is not null and not exists (
    select 1 from edra_private.dev_accounts a where a.run_id = coalesce(m.target_run_id,c.run_id) and a.logical_id = m.target_logical_id and a.user_id = p_user_id and a.state = 'loaded') then
    raise exception using errcode = 'P0001', message = 'dev_target_mismatch';
  end if;
  update edra_private.dev_commands set target_run_id = coalesce(m.target_run_id, c.run_id), session_id = p_session_id, user_id = p_user_id, receipt = p_receipt,
    state = 'complete', completed_at = now()
  where control_id = c.id and command_id = p_command_id;
  update edra_private.dev_controls set run_id=coalesce(m.target_run_id,c.run_id), revision = m.revision, current_logical_id = m.target_logical_id,
    current_session_id = p_session_id,
    prior_logical_id = case when p_set_prior then p_prior_logical_id else prior_logical_id end,
    prior_return_path = case when p_set_prior then p_prior_return_path else prior_return_path end,
    original_tokens = coalesce(p_original_tokens, original_tokens),
    lease_command_id = null, lease_expires_at = null, updated_at = now()
  where id = c.id;
  return 'completed';
end;
$$;
create or replace function public.dev_control_sessions(p_control_id uuid, p_keep uuid[])
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('session_id', m.session_id, 'user_id', m.user_id, 'receipt', m.receipt, 'run_id', coalesce(m.target_run_id,c.run_id))), '[]'::jsonb)
  from edra_private.dev_commands m join edra_private.dev_controls c on c.id=m.control_id
  where m.control_id = p_control_id and m.session_id is not null and m.revoked_at is null
    and not (m.session_id = any (coalesce(p_keep, '{}')));
$$;