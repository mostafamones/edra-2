-- Session-start receipts: every successful start or open binds (actor, start key) to one session
-- for good, so a retry returns the original session after it ends, expires, is archived or is
-- replaced by a newer live session. The key stays scoped to the actor across all academies.
--
-- Legacy limit: opens of an already-live session made before this migration were never stored and
-- cannot be reconstructed. Only original-start keys (sessions.started_by/start_key) are backfilled.

create table public.session_start_requests (
  actor_id uuid not null references public.profiles (id),
  start_key uuid not null,
  session_id uuid not null references public.sessions (id),
  created_at timestamptz not null default now(),
  primary key (actor_id, start_key)
);

create index session_start_requests_session_idx on public.session_start_requests (session_id);

alter table public.session_start_requests enable row level security;
revoke all on public.session_start_requests from public, anon, authenticated;

create or replace function public.protect_session_start_request()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = 'validation', hint = 'Session start receipts are permanent.';
end;
$$;

create trigger session_start_requests_immutable before update or delete on public.session_start_requests
for each row execute function public.protect_session_start_request();
revoke all on function public.protect_session_start_request() from public, anon, authenticated;

insert into public.session_start_requests (actor_id, start_key, session_id, created_at)
select s.started_by, s.start_key, s.id, s.started_at from public.sessions s
on conflict do nothing;

-- start_session: unchanged from 20261013200000_session_archival except that a stored receipt is
-- resolved first (after authority and schedule checks) and both success paths write one.
-- Lock order: actor/key advisory lock, schedule, year, then session.
create or replace function public.start_session(p_academy_id uuid, p_schedule_id uuid, p_start_key uuid)
returns table (session_id uuid, outcome text)
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  parent public.schedules%rowtype;
  placed public.groups%rowtype;
  prior public.sessions%rowtype;
  bound public.sessions%rowtype;
  new_id uuid;
  effective_level text;
  effective_track uuid;
  constraint_name text;
  started_moment timestamptz := now();
begin
  if actor is null or p_academy_id is null or public.academy_role_for(p_academy_id) is null then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  if p_schedule_id is null or p_start_key is null then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;

  -- One actor/key at a time, across schedules, before any schedule lock. A hash collision only
  -- serializes unrelated starts; the receipt primary key is the real invariant.
  perform pg_advisory_xact_lock(hashtextextended('session_start:' || actor::text || ':' || p_start_key::text, 0));

  -- Serializes starts of one schedule and keeps it from being archived or edited mid-start.
  select s.* into parent from public.schedules s
  where s.id = p_schedule_id and s.academy_id = p_academy_id
  for no key update;
  if not found then raise exception using errcode = 'P0001', message = 'not_found'; end if;

  -- A bound key returns its original session whatever has happened since. The legacy fallback
  -- covers an original start committed by the previous function around the backfill.
  select s.* into bound from public.sessions s
  where s.id = (select r.session_id from public.session_start_requests r
                where r.actor_id = actor and r.start_key = p_start_key);
  if not found then
    select s.* into bound from public.sessions s where s.started_by = actor and s.start_key = p_start_key;
    if found then
      insert into public.session_start_requests (actor_id, start_key, session_id)
      values (actor, p_start_key, bound.id) on conflict do nothing;
    end if;
  end if;
  if bound.id is not null then
    if bound.schedule_id <> p_schedule_id then
      raise exception using errcode = 'P0001', message = 'idempotency_conflict';
    end if;
    return query select bound.id, 'replayed'::text;
    return;
  end if;

  if parent.archived_at is not null then
    raise exception using errcode = 'P0001', message = 'schedule_unavailable';
  end if;
  perform 1 from public.academic_years y
  where y.id = parent.academic_year_id and y.academy_id = parent.academy_id and y.closed_at is null
  for share;
  if not found then raise exception using errcode = 'P0001', message = 'year_unavailable'; end if;

  perform public.expire_sessions(p_schedule_id);
  -- Locked, so a start waits for an in-flight archive of the live session and then starts anew.
  select * into prior from public.sessions s where s.schedule_id = p_schedule_id and s.state = 'live' for update;
  if found then
    insert into public.session_start_requests (actor_id, start_key, session_id)
    values (actor, p_start_key, prior.id);
    return query select prior.id, 'existing'::text;
    return;
  end if;

  if parent.audience = 'group' then
    select g.* into placed from public.groups g
    where g.id = parent.group_id and g.academy_id = parent.academy_id
      and g.academic_year_id = parent.academic_year_id;
    if not found then raise exception using errcode = 'P0001', message = 'schedule_unavailable'; end if;
    effective_level := placed.level_id;
    effective_track := placed.track_id;
  else
    effective_level := parent.level_id;
    effective_track := parent.track_id;
  end if;

  begin
    insert into public.sessions (
      academy_id, academic_year_id, schedule_id, started_by, started_by_name, start_key,
      schedule_title, schedule_kind, audience, group_id, group_name, level_id, track_id, track_name,
      mandatory, location, started_at, auto_end_at
    ) values (
      parent.academy_id, parent.academic_year_id, parent.id, actor,
      (select nullif(btrim(p.full_name), '') from public.profiles p where p.id = actor),
      p_start_key, parent.title, parent.kind, parent.audience,
      parent.group_id, placed.name, effective_level, effective_track,
      (select t.name from public.academy_tracks t where t.id = effective_track),
      parent.mandatory, parent.location, started_moment, public.session_auto_end_at(parent.id, started_moment)
    ) returning id into new_id;
  exception when unique_violation then
    -- Only a start by the previous function (no advisory lock) can reach this: bind and report it.
    get stacked diagnostics constraint_name = constraint_name;
    if constraint_name = 'sessions_start_key_unique' then
      select * into prior from public.sessions s where s.started_by = actor and s.start_key = p_start_key;
      if prior.schedule_id <> p_schedule_id then
        raise exception using errcode = 'P0001', message = 'idempotency_conflict';
      end if;
      insert into public.session_start_requests (actor_id, start_key, session_id)
      values (actor, p_start_key, prior.id) on conflict do nothing;
      return query select prior.id, 'replayed'::text;
      return;
    end if;
    select * into prior from public.sessions s where s.schedule_id = p_schedule_id and s.state = 'live';
    if not found then raise; end if;
    insert into public.session_start_requests (actor_id, start_key, session_id)
    values (actor, p_start_key, prior.id);
    return query select prior.id, 'existing'::text;
    return;
  end;

  insert into public.session_start_requests (actor_id, start_key, session_id)
  values (actor, p_start_key, new_id);

  -- Every active annual record matching the audience, captured in the same transaction.
  insert into public.session_roster_entries (
    academy_id, academic_year_id, session_id, annual_student_record_id, origin,
    level_id, track_id, primary_group_id, participation_type
  )
  select r.academy_id, r.academic_year_id, new_id, r.id,
    case when parent.mandatory then 'expected' else 'eligible' end::public.session_roster_origin,
    r.level_id, r.track_id, r.primary_group_id, r.participation_type
  from public.annual_student_records r
  where r.academy_id = parent.academy_id and r.academic_year_id = parent.academic_year_id
    and r.archived_at is null
    and r.participation_type = 'in_person'
    and case parent.audience
      when 'group' then r.primary_group_id = parent.group_id
      when 'level' then r.level_id = parent.level_id
      when 'program' then r.level_id = parent.level_id and r.track_id = parent.track_id
    end;

  return query select new_id, 'started'::text;
end;
$$;

revoke all on function public.start_session(uuid, uuid, uuid) from public, anon;
grant execute on function public.start_session(uuid, uuid, uuid) to authenticated;
