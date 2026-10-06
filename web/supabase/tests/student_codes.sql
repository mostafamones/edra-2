-- Student codes foundation: grammar parity, settings permissions and versions, level validation,
-- disable/re-enable preservation, allocation, and ledger invariants.
-- Run with psql -v ON_ERROR_STOP=1 against an authorized disposable target after replaying all
-- migrations. Everything runs in one transaction that is rolled back.

do $$ begin
  if not (select relrowsecurity from pg_class where oid = 'public.student_code_settings'::regclass)
    or not (select relrowsecurity from pg_class where oid = 'public.student_code_level_patterns'::regclass)
    or not (select relrowsecurity from pg_class where oid = 'public.student_code_counters'::regclass)
    or not (select relrowsecurity from pg_class where oid = 'public.student_code_assignments'::regclass)
    or not (select relrowsecurity from pg_class where oid = 'public.student_code_states'::regclass)
    or has_table_privilege('anon', 'public.student_code_settings', 'select')
    or has_table_privilege('authenticated', 'public.student_code_settings', 'insert')
    or has_table_privilege('authenticated', 'public.student_code_settings', 'update')
    or has_table_privilege('authenticated', 'public.student_code_level_patterns', 'insert')
    or has_table_privilege('authenticated', 'public.student_code_level_patterns', 'delete')
    or has_table_privilege('authenticated', 'public.student_code_counters', 'select')
    or has_table_privilege('authenticated', 'public.student_code_counters', 'update')
    or has_table_privilege('authenticated', 'public.student_code_assignments', 'insert')
    or has_table_privilege('authenticated', 'public.student_code_assignments', 'update')
    or has_table_privilege('authenticated', 'public.student_code_assignments', 'delete')
    or has_table_privilege('authenticated', 'public.student_code_states', 'insert')
    or has_table_privilege('authenticated', 'public.student_code_states', 'update') then
    raise exception 'Student code tables lack RLS or allow direct writes';
  end if;
  if has_function_privilege('anon', 'public.save_student_code_settings(uuid, integer, boolean, text, jsonb)', 'execute')
    or has_function_privilege('anon', 'public.get_student_code_settings(uuid)', 'execute')
    or has_function_privilege('anon', 'public.get_student_code_state(uuid, uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.allocate_student_code(uuid, text)', 'execute')
    or has_function_privilege('anon', 'public.allocate_student_code(uuid, text)', 'execute')
    or has_function_privilege('authenticated', 'public.validate_student_code_issue()', 'execute')
    or not has_function_privilege('authenticated', 'public.save_student_code_settings(uuid, integer, boolean, text, jsonb)', 'execute')
    or not has_function_privilege('authenticated', 'public.get_student_code_settings(uuid)', 'execute')
    or not has_function_privilege('authenticated', 'public.student_code_effective_pattern(uuid, text)', 'execute') then
    raise exception 'Student code function grants are wrong';
  end if;
  if (select prosecdef from pg_proc where oid = 'public.get_student_code_settings(uuid)'::regprocedure)
    or (select prosecdef from pg_proc where oid = 'public.get_student_code_state(uuid, uuid)'::regprocedure)
    or (select prosecdef from pg_proc where oid = 'public.student_code_effective_pattern(uuid, text)'::regprocedure) then
    raise exception 'Student code reads must run with caller authority';
  end if;

  -- Grammar parity with src/modules/students/codes/pattern.ts (same cases as pattern.test.ts).
  if public.normalize_student_code_pattern('####') <> '####'
    or public.normalize_student_code_pattern('  st2### ') <> 'ST2###'
    or public.normalize_student_code_pattern(E'\tst-2###\n') <> 'ST-2###'
    or public.normalize_student_code_pattern('00########') <> '00########'
    or public.normalize_student_code_pattern('ABCDEFGHIJKL#') <> 'ABCDEFGHIJKL#'
    or public.normalize_student_code_pattern('ABCDEFGHIJKLM#') is not null
    or public.normalize_student_code_pattern('#########') is not null
    or public.normalize_student_code_pattern('ST') is not null
    or public.normalize_student_code_pattern('') is not null
    or public.normalize_student_code_pattern('#ST##') is not null
    or public.normalize_student_code_pattern('ST##A#') is not null
    or public.normalize_student_code_pattern('ST ###') is not null
    or public.normalize_student_code_pattern('ST_###') is not null
    or public.normalize_student_code_pattern('ŞT###') is not null
    or public.normalize_student_code_pattern(U&'\00A0ST###') is not null then
    raise exception 'Formula normalization differs from the application';
  end if;
  if public.student_code_pattern_prefix('ST2###') <> 'ST2' or public.student_code_pattern_width('ST2###') <> 3
    or public.student_code_pattern_prefix('####') <> '' or public.student_code_pattern_width('####') <> 4 then
    raise exception 'Formula parts are wrong';
  end if;
  if public.normalize_student_code(' st2-001 ') <> 'ST2-001'
    or public.normalize_student_code('0007') <> '0007'
    or public.normalize_student_code('ABCDEFGHIJ0123456789') <> 'ABCDEFGHIJ0123456789'
    or public.normalize_student_code('ABCDEFGHIJ01234567890') is not null
    or public.normalize_student_code('   ') is not null
    or public.normalize_student_code('ST 001') is not null
    or public.normalize_student_code(E'ST\u0001') is not null
    or public.normalize_student_code('ST#1') is not null
    or public.normalize_student_code('straße') is not null then
    raise exception 'Code normalization differs from the application';
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

insert into auth.users (id) values
  ('a1111111-1111-4111-8111-111111111111'),  -- owner of A
  ('a2222222-2222-4222-8222-222222222222'),  -- admin of A
  ('a3333333-3333-4333-8333-333333333333'),  -- instructor of A
  ('b1111111-1111-4111-8111-111111111111'),  -- owner of B
  ('c9999999-9999-4999-8999-999999999999');  -- no membership

insert into public.academies (id, name, slug, icon, subject, created_by) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Codes A', 'codes-a', 'school', 'Math', 'a1111111-1111-4111-8111-111111111111'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Codes B', 'codes-b', 'school', 'Math', 'b1111111-1111-4111-8111-111111111111');
update public.academic_years set id = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', start_year = 2030
where academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
update public.academic_years set id = 'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb', start_year = 2030
where academy_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
insert into public.academy_memberships (academy_id, user_id, role, created_by) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a1111111-1111-4111-8111-111111111111', 'owner', 'a1111111-1111-4111-8111-111111111111'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a2222222-2222-4222-8222-222222222222', 'admin', 'a1111111-1111-4111-8111-111111111111'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a3333333-3333-4333-8333-333333333333', 'instructor', 'a1111111-1111-4111-8111-111111111111'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b1111111-1111-4111-8111-111111111111', 'owner', 'b1111111-1111-4111-8111-111111111111');
insert into public.academy_levels (academy_id, level_id, sort_order) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'grade-9', 9),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'grade-10', 10),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'grade-12', 12);

grant usage on schema public, auth to authenticated, anon;

-- ---------------------------------------------------------------------------------------------
-- Disabled by default; nonmembers and other academies see nothing.
set local role authenticated;
set local request.jwt.claim.sub = 'a1111111-1111-4111-8111-111111111111';
do $$ begin
  if public.get_student_code_settings('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    <> '{"enabled": false, "defaultPattern": null, "version": 0, "levels": []}'::jsonb then
    raise exception 'A new academy must read as disabled at version 0';
  end if;
end $$;
select set_config('test.r9', id::text, true) from public.create_student_record(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'Nine One',
  '01000000001', '01100000001', 'grade-9', null, null, 'in_person');
select set_config('test.r9b', id::text, true) from public.create_student_record(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'Nine Two',
  '01000000002', '01100000001', 'grade-9', null, null, 'in_person');
select set_config('test.r9c', id::text, true) from public.create_student_record(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'Nine Three',
  '01000000003', '01100000001', 'grade-9', null, null, 'in_person');
select set_config('test.r10', id::text, true) from public.create_student_record(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'Ten One',
  '01000000004', '01100000001', 'grade-10', null, null, 'in_person');

set local request.jwt.claim.sub = 'c9999999-9999-4999-8999-999999999999';
select pg_temp.expect_error($s$ select public.get_student_code_settings('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') $s$, 'forbidden');
select pg_temp.expect_error($s$ select public.save_student_code_settings('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 0, true, '####', '[]') $s$, 'forbidden');
set local request.jwt.claim.sub = 'b1111111-1111-4111-8111-111111111111';
select pg_temp.expect_error($s$ select public.get_student_code_settings('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') $s$, 'forbidden');
select pg_temp.expect_error($s$ select public.save_student_code_settings('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 0, true, '####', '[]') $s$, 'forbidden');
select pg_temp.expect_error($s$ select public.get_student_code_state('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.r9')::uuid) $s$, 'forbidden');

-- Instructors cannot configure, by RPC or directly.
set local request.jwt.claim.sub = 'a3333333-3333-4333-8333-333333333333';
select pg_temp.expect_error($s$ select public.save_student_code_settings('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 0, true, '####', '[]') $s$, 'forbidden');
select pg_temp.expect_error($s$ insert into public.student_code_settings (academy_id, enabled, default_pattern, updated_by)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true, '####', 'a3333333-3333-4333-8333-333333333333') $s$, 'permission denied%');
select pg_temp.expect_error($s$ select public.allocate_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'grade-9') $s$, 'permission denied%');

-- ---------------------------------------------------------------------------------------------
-- Owner configures: validation, foreign levels, versions.
set local request.jwt.claim.sub = 'a1111111-1111-4111-8111-111111111111';
select pg_temp.expect_error($s$ select public.save_student_code_settings('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 0, true, 'ST#A#', '[]') $s$, 'validation');
select pg_temp.expect_error($s$ select public.save_student_code_settings('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 0, true, '####',
  '[{"levelId":"grade-10","pattern":"ST 2###"}]') $s$, 'validation');
select pg_temp.expect_error($s$ select public.save_student_code_settings('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 0, true, '####',
  '[{"levelId":"grade-10","pattern":"A#"},{"levelId":"grade-10","pattern":"B#"}]') $s$, 'validation');
-- grade-12 exists globally and in academy B, but not in academy A.
select pg_temp.expect_error($s$ select public.save_student_code_settings('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 0, true, '####',
  '[{"levelId":"grade-12","pattern":"ST2###"}]') $s$, 'invalid_level');
select pg_temp.expect_error($s$ select public.save_student_code_settings('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 0, true, '####',
  '[{"levelId":"nope","pattern":"ST2###"}]') $s$, 'invalid_level');
-- Disabled with an empty draft is allowed and creates no code.
select public.save_student_code_settings('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 0, false, '  ', '[]');
select pg_temp.expect_error($s$ select public.save_student_code_settings('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 0, true, '####', '[]') $s$, 'stale_settings');
do $$ begin
  if (public.save_student_code_settings('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1, true, ' #### ',
      '[{"levelId":"grade-10","pattern":"st2###"}]') ->> 'version')::int <> 2 then
    raise exception 'Saving must advance the version';
  end if;
  if public.get_student_code_settings('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    <> '{"enabled": true, "defaultPattern": "####", "version": 2, "levels": [{"levelId": "grade-10", "pattern": "ST2###"}]}'::jsonb then
    raise exception 'Saved settings were not normalized: %', public.get_student_code_settings('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  end if;
  if exists (select 1 from public.student_code_assignments) or exists (select 1 from public.student_code_states) then
    raise exception 'Enabling or saving must not issue codes';
  end if;
end $$;
-- A tab that loaded version 1 cannot overwrite version 2.
select pg_temp.expect_error($s$ select public.save_student_code_settings('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1, false, '####', '[]') $s$, 'stale_settings');

-- Instructors read the configuration and the effective formulas.
set local request.jwt.claim.sub = 'a3333333-3333-4333-8333-333333333333';
do $$ begin
  if (public.get_student_code_settings('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') ->> 'version')::int <> 2
    or public.student_code_effective_pattern('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'grade-10') <> 'ST2###'
    or public.student_code_effective_pattern('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'grade-9') <> '####' then
    raise exception 'Instructor cannot read effective settings';
  end if;
  if (public.get_student_code_state('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.r9')::uuid))
    <> '{"code": null, "version": 0}'::jsonb then
    raise exception 'An uncoded record starts at version 0';
  end if;
end $$;
select pg_temp.expect_error($s$ update public.student_code_settings set enabled = false $s$, 'permission denied%');
select pg_temp.expect_error($s$ insert into public.student_code_assignments (academy_id, academic_year_id, academy_student_profile_id,
  annual_student_record_id, level_id, code, code_version, issued_by)
  select academy_id, academic_year_id, academy_student_profile_id, id, level_id, '0001', 1, 'a3333333-3333-4333-8333-333333333333'
  from public.annual_student_records where id = current_setting('test.r9')::uuid $s$, 'permission denied%');

-- Academy B: same strings may exist in another academy.
set local request.jwt.claim.sub = 'b1111111-1111-4111-8111-111111111111';
select public.save_student_code_settings('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 0, true, '####', '[]');
select set_config('test.rb', id::text, true) from public.create_student_record(
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb', 'B One',
  '01000000001', '01100000001', 'grade-12', null, null, 'in_person');
do $$ begin
  if exists (select 1 from public.student_code_settings where academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    or exists (select 1 from public.student_code_level_patterns where academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') then
    raise exception 'Another academy''s settings are visible';
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Ledger and allocation (as the database owner, standing in for the later issuance RPCs).
reset role;

create function pg_temp.issue(record_id text, code text, code_version integer) returns void language sql as $$
  insert into public.student_code_assignments (academy_id, academic_year_id, academy_student_profile_id,
    annual_student_record_id, level_id, code, code_version, issued_by)
  select r.academy_id, r.academic_year_id, r.academy_student_profile_id, r.id, r.level_id, code, code_version,
    'a1111111-1111-4111-8111-111111111111'
  from public.annual_student_records r where r.id = record_id::uuid;
$$;

do $$ begin
  if public.allocate_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'grade-9') <> '0001'
    or public.allocate_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'grade-10') <> 'ST2001' then
    raise exception 'Allocation must start at 1 with padding';
  end if;
end $$;
select pg_temp.issue(current_setting('test.r9'), '0001', 1);
select pg_temp.issue(current_setting('test.r10'), 'ST2001', 1);
-- Manual code taking the formula's next value; allocation skips it.
select pg_temp.issue(current_setting('test.r9b'), '0002', 1);
do $$ begin
  if public.allocate_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'grade-9') <> '0003' then
    raise exception 'Allocation must skip issued codes';
  end if;
  if (select current_assignment_id from public.student_code_states where annual_student_record_id = current_setting('test.r9')::uuid)
    is distinct from (select id from public.student_code_assignments where code = '0001') then
    raise exception 'Current pointer not linked';
  end if;
end $$;
-- Same string in academy B.
select pg_temp.issue(current_setting('test.rb'), '0001', 1);

-- One current code per record; codes unique per academy forever; normalized strings only.
select pg_temp.expect_error($s$ select pg_temp.issue(current_setting('test.r9'), '0009', 2) $s$, 'code_exists');
select pg_temp.expect_error($s$ select pg_temp.issue(current_setting('test.r9c'), '0001', 1) $s$, 'code_taken');
select pg_temp.expect_error($s$ select pg_temp.issue(current_setting('test.r9c'), 'abc', 1) $s$, '%check constraint%');
select pg_temp.expect_error($s$ select pg_temp.issue(current_setting('test.r9c'), 'ABC', 2) $s$, 'stale_code');
select pg_temp.expect_error($s$ insert into public.student_code_assignments (academy_id, academic_year_id, academy_student_profile_id,
  annual_student_record_id, level_id, code, code_version, issued_by)
  select r.academy_id, r.academic_year_id, r.academy_student_profile_id, r.id, 'grade-10', 'ABC', 1, 'a1111111-1111-4111-8111-111111111111'
  from public.annual_student_records r where r.id = current_setting('test.r9c')::uuid $s$, 'level_mismatch');
-- Foreign academy/record combination is rejected by the composite key.
select pg_temp.expect_error($s$ insert into public.student_code_assignments (academy_id, academic_year_id, academy_student_profile_id,
  annual_student_record_id, level_id, code, code_version, issued_by)
  select 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', r.academic_year_id, r.academy_student_profile_id, r.id, r.level_id, 'XYZ', 1,
    'a1111111-1111-4111-8111-111111111111'
  from public.annual_student_records r where r.id = current_setting('test.r9c')::uuid $s$, '%');
do $$ begin
  if exists (select 1 from public.student_code_states where annual_student_record_id = current_setting('test.r9c')::uuid) then
    raise exception 'A rejected issue left code state behind';
  end if;
end $$;

-- Retirement is one-way, keeps the value reserved, and advances the version (no ABA).
update public.student_code_assignments set retired_at = now(), retired_by = 'a1111111-1111-4111-8111-111111111111',
  retirement_reason = 'manual' where code = '0001' and academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
do $$ begin
  if (select version from public.student_code_states where annual_student_record_id = current_setting('test.r9')::uuid) <> 2
    or (select current_assignment_id from public.student_code_states where annual_student_record_id = current_setting('test.r9')::uuid) is not null then
    raise exception 'Retirement must advance the version and clear the pointer';
  end if;
end $$;
select pg_temp.expect_error($s$ select pg_temp.issue(current_setting('test.r9c'), '0001', 1) $s$, 'code_taken');
select pg_temp.expect_error($s$ select pg_temp.issue(current_setting('test.r9'), '0010', 2) $s$, 'stale_code');
select pg_temp.issue(current_setting('test.r9'), '0010', 3);
select pg_temp.expect_error($s$ update public.student_code_assignments set retired_at = null, retirement_reason = null, retired_by = null
  where code = '0001' and academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $s$, 'code_history');
select pg_temp.expect_error($s$ update public.student_code_assignments set code = '0011'
  where code = '0010' and academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $s$, 'code_history');
select pg_temp.expect_error($s$ update public.student_code_assignments set annual_student_record_id = current_setting('test.r9c')::uuid
  where code = '0001' and academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $s$, '%');
select pg_temp.expect_error($s$ delete from public.student_code_assignments where code = '0001' $s$, 'code_history');
select pg_temp.expect_error($s$ update public.student_code_assignments set retired_at = now(), retirement_reason = 'manual'
  where code = '0010' and academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $s$, '%student_code_assignments_retirement%');
select pg_temp.expect_error($s$ update public.student_code_states set version = 1
  where annual_student_record_id = current_setting('test.r9')::uuid $s$, 'code_history');
select pg_temp.expect_error($s$ delete from public.student_code_states where annual_student_record_id = current_setting('test.r9')::uuid $s$, 'code_history');
select pg_temp.expect_error($s$ delete from public.annual_student_records where id = current_setting('test.r9')::uuid $s$, '%foreign key%');

-- Archived records receive no code.
update public.annual_student_records set archived_at = now() where id = current_setting('test.r9c')::uuid;
select pg_temp.expect_error($s$ select pg_temp.issue(current_setting('test.r9c'), 'ARCH1', 1) $s$, 'archived_record');

-- Staff read the current code and version; RLS hides other academies' ledgers.
set local role authenticated;
set local request.jwt.claim.sub = 'a3333333-3333-4333-8333-333333333333';
do $$ begin
  if public.get_student_code_state('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.r9')::uuid)
    <> '{"code": "0010", "version": 3}'::jsonb then
    raise exception 'Current code read is wrong';
  end if;
  if exists (select 1 from public.student_code_assignments where academy_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') then
    raise exception 'Another academy''s codes are visible';
  end if;
end $$;
select pg_temp.expect_error($s$ select public.get_student_code_state('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.rb')::uuid) $s$, 'not_found');

-- ---------------------------------------------------------------------------------------------
-- Disable keeps everything and blocks code operations; re-enable restores them.
-- Student search uses current codes with caller authority and the existing filters/paging.
-- A saved code can retain an older format; use a prefix that cannot also match a phone number.
set local request.jwt.claim.sub = 'a1111111-1111-4111-8111-111111111111';
select set_config('test.search', id::text, true) from public.create_student_record(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'Search Student',
  '01000000005', '01100000001', 'grade-9', null, null, 'in_person');
reset role;
select pg_temp.issue(current_setting('test.search'), 'LOOKUP10', 1);
set local role authenticated;
do $$ declare page jsonb; actor text; term text; begin
  foreach actor in array array[
    'a1111111-1111-4111-8111-111111111111',
    'a2222222-2222-4222-8222-222222222222',
    'a3333333-3333-4333-8333-333333333333'
  ] loop
    perform set_config('request.jwt.claim.sub', actor, true);
    foreach term in array array['st2001', ' st2 ', 'LOOKUP10'] loop
      page := public.list_student_records('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
        term, 'active', null, null, null, null, null, 0, 10);
      if (page ->> 'total')::int <> 1 or jsonb_array_length(page -> 'rows') <> 1
        or page -> 'rows' -> 0 ->> 'id' <> current_setting(case when term = 'LOOKUP10' then 'test.search' else 'test.r10' end) then
        raise exception 'Current code search failed for actor %, term %: %', actor, term, page;
      end if;
    end loop;
  end loop;
  page := public.list_student_records('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
    'ST2', 'active', 'grade-9', null, null, null, null, 0, 10);
  if (page ->> 'total')::int <> 0 then raise exception 'Code search bypassed the level filter'; end if;
  page := public.list_student_records('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
    'ST2', 'archived', null, null, null, null, null, 0, 10);
  if (page ->> 'total')::int <> 0 then raise exception 'Code search bypassed the status filter'; end if;
  page := public.list_student_records('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
    'ST2', 'active', null, null, null, null, null, 1, 10);
  if (page ->> 'total')::int <> 1 or page -> 'rows' <> '[]'::jsonb then
    raise exception 'Code search counts and pagination disagree';
  end if;
  foreach term in array array['%', '_'] loop
    page := public.list_student_records('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
      term, 'all', null, null, null, null, null, 0, 10);
    if (page ->> 'total')::int <> 0 then raise exception 'Code search did not escape wildcard %', term; end if;
  end loop;
  page := public.list_student_records('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb',
    'ST2', 'all', null, null, null, null, null, 0, 10);
  if (page ->> 'total')::int <> 0 then raise exception 'Code search crossed academic years'; end if;
end $$;
set local request.jwt.claim.sub = 'c9999999-9999-4999-8999-999999999999';
select pg_temp.expect_error($s$ select public.list_student_records('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
  'ST2', 'all', null, null, null, null, null, 0, 10) $s$, 'forbidden');
set local request.jwt.claim.sub = 'b1111111-1111-4111-8111-111111111111';
select pg_temp.expect_error($s$ select public.list_student_records('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
  'ST2', 'all', null, null, null, null, null, 0, 10) $s$, 'forbidden');

set local request.jwt.claim.sub = 'a2222222-2222-4222-8222-222222222222';
select public.save_student_code_settings('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 2, false, '####', '[{"levelId":"grade-10","pattern":"ST2###"}]');
do $$ declare page jsonb; term text; begin
  foreach term in array array['ST2', 'LOOKUP10'] loop
    page := public.list_student_records('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
      term, 'all', null, null, null, null, null, 0, 10);
    if (page ->> 'total')::int <> 0 or page -> 'rows' <> '[]'::jsonb then
      raise exception 'Disabled saved codes still matched student search: %', page;
    end if;
  end loop;
  foreach term in array array['Ten One', '01000000004'] loop
    page := public.list_student_records('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
      term, 'active', null, null, null, null, null, 0, 10);
    if (page ->> 'total')::int <> 1 then raise exception 'Disabling codes broke name/phone search'; end if;
  end loop;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.student_code_assignments where academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 5
    or (select last_value from public.student_code_counters where academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and prefix = '' and width = 4) <> 3
    or (select pattern from public.student_code_level_patterns where academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 'ST2###' then
    raise exception 'Disabling must preserve assignments, counters, and formulas';
  end if;
end $$;
select pg_temp.expect_error($s$ select public.allocate_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'grade-9') $s$, 'codes_disabled');
select pg_temp.expect_error($s$ select pg_temp.issue(current_setting('test.r10'), 'NEW1', 1) $s$, 'codes_disabled');
-- Lifecycle retirement still works while disabled.
update public.student_code_assignments set retired_at = now(), retirement_reason = 'level_changed'
where code = 'ST2001' and academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

set local role authenticated;
set local request.jwt.claim.sub = 'a1111111-1111-4111-8111-111111111111';
select public.save_student_code_settings('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 3, true, '####', '[{"levelId":"grade-10","pattern":"ST2###"}]');
do $$ declare page jsonb; begin
  page := public.list_student_records('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
    'LOOKUP10', 'active', null, null, null, null, null, 0, 10);
  if (page ->> 'total')::int <> 1 or page -> 'rows' -> 0 ->> 'id' <> current_setting('test.search') then
    raise exception 'Re-enabling did not restore current code search';
  end if;
  page := public.list_student_records('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
    'ST2001', 'all', null, null, null, null, null, 0, 10);
  if (page ->> 'total')::int <> 0 then raise exception 'Retired codes matched student search'; end if;
end $$;
reset role;
do $$ begin
  if public.allocate_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'grade-9') <> '0004'
    or public.allocate_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'grade-10') <> 'ST2002' then
    raise exception 'Re-enabling must resume the cursors';
  end if;
end $$;

-- Removing an override falls back to the default; the default's cursor continues.
set local role authenticated;
set local request.jwt.claim.sub = 'a1111111-1111-4111-8111-111111111111';
select public.save_student_code_settings('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 4, true, 'X#', '[]');
reset role;
do $$ begin
  if exists (select 1 from public.student_code_level_patterns where academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') then
    raise exception 'Overrides must be replaced';
  end if;
end $$;
-- Exhaustion: width 1 holds X1..X9.
insert into public.student_code_counters (academy_id, prefix, width, last_value)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'X', 1, 8)
on conflict (academy_id, prefix, width) do update set last_value = 8;
do $$ begin
  if public.allocate_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'grade-10') <> 'X9' then
    raise exception 'Last value of a width must be usable';
  end if;
end $$;
select pg_temp.expect_error($s$ select public.allocate_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'grade-10') $s$, 'code_exhausted');

-- Closed years receive no code; year-close retirement still works.
update public.academic_years set closed_at = now() where id = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
select pg_temp.expect_error($s$ select pg_temp.issue(current_setting('test.r10'), 'LATE1', 3) $s$, 'year_unavailable');
do $$ begin
  -- Closing the year retired every active code of that year (the hook in 20261006270000).
  if exists (select 1 from public.student_code_assignments where academic_year_id = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa' and retired_at is null)
    or not exists (select 1 from public.student_code_assignments where code = '0010' and academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and retirement_reason = 'year_closed') then
    raise exception 'Year closure must retire the year''s active codes';
  end if;
end $$;

rollback;
select 'student codes checks passed';
