-- Attendance corrections: atomic Late check-ins (UUID and code) with receipt replay and legacy UUID
-- receipts, the reviewed all-remaining absence command at roster sizes above the explicit batch cap,
-- and the explicit unexpected-attendee append with candidate search.
-- Run with `npm run test:db` against the marked isolated test target (see docs/engineering.md).
-- Everything runs in one transaction that is rolled back.

do $$ begin
  if has_function_privilege('anon', 'public.check_in_attendance_with_late(uuid, uuid, uuid, uuid, integer)', 'execute')
    or has_function_privilege('anon', 'public.mark_unrecorded_absent(uuid, uuid, integer, uuid)', 'execute')
    or has_function_privilege('anon', 'public.add_session_attendee(uuid, uuid, uuid, integer, uuid)', 'execute')
    or has_function_privilege('anon', 'public.search_attendee_candidates(uuid, uuid, text, integer, integer)', 'execute')
    or not has_function_privilege('authenticated', 'public.check_in_attendance_with_late(uuid, uuid, uuid, uuid, integer)', 'execute')
    or not has_function_privilege('authenticated', 'public.mark_unrecorded_absent(uuid, uuid, integer, uuid)', 'execute')
    or not has_function_privilege('authenticated', 'public.add_session_attendee(uuid, uuid, uuid, integer, uuid)', 'execute')
    or not has_function_privilege('authenticated', 'public.search_attendee_candidates(uuid, uuid, text, integer, integer)', 'execute')
    or not has_function_privilege('authenticated', 'public.check_in_attendance(uuid, uuid, uuid, uuid)', 'execute') then
    raise exception 'Attendance correction RPC grants are wrong';
  end if;
  if has_function_privilege('authenticated', 'edra_private.apply_check_in(public.sessions, uuid, uuid, text, integer)', 'execute')
    or has_function_privilege('authenticated', 'edra_private.check_in_attendance_with_late(uuid, uuid, uuid, uuid, integer)', 'execute')
    or has_function_privilege('authenticated', 'edra_private.mark_unrecorded_absent(uuid, uuid, integer, uuid)', 'execute')
    or has_function_privilege('authenticated', 'edra_private.add_session_attendee(uuid, uuid, uuid, integer, uuid)', 'execute') then
    raise exception 'Quota-free attendance correction functions are callable';
  end if;
  if has_table_privilege('authenticated', 'public.session_roster_entries', 'insert') then
    raise exception 'Authenticated callers may insert roster entries directly';
  end if;
end $$;

begin;

create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$
begin
  execute statement;
  raise exception 'expected error "%" but the statement succeeded: %', expected, statement using errcode = 'XX001';
exception
  when sqlstate 'XX001' then raise;
  when others then
    if sqlerrm not like expected then
      raise exception 'expected error "%" but got "%": %', expected, sqlerrm, statement;
    end if;
end;
$$;

create function pg_temp.late_in(session_setting text, record_setting text, key text, late integer) returns jsonb language sql as $$
  select public.check_in_attendance_with_late('c5555555-5555-4555-8555-555555555555', current_setting(session_setting)::uuid,
    current_setting(record_setting)::uuid, key::uuid, late);
$$;
create function pg_temp.absent_rest(session_setting text, revision integer, key text) returns jsonb language sql as $$
  select public.mark_unrecorded_absent('c5555555-5555-4555-8555-555555555555', current_setting(session_setting)::uuid, revision, key::uuid);
$$;
create function pg_temp.add(session_setting text, record_setting text, revision integer, key text) returns jsonb language sql as $$
  select public.add_session_attendee('c5555555-5555-4555-8555-555555555555', current_setting(session_setting)::uuid,
    current_setting(record_setting)::uuid, revision, key::uuid);
$$;
create function pg_temp.revision(session_setting text) returns integer language sql as $$
  select (public.get_attendance('c5555555-5555-4555-8555-555555555555', current_setting(session_setting)::uuid)->>'revision')::int;
$$;
create function pg_temp.status(session_setting text, record_setting text) returns text language sql as $$
  select coalesce((select status::text from public.attendance_records
    where session_id = current_setting(session_setting)::uuid and annual_student_record_id = current_setting(record_setting)::uuid), 'unknown');
$$;

insert into auth.users (id) values
  ('c1111111-1111-4111-8111-111111111111'),  -- owner of C
  ('c3333333-3333-4333-8333-333333333333'),  -- instructor of C
  ('c4444444-4444-4444-8444-444444444444'),  -- second instructor of C
  ('ca111111-1111-4111-8111-111111111111'),  -- owner of T
  ('c7777777-7777-4777-8777-777777777777');  -- no membership
update public.profiles set full_name = 'Corrections Instructor' where id = 'c3333333-3333-4333-8333-333333333333';

insert into public.academies (id, name, slug, icon, subject, created_by) values
  ('c5555555-5555-4555-8555-555555555555', 'Corrections C', 'corrections-c', 'school', 'Math', 'c1111111-1111-4111-8111-111111111111'),
  ('ca666666-6666-4666-8666-666666666666', 'Corrections T', 'corrections-t', 'school', 'Math', 'ca111111-1111-4111-8111-111111111111');
update public.academic_years set id = 'c5555555-1111-4111-8111-555555555555', start_year = 2030
where academy_id = 'c5555555-5555-4555-8555-555555555555';
update public.academic_years set id = 'ca666666-1111-4111-8111-666666666666', start_year = 2030
where academy_id = 'ca666666-6666-4666-8666-666666666666';
insert into public.academy_memberships (academy_id, user_id, role, created_by) values
  ('c5555555-5555-4555-8555-555555555555', 'c1111111-1111-4111-8111-111111111111', 'owner', 'c1111111-1111-4111-8111-111111111111'),
  ('c5555555-5555-4555-8555-555555555555', 'c3333333-3333-4333-8333-333333333333', 'instructor', 'c1111111-1111-4111-8111-111111111111'),
  ('c5555555-5555-4555-8555-555555555555', 'c4444444-4444-4444-8444-444444444444', 'instructor', 'c1111111-1111-4111-8111-111111111111'),
  ('ca666666-6666-4666-8666-666666666666', 'ca111111-1111-4111-8111-111111111111', 'owner', 'ca111111-1111-4111-8111-111111111111');
insert into public.academy_levels (academy_id, level_id, sort_order) values
  ('c5555555-5555-4555-8555-555555555555', 'preparatory-3', 9),
  ('ca666666-6666-4666-8666-666666666666', 'preparatory-3', 9);
insert into public.groups (id, academy_id, academic_year_id, level_id, track_id, name) values
  ('c5c55555-5555-4555-8555-555555555555', 'c5555555-5555-4555-8555-555555555555', 'c5555555-1111-4111-8111-555555555555', 'preparatory-3', null, 'Nine A'),
  ('c5d55555-5555-4555-8555-555555555555', 'c5555555-5555-4555-8555-555555555555', 'c5555555-1111-4111-8111-555555555555', 'preparatory-3', null, 'Big'),
  ('cac66666-6666-4666-8666-666666666666', 'ca666666-6666-4666-8666-666666666666', 'ca666666-1111-4111-8111-666666666666', 'preparatory-3', null, 'T Nine');
grant usage on schema public, auth to authenticated, anon;

-- ---------------------------------------------------------------------------------------------
-- Setup as the owner of C: Nine A has five in-person students, one online-only student (not in the
-- start snapshot) and one archived student; Big has 1,001 students. Mandatory and optional schedules.
set local role authenticated;
set local request.jwt.claim.sub = 'c1111111-1111-4111-8111-111111111111';
select set_config('test.a' || n, id::text, true) from (
  select n, (public.create_student_record('c5555555-5555-4555-8555-555555555555', 'c5555555-1111-4111-8111-555555555555', name,
    '0100000000' || n, '01100000000', 'preparatory-3', null, 'c5c55555-5555-4555-8555-555555555555', 'in_person')).id
  from (values (1, 'Amal'), (2, 'Aya'), (3, 'Adam'), (4, 'Alia'), (5, 'Ali')) as v (n, name)
) made;
select set_config('test.online', id::text, true) from public.create_student_record('c5555555-5555-4555-8555-555555555555',
  'c5555555-1111-4111-8111-555555555555', 'Omar Online', '01000000006', '01100000000', 'preparatory-3', null,
  'c5c55555-5555-4555-8555-555555555555', 'online_only');
select set_config('test.gone', id::text, true) from public.create_student_record('c5555555-5555-4555-8555-555555555555',
  'c5555555-1111-4111-8111-555555555555', 'Gina Gone', '01000000007', '01100000000', 'preparatory-3', null,
  'c5c55555-5555-4555-8555-555555555555', 'online_only');
do $$ begin
  for n in 1..1001 loop
    perform public.create_student_record('c5555555-5555-4555-8555-555555555555', 'c5555555-1111-4111-8111-555555555555',
      'Big ' || lpad(n::text, 4, '0'), '0109' || lpad(n::text, 7, '0'), '01100000000', 'preparatory-3', null,
      'c5d55555-5555-4555-8555-555555555555', 'in_person');
  end loop;
end $$;
select set_config('test.weekly', public.create_schedule('c5555555-5555-4555-8555-555555555555', 'c5555555-1111-4111-8111-555555555555',
  'Nine A weekly', 'recurring', 'group', 'c5c55555-5555-4555-8555-555555555555', null, null, true, 'Room 1',
  '[{"weekday":1,"startsAt":"17:00","endsAt":"18:30"}]', '[]')::text, true);
select set_config('test.big', public.create_schedule('c5555555-5555-4555-8555-555555555555', 'c5555555-1111-4111-8111-555555555555',
  'Big weekly', 'recurring', 'group', 'c5d55555-5555-4555-8555-555555555555', null, null, true, 'Hall',
  '[{"weekday":2,"startsAt":"17:00","endsAt":"18:30"}]', '[]')::text, true);
select set_config('test.optional', public.create_schedule('c5555555-5555-4555-8555-555555555555', 'c5555555-1111-4111-8111-555555555555',
  'Nine A review', 'recurring', 'group', 'c5c55555-5555-4555-8555-555555555555', null, null, false, 'Room 2',
  '[{"weekday":3,"startsAt":"17:00","endsAt":"18:30"}]', '[]')::text, true);
select set_config('test.s1', session_id::text, true) from public.start_session(
  'c5555555-5555-4555-8555-555555555555', current_setting('test.weekly')::uuid, 'cccccccc-1000-4000-8000-000000000001');
select set_config('test.s2', session_id::text, true) from public.start_session(
  'c5555555-5555-4555-8555-555555555555', current_setting('test.big')::uuid, 'cccccccc-1000-4000-8000-000000000002');
select set_config('test.s3', session_id::text, true) from public.start_session(
  'c5555555-5555-4555-8555-555555555555', current_setting('test.optional')::uuid, 'cccccccc-1000-4000-8000-000000000003');
set local request.jwt.claim.sub = 'ca111111-1111-4111-8111-111111111111';
select set_config('test.t1', id::text, true) from public.create_student_record('ca666666-6666-4666-8666-666666666666',
  'ca666666-1111-4111-8111-666666666666', 'Tarek', '01000000099', '01100000000', 'preparatory-3', null,
  'cac66666-6666-4666-8666-666666666666', 'in_person');
reset role;

-- Nine A started 30 minutes ago (the snapshot columns are immutable to every application path).
set local session_replication_role = replica;
update public.sessions set started_at = started_at - interval '30 minutes' where id = current_setting('test.s1')::uuid;
set local session_replication_role = origin;
update public.annual_student_records set archived_at = now() where id = current_setting('test.gone')::uuid;

set local role authenticated;
set local request.jwt.claim.sub = 'c3333333-3333-4333-8333-333333333333';

-- ---------------------------------------------------------------------------------------------
-- 1. Atomic Late: one write, one version, one revision, one receipt, one acceptance instant.
do $$
declare result jsonb; rec public.attendance_records%rowtype;
begin
  result := pg_temp.late_in('test.s1', 'test.a1', 'cccccccc-2000-4000-8000-000000000001', 29);
  select * into rec from public.attendance_records where session_id = current_setting('test.s1')::uuid
    and annual_student_record_id = current_setting('test.a1')::uuid;
  if result->>'outcome' <> 'recorded' or result->'entry'->>'status' <> 'late' or (result->'entry'->>'version')::int <> 1
    or (result->>'revision')::int <> 1 or (result->>'replayed')::boolean
    or rec.status <> 'late' or rec.version <> 1 or rec.source <> 'check_in' or rec.checked_in_at <> rec.updated_at
    or (result->'entry'->>'checked_in_at')::timestamptz <> rec.checked_in_at then
    raise exception 'Late check-in is not one atomic write: % / %', result, rec;
  end if;
  -- Before the deadline, and with Late disabled (0 or null), a check-in is Present.
  result := pg_temp.late_in('test.s1', 'test.a2', 'cccccccc-2000-4000-8000-000000000002', 31);
  if result->'entry'->>'status' <> 'present' or (result->>'revision')::int <> 2 then raise exception 'Early check-in is wrong: %', result; end if;
  result := pg_temp.late_in('test.s1', 'test.a3', 'cccccccc-2000-4000-8000-000000000003', 0);
  if result->'entry'->>'status' <> 'present' then raise exception 'Late-after 0 marked Late: %', result; end if;
  result := pg_temp.late_in('test.s1', 'test.a5', 'cccccccc-2000-4000-8000-000000000005', null);
  if result->'entry'->>'status' <> 'present' then raise exception 'Omitted Late-after marked Late: %', result; end if;

  -- The same key and payload replays the stored acknowledgment, even after a later correction.
  perform public.apply_attendance_changes('c5555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid,
    jsonb_build_array(jsonb_build_object('annual_student_record_id', current_setting('test.a1'), 'status', 'present', 'expected_version', 1)),
    'set', 'cccccccc-2000-4000-8000-0000000000f1');
  result := pg_temp.late_in('test.s1', 'test.a1', 'cccccccc-2000-4000-8000-000000000001', 29);
  if not (result->>'replayed')::boolean or result->'entry'->>'status' <> 'late' or (result->>'revision')::int <> 1
    or pg_temp.status('test.s1', 'test.a1') <> 'present' then
    raise exception 'Replay did not return the original acknowledgment unchanged: %', result;
  end if;
  -- A repeated check-in keeps the first check-in time and status.
  result := pg_temp.late_in('test.s1', 'test.a1', 'cccccccc-2000-4000-8000-000000000011', 29);
  if result->>'outcome' <> 'already_recorded' or (result->'entry'->>'checked_in_at')::timestamptz <> rec.checked_in_at then
    raise exception 'Repeated check-in moved the first check-in: %', result;
  end if;
end $$;
-- A new-format key binds the threshold and the identifier.
select pg_temp.expect_error($s$ select pg_temp.late_in('test.s1', 'test.a1', 'cccccccc-2000-4000-8000-000000000001', 5) $s$, 'idempotency_conflict');
select pg_temp.expect_error($s$ select pg_temp.late_in('test.s1', 'test.a1', 'cccccccc-2000-4000-8000-000000000001', 0) $s$, 'idempotency_conflict');
select pg_temp.expect_error($s$ select pg_temp.late_in('test.s1', 'test.a4', 'cccccccc-2000-4000-8000-000000000001', 29) $s$, 'idempotency_conflict');
select pg_temp.expect_error($s$ select pg_temp.late_in('test.s1', 'test.a4', 'cccccccc-2000-4000-8000-0000000000e1', 1441) $s$, 'validation');
select pg_temp.expect_error($s$ select pg_temp.late_in('test.s1', 'test.a4', 'cccccccc-2000-4000-8000-0000000000e1', -1) $s$, 'validation');
select pg_temp.expect_error($s$ select pg_temp.late_in('test.s1', 'test.t1', 'cccccccc-2000-4000-8000-0000000000e2', 0) $s$, 'student_not_found');

-- Legacy: a receipt stored by the four-argument command replays unchanged through the new RPC, never
-- applying Late retroactively; the four-argument command itself never marks Late.
do $$
declare legacy jsonb; replay jsonb;
begin
  legacy := public.check_in_attendance('c5555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid,
    current_setting('test.a4')::uuid, 'cccccccc-2000-4000-8000-000000000004');
  if legacy->'entry'->>'status' <> 'present' then raise exception 'Legacy check-in marked Late: %', legacy; end if;
  replay := pg_temp.late_in('test.s1', 'test.a4', 'cccccccc-2000-4000-8000-000000000004', 10);
  if not (replay->>'replayed')::boolean or replay->'entry'->>'status' <> 'present'
    or replay->'entry' <> legacy->'entry' or pg_temp.status('test.s1', 'test.a4') <> 'present' then
    raise exception 'Legacy receipt did not replay unchanged: % / %', replay, legacy;
  end if;
end $$;
-- A legacy key is still bound to its session and record.
select pg_temp.expect_error($s$ select pg_temp.late_in('test.s1', 'test.a2', 'cccccccc-2000-4000-8000-000000000004', 10) $s$, 'idempotency_conflict');

-- Code check-ins apply Late-after in the same transaction.
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'c1111111-1111-4111-8111-111111111111';
select public.save_student_code_settings('c5555555-5555-4555-8555-555555555555', 0, true, '####', '[]');
select public.change_student_code('c5555555-5555-4555-8555-555555555555', current_setting('test.online')::uuid, 'assign', '0042', 0, gen_random_uuid());
set local request.jwt.claim.sub = 'c3333333-3333-4333-8333-333333333333';

-- ---------------------------------------------------------------------------------------------
-- 2. Unexpected attendees.

-- Candidates: active same-year records not on the roster; by name or exact current code; bounded.
do $$
declare hits jsonb;
begin
  hits := public.search_attendee_candidates('c5555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid, 'omar', 10, 0);
  if jsonb_array_length(hits->'items') <> 1 or hits->'items'->0->>'annual_student_record_id' <> current_setting('test.online')
    or hits->'items'->0->>'student_code' <> '0042' or hits->'items'->0->>'participation_type' <> 'online_only'
    or (hits->>'has_more')::boolean then
    raise exception 'Name search is wrong: %', hits;
  end if;
  hits := public.search_attendee_candidates('c5555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid, ' 0042 ', 10, 0);
  if jsonb_array_length(hits->'items') <> 1 then raise exception 'Code search is wrong: %', hits; end if;
  -- Roster students, archived records and other academies never appear.
  hits := public.search_attendee_candidates('c5555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid, 'a', 50, 0);
  if exists (select 1 from jsonb_array_elements(hits->'items') e
      where e->>'annual_student_record_id' in (current_setting('test.a1'), current_setting('test.gone'), current_setting('test.t1'))) then
    raise exception 'Search returned an ineligible student: %', hits;
  end if;
  hits := public.search_attendee_candidates('c5555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid, 'Big', 2, 0);
  if jsonb_array_length(hits->'items') <> 2 or not (hits->>'has_more')::boolean
    or hits->'items'->0->>'full_name' <> 'Big 0001' then
    raise exception 'Paging is wrong: %', hits;
  end if;
  hits := public.search_attendee_candidates('c5555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid, '100%', 10, 0);
  if jsonb_array_length(hits->'items') <> 0 then raise exception 'Wildcards were not escaped: %', hits; end if;
end $$;
select pg_temp.expect_error($s$ select public.search_attendee_candidates('c5555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid, null, 51, 0) $s$, 'validation');
select pg_temp.expect_error($s$ select public.search_attendee_candidates('ca666666-6666-4666-8666-666666666666', current_setting('test.s1')::uuid, null, 10, 0) $s$, 'forbidden');

-- Append: unexpected origin, the record's own placement, a revision bump; the record is unchanged.
do $$
declare before integer := pg_temp.revision('test.s1'); result jsonb; again jsonb; record_before jsonb;
begin
  select to_jsonb(r) into record_before from public.annual_student_records r where r.id = current_setting('test.online')::uuid;
  -- A stale reviewed revision writes nothing.
  result := pg_temp.add('test.s1', 'test.online', before - 1, 'cccccccc-3000-4000-8000-000000000009');
  if result->>'outcome' <> 'stale' or (result->>'revision')::int <> before
    or exists (select 1 from public.session_roster_entries where session_id = current_setting('test.s1')::uuid
      and annual_student_record_id = current_setting('test.online')::uuid) then
    raise exception 'Stale add wrote: %', result;
  end if;
  result := pg_temp.add('test.s1', 'test.online', before, 'cccccccc-3000-4000-8000-000000000001');
  if result->>'outcome' <> 'added' or result->'entry'->>'origin' <> 'unexpected' or result->'entry'->>'status' <> 'unknown'
    or (result->>'revision')::int <> before + 1 or (result->>'replayed')::boolean then
    raise exception 'Add is wrong: %', result;
  end if;
  if not exists (select 1 from public.session_roster_entries en join public.annual_student_records r on r.id = en.annual_student_record_id
      where en.session_id = current_setting('test.s1')::uuid and en.annual_student_record_id = r.id and r.id = current_setting('test.online')::uuid
        and en.level_id = r.level_id and en.primary_group_id is not distinct from r.primary_group_id
        and en.participation_type = 'online_only' and en.added_by = 'c3333333-3333-4333-8333-333333333333'
        and en.added_by_name = 'Corrections Instructor')
    or (select to_jsonb(r) from public.annual_student_records r where r.id = current_setting('test.online')::uuid) <> record_before
    or (select count(*) from public.session_roster_entries where session_id = current_setting('test.s1')::uuid and origin = 'expected') <> 5 then
    raise exception 'Appended snapshot or original roster is wrong';
  end if;
  -- Replay, and a fresh duplicate add, change nothing.
  again := pg_temp.add('test.s1', 'test.online', before, 'cccccccc-3000-4000-8000-000000000001');
  if not (again->>'replayed')::boolean or again->>'outcome' <> 'added' then raise exception 'Add replay is wrong: %', again; end if;
  set local request.jwt.claim.sub = 'c4444444-4444-4444-8444-444444444444';
  again := pg_temp.add('test.s1', 'test.online', before + 1, 'cccccccc-3000-4000-8000-000000000002');
  if again->>'outcome' <> 'already_on_roster' or again->'entry'->>'origin' <> 'unexpected' or (again->>'revision')::int <> before + 1 then
    raise exception 'Duplicate add is wrong: %', again;
  end if;
  again := pg_temp.add('test.s1', 'test.a1', 0, 'cccccccc-3000-4000-8000-000000000003');
  if again->>'outcome' <> 'already_on_roster' or again->'entry'->>'origin' <> 'expected' then raise exception 'Roster student add is wrong: %', again; end if;
  set local request.jwt.claim.sub = 'c3333333-3333-4333-8333-333333333333';
  -- The appended student can be checked in by code while live, with Late applied atomically.
  result := public.check_in_attendance_by_code('c5555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid, '0042',
    'cccccccc-3000-4000-8000-000000000004', 20);
  if result->>'outcome' <> 'recorded' or result->'entry'->>'status' <> 'late' or (result->'entry'->>'version')::int <> 1 then
    raise exception 'Code Late check-in is wrong: %', result;
  end if;
  result := public.check_in_attendance_by_code('c5555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid, '0042',
    'cccccccc-3000-4000-8000-000000000004', 20);
  if not (result->>'replayed')::boolean or result->'entry'->>'status' <> 'late' then raise exception 'Code replay is wrong: %', result; end if;
end $$;
select pg_temp.expect_error($s$ select pg_temp.add('test.s1', 'test.gone', pg_temp.revision('test.s1'), 'cccccccc-3000-4000-8000-000000000005') $s$, 'student_archived');
select pg_temp.expect_error($s$ select pg_temp.add('test.s1', 'test.t1', pg_temp.revision('test.s1'), 'cccccccc-3000-4000-8000-000000000006') $s$, 'student_not_found');
select pg_temp.expect_error($s$ select pg_temp.add('test.s1', 'test.a2', 0, 'cccccccc-3000-4000-8000-000000000001') $s$, 'idempotency_conflict');
set local request.jwt.claim.sub = 'c7777777-7777-4777-8777-777777777777';
select pg_temp.expect_error($s$ select pg_temp.add('test.s1', 'test.a2', 0, 'cccccccc-3000-4000-8000-000000000007') $s$, 'forbidden');
set local request.jwt.claim.sub = 'c3333333-3333-4333-8333-333333333333';

-- ---------------------------------------------------------------------------------------------
-- 3. All remaining expected absences, above the explicit 500-row batch.

-- The explicit batch stays capped: 501 changes are rejected with nothing written.
select pg_temp.expect_error($s$
  select public.apply_attendance_changes('c5555555-5555-4555-8555-555555555555', current_setting('test.s2')::uuid,
    (select jsonb_agg(jsonb_build_object('annual_student_record_id', en.annual_student_record_id, 'status', 'absent', 'expected_version', 0))
     from (select annual_student_record_id from public.session_roster_entries where session_id = current_setting('test.s2')::uuid limit 501) en),
    'bulk', 'cccccccc-4000-4000-8000-000000000001')
$s$, 'validation');

do $$
declare
  first_big uuid := (select en.annual_student_record_id from public.session_roster_entries en join public.annual_student_records r on r.id = en.annual_student_record_id
    where en.session_id = current_setting('test.s2')::uuid order by r.full_name limit 1);
  second_big uuid := (select en.annual_student_record_id from public.session_roster_entries en join public.annual_student_records r on r.id = en.annual_student_record_id
    where en.session_id = current_setting('test.s2')::uuid order by r.full_name offset 1 limit 1);
  result jsonb;
  reviewed integer;
begin
  if (select count(*) from public.attendance_records where session_id = current_setting('test.s2')::uuid) <> 0 then
    raise exception 'The rejected explicit batch wrote rows';
  end if;
  perform public.check_in_attendance_with_late('c5555555-5555-4555-8555-555555555555', current_setting('test.s2')::uuid, first_big,
    'cccccccc-4000-4000-8000-000000000002', 0);
  perform public.apply_attendance_changes('c5555555-5555-4555-8555-555555555555', current_setting('test.s2')::uuid,
    jsonb_build_array(jsonb_build_object('annual_student_record_id', second_big, 'status', 'excused', 'expected_version', 0)),
    'set', 'cccccccc-4000-4000-8000-000000000003');
  perform pg_temp.add('test.s2', 'test.a1', pg_temp.revision('test.s2'), 'cccccccc-4000-4000-8000-000000000004');
  reviewed := pg_temp.revision('test.s2');

  -- A stale review changes nothing and is not stored.
  result := pg_temp.absent_rest('test.s2', reviewed - 1, 'cccccccc-4000-4000-8000-000000000005');
  if result->>'outcome' <> 'stale' or (result->>'revision')::int <> reviewed
    or exists (select 1 from public.attendance_records where session_id = current_setting('test.s2')::uuid and status = 'absent') then
    raise exception 'Stale absence command wrote: %', result;
  end if;

  result := pg_temp.absent_rest('test.s2', reviewed, 'cccccccc-4000-4000-8000-000000000006');
  if result->>'outcome' <> 'updated' or (result->>'changed')::int <> 999 or (result->>'revision')::int <> reviewed + 1
    or (select count(*) from public.attendance_records where session_id = current_setting('test.s2')::uuid and status = 'absent') <> 999
    or exists (select 1 from public.attendance_records where session_id = current_setting('test.s2')::uuid and status = 'absent' and (version <> 1 or source <> 'bulk')) then
    raise exception 'All-remaining absence is wrong: %', result;
  end if;
  if pg_temp.status('test.s2', 'test.a1') <> 'unknown'
    or (select status from public.attendance_records where session_id = current_setting('test.s2')::uuid and annual_student_record_id = first_big) <> 'present'
    or (select status from public.attendance_records where session_id = current_setting('test.s2')::uuid and annual_student_record_id = second_big) <> 'excused' then
    raise exception 'All-remaining absence touched a recorded or unexpected student';
  end if;

  -- Replay repeats nothing; a fresh command with nothing left is unchanged.
  result := pg_temp.absent_rest('test.s2', reviewed, 'cccccccc-4000-4000-8000-000000000006');
  if not (result->>'replayed')::boolean or (result->>'changed')::int <> 999 or pg_temp.revision('test.s2') <> reviewed + 1 then
    raise exception 'Absence replay is wrong: %', result;
  end if;
  result := pg_temp.absent_rest('test.s2', reviewed + 1, 'cccccccc-4000-4000-8000-000000000007');
  if result->>'outcome' <> 'unchanged' or (result->>'changed')::int <> 0 or pg_temp.revision('test.s2') <> reviewed + 1 then
    raise exception 'Empty absence command is wrong: %', result;
  end if;
end $$;
select pg_temp.expect_error($s$ select pg_temp.absent_rest('test.s2', 0, 'cccccccc-4000-4000-8000-000000000006') $s$, 'idempotency_conflict');
-- Optional sessions have no expected students to mark absent.
select pg_temp.expect_error($s$ select pg_temp.absent_rest('test.s3', 0, 'cccccccc-4000-4000-8000-000000000008') $s$, 'validation');
select pg_temp.expect_error($s$ select public.mark_unrecorded_absent('ca666666-6666-4666-8666-666666666666', current_setting('test.s2')::uuid, 0, 'cccccccc-4000-4000-8000-000000000009') $s$, 'forbidden');

-- ---------------------------------------------------------------------------------------------
-- 4. Ended sessions accept roster review (append, absence) but no check-in; finalized history stays
--    official; an unexpected Absent creates no expected-absence effect.
do $$
declare result jsonb; published integer;
begin
  set local request.jwt.claim.sub = 'c1111111-1111-4111-8111-111111111111';
  perform public.end_session('c5555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid);
  set local request.jwt.claim.sub = 'c3333333-3333-4333-8333-333333333333';
  published := pg_temp.revision('test.s1');
  perform public.publish_attendance('c5555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid, published,
    'cccccccc-5000-4000-8000-000000000001');
  result := public.search_attendee_candidates('c5555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid, 'Big 0001', 1, 0);
  perform set_config('test.big1', result->'items'->0->>'annual_student_record_id', true);
  result := pg_temp.add('test.s1', 'test.big1', published, 'cccccccc-5000-4000-8000-000000000002');
  if result->>'outcome' <> 'added' then raise exception 'Add to an ended session is wrong: %', result; end if;
  if (select published_revision from public.attendance_sheets where session_id = current_setting('test.s1')::uuid) <> published then
    raise exception 'Append rewrote the finalized revision';
  end if;
  result := public.apply_attendance_changes('c5555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid,
    jsonb_build_array(jsonb_build_object('annual_student_record_id', current_setting('test.big1'), 'status', 'absent', 'expected_version', 0)),
    'set', 'cccccccc-5000-4000-8000-000000000003');
  perform public.publish_attendance('c5555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid, (result->>'revision')::int,
    'cccccccc-5000-4000-8000-000000000004');
end $$;
select pg_temp.expect_error($s$ select pg_temp.late_in('test.s1', 'test.big1', 'cccccccc-5000-4000-8000-000000000005', 0) $s$, 'session_ended');
reset role;
do $$ begin
  if exists (select 1 from public.attendance_effects where session_id = current_setting('test.s1')::uuid
      and annual_student_record_id = current_setting('test.big1')::uuid and effect_type = 'absence_event') then
    raise exception 'An unexpected attendee created an expected-absence effect';
  end if;
  if (select count(*) from public.attendance_requests where actor_id = 'c3333333-3333-4333-8333-333333333333'
      and operation in ('unrecorded_absent', 'add_attendee')) < 4 then
    raise exception 'Correction receipts were not stored';
  end if;
end $$;

-- Archived sessions reject appends and absences, while stored receipts still replay.
set local role authenticated;
set local request.jwt.claim.sub = 'c1111111-1111-4111-8111-111111111111';
select public.archive_session('c5555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid,
  (select metadata_version from public.sessions where id = current_setting('test.s1')::uuid), 'cccccccc-6000-4000-8000-000000000001');
set local request.jwt.claim.sub = 'c3333333-3333-4333-8333-333333333333';
select pg_temp.expect_error($s$ select pg_temp.add('test.s1', 'test.a2', pg_temp.revision('test.s1'), 'cccccccc-6000-4000-8000-000000000002') $s$, 'session_archived');
select pg_temp.expect_error($s$ select pg_temp.absent_rest('test.s1', pg_temp.revision('test.s1'), 'cccccccc-6000-4000-8000-000000000003') $s$, 'session_archived');
do $$ declare result jsonb; begin
  result := pg_temp.late_in('test.s1', 'test.a1', 'cccccccc-2000-4000-8000-000000000001', 29);
  if not (result->>'replayed')::boolean then raise exception 'Receipt did not replay after archival: %', result; end if;
end $$;

rollback;
