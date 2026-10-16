-- Student code check-in: permanent reservation, historical ambiguity, lifecycle retirement, receipt
-- replay, authority/tenant isolation, quota charging, and lock-safe revalidation.
-- Run with `npm run test:db` against the marked isolated test target (see docs/engineering.md).
-- Everything runs in one transaction that is rolled back.
-- Concurrent races (scan vs retirement, two scanners, disable) live in concurrency.sh.

do $$ begin
  if not has_function_privilege('authenticated', 'public.check_in_attendance_by_code(uuid, uuid, text, uuid, integer)', 'execute')
    or has_function_privilege('anon', 'public.check_in_attendance_by_code(uuid, uuid, text, uuid, integer)', 'execute')
    or has_function_privilege('authenticated', 'edra_private.check_in_attendance_by_code(uuid, uuid, text, uuid, integer)', 'execute')
    or has_function_privilege('authenticated', 'edra_private.apply_check_in(public.sessions, uuid, uuid, text)', 'execute')
    or has_table_privilege('authenticated', 'public.student_code_reservations', 'select')
    or has_function_privilege('authenticated', 'public.reserve_student_code()', 'execute') then
    raise exception 'Student code check-in grants are wrong';
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

create function pg_temp.scan(code text, key text, late integer default null) returns jsonb language sql as $$
  select public.check_in_attendance_by_code('d5555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid, code, key::uuid, late);
$$;
create function pg_temp.assign(record_setting text, action text, code text, version integer) returns jsonb language sql as $$
  select public.change_student_code('d5555555-5555-4555-8555-555555555555', current_setting(record_setting)::uuid, action, code, version, gen_random_uuid());
$$;

insert into auth.users (id) values
  ('d1111111-1111-4111-8111-111111111111'),  -- owner of S
  ('d3333333-3333-4333-8333-333333333333'),  -- instructor of S
  ('d4444444-4444-4444-8444-444444444444'),  -- second instructor of S
  ('e1111111-1111-4111-8111-111111111111'),  -- owner of T
  ('f1111111-1111-4111-8111-111111111111');  -- no membership
insert into public.academies (id, name, slug, icon, subject, created_by) values
  ('d5555555-5555-4555-8555-555555555555', 'Scan S', 'scan-s', 'school', 'Math', 'd1111111-1111-4111-8111-111111111111'),
  ('e6666666-6666-4666-8666-666666666666', 'Scan T', 'scan-t', 'school', 'Math', 'e1111111-1111-4111-8111-111111111111');
update public.academic_years set id = 'd5555555-1111-4111-8111-555555555555', start_year = 2030 where academy_id = 'd5555555-5555-4555-8555-555555555555';
update public.academic_years set id = 'e6666666-1111-4111-8111-666666666666', start_year = 2030 where academy_id = 'e6666666-6666-4666-8666-666666666666';
insert into public.academy_memberships (academy_id, user_id, role, created_by) values
  ('d5555555-5555-4555-8555-555555555555', 'd1111111-1111-4111-8111-111111111111', 'owner', 'd1111111-1111-4111-8111-111111111111'),
  ('d5555555-5555-4555-8555-555555555555', 'd3333333-3333-4333-8333-333333333333', 'instructor', 'd1111111-1111-4111-8111-111111111111'),
  ('d5555555-5555-4555-8555-555555555555', 'd4444444-4444-4444-8444-444444444444', 'instructor', 'd1111111-1111-4111-8111-111111111111'),
  ('e6666666-6666-4666-8666-666666666666', 'e1111111-1111-4111-8111-111111111111', 'owner', 'e1111111-1111-4111-8111-111111111111');
insert into public.academy_levels (academy_id, level_id, sort_order) values
  ('d5555555-5555-4555-8555-555555555555', 'preparatory-3', 9),
  ('d5555555-5555-4555-8555-555555555555', 'secondary-1', 10),
  ('e6666666-6666-4666-8666-666666666666', 'preparatory-3', 9);
insert into public.groups (id, academy_id, academic_year_id, level_id, track_id, name) values
  ('d5c55555-5555-4555-8555-555555555555', 'd5555555-5555-4555-8555-555555555555', 'd5555555-1111-4111-8111-555555555555', 'preparatory-3', null, 'Nine A'),
  ('e6c66666-6666-4666-8666-666666666666', 'e6666666-6666-4666-8666-666666666666', 'e6666666-1111-4111-8111-666666666666', 'preparatory-3', null, 'T Nine');
grant usage on schema public, auth to authenticated, anon;

-- Setup as the owner: five Nine A students and a live session; one student in academy T.
set local role authenticated;
set local request.jwt.claim.sub = 'd1111111-1111-4111-8111-111111111111';
select set_config('test.a' || n, id::text, true) from (
  select n, (public.create_student_record('d5555555-5555-4555-8555-555555555555', 'd5555555-1111-4111-8111-555555555555', name,
    '0100000000' || n, '01100000000', 'preparatory-3', null, 'd5c55555-5555-4555-8555-555555555555', 'in_person')).id
  from (values (1, 'Amal'), (2, 'Aya'), (3, 'Adam'), (4, 'Alia'), (5, 'Ali')) as v (n, name)
) made;
select set_config('test.weekly', public.create_schedule('d5555555-5555-4555-8555-555555555555', 'd5555555-1111-4111-8111-555555555555',
  'Nine A weekly', 'recurring', 'group', 'd5c55555-5555-4555-8555-555555555555', null, null, true, 'Room 1',
  '[{"weekday":1,"startsAt":"17:00","endsAt":"18:30"}]', '[]')::text, true);
select set_config('test.s1', session_id::text, true) from public.start_session(
  'd5555555-5555-4555-8555-555555555555', current_setting('test.weekly')::uuid, 'dddddddd-0000-4000-8000-000000000001');
set local request.jwt.claim.sub = 'e1111111-1111-4111-8111-111111111111';
select set_config('test.t1', id::text, true) from public.create_student_record('e6666666-6666-4666-8666-666666666666',
  'e6666666-1111-4111-8111-666666666666', 'Tarek', '01000000099', '01100000000', 'preparatory-3', null, 'e6c66666-6666-4666-8666-666666666666', 'in_person');

-- Codes are off until enabled; a missing settings row means disabled. No formula edit is needed to scan.
set local request.jwt.claim.sub = 'd3333333-3333-4333-8333-333333333333';
select pg_temp.expect_error($s$ select pg_temp.scan('0007', 'dddddddd-0000-4000-8000-0000000000a1') $s$, 'student_codes_disabled');
set local request.jwt.claim.sub = 'd1111111-1111-4111-8111-111111111111';
select public.save_student_code_settings('d5555555-5555-4555-8555-555555555555', 0, true, '####', '[]');
set local request.jwt.claim.sub = 'e1111111-1111-4111-8111-111111111111';
select public.save_student_code_settings('e6666666-6666-4666-8666-666666666666', 0, true, '####', '[]');
select public.change_student_code('e6666666-6666-4666-8666-666666666666', current_setting('test.t1')::uuid, 'assign', '0007', 0, gen_random_uuid());
set local request.jwt.claim.sub = 'd3333333-3333-4333-8333-333333333333';
select pg_temp.assign('test.a1', 'assign', '0007', 0);   -- same string as academy T's student
select pg_temp.assign('test.a2', 'assign', '0012', 0);  -- a1 and a2: issued before the formula edit below
select pg_temp.assign('test.a4', 'assign', '0004', 0);

-- Input grammar is enforced by the database like the API.
select pg_temp.expect_error($s$ select pg_temp.scan('00 07', 'dddddddd-0000-4000-8000-0000000000a2') $s$, 'validation');
select pg_temp.expect_error($s$ select pg_temp.scan('', 'dddddddd-0000-4000-8000-0000000000a3') $s$, 'validation');
select pg_temp.expect_error($s$ select pg_temp.scan(null, 'dddddddd-0000-4000-8000-0000000000a3') $s$, 'validation');
select pg_temp.expect_error($s$ select pg_temp.scan('ÀB12', 'dddddddd-0000-4000-8000-0000000000a3') $s$, 'validation');
select pg_temp.expect_error($s$ select pg_temp.scan(repeat('A', 21), 'dddddddd-0000-4000-8000-0000000000a3') $s$, 'validation');
select pg_temp.expect_error($s$ select pg_temp.scan('0007', 'dddddddd-0000-4000-8000-0000000000a3', 1441) $s$, 'validation');
select pg_temp.expect_error($s$ select pg_temp.scan('0007', 'dddddddd-0000-4000-8000-0000000000a3', -1) $s$, 'validation');
select pg_temp.expect_error($s$ select pg_temp.scan('9999', 'dddddddd-0000-4000-8000-0000000000a3') $s$, 'student_code_not_found');

-- Quota: one call charges the check-in bucket exactly once.
reset role;
select set_config('test.hits0', coalesce((select sum(hits) from public.api_rate_windows where actor_id = 'd3333333-3333-4333-8333-333333333333' and bucket = 'op:attendance_check_in'), 0)::text, true);
set local role authenticated;
set local request.jwt.claim.sub = 'd3333333-3333-4333-8333-333333333333';

-- Scan: leading zeroes preserved and padding trimmed; the same string in two academies resolves locally.
do $$ declare first jsonb; again jsonb; replay jsonb; begin
  first := pg_temp.scan(' 0007 ', 'dddddddd-0000-4000-8000-0000000000b1');
  if first->>'outcome' <> 'recorded' or first->'entry'->>'annual_student_record_id' <> current_setting('test.a1')
    or first->'entry'->>'status' <> 'present' or (first->>'replayed')::boolean then
    raise exception 'Code check-in is wrong: %', first;
  end if;
  replay := pg_temp.scan('0007', 'dddddddd-0000-4000-8000-0000000000b1');
  if replay->>'outcome' <> 'recorded' or not (replay->>'replayed')::boolean then raise exception 'Replay failed: %', replay; end if;
  set local request.jwt.claim.sub = 'd4444444-4444-4444-8444-444444444444';
  again := pg_temp.scan('0007', 'dddddddd-0000-4000-8000-0000000000b2');
  if again->>'outcome' <> 'already_recorded' or (again->'entry'->>'version')::int <> 1 then raise exception 'Second scan changed attendance: %', again; end if;
  set local request.jwt.claim.sub = 'd3333333-3333-4333-8333-333333333333';
  if (select count(*) from public.attendance_records where session_id = current_setting('test.s1')::uuid) <> 1
    or exists (select 1 from public.attendance_publications) then
    raise exception 'Only the scanned student may have a draft record, and nothing may be published';
  end if;
end $$;
-- The same key with another identifier type, code, or Late-after conflicts.
select pg_temp.expect_error($s$ select pg_temp.scan('0007', 'dddddddd-0000-4000-8000-0000000000b1', 5) $s$, 'idempotency_conflict');
select pg_temp.expect_error($s$ select pg_temp.scan('0012', 'dddddddd-0000-4000-8000-0000000000b1') $s$, 'idempotency_conflict');
select pg_temp.expect_error($s$ select public.check_in_attendance('d5555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid, current_setting('test.a1')::uuid, 'dddddddd-0000-4000-8000-0000000000b1') $s$, 'idempotency_conflict');
-- Omitted and 0 Late-after are equivalent.
select pg_temp.scan('0012', 'dddddddd-0000-4000-8000-0000000000b3', 0);
do $$ begin
  if not (pg_temp.scan('0012', 'dddddddd-0000-4000-8000-0000000000b3')->>'replayed')::boolean then raise exception 'Omitted and 0 must share a fingerprint'; end if;
end $$;

-- Absent students need review: nothing changes and no receipt is kept.
do $$ begin
  perform public.apply_attendance_changes('d5555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid,
    jsonb_build_array(jsonb_build_object('annual_student_record_id', current_setting('test.a4'), 'status', 'absent', 'expected_version', 0)),
    'set', 'dddddddd-0000-4000-8000-0000000000b4');
end $$;
do $$ declare review jsonb; begin
  review := pg_temp.scan('0004', 'dddddddd-0000-4000-8000-0000000000b5');
  if review->>'outcome' <> 'review_required' or review->'entry'->>'status' <> 'absent' then raise exception 'Review expected: %', review; end if;
end $$;
reset role;
do $$ begin
  if exists (select 1 from public.attendance_requests where idempotency_key = 'dddddddd-0000-4000-8000-0000000000b5')
    or (select resolved->>'annual_student_record_id' from public.attendance_requests where idempotency_key = 'dddddddd-0000-4000-8000-0000000000b1') <> current_setting('test.a1')
    or (select resolved->>'assignment_id' from public.attendance_requests where idempotency_key = 'dddddddd-0000-4000-8000-0000000000b1') is null then
    raise exception 'Receipts must exist only for successes and carry the resolved identity';
  end if;
  -- Quota: initial scan, replay, second instructor's scan are charged once each; failures roll back.
  -- Calls above by instructor d333: scan b1, replay b1, conflicts (rolled back), b3 twice, review b5, errors.
  if (select coalesce(sum(hits), 0) from public.api_rate_windows where actor_id = 'd3333333-3333-4333-8333-333333333333' and bucket = 'op:attendance_check_in')
     - current_setting('test.hits0')::int <> 5 then
    raise exception 'Unexpected quota charge: %', (select sum(hits) from public.api_rate_windows where actor_id = 'd3333333-3333-4333-8333-333333333333' and bucket = 'op:attendance_check_in');
  end if;
end $$;

-- Authority and tenant isolation.
set local role authenticated;
set local request.jwt.claim.sub = 'f1111111-1111-4111-8111-111111111111';
select pg_temp.expect_error($s$ select pg_temp.scan('0007', gen_random_uuid()::text) $s$, 'forbidden');
set local request.jwt.claim.sub = 'e1111111-1111-4111-8111-111111111111';
select pg_temp.expect_error($s$ select pg_temp.scan('0007', gen_random_uuid()::text) $s$, 'forbidden');
select pg_temp.expect_error($s$ select public.check_in_attendance_by_code('e6666666-6666-4666-8666-666666666666', current_setting('test.s1')::uuid, '0007', gen_random_uuid(), null) $s$, 'not_found');
reset role;
set local role anon;
select pg_temp.expect_error($s$ select pg_temp.scan('0007', gen_random_uuid()::text) $s$, 'permission denied%');
reset role;

-- Retire and replace: fresh scans of the old value fail, the original receipt still replays, the
-- value is reserved for everyone, and the new code works.
set local role authenticated;
set local request.jwt.claim.sub = 'd3333333-3333-4333-8333-333333333333';
select pg_temp.assign('test.a2', 'replace', '0013', 1);
select pg_temp.expect_error($s$ select pg_temp.scan('0012', gen_random_uuid()::text) $s$, 'student_code_retired');
do $$ begin
  if not (pg_temp.scan('0012', 'dddddddd-0000-4000-8000-0000000000b3')->>'replayed')::boolean then raise exception 'Original receipt must replay after replacement'; end if;
  if pg_temp.scan('0013', 'dddddddd-0000-4000-8000-0000000000b6')->'entry'->>'annual_student_record_id' <> current_setting('test.a2') then
    raise exception 'The new code must resolve to the same permanent record';
  end if;
end $$;
select pg_temp.expect_error($s$ select pg_temp.assign('test.a2', 'replace', '0012', 3) $s$, 'code_taken');
select pg_temp.expect_error($s$ select pg_temp.assign('test.a3', 'assign', '0012', 0) $s$, 'code_taken');
select pg_temp.expect_error($s$ select pg_temp.assign('test.a3', 'replace_release', '0014', 0) $s$, 'code_release_removed');
select pg_temp.expect_error($s$ select public.unretire_student_code('d5555555-5555-4555-8555-555555555555', gen_random_uuid()) $s$, 'code_release_removed');

-- Historical ambiguity: simulate a pre-migration `released` row that put one string on two students.
reset role;
set local session_replication_role = replica;
insert into public.student_code_assignments (academy_id, academic_year_id, academy_student_profile_id, annual_student_record_id,
  level_id, code, code_version, issued_by, retired_at, retired_by, retirement_reason)
select r.academy_id, r.academic_year_id, r.academy_student_profile_id, r.id, r.level_id, '0013', 90,
  'd1111111-1111-4111-8111-111111111111', now(), 'd1111111-1111-4111-8111-111111111111', 'released'
from public.annual_student_records r where r.id = current_setting('test.a5')::uuid;
set local session_replication_role = origin;
set local role authenticated;
set local request.jwt.claim.sub = 'd3333333-3333-4333-8333-333333333333';
select pg_temp.expect_error($s$ select pg_temp.scan('0013', gen_random_uuid()::text) $s$, 'student_code_ambiguous');
-- The correction leaves history intact: retire the ambiguous active value and issue a new one.
select pg_temp.assign('test.a2', 'replace', '0015', 3);
select pg_temp.expect_error($s$ select pg_temp.scan('0013', gen_random_uuid()::text) $s$, 'student_code_ambiguous');
select pg_temp.scan('0015', gen_random_uuid()::text);
select pg_temp.expect_error($s$ select pg_temp.assign('test.a3', 'assign', '0013', 0) $s$, 'code_taken');

-- Stale assignments (here: level changed with the lifecycle trigger bypassed) are rejected on scan.
select pg_temp.assign('test.a3', 'assign', '0030', 0);
reset role;
alter table public.annual_student_records disable trigger annual_student_records_retire_code;
update public.annual_student_records set level_id = 'secondary-1', primary_group_id = null where id = current_setting('test.a3')::uuid;
alter table public.annual_student_records enable trigger annual_student_records_retire_code;
set local role authenticated;
set local request.jwt.claim.sub = 'd3333333-3333-4333-8333-333333333333';
select pg_temp.expect_error($s$ select pg_temp.scan('0030', gen_random_uuid()::text) $s$, 'student_code_retired');
reset role;

-- Lifecycle: a contact edit keeps the code; a real level change retires it (reason level_changed),
-- clears the pointer, bumps the version, and keeps history.
do $$ declare version_before integer; begin
  update public.annual_student_records set student_phone = '+201099999999' where id = current_setting('test.a1')::uuid;
  if not exists (select 1 from public.student_code_assignments where annual_student_record_id = current_setting('test.a1')::uuid and retired_at is null) then
    raise exception 'A contact edit must not retire a code';
  end if;
  select version into version_before from public.student_code_states where annual_student_record_id = current_setting('test.a1')::uuid;
  update public.annual_student_records set level_id = 'secondary-1', primary_group_id = null where id = current_setting('test.a1')::uuid;
  if exists (select 1 from public.student_code_assignments where annual_student_record_id = current_setting('test.a1')::uuid and retired_at is null)
    or not exists (select 1 from public.student_code_assignments where annual_student_record_id = current_setting('test.a1')::uuid
      and code = '0007' and retirement_reason = 'level_changed' and retired_by is null)
    or (select current_assignment_id from public.student_code_states where annual_student_record_id = current_setting('test.a1')::uuid) is not null
    or (select version from public.student_code_states where annual_student_record_id = current_setting('test.a1')::uuid) <> version_before + 1 then
    raise exception 'A level change must retire the active code, clear the pointer, and bump the version';
  end if;
end $$;
set local role authenticated;
set local request.jwt.claim.sub = 'd3333333-3333-4333-8333-333333333333';
select pg_temp.expect_error($s$ select pg_temp.scan('0007', gen_random_uuid()::text) $s$, 'student_code_retired');
-- Manual attendance by UUID still works for an uncoded student.
select public.check_in_attendance('d5555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid, current_setting('test.a3')::uuid, gen_random_uuid());

-- Disable: fresh scans fail, the earlier receipt replays, UUID check-in still works, enabling restores.
set local request.jwt.claim.sub = 'd1111111-1111-4111-8111-111111111111';
select public.save_student_code_settings('d5555555-5555-4555-8555-555555555555', 1, false, '####', '[]');
set local request.jwt.claim.sub = 'd3333333-3333-4333-8333-333333333333';
select pg_temp.expect_error($s$ select pg_temp.scan('0015', gen_random_uuid()::text) $s$, 'student_codes_disabled');
do $$ begin
  if not (pg_temp.scan('0012', 'dddddddd-0000-4000-8000-0000000000b3')->>'replayed')::boolean then raise exception 'Replay must survive disabling'; end if;
  if public.get_attendance('d5555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid)->>'student_codes_enabled' <> 'false' then
    raise exception 'The sheet must report codes disabled';
  end if;
end $$;
set local request.jwt.claim.sub = 'd1111111-1111-4111-8111-111111111111';
select public.save_student_code_settings('d5555555-5555-4555-8555-555555555555', 2, true, '', '[]');
set local request.jwt.claim.sub = 'd3333333-3333-4333-8333-333333333333';
select pg_temp.scan('0015', gen_random_uuid()::text);  -- enabled without a formula still scans

-- Session end: fresh scans fail, the original receipt still replays.
select public.end_session('d5555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid);
select pg_temp.expect_error($s$ select pg_temp.scan('0015', gen_random_uuid()::text) $s$, 'session_ended');
do $$ begin
  if not (pg_temp.scan('0007', 'dddddddd-0000-4000-8000-0000000000b1')->>'replayed')::boolean then raise exception 'Replay must survive session end'; end if;
end $$;

-- Year closure retires every active code of that year (reason year_closed) while codes are on or off;
-- reopening does not restore them.
reset role;
do $$ declare active_before integer; begin
  select count(*) into active_before from public.student_code_assignments where academic_year_id = 'd5555555-1111-4111-8111-555555555555' and retired_at is null;
  if active_before < 1 then raise exception 'Expected active codes before closing the year'; end if;
  update public.academic_years set closed_at = now() where id = 'd5555555-1111-4111-8111-555555555555';
  if exists (select 1 from public.student_code_assignments where academic_year_id = 'd5555555-1111-4111-8111-555555555555' and retired_at is null)
    or (select count(*) from public.student_code_assignments where academic_year_id = 'd5555555-1111-4111-8111-555555555555' and retirement_reason = 'year_closed') <> active_before then
    raise exception 'Year closure must retire the active codes';
  end if;
  if exists (select 1 from public.student_code_assignments where academy_id = 'e6666666-6666-4666-8666-666666666666' and retired_at is not null) then
    raise exception 'Another academy must be untouched';
  end if;
end $$;

-- Every issued string is reserved exactly once; reservations are not user-visible.
do $$ begin
  if (select count(*) from public.student_code_reservations where academy_id = 'd5555555-5555-4555-8555-555555555555')
     <> (select count(distinct code) from public.student_code_assignments where academy_id = 'd5555555-5555-4555-8555-555555555555') then
    raise exception 'Reservation registry out of step with the ledger';
  end if;
end $$;

rollback;
select 'student code check-in checks passed';
