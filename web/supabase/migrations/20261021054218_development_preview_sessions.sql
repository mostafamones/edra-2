-- Developer preview controls (docs/product/domains/development-tools.md, Developer mode).
--
-- A control lets an allowlisted developer browse a ready synthetic run as its generated staff and
-- student accounts with real password sessions. The browser holds only an opaque HTTP-only token;
-- its SHA-256 hash, the encrypted original developer session and the encrypted issued-session
-- receipts live here. Switches are serialized by a lease plus a compare-and-set on the control
-- revision; a repeated latest command replays its stored receipt and an older one is stale.
--
-- Authority: a registered generated account's session now has application authority only while it
-- is the current session of a live control (unexpired, not ended, run ready, developer still
-- allowlisted and their original session still live). Ordinary users are unaffected.
--
-- Every public function here is a service-role adapter for the web server; browser roles have no
-- access to the tables or functions.

create table edra_private.dev_controls (
  id uuid primary key,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  run_id uuid not null references edra_private.dev_runs (id),
  developer_id uuid not null,
  original_session_id uuid not null,
  -- AES-256-GCM ciphertext of the original access/refresh pair, bound to this control.
  original_tokens text not null,
  return_path text not null check (return_path ~ '^/' and char_length(return_path) <= 1200),
  -- Null while the real developer identity is current.
  current_logical_id text,
  current_session_id uuid,
  -- Staff identity Return to staff restores (null: the real developer) and its directory path.
  prior_logical_id text,
  prior_return_path text check (prior_return_path ~ '^/' and char_length(prior_return_path) <= 1200),
  revision integer not null default 0 check (revision >= 0),
  lease_command_id uuid,
  lease_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  end_reason text check (end_reason in ('exit', 'sign_out', 'expired', 'replaced', 'reset')),
  constraint dev_controls_lifetime check (expires_at <= created_at + interval '2 hours'),
  constraint dev_controls_current_shape check ((current_logical_id is null) = (current_session_id is null)),
  constraint dev_controls_end_shape check ((ended_at is null) = (end_reason is null))
);
create unique index dev_controls_one_active on edra_private.dev_controls (original_session_id) where ended_at is null;

create table edra_private.dev_commands (
  control_id uuid not null references edra_private.dev_controls (id),
  command_id uuid not null,
  -- The control revision this command produces.
  revision integer not null check (revision >= 1),
  kind text not null check (kind in ('enter', 'switch', 'return')),
  -- Null: restore the real developer identity.
  target_logical_id text,
  -- The cookie session when the command began; a replay after a lost response presents it.
  previous_session_id uuid,
  session_id uuid unique,
  user_id uuid,
  -- AES-256-GCM ciphertext of the issued session pair.
  receipt text,
  state text not null default 'pending' check (state in ('pending', 'complete', 'abandoned')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  revoked_at timestamptz,
  primary key (control_id, command_id),
  constraint dev_commands_issued_shape check ((session_id is null) = (receipt is null) and (session_id is null) = (user_id is null))
);
create unique index dev_commands_revision on edra_private.dev_commands (control_id, revision) where state = 'complete';

alter table edra_private.dev_controls enable row level security;
alter table edra_private.dev_commands enable row level security;
revoke all on edra_private.dev_controls, edra_private.dev_commands from public, anon, authenticated, service_role;

-- True while a control may be used: not ended or expired, run ready, developer allowlisted and the
-- developer's original session still live.
create function edra_private.dev_control_live(c edra_private.dev_controls)
returns boolean language sql stable security definer set search_path = '' as $$
  select c.ended_at is null and c.expires_at > now()
    and exists (select 1 from edra_private.dev_runs r where r.id = c.run_id and r.state = 'ready' and r.developer_id = c.developer_id)
    and exists (select 1 from edra_private.dev_developers d where d.user_id = c.developer_id)
    and exists (select 1 from auth.sessions s where s.id = c.original_session_id and s.user_id = c.developer_id
      and (s.not_after is null or s.not_after > now()));
$$;

create function edra_private.dev_session_authorized(p_session_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from edra_private.dev_controls c
    join edra_private.dev_commands m on m.control_id = c.id and m.session_id = c.current_session_id
    where c.current_session_id = p_session_id and m.user_id = p_user_id and m.revoked_at is null
      and edra_private.dev_control_live(c)
  );
$$;
revoke all on function edra_private.dev_control_live(edra_private.dev_controls) from public, anon, authenticated;
revoke all on function edra_private.dev_session_authorized(uuid, uuid) from public, anon, authenticated;

-- Supersedes 20261006120000: unchanged for ordinary users; a registered generated account additionally
-- needs a live control whose current session is this one.
create or replace function edra_auth.session_allowed()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims jsonb;
  sid uuid;
  uid uuid;
  limit_at timestamptz;
begin
  begin
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    return false;
  end;
  if claims is null or claims->>'role' is distinct from 'authenticated' then
    return true;
  end if;
  -- Already verified for this session earlier in the same request transaction.
  if current_setting('edra.verified_session', true) = claims->>'session_id' then
    return true;
  end if;
  if jsonb_path_exists(claims, '$.amr[*] ? (@.method == "otp" || @.method == "recovery" || @.method == "magiclink")') then
    return false;
  end if;
  begin
    sid := (claims->>'session_id')::uuid;
    uid := (claims->>'sub')::uuid;
  exception when others then
    return false;
  end;
  if sid is null or uid is null then
    return false;
  end if;
  select s.not_after into limit_at from auth.sessions s where s.id = sid and s.user_id = uid;
  if not found then
    return false;
  end if;
  if limit_at is not null and limit_at <= now() then
    return false;
  end if;
  if exists (select 1 from edra_private.dev_accounts a where a.user_id = uid) then
    return edra_private.dev_session_authorized(sid, uid);
  end if;
  return true;
end;
$$;
revoke all on function edra_auth.session_allowed() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Service-role adapters

-- Whether a user is an allowlisted developer, and their latest ready run in this project.
create function public.dev_preview_context(p_developer_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'allowlisted', exists (select 1 from edra_private.dev_developers d where d.user_id = p_developer_id)
      and not exists (select 1 from edra_private.dev_accounts a where a.user_id = p_developer_id),
    'run', (select jsonb_build_object('id', r.id, 'academy_id', r.academy_id, 'academy_slug', a.slug)
      from edra_private.dev_runs r join public.academies a on a.id = r.academy_id
      where r.developer_id = p_developer_id and r.state = 'ready' order by r.ready_at desc, r.id limit 1)
  );
$$;

-- Generated preview targets of a ready run, from the registry only.
create function public.dev_run_targets(p_run_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'staff', coalesce((select jsonb_agg(jsonb_build_object('logical_id', a.logical_id, 'role', a.kind, 'display_name', a.display_name)
        order by array_position(array['owner', 'head_admin', 'admin', 'instructor'], a.kind), a.logical_id)
      from edra_private.dev_accounts a where a.run_id = p_run_id and a.kind <> 'student' and a.state = 'loaded'), '[]'::jsonb),
    'students', coalesce((select jsonb_agg(jsonb_build_object('logical_id', a.logical_id, 'display_name', a.display_name,
        'annual_student_record_id', a.annual_student_record_id) order by a.logical_id)
      from edra_private.dev_accounts a where a.run_id = p_run_id and a.kind = 'student' and a.state = 'loaded'), '[]'::jsonb)
  )
  from edra_private.dev_runs r where r.id = p_run_id and r.state = 'ready';
$$;

-- A loaded generated account of a ready run, including its sealed credential.
create function public.dev_account(p_run_id uuid, p_logical_id text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('user_id', a.user_id, 'phone', a.phone, 'kind', a.kind, 'display_name', a.display_name,
    'credential', a.credential_ciphertext)
  from edra_private.dev_accounts a join edra_private.dev_runs r on r.id = a.run_id
  where a.run_id = p_run_id and a.logical_id = p_logical_id and a.state = 'loaded' and r.state = 'ready';
$$;

create function public.dev_control_open(
  p_control_id uuid, p_token_hash text, p_run_id uuid, p_developer_id uuid, p_original_session_id uuid,
  p_original_tokens text, p_return_path text
) returns text language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from edra_private.dev_developers d where d.user_id = p_developer_id)
    or exists (select 1 from edra_private.dev_accounts a where a.user_id = p_developer_id) then
    return 'not_allowed';
  end if;
  if not exists (select 1 from edra_private.dev_runs r where r.id = p_run_id and r.state = 'ready' and r.developer_id = p_developer_id) then
    return 'run_unavailable';
  end if;
  if not exists (select 1 from auth.sessions s where s.id = p_original_session_id and s.user_id = p_developer_id
    and (s.not_after is null or s.not_after > now())) then
    return 'session_inactive';
  end if;
  update edra_private.dev_controls set ended_at = now(), end_reason = 'expired', updated_at = now()
  where original_session_id = p_original_session_id and ended_at is null and expires_at <= now();
  if exists (select 1 from edra_private.dev_controls c where c.original_session_id = p_original_session_id and c.ended_at is null) then
    return 'nested';
  end if;
  insert into edra_private.dev_controls (id, token_hash, run_id, developer_id, original_session_id, original_tokens, return_path, expires_at)
  values (p_control_id, p_token_hash, p_run_id, p_developer_id, p_original_session_id, p_original_tokens, p_return_path,
    now() + interval '2 hours');
  return 'opened';
end;
$$;

-- Display and validation state of a control; never includes ciphertext.
create function public.dev_control_state(p_token_hash text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', c.id, 'run_id', c.run_id, 'academy_slug', a.slug, 'developer_id', c.developer_id,
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

create function public.dev_control_original(p_control_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select original_tokens from edra_private.dev_controls where id = p_control_id;
$$;

-- Starts a serialized switch. Results: begun | replay (with the latest receipt) | stale | conflict |
-- busy | inactive | session_mismatch | invalid_target.
create function public.dev_command_begin(
  p_control_id uuid, p_command_id uuid, p_expected_revision integer, p_kind text, p_target_logical_id text,
  p_previous_session_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c edra_private.dev_controls%rowtype;
  m edra_private.dev_commands%rowtype;
begin
  select * into c from edra_private.dev_controls where id = p_control_id for update;
  if not found then return jsonb_build_object('result', 'inactive'); end if;
  select * into m from edra_private.dev_commands where control_id = p_control_id and command_id = p_command_id;
  if found then
    if m.state = 'complete' and m.revision = c.revision and edra_private.dev_control_live(c)
      and p_previous_session_id in (m.previous_session_id, m.session_id) then
      return jsonb_build_object('result', 'replay', 'revision', m.revision, 'target_logical_id', m.target_logical_id,
        'receipt', m.receipt, 'session_id', m.session_id);
    end if;
    return jsonb_build_object('result', case when m.state = 'pending' and c.lease_command_id = m.command_id
      and c.lease_expires_at > now() then 'busy' else 'stale' end);
  end if;
  if not edra_private.dev_control_live(c) then return jsonb_build_object('result', 'inactive'); end if;
  if c.revision <> p_expected_revision then return jsonb_build_object('result', 'conflict', 'revision', c.revision); end if;
  if c.lease_command_id is not null and c.lease_expires_at > now() then return jsonb_build_object('result', 'busy'); end if;
  if p_previous_session_id is distinct from coalesce(c.current_session_id, c.original_session_id) then
    return jsonb_build_object('result', 'session_mismatch');
  end if;
  if p_kind not in ('enter', 'switch', 'return')
    or (p_target_logical_id is null and p_kind <> 'return')
    or (p_target_logical_id is not null and not exists (
      select 1 from edra_private.dev_accounts a where a.run_id = c.run_id and a.logical_id = p_target_logical_id and a.state = 'loaded')) then
    return jsonb_build_object('result', 'invalid_target');
  end if;
  update edra_private.dev_commands set state = 'abandoned' where control_id = c.id and state = 'pending';
  insert into edra_private.dev_commands (control_id, command_id, revision, kind, target_logical_id, previous_session_id)
  values (c.id, p_command_id, c.revision + 1, p_kind, p_target_logical_id, p_previous_session_id);
  update edra_private.dev_controls set lease_command_id = p_command_id, lease_expires_at = now() + interval '30 seconds',
    updated_at = now()
  where id = c.id;
  return jsonb_build_object('result', 'begun', 'revision', c.revision + 1);
end;
$$;

-- Publishes a minted session (or the restored original identity when p_session_id is null) only while
-- the command still holds the lease. Results: completed | lost.
create function public.dev_command_complete(
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
  if p_session_id is not null and not exists (
    select 1 from edra_private.dev_accounts a where a.run_id = c.run_id and a.logical_id = m.target_logical_id and a.user_id = p_user_id) then
    raise exception using errcode = 'P0001', message = 'dev_target_mismatch';
  end if;
  update edra_private.dev_commands set session_id = p_session_id, user_id = p_user_id, receipt = p_receipt,
    state = 'complete', completed_at = now()
  where control_id = c.id and command_id = p_command_id;
  update edra_private.dev_controls set revision = m.revision, current_logical_id = m.target_logical_id,
    current_session_id = p_session_id,
    prior_logical_id = case when p_set_prior then p_prior_logical_id else prior_logical_id end,
    prior_return_path = case when p_set_prior then p_prior_return_path else prior_return_path end,
    original_tokens = coalesce(p_original_tokens, original_tokens),
    lease_command_id = null, lease_expires_at = null, updated_at = now()
  where id = c.id;
  return 'completed';
end;
$$;

-- Ends a control (idempotent); its generated sessions immediately lose application authority.
create function public.dev_control_end(p_control_id uuid, p_reason text)
returns text language sql security definer set search_path = '' as $$
  update edra_private.dev_controls set ended_at = coalesce(ended_at, now()), end_reason = coalesce(end_reason, p_reason),
    lease_command_id = null, lease_expires_at = null, updated_at = now()
  where id = p_control_id
  returning end_reason;
$$;

-- Issued sessions not yet revoked, except the listed ones (the current session and its replay binding).
create function public.dev_control_sessions(p_control_id uuid, p_keep uuid[])
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('session_id', m.session_id, 'user_id', m.user_id, 'receipt', m.receipt)), '[]'::jsonb)
  from edra_private.dev_commands m
  where m.control_id = p_control_id and m.session_id is not null and m.revoked_at is null
    and not (m.session_id = any (coalesce(p_keep, '{}')));
$$;

create function public.dev_session_revoked(p_control_id uuid, p_session_id uuid)
returns void language sql security definer set search_path = '' as $$
  update edra_private.dev_commands set revoked_at = coalesce(revoked_at, now())
  where control_id = p_control_id and session_id = p_session_id;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.dev_preview_context(uuid)', 'public.dev_run_targets(uuid)', 'public.dev_account(uuid, text)',
    'public.dev_control_open(uuid, text, uuid, uuid, uuid, text, text)', 'public.dev_control_state(text)',
    'public.dev_control_original(uuid)', 'public.dev_command_begin(uuid, uuid, integer, text, text, uuid)',
    'public.dev_command_complete(uuid, uuid, uuid, uuid, text, boolean, text, text, text)',
    'public.dev_control_end(uuid, text)', 'public.dev_control_sessions(uuid, uuid[])', 'public.dev_session_revoked(uuid, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;
