-- Individual student code changes: assign, generate, retire, replay, and authority checks.
-- Run with `npm run test:db` against the disposable GitHub Actions database (see docs/engineering.md).
-- Everything runs in one transaction that is rolled back.

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
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'preparatory-3', 9),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'secondary-1', 10),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'secondary-3', 12);

grant usage on schema public, auth to authenticated, anon;

-- Records are created by the academy owner; codes are changed by every staff role.
set local role authenticated;
set local request.jwt.claim.sub = 'a1111111-1111-4111-8111-111111111111';
select set_config('test.r9', id::text, true) from public.create_student_record(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'Nine One',
  '01000000001', '01100000001', 'preparatory-3', null, null, 'in_person');
select set_config('test.r9b', id::text, true) from public.create_student_record(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'Nine Two',
  '01000000002', '01100000001', 'preparatory-3', null, null, 'in_person');
select set_config('test.r10', id::text, true) from public.create_student_record(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'Ten One',
  '01000000004', '01100000001', 'secondary-1', null, null, 'in_person');
set local request.jwt.claim.sub = 'b1111111-1111-4111-8111-111111111111';
select set_config('test.rb', id::text, true) from public.create_student_record(
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb', 'Other Academy',
  '01000000009', '01100000001', 'secondary-3', null, null, 'in_person');

set local request.jwt.claim.sub = 'a3333333-3333-4333-8333-333333333333';
-- Codes are off by default.
select pg_temp.expect_error($s$ select public.change_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.r9')::uuid, 'assign', '0007', 0, gen_random_uuid()) $s$, 'codes_disabled');
select pg_temp.expect_error($s$ select public.change_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.r9')::uuid, 'generate', null, 0, gen_random_uuid()) $s$, 'codes_disabled');

set local request.jwt.claim.sub = 'a1111111-1111-4111-8111-111111111111';
select public.save_student_code_settings('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 0, true, '####', '[{"levelId":"secondary-1","pattern":"ST2###"}]');

-- Outsiders, other academies, and unknown records.
set local request.jwt.claim.sub = 'c9999999-9999-4999-8999-999999999999';
select pg_temp.expect_error($s$ select public.change_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.r9')::uuid, 'assign', '0007', 0, gen_random_uuid()) $s$, 'forbidden');
set local request.jwt.claim.sub = 'b1111111-1111-4111-8111-111111111111';
select pg_temp.expect_error($s$ select public.change_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.r9')::uuid, 'assign', '0007', 0, gen_random_uuid()) $s$, 'forbidden');
set local request.jwt.claim.sub = 'a3333333-3333-4333-8333-333333333333';
select pg_temp.expect_error($s$ select public.change_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.rb')::uuid, 'assign', '0007', 0, gen_random_uuid()) $s$, 'not_found');

-- Input validation.
select pg_temp.expect_error($s$ select public.change_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.r9')::uuid, 'assign', 'A B', 0, gen_random_uuid()) $s$, 'validation');
select pg_temp.expect_error($s$ select public.change_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.r9')::uuid, 'assign', '   ', 0, gen_random_uuid()) $s$, 'validation');
select pg_temp.expect_error($s$ select public.change_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.r9')::uuid, 'replace', '0007', -1, gen_random_uuid()) $s$, 'validation');
-- Version zero means no code is assigned; replacing that state is stale rather than malformed.
select pg_temp.expect_error($s$ select public.change_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.r9')::uuid, 'replace', '0007', 0, gen_random_uuid()) $s$, 'stale_code');
select pg_temp.expect_error($s$ select public.change_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.r9')::uuid, 'generate', '0007', 0, gen_random_uuid()) $s$, 'validation');

-- A manual code must match the level's format.
select pg_temp.expect_error($s$ select public.change_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.r9')::uuid, 'assign', '77', 0, gen_random_uuid()) $s$, 'invalid_format');
select pg_temp.expect_error($s$ select public.change_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.r9')::uuid, 'assign', 'AB07', 0, gen_random_uuid()) $s$, 'invalid_format');
select pg_temp.expect_error($s$ select public.change_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.r10')::uuid, 'assign', '0007', 0, gen_random_uuid()) $s$, 'invalid_format');

-- An instructor assigns a manual code; zeroes are kept and the result is replayed for the same key.
select set_config('test.key1', gen_random_uuid()::text, true);
do $$ declare first_result jsonb; again jsonb; begin
  first_result := public.change_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.r9')::uuid, 'assign', ' 0007 ', 0, current_setting('test.key1')::uuid);
  if first_result <> '{"code": "0007", "version": 1}'::jsonb then raise exception 'Manual assignment returned %', first_result; end if;
  again := public.change_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.r9')::uuid, 'assign', '0007', 0, current_setting('test.key1')::uuid);
  if again <> first_result then raise exception 'Same key and payload must replay'; end if;
  if public.get_student_code_state('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.r9')::uuid) <> first_result then
    raise exception 'The stored state must match the result';
  end if;
end $$;
select pg_temp.expect_error($s$ select public.change_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.r9')::uuid, 'assign', '0008', 0, current_setting('test.key1')::uuid) $s$, 'idempotency_conflict');
-- A current code is never overwritten; a stale version is refused.
select pg_temp.expect_error($s$ select public.change_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.r9')::uuid, 'assign', '0008', 1, gen_random_uuid()) $s$, 'code_exists');
select pg_temp.expect_error($s$ select public.change_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.r9')::uuid, 'generate', null, 1, gen_random_uuid()) $s$, 'code_exists');
select pg_temp.expect_error($s$ select public.change_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.r9')::uuid, 'assign', '0008', 0, gen_random_uuid()) $s$, 'stale_code');
-- Another student cannot take it.
select pg_temp.expect_error($s$ select public.change_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.r9b')::uuid, 'assign', '0007', 0, gen_random_uuid()) $s$, 'code_taken');
-- The same code is free in another academy.
set local request.jwt.claim.sub = 'b1111111-1111-4111-8111-111111111111';
select public.save_student_code_settings('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 0, true, '####', '[]');
select public.change_student_code('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', current_setting('test.rb')::uuid, 'assign', '0007', 0, gen_random_uuid());

-- Retirement is separate and explicit; stale or repeated retirement cannot remove a newer code.
set local request.jwt.claim.sub = 'a2222222-2222-4222-8222-222222222222';
select pg_temp.expect_error($s$ select public.change_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.r9')::uuid, 'retire', null, 0, gen_random_uuid()) $s$, 'stale_code');
select set_config('test.key2', gen_random_uuid()::text, true);
do $$ declare retired jsonb; begin
  retired := public.change_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.r9')::uuid, 'retire', null, 1, current_setting('test.key2')::uuid);
  if retired <> '{"code": null, "version": 2}'::jsonb then raise exception 'Retirement returned %', retired; end if;
  if public.change_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.r9')::uuid, 'retire', null, 1, current_setting('test.key2')::uuid) <> retired then
    raise exception 'A repeated retirement with the same key must replay';
  end if;
end $$;
-- The retired value stays reserved, and the student can take a new code.
select pg_temp.expect_error($s$ select public.change_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.r9')::uuid, 'assign', '0007', 2, gen_random_uuid()) $s$, 'code_taken');
select public.change_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.r9')::uuid, 'assign', '0009', 2, gen_random_uuid());
-- The earlier retirement key cannot retire the newer code.
select pg_temp.expect_error($s$ select public.change_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.r9')::uuid, 'retire', null, 1, gen_random_uuid()) $s$, 'stale_code');
reset role;
do $$ begin
  if not exists (
    select 1 from public.student_code_assignments
    where code = '0007' and academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and retirement_reason = 'manual' and retired_by = 'a2222222-2222-4222-8222-222222222222'
  ) then
    raise exception 'Manual retirement must record the actor and reason';
  end if;
end $$;

-- Generation uses the level's format, skips taken values, and a replay consumes nothing more.
set local role authenticated;
set local request.jwt.claim.sub = 'a3333333-3333-4333-8333-333333333333';
select set_config('test.key3', gen_random_uuid()::text, true);
do $$ declare generated jsonb; begin
  generated := public.change_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.r10')::uuid, 'generate', null, 0, current_setting('test.key3')::uuid);
  if generated <> '{"code": "ST2001", "version": 1}'::jsonb then raise exception 'Generated %', generated; end if;
  if public.change_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.r10')::uuid, 'generate', null, 0, current_setting('test.key3')::uuid) <> generated then
    raise exception 'A repeated generate must replay';
  end if;
end $$;
select public.change_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.r9b')::uuid, 'generate', null, 0, gen_random_uuid());
reset role;
do $$ begin
  if (select code from public.student_code_assignments where annual_student_record_id = current_setting('test.r9b')::uuid and retired_at is null) <> '0001'
    or (select last_value from public.student_code_counters where academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and prefix = 'ST2') <> 1 then
    raise exception 'Generation must follow the level format and consume exactly one value per request';
  end if;
  -- Failed attempts left nothing behind.
  if (select count(*) from public.student_code_assignments where academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 4 then
    raise exception 'Unexpected number of assignments';
  end if;
end $$;

-- Changing a code retires the old one and issues the new one in a single step.
set local role authenticated;
set local request.jwt.claim.sub = 'a3333333-3333-4333-8333-333333333333';
select pg_temp.expect_error($s$ select public.change_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.r9')::uuid, 'replace', '0011', 2, gen_random_uuid()) $s$, 'stale_code');
select pg_temp.expect_error($s$ select public.change_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.r9')::uuid, 'replace', '0001', 3, gen_random_uuid()) $s$, 'code_taken');
select pg_temp.expect_error($s$ select public.change_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.r9')::uuid, 'replace', 'ST2011', 3, gen_random_uuid()) $s$, 'invalid_format');
do $$ declare changed jsonb; begin
  -- A failed change left the old code current.
  if public.get_student_code_state('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.r9')::uuid) <> '{"code": "0009", "version": 3}'::jsonb then
    raise exception 'A rejected change must keep the current code';
  end if;
  changed := public.change_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.r9')::uuid, 'replace', '0011', 3, gen_random_uuid());
  if changed <> '{"code": "0011", "version": 5}'::jsonb then raise exception 'Change returned %', changed; end if;
  -- The next suggestion skips every issued code and reserves nothing.
  if public.peek_next_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.r9b')::uuid) <> '0002'
    or public.peek_next_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.r9b')::uuid) <> '0002' then
    raise exception 'Peeking must return the next unissued code without consuming it';
  end if;
end $$;
select pg_temp.expect_error($s$ select public.peek_next_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.rb')::uuid) $s$, 'not_found');
set local request.jwt.claim.sub = 'c9999999-9999-4999-8999-999999999999';
select pg_temp.expect_error($s$ select public.peek_next_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.r9')::uuid) $s$, 'forbidden');
reset role;
do $$ begin
  if not exists (select 1 from public.student_code_assignments where code = '0009' and academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and retirement_reason = 'manual' and retired_by = 'a3333333-3333-4333-8333-333333333333')
    or (select count(*) from public.student_code_assignments where annual_student_record_id = current_setting('test.r9')::uuid and retired_at is null) <> 1 then
    raise exception 'A change must retire the old code and leave exactly one current code';
  end if;
end $$;

-- Issued codes stay reserved permanently: release and unretire are gone, retired values are never
-- issued again (to the former holder or anyone else), and a retired row cannot change.
set local role authenticated;
set local request.jwt.claim.sub = 'a3333333-3333-4333-8333-333333333333';
select pg_temp.expect_error($s$ select public.change_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.r9')::uuid, 'replace_release', '0012', 5, gen_random_uuid()) $s$, 'code_release_removed');
do $$ declare replaced jsonb; begin
  replaced := public.change_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.r9')::uuid, 'replace', '0012', 5, gen_random_uuid());
  if replaced <> '{"code": "0012", "version": 7}'::jsonb then raise exception 'Replacement returned %', replaced; end if;
end $$;
-- 0009 and 0011 are retired: neither the former holder nor another student can take them.
select pg_temp.expect_error($s$ select public.change_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.r9')::uuid, 'replace', '0011', 7, gen_random_uuid()) $s$, 'code_taken');
select pg_temp.expect_error($s$ select public.change_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.r9b')::uuid, 'replace', '0009', 1, gen_random_uuid()) $s$, 'code_taken');
select pg_temp.expect_error($s$ select public.change_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.r9b')::uuid, 'replace', '0011', 1, gen_random_uuid()) $s$, 'code_taken');
-- Peeking and allocation skip every issued string.
do $$ begin
  if public.peek_next_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.r9b')::uuid) in ('0001', '0007', '0009', '0011', '0012') then
    raise exception 'Peeking must skip issued codes';
  end if;
end $$;

-- Retired codes are listed for staff, with search that treats wildcards literally.
do $$ declare page jsonb; begin
  page := public.list_retired_student_codes('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '', 10, 0);
  if (page ->> 'total')::int < 1
    or not exists (select 1 from jsonb_array_elements(page -> 'rows') x where x ->> 'code' = '0007' and x ->> 'studentName' = 'Nine One' and x ->> 'reason' = 'manual') then
    raise exception 'Retired codes must be listed with their student: %', page;
  end if;
  if (public.list_retired_student_codes('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'nine', 10, 0) ->> 'total')::int < 1
    or (public.list_retired_student_codes('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'zzz%', 10, 0) ->> 'total')::int <> 0 then
    raise exception 'Search must match codes and names and treat wildcards literally';
  end if;
  perform set_config('test.retired0007', (select id::text from public.student_code_assignments where code = '0007' and academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), true);
end $$;
set local request.jwt.claim.sub = 'b1111111-1111-4111-8111-111111111111';
select pg_temp.expect_error($s$ select public.list_retired_student_codes('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '', 10, 0) $s$, 'forbidden');
-- The old unretire RPC no longer frees anything, for any role.
set local request.jwt.claim.sub = 'a2222222-2222-4222-8222-222222222222';
select pg_temp.expect_error($s$ select public.unretire_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.retired0007')::uuid) $s$, 'code_release_removed');
set local request.jwt.claim.sub = 'a3333333-3333-4333-8333-333333333333';
select pg_temp.expect_error($s$ select public.change_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.r9b')::uuid, 'replace', '0007', 1, gen_random_uuid()) $s$, 'code_taken');
reset role;
-- Even a privileged direct update cannot release a retired row or reuse its string.
select pg_temp.expect_error($s$ update public.student_code_assignments set retirement_reason = 'released' where id = current_setting('test.retired0007')::uuid $s$, 'code_history');
select pg_temp.expect_error($s$ delete from public.student_code_assignments where id = current_setting('test.retired0007')::uuid $s$, 'code_history');
do $$ begin
  if not exists (select 1 from public.student_code_reservations where academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and code in ('0007'))
    or (select count(*) from public.student_code_reservations r where r.academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
       <> (select count(distinct code) from public.student_code_assignments where academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') then
    raise exception 'Every issued string must be reserved exactly once';
  end if;
end $$;

-- Retirement keeps working while codes are off; assignment does not.
set local role authenticated;
set local request.jwt.claim.sub = 'a1111111-1111-4111-8111-111111111111';
select public.save_student_code_settings('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1, false, '####', '[{"levelId":"secondary-1","pattern":"ST2###"}]');
select public.change_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.r10')::uuid, 'retire', null, 1, gen_random_uuid());
select pg_temp.expect_error($s$ select public.change_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.r10')::uuid, 'assign', '0042', 2, gen_random_uuid()) $s$, 'codes_disabled');

-- The request table and direct ledger writes stay closed to users.
select pg_temp.expect_error($s$ select * from public.student_code_requests $s$, 'permission denied%');

rollback;
select 'student code change checks passed';
