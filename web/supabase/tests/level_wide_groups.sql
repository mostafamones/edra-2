-- Level-wide group placement: a group with a null track accepts students of its level with or
-- without a track; a track-specific group requires the same level and track.
-- Run with `npm run test:db` against the marked isolated test target (see docs/engineering.md).
-- Everything runs in one transaction that is rolled back. Generated ids are kept in custom settings.

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

insert into auth.users (id) values
  ('a1111111-1111-4111-8111-a11111111111'),  -- owner of L
  ('a2222222-2222-4222-8222-a22222222222'),  -- instructor of L
  ('b1111111-1111-4111-8111-b11111111111');  -- owner of M

insert into public.academies (id, name, slug, icon, subject, created_by) values
  ('a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0', 'Academy L', 'academy-lw-l', 'school', 'Math', 'a1111111-1111-4111-8111-a11111111111'),
  ('b0b0b0b0-b0b0-4b0b-8b0b-b0b0b0b0b0b0', 'Academy M', 'academy-lw-m', 'school', 'Math', 'b1111111-1111-4111-8111-b11111111111');
update public.academic_years set id = 'a0a0a0a0-1111-4111-8111-a0a0a0a0a0a0', start_year = 2031
where academy_id = 'a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0';
update public.academic_years set id = 'b0b0b0b0-1111-4111-8111-b0b0b0b0b0b0', start_year = 2031
where academy_id = 'b0b0b0b0-b0b0-4b0b-8b0b-b0b0b0b0b0b0';

insert into public.academy_memberships (academy_id, user_id, role, created_by) values
  ('a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0', 'a1111111-1111-4111-8111-a11111111111', 'owner', 'a1111111-1111-4111-8111-a11111111111'),
  ('a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0', 'a2222222-2222-4222-8222-a22222222222', 'instructor', 'a1111111-1111-4111-8111-a11111111111'),
  ('b0b0b0b0-b0b0-4b0b-8b0b-b0b0b0b0b0b0', 'b1111111-1111-4111-8111-b11111111111', 'owner', 'b1111111-1111-4111-8111-b11111111111');

insert into public.academy_levels (academy_id, level_id, sort_order) values
  ('a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0', 'preparatory-3', 9),
  ('a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0', 'secondary-2', 11),
  ('b0b0b0b0-b0b0-4b0b-8b0b-b0b0b0b0b0b0', 'secondary-2', 11);
insert into public.academy_tracks (id, academy_id, level_id, name, sort_order) values
  ('a5555555-5555-4555-8555-a55555555555', 'a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0', 'secondary-2', 'Scientific', 1),
  ('a6666666-6666-4666-8666-a66666666666', 'a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0', 'secondary-2', 'Literature', 2),
  ('b5555555-5555-4555-8555-b55555555555', 'b0b0b0b0-b0b0-4b0b-8b0b-b0b0b0b0b0b0', 'secondary-2', 'Scientific', 1);

-- Level-wide groups may be created at a level that offers tracks; a foreign track is rejected.
insert into public.groups (id, academy_id, academic_year_id, level_id, track_id, name) values
  ('a7000000-0000-4000-8000-a70000000001', 'a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0', 'a0a0a0a0-1111-4111-8111-a0a0a0a0a0a0', 'secondary-2', null, 'Level 11 all'),
  ('a7000000-0000-4000-8000-a70000000002', 'a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0', 'a0a0a0a0-1111-4111-8111-a0a0a0a0a0a0', 'secondary-2', 'a5555555-5555-4555-8555-a55555555555', 'Scientific A'),
  ('a7000000-0000-4000-8000-a70000000003', 'a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0', 'a0a0a0a0-1111-4111-8111-a0a0a0a0a0a0', 'secondary-2', 'a6666666-6666-4666-8666-a66666666666', 'Literature A'),
  ('a7000000-0000-4000-8000-a70000000004', 'a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0', 'a0a0a0a0-1111-4111-8111-a0a0a0a0a0a0', 'preparatory-3', null, 'Nine all'),
  ('a7000000-0000-4000-8000-a70000000005', 'a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0', 'a0a0a0a0-1111-4111-8111-a0a0a0a0a0a0', 'secondary-2', null, 'Level 11 archived'),
  ('b7000000-0000-4000-8000-b70000000001', 'b0b0b0b0-b0b0-4b0b-8b0b-b0b0b0b0b0b0', 'b0b0b0b0-1111-4111-8111-b0b0b0b0b0b0', 'secondary-2', null, 'M level 11 all');
update public.groups set archived_at = now() where id = 'a7000000-0000-4000-8000-a70000000005';
select pg_temp.expect_error($s$ insert into public.groups (academy_id, academic_year_id, level_id, track_id, name)
  values ('a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0', 'a0a0a0a0-1111-4111-8111-a0a0a0a0a0a0', 'secondary-2', 'b5555555-5555-4555-8555-b55555555555', 'Foreign track') $s$, '%foreign key%');
select pg_temp.expect_error($s$ insert into public.groups (academy_id, academic_year_id, level_id, track_id, name)
  values ('a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0', 'a0a0a0a0-1111-4111-8111-a0a0a0a0a0a0', 'preparatory-3', 'a5555555-5555-4555-8555-a55555555555', 'Other level track') $s$, '%foreign key%');

grant usage on schema public, auth to authenticated, anon;

-- ---------------------------------------------------------------------------------------------
-- Individual creation and edit.
set local role authenticated;
set local request.jwt.claim.sub = 'a1111111-1111-4111-8111-a11111111111';

select set_config('test.sci', id::text, true) from public.create_student_record(
  'a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0', 'a0a0a0a0-1111-4111-8111-a0a0a0a0a0a0', 'Scientific One', '01500000001', '01200000000',
  'secondary-2', 'a5555555-5555-4555-8555-a55555555555', 'a7000000-0000-4000-8000-a70000000001', 'in_person');
select set_config('test.lit', id::text, true) from public.create_student_record(
  'a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0', 'a0a0a0a0-1111-4111-8111-a0a0a0a0a0a0', 'Literature One', '01500000002', '01200000000',
  'secondary-2', 'a6666666-6666-4666-8666-a66666666666', 'a7000000-0000-4000-8000-a70000000001', 'in_person');
select set_config('test.sci2', id::text, true) from public.create_student_record(
  'a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0', 'a0a0a0a0-1111-4111-8111-a0a0a0a0a0a0', 'Scientific Two', '01500000003', '01200000000',
  'secondary-2', 'a5555555-5555-4555-8555-a55555555555', 'a7000000-0000-4000-8000-a70000000002', 'in_person');
-- A trackless student at a level without tracks joins that level's level-wide group.
select set_config('test.nine', id::text, true) from public.create_student_record(
  'a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0', 'a0a0a0a0-1111-4111-8111-a0a0a0a0a0a0', 'Nine One', '01500000004', '01200000000',
  'preparatory-3', null, 'a7000000-0000-4000-8000-a70000000004', 'in_person');
-- Tracks stay on the students.
do $$ begin
  if (select count(*) from public.annual_student_records
      where id in (current_setting('test.sci')::uuid, current_setting('test.lit')::uuid)
        and primary_group_id = 'a7000000-0000-4000-8000-a70000000001'
        and track_id is not null) <> 2 then
    raise exception 'Level-wide placement did not keep each student''s track';
  end if;
end $$;

select pg_temp.expect_error($s$ select public.create_student_record('a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0', 'a0a0a0a0-1111-4111-8111-a0a0a0a0a0a0',
  'Sci in Lit', '01500000010', '01200000000', 'secondary-2', 'a5555555-5555-4555-8555-a55555555555', 'a7000000-0000-4000-8000-a70000000003', 'in_person') $s$, 'invalid_placement');
select pg_temp.expect_error($s$ select public.create_student_record('a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0', 'a0a0a0a0-1111-4111-8111-a0a0a0a0a0a0',
  'Other level', '01500000011', '01200000000', 'preparatory-3', null, 'a7000000-0000-4000-8000-a70000000001', 'in_person') $s$, 'invalid_placement');
select pg_temp.expect_error($s$ select public.create_student_record('a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0', 'a0a0a0a0-1111-4111-8111-a0a0a0a0a0a0',
  'Archived all', '01500000012', '01200000000', 'secondary-2', 'a5555555-5555-4555-8555-a55555555555', 'a7000000-0000-4000-8000-a70000000005', 'in_person') $s$, 'invalid_placement');
select pg_temp.expect_error($s$ select public.create_student_record('a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0', 'a0a0a0a0-1111-4111-8111-a0a0a0a0a0a0',
  'Other academy', '01500000013', '01200000000', 'secondary-2', 'a5555555-5555-4555-8555-a55555555555', 'b7000000-0000-4000-8000-b70000000001', 'in_person') $s$, 'invalid_placement');
-- A level that offers tracks still requires the student's own track.
select pg_temp.expect_error($s$ select public.create_student_record('a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0', 'a0a0a0a0-1111-4111-8111-a0a0a0a0a0a0',
  'No track', '01500000014', '01200000000', 'secondary-2', null, 'a7000000-0000-4000-8000-a70000000001', 'in_person') $s$, 'invalid_placement');

-- Switching track keeps a level-wide group but rejects a track-specific group of the old track.
select public.update_student_record(current_setting('test.sci')::uuid, 1, 'a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0',
  'Scientific One', '01500000001', '01200000000', 'secondary-2', 'a6666666-6666-4666-8666-a66666666666',
  'a7000000-0000-4000-8000-a70000000001', 'in_person');
select pg_temp.expect_error(format($s$ select public.update_student_record(%L, 2, 'a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0',
  'Scientific One', '01500000001', '01200000000', 'secondary-2', 'a6666666-6666-4666-8666-a66666666666',
  'a7000000-0000-4000-8000-a70000000002', 'in_person') $s$, current_setting('test.sci')), 'invalid_placement');
select pg_temp.expect_error(format($s$ select public.update_student_record(%L, 1, 'a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0',
  'Stale', '01500000001', '01200000000', 'secondary-2', 'a6666666-6666-4666-8666-a66666666666',
  'a7000000-0000-4000-8000-a70000000001', 'in_person') $s$, current_setting('test.sci')), 'stale_record');

-- ---------------------------------------------------------------------------------------------
-- Bulk moves.
select public.set_student_records_group('a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0', 'a0a0a0a0-1111-4111-8111-a0a0a0a0a0a0',
  jsonb_build_array(jsonb_build_object('id', current_setting('test.sci2'), 'version', 1),
                    jsonb_build_object('id', current_setting('test.lit'), 'version', 1)),
  'a7000000-0000-4000-8000-a70000000001');
do $$ begin
  if (select count(*) from public.annual_student_records
      where id in (current_setting('test.sci2')::uuid, current_setting('test.lit')::uuid)
        and primary_group_id = 'a7000000-0000-4000-8000-a70000000001') <> 2
    or (select version from public.annual_student_records where id = current_setting('test.sci2')::uuid) <> 2
    or (select version from public.annual_student_records where id = current_setting('test.lit')::uuid) <> 1 then
    raise exception 'Mixed-track bulk move into the level-wide group failed';
  end if;
end $$;
-- Mixed tracks cannot enter a track-specific group; mixed levels cannot share any destination.
select pg_temp.expect_error(format($s$ select public.set_student_records_group('a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0', 'a0a0a0a0-1111-4111-8111-a0a0a0a0a0a0',
  jsonb_build_array(jsonb_build_object('id', %L, 'version', 2), jsonb_build_object('id', %L, 'version', 1)), 'a7000000-0000-4000-8000-a70000000002') $s$,
  current_setting('test.sci2'), current_setting('test.lit')), 'incompatible_selection');
select pg_temp.expect_error(format($s$ select public.set_student_records_group('a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0', 'a0a0a0a0-1111-4111-8111-a0a0a0a0a0a0',
  jsonb_build_array(jsonb_build_object('id', %L, 'version', 2), jsonb_build_object('id', %L, 'version', 1)), 'a7000000-0000-4000-8000-a70000000001') $s$,
  current_setting('test.sci2'), current_setting('test.nine')), 'incompatible_selection');
select pg_temp.expect_error(format($s$ select public.set_student_records_group('a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0', 'a0a0a0a0-1111-4111-8111-a0a0a0a0a0a0',
  jsonb_build_array(jsonb_build_object('id', %L, 'version', 2)), 'a7000000-0000-4000-8000-a70000000005') $s$,
  current_setting('test.sci2')), 'invalid_placement');

-- An instructor cannot change placement in bulk.
set local request.jwt.claim.sub = 'a2222222-2222-4222-8222-a22222222222';
select pg_temp.expect_error(format($s$ select public.set_student_records_group('a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0', 'a0a0a0a0-1111-4111-8111-a0a0a0a0a0a0',
  jsonb_build_array(jsonb_build_object('id', %L, 'version', 2)), null) $s$, current_setting('test.sci2')), 'forbidden');
set local request.jwt.claim.sub = 'a1111111-1111-4111-8111-a11111111111';
reset role;

-- ---------------------------------------------------------------------------------------------
-- Import resolution keeps the student's own track and never picks between same-name candidates.
do $$
declare r record;
begin
  -- A level-wide group chosen by id fits a student of any track at the level.
  select * into r from public.resolve_student_import_row('a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0', 'a0a0a0a0-1111-4111-8111-a0a0a0a0a0a0', '{}'::jsonb, null,
    jsonb_build_object('full_name', 'Import Lit', 'student_phone', '01500000020', 'parent_phone', '01200000000', 'level_id', 'secondary-2',
      'track_id', 'a6666666-6666-4666-8666-a66666666666', 'primary_group_id', 'a7000000-0000-4000-8000-a70000000001', 'participation_type', 'in_person'));
  if r.issues <> '[]'::jsonb or r.input ->> 'primary_group_id' <> 'a7000000-0000-4000-8000-a70000000001'
    or r.input ->> 'track_id' <> 'a6666666-6666-4666-8666-a66666666666' then
    raise exception 'Level-wide group was not accepted for an import row: %', r;
  end if;
  -- A track-specific group of another track is incompatible.
  select * into r from public.resolve_student_import_row('a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0', 'a0a0a0a0-1111-4111-8111-a0a0a0a0a0a0', '{}'::jsonb, null,
    jsonb_build_object('full_name', 'Import Lit', 'student_phone', '01500000020', 'parent_phone', '01200000000', 'level_id', 'secondary-2',
      'track_id', 'a6666666-6666-4666-8666-a66666666666', 'primary_group_id', 'a7000000-0000-4000-8000-a70000000002', 'participation_type', 'in_person'));
  if r.issues <> '[{"field": "group", "code": "incompatible"}]'::jsonb then
    raise exception 'Wrong-track group was not flagged incompatible: %', r.issues;
  end if;
  -- The default group fills a blank only when compatible; it does not set the student's track.
  select * into r from public.resolve_student_import_row('a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0', 'a0a0a0a0-1111-4111-8111-a0a0a0a0a0a0',
    jsonb_build_object('primary_group_id', 'a7000000-0000-4000-8000-a70000000001'),
    jsonb_build_object('full_name', 'Default group', 'student_phone', '01500000021', 'parent_phone', '01200000000', 'level', 'secondary-2',
      'track', 'a5555555-5555-4555-8555-a55555555555', 'student_type', 'in_person'), null);
  if r.input ->> 'primary_group_id' is distinct from 'a7000000-0000-4000-8000-a70000000001'
    or r.input ->> 'track_id' is distinct from 'a5555555-5555-4555-8555-a55555555555' then
    raise exception 'Default level-wide group was not applied: %', r;
  end if;
  -- Same name at the level: level-wide and track-specific candidates stay ambiguous.
  insert into public.groups (id, academy_id, academic_year_id, level_id, track_id, name) values
    ('a7000000-0000-4000-8000-a70000000006', 'a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0', 'a0a0a0a0-1111-4111-8111-a0a0a0a0a0a0', 'secondary-2', null, 'Twin'),
    ('a7000000-0000-4000-8000-a70000000007', 'a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0', 'a0a0a0a0-1111-4111-8111-a0a0a0a0a0a0', 'secondary-2', 'a5555555-5555-4555-8555-a55555555555', 'Twin');
  select * into r from public.resolve_student_import_row('a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0', 'a0a0a0a0-1111-4111-8111-a0a0a0a0a0a0', '{}'::jsonb,
    jsonb_build_object('full_name', 'Twin', 'student_phone', '01500000022', 'parent_phone', '01200000000', 'level', 'secondary-2',
      'track', 'a5555555-5555-4555-8555-a55555555555', 'group', 'Twin', 'student_type', 'in_person'), null);
  if r.issues <> '[{"field": "group", "code": "ambiguous"}]'::jsonb then
    raise exception 'Same-name groups were not ambiguous: %', r.issues;
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Closed years reject the writes.
update public.academic_years set closed_at = now() where id = 'a0a0a0a0-1111-4111-8111-a0a0a0a0a0a0';
set local role authenticated;
set local request.jwt.claim.sub = 'a1111111-1111-4111-8111-a11111111111';
select pg_temp.expect_error(format($s$ select public.set_student_records_group('a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0', 'a0a0a0a0-1111-4111-8111-a0a0a0a0a0a0',
  jsonb_build_array(jsonb_build_object('id', %L, 'version', 2)), 'a7000000-0000-4000-8000-a70000000001') $s$, current_setting('test.sci2')), 'year_unavailable');

rollback;
