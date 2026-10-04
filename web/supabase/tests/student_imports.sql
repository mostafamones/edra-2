-- Student imports and bulk group changes: RLS, grants, staging, validation, duplicates, corrections,
-- confirmation, batch processing, idempotency, year closure, and set_student_records_group.
-- Run with `npm run test:db` after replaying all migrations on a disposable database. Everything runs
-- in one transaction that is rolled back. Generated ids are kept in custom settings.

do $$ begin
  if not (select relrowsecurity from pg_class where oid = 'public.student_import_sessions'::regclass)
    or not (select relrowsecurity from pg_class where oid = 'public.student_import_rows'::regclass)
    or has_table_privilege('anon', 'public.student_import_sessions', 'select')
    or has_table_privilege('authenticated', 'public.student_import_sessions', 'insert')
    or has_table_privilege('authenticated', 'public.student_import_sessions', 'update')
    or has_table_privilege('authenticated', 'public.student_import_rows', 'insert')
    or has_table_privilege('authenticated', 'public.student_import_rows', 'update')
    or has_table_privilege('authenticated', 'public.student_import_rows', 'delete') then
    raise exception 'Import tables lack RLS or allow direct writes';
  end if;
  if has_function_privilege('anon', 'public.process_student_import_batch(uuid, integer)', 'execute')
    or has_function_privilege('anon', 'public.set_student_records_group(uuid, uuid, jsonb, uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.refresh_student_import(uuid, integer)', 'execute')
    or has_function_privilege('authenticated', 'public.resolve_student_import_row(uuid, uuid, jsonb, jsonb, jsonb)', 'execute')
    or has_function_privilege('authenticated', 'public.lock_student_import_session(uuid)', 'execute')
    or not has_function_privilege('authenticated', 'public.stage_student_import_rows(uuid, jsonb)', 'execute') then
    raise exception 'Import RPC grants are wrong';
  end if;
  if public.normalize_import_label('  Science   A ') <> 'science a'
    or public.normalize_import_label('ＧＲＡＤＥ　９') <> 'grade 9'
    or public.normalize_import_label('   ') is not null then
    raise exception 'Label normalization is wrong';
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

-- Fails unless the row's status (and optionally the issue codes, as "field:code" text) match.
create function pg_temp.expect_row(p_ordinal integer, p_status text, p_issues text[] default null) returns void language plpgsql as $$
declare r public.student_import_rows%rowtype; codes text[];
begin
  select * into r from public.student_import_rows where session_id = current_setting('test.s1')::uuid and ordinal = p_ordinal;
  select coalesce(array_agg((i ->> 'field') || ':' || (i ->> 'code') order by (i ->> 'field'), (i ->> 'code')), '{}')
  into codes from jsonb_array_elements(r.issues) i;
  if r.status is distinct from p_status or (p_issues is not null and codes <> p_issues) then
    raise exception 'row % expected % % but was % % (%)', p_ordinal, p_status, p_issues, r.status, codes, r.input;
  end if;
end;
$$;

insert into auth.users (id) values
  ('71111111-1111-4111-8111-111111111111'),  -- owner of G
  ('72222222-2222-4222-8222-222222222222'),  -- admin of G
  ('73333333-3333-4333-8333-333333333333'),  -- instructor of G
  ('74444444-4444-4444-8444-444444444444'),  -- owner of H
  ('75555555-5555-4555-8555-555555555555');  -- no membership

insert into public.academies (id, name, slug, icon, subject, created_by) values
  ('77777777-7777-4777-8777-777777777777', 'Academy G', 'academy-g', 'school', 'Math', '71111111-1111-4111-8111-111111111111'),
  ('78888888-8888-4888-8888-888888888888', 'Academy H', 'academy-h', 'school', 'Math', '74444444-4444-4444-8444-444444444444');
update public.academic_years set id = '77777777-1111-4111-8111-777777777777', start_year = 2030
where academy_id = '77777777-7777-4777-8777-777777777777';
update public.academic_years set id = '78888888-1111-4111-8111-888888888888', start_year = 2030
where academy_id = '78888888-8888-4888-8888-888888888888';
insert into public.academy_memberships (academy_id, user_id, role, created_by) values
  ('77777777-7777-4777-8777-777777777777', '71111111-1111-4111-8111-111111111111', 'owner', '71111111-1111-4111-8111-111111111111'),
  ('77777777-7777-4777-8777-777777777777', '72222222-2222-4222-8222-222222222222', 'admin', '71111111-1111-4111-8111-111111111111'),
  ('77777777-7777-4777-8777-777777777777', '73333333-3333-4333-8333-333333333333', 'instructor', '71111111-1111-4111-8111-111111111111'),
  ('78888888-8888-4888-8888-888888888888', '74444444-4444-4444-8444-444444444444', 'owner', '74444444-4444-4444-8444-444444444444');

insert into public.academy_levels (academy_id, level_id, sort_order) values
  ('77777777-7777-4777-8777-777777777777', 'grade-9', 9),
  ('77777777-7777-4777-8777-777777777777', 'grade-11', 11),
  ('78888888-8888-4888-8888-888888888888', 'grade-9', 9);
insert into public.academy_tracks (id, academy_id, level_id, name, sort_order) values
  ('7a111111-1111-4111-8111-111111111111', '77777777-7777-4777-8777-777777777777', 'grade-11', 'Science', 1),
  ('7a222222-2222-4222-8222-222222222222', '77777777-7777-4777-8777-777777777777', 'grade-11', 'Dup', 2),
  ('7a333333-3333-4333-8333-333333333333', '77777777-7777-4777-8777-777777777777', 'grade-11', 'dup', 3);
insert into public.groups (id, academy_id, academic_year_id, level_id, track_id, name) values
  ('7b111111-1111-4111-8111-111111111111', '77777777-7777-4777-8777-777777777777', '77777777-1111-4111-8111-777777777777', 'grade-9', null, 'Nine A'),
  ('7b222222-2222-4222-8222-222222222222', '77777777-7777-4777-8777-777777777777', '77777777-1111-4111-8111-777777777777', 'grade-9', null, 'Nine B'),
  ('7b333333-3333-4333-8333-333333333333', '77777777-7777-4777-8777-777777777777', '77777777-1111-4111-8111-777777777777', 'grade-11', '7a111111-1111-4111-8111-111111111111', 'Science A'),
  ('7b444444-4444-4444-8444-444444444444', '77777777-7777-4777-8777-777777777777', '77777777-1111-4111-8111-777777777777', 'grade-9', null, 'Nine archived'),
  ('7b555555-5555-4555-8555-555555555555', '78888888-8888-4888-8888-888888888888', '78888888-1111-4111-8111-888888888888', 'grade-9', null, 'H group');
update public.groups set archived_at = now() where id = '7b444444-4444-4444-8444-444444444444';

grant usage on schema public, auth to authenticated, anon;

-- ---------------------------------------------------------------------------------------------
-- Existing records: one active and one archived phone.
set local role authenticated;
set local request.jwt.claim.sub = '71111111-1111-4111-8111-111111111111';
select public.create_student_record('77777777-7777-4777-8777-777777777777', '77777777-1111-4111-8111-777777777777',
  'Existing Active', '01000000001', '01200000000', 'grade-9', null, null, 'in_person');
select set_config('test.archived', id::text, true) from public.create_student_record('77777777-7777-4777-8777-777777777777',
  '77777777-1111-4111-8111-777777777777', 'Existing Archived', '01000000002', '01200000000', 'grade-9', null, null, 'in_person');
select public.set_student_records_archived('77777777-7777-4777-8777-777777777777', '77777777-1111-4111-8111-777777777777',
  jsonb_build_array(jsonb_build_object('id', current_setting('test.archived'), 'version', 1)), true);

-- ---------------------------------------------------------------------------------------------
-- Starting: managers only, the open year only, and defaults from this academy.
set local request.jwt.claim.sub = '73333333-3333-4333-8333-333333333333';
select pg_temp.expect_error($s$ select public.start_student_import('77777777-7777-4777-8777-777777777777', '77777777-1111-4111-8111-777777777777',
  'students.csv', 'csv', null, 1, '{}', null) $s$, 'forbidden');
set local request.jwt.claim.sub = '72222222-2222-4222-8222-222222222222';
select pg_temp.expect_error($s$ select public.start_student_import('77777777-7777-4777-8777-777777777777', '78888888-1111-4111-8111-888888888888',
  'students.csv', 'csv', null, 1, '{}', null) $s$, 'year_unavailable');
select pg_temp.expect_error($s$ select public.start_student_import('77777777-7777-4777-8777-777777777777', '77777777-1111-4111-8111-777777777777',
  'students.csv', 'csv', null, 5001, '{}', null) $s$, 'validation');
select pg_temp.expect_error($s$ select public.start_student_import('77777777-7777-4777-8777-777777777777', '77777777-1111-4111-8111-777777777777',
  'students.csv', 'csv', null, 1, '{"primary_group_id": "7b555555-5555-4555-8555-555555555555"}', null) $s$, 'validation');
select pg_temp.expect_error($s$ select public.start_student_import('77777777-7777-4777-8777-777777777777', '77777777-1111-4111-8111-777777777777',
  'students.csv', 'csv', null, 1, '{"unknown": "x"}', null) $s$, 'validation');

select set_config('test.s0', public.start_student_import('77777777-7777-4777-8777-777777777777', '77777777-1111-4111-8111-777777777777',
  'first.csv', 'csv', null, 15, '{}', null)::text, true);
-- A replacement draft cancels the session it replaces.
select set_config('test.s1', public.start_student_import('77777777-7777-4777-8777-777777777777', '77777777-1111-4111-8111-777777777777',
  'students.csv', 'csv', null, 15,
  '{"level_id": "grade-9", "participation_type": "in_person", "primary_group_id": "7b111111-1111-4111-8111-111111111111"}',
  current_setting('test.s0')::uuid)::text, true);
do $$ begin
  if (select state from public.student_import_sessions where id = current_setting('test.s0')::uuid) <> 'cancelled' then
    raise exception 'The replaced session was not cancelled';
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Staging: idempotent retries, conflicts, shape checks, and completeness.
select public.stage_student_import_rows(current_setting('test.s1')::uuid, $j$[
  {"ordinal": 1, "source_row": 2, "values": {"full_name": "Row One", "student_phone": "01100000001", "parent_phone": "01200000000", "level": "Grade 9", "group": "nine b", "student_type": "In person"}},
  {"ordinal": 2, "source_row": 3, "values": {"full_name": "Row Two", "student_phone": "1100000002", "parent_phone": "01200000000", "level": "grade-11", "track": "science"}},
  {"ordinal": 3, "source_row": 4, "values": {"full_name": "Dup Active", "student_phone": "+20 10 0000 0001", "parent_phone": "01200000000"}},
  {"ordinal": 4, "source_row": 5, "values": {"full_name": "Dup Archived", "student_phone": "01000000002", "parent_phone": "01200000000"}},
  {"ordinal": 5, "source_row": 6, "values": {"full_name": "File Dup A", "student_phone": "01100000005", "parent_phone": "01200000000"}},
  {"ordinal": 6, "source_row": 7, "values": {"full_name": "File Dup B", "student_phone": "00201100000005", "parent_phone": "01200000000"}},
  {"ordinal": 7, "source_row": 8, "values": {"full_name": "Bad", "student_phone": "01100000007", "parent_phone": "12345", "level": "Grade 11"}},
  {"ordinal": 8, "source_row": 9, "values": {"full_name": "Explicit none", "student_phone": "01100000008", "parent_phone": "01200000000", "group": "Unassigned"}}
]$j$::jsonb);
-- The same chunk again (a lost response) is accepted.
select public.stage_student_import_rows(current_setting('test.s1')::uuid, $j$[
  {"ordinal": 1, "source_row": 2, "values": {"full_name": "Row One", "student_phone": "01100000001", "parent_phone": "01200000000", "level": "Grade 9", "group": "nine b", "student_type": "In person"}}
]$j$::jsonb);
select pg_temp.expect_error(format($s$ select public.stage_student_import_rows(%L, '[{"ordinal": 1, "source_row": 2, "values": {"full_name": "Changed"}}]') $s$,
  current_setting('test.s1')), 'stage_conflict');
select pg_temp.expect_error(format($s$ select public.stage_student_import_rows(%L, '[{"ordinal": 16, "source_row": 2, "values": {}}]') $s$,
  current_setting('test.s1')), 'validation');
select pg_temp.expect_error(format($s$ select public.stage_student_import_rows(%L, '[{"ordinal": 9, "source_row": 2, "values": {"notes": "x"}}]') $s$,
  current_setting('test.s1')), 'validation');
select pg_temp.expect_error(format($s$ select public.stage_student_import_rows(%L, '[{"ordinal": 9, "source_row": 2, "values": {"full_name": 5}}]') $s$,
  current_setting('test.s1')), 'validation');
select pg_temp.expect_error(format($s$ select public.stage_student_import_rows(%L, jsonb_build_array(jsonb_build_object('ordinal', 9, 'source_row', 2,
  'values', jsonb_build_object('full_name', repeat('x', 2001))))) $s$, current_setting('test.s1')), 'validation');
select pg_temp.expect_error(format($s$ select public.finalize_student_import(%L) $s$, current_setting('test.s1')), 'incomplete_staging');

-- Other users cannot touch the session: another admin's view, another academy, an instructor.
set local request.jwt.claim.sub = '71111111-1111-4111-8111-111111111111';
select pg_temp.expect_error(format($s$ select public.finalize_student_import(%L) $s$, current_setting('test.s1')), 'not_found');
set local request.jwt.claim.sub = '74444444-4444-4444-8444-444444444444';
select pg_temp.expect_error(format($s$ select public.stage_student_import_rows(%L, '[{"ordinal": 9, "source_row": 2, "values": {}}]') $s$,
  current_setting('test.s1')), 'not_found');
do $$ begin
  if exists (select 1 from public.student_import_sessions) or exists (select 1 from public.student_import_rows) then
    raise exception 'Another academy can read import sessions';
  end if;
end $$;
set local request.jwt.claim.sub = '73333333-3333-4333-8333-333333333333';
do $$ begin
  if exists (select 1 from public.student_import_rows) or public.student_import_summary(current_setting('test.s1')::uuid) is not null then
    raise exception 'Instructors can read import rows';
  end if;
end $$;

set local request.jwt.claim.sub = '72222222-2222-4222-8222-222222222222';
select public.stage_student_import_rows(current_setting('test.s1')::uuid, $j$[
  {"ordinal": 9, "source_row": 10, "values": {"full_name": "Json null", "student_phone": "01100000009", "parent_phone": "01200000000", "group": null}},
  {"ordinal": 10, "source_row": 11, "values": {"full_name": "Default group", "student_phone": "01100000010", "parent_phone": "01200000000"}},
  {"ordinal": 11, "source_row": 12, "values": {"full_name": {"problem": "formula"}, "student_phone": "01100000011", "parent_phone": "01200000000", "level": "grade-11", "track": "DUP"}},
  {"ordinal": 12, "source_row": 13, "values": {"full_name": "Unknowns", "student_phone": "01100000012", "parent_phone": "01200000000", "level": "Grade 99", "student_type": "hybrid"}},
  {"ordinal": 13, "source_row": 14, "values": {"full_name": "Wrong program", "student_phone": "01100000013", "parent_phone": "01200000000", "group": "Science A"}},
  {"ordinal": 14, "source_row": 15, "values": {"student_phone": "01100000014", "parent_phone": "01200000000"}},
  {"ordinal": 15, "source_row": 16, "values": {"full_name": "Fifteen", "student_phone": "011 0000 0014", "parent_phone": "01200000000"}}
]$j$::jsonb);
select set_config('test.rev', public.finalize_student_import(current_setting('test.s1')::uuid)::text, true);

-- ---------------------------------------------------------------------------------------------
-- Validation and duplicate statuses.
select pg_temp.expect_row(1, 'ready', '{}');
select pg_temp.expect_row(2, 'ready', '{}');
select pg_temp.expect_row(3, 'duplicate_existing');
select pg_temp.expect_row(4, 'duplicate_existing');
select pg_temp.expect_row(5, 'duplicate_file');
select pg_temp.expect_row(6, 'duplicate_file');
select pg_temp.expect_row(7, 'invalid', '{parent_phone:invalid_phone,track:required}');
select pg_temp.expect_row(8, 'ready', '{}');
select pg_temp.expect_row(9, 'ready', '{}');
select pg_temp.expect_row(10, 'ready', '{}');
select pg_temp.expect_row(11, 'invalid', '{full_name:unsupported,track:ambiguous}');
select pg_temp.expect_row(12, 'invalid', '{level:unknown,student_type:unknown}');
select pg_temp.expect_row(13, 'invalid', '{group:incompatible}');
-- An invalid row with a recognizable phone still blocks its duplicate.
select pg_temp.expect_row(14, 'duplicate_file', '{full_name:required}');
select pg_temp.expect_row(15, 'duplicate_file', '{}');
do $$
declare s uuid := current_setting('test.s1')::uuid; summary jsonb;
begin
  if (select input ->> 'primary_group_id' from public.student_import_rows where session_id = s and ordinal = 1) <> '7b222222-2222-4222-8222-222222222222'
    or (select input ->> 'participation_type' from public.student_import_rows where session_id = s and ordinal = 1) <> 'in_person' then
    raise exception 'Explicit group by name (case-insensitive) or type label did not resolve';
  end if;
  -- The grade-9 default group does not apply to a grade-11 row.
  if (select input ->> 'primary_group_id' from public.student_import_rows where session_id = s and ordinal = 2) is not null
    or (select input ->> 'track_id' from public.student_import_rows where session_id = s and ordinal = 2) <> '7a111111-1111-4111-8111-111111111111' then
    raise exception 'Track by name or incompatible default group handled wrongly';
  end if;
  if (select input ->> 'primary_group_id' from public.student_import_rows where session_id = s and ordinal = 8) is not null
    or (select input ->> 'primary_group_id' from public.student_import_rows where session_id = s and ordinal = 9) is not null
    or (select input ->> 'primary_group_id' from public.student_import_rows where session_id = s and ordinal = 10) <> '7b111111-1111-4111-8111-111111111111' then
    raise exception 'Explicit Unassigned, JSON null, or the default group handled wrongly';
  end if;
  if (select existing_archived from public.student_import_rows where session_id = s and ordinal = 3)
    or not (select existing_archived from public.student_import_rows where session_id = s and ordinal = 4) then
    raise exception 'Existing duplicates do not report archived state';
  end if;
  if (select duplicate_rows from public.student_import_rows where session_id = s and ordinal = 5) <> '{7}' then
    raise exception 'Within-file duplicates do not name each other';
  end if;
  summary := public.student_import_summary(s);
  if summary -> 'counts' ->> 'ready' <> '5' or summary -> 'counts' ->> 'invalid' <> '4'
    or summary -> 'counts' ->> 'duplicate_existing' <> '2' or summary -> 'counts' ->> 'duplicate_file' <> '4'
    or summary ->> 'state' <> 'reviewing' then
    raise exception 'Summary counts are wrong: %', summary -> 'counts';
  end if;
  if (public.list_student_import_rows(s, 'duplicate_file', null, 0, 20) ->> 'total')::int <> 4
    or (public.list_student_import_rows(s, null, '0110 000 0010', 0, 20) ->> 'total')::int <> 1
    or (public.list_student_import_rows(s, null, 'default', 0, 20) -> 'rows' -> 0 ->> 'group_name') <> 'Nine A' then
    raise exception 'Row listing filters or labels are wrong';
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Exclusions and corrections: revision-checked, revalidate duplicates, never write records.
select pg_temp.expect_error(format($s$ select public.set_student_import_row_excluded(%L, 1, 15, true) $s$, current_setting('test.s1')), 'stale_revision');
select set_config('test.rev', public.set_student_import_row_excluded(current_setting('test.s1')::uuid, current_setting('test.rev')::int, 15, true)::text, true);
select pg_temp.expect_row(15, 'excluded');
select pg_temp.expect_row(14, 'invalid', '{full_name:required}');

select set_config('test.rev', public.correct_student_import_row(current_setting('test.s1')::uuid, current_setting('test.rev')::int, 6,
  '{"full_name": "File Dup B", "student_phone": "+201100000006", "parent_phone": "+201200000000", "level_id": "grade-9",
    "track_id": null, "primary_group_id": null, "participation_type": "online_only"}')::text, true);
select pg_temp.expect_row(5, 'ready', '{}');
select pg_temp.expect_row(6, 'ready', '{}');
select set_config('test.rev', public.correct_student_import_row(current_setting('test.s1')::uuid, current_setting('test.rev')::int, 7,
  '{"full_name": "Bad fixed", "student_phone": "+201100000007", "parent_phone": "+201200000000", "level_id": "grade-11",
    "track_id": "7a111111-1111-4111-8111-111111111111", "primary_group_id": "7b333333-3333-4333-8333-333333333333", "participation_type": "in_person"}')::text, true);
select pg_temp.expect_row(7, 'ready', '{}');
-- A correction is validated like a record: a group outside the chosen track is an issue, not a write.
select pg_temp.expect_error(format($s$ select public.correct_student_import_row(%L, %s, 13, '{"track_id": "not-a-uuid"}') $s$,
  current_setting('test.s1'), current_setting('test.rev')), 'validation');
select pg_temp.expect_error(format($s$ select public.correct_student_import_row(%L, %s, 99, '{}') $s$,
  current_setting('test.s1'), current_setting('test.rev')), 'not_found');
do $$ begin
  if (select count(*) from public.annual_student_records where academy_id = '77777777-7777-4777-8777-777777777777') <> 2 then
    raise exception 'Staging or corrections created student records';
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Confirmation: stale revisions, then a changed outcome forces a new review.
select pg_temp.expect_error(format($s$ select public.confirm_student_import(%L, 1) $s$, current_setting('test.s1')), 'stale_revision');
set local request.jwt.claim.sub = '71111111-1111-4111-8111-111111111111';
select public.create_student_record('77777777-7777-4777-8777-777777777777', '77777777-1111-4111-8111-777777777777',
  'Added meanwhile', '01100000010', '01200000000', 'grade-9', null, null, 'in_person');
set local request.jwt.claim.sub = '72222222-2222-4222-8222-222222222222';
do $$
declare result jsonb;
begin
  result := public.confirm_student_import(current_setting('test.s1')::uuid, current_setting('test.rev')::int);
  if (result ->> 'confirmed')::boolean or (result ->> 'revision')::int <> current_setting('test.rev')::int + 1 then
    raise exception 'A changed outcome was confirmed: %', result;
  end if;
  perform set_config('test.rev', result ->> 'revision', true);
end $$;
select pg_temp.expect_row(10, 'duplicate_existing');
do $$
declare result jsonb;
begin
  result := public.confirm_student_import(current_setting('test.s1')::uuid, current_setting('test.rev')::int);
  if not (result ->> 'confirmed')::boolean or (result ->> 'batch_count')::int <> 1 then
    raise exception 'Confirmation failed: %', result;
  end if;
  if (select count(*) from public.student_import_rows where session_id = current_setting('test.s1')::uuid and outcome = 'pending') <> 7
    or (select count(*) from public.student_import_rows where session_id = current_setting('test.s1')::uuid and outcome = 'skipped') <> 8 then
    raise exception 'Confirmation assigned outcomes wrongly';
  end if;
end $$;
select pg_temp.expect_error(format($s$ select public.set_student_import_row_excluded(%L, %s, 1, true) $s$,
  current_setting('test.s1'), (current_setting('test.rev')::int + 1)), 'import_state');
select pg_temp.expect_error(format($s$ select public.cancel_student_import(%L) $s$, current_setting('test.s1')), 'import_state');

-- ---------------------------------------------------------------------------------------------
-- Processing: a group archived and a phone taken after confirmation become row outcomes.
reset role;
update public.groups set archived_at = now() where id = '7b222222-2222-4222-8222-222222222222';
set local role authenticated;
set local request.jwt.claim.sub = '71111111-1111-4111-8111-111111111111';
select public.create_student_record('77777777-7777-4777-8777-777777777777', '77777777-1111-4111-8111-777777777777',
  'Taken meanwhile', '01100000002', '01200000000', 'grade-9', null, null, 'in_person');

set local request.jwt.claim.sub = '73333333-3333-4333-8333-333333333333';
select pg_temp.expect_error(format($s$ select public.process_student_import_batch(%L, 0) $s$, current_setting('test.s1')), 'forbidden');
set local request.jwt.claim.sub = '72222222-2222-4222-8222-222222222222';
select pg_temp.expect_error(format($s$ select public.process_student_import_batch(%L, 1) $s$, current_setting('test.s1')), 'validation');
do $$
declare result jsonb; again jsonb; records integer;
begin
  result := public.process_student_import_batch(current_setting('test.s1')::uuid, 0);
  if result ->> 'state' <> 'completed' or (result ->> 'created')::int <> 5 or (result ->> 'failed')::int <> 1
    or (result ->> 'skipped')::int <> 9 or (result ->> 'pending')::int <> 0 or result ->> 'next_batch' is not null then
    raise exception 'Batch outcome wrong: %', result;
  end if;
  if (select outcome || ':' || outcome_code from public.student_import_rows where session_id = current_setting('test.s1')::uuid and ordinal = 1) <> 'failed:invalid_placement'
    or (select outcome || ':' || outcome_code from public.student_import_rows where session_id = current_setting('test.s1')::uuid and ordinal = 2) <> 'skipped:duplicate_existing' then
    raise exception 'Row-level failures were not recorded';
  end if;
  select count(*) into records from public.annual_student_records where academy_id = '77777777-7777-4777-8777-777777777777';
  -- A repeated batch returns its stored outcome and creates nothing.
  again := public.process_student_import_batch(current_setting('test.s1')::uuid, 0);
  if again ->> 'created' <> result ->> 'created' or jsonb_array_length(again -> 'rows') <> 7
    or (select count(*) from public.annual_student_records where academy_id = '77777777-7777-4777-8777-777777777777') <> records then
    raise exception 'Repeating a batch created records';
  end if;
  if records <> 2 + 2 + 5 then raise exception 'Unexpected record count %', records; end if;
  if (select count(*) from public.academy_student_profiles where academy_id = '77777777-7777-4777-8777-777777777777') <> records then
    raise exception 'A failed row left an orphan profile';
  end if;
  if not exists (
    select 1 from public.student_import_rows i join public.annual_student_records r on r.id = i.record_id
    where i.session_id = current_setting('test.s1')::uuid and i.ordinal = 7
      and r.full_name = 'Bad fixed' and r.primary_group_id = '7b333333-3333-4333-8333-333333333333' and r.created_by = '72222222-2222-4222-8222-222222222222'
  ) or exists (
    select 1 from public.student_import_rows i join public.annual_student_records r on r.id = i.record_id
    where i.session_id = current_setting('test.s1')::uuid and i.ordinal in (8, 9) and r.primary_group_id is not null
  ) then
    raise exception 'Created records do not match their rows';
  end if;
  if (public.student_import_summary(current_setting('test.s1')::uuid) -> 'counts' -> 'skipped_by_code' ->> 'duplicate_existing')::int <> 4 then
    raise exception 'Skipped breakdown is wrong';
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Bulk group changes.
select set_config('test.a', id::text, true) from public.create_student_record('77777777-7777-4777-8777-777777777777',
  '77777777-1111-4111-8111-777777777777', 'Group A', '01500000001', '01200000000', 'grade-9', null, null, 'in_person');
select set_config('test.b', id::text, true) from public.create_student_record('77777777-7777-4777-8777-777777777777',
  '77777777-1111-4111-8111-777777777777', 'Group B', '01500000002', '01200000000', 'grade-9', null, '7b111111-1111-4111-8111-111111111111', 'in_person');
select set_config('test.c', id::text, true) from public.create_student_record('77777777-7777-4777-8777-777777777777',
  '77777777-1111-4111-8111-777777777777', 'Group C', '01500000003', '01200000000', 'grade-11', '7a111111-1111-4111-8111-111111111111', null, 'online_only');

-- Mixed programs cannot move into one group; nothing changes.
select pg_temp.expect_error(format($s$ select public.set_student_records_group('77777777-7777-4777-8777-777777777777', '77777777-1111-4111-8111-777777777777',
  jsonb_build_array(jsonb_build_object('id', %L, 'version', 1), jsonb_build_object('id', %L, 'version', 1)), '7b111111-1111-4111-8111-111111111111') $s$,
  current_setting('test.a'), current_setting('test.c')), 'incompatible_selection');
select pg_temp.expect_error(format($s$ select public.set_student_records_group('77777777-7777-4777-8777-777777777777', '77777777-1111-4111-8111-777777777777',
  jsonb_build_array(jsonb_build_object('id', %L, 'version', 2)), '7b111111-1111-4111-8111-111111111111') $s$, current_setting('test.a')), 'stale_record');
select pg_temp.expect_error(format($s$ select public.set_student_records_group('77777777-7777-4777-8777-777777777777', '77777777-1111-4111-8111-777777777777',
  jsonb_build_array(jsonb_build_object('id', %L, 'version', 2)), null) $s$, current_setting('test.archived')), 'archived_record');
select pg_temp.expect_error(format($s$ select public.set_student_records_group('77777777-7777-4777-8777-777777777777', '77777777-1111-4111-8111-777777777777',
  jsonb_build_array(jsonb_build_object('id', %L, 'version', 1)), '7b444444-4444-4444-8444-444444444444') $s$, current_setting('test.a')), 'invalid_placement');
select pg_temp.expect_error(format($s$ select public.set_student_records_group('77777777-7777-4777-8777-777777777777', '77777777-1111-4111-8111-777777777777',
  jsonb_build_array(jsonb_build_object('id', %L, 'version', 1)), '7b555555-5555-4555-8555-555555555555') $s$, current_setting('test.a')), 'invalid_placement');
select pg_temp.expect_error($s$ select public.set_student_records_group('77777777-7777-4777-8777-777777777777', '77777777-1111-4111-8111-777777777777',
  '[]', null) $s$, 'validation');
do $$
declare result jsonb;
begin
  if (select version from public.annual_student_records where id = current_setting('test.a')::uuid) <> 1 then
    raise exception 'A rejected group change wrote a record';
  end if;
  result := public.set_student_records_group('77777777-7777-4777-8777-777777777777', '77777777-1111-4111-8111-777777777777',
    jsonb_build_array(jsonb_build_object('id', current_setting('test.a'), 'version', 1), jsonb_build_object('id', current_setting('test.b'), 'version', 1)),
    '7b111111-1111-4111-8111-111111111111');
  if jsonb_array_length(result -> 'changed') <> 1 or result -> 'changed' -> 0 ->> 'id' <> current_setting('test.a')
    or (result -> 'changed' -> 0 ->> 'version')::int <> 2 or result -> 'unchanged' <> jsonb_build_array(current_setting('test.b')) then
    raise exception 'Group assignment result wrong: %', result;
  end if;
  if (select version from public.annual_student_records where id = current_setting('test.b')::uuid) <> 1 then
    raise exception 'An already-matching record was rewritten';
  end if;
  -- Removing groups may span programs and keeps level, track, and type.
  result := public.set_student_records_group('77777777-7777-4777-8777-777777777777', '77777777-1111-4111-8111-777777777777',
    jsonb_build_array(jsonb_build_object('id', current_setting('test.a'), 'version', 2), jsonb_build_object('id', current_setting('test.c'), 'version', 1)), null);
  if jsonb_array_length(result -> 'changed') <> 1 or result -> 'unchanged' <> jsonb_build_array(current_setting('test.c')) then
    raise exception 'Group removal result wrong: %', result;
  end if;
  if exists (select 1 from public.annual_student_records where id = current_setting('test.a')::uuid
    and (primary_group_id is not null or level_id <> 'grade-9' or participation_type <> 'in_person' or full_name <> 'Group A')) then
    raise exception 'Group removal changed more than the group';
  end if;
end $$;

set local request.jwt.claim.sub = '73333333-3333-4333-8333-333333333333';
select pg_temp.expect_error(format($s$ select public.set_student_records_group('77777777-7777-4777-8777-777777777777', '77777777-1111-4111-8111-777777777777',
  jsonb_build_array(jsonb_build_object('id', %L, 'version', 3)), null) $s$, current_setting('test.a')), 'forbidden');
set local request.jwt.claim.sub = '74444444-4444-4444-8444-444444444444';
select pg_temp.expect_error(format($s$ select public.set_student_records_group('77777777-7777-4777-8777-777777777777', '77777777-1111-4111-8111-777777777777',
  jsonb_build_array(jsonb_build_object('id', %L, 'version', 3)), null) $s$, current_setting('test.a')), 'forbidden');
select pg_temp.expect_error(format($s$ select public.set_student_records_group('78888888-8888-4888-8888-888888888888', '78888888-1111-4111-8111-888888888888',
  jsonb_build_array(jsonb_build_object('id', %L, 'version', 3)), null) $s$, current_setting('test.a')), 'not_found');
set local request.jwt.claim.sub = '75555555-5555-4555-8555-555555555555';
select pg_temp.expect_error(format($s$ select public.start_student_import('77777777-7777-4777-8777-777777777777', '77777777-1111-4111-8111-777777777777',
  'x.csv', 'csv', null, 1, '{}', null) $s$), 'forbidden');
set local role anon;
select pg_temp.expect_error(format($s$ select public.process_student_import_batch(%L, 0) $s$, current_setting('test.s1')), 'permission denied%');
select pg_temp.expect_error($s$ select count(*) from public.student_import_sessions $s$, 'permission denied%');

-- ---------------------------------------------------------------------------------------------
-- A closed year blocks processing without undoing anything and rejects further writes.
set local role authenticated;
set local request.jwt.claim.sub = '72222222-2222-4222-8222-222222222222';
select set_config('test.s2', public.start_student_import('77777777-7777-4777-8777-777777777777', '77777777-1111-4111-8111-777777777777',
  'late.json', 'json', null, 1, '{"level_id": "grade-9", "participation_type": "online_only"}', null)::text, true);
select public.stage_student_import_rows(current_setting('test.s2')::uuid,
  '[{"ordinal": 1, "source_row": 1, "values": {"full_name": "Late", "student_phone": "01600000001", "parent_phone": "01200000000"}}]');
select public.confirm_student_import(current_setting('test.s2')::uuid, public.finalize_student_import(current_setting('test.s2')::uuid));
reset role;
update public.academic_years set closed_at = now() where id = '77777777-1111-4111-8111-777777777777';
set local role authenticated;
set local request.jwt.claim.sub = '72222222-2222-4222-8222-222222222222';
do $$
declare result jsonb;
begin
  result := public.process_student_import_batch(current_setting('test.s2')::uuid, 0);
  if result ->> 'state' <> 'blocked' or (result ->> 'pending')::int <> 1 or (result ->> 'created')::int <> 0 then
    raise exception 'A closed year did not block the import: %', result;
  end if;
  if exists (select 1 from public.annual_student_records where student_phone = '+201600000001') then
    raise exception 'A blocked import created a record';
  end if;
  if (select state from public.student_import_sessions where id = current_setting('test.s1')::uuid) <> 'completed' then
    raise exception 'Closing the year changed a completed import';
  end if;
end $$;
select pg_temp.expect_error($s$ select public.start_student_import('77777777-7777-4777-8777-777777777777', '77777777-1111-4111-8111-777777777777',
  'x.csv', 'csv', null, 1, '{}', null) $s$, 'year_unavailable');
select pg_temp.expect_error(format($s$ select public.set_student_records_group('77777777-7777-4777-8777-777777777777', '77777777-1111-4111-8111-777777777777',
  jsonb_build_array(jsonb_build_object('id', %L, 'version', 3)), null) $s$, current_setting('test.a')), 'year_unavailable');

rollback;
