-- Session archival and restoration (owner decisions, 2026-10-13; product "Session archival and
-- restoration").
--
--   * Archival is an exclusion orthogonal to the Live/Ended lifecycle. Only an ended session can be
--     archived; archiving a live session ends it (ordinary manual end, or the existing automatic
--     close when it has already expired) and archives it in the same transaction. Nothing marks
--     absence or finalizes attendance. Restoration clears the exclusion; it never reopens a session.
--   * Owners, Head Admins and Admins archive and restore, in an open academic year only. The role is
--     compared as text so this works before and after the head_admin enum value exists.
--   * Nothing is deleted or rewritten: identity, start/end facts, roster, drafts, publications,
--     effects and receipts stay. Archive/restore events are a separate immutable trail.
--   * An archived session is read-only for every attendance mutation (check-in by UUID or code,
--     manual/bulk edits, finalization). Stored receipts still replay as historical acknowledgments.
--   * Archived sessions do not count: public.counted_attendance is the authoritative projection of
--     official attendance that counts. Restoration makes the same official values count again,
--     without a new publication or effect.
--   * Archival permanently stops the session's still-unprocessed outbox effects (recorded in
--     attendance_effect_suppressions; effects stay immutable). Restoration does not resume or
--     replay them. No effect consumer exists yet; edra_private.claim_attendance_effect is the claim
--     boundary a future consumer must use.
--
-- Locking: archive/restore lock the sessions row (for update) first, then the academic year (for
-- share), the same order as attendance. Attendance writes take the session for no key update, so
-- they serialize with archival; end_session takes it for update; start_session locks the schedule
-- and then the live row (now for update), so a concurrent start waits and starts a new session.

-- ---------------------------------------------------------------------------------------------
-- Metadata

alter table public.sessions
  add column archived_at timestamptz,
  add column archived_by uuid references public.profiles (id),
  add column archived_by_name text,
  add column archive_note text,
  add constraint sessions_archive_shape check (
    (archived_at is null and archived_by is null and archived_by_name is null and archive_note is null)
    or (archived_at is not null and archived_by is not null and state = 'ended')
  ),
  add constraint sessions_archive_note_length check (archive_note is null or char_length(archive_note) between 1 and 500);

create index sessions_academy_archived_idx on public.sessions (academy_id, started_at desc, id desc)
  where archived_at is not null;

-- Identity and snapshots are immutable. Live sessions may end; ended facts never change. The only
-- other change is an archive transition (unarchived <-> archived) on an ended session.
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
    if (new.state, new.ended_at, new.ended_by, new.ended_by_name, new.end_reason)
        is distinct from (old.state, old.ended_at, old.ended_by, old.ended_by_name, old.end_reason)
      or (old.archived_at is null) = (new.archived_at is null) then
      raise exception using errcode = 'P0001', message = 'session_ended';
    end if;
  end if;
  new.metadata_version := old.metadata_version + 1;
  return new;
end;
$$;

-- Who archived or restored a session, and when. Immutable; separate from attendance history.
create table public.session_archive_events (
  id bigint generated always as identity primary key,
  academy_id uuid not null,
  academic_year_id uuid not null,
  session_id uuid not null,
  action text not null check (action in ('archived', 'restored')),
  -- True when archiving ended a live session in the same transaction.
  ended_live boolean not null default false,
  note text check (note is null or char_length(note) between 1 and 500),
  actor_id uuid not null references public.profiles (id),
  actor_name text,
  -- The session's metadata_version after this transition.
  metadata_version integer not null,
  occurred_at timestamptz not null default pg_catalog.clock_timestamp(),
  foreign key (academy_id, academic_year_id, session_id)
    references public.sessions (academy_id, academic_year_id, id)
);
create index session_archive_events_session_idx on public.session_archive_events (session_id, id);

-- Retried archive/restore requests. The stored response commits with the transition it describes.
create table public.session_archive_requests (
  actor_id uuid not null references public.profiles (id),
  idempotency_key uuid not null,
  academy_id uuid not null,
  session_id uuid not null references public.sessions (id),
  fingerprint text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (actor_id, idempotency_key)
);

-- Outbox effects an archive stopped. A stopped effect is never delivered, even after restoration.
create table public.attendance_effect_suppressions (
  effect_id uuid primary key references public.attendance_effects (id),
  academy_id uuid not null,
  session_id uuid not null,
  archive_event_id bigint not null references public.session_archive_events (id),
  suppressed_at timestamptz not null default now()
);
create index attendance_effect_suppressions_session_idx on public.attendance_effect_suppressions (session_id);

create or replace function public.reject_session_archive_history_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = 'validation', hint = 'Session archive history cannot change.';
end;
$$;
create trigger session_archive_events_immutable before update or delete on public.session_archive_events
for each row execute function public.reject_session_archive_history_change();
create trigger attendance_effect_suppressions_immutable before update or delete on public.attendance_effect_suppressions
for each row execute function public.reject_session_archive_history_change();

alter table public.session_archive_events enable row level security;
alter table public.session_archive_requests enable row level security;
alter table public.attendance_effect_suppressions enable row level security;
revoke all on public.session_archive_events, public.session_archive_requests, public.attendance_effect_suppressions
  from public, anon, authenticated;
revoke delete, truncate on public.session_archive_events, public.attendance_effect_suppressions from service_role;
grant select on public.session_archive_events to authenticated;
create policy session_archive_events_select_members on public.session_archive_events
  for select to authenticated using (public.is_academy_member(academy_id));

-- ---------------------------------------------------------------------------------------------
-- Archive and restore

-- The session's archive-relevant state as returned by the commands.
create or replace function edra_private.session_archive_state(p_session_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', s.id, 'metadata_version', s.metadata_version, 'state', s.state, 'ended_at', s.ended_at,
    'end_reason', s.end_reason, 'archived_at', s.archived_at, 'archived_by_name', s.archived_by_name,
    'archive_note', s.archive_note
  ) from public.sessions s where s.id = p_session_id;
$$;

-- Shared command. p_action 'archive' or 'restore'. outcome: 'archived' / 'restored' (a transition),
-- 'already_archived' / 'not_archived' (nothing to do; no event), or 'conflict' (p_expected_version is
-- stale; nothing changed, not stored). A retried key replays the original response.
create or replace function edra_private.change_session_archive(
  p_action text, p_academy_id uuid, p_session_id uuid, p_expected_version integer, p_key uuid, p_note text
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  actor_name text := (select nullif(btrim(p.full_name), '') from public.profiles p where p.id = auth.uid());
  note text := nullif(btrim(p_note), '');
  fingerprint text;
  prior public.session_archive_requests%rowtype;
  target public.sessions%rowtype;
  outcome text;
  ended_live boolean := false;
  event_id bigint;
  stopped integer := 0;
  response jsonb;
begin
  if actor is null or p_academy_id is null
    or (public.academy_role_for(p_academy_id)::text in ('owner', 'head_admin', 'admin')) is not true then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  if p_action not in ('archive', 'restore') or p_session_id is null or p_key is null
    or p_expected_version is null or p_expected_version < 1
    or (note is not null and (p_action = 'restore' or char_length(note) > 500)) then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  fingerprint := md5(jsonb_build_object('action', p_action, 'session', p_session_id,
    'version', p_expected_version, 'note', note)::text);

  -- Rank 1: the session.
  select s.* into target from public.sessions s
  where s.id = p_session_id and s.academy_id = p_academy_id
  for update;
  if not found then raise exception using errcode = 'P0001', message = 'not_found'; end if;

  select * into prior from public.session_archive_requests r where r.actor_id = actor and r.idempotency_key = p_key;
  if found then
    if prior.fingerprint <> fingerprint or prior.session_id <> p_session_id then
      raise exception using errcode = 'P0001', message = 'idempotency_conflict';
    end if;
    return prior.response || jsonb_build_object('replayed', true);
  end if;

  -- Rank 2: the academic year, which must be open.
  perform 1 from public.academic_years y
  where y.id = target.academic_year_id and y.academy_id = target.academy_id and y.closed_at is null
  for share;
  if not found then raise exception using errcode = 'P0001', message = 'year_unavailable'; end if;

  -- The version the caller reviewed, before any lazy expiry is materialized.
  if target.metadata_version <> p_expected_version then
    return jsonb_build_object('outcome', 'conflict', 'session', edra_private.session_archive_state(target.id),
      'stopped_effects', 0, 'replayed', false);
  end if;

  if p_action = 'archive' and target.archived_at is not null then
    outcome := 'already_archived';
  elsif p_action = 'restore' and target.archived_at is null then
    outcome := 'not_archived';
  elsif p_action = 'archive' then
    if target.state = 'live' and target.auto_end_at <= now() then
      -- Existing automatic-close semantics (as expire_sessions).
      update public.sessions set state = 'ended', ended_at = auto_end_at, end_reason = 'auto' where id = target.id;
    elsif target.state = 'live' then
      -- Ordinary manual end (as end_session); no absence marking, no finalization.
      update public.sessions set
        state = 'ended', end_reason = 'manual', ended_at = greatest(now(), target.started_at), ended_by = actor,
        ended_by_name = actor_name
      where id = target.id;
      ended_live := true;
    end if;
    update public.sessions set archived_at = now(), archived_by = actor, archived_by_name = actor_name, archive_note = note
    where id = target.id
    returning * into target;
    insert into public.session_archive_events (academy_id, academic_year_id, session_id, action, ended_live, note, actor_id, actor_name, metadata_version)
    values (target.academy_id, target.academic_year_id, target.id, 'archived', ended_live, note, actor, actor_name, target.metadata_version)
    returning id into event_id;
    insert into public.attendance_effect_suppressions (effect_id, academy_id, session_id, archive_event_id)
    select e.id, e.academy_id, e.session_id, event_id
    from public.attendance_effects e
    where e.session_id = target.id and e.processed_at is null
      and not exists (select 1 from public.attendance_effect_suppressions x where x.effect_id = e.id);
    get diagnostics stopped = row_count;
    outcome := 'archived';
  else
    update public.sessions set archived_at = null, archived_by = null, archived_by_name = null, archive_note = null
    where id = target.id
    returning * into target;
    insert into public.session_archive_events (academy_id, academic_year_id, session_id, action, actor_id, actor_name, metadata_version)
    values (target.academy_id, target.academic_year_id, target.id, 'restored', actor, actor_name, target.metadata_version);
    outcome := 'restored';
  end if;

  response := jsonb_build_object('outcome', outcome, 'session', edra_private.session_archive_state(target.id),
    'ended_live', ended_live, 'stopped_effects', stopped);
  insert into public.session_archive_requests (actor_id, idempotency_key, academy_id, session_id, fingerprint, response)
  values (actor, p_key, target.academy_id, target.id, fingerprint, response);
  return response || jsonb_build_object('replayed', false);
end;
$$;

create function public.archive_session(
  p_academy_id uuid, p_session_id uuid, p_expected_version integer, p_key uuid, p_note text default null
)
returns jsonb
language sql security definer set search_path = '' as $$
  select edra_private.change_session_archive('archive', p_academy_id, p_session_id, p_expected_version, p_key, p_note);
$$;

create function public.restore_session(
  p_academy_id uuid, p_session_id uuid, p_expected_version integer, p_key uuid
)
returns jsonb
language sql security definer set search_path = '' as $$
  select edra_private.change_session_archive('restore', p_academy_id, p_session_id, p_expected_version, p_key, null);
$$;

-- ---------------------------------------------------------------------------------------------
-- start_session: unchanged from 20261005120000_live_sessions except that the live-session lookup
-- locks the row. The order stays schedule, year, then session; archive locks only the session.

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
  -- Locked, so a start waits for an in-flight archive of the live session and then starts anew.
  select * into prior from public.sessions s where s.schedule_id = p_schedule_id and s.state = 'live' for update;
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

-- ---------------------------------------------------------------------------------------------
-- Attendance is read-only while a session is archived. Every mutation checks the year through
-- require_open_attendance_year after replay and before writing, under the session lock.

create or replace function public.require_open_attendance_year(p_session public.sessions)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_session.archived_at is not null then
    raise exception using errcode = 'P0001', message = 'session_archived';
  end if;
  perform 1 from public.academic_years y
  where y.id = p_session.academic_year_id and y.academy_id = p_session.academy_id and y.closed_at is null
  for share;
  if not found then raise exception using errcode = 'P0001', message = 'year_unavailable'; end if;
end;
$$;

-- Check-ins report session_archived rather than session_ended for an archived session.
create or replace function edra_private.apply_check_in(
  p_target public.sessions, p_record_id uuid, p_key uuid, p_fingerprint text
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  current_status public.attendance_status;
  outcome text;
  entry jsonb;
  revision integer;
begin
  if p_target.archived_at is not null then raise exception using errcode = 'P0001', message = 'session_archived'; end if;
  if p_target.state <> 'live' then raise exception using errcode = 'P0001', message = 'session_ended'; end if;
  perform public.require_open_attendance_year(p_target);
  perform public.require_roster_student(p_target, p_record_id);

  select a.status into current_status from public.attendance_records a
  where a.session_id = p_target.id and a.annual_student_record_id = p_record_id;
  current_status := coalesce(current_status, 'unknown');

  if current_status in ('absent', 'excused') then
    outcome := 'review_required';
  elsif current_status in ('present', 'late') then
    outcome := 'already_recorded';
  else
    perform public.write_attendance(p_target, p_record_id, 'present', 'check_in', true);
    perform public.bump_attendance_revision(p_target);
    outcome := 'recorded';
  end if;

  entry := public.attendance_entry(p_target.id, p_record_id);
  revision := public.current_attendance_revision(p_target.id);
  if outcome = 'review_required' then
    return jsonb_build_object('outcome', outcome, 'entry', entry, 'revision', revision,
      'correction_pending', false, 'replayed', false);
  end if;
  return public.remember_attendance_request(p_key, 'check_in', p_target, p_fingerprint, jsonb_build_object(
    'outcome', outcome, 'entry', entry, 'revision', revision,
    'correction_pending', public.attendance_pending(p_target.id)
      and (entry->>'status') is distinct from coalesce(entry->>'published_status', 'unknown')
  ));
end;
$$;
revoke all on function edra_private.apply_check_in(public.sessions, uuid, uuid, text) from public, anon, authenticated;

-- Unchanged from 20261006270000_student_code_checkin except the archived check before the
-- lifecycle check.
create or replace function edra_private.check_in_attendance_by_code(
  p_academy_id uuid, p_session_id uuid, p_code text, p_key uuid, p_late_after_minutes integer
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  normalized text := public.normalize_student_code(p_code);
  late_after integer := coalesce(p_late_after_minutes, 0);
  codes_on boolean;
  target public.sessions%rowtype;
  fingerprint text;
  replay jsonb;
  holders integer;
  assignment public.student_code_assignments%rowtype;
  holder public.annual_student_records%rowtype;
  result jsonb;
begin
  if auth.uid() is null or p_academy_id is null or public.academy_role_for(p_academy_id) is null then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  if p_session_id is null or p_key is null or normalized is null or late_after < 0 or late_after > 1440 then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  -- The academy always comes from the session; a mismatch looks like a missing session.
  perform 1 from public.sessions s where s.id = p_session_id and s.academy_id = p_academy_id;
  if not found then raise exception using errcode = 'P0001', message = 'not_found'; end if;

  -- Rank 1: settings row (share), so saving/disabling waits for in-flight scans and vice versa.
  select s.enabled into codes_on from public.student_code_settings s where s.academy_id = p_academy_id for share;
  codes_on := coalesce(codes_on, false);

  -- Rank 2: the attendance session.
  target := public.lock_attendance_session(p_academy_id, p_session_id);

  fingerprint := md5(jsonb_build_object(
    'session', p_session_id, 'identifier', 'student_code', 'code', normalized, 'late_after', late_after)::text);
  replay := public.attendance_replay(p_key, 'check_in', fingerprint);
  if replay is not null then return replay; end if;

  if target.archived_at is not null then raise exception using errcode = 'P0001', message = 'session_archived'; end if;
  if not codes_on then raise exception using errcode = 'P0001', message = 'student_codes_disabled'; end if;
  if target.state <> 'live' then raise exception using errcode = 'P0001', message = 'session_ended'; end if;

  -- A string issued to different students is ambiguous for an old physical card: never guess.
  select count(distinct a.academy_student_profile_id) into holders from public.student_code_assignments a
  where a.academy_id = p_academy_id and a.code = normalized;
  if holders = 0 then raise exception using errcode = 'P0001', message = 'student_code_not_found'; end if;
  if holders > 1 then raise exception using errcode = 'P0001', message = 'student_code_ambiguous'; end if;

  select a.* into assignment from public.student_code_assignments a
  where a.academy_id = p_academy_id and a.code = normalized and a.retired_at is null;
  if not found then raise exception using errcode = 'P0001', message = 'student_code_retired'; end if;

  -- Rank 3: the record, shared. Retirement, replacement, and level edits take it exclusively, so
  -- after this lock the assignment is revalidated against committed state.
  select r.* into holder from public.annual_student_records r
  where r.id = assignment.annual_student_record_id and r.academy_id = p_academy_id for share;
  select a.* into assignment from public.student_code_assignments a where a.id = assignment.id;
  if not found or assignment.retired_at is not null or holder.id is null
    or holder.archived_at is not null or holder.level_id <> assignment.level_id
    or holder.academic_year_id <> assignment.academic_year_id
    or holder.academic_year_id <> target.academic_year_id then
    raise exception using errcode = 'P0001', message = 'student_code_retired';
  end if;

  -- Rank 4 (year, share), roster, duplicate and review rules: the shared engine.
  result := edra_private.apply_check_in(target, holder.id, p_key, fingerprint);
  if result->>'outcome' <> 'review_required' then
    update public.attendance_requests
    set resolved = jsonb_build_object('annual_student_record_id', holder.id, 'assignment_id', assignment.id)
    where actor_id = auth.uid() and idempotency_key = p_key;
  end if;
  return result;
end;
$$;
revoke all on function edra_private.check_in_attendance_by_code(uuid, uuid, text, uuid, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Counting and effect eligibility contracts

-- Official attendance that counts: the latest finalized value of each roster student in sessions that
-- are not archived. Every count, rate, absence summary and recovery projection must read this (or
-- apply the same session predicate), never attendance_records directly. Stored values are unchanged;
-- restoring a session makes its rows appear again. RLS of the underlying tables applies.
create view public.counted_attendance with (security_invoker = true) as
  select a.academy_id, a.academic_year_id, a.session_id, a.annual_student_record_id,
    en.origin, s.mandatory, s.schedule_id, s.started_at as session_started_at,
    a.published_status as status, a.published_at, a.published_publication_id as publication_id
  from public.attendance_records a
  join public.sessions s on s.id = a.session_id
  join public.session_roster_entries en
    on en.session_id = a.session_id and en.annual_student_record_id = a.annual_student_record_id
  where a.published_status is not null and s.archived_at is null;

revoke all on public.counted_attendance from public, anon, authenticated;
grant select on public.counted_attendance to authenticated;

-- True while an outbox effect may still be delivered: unprocessed, not stopped by an archive, and its
-- session not archived now.
create or replace function edra_private.attendance_effect_pending(p_effect_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.attendance_effects e
    join public.sessions s on s.id = e.session_id
    where e.id = p_effect_id and e.processed_at is null and s.archived_at is null
      and not exists (select 1 from public.attendance_effect_suppressions x where x.effect_id = e.id)
  );
$$;

-- The claim boundary for a future effect consumer: locks the effect's session (share, so archival
-- waits for an in-flight claim and a claim waits for an in-flight archival), then the effect itself
-- (skipping one another worker holds), and returns it only while it is still pending. Null otherwise.
-- The consumer marks processed_at in the same transaction it dispatches in.
create or replace function edra_private.claim_attendance_effect(p_effect_id uuid)
returns public.attendance_effects
language plpgsql security definer set search_path = '' as $$
declare
  effect public.attendance_effects%rowtype;
begin
  select e.* into effect from public.attendance_effects e where e.id = p_effect_id;
  if not found then return null; end if;
  perform 1 from public.sessions s where s.id = effect.session_id for share;
  select e.* into effect from public.attendance_effects e where e.id = p_effect_id for update skip locked;
  if not found or not edra_private.attendance_effect_pending(p_effect_id) then return null; end if;
  return effect;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Reads

-- History filter p_archive: 'active' (default, unarchived), 'archived', or 'all'.
drop function public.list_past_sessions(uuid, text, date, date, timestamptz, uuid, integer);

create or replace function public.list_past_sessions(
  p_academy_id uuid, p_search text, p_from date, p_to date, p_before_started_at timestamptz, p_before_id uuid,
  p_limit integer, p_archive text default 'active'
)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.started_at desc, x.id desc), '[]'::jsonb) from (
    select s.id, s.academy_id, a.name as academy_name, a.slug as academy_slug, s.academic_year_id,
      s.schedule_id, s.schedule_title, s.schedule_kind, s.audience, s.group_id, s.group_name,
      s.level_id, gl.name as level_name, s.track_id, s.track_name, s.mandatory, s.location,
      'ended'::public.session_state as state, s.started_at, s.started_by, s.started_by_name,
      s.auto_end_at, s.metadata_version,
      case when s.state = 'live' then s.auto_end_at else s.ended_at end as ended_at,
      s.ended_by_name,
      case when s.state = 'live' then 'auto'::public.session_end_reason else s.end_reason end as end_reason,
      s.archived_at, s.archived_by_name,
      (select count(*) from public.session_roster_entries e where e.session_id = s.id) as roster_count
    from public.sessions s
    join public.academies a on a.id = s.academy_id
    left join public.global_levels gl on gl.id = s.level_id
    where (s.state = 'ended' or s.auto_end_at <= now())
      and case coalesce(p_archive, 'active')
        when 'active' then s.archived_at is null
        when 'archived' then s.archived_at is not null
        when 'all' then true
      end
      and (p_academy_id is null or s.academy_id = p_academy_id)
      and (p_from is null or (s.started_at at time zone 'Africa/Cairo')::date >= p_from)
      and (p_to is null or (s.started_at at time zone 'Africa/Cairo')::date <= p_to)
      and (p_before_started_at is null or (s.started_at, s.id) < (p_before_started_at, p_before_id))
      and (
        nullif(btrim(p_search), '') is null
        or concat_ws(' ', s.schedule_title, s.group_name, gl.name, s.track_name, s.started_by_name)
          ilike '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%'
      )
    order by s.started_at desc, s.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  ) x;
$$;

-- What archiving would affect, for the confirmation: roster size, students with official values,
-- students with unfinalized changes, and outbox effects still pending. Members only; effects are not
-- otherwise readable by staff.
create or replace function public.session_archive_impact(p_academy_id uuid, p_session_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'roster_count', (select count(*) from public.session_roster_entries e where e.session_id = s.id),
    'official_count', (select count(*) from public.attendance_records a where a.session_id = s.id and a.published_status is not null),
    'draft_count', (select count(*) from public.attendance_records a
      where a.session_id = s.id and a.status is distinct from coalesce(a.published_status, 'unknown')),
    'pending_effects', (select count(*) from public.attendance_effects e
      where e.session_id = s.id and e.processed_at is null
        and not exists (select 1 from public.attendance_effect_suppressions x where x.effect_id = e.id))
  )
  from public.sessions s
  where s.id = p_session_id and s.academy_id = p_academy_id and public.is_academy_member(p_academy_id);
$$;

-- Session details add archival state, the archive trail, whether the year is open, and whether the
-- caller may archive/restore (manager role). Otherwise unchanged from 20261005140000.
create or replace function public.get_session(p_academy_id uuid, p_session_id uuid)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'session', to_jsonb(x),
    'roster', coalesce((
      select jsonb_agg(to_jsonb(e) order by lower(e.full_name), e.annual_student_record_id) from (
        select en.annual_student_record_id, r.academy_student_profile_id, r.full_name, r.student_phone, r.parent_phone,
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
    ), '[]'::jsonb),
    'archive_impact', public.session_archive_impact(x.academy_id, x.id),
    'archive_events', coalesce((
      select jsonb_agg(jsonb_build_object('action', ev.action, 'ended_live', ev.ended_live, 'note', ev.note,
        'actor_name', ev.actor_name, 'occurred_at', ev.occurred_at) order by ev.id)
      from public.session_archive_events ev where ev.session_id = x.id
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
      s.ended_by, s.ended_by_name,
      s.archived_at, s.archived_by_name, s.archive_note,
      exists (select 1 from public.academic_years y where y.id = s.academic_year_id and y.closed_at is null) as year_open,
      coalesce(public.academy_role_for(s.academy_id)::text in ('owner', 'head_admin', 'admin'), false) as can_manage_archive
    from public.sessions s
    left join public.global_levels gl on gl.id = s.level_id
    where s.id = p_session_id and s.academy_id = p_academy_id
  ) x;
$$;

-- The attendance sheet adds the session's archival state. Otherwise unchanged from 20261006260000.
create or replace function public.get_attendance(p_academy_id uuid, p_session_id uuid)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'session', jsonb_build_object(
      'id', s.id, 'academy_id', s.academy_id, 'academic_year_id', s.academic_year_id,
      'schedule_title', s.schedule_title, 'group_name', s.group_name, 'mandatory', s.mandatory,
      'location', s.location, 'started_at', s.started_at, 'auto_end_at', s.auto_end_at,
      'state', case when s.state = 'live' and s.auto_end_at <= now() then 'ended' else s.state::text end,
      'ended_at', case when s.state = 'live' and s.auto_end_at <= now() then s.auto_end_at else s.ended_at end,
      'year_open', exists (select 1 from public.academic_years y where y.id = s.academic_year_id and y.closed_at is null),
      'archived_at', s.archived_at,
      'metadata_version', s.metadata_version
    ),
    'student_codes_enabled', coalesce((select c.enabled from public.student_code_settings c where c.academy_id = s.academy_id), false),
    'revision', coalesce(sh.revision, 0),
    'published_revision', sh.published_revision,
    'publication_count', coalesce(sh.publication_count, 0),
    'last_published_at', sh.last_published_at,
    'last_published_by_name', sh.last_published_by_name,
    'entries', coalesce((
      select jsonb_agg(e order by lower(e->>'full_name'), e->>'annual_student_record_id')
      from (
        select jsonb_build_object(
          'annual_student_record_id', en.annual_student_record_id,
          'full_name', r.full_name,
          'student_code', (
            select sa.code from public.student_code_assignments sa
            where sa.annual_student_record_id = en.annual_student_record_id and sa.retired_at is null
              and exists (select 1 from public.student_code_settings c where c.academy_id = s.academy_id and c.enabled)
          ),
          'archived', r.archived_at is not null,
          'origin', en.origin,
          'group_name', g.name,
          'status', coalesce(a.status, 'unknown'),
          'version', coalesce(a.version, 0),
          'source', a.source,
          'updated_at', a.updated_at,
          'updated_by', a.updated_by,
          'updated_by_name', a.updated_by_name,
          'checked_in_at', a.checked_in_at,
          'published_status', a.published_status,
          'published_at', a.published_at
        ) as e
        from public.session_roster_entries en
        join public.annual_student_records r on r.id = en.annual_student_record_id
        left join public.groups g on g.id = en.primary_group_id
        left join public.attendance_records a
          on a.session_id = en.session_id and a.annual_student_record_id = en.annual_student_record_id
        where en.session_id = s.id
      ) x
    ), '[]'::jsonb)
  )
  from public.sessions s
  left join public.attendance_sheets sh on sh.session_id = s.id
  where s.id = p_session_id and s.academy_id = p_academy_id;
$$;

-- ---------------------------------------------------------------------------------------------
-- Realtime: lifecycle and archive changes reach open attendance screens on the session's channel,
-- so they refetch and become read-only. Attendance-sheet events alone do not fire on archival.
create or replace function public.broadcast_session_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(
    jsonb_build_object('session_id', new.id, 'metadata_version', new.metadata_version, 'state', new.state,
      'archived', new.archived_at is not null),
    'session_changed',
    'attendance:' || new.academy_id || ':' || new.id,
    true
  );
  return null;
end;
$$;
create trigger sessions_broadcast after update on public.sessions
for each row when (old.metadata_version is distinct from new.metadata_version)
execute function public.broadcast_session_change();

-- ---------------------------------------------------------------------------------------------
-- Grants

revoke all on function public.reject_session_archive_history_change() from public, anon, authenticated, service_role;
revoke all on function public.broadcast_session_change() from public, anon, authenticated, service_role;
revoke all on function public.protect_session_write() from public, anon, authenticated, service_role;
revoke all on function public.require_open_attendance_year(public.sessions) from public, anon, authenticated;
revoke all on function edra_private.session_archive_state(uuid) from public, anon, authenticated;
revoke all on function edra_private.change_session_archive(text, uuid, uuid, integer, uuid, text) from public, anon, authenticated;
revoke all on function edra_private.attendance_effect_pending(uuid) from public, anon, authenticated;
revoke all on function edra_private.claim_attendance_effect(uuid) from public, anon, authenticated;
revoke all on function public.session_archive_impact(uuid, uuid) from public, anon;
grant execute on function public.session_archive_impact(uuid, uuid) to authenticated;
revoke all on function public.archive_session(uuid, uuid, integer, uuid, text) from public, anon;
revoke all on function public.restore_session(uuid, uuid, integer, uuid) from public, anon;
revoke all on function public.list_past_sessions(uuid, text, date, date, timestamptz, uuid, integer, text) from public, anon;
grant execute on function public.archive_session(uuid, uuid, integer, uuid, text) to authenticated;
grant execute on function public.restore_session(uuid, uuid, integer, uuid) to authenticated;
grant execute on function public.list_past_sessions(uuid, text, date, date, timestamptz, uuid, integer, text) to authenticated;
