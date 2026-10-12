-- Bulk student code generation: scope, preview, all-or-nothing runs, replay, and authority checks.
-- Run with `npm run test:db` against the marked isolated test target (see docs/engineering.md).
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

create function pg_temp.code_of(record_id text) returns text language sql as $$
  select a.code from public.student_code_assignments a
  where a.annual_student_record_id = record_id::uuid and a.retired_at is null;
$$;

insert into auth.users (id) values
  ('a1111111-1111-4111-8111-111111111111'),  -- owner of A
  ('a3333333-3333-4333-8333-333333333333'),  -- instructor of A
  ('b1111111-1111-4111-8111-111111111111'),  -- owner of B
  ('c9999999-9999-4999-8999-999999999999');  -- no membership

insert into public.academies (id, name, slug, icon, subject, created_by) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Gen A', 'gen-a', 'school', 'Math', 'a1111111-1111-4111-8111-111111111111'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Gen B', 'gen-b', 'school', 'Math', 'b1111111-1111-4111-8111-111111111111');
update public.academic_years set id = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', start_year = 2030
where academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
update public.academic_years set id = 'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb', start_year = 2030
where academy_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
insert into public.academy_memberships (academy_id, user_id, role, created_by) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a1111111-1111-4111-8111-111111111111', 'owner', 'a1111111-1111-4111-8111-111111111111'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a3333333-3333-4333-8333-333333333333', 'instructor', 'a1111111-1111-4111-8111-111111111111'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b1111111-1111-4111-8111-111111111111', 'owner', 'b1111111-1111-4111-8111-111111111111');
insert into public.academy_levels (academy_id, level_id, sort_order) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'grade-9', 9),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'grade-10', 10),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'grade-12', 12);
insert into public.groups (id, academy_id, academic_year_id, level_id, name) values
  ('99999999-0001-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'grade-9', 'Nine A'),
  ('99999999-0002-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'grade-10', 'Ten A'),
  ('99999999-0003-4000-8000-000000000003', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb', 'grade-12', 'Other');

grant usage on schema public, auth to authenticated, anon;

set local role authenticated;
set local request.jwt.claim.sub = 'a1111111-1111-4111-8111-111111111111';
-- Group Nine A: Zed and amy (name order: amy, Zed). Grade 9 without a group: Bob. Grade 10 in Ten A:
-- Cat. Grade 10 without a group: Dan. Archived grade 9: Old.
select set_config('test.zed', id::text, true) from public.create_student_record(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'Zed',
  '01000000001', '01100000001', 'grade-9', null, '99999999-0001-4000-8000-000000000001', 'in_person');
select set_config('test.amy', id::text, true) from public.create_student_record(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'amy',
  '01000000002', '01100000001', 'grade-9', null, '99999999-0001-4000-8000-000000000001', 'in_person');
select set_config('test.bob', id::text, true) from public.create_student_record(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'Bob',
  '01000000003', '01100000001', 'grade-9', null, null, 'in_person');
select set_config('test.cat', id::text, true) from public.create_student_record(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'Cat',
  '01000000004', '01100000001', 'grade-10', null, '99999999-0002-4000-8000-000000000002', 'in_person');
select set_config('test.dan', id::text, true) from public.create_student_record(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'Dan',
  '01000000005', '01100000001', 'grade-10', null, null, 'in_person');
select set_config('test.old', id::text, true) from public.create_student_record(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'Old',
  '01000000006', '01100000001', 'grade-9', null, '99999999-0001-4000-8000-000000000001', 'in_person');
set local request.jwt.claim.sub = 'b1111111-1111-4111-8111-111111111111';
select set_config('test.other', id::text, true) from public.create_student_record(
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb', 'Other',
  '01000000009', '01100000001', 'grade-12', null, null, 'in_person');
select public.save_student_code_settings('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 0, true, '####', '[]');

reset role;
update public.annual_student_records set archived_at = now() where id = current_setting('test.old')::uuid;
set local role authenticated;

-- Codes are off by default.
set local request.jwt.claim.sub = 'a3333333-3333-4333-8333-333333333333';
select pg_temp.expect_error($s$ select public.preview_student_code_generation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'all', '{}') $s$, 'codes_disabled');
select pg_temp.expect_error($s$ select public.generate_student_codes('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'all', '{}', 1, md5('x'), gen_random_uuid()) $s$, 'codes_disabled');

-- Default ####, grade 10 ST2###. Bob already holds the manual code 0002.
set local request.jwt.claim.sub = 'a1111111-1111-4111-8111-111111111111';
select public.save_student_code_settings('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 0, true, '####', '[{"levelId":"grade-10","pattern":"ST2###"}]');
select public.change_student_code('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.bob')::uuid, 'assign', '0002', 0, gen_random_uuid());

-- Outsiders and other academies.
set local request.jwt.claim.sub = 'c9999999-9999-4999-8999-999999999999';
select pg_temp.expect_error($s$ select public.preview_student_code_generation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'all', '{}') $s$, 'forbidden');
select pg_temp.expect_error($s$ select public.generate_student_codes('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'all', '{}', 1, md5('x'), gen_random_uuid()) $s$, 'forbidden');
set local request.jwt.claim.sub = 'b1111111-1111-4111-8111-111111111111';
select pg_temp.expect_error($s$ select public.preview_student_code_generation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'all', '{}') $s$, 'forbidden');

-- Scope validation: foreign or unknown levels and groups, ids with "all", empty selections.
set local request.jwt.claim.sub = 'a3333333-3333-4333-8333-333333333333';
select pg_temp.expect_error($s$ select public.preview_student_code_generation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'levels', '{grade-12}') $s$, 'invalid_target');
select pg_temp.expect_error($s$ select public.preview_student_code_generation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'groups', '{99999999-0003-4000-8000-000000000003}') $s$, 'invalid_target');
select pg_temp.expect_error($s$ select public.preview_student_code_generation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'groups', '{not-a-uuid}') $s$, 'invalid_target');
select pg_temp.expect_error($s$ select public.preview_student_code_generation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'all', '{grade-9}') $s$, 'validation');
select pg_temp.expect_error($s$ select public.preview_student_code_generation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'levels', '{}') $s$, 'validation');
select pg_temp.expect_error($s$ select public.preview_student_code_generation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'everyone', '{}') $s$, 'validation');

-- Numbering options: out-of-range values are rejected; a progression picks start, stride, and parity.
select pg_temp.expect_error($s$ select public.preview_student_code_generation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'all', '{}', 0, 1, 'any') $s$, 'validation');
select pg_temp.expect_error($s$ select public.preview_student_code_generation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'all', '{}', null, 0, 'any') $s$, 'validation');
select pg_temp.expect_error($s$ select public.preview_student_code_generation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'all', '{}', null, 1001, 'any') $s$, 'validation');
select pg_temp.expect_error($s$ select public.preview_student_code_generation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'all', '{}', null, 1, 'prime') $s$, 'validation');
do $$
declare
  odd_summary jsonb := public.preview_student_code_generation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'all', '{}', 10, 2, 'odd');
  even_summary jsonb := public.preview_student_code_generation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'all', '{}', 10, 3, 'even');
begin
  if odd_summary -> 'patterns' -> 0 -> 'examples' <> '["0011","0013","0015"]'::jsonb then
    raise exception 'Odd-only from 10 must start at 0011: %', odd_summary -> 'patterns' -> 0 -> 'examples';
  end if;
  if even_summary -> 'patterns' -> 0 -> 'examples' <> '["0010","0016","0022"]'::jsonb then
    raise exception 'Even-only with an odd step must step by 6: %', even_summary -> 'patterns' -> 0 -> 'examples';
  end if;
  if (odd_summary -> 'patterns' -> 0 ->> 'available')::bigint <> (select count(*) from generate_series(11, 9999, 2)) then
    raise exception 'Capacity must count only odd progression values';
  end if;
end $$;

-- Preview of everyone: archived Old and the other academy are excluded; Bob is already coded.
do $$ declare p jsonb; begin
  p := public.preview_student_code_generation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'all', '{}');
  if (p ->> 'targets')::int <> 5 or (p ->> 'coded')::int <> 1 or (p ->> 'missing')::int <> 4 then
    raise exception 'Unexpected counts %', p;
  end if;
  if jsonb_array_length(p -> 'patterns') <> 2 or p -> 'patterns' -> 0 ->> 'pattern' <> '####'
    or (p -> 'patterns' -> 0 ->> 'missing')::int <> 2 or p -> 'patterns' -> 1 ->> 'pattern' <> 'ST2###' then
    raise exception 'Unexpected patterns %', p -> 'patterns';
  end if;
  -- 0002 is taken, so the examples skip it and capacity excludes it.
  if p -> 'patterns' -> 0 -> 'examples' <> '["0001", "0003", "0004"]'::jsonb
    or (p -> 'patterns' -> 0 ->> 'available')::int <> 9998 then
    raise exception 'Unexpected examples or capacity %', p -> 'patterns' -> 0;
  end if;
  -- Preview reserves nothing.
  if exists (select 1 from public.student_code_counters c where c.academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and c.last_value > 0) then
    raise exception 'Preview must not move counters';
  end if;
end $$;

-- Duplicated ids collapse; a group run touches only that group, with each student's level format,
-- in name order (amy before Zed).
select set_config('test.token', public.preview_student_code_generation(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'groups',
  '{99999999-0001-4000-8000-000000000001,99999999-0001-4000-8000-000000000001}') ->> 'token', true);
select set_config('test.key1', gen_random_uuid()::text, true);
do $$ declare r jsonb; again jsonb; begin
  r := public.generate_student_codes('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'groups',
    '{99999999-0001-4000-8000-000000000001}', 1, current_setting('test.token'), current_setting('test.key1')::uuid);
  if (r ->> 'targets')::int <> 2 or (r ->> 'assigned')::int <> 2 or (r ->> 'skipped')::int <> 0 or r ->> 'order' <> 'name' then
    raise exception 'Unexpected result %', r;
  end if;
  if pg_temp.code_of(current_setting('test.amy')) <> '0001' or pg_temp.code_of(current_setting('test.zed')) <> '0003' then
    raise exception 'Unexpected codes amy=% zed=%', pg_temp.code_of(current_setting('test.amy')), pg_temp.code_of(current_setting('test.zed'));
  end if;
  if pg_temp.code_of(current_setting('test.cat')) is not null or pg_temp.code_of(current_setting('test.dan')) is not null
    or pg_temp.code_of(current_setting('test.old')) is not null or pg_temp.code_of(current_setting('test.other')) is not null then
    raise exception 'Students outside the scope must stay unchanged';
  end if;
  -- A retry after a lost response replays the original counts, not a zero-assignment run.
  again := public.generate_student_codes('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'groups',
    '{99999999-0001-4000-8000-000000000001}', 1, current_setting('test.token'), current_setting('test.key1')::uuid);
  if again <> r then raise exception 'Replay returned % instead of %', again, r; end if;
end $$;
select pg_temp.expect_error($s$ select public.generate_student_codes('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'all', '{}', 1, current_setting('test.token'), current_setting('test.key1')::uuid) $s$, 'idempotency_conflict');

-- The reviewed summary no longer holds once those students are coded.
select pg_temp.expect_error($s$ select public.generate_student_codes('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'groups', '{99999999-0001-4000-8000-000000000001}', 1, current_setting('test.token'), gen_random_uuid()) $s$, 'stale_preview');
select pg_temp.expect_error($s$ select public.generate_student_codes('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'all', '{}', 2, current_setting('test.token'), gen_random_uuid()) $s$, 'stale_preview');

-- Zero missing is a successful no-op.
do $$ declare p jsonb; r jsonb; begin
  p := public.preview_student_code_generation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'groups', '{99999999-0001-4000-8000-000000000001}');
  if (p ->> 'missing')::int <> 0 then raise exception 'Expected nothing missing %', p; end if;
  r := public.generate_student_codes('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'groups',
    '{99999999-0001-4000-8000-000000000001}', 1, p ->> 'token', gen_random_uuid());
  if (r ->> 'assigned')::int <> 0 or (r ->> 'skipped')::int <> 2 then raise exception 'Unexpected no-op %', r; end if;
end $$;

-- A student added after the run stays uncoded until another run.
set local request.jwt.claim.sub = 'a1111111-1111-4111-8111-111111111111';
select set_config('test.eve', id::text, true) from public.create_student_record(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'Eve',
  '01000000007', '01100000001', 'grade-9', null, '99999999-0001-4000-8000-000000000001', 'in_person');
do $$ begin
  if pg_temp.code_of(current_setting('test.eve')) is not null then raise exception 'New students start uncoded'; end if;
end $$;

-- Exhaustion fails the whole run with no partial assignments; the cursor rolls back too.
reset role;
insert into public.student_code_counters (academy_id, prefix, width, last_value)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ST2', 3, 998);
set local role authenticated;
set local request.jwt.claim.sub = 'a3333333-3333-4333-8333-333333333333';
do $$ declare p jsonb; before_count bigint; begin
  p := public.preview_student_code_generation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'all', '{}');
  if (p ->> 'missing')::int <> 3 or (p -> 'patterns' -> 1 ->> 'available')::int <> 1 then
    raise exception 'Expected one ST2 value left for two students %', p;
  end if;
  select count(*) into before_count from public.student_code_assignments where academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  begin
    perform public.generate_student_codes('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'all', '{}', 1, p ->> 'token', gen_random_uuid());
    raise exception 'Expected code_exhausted';
  exception when others then
    if sqlerrm <> 'code_exhausted' then raise; end if;
  end;
  if (select count(*) from public.student_code_assignments where academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> before_count then
    raise exception 'An exhausted run must assign nothing';
  end if;
end $$;
reset role;
update public.student_code_counters set last_value = 0
where academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and prefix = 'ST2';
set local role authenticated;

-- A level without a format blocks the run.
set local request.jwt.claim.sub = 'a1111111-1111-4111-8111-111111111111';
select public.save_student_code_settings('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1, true, null, '[{"levelId":"grade-10","pattern":"ST2###"}]');
do $$ declare p jsonb; begin
  p := public.preview_student_code_generation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'all', '{}');
  if p -> 'missingFormat' <> '[{"levelId": "grade-9", "missing": 1}]'::jsonb then raise exception 'Expected grade-9 without format %', p; end if;
  perform pg_temp.expect_error(format(
    'select public.generate_student_codes(%L, %L, %L, 2, %L, gen_random_uuid())',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'all', '{}', p ->> 'token'), 'pattern_missing');
end $$;

-- A level run with a new format; afterwards the counts match the ledger.
do $$ declare p jsonb; r jsonb; begin
  p := public.preview_student_code_generation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'levels', '{grade-10}');
  r := public.generate_student_codes('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'levels', '{grade-10}', 2, p ->> 'token', gen_random_uuid());
  if (r ->> 'assigned')::int <> 2 then raise exception 'Unexpected level run %', r; end if;
  if pg_temp.code_of(current_setting('test.cat')) <> 'ST2001' or pg_temp.code_of(current_setting('test.dan')) <> 'ST2002' then
    raise exception 'Unexpected grade-10 codes';
  end if;
  if (select last_value from public.student_code_counters where academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and prefix = 'ST2') <> 2 then
    raise exception 'The counter must follow the run';
  end if;
  if (select count(*) from public.student_code_assignments a join public.annual_student_records r on r.id = a.annual_student_record_id
      where a.academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and a.retired_at is null and r.archived_at is null) <> 5
    or pg_temp.code_of(current_setting('test.eve')) is not null then
    raise exception 'Only the five students reached by a run hold codes';
  end if;
end $$;

-- Disabling denies a direct run.
select public.save_student_code_settings('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 2, false, null, '[{"levelId":"grade-10","pattern":"ST2###"}]');
select pg_temp.expect_error($s$ select public.generate_student_codes('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'all', '{}', 3, md5('x'), gen_random_uuid()) $s$, 'codes_disabled');

-- Helpers are internal.
select pg_temp.expect_error($s$ select public.student_code_next_free('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '', 4, 0, 1) $s$, 'permission denied%');

rollback;
