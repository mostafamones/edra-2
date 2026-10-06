-- Attendance: grants/RLS, check-in outcomes, versioned edits, all-or-nothing bulk changes, request
-- idempotency, publication (stale review, corrections, effect deduplication), ended-session and
-- closed-year rules, tenant isolation, and realtime topic authorization.
-- Run with `npm run test:db` (psql -v ON_ERROR_STOP=1) after replaying all migrations on a
-- disposable database. Everything runs in one transaction that is rolled back.

do $$ begin
  if not (select relrowsecurity from pg_class where oid = 'public.attendance_records'::regclass)
    or not (select relrowsecurity from pg_class where oid = 'public.attendance_requests'::regclass)
    or has_table_privilege('anon', 'public.attendance_records', 'select')
    or has_table_privilege('authenticated', 'public.attendance_records', 'insert')
    or has_table_privilege('authenticated', 'public.attendance_records', 'update')
    or has_table_privilege('authenticated', 'public.attendance_sheets', 'update')
    or has_table_privilege('authenticated', 'public.attendance_publications', 'insert')
    or has_table_privilege('authenticated', 'public.attendance_effects', 'select')
    or has_table_privilege('authenticated', 'public.attendance_requests', 'select')
    or has_table_privilege('authenticated', 'public.api_rate_windows', 'select') then
    raise exception 'Attendance tables lack RLS or allow direct access';
  end if;
  if has_function_privilege('anon', 'public.check_in_attendance(uuid, uuid, uuid, uuid)', 'execute')
    or has_function_privilege('anon', 'public.get_attendance(uuid, uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.write_attendance(public.sessions, uuid, public.attendance_status, public.attendance_source, boolean)', 'execute')
    or has_function_privilege('authenticated', 'public.lock_attendance_session(uuid, uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.bump_attendance_revision(public.sessions)', 'execute')
    or not has_function_privilege('authenticated', 'public.check_in_attendance(uuid, uuid, uuid, uuid)', 'execute')
    or not has_function_privilege('authenticated', 'public.apply_attendance_changes(uuid, uuid, jsonb, text, uuid)', 'execute')
    or not has_function_privilege('authenticated', 'public.publish_attendance(uuid, uuid, integer, uuid)', 'execute') then
    raise exception 'Attendance RPC grants are wrong';
  end if;
  -- The quota-free implementations are private; only the charging wrappers are callable.
  if has_function_privilege('authenticated', 'edra_private.check_in_attendance(uuid, uuid, uuid, uuid)', 'execute')
    or has_function_privilege('authenticated', 'edra_private.apply_attendance_changes(uuid, uuid, jsonb, text, uuid)', 'execute')
    or has_function_privilege('authenticated', 'edra_private.publish_attendance(uuid, uuid, integer, uuid)', 'execute')
    or has_function_privilege('authenticated', 'edra_private.charge_mutation_quota(text)', 'execute') then
    raise exception 'Unthrottled attendance functions are callable';
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

-- Shorthand for the academy S calls below.
create function pg_temp.check_in(record_setting text, key text) returns jsonb language sql as $$
  select public.check_in_attendance('55555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid,
    current_setting(record_setting)::uuid, key::uuid);
$$;
create function pg_temp.change(changes jsonb, operation text, key text) returns jsonb language sql as $$
  select public.apply_attendance_changes('55555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid,
    changes, operation, key::uuid);
$$;
create function pg_temp.one(record_setting text, status text, version integer) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('annual_student_record_id', current_setting(record_setting),
    'status', status, 'expected_version', version));
$$;
create function pg_temp.publish(revision integer, key text) returns jsonb language sql as $$
  select public.publish_attendance('55555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid, revision, key::uuid);
$$;

insert into auth.users (id) values
  ('51111111-1111-4111-8111-111111111111'),  -- owner of S
  ('53333333-3333-4333-8333-333333333333'),  -- instructor of S
  ('54444444-4444-4444-8444-444444444444'),  -- second instructor of S
  ('61111111-1111-4111-8111-111111111111'),  -- owner of T
  ('71111111-1111-4111-8111-111111111111');  -- no membership
update public.profiles set full_name = 'Instructor One' where id = '53333333-3333-4333-8333-333333333333';
update public.profiles set full_name = 'Instructor Two' where id = '54444444-4444-4444-8444-444444444444';

insert into public.academies (id, name, slug, icon, subject, created_by) values
  ('55555555-5555-4555-8555-555555555555', 'Academy S', 'academy-s', 'school', 'Math', '51111111-1111-4111-8111-111111111111'),
  ('66666666-6666-4666-8666-666666666666', 'Academy T', 'academy-t', 'school', 'Math', '61111111-1111-4111-8111-111111111111');
update public.academic_years set id = '55555555-1111-4111-8111-555555555555', start_year = 2030
where academy_id = '55555555-5555-4555-8555-555555555555';
update public.academic_years set id = '66666666-1111-4111-8111-666666666666', start_year = 2030
where academy_id = '66666666-6666-4666-8666-666666666666';

insert into public.academy_memberships (academy_id, user_id, role, created_by) values
  ('55555555-5555-4555-8555-555555555555', '51111111-1111-4111-8111-111111111111', 'owner', '51111111-1111-4111-8111-111111111111'),
  ('55555555-5555-4555-8555-555555555555', '53333333-3333-4333-8333-333333333333', 'instructor', '51111111-1111-4111-8111-111111111111'),
  ('55555555-5555-4555-8555-555555555555', '54444444-4444-4444-8444-444444444444', 'instructor', '51111111-1111-4111-8111-111111111111'),
  ('66666666-6666-4666-8666-666666666666', '61111111-1111-4111-8111-111111111111', 'owner', '61111111-1111-4111-8111-111111111111');

insert into public.academy_levels (academy_id, level_id, sort_order) values
  ('55555555-5555-4555-8555-555555555555', 'grade-9', 9),
  ('66666666-6666-4666-8666-666666666666', 'grade-9', 9);
insert into public.groups (id, academy_id, academic_year_id, level_id, track_id, name) values
  ('5c555555-5555-4555-8555-555555555555', '55555555-5555-4555-8555-555555555555', '55555555-1111-4111-8111-555555555555', 'grade-9', null, 'Nine A'),
  ('5d555555-5555-4555-8555-555555555555', '55555555-5555-4555-8555-555555555555', '55555555-1111-4111-8111-555555555555', 'grade-9', null, 'Nine B'),
  ('6c666666-6666-4666-8666-666666666666', '66666666-6666-4666-8666-666666666666', '66666666-1111-4111-8111-666666666666', 'grade-9', null, 'T Nine');

grant usage on schema public, auth to authenticated, anon;

-- ---------------------------------------------------------------------------------------------
-- Owner of S: four Nine A students, one Nine B student, a mandatory Nine A class, and a live session.
set local role authenticated;
set local request.jwt.claim.sub = '51111111-1111-4111-8111-111111111111';

select set_config('test.a1', id::text, true) from public.create_student_record('55555555-5555-4555-8555-555555555555',
  '55555555-1111-4111-8111-555555555555', 'Amal', '01000000001', '01100000000', 'grade-9', null, '5c555555-5555-4555-8555-555555555555', 'in_person');
select set_config('test.a2', id::text, true) from public.create_student_record('55555555-5555-4555-8555-555555555555',
  '55555555-1111-4111-8111-555555555555', 'Aya', '01000000002', '01100000000', 'grade-9', null, '5c555555-5555-4555-8555-555555555555', 'in_person');
select set_config('test.a3', id::text, true) from public.create_student_record('55555555-5555-4555-8555-555555555555',
  '55555555-1111-4111-8111-555555555555', 'Adam', '01000000003', '01100000000', 'grade-9', null, '5c555555-5555-4555-8555-555555555555', 'in_person');
select set_config('test.a4', id::text, true) from public.create_student_record('55555555-5555-4555-8555-555555555555',
  '55555555-1111-4111-8111-555555555555', 'Alia', '01000000004', '01100000000', 'grade-9', null, '5c555555-5555-4555-8555-555555555555', 'in_person');
select set_config('test.b1', id::text, true) from public.create_student_record('55555555-5555-4555-8555-555555555555',
  '55555555-1111-4111-8111-555555555555', 'Bahaa', '01000000005', '01100000000', 'grade-9', null, '5d555555-5555-4555-8555-555555555555', 'in_person');
select set_config('test.weekly', public.create_schedule('55555555-5555-4555-8555-555555555555', '55555555-1111-4111-8111-555555555555',
  'Nine A weekly', 'recurring', 'group', '5c555555-5555-4555-8555-555555555555', null, null, true, 'Room 1',
  '[{"weekday":1,"startsAt":"17:00","endsAt":"18:30"}]', '[]')::text, true);
select set_config('test.s1', session_id::text, true) from public.start_session(
  '55555555-5555-4555-8555-555555555555', current_setting('test.weekly')::uuid, 'aaaaaaaa-0000-4000-8000-000000000001');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '61111111-1111-4111-8111-111111111111';
select set_config('test.t1', id::text, true) from public.create_student_record('66666666-6666-4666-8666-666666666666',
  '66666666-1111-4111-8111-666666666666', 'Tarek', '01000000009', '01100000000', 'grade-9', null, '6c666666-6666-4666-8666-666666666666', 'in_person');
reset role;

-- ---------------------------------------------------------------------------------------------
-- Before any input: four Unknown roster entries at version 0, revision 0, unpublished.
set local role authenticated;
set local request.jwt.claim.sub = '53333333-3333-4333-8333-333333333333';

do $$
declare sheet jsonb := public.get_attendance('55555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid);
begin
  if (sheet->>'revision')::int <> 0 or (sheet->>'publication_count')::int <> 0 or jsonb_array_length(sheet->'entries') <> 4
    or exists (select 1 from jsonb_array_elements(sheet->'entries') e where e->>'status' <> 'unknown' or (e->>'version')::int <> 0)
    or sheet->'session'->>'state' <> 'live' or not (sheet->'session'->>'year_open')::boolean then
    raise exception 'Initial attendance sheet is wrong: %', sheet;
  end if;
end $$;

-- Check-in: Unknown becomes draft Present; repeating it (new key, another device) changes nothing.
do $$
declare first jsonb; again jsonb; retry jsonb; checked timestamptz;
begin
  first := pg_temp.check_in('test.a1', 'cccccccc-0000-4000-8000-000000000001');
  if first->>'outcome' <> 'recorded' or first->'entry'->>'status' <> 'present' or (first->'entry'->>'version')::int <> 1
    or (first->>'revision')::int <> 1 or (first->>'replayed')::boolean or (first->>'correction_pending')::boolean then
    raise exception 'First check-in is wrong: %', first;
  end if;
  checked := (first->'entry'->>'checked_in_at')::timestamptz;
  -- The same request retried replays its stored result.
  retry := pg_temp.check_in('test.a1', 'cccccccc-0000-4000-8000-000000000001');
  if retry->>'outcome' <> 'recorded' or not (retry->>'replayed')::boolean then raise exception 'Retry did not replay: %', retry; end if;
  -- A second device scanning the same student with its own key.
  set local request.jwt.claim.sub = '54444444-4444-4444-8444-444444444444';
  again := pg_temp.check_in('test.a1', 'cccccccc-0000-4000-8000-000000000002');
  if again->>'outcome' <> 'already_recorded' or (again->'entry'->>'version')::int <> 1
    or (again->'entry'->>'checked_in_at')::timestamptz <> checked or (again->>'revision')::int <> 1 then
    raise exception 'Repeated check-in changed attendance: %', again;
  end if;
  set local request.jwt.claim.sub = '53333333-3333-4333-8333-333333333333';
end $$;

-- A key reused for another student is rejected; students outside the roster or academy are rejected.
select pg_temp.expect_error($s$ select pg_temp.check_in('test.a2', 'cccccccc-0000-4000-8000-000000000001') $s$, 'idempotency_conflict');
select pg_temp.expect_error($s$ select pg_temp.check_in('test.b1', 'cccccccc-0000-4000-8000-000000000003') $s$, 'not_on_roster');
select pg_temp.expect_error($s$ select pg_temp.check_in('test.t1', 'cccccccc-0000-4000-8000-000000000004') $s$, 'student_not_found');

-- Manual edits are versioned: Late over Present at version 1 works, a stale second edit conflicts.
do $$
declare result jsonb;
begin
  result := pg_temp.change(pg_temp.one('test.a1', 'late', 1), 'set', 'dddddddd-0000-4000-8000-000000000001');
  if result->>'outcome' <> 'updated' or (result->>'changed')::int <> 1 or result->'entries'->0->>'status' <> 'late'
    or (result->'entries'->0->>'version')::int <> 2 or (result->>'revision')::int <> 2 then
    raise exception 'Manual edit is wrong: %', result;
  end if;
  set local request.jwt.claim.sub = '54444444-4444-4444-8444-444444444444';
  result := pg_temp.change(pg_temp.one('test.a1', 'absent', 1), 'set', 'dddddddd-0000-4000-8000-000000000002');
  if result->>'outcome' <> 'conflict' or result->'conflicts'->0->>'status' <> 'late'
    or (result->'conflicts'->0->>'version')::int <> 2 or result->'conflicts'->0->>'updated_by_name' <> 'Instructor One' then
    raise exception 'Stale edit did not conflict: %', result;
  end if;
  set local request.jwt.claim.sub = '53333333-3333-4333-8333-333333333333';
  -- A scan never resets Late.
  result := pg_temp.check_in('test.a1', 'cccccccc-0000-4000-8000-000000000005');
  if result->>'outcome' <> 'already_recorded' or result->'entry'->>'status' <> 'late' then
    raise exception 'Scan changed a Late student: %', result;
  end if;
end $$;

-- Bulk changes are all or nothing: one stale version blocks every change.
do $$
declare result jsonb;
begin
  result := pg_temp.change(jsonb_build_array(
    jsonb_build_object('annual_student_record_id', current_setting('test.a2'), 'status', 'absent', 'expected_version', 0),
    jsonb_build_object('annual_student_record_id', current_setting('test.a1'), 'status', 'absent', 'expected_version', 1)
  ), 'bulk', 'eeeeeeee-0000-4000-8000-000000000001');
  if result->>'outcome' <> 'conflict' or jsonb_array_length(result->'conflicts') <> 1
    or exists (select 1 from public.attendance_records where annual_student_record_id = current_setting('test.a2')::uuid) then
    raise exception 'Bulk conflict applied a partial change: %', result;
  end if;
  -- Explicitly marking the unrecorded students absent, then excusing one of them.
  result := pg_temp.change(jsonb_build_array(
    jsonb_build_object('annual_student_record_id', current_setting('test.a2'), 'status', 'absent', 'expected_version', 0),
    jsonb_build_object('annual_student_record_id', current_setting('test.a3'), 'status', 'absent', 'expected_version', 0)
  ), 'bulk', 'eeeeeeee-0000-4000-8000-000000000002');
  if result->>'outcome' <> 'updated' or (result->>'changed')::int <> 2 or (result->>'revision')::int <> 3 then
    raise exception 'Bulk change is wrong: %', result;
  end if;
  result := pg_temp.change(pg_temp.one('test.a3', 'excused', 1), 'set', 'eeeeeeee-0000-4000-8000-000000000003');
  if (result->>'revision')::int <> 4 then raise exception 'Excuse is wrong: %', result; end if;
  -- An unchanged value is skipped without a new version or revision.
  result := pg_temp.change(pg_temp.one('test.a3', 'excused', 2), 'set', 'eeeeeeee-0000-4000-8000-000000000004');
  if (result->>'changed')::int <> 0 or (result->>'revision')::int <> 4 then raise exception 'No-op edit bumped versions: %', result; end if;
end $$;
select pg_temp.expect_error($s$ select pg_temp.change(pg_temp.one('test.a2', 'bogus', 1), 'set', 'eeeeeeee-0000-4000-8000-000000000005') $s$, 'validation');
select pg_temp.expect_error($s$ select pg_temp.change(pg_temp.one('test.b1', 'absent', 0), 'set', 'eeeeeeee-0000-4000-8000-000000000006') $s$, 'not_on_roster');

-- Scans never override Absent or Excused; they need review and are not remembered.
do $$
declare result jsonb;
begin
  result := pg_temp.check_in('test.a2', 'cccccccc-0000-4000-8000-000000000006');
  if result->>'outcome' <> 'review_required' or result->'entry'->>'status' <> 'absent' then
    raise exception 'Scan over Absent did not require review: %', result;
  end if;
  result := pg_temp.check_in('test.a3', 'cccccccc-0000-4000-8000-000000000007');
  if result->>'outcome' <> 'review_required' or result->'entry'->>'status' <> 'excused' then
    raise exception 'Scan over Excused did not require review: %', result;
  end if;
end $$;

-- Drafts have no official effect.
reset role;
do $$ begin
  -- A conflict is not remembered: the same key can be used once the user reviews.
  if exists (select 1 from public.attendance_requests where idempotency_key = 'dddddddd-0000-4000-8000-000000000002') then
    raise exception 'A conflict was stored as a replayable result';
  end if;
  if exists (select 1 from public.attendance_records where published_status is not null)
    or exists (select 1 from public.attendance_effects) or exists (select 1 from public.attendance_publications) then
    raise exception 'Draft attendance produced official state';
  end if;
end $$;
set local role authenticated;
set local request.jwt.claim.sub = '53333333-3333-4333-8333-333333333333';

-- Publication must name the reviewed revision; a stale review is rejected.
select pg_temp.expect_error($s$ select pg_temp.publish(3, 'ffffffff-0000-4000-8000-000000000001') $s$, 'publication_stale');

do $$
declare result jsonb; retry jsonb;
begin
  result := pg_temp.publish(4, 'ffffffff-0000-4000-8000-000000000002');
  if result->>'outcome' <> 'published' or (result->>'item_count')::int <> 3 or (result->>'revision')::int <> 4 then
    raise exception 'Initial publication is wrong: %', result;
  end if;
  retry := pg_temp.publish(4, 'ffffffff-0000-4000-8000-000000000002');
  if retry->>'publication_id' <> result->>'publication_id' or not (retry->>'replayed')::boolean then
    raise exception 'Publication retry did not replay: %', retry;
  end if;
  -- Another key for the same revision is already official.
  if pg_temp.publish(4, 'ffffffff-0000-4000-8000-000000000003')->>'outcome' <> 'already_published' then
    raise exception 'Republishing the same revision created a publication';
  end if;
end $$;

reset role;
do $$ begin
  -- Late -> access; mandatory Absent (expected) -> absence event; Excused and Unknown (a4) -> nothing.
  if (select count(*) from public.attendance_publications) <> 1
    or (select count(*) from public.attendance_publication_items) <> 3
    or (select count(*) from public.attendance_effects) <> 2
    or not exists (select 1 from public.attendance_effects where annual_student_record_id = current_setting('test.a1')::uuid and effect_type = 'explanation_access')
    or not exists (select 1 from public.attendance_effects where annual_student_record_id = current_setting('test.a2')::uuid and effect_type = 'absence_event')
    or exists (select 1 from public.attendance_records where annual_student_record_id = current_setting('test.a4')::uuid) then
    raise exception 'Publication effects are wrong';
  end if;
end $$;
select pg_temp.expect_error($s$ update public.attendance_publications set item_count = 0 $s$, 'validation');
select pg_temp.expect_error($s$ delete from public.attendance_publication_items $s$, 'validation');
set local role authenticated;
set local request.jwt.claim.sub = '53333333-3333-4333-8333-333333333333';

-- After publication, a scan and an edit are pending corrections; official values stay until republished.
do $$
declare result jsonb; sheet jsonb;
begin
  result := pg_temp.check_in('test.a4', 'cccccccc-0000-4000-8000-000000000008');
  if result->>'outcome' <> 'recorded' or not (result->>'correction_pending')::boolean then
    raise exception 'Scan after publication is not a pending correction: %', result;
  end if;
  result := pg_temp.change(pg_temp.one('test.a2', 'present', 1), 'set', 'dddddddd-0000-4000-8000-000000000003');
  sheet := public.get_attendance('55555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid);
  if (select e->>'published_status' from jsonb_array_elements(sheet->'entries') e where e->>'annual_student_record_id' = current_setting('test.a2')) <> 'absent' then
    raise exception 'A draft correction replaced the official value';
  end if;
  result := pg_temp.publish((sheet->>'revision')::int, 'ffffffff-0000-4000-8000-000000000004');
  if result->>'outcome' <> 'published' or (result->>'item_count')::int <> 2 then
    raise exception 'Correction publication is wrong: %', result;
  end if;
end $$;

reset role;
do $$ begin
  if (select kind from public.attendance_publications where sequence = 2) <> 'correction'
    or (select previous_status from public.attendance_publication_items i join public.attendance_publications p on p.id = i.publication_id
        where p.sequence = 2 and i.annual_student_record_id = current_setting('test.a2')::uuid) <> 'absent'
    -- The original absence stays; the correction asks for review of it, and grants access once.
    or (select count(*) from public.attendance_effects where annual_student_record_id = current_setting('test.a2')::uuid) <> 3
    or not exists (select 1 from public.attendance_effects where annual_student_record_id = current_setting('test.a2')::uuid
      and effect_type = 'revocation_review' and reverses = 'absence_event')
    or (select count(*) from public.attendance_effects where effect_type = 'explanation_access') <> 3 then
    raise exception 'Correction effects are wrong';
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Tenant isolation: non-members and other academies cannot read or write.
set local role authenticated;
set local request.jwt.claim.sub = '71111111-1111-4111-8111-111111111111';
select pg_temp.expect_error($s$ select pg_temp.check_in('test.a4', 'cccccccc-0000-4000-8000-000000000009') $s$, 'forbidden');
do $$ begin
  if public.get_attendance('55555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid) is not null
    or exists (select 1 from public.attendance_records) or public.session_academy(current_setting('test.s1')::uuid) is not null
    or public.can_join_attendance_channel('attendance:55555555-5555-4555-8555-555555555555:' || current_setting('test.s1')) then
    raise exception 'A non-member can see attendance';
  end if;
end $$;
set local request.jwt.claim.sub = '61111111-1111-4111-8111-111111111111';
-- Academy T's owner substituting its own academy id for S's session.
select pg_temp.expect_error($s$ select public.check_in_attendance('66666666-6666-4666-8666-666666666666',
  current_setting('test.s1')::uuid, current_setting('test.a4')::uuid, 'cccccccc-0000-4000-8000-00000000000a') $s$, 'not_found');
select pg_temp.expect_error($s$ select public.publish_attendance('55555555-5555-4555-8555-555555555555',
  current_setting('test.s1')::uuid, 0, 'cccccccc-0000-4000-8000-00000000000b') $s$, 'forbidden');
set local request.jwt.claim.sub = '53333333-3333-4333-8333-333333333333';
do $$ begin
  if not public.can_join_attendance_channel('attendance:55555555-5555-4555-8555-555555555555:' || current_setting('test.s1'))
    or public.can_join_attendance_channel('attendance:66666666-6666-4666-8666-666666666666:' || current_setting('test.s1'))
    or public.can_join_attendance_channel('attendance:55555555-5555-4555-8555-555555555555:' || current_setting('test.s1') || ':x')
    or public.session_academy(current_setting('test.s1')::uuid) <> '55555555-5555-4555-8555-555555555555' then
    raise exception 'Realtime topic authorization is wrong';
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Ended session: no check-ins, but edits and publication still work.
do $$ begin
  if public.end_session('55555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid) <> 'ended' then
    raise exception 'Could not end the session';
  end if;
end $$;
select pg_temp.expect_error($s$ select pg_temp.check_in('test.a3', 'cccccccc-0000-4000-8000-00000000000c') $s$, 'session_ended');
do $$
declare result jsonb; revision int;
begin
  result := pg_temp.change(pg_temp.one('test.a3', 'present', 2), 'set', 'dddddddd-0000-4000-8000-000000000004');
  if result->>'outcome' <> 'updated' then raise exception 'Edit after end failed: %', result; end if;
  revision := (result->>'revision')::int;
  if pg_temp.publish(revision, 'ffffffff-0000-4000-8000-000000000005')->>'outcome' <> 'published' then
    raise exception 'Publication after end failed';
  end if;
end $$;

-- Closed year: read-only. A retried request still replays.
reset role;
update public.academic_years set closed_at = now() where id = '55555555-1111-4111-8111-555555555555';
set local role authenticated;
set local request.jwt.claim.sub = '53333333-3333-4333-8333-333333333333';
select pg_temp.expect_error($s$ select pg_temp.change(pg_temp.one('test.a3', 'late', 3), 'set', 'dddddddd-0000-4000-8000-000000000005') $s$, 'year_unavailable');
select pg_temp.expect_error($s$ select pg_temp.publish(0, 'ffffffff-0000-4000-8000-000000000006') $s$, 'year_unavailable');
do $$ begin
  if not (pg_temp.change(pg_temp.one('test.a3', 'present', 2), 'set', 'dddddddd-0000-4000-8000-000000000004')->>'replayed')::boolean then
    raise exception 'A retried edit did not replay after the year closed';
  end if;
end $$;
do $$ begin
  if (public.get_attendance('55555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid)->'session'->>'year_open')::boolean then
    raise exception 'Closed year still reported open';
  end if;
end $$;

-- HTTP throttling counts per user and window with server-owned limits; caller limits are ignored
-- and unknown or mutation buckets are rejected.
select pg_temp.expect_error($s$ select public.consume_api_quota('api:test', 2, 60) $s$, 'validation');
select pg_temp.expect_error($s$ select public.consume_api_quota('op:attendance_check_in', 2, 60) $s$, 'validation');
reset role;
insert into public.api_rate_windows (actor_id, bucket, window_start, hits)
values ('53333333-3333-4333-8333-333333333333', 'api:write', to_timestamp(floor(extract(epoch from now()) / 60) * 60), 119)
on conflict (actor_id, bucket, window_start) do update set hits = excluded.hits;
set local role authenticated;
set local request.jwt.claim.sub = '53333333-3333-4333-8333-333333333333';
do $$
declare result jsonb;
begin
  result := public.consume_api_quota('api:write', 100000, 60);
  if not (result->>'allowed')::boolean then raise exception 'Quota rejected a request within the limit: %', result; end if;
  result := public.consume_api_quota('api:write', 100000, 60);
  if (result->>'allowed')::boolean or (result->>'retry_after')::int < 1 then raise exception 'Quota was not enforced: %', result; end if;
end $$;
reset role;

-- Mutation quotas are charged by the RPC itself, so direct calls cannot bypass them. An exhausted
-- quota changes nothing and does not consume the idempotency key.
insert into public.api_rate_windows (actor_id, bucket, window_start, hits)
values ('53333333-3333-4333-8333-333333333333', 'op:attendance_change', to_timestamp(floor(extract(epoch from now()) / 60) * 60), 240)
on conflict (actor_id, bucket, window_start) do update set hits = excluded.hits;
select set_config('test.revision_before', public.current_attendance_revision(current_setting('test.s1')::uuid)::text, true);
set local role authenticated;
set local request.jwt.claim.sub = '53333333-3333-4333-8333-333333333333';
select pg_temp.expect_error($s$ select pg_temp.change(pg_temp.one('test.a3', 'present', 2), 'set', 'dddddddd-0000-4000-8000-000000000004') $s$, 'throttled');
reset role;
do $$ begin
  if public.current_attendance_revision(current_setting('test.s1')::uuid)::text <> current_setting('test.revision_before')
    or (select hits from public.api_rate_windows where actor_id = '53333333-3333-4333-8333-333333333333'
      and bucket = 'op:attendance_change') <> 240 then
    raise exception 'A throttled mutation changed state or counted';
  end if;
end $$;
-- Another staff member's quota is separate.
set local role authenticated;
set local request.jwt.claim.sub = '51111111-1111-4111-8111-111111111111';
select pg_temp.expect_error($s$ select pg_temp.change(pg_temp.one('test.a3', 'late', 0), 'set', 'dddddddd-0000-4000-8000-000000000099') $s$, 'year_unavailable');
reset role;

-- Published sessions cannot be deleted, even by the Owner; history stays intact.
set local role authenticated;
set local request.jwt.claim.sub = '51111111-1111-4111-8111-111111111111';
select pg_temp.expect_error($s$ select public.delete_session('55555555-5555-4555-8555-555555555555',
  current_setting('test.s1')::uuid) $s$, 'session_published');
reset role;
select pg_temp.expect_error($s$ delete from public.attendance_records
  where session_id = current_setting('test.s1')::uuid $s$, 'validation');
do $$ begin
  if not exists (select 1 from public.sessions where id = current_setting('test.s1')::uuid)
    or not exists (select 1 from public.attendance_records where session_id = current_setting('test.s1')::uuid) then
    raise exception 'A published session lost history';
  end if;
end $$;

rollback;
