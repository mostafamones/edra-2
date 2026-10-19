-- Attendance corrections (Task 2): atomic Late check-ins, a reviewed all-remaining absence command, and
-- an explicit unexpected-attendee append. Additive: no committed function is dropped, no stored receipt,
-- roster snapshot or attendance row is rewritten.
--
-- 1. Check-in Late is part of the first transaction. The shared engine captures one server acceptance
--    instant after its locks and uses it for both the Late classification and checked_in_at:
--    Late-after 0 (or omitted) never marks Late; exactly at started_at + Late-after is Present; strictly
--    later is Late. The status, version, sheet revision and receipt commit (or roll back) together, so
--    finalization can never publish a transient Present that a second write later turns into Late.
--    * The four-argument public.check_in_attendance keeps its fingerprint and Present-only semantics for
--      older callers.
--    * public.check_in_attendance_with_late (a new, uniquely named RPC) binds new receipts to the session,
--      record and normalized Late-after. A stored receipt made by the four-argument command under the
--      same key and (session, record) replays its original acknowledgment unchanged: its threshold was
--      never recorded, so Late is never applied retroactively.
--    * Code check-ins already fingerprinted Late-after; they now apply it in the same transaction.
-- 2. public.mark_unrecorded_absent: one revision-reviewed command that marks every expected roster
--    student still Unknown in a mandatory session Absent, atomically and at any roster size. It never
--    touches eligible/unexpected students or recorded values, bumps the sheet revision once, and stores
--    one receipt. A stale reviewed revision changes nothing and returns outcome 'stale' (not stored).
-- 3. public.add_session_attendee / public.search_attendee_candidates: staff explicitly append an active
--    annual record of the session's academy and year to the roster with origin 'unexpected' (live or
--    ended session, open year, unarchived session). The original snapshot and the student's placement
--    are never changed. A duplicate add is a stored no-op ('already_on_roster').
--
-- Locks keep the established order: settings (code path) -> session (no key update) -> annual record
-- (share) -> academic year (share).

-- ---------------------------------------------------------------------------------------------
-- 1. Atomic check-in engine

create or replace function edra_private.apply_check_in(
  p_target public.sessions, p_record_id uuid, p_key uuid, p_fingerprint text, p_late_after integer
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  actor_name text := (select nullif(btrim(p.full_name), '') from public.profiles p where p.id = auth.uid());
  late_after integer := coalesce(p_late_after, 0);
  current_status public.attendance_status;
  final_status public.attendance_status;
  moment timestamptz;
  outcome text;
  entry jsonb;
  revision integer;
begin
  if late_after < 0 or late_after > 1440 then raise exception using errcode = 'P0001', message = 'validation'; end if;
  if p_target.archived_at is not null then raise exception using errcode = 'P0001', message = 'session_archived'; end if;
  if p_target.state <> 'live' then raise exception using errcode = 'P0001', message = 'session_ended'; end if;
  perform public.require_open_attendance_year(p_target);
  perform public.require_roster_student(p_target, p_record_id);

  -- Every lock is held: this is when the server accepted the check-in.
  moment := pg_catalog.clock_timestamp();

  select a.status into current_status from public.attendance_records a
  where a.session_id = p_target.id and a.annual_student_record_id = p_record_id;
  current_status := coalesce(current_status, 'unknown');

  if current_status in ('absent', 'excused') then
    outcome := 'review_required';
  elsif current_status in ('present', 'late') then
    outcome := 'already_recorded';
  else
    final_status := case
      when late_after > 0 and moment > p_target.started_at + make_interval(mins => late_after) then 'late'
      else 'present'
    end;
    insert into public.attendance_records as a (
      academy_id, academic_year_id, session_id, annual_student_record_id, status, version, source,
      updated_by, updated_by_name, updated_at, checked_in_at, checked_in_by
    ) values (
      p_target.academy_id, p_target.academic_year_id, p_target.id, p_record_id, final_status, 1, 'check_in',
      actor, actor_name, moment, moment, actor
    )
    on conflict (session_id, annual_student_record_id) do update set
      status = excluded.status,
      version = a.version + 1,
      source = excluded.source,
      updated_by = excluded.updated_by,
      updated_by_name = excluded.updated_by_name,
      updated_at = excluded.updated_at,
      checked_in_at = coalesce(a.checked_in_at, excluded.checked_in_at),
      checked_in_by = case when a.checked_in_at is null then excluded.checked_in_by else a.checked_in_by end;
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
revoke all on function edra_private.apply_check_in(public.sessions, uuid, uuid, text, integer) from public, anon, authenticated;

-- The four-argument engine (still used by the legacy UUID command) never marks Late.
create or replace function edra_private.apply_check_in(
  p_target public.sessions, p_record_id uuid, p_key uuid, p_fingerprint text
)
returns jsonb
language sql security definer set search_path = '' as $$
  select edra_private.apply_check_in(p_target, p_record_id, p_key, p_fingerprint, 0);
$$;
revoke all on function edra_private.apply_check_in(public.sessions, uuid, uuid, text) from public, anon, authenticated;

-- UUID check-in with an explicit Late-after (0..1440; null is 0).
create or replace function edra_private.check_in_attendance_with_late(
  p_academy_id uuid, p_session_id uuid, p_annual_record_id uuid, p_key uuid, p_late_after_minutes integer
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  late_after integer := coalesce(p_late_after_minutes, 0);
  fingerprint text := md5(jsonb_build_object('session', p_session_id, 'identifier', 'annual_record',
    'record', p_annual_record_id, 'late_after', late_after)::text);
  -- The four-argument command's fingerprint, for receipts stored before this migration's callers.
  legacy text := md5(jsonb_build_object('session', p_session_id, 'record', p_annual_record_id)::text);
  target public.sessions%rowtype;
  prior public.attendance_requests%rowtype;
begin
  -- Membership first, then the session lock.
  target := public.lock_attendance_session(p_academy_id, p_session_id);
  if p_key is null or late_after < 0 or late_after > 1440 then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  select * into prior from public.attendance_requests r where r.actor_id = auth.uid() and r.idempotency_key = p_key;
  if found then
    if prior.operation = 'check_in' and (prior.fingerprint = fingerprint or prior.fingerprint = legacy) then
      -- A historical acknowledgment, never re-evaluated against the current threshold or row.
      return prior.response || jsonb_build_object('replayed', true);
    end if;
    raise exception using errcode = 'P0001', message = 'idempotency_conflict';
  end if;
  return edra_private.apply_check_in(target, p_annual_record_id, p_key, fingerprint, late_after);
end;
$$;
revoke all on function edra_private.check_in_attendance_with_late(uuid, uuid, uuid, uuid, integer) from public, anon, authenticated;

create function public.check_in_attendance_with_late(
  p_academy_id uuid, p_session_id uuid, p_annual_record_id uuid, p_key uuid, p_late_after_minutes integer
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform edra_private.charge_mutation_quota('op:attendance_check_in');
  return edra_private.check_in_attendance_with_late(p_academy_id, p_session_id, p_annual_record_id, p_key, p_late_after_minutes);
end;
$$;
revoke all on function public.check_in_attendance_with_late(uuid, uuid, uuid, uuid, integer) from public, anon;
grant execute on function public.check_in_attendance_with_late(uuid, uuid, uuid, uuid, integer) to authenticated;

-- Unchanged from 20261013200000_session_archival except that the engine applies Late-after.
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

  -- Rank 4 (year, share), roster, duplicate, review and Late rules: the shared engine.
  result := edra_private.apply_check_in(target, holder.id, p_key, fingerprint, late_after);
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
-- 2. Reviewed all-remaining absence

-- outcome: 'updated' (changed > 0), 'unchanged' (no expected student was still Unknown), or 'stale'
-- (the sheet revision differs from p_expected_revision; nothing changed, not stored).
create or replace function edra_private.mark_unrecorded_absent(
  p_academy_id uuid, p_session_id uuid, p_expected_revision integer, p_key uuid
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  actor_name text := (select nullif(btrim(p.full_name), '') from public.profiles p where p.id = auth.uid());
  fingerprint text := md5(jsonb_build_object('session', p_session_id, 'operation', 'unrecorded_absent',
    'revision', p_expected_revision)::text);
  target public.sessions%rowtype;
  replay jsonb;
  current_revision integer;
  changed integer := 0;
begin
  target := public.lock_attendance_session(p_academy_id, p_session_id);
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  replay := public.attendance_replay(p_key, 'unrecorded_absent', fingerprint);
  if replay is not null then return replay; end if;
  perform public.require_open_attendance_year(target);
  -- Only a mandatory session has expected students who can be absent.
  if not target.mandatory then raise exception using errcode = 'P0001', message = 'validation'; end if;

  current_revision := public.current_attendance_revision(target.id);
  if current_revision <> p_expected_revision then
    return jsonb_build_object('outcome', 'stale', 'changed', 0, 'revision', current_revision, 'replayed', false);
  end if;

  insert into public.attendance_records as a (
    academy_id, academic_year_id, session_id, annual_student_record_id, status, version, source,
    updated_by, updated_by_name
  )
  select en.academy_id, en.academic_year_id, en.session_id, en.annual_student_record_id, 'absent', 1, 'bulk',
    actor, actor_name
  from public.session_roster_entries en
  left join public.attendance_records cur
    on cur.session_id = en.session_id and cur.annual_student_record_id = en.annual_student_record_id
  where en.session_id = target.id and en.origin = 'expected' and coalesce(cur.status, 'unknown') = 'unknown'
  on conflict (session_id, annual_student_record_id) do update set
    status = excluded.status,
    version = a.version + 1,
    source = excluded.source,
    updated_by = excluded.updated_by,
    updated_by_name = excluded.updated_by_name,
    updated_at = now()
  where a.status = 'unknown';
  get diagnostics changed = row_count;

  -- One sheet revision for the whole command.
  if changed > 0 then perform public.bump_attendance_revision(target); end if;
  return public.remember_attendance_request(p_key, 'unrecorded_absent', target, fingerprint, jsonb_build_object(
    'outcome', case when changed > 0 then 'updated' else 'unchanged' end,
    'changed', changed,
    'revision', public.current_attendance_revision(target.id)
  ));
end;
$$;
revoke all on function edra_private.mark_unrecorded_absent(uuid, uuid, integer, uuid) from public, anon, authenticated;

create function public.mark_unrecorded_absent(
  p_academy_id uuid, p_session_id uuid, p_expected_revision integer, p_key uuid
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform edra_private.charge_mutation_quota('op:attendance_change');
  return edra_private.mark_unrecorded_absent(p_academy_id, p_session_id, p_expected_revision, p_key);
end;
$$;
revoke all on function public.mark_unrecorded_absent(uuid, uuid, integer, uuid) from public, anon;
grant execute on function public.mark_unrecorded_absent(uuid, uuid, integer, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. Unexpected attendees

-- outcome: 'added' (a new roster entry, revision bumped), 'already_on_roster' (no change; the existing
-- entry keeps its origin and placement), or 'stale' (p_expected_revision differs; nothing changed, not
-- stored). Raises student_not_found (not this academy and year), student_archived, session_archived,
-- year_unavailable.
create or replace function edra_private.add_session_attendee(
  p_academy_id uuid, p_session_id uuid, p_record_id uuid, p_expected_revision integer, p_key uuid
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  actor_name text := (select nullif(btrim(p.full_name), '') from public.profiles p where p.id = auth.uid());
  fingerprint text := md5(jsonb_build_object('session', p_session_id, 'operation', 'add_attendee',
    'record', p_record_id, 'revision', p_expected_revision)::text);
  target public.sessions%rowtype;
  replay jsonb;
  holder public.annual_student_records%rowtype;
  current_revision integer;
begin
  target := public.lock_attendance_session(p_academy_id, p_session_id);
  if p_record_id is null or p_expected_revision is null or p_expected_revision < 0 then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  replay := public.attendance_replay(p_key, 'add_attendee', fingerprint);
  if replay is not null then return replay; end if;
  if target.archived_at is not null then raise exception using errcode = 'P0001', message = 'session_archived'; end if;

  -- Rank 3: the record, shared, so archival and placement edits wait for the append (and vice versa).
  select r.* into holder from public.annual_student_records r
  where r.id = p_record_id and r.academy_id = target.academy_id and r.academic_year_id = target.academic_year_id
  for share;
  -- Rank 4: the academic year.
  perform public.require_open_attendance_year(target);
  if holder.id is null then raise exception using errcode = 'P0001', message = 'student_not_found'; end if;

  perform 1 from public.session_roster_entries en where en.session_id = target.id and en.annual_student_record_id = holder.id;
  if found then
    return public.remember_attendance_request(p_key, 'add_attendee', target, fingerprint, jsonb_build_object(
      'outcome', 'already_on_roster', 'entry', public.attendance_entry(target.id, holder.id),
      'revision', public.current_attendance_revision(target.id)));
  end if;
  if holder.archived_at is not null then raise exception using errcode = 'P0001', message = 'student_archived'; end if;

  current_revision := public.current_attendance_revision(target.id);
  if current_revision <> p_expected_revision then
    return jsonb_build_object('outcome', 'stale', 'entry', null, 'revision', current_revision, 'replayed', false);
  end if;

  insert into public.session_roster_entries (
    academy_id, academic_year_id, session_id, annual_student_record_id, origin,
    level_id, track_id, primary_group_id, participation_type, added_by, added_by_name
  ) values (
    target.academy_id, target.academic_year_id, target.id, holder.id, 'unexpected',
    holder.level_id, holder.track_id, holder.primary_group_id, holder.participation_type, actor, actor_name
  );
  perform public.bump_attendance_revision(target);
  return public.remember_attendance_request(p_key, 'add_attendee', target, fingerprint, jsonb_build_object(
    'outcome', 'added', 'entry', public.attendance_entry(target.id, holder.id),
    'revision', public.current_attendance_revision(target.id)));
end;
$$;
revoke all on function edra_private.add_session_attendee(uuid, uuid, uuid, integer, uuid) from public, anon, authenticated;

create function public.add_session_attendee(
  p_academy_id uuid, p_session_id uuid, p_record_id uuid, p_expected_revision integer, p_key uuid
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform edra_private.charge_mutation_quota('op:attendance_change');
  return edra_private.add_session_attendee(p_academy_id, p_session_id, p_record_id, p_expected_revision, p_key);
end;
$$;
revoke all on function public.add_session_attendee(uuid, uuid, uuid, integer, uuid) from public, anon;
grant execute on function public.add_session_attendee(uuid, uuid, uuid, integer, uuid) to authenticated;

-- Read-only: active annual records of the session's academy and year that are not on its roster,
-- matching a name fragment or an exact current code (when codes are enabled). Deterministic order,
-- bounded pages. Returns { items, has_more }. Raises forbidden, validation or not_found.
create or replace function public.search_attendee_candidates(
  p_academy_id uuid, p_session_id uuid, p_query text, p_limit integer, p_offset integer
)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  target public.sessions%rowtype;
  term text := nullif(btrim(coalesce(p_query, '')), '');
  wanted_code text;
  like_pattern text;
  codes_on boolean;
  found_rows jsonb;
begin
  if auth.uid() is null or p_academy_id is null or public.academy_role_for(p_academy_id) is null then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  if p_session_id is null or p_limit is null or p_limit not between 1 and 50 or p_offset is null
    or p_offset not between 0 and 10000 or char_length(coalesce(p_query, '')) > 100 then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  select s.* into target from public.sessions s where s.id = p_session_id and s.academy_id = p_academy_id;
  if not found then raise exception using errcode = 'P0001', message = 'not_found'; end if;

  codes_on := coalesce((select c.enabled from public.student_code_settings c where c.academy_id = p_academy_id), false);
  wanted_code := case when codes_on then public.normalize_student_code(term) end;
  like_pattern := '%' || replace(replace(replace(term, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  select coalesce(jsonb_agg(x.item order by x.sort_name, x.id), '[]'::jsonb) into found_rows
  from (
    select r.id, lower(r.full_name) as sort_name, jsonb_build_object(
      'annual_student_record_id', r.id,
      'full_name', r.full_name,
      'level_name', gl.name,
      'group_name', g.name,
      'participation_type', r.participation_type,
      'student_code', case when codes_on then (
        select sa.code from public.student_code_assignments sa
        where sa.annual_student_record_id = r.id and sa.retired_at is null
      ) end
    ) as item
    from public.annual_student_records r
    left join public.global_levels gl on gl.id = r.level_id
    left join public.groups g on g.id = r.primary_group_id
    where r.academy_id = target.academy_id and r.academic_year_id = target.academic_year_id
      and r.archived_at is null
      and not exists (
        select 1 from public.session_roster_entries en
        where en.session_id = target.id and en.annual_student_record_id = r.id
      )
      and (term is null or r.full_name ilike like_pattern or (wanted_code is not null and exists (
        select 1 from public.student_code_assignments sa
        where sa.annual_student_record_id = r.id and sa.academy_id = r.academy_id
          and sa.code = wanted_code and sa.retired_at is null
      )))
    order by lower(r.full_name), r.id
    limit p_limit + 1 offset p_offset
  ) x;

  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(t.e order by t.n) from jsonb_array_elements(found_rows) with ordinality t(e, n) where t.n <= p_limit
    ), '[]'::jsonb),
    'has_more', jsonb_array_length(found_rows) > p_limit
  );
end;
$$;
revoke all on function public.search_attendee_candidates(uuid, uuid, text, integer, integer) from public, anon;
grant execute on function public.search_attendee_candidates(uuid, uuid, text, integer, integer) to authenticated;
