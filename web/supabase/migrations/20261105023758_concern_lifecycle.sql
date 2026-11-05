-- Concern authority and lifecycle (EDRA-292): participant management, settlement/reopening with
-- preserved history, audited Owner recovery, lifecycle history reads, capability-bearing detail and
-- server-attributed typing. Every command locks the concern row like messaging does, so membership,
-- lifecycle and message writes serialize. Caller-chosen request ids (stored in the event detail)
-- make every command safely retryable; `concerns.version` counts lifecycle transitions so stale
-- settle/reopen attempts are refused instead of silently overwriting a newer state.

-- Lookup for request-id replays.
create index concern_events_request_idx on public.concern_events(concern_id, (detail->>'requestId'));

-- Reserve successful requests even when the command changes no rows. Otherwise a retry after a
-- later membership change could execute an old add/remove for the first time.
create table edra_private.concern_requests (
  concern_id uuid not null references public.concerns(id),
  request_id uuid not null,
  actor_id uuid not null references public.profiles(id),
  kinds text[] not null,
  payload jsonb not null,
  primary key (concern_id, request_id)
);
alter table edra_private.concern_requests enable row level security;
revoke all on edra_private.concern_requests from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Private helpers (never granted).

-- True when the caller already completed this request on this concern; any other use of the id conflicts.
create function edra_private.concern_replayed(p_concern_id uuid, p_request_id uuid, p_kinds text[], p_payload jsonb default '{}')
returns boolean language plpgsql security definer set search_path = '' as $$
declare used edra_private.concern_requests;
begin
  if p_request_id is null then perform edra_private.concern_fail('validation'); end if;
  select * into used from edra_private.concern_requests
    where concern_id = p_concern_id and request_id = p_request_id;
  if not found then
    insert into edra_private.concern_requests values (p_concern_id, p_request_id, auth.uid(), p_kinds, p_payload);
    return false;
  end if;
  if used.actor_id is distinct from auth.uid() or used.kinds <> p_kinds or used.payload <> p_payload then
    perform edra_private.concern_fail('conflict');
  end if;
  return true;
end $$;

-- Management needs a current Owner/Head Admin/Admin role; a role change is not loss of access.
create function edra_private.require_concern_manager(p_academy_id uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_academy_manager(p_academy_id) then perform edra_private.concern_fail('not_permitted'); end if;
end $$;

create function edra_private.check_concern_note(p_text text) returns void language plpgsql set search_path = '' as $$
begin
  if p_text is null or btrim(p_text) = '' or char_length(p_text) > 4000 then perform edra_private.concern_fail('validation'); end if;
end $$;

create function edra_private.concern_state(p_concern_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('concernId', id, 'status', status, 'version', version) from public.concerns where id = p_concern_id;
$$;

revoke all on function edra_private.concern_replayed(uuid, uuid, text[], jsonb), edra_private.require_concern_manager(uuid),
  edra_private.check_concern_note(text), edra_private.concern_state(uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Participant management: participating leadership, ongoing only. Membership history lives in
-- concern_events; the participant row holds the current state and captured academy membership.

create function public.add_concern_participants(p_academy_id uuid, p_concern_id uuid, p_user_ids uuid[], p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare item public.concerns; actor uuid := auth.uid(); target record;
begin
  item := edra_private.require_concern(p_academy_id, p_concern_id);
  perform edra_private.require_concern_manager(p_academy_id);
  if edra_private.concern_replayed(p_concern_id, p_request_id, array['participant_added'],
    jsonb_build_object('users', (select jsonb_agg(u order by u) from (select distinct unnest(p_user_ids) as u) ids))) then
    return edra_private.concern_state(p_concern_id);
  end if;
  if item.status <> 'ongoing' then raise exception 'concern_settled' using errcode = '55000'; end if;
  if cardinality(coalesce(p_user_ids, '{}')) not between 1 and 50 then perform edra_private.concern_fail('validation'); end if;
  if exists (select 1 from unnest(p_user_ids) u where u is null or not exists (
    select 1 from public.academy_memberships m where m.academy_id = p_academy_id and m.user_id = u and m.suspended_at is null)) then
    perform edra_private.concern_fail('invalid_participant');
  end if;
  for target in
    select m.user_id, m.created_at, p.user_id is not null as existed
    from public.academy_memberships m
    left join public.concern_participants p on p.concern_id = p_concern_id and p.user_id = m.user_id
    where m.academy_id = p_academy_id and m.user_id = any(p_user_ids)
      -- Already-active participants are left untouched.
      and (p.user_id is null or p.removed_at is not null or p.membership_created_at <> m.created_at)
    order by m.user_id
  loop
    -- Readdition is explicit: it captures the current academy membership identity.
    insert into public.concern_participants (academy_id, concern_id, user_id, membership_created_at, added_by)
      values (p_academy_id, p_concern_id, target.user_id, target.created_at, actor)
      on conflict (concern_id, user_id) do update set membership_created_at = excluded.membership_created_at,
        added_by = excluded.added_by, added_at = clock_timestamp(), removed_at = null, removed_by = null;
    insert into public.concern_events (academy_id, concern_id, actor_id, kind, subject_id, detail)
      values (p_academy_id, p_concern_id, actor, 'participant_added', target.user_id,
        jsonb_build_object('requestId', p_request_id, 'readded', target.existed));
  end loop;
  return edra_private.concern_state(p_concern_id);
end $$;

create function public.remove_concern_participant(p_academy_id uuid, p_concern_id uuid, p_user_id uuid, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare item public.concerns; actor uuid := auth.uid();
begin
  item := edra_private.require_concern(p_academy_id, p_concern_id);
  perform edra_private.require_concern_manager(p_academy_id);
  if edra_private.concern_replayed(p_concern_id, p_request_id, array['participant_removed'], jsonb_build_object('user', p_user_id)) then
    return edra_private.concern_state(p_concern_id);
  end if;
  if item.status <> 'ongoing' then raise exception 'concern_settled' using errcode = '55000'; end if;
  if p_user_id is null then perform edra_private.concern_fail('validation'); end if;
  update public.concern_participants set removed_at = clock_timestamp(), removed_by = actor
    where concern_id = p_concern_id and user_id = p_user_id and removed_at is null;
  if found then
    insert into public.concern_events (academy_id, concern_id, actor_id, kind, subject_id, detail)
      values (p_academy_id, p_concern_id, actor, 'participant_removed', p_user_id, jsonb_build_object('requestId', p_request_id));
  end if;
  return edra_private.concern_state(p_concern_id);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Settlement and reopening. The expected lifecycle version refuses a decision made on stale state.

create function public.settle_concern(p_academy_id uuid, p_concern_id uuid, p_outcome text, p_expected_version bigint, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare item public.concerns; actor uuid := auth.uid();
begin
  item := edra_private.require_concern(p_academy_id, p_concern_id);
  perform edra_private.require_concern_manager(p_academy_id);
  if edra_private.concern_replayed(p_concern_id, p_request_id, array['settled'], jsonb_build_object('outcome', btrim(p_outcome), 'version', p_expected_version)) then
    return edra_private.concern_state(p_concern_id);
  end if;
  perform edra_private.check_concern_note(p_outcome);
  if p_expected_version is distinct from item.version then perform edra_private.concern_fail('stale'); end if;
  if item.status <> 'ongoing' then raise exception 'concern_settled' using errcode = '55000'; end if;
  update public.concerns set status = 'settled', settled_at = clock_timestamp(), settled_by = actor,
    outcome = btrim(p_outcome), version = version + 1, updated_at = clock_timestamp()
    where id = p_concern_id;
  insert into public.concern_events (academy_id, concern_id, actor_id, kind, detail)
    values (p_academy_id, p_concern_id, actor, 'settled',
      jsonb_build_object('requestId', p_request_id, 'outcome', btrim(p_outcome), 'version', item.version + 1));
  return edra_private.concern_state(p_concern_id);
end $$;

create function public.reopen_concern(p_academy_id uuid, p_concern_id uuid, p_reason text, p_expected_version bigint, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare item public.concerns; actor uuid := auth.uid();
begin
  item := edra_private.require_concern(p_academy_id, p_concern_id);
  perform edra_private.require_concern_manager(p_academy_id);
  if edra_private.concern_replayed(p_concern_id, p_request_id, array['reopened'], jsonb_build_object('reason', btrim(p_reason), 'version', p_expected_version)) then
    return edra_private.concern_state(p_concern_id);
  end if;
  perform edra_private.check_concern_note(p_reason);
  if p_expected_version is distinct from item.version or item.status <> 'settled' then
    perform edra_private.concern_fail('stale');
  end if;
  -- The previous outcome stays in the `settled` event; the row only holds the current state.
  update public.concerns set status = 'ongoing', settled_at = null, settled_by = null, outcome = null,
    version = version + 1, updated_at = clock_timestamp()
    where id = p_concern_id;
  insert into public.concern_events (academy_id, concern_id, actor_id, kind, detail)
    values (p_academy_id, p_concern_id, actor, 'reopened',
      jsonb_build_object('requestId', p_request_id, 'reason', btrim(p_reason), 'version', item.version + 1));
  return edra_private.concern_state(p_concern_id);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Owner recovery: the only path into a concern without participation. It is targeted (the Owner
-- supplies the concern id), audited, allowed when settled, and never lists or reads content itself.

create function public.recover_concern(p_academy_id uuid, p_concern_id uuid, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); item public.concerns; joined timestamptz;
begin
  if actor is null or public.academy_role_for(p_academy_id) is distinct from 'owner' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into item from public.concerns where academy_id = p_academy_id and id = p_concern_id for update;
  if not found then perform edra_private.concern_fail('concern_not_found'); end if;
  if edra_private.concern_replayed(p_concern_id, p_request_id, array['owner_recovered']) then
    return edra_private.concern_state(p_concern_id) || jsonb_build_object('recovered', public.concern_has_access(p_academy_id, p_concern_id));
  end if;
  if public.concern_has_access(p_academy_id, p_concern_id) then
    return edra_private.concern_state(p_concern_id) || jsonb_build_object('recovered', false);
  end if;
  select created_at into joined from public.academy_memberships where academy_id = p_academy_id and user_id = actor;
  insert into public.concern_participants (academy_id, concern_id, user_id, membership_created_at, added_by)
    values (p_academy_id, p_concern_id, actor, joined, actor)
    on conflict (concern_id, user_id) do update set membership_created_at = excluded.membership_created_at,
      added_by = excluded.added_by, added_at = clock_timestamp(), removed_at = null, removed_by = null;
  insert into public.concern_events (academy_id, concern_id, actor_id, kind, subject_id, detail)
    values (p_academy_id, p_concern_id, actor, 'owner_recovered', actor,
      jsonb_build_object('requestId', p_request_id, 'status', item.status));
  return edra_private.concern_state(p_concern_id) || jsonb_build_object('recovered', true);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Reads.

-- Detail gains the lifecycle version, settlement attribution and the caller's management capability.
create or replace function public.concern_detail(p_academy_id uuid, p_concern_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform edra_private.require_concern_read(p_academy_id, p_concern_id);
  return (select jsonb_build_object('id', c.id, 'title', c.title, 'status', c.status, 'createdAt', c.created_at,
      'createdBy', c.created_by, 'settledAt', c.settled_at, 'outcome', c.outcome, 'version', c.version,
      'settledBy', c.settled_by, 'settledByName', (select full_name from public.profiles where id = c.settled_by),
      'canManage', public.is_academy_manager(p_academy_id),
      'lastSeq', (select coalesce(max(seq), 0) from public.concern_messages where concern_id = c.id),
      'muted', (select muted from public.concern_participants where concern_id = c.id and user_id = auth.uid()),
      'participants', (select coalesce(jsonb_agg(jsonb_build_object('userId', p.user_id, 'name', pr.full_name,
          'avatarPath', pr.avatar_path, 'lastReadSeq', p.last_read_seq, 'readAt', p.read_at,
          'suspended', m.suspended_at is not null) order by pr.full_name, p.user_id), '[]'::jsonb)
        from public.concern_participants p
        join public.academy_memberships m on m.academy_id = p.academy_id and m.user_id = p.user_id
          and m.created_at = p.membership_created_at
        join public.profiles pr on pr.id = p.user_id
        where p.concern_id = c.id and p.removed_at is null))
    from public.concerns c where c.id = p_concern_id);
end $$;

-- Lifecycle and membership history, oldest first. Message activity stays in the conversation.
-- Return the full retained history; never silently truncate earlier outcomes or membership events.
create function public.concern_history(p_academy_id uuid, p_concern_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform edra_private.require_concern_read(p_academy_id, p_concern_id);
  return coalesce((select jsonb_agg(entry order by at, id) from (
    select e.occurred_at as at, e.id, jsonb_build_object('id', e.id, 'kind', e.kind, 'occurredAt', e.occurred_at,
        'actorId', e.actor_id, 'actorName', (select full_name from public.profiles where id = e.actor_id),
        'subjectId', e.subject_id, 'subjectName', (select full_name from public.profiles where id = e.subject_id),
        'note', coalesce(e.detail->>'outcome', e.detail->>'reason')) as entry
    from public.concern_events e
    where e.academy_id = p_academy_id and e.concern_id = p_concern_id
      and e.kind in ('created', 'participant_added', 'participant_removed', 'owner_recovered', 'settled', 'reopened')
    order by e.occurred_at desc, e.id desc) h), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Typing. The database attributes the typist from the session, so clients can no longer claim to
-- be another participant. Presence on concern topics is withdrawn; only commit-backed broadcasts remain.

-- Delivery is addressed to each currently authorized recipient, not a shared topic whose old
-- sockets retain their join authorization. Membership share locks order delivery before revocation.
create function edra_private.concern_recipients(p_academy_id uuid, p_concern_id uuid)
returns setof uuid language sql security definer set search_path = '' as $$
  select m.user_id from public.concern_participants p
  join public.academy_memberships m on m.academy_id = p.academy_id and m.user_id = p.user_id
  where p.academy_id = p_academy_id and p.concern_id = p_concern_id
    and p.removed_at is null and m.suspended_at is null and p.membership_created_at = m.created_at
  order by m.user_id for share of m;
$$;

create function edra_private.notify_concern(p_academy_id uuid, p_concern_id uuid, p_event text, p_payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare recipient uuid;
begin
  for recipient in select * from edra_private.concern_recipients(p_academy_id, p_concern_id) loop
    perform realtime.send(p_payload, p_event,
      'concern:' || p_academy_id || ':' || p_concern_id || ':' || recipient, true);
    if p_event <> 'typing' then
      perform realtime.send(jsonb_build_object('concernId', p_concern_id), 'activity',
        'concern-inbox:' || recipient || ':' || p_academy_id, true);
    end if;
  end loop;
end $$;

create or replace function edra_private.broadcast_concern_message() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform edra_private.notify_concern(new.academy_id, new.concern_id, 'changed', jsonb_build_object('revision', new.revision));
  return null;
end $$;

create or replace function edra_private.broadcast_concern_participant() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform edra_private.notify_concern(new.academy_id, new.concern_id, 'participants', '{}');
  if new.removed_at is not null then
    -- A content-free revocation hint clears an honest client's cache; no future activity is sent.
    perform realtime.send('{}', 'participants',
      'concern:' || new.academy_id || ':' || new.concern_id || ':' || new.user_id, true);
    perform realtime.send(jsonb_build_object('concernId', new.concern_id), 'revoked',
      'concern-inbox:' || new.user_id || ':' || new.academy_id, true);
  end if;
  return null;
end $$;

create or replace function edra_private.broadcast_concern_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform edra_private.notify_concern(new.academy_id, new.id, 'concern', '{}');
  return null;
end $$;

-- A personal concern channel must belong to the caller AND retain current concern authority.
create or replace function public.can_join_concern_channel(p_topic text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare parts text[];
begin
  parts := string_to_array(p_topic, ':');
  if parts[1] = 'concern' and array_length(parts, 1) in (3, 4) then
    if array_length(parts, 1) = 4 and parts[4]::uuid is distinct from auth.uid() then return false; end if;
    return public.concern_has_access(parts[2]::uuid, parts[3]::uuid);
  end if;
  if parts[1] = 'concern-inbox' and array_length(parts, 1) = 3 then
    return parts[2]::uuid = auth.uid() and public.is_academy_member(parts[3]::uuid);
  end if;
  return false;
exception when invalid_text_representation then return false;
end $$;

create table edra_private.concern_typing_ticks (
  concern_id uuid not null references public.concerns(id),
  user_id uuid not null references public.profiles(id),
  sent_at timestamptz not null,
  typing boolean not null,
  primary key (concern_id, user_id)
);
alter table edra_private.concern_typing_ticks enable row level security;
revoke all on edra_private.concern_typing_ticks from public, anon, authenticated;
revoke all on function edra_private.concern_recipients(uuid, uuid),
  edra_private.notify_concern(uuid, uuid, text, jsonb) from public, anon, authenticated;

create function public.set_concern_typing(p_academy_id uuid, p_concern_id uuid, p_typing boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform edra_private.require_concern(p_academy_id, p_concern_id);
  if p_typing is null then perform edra_private.concern_fail('validation'); end if;
  if p_typing and (select status from public.concerns where id = p_concern_id) <> 'ongoing' then
    raise exception 'concern_settled' using errcode = '55000';
  end if;
  insert into edra_private.concern_typing_ticks as t values (p_concern_id, auth.uid(), clock_timestamp(), p_typing)
    on conflict (concern_id, user_id) do update set sent_at = excluded.sent_at, typing = excluded.typing
    where t.sent_at < clock_timestamp() - interval '2 seconds'
      or (t.typing is distinct from excluded.typing and t.sent_at < clock_timestamp() - interval '250 milliseconds');
  if not found then return; end if;
  perform edra_private.notify_concern(p_academy_id, p_concern_id, 'typing',
    jsonb_build_object('userId', auth.uid(), 'typing', p_typing));
end $$;

drop policy concern_channel_presence on realtime.messages;
drop policy concern_channel_receive on realtime.messages;
create policy concern_channel_receive on realtime.messages for select to authenticated
  using (realtime.messages.extension = 'broadcast' and public.can_join_concern_channel(realtime.topic()));

revoke all on function public.add_concern_participants(uuid, uuid, uuid[], uuid),
  public.remove_concern_participant(uuid, uuid, uuid, uuid),
  public.settle_concern(uuid, uuid, text, bigint, uuid),
  public.reopen_concern(uuid, uuid, text, bigint, uuid),
  public.recover_concern(uuid, uuid, uuid),
  public.concern_history(uuid, uuid),
  public.set_concern_typing(uuid, uuid, boolean)
  from public, anon;
grant execute on function public.add_concern_participants(uuid, uuid, uuid[], uuid),
  public.remove_concern_participant(uuid, uuid, uuid, uuid),
  public.settle_concern(uuid, uuid, text, bigint, uuid),
  public.reopen_concern(uuid, uuid, text, bigint, uuid),
  public.recover_concern(uuid, uuid, uuid),
  public.concern_history(uuid, uuid),
  public.set_concern_typing(uuid, uuid, boolean)
  to authenticated;
