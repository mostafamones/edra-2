-- Staff student records: constraints, RPC authorization, RLS, archive/restore, and list reads.
-- Run with `npm run test:db` against the marked isolated test target (see docs/engineering.md).
-- Any failed assertion aborts psql with a non-zero exit status.
-- Everything runs in one transaction that is rolled back. Generated ids are kept in custom settings.

do $$ begin
  if not (select relrowsecurity from pg_class where oid = 'public.annual_student_records'::regclass)
    or not (select relrowsecurity from pg_class where oid = 'public.academy_student_profiles'::regclass)
    or has_table_privilege('anon', 'public.annual_student_records', 'select')
    or has_table_privilege('authenticated', 'public.annual_student_records', 'insert')
    or has_table_privilege('authenticated', 'public.annual_student_records', 'update')
    or has_table_privilege('authenticated', 'public.annual_student_records', 'delete')
    or has_table_privilege('authenticated', 'public.academy_student_profiles', 'insert') then
    raise exception 'Student tables lack RLS or allow direct writes';
  end if;
  if has_function_privilege('anon', 'public.create_student_record(uuid, uuid, text, text, text, text, uuid, uuid, public.student_participation_type)', 'execute')
    or has_function_privilege('anon', 'public.set_student_records_archived(uuid, uuid, jsonb, boolean)', 'execute')
    or has_function_privilege('anon', 'public.list_student_records(uuid, uuid, text, text, text, text, text, text, jsonb, integer, integer)', 'execute')
    or has_function_privilege('authenticated', 'public.check_student_record_input(text, text, text, text, public.student_participation_type)', 'execute')
    or not has_function_privilege('authenticated', 'public.update_student_record(uuid, integer, uuid, text, text, text, text, uuid, uuid, public.student_participation_type)', 'execute') then
    raise exception 'Student RPC grants are wrong';
  end if;
  -- The database phone normalizer mirrors normalizeEgyptianPhone in src/lib/phone.ts.
  if public.normalize_egyptian_phone('010 1234 5678') <> '+201012345678'
    or public.normalize_egyptian_phone('+20 (10) 1234-5678') <> '+201012345678'
    or public.normalize_egyptian_phone('00201012345678') <> '+201012345678'
    or public.normalize_egyptian_phone('201512345678') <> '+201512345678'
    or public.normalize_egyptian_phone('1112223333') <> '+201112223333'
    or public.normalize_egyptian_phone('01312345678') is not null
    or public.normalize_egyptian_phone('0101234567') is not null
    or public.normalize_egyptian_phone('') is not null then
    raise exception 'Phone normalization differs from the application';
  end if;
end $$;

begin;

-- Fails unless `statement` raises an error whose message matches `expected` (a LIKE pattern).
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

insert into auth.users (id) values
  ('d1111111-1111-4111-8111-111111111111'),  -- owner of D
  ('d2222222-2222-4222-8222-222222222222'),  -- admin of D
  ('d3333333-3333-4333-8333-333333333333'),  -- instructor of D
  ('e1111111-1111-4111-8111-111111111111'),  -- owner of E
  ('f1111111-1111-4111-8111-111111111111');  -- no membership

insert into public.academies (id, name, slug, icon, subject, created_by) values
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Academy D', 'academy-d', 'school', 'Math', 'd1111111-1111-4111-8111-111111111111'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'Academy E', 'academy-e', 'school', 'Math', 'e1111111-1111-4111-8111-111111111111');
update public.academic_years set id = 'dddddddd-1111-4111-8111-dddddddddddd', start_year = 2030
where academy_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
update public.academic_years set id = 'eeeeeeee-1111-4111-8111-eeeeeeeeeeee', start_year = 2030
where academy_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

insert into public.academy_memberships (academy_id, user_id, role, created_by) values
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'd1111111-1111-4111-8111-111111111111', 'owner', 'd1111111-1111-4111-8111-111111111111'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'd2222222-2222-4222-8222-222222222222', 'admin', 'd1111111-1111-4111-8111-111111111111'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'd3333333-3333-4333-8333-333333333333', 'instructor', 'd1111111-1111-4111-8111-111111111111'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'e1111111-1111-4111-8111-111111111111', 'owner', 'e1111111-1111-4111-8111-111111111111');

insert into public.academy_levels (academy_id, level_id, sort_order) values
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'preparatory-3', 9),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'secondary-2', 11),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'preparatory-3', 9);
insert into public.academy_tracks (id, academy_id, level_id, name, sort_order) values
  ('d5555555-5555-4555-8555-555555555555', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'secondary-2', 'Science', 1),
  ('d6666666-6666-4666-8666-666666666666', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'secondary-2', 'Arts', 2);
insert into public.groups (id, academy_id, academic_year_id, level_id, track_id, name) values
  ('d7777777-7777-4777-8777-777777777777', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-1111-4111-8111-dddddddddddd', 'preparatory-3', null, 'Nine A'),
  ('d8888888-8888-4888-8888-888888888888', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-1111-4111-8111-dddddddddddd', 'secondary-2', 'd5555555-5555-4555-8555-555555555555', 'Science A'),
  ('d9999999-9999-4999-8999-999999999999', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-1111-4111-8111-dddddddddddd', 'preparatory-3', null, 'Nine archived'),
  ('e7777777-7777-4777-8777-777777777777', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'eeeeeeee-1111-4111-8111-eeeeeeeeeeee', 'preparatory-3', null, 'E group');
update public.groups set archived_at = now() where id = 'd9999999-9999-4999-8999-999999999999';

grant usage on schema public, auth to authenticated, anon;

-- ---------------------------------------------------------------------------------------------
-- Owner of D: creation, validation, uniqueness, placement.
set local role authenticated;
set local request.jwt.claim.sub = 'd1111111-1111-4111-8111-111111111111';

select set_config('test.r1', id::text, true) from public.create_student_record(
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-1111-4111-8111-dddddddddddd', '  Mariam Hassan  ',
  '010 1234 5678', '0111 222 3333', 'preparatory-3', null, null, 'in_person');
-- Duplicate names and a shared parent phone are allowed.
select set_config('test.r2', id::text, true) from public.create_student_record(
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-1111-4111-8111-dddddddddddd', 'Mariam Hassan',
  '01012345679', '01112223333', 'preparatory-3', null, 'd7777777-7777-4777-8777-777777777777', 'online_only');
select set_config('test.r3', id::text, true) from public.create_student_record(
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-1111-4111-8111-dddddddddddd', 'مريم حسن 100% _test_',
  '01512345678', '01112223333', 'secondary-2', 'd5555555-5555-4555-8555-555555555555', 'd8888888-8888-4888-8888-888888888888', 'in_person');

do $$ begin
  if not exists (
    select 1 from public.annual_student_records
    where id = current_setting('test.r1')::uuid and full_name = 'Mariam Hassan'
      and student_phone = '+201012345678' and parent_phone = '+201112223333' and version = 1
      and primary_group_id is null and track_id is null and archived_at is null
      and created_by = 'd1111111-1111-4111-8111-111111111111'
  ) then raise exception 'Created record was not normalized'; end if;
  if (select count(*) from public.academy_student_profiles where academy_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd') <> 3 then
    raise exception 'Each record needs its own academy student profile';
  end if;
end $$;

-- Equivalent phone formats collide on the normalized student phone.
select pg_temp.expect_error($s$ select public.create_student_record('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-1111-4111-8111-dddddddddddd',
  'Another', '+20 10 1234 5678', '01112223333', 'preparatory-3', null, null, 'in_person') $s$, 'duplicate_student_phone');
select pg_temp.expect_error($s$ select public.create_student_record('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-1111-4111-8111-dddddddddddd',
  'Another', '00201012345678', '01112223333', 'preparatory-3', null, null, 'in_person') $s$, 'duplicate_student_phone');
-- Required values and phone format.
select pg_temp.expect_error($s$ select public.create_student_record('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-1111-4111-8111-dddddddddddd',
  '   ', '01000000001', '01112223333', 'preparatory-3', null, null, 'in_person') $s$, 'validation');
select pg_temp.expect_error($s$ select public.create_student_record('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-1111-4111-8111-dddddddddddd',
  'No phone', '', '01112223333', 'preparatory-3', null, null, 'in_person') $s$, 'validation');
select pg_temp.expect_error($s$ select public.create_student_record('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-1111-4111-8111-dddddddddddd',
  'No parent', '01000000002', null, 'preparatory-3', null, null, 'in_person') $s$, 'validation');
select pg_temp.expect_error($s$ select public.create_student_record('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-1111-4111-8111-dddddddddddd',
  'Bad phone', '0131234567', '01112223333', 'preparatory-3', null, null, 'in_person') $s$, 'validation');
select pg_temp.expect_error($s$ select public.create_student_record('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-1111-4111-8111-dddddddddddd',
  'No type', '01000000003', '01112223333', 'preparatory-3', null, null, null) $s$, 'validation');
-- Track required only where the level has tracks; groups must match year, level, and track.
select pg_temp.expect_error($s$ select public.create_student_record('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-1111-4111-8111-dddddddddddd',
  'No track', '01000000004', '01112223333', 'secondary-2', null, null, 'in_person') $s$, 'invalid_placement');
select pg_temp.expect_error($s$ select public.create_student_record('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-1111-4111-8111-dddddddddddd',
  'Wrong track', '01000000005', '01112223333', 'preparatory-3', 'd5555555-5555-4555-8555-555555555555', null, 'in_person') $s$, 'invalid_placement');
select pg_temp.expect_error($s$ select public.create_student_record('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-1111-4111-8111-dddddddddddd',
  'Wrong group', '01000000006', '01112223333', 'preparatory-3', null, 'd8888888-8888-4888-8888-888888888888', 'in_person') $s$, 'invalid_placement');
select pg_temp.expect_error($s$ select public.create_student_record('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-1111-4111-8111-dddddddddddd',
  'Arts in Science', '01000000007', '01112223333', 'secondary-2', 'd6666666-6666-4666-8666-666666666666', 'd8888888-8888-4888-8888-888888888888', 'in_person') $s$, 'invalid_placement');
select pg_temp.expect_error($s$ select public.create_student_record('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-1111-4111-8111-dddddddddddd',
  'Archived group', '01000000008', '01112223333', 'preparatory-3', null, 'd9999999-9999-4999-8999-999999999999', 'in_person') $s$, 'invalid_placement');
select pg_temp.expect_error($s$ select public.create_student_record('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-1111-4111-8111-dddddddddddd',
  'Cross-academy group', '01000000009', '01112223333', 'preparatory-3', null, 'e7777777-7777-4777-8777-777777777777', 'in_person') $s$, 'invalid_placement');
select pg_temp.expect_error($s$ select public.create_student_record('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-1111-4111-8111-dddddddddddd',
  'Unknown level', '01000000010', '01112223333', 'secondary-3', null, null, 'in_person') $s$, 'invalid_placement');
-- A form loaded for another academy's year cannot write into it.
select pg_temp.expect_error($s$ select public.create_student_record('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'eeeeeeee-1111-4111-8111-eeeeeeeeeeee',
  'Wrong year', '01000000011', '01112223333', 'preparatory-3', null, null, 'in_person') $s$, 'year_unavailable');

do $$ begin
  -- Failed creations leave no orphan identities.
  if (select count(*) from public.academy_student_profiles where academy_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd')
    <> (select count(*) from public.annual_student_records where academy_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd') then
    raise exception 'A failed creation left an orphan academy student profile';
  end if;
end $$;

-- Direct table writes are denied even for owners.
select pg_temp.expect_error($s$ insert into public.academy_student_profiles (academy_id, created_by)
  values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'd1111111-1111-4111-8111-111111111111') $s$, 'permission denied%');
select pg_temp.expect_error($s$ update public.annual_student_records set full_name = 'Direct' $s$, 'permission denied%');
select pg_temp.expect_error($s$ delete from public.annual_student_records $s$, 'permission denied%');

-- Updates: version checks, conflicts, and the unique phone on change.
do $$
declare result record;
begin
  select * into result from public.update_student_record(current_setting('test.r1')::uuid, 1, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'Mariam H.', '01012345678', '01112223333', 'preparatory-3', null, 'd7777777-7777-4777-8777-777777777777', 'in_person');
  if result.version <> 2 then raise exception 'Update did not bump the version'; end if;
end $$;
select pg_temp.expect_error(format($s$ select public.update_student_record(%L, 1, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'Stale', '01012345678', '01112223333', 'preparatory-3', null, null, 'in_person') $s$, current_setting('test.r1')), 'stale_record');
select pg_temp.expect_error(format($s$ select public.update_student_record(%L, 1, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'Taken phone', '01012345678', '01112223333', 'preparatory-3', null, 'd7777777-7777-4777-8777-777777777777', 'online_only') $s$, current_setting('test.r2')), 'duplicate_student_phone');
select pg_temp.expect_error(format($s$ select public.update_student_record(%L, 1, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'Other academy', '01012345679', '01112223333', 'preparatory-3', null, null, 'in_person') $s$, current_setting('test.r2')), 'forbidden');
do $$ begin
  if (select full_name from public.annual_student_records where id = current_setting('test.r1')::uuid) <> 'Mariam H.' then
    raise exception 'A rejected update changed the record';
  end if;
end $$;

-- Groups with student records (active or archived) cannot be archived or change program.
reset role;
select pg_temp.expect_error($s$ update public.groups set archived_at = now() where id = 'd7777777-7777-4777-8777-777777777777' $s$, '%student records%');
select pg_temp.expect_error($s$ update public.groups set track_id = 'd6666666-6666-4666-8666-666666666666' where id = 'd8888888-8888-4888-8888-888888888888' $s$, '%student records%');
set local role authenticated;
set local request.jwt.claim.sub = 'd1111111-1111-4111-8111-111111111111';

-- ---------------------------------------------------------------------------------------------
-- Archive and restore.
select pg_temp.expect_error(format($s$ select public.set_student_records_archived('dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'dddddddd-1111-4111-8111-dddddddddddd', jsonb_build_array(jsonb_build_object('id', %L, 'version', 1)), true) $s$,
  current_setting('test.r1')), 'stale_record');
-- A batch containing another academy's record changes nothing.
select set_config('test.e1', '00000000-0000-4000-8000-000000000001', true);
select pg_temp.expect_error(format($s$ select public.set_student_records_archived('dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'dddddddd-1111-4111-8111-dddddddddddd', jsonb_build_array(jsonb_build_object('id', %L, 'version', 1), jsonb_build_object('id', %L, 'version', 1)), true) $s$,
  current_setting('test.r2'), current_setting('test.e1')), 'not_found');
select pg_temp.expect_error(format($s$ select public.set_student_records_archived('dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'dddddddd-1111-4111-8111-dddddddddddd', jsonb_build_array(jsonb_build_object('id', %L, 'version', 1), jsonb_build_object('id', %L, 'version', 1)), true) $s$,
  current_setting('test.r2'), current_setting('test.r2')), 'validation');
select pg_temp.expect_error($s$ select public.set_student_records_archived('dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'dddddddd-1111-4111-8111-dddddddddddd', '[]'::jsonb, true) $s$, 'validation');
select pg_temp.expect_error($s$ select public.set_student_records_archived('dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'dddddddd-1111-4111-8111-dddddddddddd', '[{"id":"not-a-uuid","version":1}]'::jsonb, true) $s$, 'validation');
do $$ begin
  if exists (select 1 from public.annual_student_records where academy_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' and archived_at is not null) then
    raise exception 'A rejected batch archived records';
  end if;
end $$;

do $$
declare changed uuid[];
begin
  select array_agg(id) into changed from public.set_student_records_archived('dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'dddddddd-1111-4111-8111-dddddddddddd',
    jsonb_build_array(jsonb_build_object('id', current_setting('test.r1'), 'version', 2), jsonb_build_object('id', current_setting('test.r2'), 'version', 1)), true) as archived(id);
  if cardinality(changed) <> 2 then raise exception 'Batch archive did not archive both records'; end if;
  -- Re-archiving an archived record is a harmless no-op.
  select array_agg(id) into changed from public.set_student_records_archived('dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'dddddddd-1111-4111-8111-dddddddddddd', jsonb_build_array(jsonb_build_object('id', current_setting('test.r2'), 'version', 2)), true) as archived(id);
  if changed is not null then raise exception 'Archiving an archived record changed it'; end if;
end $$;

-- Archived records cannot be edited and keep their phone reserved.
select pg_temp.expect_error(format($s$ select public.update_student_record(%L, 3, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'Archived edit', '01012345678', '01112223333', 'preparatory-3', null, 'd7777777-7777-4777-8777-777777777777', 'in_person') $s$, current_setting('test.r1')), 'archived_record');
select pg_temp.expect_error($s$ select public.create_student_record('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-1111-4111-8111-dddddddddddd',
  'Reuse archived phone', '01012345678', '01112223333', 'preparatory-3', null, null, 'in_person') $s$, 'duplicate_student_phone');
reset role;
-- The group still referenced by an archived record stays protected.
select pg_temp.expect_error($s$ update public.groups set archived_at = now() where id = 'd7777777-7777-4777-8777-777777777777' $s$, '%student records%');
set local role authenticated;
set local request.jwt.claim.sub = 'd2222222-2222-4222-8222-222222222222';  -- admins restore too

do $$
declare changed uuid[];
begin
  select array_agg(id) into changed from public.set_student_records_archived('dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'dddddddd-1111-4111-8111-dddddddddddd', jsonb_build_array(jsonb_build_object('id', current_setting('test.r1'), 'version', 3)), false) as restored(id);
  if cardinality(changed) <> 1 or exists (select 1 from public.annual_student_records where id = current_setting('test.r1')::uuid and archived_at is not null) then
    raise exception 'Restore failed';
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Instructor: creates and edits contacts; cannot change placement/type or archive.
set local request.jwt.claim.sub = 'd3333333-3333-4333-8333-333333333333';
select set_config('test.r4', id::text, true) from public.create_student_record(
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-1111-4111-8111-dddddddddddd', 'Instructor Created',
  '01022223333', '01033334444', 'secondary-2', 'd5555555-5555-4555-8555-555555555555', 'd8888888-8888-4888-8888-888888888888', 'in_person');
select public.update_student_record(current_setting('test.r4')::uuid, 1, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'Instructor Renamed', '01022223334', '01033334445', 'secondary-2', 'd5555555-5555-4555-8555-555555555555', 'd8888888-8888-4888-8888-888888888888', 'in_person');
select pg_temp.expect_error(format($s$ select public.update_student_record(%L, 2, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'Instructor Renamed', '01022223334', '01033334445', 'secondary-2', 'd5555555-5555-4555-8555-555555555555', null, 'in_person') $s$, current_setting('test.r4')), 'forbidden');
select pg_temp.expect_error(format($s$ select public.update_student_record(%L, 2, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'Instructor Renamed', '01022223334', '01033334445', 'secondary-2', 'd5555555-5555-4555-8555-555555555555', 'd8888888-8888-4888-8888-888888888888', 'online_only') $s$, current_setting('test.r4')), 'forbidden');
select pg_temp.expect_error(format($s$ select public.set_student_records_archived('dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'dddddddd-1111-4111-8111-dddddddddddd', jsonb_build_array(jsonb_build_object('id', %L, 'version', 2)), true) $s$, current_setting('test.r4')), 'forbidden');
do $$ begin
  if (select count(*) from public.annual_student_records where academy_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd') <> 4 then
    raise exception 'Instructors must read every academy record';
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- List reads: search, filters, sort, paging.
set local request.jwt.claim.sub = 'd1111111-1111-4111-8111-111111111111';
do $$
declare page jsonb;
  term text;
begin
  page := public.list_student_records('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-1111-4111-8111-dddddddddddd', null, 'active', null, null, null, null, null, 0, 20);
  if (page ->> 'total')::int <> 3 or jsonb_array_length(page -> 'rows') <> 3 then raise exception 'Active list count wrong: %', page ->> 'total'; end if;
  if page -> 'rows' -> 0 ->> 'level_name' is null then raise exception 'List lacks joined labels'; end if;

  page := public.list_student_records('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-1111-4111-8111-dddddddddddd', null, 'all', null, null, null, null, null, 0, 20);
  if (page ->> 'total')::int <> 4 then raise exception 'All-status list count wrong'; end if;
  page := public.list_student_records('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-1111-4111-8111-dddddddddddd', null, 'archived', null, null, null, null, null, 0, 20);
  if (page ->> 'total')::int <> 1 then raise exception 'Archived list count wrong'; end if;

  -- Phone search works in domestic, spaced, and international forms.
  foreach term in array array['0101 234 5678', '+20 10 1234 5678', '01012345678'] loop
    page := public.list_student_records('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-1111-4111-8111-dddddddddddd', term, 'active', null, null, null, null, null, 0, 20);
    if (page ->> 'total')::int <> 1 then raise exception 'Phone search "%" found % rows', term, page ->> 'total'; end if;
  end loop;
  -- Wildcards are literal; labels and Arabic names are searchable.
  page := public.list_student_records('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-1111-4111-8111-dddddddddddd', '100%', 'all', null, null, null, null, null, 0, 20);
  if (page ->> 'total')::int <> 1 then raise exception 'Literal %% search failed'; end if;
  page := public.list_student_records('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-1111-4111-8111-dddddddddddd', '%', 'all', null, null, null, null, null, 0, 20);
  if (page ->> 'total')::int <> 1 then raise exception 'A lone %% matched more than the name containing it'; end if;
  page := public.list_student_records('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-1111-4111-8111-dddddddddddd', '_', 'all', null, null, null, null, null, 0, 20);
  if (page ->> 'total')::int <> 1 then raise exception 'A lone underscore matched as a wildcard'; end if;
  page := public.list_student_records('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-1111-4111-8111-dddddddddddd', 'science a', 'all', null, null, null, null, null, 0, 20);
  if (page ->> 'total')::int <> 2 then raise exception 'Group label search failed'; end if;
  page := public.list_student_records('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-1111-4111-8111-dddddddddddd', 'مريم', 'all', null, null, null, null, null, 0, 20);
  if (page ->> 'total')::int <> 1 then raise exception 'Arabic search failed'; end if;

  -- Filters, including no-track and unassigned.
  page := public.list_student_records('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-1111-4111-8111-dddddddddddd', null, 'all', 'secondary-2', 'd5555555-5555-4555-8555-555555555555', null, null, null, 0, 20);
  if (page ->> 'total')::int <> 2 then raise exception 'Track filter failed'; end if;
  page := public.list_student_records('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-1111-4111-8111-dddddddddddd', null, 'all', null, 'none', null, null, null, 0, 20);
  if (page ->> 'total')::int <> 2 then raise exception 'No-track filter failed'; end if;
  page := public.list_student_records('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-1111-4111-8111-dddddddddddd', null, 'all', null, null, 'none', null, null, 0, 20);
  if (page ->> 'total')::int <> 0 then raise exception 'Unassigned filter failed'; end if;
  page := public.list_student_records('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-1111-4111-8111-dddddddddddd', null, 'all', null, null, null, 'online_only', null, 0, 20);
  if (page ->> 'total')::int <> 1 then raise exception 'Type filter failed'; end if;

  -- Multi-column sort with a stable tie-break, and paging past the end keeps the total.
  page := public.list_student_records('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-1111-4111-8111-dddddddddddd', null, 'all', null, null, null, null,
    '[{"id":"level","desc":true},{"id":"name","desc":false}]'::jsonb, 0, 10);
  if page -> 'rows' -> 0 ->> 'level_id' <> 'secondary-2' then raise exception 'Level sort failed'; end if;
  page := public.list_student_records('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-1111-4111-8111-dddddddddddd', null, 'all', null, null, null, null,
    '[{"id":"track","desc":false}]'::jsonb, 0, 10);
  if page -> 'rows' -> 3 ->> 'track_name' is not null then raise exception 'Absent tracks did not sort last'; end if;
  page := public.list_student_records('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-1111-4111-8111-dddddddddddd', null, 'all', null, null, null, null, null, 5, 10);
  if (page ->> 'total')::int <> 4 or jsonb_array_length(page -> 'rows') <> 0 then raise exception 'Out-of-range page failed'; end if;
end $$;
select pg_temp.expect_error($s$ select public.list_student_records('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-1111-4111-8111-dddddddddddd',
  null, 'active', null, null, null, null, '[{"id":"full_name; drop table x","desc":false}]'::jsonb, 0, 20) $s$, 'validation');
select pg_temp.expect_error($s$ select public.list_student_records('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-1111-4111-8111-dddddddddddd',
  null, 'active', null, null, null, null, null, 0, 25) $s$, 'validation');

-- ---------------------------------------------------------------------------------------------
-- Other academies, non-members, and anonymous callers.
set local request.jwt.claim.sub = 'e1111111-1111-4111-8111-111111111111';
do $$ begin
  if exists (select 1 from public.annual_student_records where academy_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd')
    or exists (select 1 from public.academy_student_profiles where academy_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd') then
    raise exception 'Another academy can read D student records';
  end if;
end $$;
select pg_temp.expect_error($s$ select public.list_student_records('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-1111-4111-8111-dddddddddddd',
  null, 'active', null, null, null, null, null, 0, 20) $s$, 'forbidden');
select pg_temp.expect_error($s$ select public.create_student_record('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-1111-4111-8111-dddddddddddd',
  'Intruder', '01200000001', '01112223333', 'preparatory-3', null, null, 'in_person') $s$, 'forbidden');
select pg_temp.expect_error(format($s$ select public.update_student_record(%L, 2, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'Hijack', '01022223334', '01033334445', 'preparatory-3', null, null, 'in_person') $s$, current_setting('test.r4')), 'not_found');
select pg_temp.expect_error(format($s$ select public.set_student_records_archived('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'eeeeeeee-1111-4111-8111-eeeeeeeeeeee', jsonb_build_array(jsonb_build_object('id', %L, 'version', 2)), true) $s$, current_setting('test.r4')), 'not_found');

set local request.jwt.claim.sub = 'f1111111-1111-4111-8111-111111111111';
do $$ begin
  if exists (select 1 from public.annual_student_records) then raise exception 'A non-member can read student records'; end if;
end $$;
select pg_temp.expect_error($s$ select public.create_student_record('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-1111-4111-8111-dddddddddddd',
  'Outsider', '01200000002', '01112223333', 'preparatory-3', null, null, 'in_person') $s$, 'forbidden');

set local role anon;
select pg_temp.expect_error($s$ select public.create_student_record('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-1111-4111-8111-dddddddddddd',
  'Anonymous', '01200000003', '01112223333', 'preparatory-3', null, null, 'in_person') $s$, 'permission denied%');
select pg_temp.expect_error($s$ select count(*) from public.annual_student_records $s$, 'permission denied%');

-- ---------------------------------------------------------------------------------------------
-- Closed years reject every student mutation.
reset role;
update public.academic_years set closed_at = now() where id = 'dddddddd-1111-4111-8111-dddddddddddd';
set local role authenticated;
set local request.jwt.claim.sub = 'd1111111-1111-4111-8111-111111111111';
select pg_temp.expect_error($s$ select public.create_student_record('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-1111-4111-8111-dddddddddddd',
  'Closed year', '01200000004', '01112223333', 'preparatory-3', null, null, 'in_person') $s$, 'year_unavailable');
select pg_temp.expect_error(format($s$ select public.update_student_record(%L, 2, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'Closed edit', '01022223334', '01033334445', 'secondary-2', 'd5555555-5555-4555-8555-555555555555', 'd8888888-8888-4888-8888-888888888888', 'in_person') $s$, current_setting('test.r4')), 'year_unavailable');
select pg_temp.expect_error(format($s$ select public.set_student_records_archived('dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'dddddddd-1111-4111-8111-dddddddddddd', jsonb_build_array(jsonb_build_object('id', %L, 'version', 2)), true) $s$, current_setting('test.r4')), 'year_unavailable');

rollback;
