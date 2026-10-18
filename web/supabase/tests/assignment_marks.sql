-- Assignment marks and results: grants, authority, exact part marks, work recording, fast code entry,
-- idempotent retries, per-student publication, corrections, the outbox, and closed years.
-- Run with `npm run test:db` against the marked isolated test target (see docs/engineering.md).
-- Everything runs in one transaction that is rolled back.

do $$ begin
  if not has_function_privilege('authenticated', 'public.save_assignment_marks(uuid, uuid, uuid, text, integer, jsonb, uuid, uuid)', 'execute')
    or not has_function_privilege('authenticated', 'public.record_assignment_work(uuid, uuid, uuid, integer, public.assignment_work_status, timestamptz, text)', 'execute')
    or not has_function_privilege('authenticated', 'public.publish_assignment_results(uuid, uuid, jsonb, uuid)', 'execute')
    or has_function_privilege('anon', 'public.save_assignment_marks(uuid, uuid, uuid, text, integer, jsonb, uuid, uuid)', 'execute')
    or has_function_privilege('anon', 'public.record_assignment_work(uuid, uuid, uuid, integer, public.assignment_work_status, timestamptz, text)', 'execute')
    or has_function_privilege('anon', 'public.publish_assignment_results(uuid, uuid, jsonb, uuid)', 'execute')
    or has_function_privilege('anon', 'public.list_assignment_marks(uuid, uuid, text, integer, integer, text)', 'execute')
    or has_function_privilege('anon', 'public.resolve_assignment_student(uuid, uuid, text)', 'execute')
    or has_function_privilege('authenticated', 'edra_private.save_assignment_marks(uuid, uuid, uuid, text, integer, jsonb, uuid, uuid)', 'execute')
    or has_function_privilege('authenticated', 'edra_private.publish_assignment_results(uuid, uuid, jsonb, uuid)', 'execute')
    or has_table_privilege('authenticated', 'public.assignment_marks', 'insert')
    or has_table_privilege('authenticated', 'public.assignment_marks', 'update')
    or has_table_privilege('authenticated', 'public.assignment_marks', 'delete')
    or has_table_privilege('authenticated', 'public.assignment_result_publications', 'insert')
    or has_table_privilege('authenticated', 'public.assignment_result_effects', 'select')
    or has_table_privilege('authenticated', 'public.assignment_requests', 'select')
    or has_table_privilege('anon', 'public.assignment_marks', 'select') then
    raise exception 'Assignment marks grants are wrong';
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

-- A two-part (10 + 15) draft for an audience given as JSON fields.
create function pg_temp.draft(audience jsonb, parts jsonb default '[{"title":"A","kind":"file_upload","questions":[{"max_score":"10"}]},{"title":"B","kind":"file_upload","questions":[{"max_score":"15"}]}]') returns jsonb
language sql as $$
  select jsonb_build_object('title', 'Unit 3 homework', 'instructions', '', 'due_at', null, 'parts', parts) || audience;
$$;

insert into auth.users (id) values
  ('a1111111-1111-4111-8111-111111111111'),  -- owner of S
  ('a2222222-2222-4222-8222-222222222222'),  -- admin of S
  ('a3333333-3333-4333-8333-333333333333'),  -- instructor of S
  ('b1111111-1111-4111-8111-111111111111'),  -- owner of T
  ('c1111111-1111-4111-8111-111111111111');  -- no membership
insert into public.academies (id, name, slug, icon, subject, created_by) values
  ('a5555555-5555-4555-8555-555555555555', 'Assign S', 'assign-s', 'school', 'Math', 'a1111111-1111-4111-8111-111111111111'),
  ('b6666666-6666-4666-8666-666666666666', 'Assign T', 'assign-t', 'school', 'Math', 'b1111111-1111-4111-8111-111111111111');
update public.academic_years set id = 'a5555555-1111-4111-8111-555555555555', start_year = 2030 where academy_id = 'a5555555-5555-4555-8555-555555555555';
update public.academic_years set id = 'b6666666-1111-4111-8111-666666666666', start_year = 2030 where academy_id = 'b6666666-6666-4666-8666-666666666666';
insert into public.academy_memberships (academy_id, user_id, role, created_by) values
  ('a5555555-5555-4555-8555-555555555555', 'a1111111-1111-4111-8111-111111111111', 'owner', 'a1111111-1111-4111-8111-111111111111'),
  ('a5555555-5555-4555-8555-555555555555', 'a2222222-2222-4222-8222-222222222222', 'admin', 'a1111111-1111-4111-8111-111111111111'),
  ('a5555555-5555-4555-8555-555555555555', 'a3333333-3333-4333-8333-333333333333', 'instructor', 'a1111111-1111-4111-8111-111111111111'),
  ('b6666666-6666-4666-8666-666666666666', 'b1111111-1111-4111-8111-111111111111', 'owner', 'b1111111-1111-4111-8111-111111111111');
insert into public.academy_levels (academy_id, level_id, sort_order) values
  ('a5555555-5555-4555-8555-555555555555', 'preparatory-3', 9),
  ('a5555555-5555-4555-8555-555555555555', 'secondary-1', 10),
  ('b6666666-6666-4666-8666-666666666666', 'preparatory-3', 9);
insert into public.academy_tracks (id, academy_id, level_id, name) values
  ('a7777777-7777-4777-8777-777777777777', 'a5555555-5555-4555-8555-555555555555', 'secondary-1', 'Science');
insert into public.groups (id, academy_id, academic_year_id, level_id, track_id, name) values
  ('a8888888-0000-4000-8000-000000000001', 'a5555555-5555-4555-8555-555555555555', 'a5555555-1111-4111-8111-555555555555', 'preparatory-3', null, 'Nine A'),
  ('a8888888-0000-4000-8000-000000000002', 'a5555555-5555-4555-8555-555555555555', 'a5555555-1111-4111-8111-555555555555', 'preparatory-3', null, 'Nine B'),
  ('a8888888-0000-4000-8000-000000000003', 'a5555555-5555-4555-8555-555555555555', 'a5555555-1111-4111-8111-555555555555', 'preparatory-3', null, 'Nine Empty'),
  ('b8888888-0000-4000-8000-000000000001', 'b6666666-6666-4666-8666-666666666666', 'b6666666-1111-4111-8111-666666666666', 'preparatory-3', null, 'T Nine');
grant usage on schema public, auth to authenticated, anon;

-- Setup as the owner of S: four preparatory-3 students (one archived later), one secondary-1 Science student.
set local role authenticated;
set local request.jwt.claim.sub = 'a1111111-1111-4111-8111-111111111111';
select set_config('test.s' || n, id::text, true) from (
  select n, (public.create_student_record('a5555555-5555-4555-8555-555555555555', 'a5555555-1111-4111-8111-555555555555', name,
    '0100000010' || n, '01100000000', 'preparatory-3', null, grp::uuid, 'in_person')).id
  from (values (1, 'Amal', 'a8888888-0000-4000-8000-000000000001'), (2, 'Aya', 'a8888888-0000-4000-8000-000000000001'),
    (3, 'Adam', 'a8888888-0000-4000-8000-000000000002'), (4, 'Alia', 'a8888888-0000-4000-8000-000000000001')) as v (n, name, grp)
) made;
select set_config('test.sci', (public.create_student_record('a5555555-5555-4555-8555-555555555555', 'a5555555-1111-4111-8111-555555555555',
  'Sami', '01000000199', '01100000000', 'secondary-1', 'a7777777-7777-4777-8777-777777777777', null, 'online_only')).id::text, true);
select public.set_student_records_archived('a5555555-5555-4555-8555-555555555555', 'a5555555-1111-4111-8111-555555555555',
  jsonb_build_array(jsonb_build_object('id', current_setting('test.s4'), 'version', 1)), true);
-- One coded student; the rest have no code and must still be recipients.
select public.save_student_code_settings('a5555555-5555-4555-8555-555555555555', 0, true, '####', '[]');
select public.change_student_code('a5555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid, 'assign', '0001', 0, gen_random_uuid());


-- The outbox has no client grants; this helper reads it as the owner.
reset role;
create function pg_temp.effects(effect text default null) returns integer language sql security definer as $$
  select count(*)::integer from public.assignment_result_effects
  where academy_id = 'a5555555-5555-4555-8555-555555555555' and (effect is null or effect_type::text = effect) $$;
set local role authenticated;

-- Helpers. rec(n) is the record id of student n; ver(n) the recipient's current version.
create function pg_temp.rec(n text) returns uuid language sql as $$ select current_setting('test.' || n)::uuid $$;
create function pg_temp.ver(n text) returns integer language sql as $$
  select version from public.assignment_recipients where assignment_id = 'a9999999-0000-4000-8000-000000000001'::uuid and annual_student_record_id = pg_temp.rec(n) $$;
-- Saves marks for a student by id at their current version, with a fresh key.
create function pg_temp.mark(n text, marks jsonb, feedback text default null) returns jsonb language sql as $$
  select public.save_assignment_marks('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', pg_temp.rec(n), null, pg_temp.ver(n),
    jsonb_build_object('marks', marks) || case when feedback is null then '{}'::jsonb else jsonb_build_object('feedback', feedback) end, gen_random_uuid()) $$;
create function pg_temp.pa(score text) returns jsonb language sql as $$ select jsonb_build_array(jsonb_build_object('part_id', current_setting('test.part_a'), 'score', score)) $$;
create function pg_temp.pb(score text) returns jsonb language sql as $$ select jsonb_build_array(jsonb_build_object('part_id', current_setting('test.part_b'), 'score', score)) $$;

-- The admin creates an active two-part (10 + 15) assignment for Third Preparatory: s1 (coded), s2, s3.
set local request.jwt.claim.sub = 'a2222222-2222-4222-8222-222222222222';
do $$ declare made jsonb; begin
  made := public.create_assignment('a5555555-5555-4555-8555-555555555555', 'a5555555-1111-4111-8111-555555555555', 'a9999999-0000-4000-8000-000000000001',
    jsonb_build_object('title', 'Unit 3', 'instructions', '', 'due_at', null, 'audience', 'level', 'level_id', 'preparatory-3',
      'parts', '[{"title":"A","kind":"file_upload","questions":[{"max_score":"10"}]},{"title":"B","kind":"file_upload","questions":[{"max_score":"15"}]}]'::jsonb));
  perform set_config('test.part_a', made->'parts'->0->>'id', true);
  perform set_config('test.part_b', made->'parts'->1->>'id', true);
end $$;
-- Active, ready assignments can be marked without a Publish action.
do $$ declare target jsonb; begin
  target := public.get_assignment('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001');
  if target->>'state' <> 'active' or not (target->>'ready')::boolean or (target->>'recipient_count')::int <> 3 then
    raise exception 'New assignment must be ready with its recipient snapshot: %', target;
  end if;
end $$;
select pg_temp.expect_error($s$ select public.change_assignment_state('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', 1, 'publish') $s$, 'validation');

-- Outsiders and other academies get nothing: no writes, no reads.
set local request.jwt.claim.sub = 'c1111111-1111-4111-8111-111111111111';
select pg_temp.expect_error($s$ select pg_temp.mark('s1', pg_temp.pa('5')) $s$, 'forbidden');
select pg_temp.expect_error($s$ select public.record_assignment_work('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', pg_temp.rec('s1'), 1, 'missing', null, '') $s$, 'forbidden');
select pg_temp.expect_error($s$ select public.publish_assignment_results('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', '[]', gen_random_uuid()) $s$, 'forbidden');
select pg_temp.expect_error($s$ select public.resolve_assignment_student('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', '0001') $s$, 'forbidden');
do $$ begin
  if public.list_assignment_marks('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001') is not null then raise exception 'Outsider read marks'; end if;
  if exists (select 1 from public.assignment_marks) then raise exception 'Outsider sees marks rows'; end if;
end $$;
set local request.jwt.claim.sub = 'b1111111-1111-4111-8111-111111111111';
select pg_temp.expect_error($s$ select pg_temp.mark('s1', pg_temp.pa('5')) $s$, 'forbidden');
do $$ begin
  if public.list_assignment_marks('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001') is not null then raise exception 'Other academy read marks'; end if;
end $$;

-- The instructor marks: part A of s1 and s2. The first ordinary mark records the work as received.
set local request.jwt.claim.sub = 'a3333333-3333-4333-8333-333333333333';
do $$ declare saved jsonb; begin
  saved := pg_temp.mark('s1', pg_temp.pa('7.5'));
  if saved->>'outcome' <> 'saved' or not (saved->>'work_recorded')::boolean
    or saved->'recipient'->>'work_status' <> 'submitted' or saved->'recipient'->>'marking' <> 'partial'
    or saved->'recipient'->>'total' <> '7.50' or (saved->'recipient'->>'version')::int <> 2 then
    raise exception 'First mark is wrong: %', saved;
  end if;
  saved := pg_temp.mark('s2', pg_temp.pa('0'));
  if saved->'recipient'->>'total' <> '0.00' or (saved->'recipient'->>'marked_parts')::int <> 1 then
    raise exception 'A zero mark must be a confirmed mark: %', saved;
  end if;
end $$;

-- Exact decimals and bounds: nothing is rounded or written.
select pg_temp.expect_error($s$ select pg_temp.mark('s3', pg_temp.pa('10.01')) $s$, 'invalid_score');
select pg_temp.expect_error($s$ select pg_temp.mark('s3', pg_temp.pa('-1')) $s$, 'invalid_score');
select pg_temp.expect_error($s$ select pg_temp.mark('s3', pg_temp.pa('1.234')) $s$, 'invalid_score');
select pg_temp.expect_error($s$ select pg_temp.mark('s3', pg_temp.pa('abc')) $s$, 'invalid_score');
select pg_temp.expect_error($s$ select pg_temp.mark('s3', pg_temp.pa('NaN')) $s$, 'invalid_score');
select pg_temp.expect_error($s$ select pg_temp.mark('s3', jsonb_build_array(jsonb_build_object('part_id', gen_random_uuid(), 'score', '1'))) $s$, 'unknown_part');
select pg_temp.expect_error($s$ select pg_temp.mark('s3', pg_temp.pa('1') || pg_temp.pa('2')) $s$, 'validation');
select pg_temp.expect_error($s$ select pg_temp.mark('s3', '[]') $s$, 'validation');
do $$ begin
  if exists (select 1 from public.assignment_marks where annual_student_record_id = pg_temp.rec('s3')) then raise exception 'Rejected marks wrote'; end if;
  if pg_temp.ver('s3') <> 1 then raise exception 'Rejected marks changed the version'; end if;
end $$;
-- Fractional marks are exact; a completed student has a total and a complete state.
do $$ declare saved jsonb; begin
  saved := pg_temp.mark('s1', pg_temp.pb('14.25'));
  if saved->'recipient'->>'total' <> '21.75' or saved->'recipient'->>'marking' <> 'complete'
    or saved->'recipient'->>'publication_state' <> 'unpublished' then
    raise exception 'Fractional total is wrong: %', saved;
  end if;
  -- Saving the same marks again changes nothing.
  saved := pg_temp.mark('s1', pg_temp.pb('14.25'));
  if saved->>'outcome' <> 'unchanged' then raise exception 'Unchanged save is wrong: %', saved; end if;
end $$;

-- A stale version writes nothing and returns the current row.
do $$ declare saved jsonb; begin
  saved := public.save_assignment_marks('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', pg_temp.rec('s1'), null, 1, jsonb_build_object('marks', pg_temp.pa('1')), gen_random_uuid());
  if saved->>'outcome' <> 'conflict' or saved->'recipient'->'marks'->0->>'score' <> '7.50' then raise exception 'Stale save is wrong: %', saved; end if;
end $$;

-- Retried requests: the same key replays the stored result; a changed payload under the same key conflicts.
do $$ declare key uuid := gen_random_uuid(); first jsonb; again jsonb; v integer := pg_temp.ver('s3'); begin
  first := public.save_assignment_marks('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', pg_temp.rec('s3'), null, v, jsonb_build_object('marks', pg_temp.pa('4')), key);
  again := public.save_assignment_marks('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', pg_temp.rec('s3'), null, v, jsonb_build_object('marks', pg_temp.pa('4')), key);
  if first->>'outcome' <> 'saved' or not (again->>'replayed')::boolean then raise exception 'Retry is wrong: % %', first, again; end if;
  if pg_temp.ver('s3') <> v + 1 then raise exception 'A replay applied twice'; end if;
  begin
    perform public.save_assignment_marks('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', pg_temp.rec('s3'), null, v, jsonb_build_object('marks', pg_temp.pa('5')), key);
    raise exception 'A changed payload under the same key was accepted';
  exception when others then
    if sqlerrm <> 'idempotency_conflict' then raise; end if;
  end;
end $$;

-- Excused parts carry a reason and an adjusted score; clearing removes the row.
select pg_temp.expect_error($s$ select pg_temp.mark('s3', jsonb_build_array(jsonb_build_object('part_id', current_setting('test.part_b'), 'score', '15', 'excused_reason', ''))) $s$, 'validation');
do $$ declare saved jsonb; begin
  saved := pg_temp.mark('s3', jsonb_build_array(jsonb_build_object('part_id', current_setting('test.part_b'), 'score', '15', 'excused_reason', 'Medical note')));
  if saved->'recipient'->>'marking' <> 'complete' or saved->'recipient'->>'total' <> '19.00' then raise exception 'Excused part is wrong: %', saved; end if;
end $$;
do $$ declare saved jsonb; begin
  saved := pg_temp.mark('s3', jsonb_build_array(jsonb_build_object('part_id', current_setting('test.part_b'), 'score', null)));
  if saved->'recipient'->>'marking' <> 'partial' or exists (
    select 1 from public.assignment_marks where annual_student_record_id = pg_temp.rec('s3') and part_id = current_setting('test.part_b')::uuid) then
    raise exception 'Clearing a part is wrong: %', saved;
  end if;
end $$;

-- Fast entry by code: normalized, exact, and for a recipient only.
do $$ declare resolved jsonb; saved jsonb; begin
  resolved := public.resolve_assignment_student('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', ' 0001 ');
  if resolved->>'annual_student_record_id' <> current_setting('test.s1') then raise exception 'Code resolution is wrong: %', resolved; end if;
  saved := public.save_assignment_marks('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', null, '0001', pg_temp.ver('s1'), jsonb_build_object('marks', pg_temp.pa('9')), gen_random_uuid());
  if saved->>'outcome' <> 'saved' or saved->'recipient'->'marks'->0->>'score' <> '9.00' then raise exception 'Code save is wrong: %', saved; end if;
end $$;
select pg_temp.expect_error($s$ select public.resolve_assignment_student('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', '9999') $s$, 'student_code_not_found');
select pg_temp.expect_error($s$ select public.save_assignment_marks('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', null, '9999', 1, '{"feedback":"x"}', gen_random_uuid()) $s$, 'student_code_not_found');
select pg_temp.expect_error($s$ select public.save_assignment_marks('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', pg_temp.rec('s1'), '0001', 1, '{"feedback":"x"}', gen_random_uuid()) $s$, 'validation');
select pg_temp.expect_error($s$ select public.save_assignment_marks('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', null, null, 1, '{"feedback":"x"}', gen_random_uuid()) $s$, 'validation');
-- A code of a student who is not a recipient (First Secondary).
set local request.jwt.claim.sub = 'a1111111-1111-4111-8111-111111111111';
select public.change_student_code('a5555555-5555-4555-8555-555555555555', pg_temp.rec('sci'), 'assign', '0002', 0, gen_random_uuid());
set local request.jwt.claim.sub = 'a3333333-3333-4333-8333-333333333333';
select pg_temp.expect_error($s$ select public.resolve_assignment_student('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', '0002') $s$, 'not_recipient');
select pg_temp.expect_error($s$ select public.save_assignment_marks('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', pg_temp.rec('sci'), null, 1, '{"feedback":"x"}', gen_random_uuid()) $s$, 'not_recipient');
-- A retired code is refused; disabled codes are refused.
set local request.jwt.claim.sub = 'a1111111-1111-4111-8111-111111111111';
select public.change_student_code('a5555555-5555-4555-8555-555555555555', pg_temp.rec('s2'), 'assign', '0003', 0, gen_random_uuid());
select public.change_student_code('a5555555-5555-4555-8555-555555555555', pg_temp.rec('s2'), 'retire', null, 1, gen_random_uuid());
set local request.jwt.claim.sub = 'a3333333-3333-4333-8333-333333333333';
select pg_temp.expect_error($s$ select public.resolve_assignment_student('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', '0003') $s$, 'student_code_retired');
select pg_temp.expect_error($s$ select public.save_assignment_marks('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', null, '0003', 1, '{"feedback":"x"}', gen_random_uuid()) $s$, 'student_code_retired');
-- A student with no code is still markable by id.
do $$ begin
  if (pg_temp.mark('s2', pg_temp.pb('3'))->>'outcome') <> 'saved' then raise exception 'Uncoded student not markable'; end if;
end $$;

-- Work status: recorded by staff for any student; marks and missing/excused do not mix.
do $$ declare saved jsonb; begin
  saved := public.record_assignment_work('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', pg_temp.rec('s3'), pg_temp.ver('s3'), 'late', now() - interval '1 day', 'Handed in after class');
  if saved->>'outcome' <> 'saved' or saved->'recipient'->>'work_status' <> 'late' then raise exception 'Late work is wrong: %', saved; end if;
end $$;
select pg_temp.expect_error($s$ select public.record_assignment_work('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', pg_temp.rec('s3'), pg_temp.ver('s3'), 'submitted', now() + interval '1 day', '') $s$, 'validation');
select pg_temp.expect_error($s$ select public.record_assignment_work('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', pg_temp.rec('s1'), pg_temp.ver('s1'), 'missing', null, '') $s$, 'has_marks');
select pg_temp.expect_error($s$ select public.record_assignment_work('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', pg_temp.rec('sci'), 1, 'missing', null, '') $s$, 'not_recipient');
do $$ declare saved jsonb; begin
  saved := public.record_assignment_work('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', pg_temp.rec('s3'), 1, 'missing', null, '');
  if saved->>'outcome' <> 'conflict' then raise exception 'Stale work status accepted: %', saved; end if;
end $$;

-- The structure is locked once work is recorded; active assignments with history cannot be archived.
set local request.jwt.claim.sub = 'a1111111-1111-4111-8111-111111111111';
select pg_temp.expect_error($s$ select public.change_assignment_state('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', 1, 'archive') $s$, 'invalid_state');

-- Filters.
do $$ declare listed jsonb; begin
  listed := public.list_assignment_marks('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', 'all');
  if (listed->>'total')::int <> 3 then raise exception 'List is wrong: %', listed; end if;
  if (public.list_assignment_marks('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', 'marked')->>'total')::int <> 2 then raise exception 'Marked filter is wrong'; end if;
  if (public.list_assignment_marks('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', 'unpublished')->>'total')::int <> 2 then raise exception 'Unpublished filter is wrong'; end if;
  if (public.list_assignment_marks('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', 'needs_marking')->>'total')::int <> 1 then raise exception 'Needs-marking filter is wrong'; end if;
end $$;
select pg_temp.expect_error($s$ select public.list_assignment_marks('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', 'nonsense') $s$, 'validation');

-- Search runs over the whole cohort before paging: literal names, normalized code prefixes.
do $$ declare listed jsonb; begin
  listed := public.list_assignment_marks('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', 'all', 1, 1, ' AM ');
  if (listed->>'total')::int <> 2 or jsonb_array_length(listed->'items') <> 1 or listed->'items'->0->>'full_name' <> 'Amal' then
    raise exception 'Name search must count every match and page after filtering: %', listed;
  end if;
  listed := public.list_assignment_marks('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', 'all', 10, 0, '000');
  if (listed->>'total')::int <> 1 or listed->'items'->0->>'student_code' <> '0001' then raise exception 'Code search is wrong: %', listed; end if;
  if (public.list_assignment_marks('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', 'all', 10, 0, '%')->>'total')::int <> 0
    or (public.list_assignment_marks('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', 'marked', 10, 0, 'adam')->>'total')::int
      <> (select count(*) from jsonb_array_elements(public.list_assignment_marks('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', 'marked')->'items') i where i->>'full_name' = 'Adam') then
    raise exception 'Search must be literal and combine with filters';
  end if;
end $$;

-- Publication: an incomplete student rejects the whole batch and nothing is written.
set local request.jwt.claim.sub = 'a3333333-3333-4333-8333-333333333333';
do $$ declare result jsonb; begin
  result := public.publish_assignment_results('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', jsonb_build_array(
    jsonb_build_object('annual_student_record_id', pg_temp.rec('s1'), 'expected_version', pg_temp.ver('s1')),
    jsonb_build_object('annual_student_record_id', pg_temp.rec('s3'), 'expected_version', pg_temp.ver('s3'))), gen_random_uuid());
  if result->>'outcome' <> 'rejected' or result->'failures'->0->>'reason' <> 'incomplete' then raise exception 'Batch not rejected: %', result; end if;
  if exists (select 1 from public.assignment_result_publications) or pg_temp.effects() <> 0 then
    raise exception 'A rejected batch wrote';
  end if;
  -- A stale version and a non-recipient are reported per student.
  result := public.publish_assignment_results('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', jsonb_build_array(
    jsonb_build_object('annual_student_record_id', pg_temp.rec('s1'), 'expected_version', 1),
    jsonb_build_object('annual_student_record_id', pg_temp.rec('sci'), 'expected_version', 1)), gen_random_uuid());
  if result->>'outcome' <> 'rejected' or jsonb_array_length(result->'failures') <> 2 then raise exception 'Failures are wrong: %', result; end if;
end $$;
select pg_temp.expect_error($s$ select public.publish_assignment_results('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', '[]', gen_random_uuid()) $s$, 'validation');
select pg_temp.expect_error(format($s$ select public.publish_assignment_results('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', '[{"annual_student_record_id":"%s","expected_version":1,"extra":1}]', gen_random_uuid()) $s$, pg_temp.rec('s1')), 'validation');

-- The instructor publishes the complete student; republishing without change makes no new revision.
do $$ declare result jsonb; key uuid := gen_random_uuid(); items jsonb; again jsonb; begin
  items := jsonb_build_array(jsonb_build_object('annual_student_record_id', pg_temp.rec('s1'), 'expected_version', pg_temp.ver('s1')));
  result := public.publish_assignment_results('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', items, key);
  if result->>'outcome' <> 'published' or result->'results'->0->>'outcome' <> 'published' or (result->'results'->0->>'revision')::int <> 1 then
    raise exception 'Publication is wrong: %', result;
  end if;
  again := public.publish_assignment_results('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', items, key);
  if not (again->>'replayed')::boolean then raise exception 'Publish retry is not a replay: %', again; end if;
  again := public.publish_assignment_results('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', items, gen_random_uuid());
  if again->'results'->0->>'outcome' <> 'unchanged' then raise exception 'Unchanged republish is wrong: %', again; end if;
  if (select count(*) from public.assignment_result_publications) <> 1
    or pg_temp.effects('result_published') <> 1 then
    raise exception 'Publication wrote duplicates';
  end if;
  if (public.list_assignment_marks('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', 'unpublished')->>'total')::int <> 1 then raise exception 'State is wrong'; end if;
end $$;

-- A correction: the official value stays on revision 1 until republished, then one corrected effect.
do $$ declare saved jsonb; result jsonb; begin
  saved := pg_temp.mark('s1', pg_temp.pa('8'));
  if saved->'recipient'->>'publication_state' <> 'pending_correction' or saved->'recipient'->'publication'->>'total' <> '23.25' then
    raise exception 'Pending correction is wrong: %', saved;
  end if;
  result := public.publish_assignment_results('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', jsonb_build_array(
    jsonb_build_object('annual_student_record_id', pg_temp.rec('s1'), 'expected_version', pg_temp.ver('s1'))), gen_random_uuid());
  if result->'results'->0->>'outcome' <> 'corrected' or (result->'results'->0->>'revision')::int <> 2 then raise exception 'Correction is wrong: %', result; end if;
  if pg_temp.effects('result_corrected') <> 1 then
    raise exception 'Corrected effect is wrong';
  end if;
  if (select previous_total from public.assignment_result_publications where revision = 2) <> 23.25
    or (select total from public.assignment_result_publications where revision = 2) <> 22.25 then
    raise exception 'Correction values are wrong';
  end if;
end $$;
-- Snapshots are immutable.
select pg_temp.expect_error($s$ update public.assignment_result_publications set total = 0 $s$, '%');

-- Close: no newly received work, but received work stays markable; republishing is still allowed.
set local request.jwt.claim.sub = 'a1111111-1111-4111-8111-111111111111';
select public.change_assignment_state('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', 1, 'close');
set local request.jwt.claim.sub = 'a3333333-3333-4333-8333-333333333333';
do $$ begin
  if (pg_temp.mark('s2', pg_temp.pa('6'))->>'outcome') <> 'saved' then raise exception 'Received work must stay markable'; end if;
end $$;

-- Direct writes are denied.
select pg_temp.expect_error($s$ insert into public.assignment_marks (assignment_id, annual_student_record_id, part_id, academy_id, kind, score, updated_by)
  values ('a9999999-0000-4000-8000-000000000001', pg_temp.rec('s1'), current_setting('test.part_a')::uuid, 'a5555555-5555-4555-8555-555555555555', 'mark', 1, 'a3333333-3333-4333-8333-333333333333') $s$, '%permission denied%');
select pg_temp.expect_error($s$ update public.assignment_recipients set work_status = 'excused' $s$, '%permission denied%');

-- A closed year is read-only for marks and publication.
reset role;
update public.academic_years set closed_at = now() where id = 'a5555555-1111-4111-8111-555555555555';
set local role authenticated;
set local request.jwt.claim.sub = 'a3333333-3333-4333-8333-333333333333';
select pg_temp.expect_error($s$ select pg_temp.mark('s1', pg_temp.pa('1')) $s$, 'year_unavailable');
select pg_temp.expect_error(format($s$ select public.publish_assignment_results('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', '[{"annual_student_record_id":"%s","expected_version":1}]', gen_random_uuid()) $s$, pg_temp.rec('s1')), 'year_unavailable');

rollback;
select 'assignment marks checks passed';
