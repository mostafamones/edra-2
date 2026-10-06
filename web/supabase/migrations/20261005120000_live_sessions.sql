-- Live sessions: the class instance a staff member starts from a schedule to take attendance.
--
-- Owner clarification (2026-10-05, supersedes older session wording in the product documents):
--   * Any staff member (owner, admin, instructor) may start a session from any active schedule,
--     recurring or one-off, at any time. Slot weekday/time and one-off dates are suggestions only.
--   * Sessions are never generated in bulk or ahead of time.
--   * At most one live session per schedule: starting a schedule that already has a live session
--     opens that session instead of creating another. There is no per-day uniqueness.
--   * Any staff member may end a live session. Ending is final in this slice (no reopen), and it
--     never marks absence or publishes attendance. A live session can still be ended after its
--     academic year closes, so closure never strands a session in the live list.
--   * A session closes itself 90 minutes after the planned end of the schedule time it was started
--     for (the planned time today closest to the start; with none today, 90 minutes after the
--     start). It never closes sooner than 90 minutes after it started. Closing is lazy: reads treat
--     an expired live session as ended, and the next start or end materializes it (end_reason
--     'auto', no ended_by). Part 2 must treat an expired session as ended too.
--   * Only in-person students are captured on a roster; online-only students are excluded.
--
-- A session keeps a snapshot of its schedule (title, audience, mandatory, location) and of the
-- roster it captured when it started, so later schedule edits, slot/date replacement, and student
-- placement changes never rewrite history. Parents are referenced without cascades.
--
-- Locking protocol: start_session locks the schedule row, then the academic year row (share),
-- then inserts. Every workflow on an existing session (end now; attendance later) locks the
-- session row first.
--
-- Clients read through RLS. Every write goes through the security definer RPCs below, which check
-- membership; authenticated users have no direct insert/update/delete. Errors raised for the
-- application use SQLSTATE P0001 with a stable code as the message.

create type public.session_state as enum ('live', 'ended');
create type public.session_roster_origin as enum ('expected', 'eligible');
create type public.session_end_reason as enum ('manual', 'auto');

-- Roster entries reference annual records by academy and year as well as id.
alter table public.annual_student_records
  add constraint annual_student_records_academy_year_id_key unique (academy_id, academic_year_id, id);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null,
  academic_year_id uuid not null,
  schedule_id uuid not null,
  state public.session_state not null default 'live',
  started_at timestamptz not null default now(),
  started_by uuid not null references public.profiles (id),
  started_by_name text,
  -- Client-generated retry key; a retried start by the same actor returns the same session.
  start_key uuid not null,
  ended_at timestamptz,
  ended_by uuid references public.profiles (id),
  ended_by_name text,
  end_reason public.session_end_reason,
  -- The moment the session closes itself if nobody ends it first.
  auto_end_at timestamptz not null,
  -- Schedule snapshot taken at start. Level and track are the effective audience placement
  -- (for a group audience, the group's level and track).
  schedule_title text not null,
  schedule_kind public.schedule_kind not null,
  audience public.schedule_audience not null,
  group_id uuid,
  group_name text,
  level_id text not null,
  track_id uuid,
  track_name text,
  mandatory boolean not null,
  location text,
  metadata_version integer not null default 1 check (metadata_version >= 1),
  unique (academy_id, academic_year_id, id),
  constraint sessions_start_key_unique unique (started_by, start_key),
  foreign key (academy_id, academic_year_id)
    references public.academic_years (academy_id, id),
  foreign key (academy_id, academic_year_id, schedule_id)
    references public.schedules (academy_id, academic_year_id, id),
  constraint sessions_state_shape check (
    (state = 'live' and ended_at is null and ended_by is null and ended_by_name is null and end_reason is null)
    or (state = 'ended' and ended_at is not null and ended_at >= started_at and (
      (end_reason = 'manual' and ended_by is not null)
      or (end_reason = 'auto' and ended_by is null and ended_by_name is null)
    ))
  ),
  constraint sessions_auto_end_after_start check (auto_end_at >= started_at + interval '90 minutes'),
  constraint sessions_audience_shape check (
    (audience = 'group' and group_id is not null)
    or (audience = 'level' and group_id is null and track_id is null)
    or (audience = 'program' and group_id is null and track_id is not null)
  )
);

create unique index sessions_one_live_per_schedule on public.sessions (schedule_id) where state = 'live';
create index sessions_live_idx on public.sessions (academy_id, started_at desc, id desc) where state = 'live';
create index sessions_academy_started_idx on public.sessions (academy_id, started_at desc, id desc);

create table public.session_roster_entries (
  academy_id uuid not null,
  academic_year_id uuid not null,
  session_id uuid not null,
  annual_student_record_id uuid not null,
  origin public.session_roster_origin not null,
  -- Placement snapshot at the moment the student entered the roster.
  level_id text not null,
  track_id uuid,
  primary_group_id uuid,
  participation_type public.student_participation_type not null,
  created_at timestamptz not null default now(),
  primary key (session_id, annual_student_record_id),
  foreign key (academy_id, academic_year_id, session_id)
    references public.sessions (academy_id, academic_year_id, id),
  foreign key (academy_id, academic_year_id, annual_student_record_id)
    references public.annual_student_records (academy_id, academic_year_id, id)
);

create index session_roster_entries_record_idx on public.session_roster_entries (annual_student_record_id);

-- Identity and snapshots are immutable; the only transition is live -> ended.
create or replace function public.protect_session_write()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.id, new.academy_id, new.academic_year_id, new.schedule_id, new.started_at, new.started_by,
      new.started_by_name, new.start_key, new.schedule_title, new.schedule_kind, new.audience,
      new.group_id, new.group_name, new.level_id, new.track_id, new.track_name, new.mandatory, new.location,
      new.auto_end_at)
    is distinct from
     (old.id, old.academy_id, old.academic_year_id, old.schedule_id, old.started_at, old.started_by,
      old.started_by_name, old.start_key, old.schedule_title, old.schedule_kind, old.audience,
      old.group_id, old.group_name, old.level_id, old.track_id, old.track_name, old.mandatory, old.location,
      old.auto_end_at) then
    raise exception using errcode = 'P0001', message = 'validation', hint = 'A session''s identity and snapshot cannot change.';
  end if;
  if old.state = 'ended' then
    raise exception using errcode = 'P0001', message = 'session_ended';
  end if;
  new.metadata_version := old.metadata_version + 1;
  return new;
end;
$$;

create trigger sessions_protect_write before update on public.sessions
for each row execute function public.protect_session_write();

create or replace function public.protect_session_roster_entry()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = 'validation', hint = 'Roster entries are history and cannot change.';
end;
$$;

create trigger session_roster_entries_protect before update on public.session_roster_entries
for each row execute function public.protect_session_roster_entry();

alter table public.sessions enable row level security;
alter table public.session_roster_entries enable row level security;
revoke all on public.sessions, public.session_roster_entries from public, anon, authenticated;
grant select on public.sessions, public.session_roster_entries to authenticated;

create policy sessions_select_members on public.sessions
  for select to authenticated using (public.is_academy_member(academy_id));
create policy session_roster_entries_select_members on public.session_roster_entries
  for select to authenticated using (public.is_academy_member(academy_id));

-- Materializes sessions whose automatic close time has passed. Internal: only the security definer
-- workflows below call it. p_schedule_id null closes every expired session.
create or replace function public.expire_sessions(p_schedule_id uuid)
returns void
language sql security definer set search_path = '' as $$
  update public.sessions
  set state = 'ended', ended_at = auto_end_at, end_reason = 'auto'
  where state = 'live' and auto_end_at <= now()
    and (p_schedule_id is null or schedule_id = p_schedule_id);
$$;

-- When a session started now should close itself: 90 minutes after the end of the planned time
-- today (academy time) closest to now, else 90 minutes after now; never sooner than 90 minutes.
create or replace function public.session_auto_end_at(p_schedule_id uuid, p_now timestamptz)
returns timestamptz
language sql stable set search_path = '' as $$
  select greatest(
    coalesce((
      select (t.planned_end at time zone 'Africa/Cairo') + interval '90 minutes'
      from (
        select (local_now::date + sl.ends_at) as planned_end,
          abs(extract(epoch from (local_now::time - sl.starts_at))) as distance
        from public.schedule_slots sl
        where sl.schedule_id = p_schedule_id
          and sl.weekday = extract(isodow from local_now)::int
        union all
        select (so.occurs_on + so.ends_at), abs(extract(epoch from (local_now::time - so.starts_at)))
        from public.schedule_sessions so
        where so.schedule_id = p_schedule_id and so.occurs_on = local_now::date
      ) t
      order by t.distance
      limit 1
    ), p_now + interval '90 minutes'),
    p_now + interval '90 minutes'
  )
  from (select p_now at time zone 'Africa/Cairo' as local_now) c;
$$;

-- Starts a live session from an active schedule, or returns the session this start already made.
-- outcome: 'started' (new session), 'existing' (the schedule already had a live session), or
-- 'replayed' (this actor already used p_start_key for this schedule).
create or replace function public.start_session(p_academy_id uuid, p_schedule_id uuid, p_start_key uuid)
returns table (session_id uuid, outcome text)
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  parent public.schedules%rowtype;
  placed public.groups%rowtype;
  prior public.sessions%rowtype;
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

  -- Serializes starts of one schedule and keeps it from being archived or edited mid-start.
  select s.* into parent from public.schedules s
  where s.id = p_schedule_id and s.academy_id = p_academy_id
  for no key update;
  if not found then raise exception using errcode = 'P0001', message = 'not_found'; end if;

  select * into prior from public.sessions s where s.started_by = actor and s.start_key = p_start_key;
  if found then
    if prior.schedule_id <> p_schedule_id then
      raise exception using errcode = 'P0001', message = 'idempotency_conflict';
    end if;
    return query select prior.id, 'replayed'::text;
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
  select * into prior from public.sessions s where s.schedule_id = p_schedule_id and s.state = 'live';
  if found then
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
    -- A concurrent start won the race; report whichever session it created.
    get stacked diagnostics constraint_name = constraint_name;
    if constraint_name = 'sessions_start_key_unique' then
      select * into prior from public.sessions s where s.started_by = actor and s.start_key = p_start_key;
      if prior.schedule_id <> p_schedule_id then
        raise exception using errcode = 'P0001', message = 'idempotency_conflict';
      end if;
      return query select prior.id, 'replayed'::text;
      return;
    end if;
    select * into prior from public.sessions s where s.schedule_id = p_schedule_id and s.state = 'live';
    if not found then raise; end if;
    return query select prior.id, 'existing'::text;
    return;
  end;

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

-- Ends a live session. outcome: 'ended', or 'already_ended' when someone else ended it first.
create or replace function public.end_session(p_academy_id uuid, p_session_id uuid)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  existing public.sessions%rowtype;
begin
  if actor is null or p_academy_id is null or public.academy_role_for(p_academy_id) is null then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  select s.* into existing from public.sessions s
  where s.id = p_session_id and s.academy_id = p_academy_id
  for update;
  if not found then raise exception using errcode = 'P0001', message = 'not_found'; end if;
  if existing.state = 'live' and existing.auto_end_at <= now() then
    perform public.expire_sessions(existing.schedule_id);
    return 'already_ended';
  end if;
  if existing.state = 'ended' then return 'already_ended'; end if;
  update public.sessions set
    state = 'ended', end_reason = 'manual', ended_at = greatest(now(), existing.started_at), ended_by = actor,
    ended_by_name = (select nullif(btrim(p.full_name), '') from public.profiles p where p.id = actor)
  where id = p_session_id;
  return 'ended';
end;
$$;

-- One page of live sessions, newest first. A null academy lists every academy the caller belongs
-- to (RLS). The cursor is the last row's (started_at, id).
create or replace function public.list_live_sessions(
  p_academy_id uuid, p_before_started_at timestamptz, p_before_id uuid, p_limit integer
)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.started_at desc, x.id desc), '[]'::jsonb) from (
    select s.id, s.academy_id, a.name as academy_name, a.slug as academy_slug, s.academic_year_id,
      s.schedule_id, s.schedule_title, s.schedule_kind, s.audience, s.group_id, s.group_name,
      s.level_id, gl.name as level_name, s.track_id, s.track_name, s.mandatory, s.location,
      s.state, s.started_at, s.started_by, s.started_by_name, s.auto_end_at, s.metadata_version,
      (select count(*) from public.session_roster_entries e where e.session_id = s.id) as roster_count
    from public.sessions s
    join public.academies a on a.id = s.academy_id
    left join public.global_levels gl on gl.id = s.level_id
    where s.state = 'live' and s.auto_end_at > now()
      and (p_academy_id is null or s.academy_id = p_academy_id)
      and (p_before_started_at is null or (s.started_at, s.id) < (p_before_started_at, p_before_id))
    order by s.started_at desc, s.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  ) x;
$$;

-- One session and its roster with current names and placement labels, or null when the caller
-- cannot see it.
create or replace function public.get_session(p_academy_id uuid, p_session_id uuid)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'session', to_jsonb(x),
    'roster', coalesce((
      select jsonb_agg(to_jsonb(e) order by lower(e.full_name), e.annual_student_record_id) from (
        select en.annual_student_record_id, r.academy_student_profile_id, r.full_name,
          r.archived_at is not null as archived, en.origin, en.level_id, rl.name as level_name,
          en.track_id, t.name as track_name, en.primary_group_id, g.name as group_name,
          en.participation_type
        from public.session_roster_entries en
        join public.annual_student_records r on r.id = en.annual_student_record_id
        left join public.global_levels rl on rl.id = en.level_id
        left join public.academy_tracks t on t.id = en.track_id
        left join public.groups g on g.id = en.primary_group_id
        where en.session_id = x.id
      ) e
    ), '[]'::jsonb)
  )
  from (
    select s.id, s.academy_id, s.academic_year_id, s.schedule_id, s.schedule_title, s.schedule_kind,
      s.audience, s.group_id, s.group_name, s.level_id, gl.name as level_name, s.track_id, s.track_name,
      s.mandatory, s.location, s.started_at, s.started_by, s.started_by_name, s.auto_end_at,
      s.metadata_version,
      case when s.state = 'live' and s.auto_end_at <= now() then 'ended'::public.session_state else s.state end as state,
      case when s.state = 'live' and s.auto_end_at <= now() then s.auto_end_at else s.ended_at end as ended_at,
      case when s.state = 'live' and s.auto_end_at <= now() then 'auto'::public.session_end_reason else s.end_reason end as end_reason,
      s.ended_by, s.ended_by_name
    from public.sessions s
    left join public.global_levels gl on gl.id = s.level_id
    where s.id = p_session_id and s.academy_id = p_academy_id
  ) x;
$$;

revoke all on function public.protect_session_write() from public, anon, authenticated;
revoke all on function public.protect_session_roster_entry() from public, anon, authenticated;
revoke all on function public.expire_sessions(uuid) from public, anon, authenticated;
revoke all on function public.session_auto_end_at(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.start_session(uuid, uuid, uuid) from public, anon;
revoke all on function public.end_session(uuid, uuid) from public, anon;
revoke all on function public.list_live_sessions(uuid, timestamptz, uuid, integer) from public, anon;
revoke all on function public.get_session(uuid, uuid) from public, anon;

grant execute on function public.start_session(uuid, uuid, uuid) to authenticated;
grant execute on function public.end_session(uuid, uuid) to authenticated;
grant execute on function public.list_live_sessions(uuid, timestamptz, uuid, integer) to authenticated;
grant execute on function public.get_session(uuid, uuid) to authenticated;
