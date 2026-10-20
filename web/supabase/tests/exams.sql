-- Exams (EDRA-78): grants, authority, preparation (mandatory timer) and locks, availability, online
-- attempts, question-aware departures (two warnings, third kicked), physical entry before opening,
-- first-final-submission-wins, deadlines (timer, headroom, tie, window_closed, delayed worker), private
-- marks, announcement, corrections, exclusions, solution qualification, live eligibility, archive,
-- year closure and the student projection. Run with `npm run test:db` against the marked isolated
-- test target (see docs/engineering.md). Everything runs in one transaction that is rolled back.
--
-- Time: commands read clock_timestamp(), so the suite moves windows and attempt times by updating
-- them as the table owner (the attempt guard is disabled only for those fixture updates).

do $$ begin
  if not has_function_privilege('authenticated', 'public.create_exam(uuid, uuid, uuid, jsonb)', 'execute')
    or not has_function_privilege('authenticated', 'public.save_exam_marks(uuid, uuid, uuid, integer, jsonb, uuid)', 'execute')
    or not has_function_privilege('authenticated', 'public.announce_exam_results(uuid, uuid, integer, jsonb, uuid)', 'execute')
    -- EDRA-233 retired the unfenced student mutations; the fenced commands are in student_exam_answering.sql.
    or has_function_privilege('authenticated', 'public.record_exam_departure(uuid, uuid, uuid)', 'execute')
    or has_function_privilege('anon', 'public.create_exam(uuid, uuid, uuid, jsonb)', 'execute')
    or has_function_privilege('anon', 'public.get_exam(uuid, uuid)', 'execute')
    or has_function_privilege('anon', 'public.start_exam_attempt(uuid)', 'execute')
    or has_function_privilege('anon', 'public.record_exam_departure(uuid, uuid, uuid)', 'execute')
    or has_function_privilege('authenticated', 'edra_private.start_exam_attempt_for(uuid, uuid)', 'execute')
    or has_function_privilege('authenticated', 'edra_private.save_exam_answers_for(uuid, uuid, integer, jsonb, uuid)', 'execute')
    or has_function_privilege('authenticated', 'edra_private.record_exam_departure_for(uuid, uuid, uuid, uuid)', 'execute')
    or has_function_privilege('authenticated', 'edra_private.settle_exam_closure(uuid)', 'execute')
    or has_function_privilege('authenticated', 'edra_private.exam_caller_record(uuid)', 'execute')
    or has_function_privilege('authenticated', 'edra_private.run_exam_deadlines(integer)', 'execute')
    or has_function_privilege('authenticated', 'edra_private.announce_exam_result(public.exams, uuid, boolean, timestamptz)', 'execute')
    or has_table_privilege('authenticated', 'public.exams', 'insert')
    or has_table_privilege('authenticated', 'public.exams', 'update')
    or has_table_privilege('authenticated', 'public.exam_choices', 'update')
    or has_table_privilege('authenticated', 'public.exam_marks', 'select')
    or has_table_privilege('authenticated', 'public.exam_online_answers', 'select')
    or has_table_privilege('authenticated', 'public.exam_departures', 'select')
    or has_table_privilege('authenticated', 'public.exam_submission_answers', 'select')
    or has_table_privilege('authenticated', 'public.exam_result_effects', 'select')
    or has_table_privilege('authenticated', 'public.exam_requests', 'select')
    or has_table_privilege('authenticated', 'public.exam_result_publications', 'insert')
    or has_table_privilege('anon', 'public.exams', 'select')
    or has_table_privilege('anon', 'public.exam_questions', 'select') then
    raise exception 'Exam grants are wrong';
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

create function pg_temp.check(ok boolean, message text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'Check failed: %', message; end if;
end;
$$;

insert into auth.users (id) values
  ('fa111111-1111-4111-8111-111111111111'),  -- owner of S
  ('fa222222-2222-4222-8222-222222222222'),  -- head admin of S
  ('fa333333-3333-4333-8333-333333333333'),  -- instructor of S
  ('fa444444-4444-4444-8444-444444444444'),  -- suspended admin of S
  ('fa555555-5555-4555-8555-555555555555'),  -- owner of T
  ('fa666666-6666-4666-8666-666666666666'),  -- no membership (also acts as the student account)
  ('fa777777-7777-4777-8777-777777777777');  -- admin of S
insert into public.academies (id, name, slug, icon, subject, created_by) values
  ('fb555555-5555-4555-8555-555555555555', 'Exam S', 'exam-s', 'school', 'Math', 'fa111111-1111-4111-8111-111111111111'),
  ('fb666666-6666-4666-8666-666666666666', 'Exam T', 'exam-t', 'school', 'Math', 'fa555555-5555-4555-8555-555555555555');
update public.academic_years set id = 'fb555555-1111-4111-8111-555555555555', start_year = 2031 where academy_id = 'fb555555-5555-4555-8555-555555555555';
update public.academic_years set id = 'fb666666-1111-4111-8111-666666666666', start_year = 2031 where academy_id = 'fb666666-6666-4666-8666-666666666666';
insert into public.academy_memberships (academy_id, user_id, role, created_by) values
  ('fb555555-5555-4555-8555-555555555555', 'fa111111-1111-4111-8111-111111111111', 'owner', 'fa111111-1111-4111-8111-111111111111'),
  ('fb555555-5555-4555-8555-555555555555', 'fa222222-2222-4222-8222-222222222222', 'head_admin', 'fa111111-1111-4111-8111-111111111111'),
  ('fb555555-5555-4555-8555-555555555555', 'fa333333-3333-4333-8333-333333333333', 'instructor', 'fa111111-1111-4111-8111-111111111111'),
  ('fb555555-5555-4555-8555-555555555555', 'fa444444-4444-4444-8444-444444444444', 'admin', 'fa111111-1111-4111-8111-111111111111'),
  ('fb555555-5555-4555-8555-555555555555', 'fa777777-7777-4777-8777-777777777777', 'admin', 'fa111111-1111-4111-8111-111111111111'),
  ('fb666666-6666-4666-8666-666666666666', 'fa555555-5555-4555-8555-555555555555', 'owner', 'fa555555-5555-4555-8555-555555555555');
update public.academy_memberships set suspended_at = now(), suspended_by = 'fa111111-1111-4111-8111-111111111111'
where academy_id = 'fb555555-5555-4555-8555-555555555555' and user_id = 'fa444444-4444-4444-8444-444444444444';
insert into public.academy_levels (academy_id, level_id, sort_order) values
  ('fb555555-5555-4555-8555-555555555555', 'preparatory-3', 9),
  ('fb555555-5555-4555-8555-555555555555', 'secondary-1', 10),
  ('fb666666-6666-4666-8666-666666666666', 'preparatory-3', 9);
insert into public.groups (id, academy_id, academic_year_id, level_id, track_id, name) values
  ('fc888888-0000-4000-8000-000000000001', 'fb555555-5555-4555-8555-555555555555', 'fb555555-1111-4111-8111-555555555555', 'preparatory-3', null, 'Nine A'),
  ('fc888888-0000-4000-8000-000000000002', 'fb555555-5555-4555-8555-555555555555', 'fb555555-1111-4111-8111-555555555555', 'preparatory-3', null, 'Nine B');
-- Helpers, created by the table owner so the read helpers (security definer) see every row whatever
-- the acting user. rec(n) is the record id of student n.
create function pg_temp.rec(n text) returns uuid language sql as $$ select current_setting('test.' || n)::uuid $$;
create function pg_temp.as_user(id text) returns void language sql as $$ select set_config('request.jwt.claim.sub', id, true) $$;
create function pg_temp.xa() returns uuid language sql as $$ select 'fd000000-0000-4000-8000-000000000001'::uuid $$;
create function pg_temp.xb() returns uuid language sql as $$ select 'fd000000-0000-4000-8000-000000000002'::uuid $$;
create function pg_temp.xc() returns uuid language sql as $$ select 'fd000000-0000-4000-8000-000000000003'::uuid $$;
create function pg_temp.academy() returns uuid language sql as $$ select 'fb555555-5555-4555-8555-555555555555'::uuid $$;
create function pg_temp.year() returns uuid language sql as $$ select 'fb555555-1111-4111-8111-555555555555'::uuid $$;
create function pg_temp.exam(id uuid) returns jsonb language sql security definer as $$ select edra_private.exam_json(id) $$;
create function pg_temp.question(id uuid, n integer) returns jsonb language sql security definer as $$
  select q from jsonb_array_elements(edra_private.exam_json(id)->'parts') p, jsonb_array_elements(p->'questions') q where (q->>'number')::integer = n $$;
create function pg_temp.qid(id uuid, n integer) returns uuid language sql security definer as $$ select (pg_temp.question(id, n)->>'id')::uuid $$;
create function pg_temp.choice(id uuid, n integer, pos integer) returns uuid language sql security definer as $$
  select (c->>'id')::uuid from jsonb_array_elements(pg_temp.question(id, n)->'choices') c where (c->>'position')::integer = pos $$;
create function pg_temp.student(id uuid, n text) returns jsonb language sql security definer as $$
  select edra_private.exam_student_row(id, pg_temp.rec(n)) $$;
create function pg_temp.state(id uuid, n text) returns jsonb language sql security definer as $$
  select edra_private.exam_student_state(id, pg_temp.rec(n)) $$;
create function pg_temp.effects(kind text default null) returns integer language sql security definer as $$
  select count(*)::integer from public.exam_result_effects where academy_id = 'fb555555-5555-4555-8555-555555555555' and (kind is null or effect_type::text = kind) $$;
create function pg_temp.marks_on(question uuid) returns integer language sql security definer as $$
  select count(*)::integer from public.exam_marks where question_id = question $$;
-- Mixed document: Q1, Q2 Question Sheet (2 marks each), Q3 Written Work (6 marks).
create function pg_temp.mixed(title text, timer integer) returns jsonb language sql as $$
  select jsonb_build_object(
    'title', title, 'instructions', 'Answer all', 'solution_notes', 'Worked solutions', 'audience', 'level', 'level_id', 'preparatory-3',
    'time_limit_minutes', timer,
    'parts', jsonb_build_array(
      jsonb_build_object('title', 'Choices', 'kind', 'question_sheet', 'questions', jsonb_build_array(
        jsonb_build_object('prompt', 'One?', 'max_score', '2', 'choices', '[{"label":"A","is_correct":true},{"label":"B"}]'::jsonb),
        jsonb_build_object('prompt', 'Two?', 'max_score', '2', 'choices', '[{"label":"A"},{"label":"B","is_correct":true}]'::jsonb))),
      jsonb_build_object('title', 'Written', 'kind', 'written_work', 'questions', jsonb_build_array(
        jsonb_build_object('prompt', 'Prove it', 'model_answer', 'Because', 'max_score', '6'))))) $$;
-- The stored document of an exam with its ids, for structure-preserving edits.
create function pg_temp.document(id uuid) returns jsonb language sql security definer as $$
  select jsonb_build_object('title', e->'title', 'instructions', e->'instructions', 'solution_notes', e->'solution_notes',
    'audience', e->'audience', 'level_id', e->'level_id', 'track_id', e->'track_id', 'group_ids', e->'group_ids',
    'time_limit_minutes', e->'time_limit_minutes',
    'parts', (select jsonb_agg(jsonb_build_object('id', p->'id', 'title', p->'title', 'instructions', p->'instructions', 'kind', p->'kind',
      'questions', (select jsonb_agg(jsonb_build_object('id', q->'id', 'prompt', q->'prompt', 'model_answer', q->'model_answer', 'max_score', q->'max_score',
        'choices', (select coalesce(jsonb_agg(jsonb_build_object('id', c->'id', 'label', c->'label', 'is_correct', c->'is_correct') order by (c->>'position')::integer), '[]'::jsonb)
          from jsonb_array_elements(q->'choices') c)) order by (q->>'position')::integer) from jsonb_array_elements(p->'questions') q)) order by (p->>'position')::integer)
      from jsonb_array_elements(e->'parts') p))
  from (select edra_private.exam_json(id) as e) x $$;
grant usage on schema public, auth to authenticated, anon;

set local role authenticated;
set local request.jwt.claim.sub = 'fa111111-1111-4111-8111-111111111111';
-- Six preparatory-3 students (s1..s6) and one secondary-1 student (ten).
select set_config('test.s' || n, (public.create_student_record('fb555555-5555-4555-8555-555555555555', 'fb555555-1111-4111-8111-555555555555',
  'Student ' || n, '0100000050' || n, '01100000000', 'preparatory-3', null, 'fc888888-0000-4000-8000-000000000001', 'in_person')).id::text, true)
from generate_series(1, 6) n;
select set_config('test.ten', (public.create_student_record('fb555555-5555-4555-8555-555555555555', 'fb555555-1111-4111-8111-555555555555',
  'Tenth', '01000000599', '01100000000', 'secondary-1', null, null, 'online_only')).id::text, true);

-- Ids used below.
--   exam A (fd000000-…01): mixed Question Sheet (Q1, Q2) + Written Work (Q3), 60-minute timer.
--   exam B (fd000000-…02): Question Sheet only (fully automatic), 10-minute timer, groups audience.
--   exam C (fd000000-…03): physical entry before any window.

-- ---------------------------------------------------------------------------------------------
-- Preparation: incomplete drafts, the mandatory timer and Answer Sheet rejection.

select pg_temp.as_user('fa666666-6666-4666-8666-666666666666');
select pg_temp.expect_error($s$ select public.create_exam(pg_temp.academy(), pg_temp.year(), pg_temp.xa(), '{"title":"x","parts":[]}') $s$, 'forbidden');
select pg_temp.as_user('fa555555-5555-4555-8555-555555555555');
select pg_temp.expect_error($s$ select public.create_exam(pg_temp.academy(), pg_temp.year(), pg_temp.xa(), '{"title":"x","parts":[]}') $s$, 'forbidden');
select pg_temp.as_user('fa444444-4444-4444-8444-444444444444');
select pg_temp.expect_error($s$ select public.create_exam(pg_temp.academy(), pg_temp.year(), pg_temp.xa(), '{"title":"x","parts":[]}') $s$, 'forbidden');

select pg_temp.as_user('fa333333-3333-4333-8333-333333333333');
select pg_temp.expect_error($s$ select public.create_exam(pg_temp.academy(), pg_temp.year(), pg_temp.xa(),
  '{"title":"x","parts":[{"title":"P","kind":"answer_sheet","questions":[]}]}') $s$, 'validation');
select pg_temp.expect_error($s$ select public.create_exam(pg_temp.academy(), pg_temp.year(), pg_temp.xa(),
  '{"title":"x","parts":[{"title":"P","kind":"written_work","questions":[{"max_score":"2.555"}]}]}') $s$, 'validation');
select pg_temp.expect_error($s$ select public.create_exam(pg_temp.academy(), pg_temp.year(), pg_temp.xa(),
  '{"title":"x","parts":[{"title":"P","kind":"written_work","questions":[{"max_score":"1000.01"}]}]}') $s$, 'validation');
select pg_temp.expect_error($s$ select public.create_exam(pg_temp.academy(), pg_temp.year(), pg_temp.xa(),
  '{"title":"x","time_limit_minutes":0,"parts":[]}') $s$, 'validation');

-- An instructor saves incomplete preparation: no target, timer or parts. Not ready.
do $$ declare made jsonb; begin
  made := public.create_exam(pg_temp.academy(), pg_temp.year(), pg_temp.xa(), '{"title":"Term exam","instructions":"","parts":[]}');
  perform pg_temp.check(not (made->>'ready')::boolean and made->'issues' @> '[{"issue":"target"},{"issue":"timer"},{"issue":"parts"}]', 'incomplete preparation is not ready');
  perform pg_temp.check(made->>'phase' = 'preparing', 'phase preparing');
  perform pg_temp.check((public.create_exam(pg_temp.academy(), pg_temp.year(), pg_temp.xa(), '{"title":"Term exam","parts":[]}')->>'version')::integer = 1, 'create retry');
end $$;

-- Complete everything except the timer: still not ready, and nothing can schedule or record work.
do $$ declare saved jsonb; begin
  saved := public.update_exam(pg_temp.academy(), pg_temp.xa(), 1, pg_temp.mixed('Term exam', null));
  perform pg_temp.check(not (saved->>'ready')::boolean and jsonb_array_length(saved->'issues') = 1
    and saved->'issues'->0->>'issue' = 'timer' and saved->>'phase' = 'preparing', 'only the timer is missing');
  perform pg_temp.check(saved->>'max_score' = '10.00' and (saved->>'question_count')::integer = 3, 'max 10, three questions');
  perform pg_temp.expect_error(format($f$ select public.save_exam_physical_draft(%L, %L, %L, 0, '[]', gen_random_uuid()) $f$, pg_temp.academy(), pg_temp.xa(), pg_temp.rec('s1')), 'not_ready');
end $$;
select pg_temp.as_user('fa222222-2222-4222-8222-222222222222');
select pg_temp.expect_error($s$ select public.configure_exam_availability(pg_temp.academy(), pg_temp.xa(), 2, now(), now() + interval '1 hour') $s$, 'not_ready');
select pg_temp.as_user('fa333333-3333-4333-8333-333333333333');
reset role;
select pg_temp.expect_error($s$ select edra_private.start_exam_attempt_for(pg_temp.xa(), pg_temp.rec('s1')) $s$, 'not_open');
set local role authenticated;

-- Add the timer: ready. Saving the stored document keeps every id; a stale version writes nothing.
do $$ declare saved jsonb; again jsonb; begin
  saved := public.update_exam(pg_temp.academy(), pg_temp.xa(), 2, pg_temp.mixed('Term exam', 60));
  perform pg_temp.check((saved->>'ready')::boolean and saved->>'phase' = 'ready' and (saved->>'time_limit_minutes')::integer = 60, 'timed exam ready');
  again := public.update_exam(pg_temp.academy(), pg_temp.xa(), 3, pg_temp.document(pg_temp.xa()));
  perform pg_temp.check(again->'parts'->0->'questions'->0->>'id' = saved->'parts'->0->'questions'->0->>'id'
    and again->'parts'->0->'questions'->0->'choices'->0->>'id' = saved->'parts'->0->'questions'->0->'choices'->0->>'id', 'ids preserved');
  perform pg_temp.expect_error(format($f$ select public.update_exam(%L, %L, 3, %L) $f$, pg_temp.academy(), pg_temp.xa(), '{"title":"x","parts":[]}'), 'exam_conflict');
end $$;

-- The list derives phase and filters by it; opening staff views locks nothing.
do $$ declare page jsonb; begin
  page := public.list_exams(pg_temp.academy(), pg_temp.year(), 'term', 'ready', null, false, 25, 0);
  perform pg_temp.check((page->>'total')::integer = 1 and page->'items'->0->>'phase' = 'ready', 'list filters by phase');
  perform pg_temp.check((public.list_exams(pg_temp.academy(), null, 'nothing-matches', null, null, false, 25, 0)->>'total')::integer = 0, 'search');
  perform public.list_exam_students(pg_temp.academy(), pg_temp.xa());
  perform public.get_exam(pg_temp.academy(), pg_temp.xa());
  perform pg_temp.check(pg_temp.exam(pg_temp.xa())->>'structure_locked_at' is null and pg_temp.exam(pg_temp.xa())->>'work_started_at' is null, 'reads lock nothing');
  perform pg_temp.check((pg_temp.exam(pg_temp.xa())->'counts'->>'eligible')::integer = 6, 'six eligible preparatory-3 students');
end $$;

-- Other academies read nothing; direct table access is denied.
select pg_temp.as_user('fa555555-5555-4555-8555-555555555555');
do $$ begin
  perform pg_temp.check(public.get_exam(pg_temp.academy(), pg_temp.xa()) is null, 'other academy get');
  perform pg_temp.check(public.list_exam_students(pg_temp.academy(), pg_temp.xa()) is null, 'other academy list');
  perform pg_temp.check(public.get_exam_student(pg_temp.academy(), pg_temp.xa(), pg_temp.rec('s1')) is null, 'other academy student');
  perform pg_temp.check(public.list_exams(pg_temp.academy(), null, null, null, null, true, 25, 0) is null, 'other academy exams');
  perform pg_temp.check(not exists (select 1 from public.exams where id = pg_temp.xa()), 'other academy row');
  -- Their own academy id does not unlock another academy's exam.
  perform pg_temp.check(public.get_exam('fb666666-6666-4666-8666-666666666666', pg_temp.xa()) is null, 'exam of another academy under own id');
end $$;
select pg_temp.expect_error($s$ select public.save_exam_physical_draft(pg_temp.academy(), pg_temp.xa(), pg_temp.rec('s1'), 0, '[]', gen_random_uuid()) $s$, 'forbidden');
select pg_temp.expect_error($s$ select public.save_exam_physical_draft('fb666666-6666-4666-8666-666666666666', pg_temp.xa(), pg_temp.rec('s1'), 0, '[]', gen_random_uuid()) $s$, 'not_found');
select pg_temp.expect_error($s$ update public.exams set title = 'x' $s$, '%permission denied%');
select pg_temp.expect_error($s$ insert into public.exam_marks (exam_id) values (gen_random_uuid()) $s$, '%permission denied%');
select pg_temp.expect_error($s$ select * from public.exam_online_answers $s$, '%permission denied%');
select pg_temp.expect_error($s$ select * from public.exam_departures $s$, '%permission denied%');
select pg_temp.expect_error($s$ select edra_private.exam_student_state(pg_temp.xa(), pg_temp.rec('s1')) $s$, '%permission denied%');
-- A suspended member reads nothing.
select pg_temp.as_user('fa444444-4444-4444-8444-444444444444');
select pg_temp.check(public.get_exam(pg_temp.academy(), pg_temp.xa()) is null and not exists (select 1 from public.exams where id = pg_temp.xa()), 'suspended staff read nothing');

-- Availability is manager-only.
select pg_temp.as_user('fa333333-3333-4333-8333-333333333333');
select pg_temp.expect_error($s$ select public.configure_exam_availability(pg_temp.academy(), pg_temp.xa(), 4, now(), now() + interval '1 hour') $s$, 'forbidden');
select pg_temp.as_user('fa222222-2222-4222-8222-222222222222');
select pg_temp.expect_error($s$ select public.configure_exam_availability(pg_temp.academy(), pg_temp.xa(), 4, now(), now() - interval '1 minute') $s$, 'validation');
do $$ declare q jsonb; begin
  q := public.configure_exam_availability(pg_temp.academy(), pg_temp.xa(), 4, now() - interval '1 minute', now() + interval '2 hours');
  perform pg_temp.check(q->>'phase' = 'open' and (q->>'actual_closes_at')::timestamptz = (q->>'closes_at')::timestamptz + interval '2 minutes', 'open with two-minute headroom');
end $$;

-- ---------------------------------------------------------------------------------------------
-- Online attempts (record-based trusted domain; the public wrappers deny until accounts link).

select pg_temp.as_user('fa666666-6666-4666-8666-666666666666');
select pg_temp.expect_error($s$ select public.start_exam_attempt(pg_temp.xa()) $s$, 'student_link_unavailable');
select pg_temp.expect_error($s$ select public.get_my_exam(pg_temp.xa()) $s$, 'student_link_unavailable');
select pg_temp.expect_error($s$ select public.record_exam_departure(pg_temp.xa(), gen_random_uuid(), gen_random_uuid()) $s$, '%permission denied%');
reset role;
-- Standalone exams need no content release once identity resolves; identity itself never resolves yet.
select pg_temp.check(edra_private.exam_content_access(pg_temp.xa(), pg_temp.rec('s1')) and edra_private.exam_caller_record(pg_temp.xa()) is null,
  'standalone access bypasses content only');

-- s2 starts, resumes (same start, deadline and count; no new attempt), saves and stale-saves.
do $$ declare first jsonb; again jsonb; saved jsonb; begin
  perform pg_temp.expect_error($s$ select edra_private.start_exam_attempt_for(pg_temp.xa(), pg_temp.rec('ten')) $s$, 'not_eligible');
  first := edra_private.start_exam_attempt_for(pg_temp.xa(), pg_temp.rec('s2'));
  perform pg_temp.check((first->'attempt'->>'deadline_at')::timestamptz = (first->'attempt'->>'started_at')::timestamptz + interval '60 minutes', 'individual deadline');
  perform pg_temp.check(first->'parts'->1->'questions'->0->>'number' = '3', 'original numbering projected');
  perform pg_temp.check(first->'solutions' = 'null'::jsonb and first::text not like '%is_correct%' and first::text not like '%Because%'
    and first::text not like '%Worked solutions%', 'no key before qualification');
  perform pg_temp.check((select work_started_at is not null and structure_locked_at is null from public.exams where id = pg_temp.xa()), 'start locks the target, not the structure');
  again := edra_private.start_exam_attempt_for(pg_temp.xa(), pg_temp.rec('s2'));
  perform pg_temp.check(again->'attempt'->>'started_at' = first->'attempt'->>'started_at' and again->'attempt'->>'deadline_at' = first->'attempt'->>'deadline_at', 'resume keeps start and deadline');
  perform pg_temp.check((select count(*) from public.exam_attempts where exam_id = pg_temp.xa()) = 1, 'single attempt');
  saved := edra_private.save_exam_answers_for(pg_temp.xa(), pg_temp.rec('s2'), 0, jsonb_build_array(
    jsonb_build_object('question_id', pg_temp.qid(pg_temp.xa(), 1), 'choice_id', pg_temp.choice(pg_temp.xa(), 1, 1)),
    jsonb_build_object('question_id', pg_temp.qid(pg_temp.xa(), 3), 'text_answer', 'My proof')), gen_random_uuid());
  perform pg_temp.check(saved->>'outcome' = 'saved' and (saved->'state'->'attempt'->>'answers_version')::integer = 1, 'saved');
  perform pg_temp.check((select structure_locked_at is not null from public.exams where id = pg_temp.xa()), 'answer locks structure');
  perform pg_temp.check(edra_private.save_exam_answers_for(pg_temp.xa(), pg_temp.rec('s2'), 0, jsonb_build_array(
    jsonb_build_object('question_id', pg_temp.qid(pg_temp.xa(), 2), 'choice_id', null)), gen_random_uuid())->>'outcome' = 'conflict', 'stale save conflicts');
  perform pg_temp.expect_error(format($f$ select edra_private.save_exam_answers_for(%L, %L, 1, %L, gen_random_uuid()) $f$, pg_temp.xa(), pg_temp.rec('s2'),
    jsonb_build_array(jsonb_build_object('question_id', pg_temp.qid(pg_temp.xa(), 1), 'text_answer', 'x'))), 'unknown_question');
  perform pg_temp.expect_error(format($f$ select edra_private.save_exam_answers_for(%L, %L, 1, %L, gen_random_uuid()) $f$, pg_temp.xa(), pg_temp.rec('s2'),
    jsonb_build_array(jsonb_build_object('question_id', pg_temp.qid(pg_temp.xa(), 2), 'choice_id', pg_temp.choice(pg_temp.xa(), 1, 1)))), 'unknown_question');
  -- A retried save with the same key replays; the key reused for other answers conflicts.
  saved := edra_private.save_exam_answers_for(pg_temp.xa(), pg_temp.rec('s2'), 1, jsonb_build_array(
    jsonb_build_object('question_id', pg_temp.qid(pg_temp.xa(), 2), 'choice_id', pg_temp.choice(pg_temp.xa(), 2, 2))), 'fe000000-0000-4000-8000-0000000000b1');
  perform pg_temp.check(not (saved->>'replayed')::boolean, 'first save');
  saved := edra_private.save_exam_answers_for(pg_temp.xa(), pg_temp.rec('s2'), 1, jsonb_build_array(
    jsonb_build_object('question_id', pg_temp.qid(pg_temp.xa(), 2), 'choice_id', pg_temp.choice(pg_temp.xa(), 2, 2))), 'fe000000-0000-4000-8000-0000000000b1');
  perform pg_temp.check((saved->>'replayed')::boolean and (saved->'state'->'attempt'->>'answers_version')::integer = 2, 'save retry replays');
  perform pg_temp.expect_error(format($f$ select edra_private.save_exam_answers_for(%L, %L, 2, %L, 'fe000000-0000-4000-8000-0000000000b1') $f$, pg_temp.xa(), pg_temp.rec('s2'),
    jsonb_build_array(jsonb_build_object('question_id', pg_temp.qid(pg_temp.xa(), 2), 'choice_id', null))), 'idempotency_conflict');
end $$;

-- Departures: question-aware warnings, duplicates, the last question and the third (kicked).
do $$ declare out jsonb; begin
  -- Another exam's question and an unknown question are rejected.
  perform pg_temp.expect_error(format($f$ select edra_private.record_exam_departure_for(%L, %L, gen_random_uuid(), gen_random_uuid()) $f$, pg_temp.xa(), pg_temp.rec('s2')), 'unknown_question');
  out := edra_private.record_exam_departure_for(pg_temp.xa(), pg_temp.rec('s2'), 'fe000000-0000-4000-8000-000000000001', pg_temp.qid(pg_temp.xa(), 2));
  perform pg_temp.check(out->>'outcome' = 'warned' and (out->'state'->'attempt'->>'departure_count')::integer = 1
    and (out->'departure'->>'ordinal')::integer = 1 and (out->'departure'->>'question_number')::integer = 2
    and (out->'departure'->>'next_question_id')::uuid = pg_temp.qid(pg_temp.xa(), 3), 'first departure warns and advances to Q3');
  -- The departed question keeps its saved answer and can be revisited.
  perform pg_temp.check(edra_private.save_exam_answers_for(pg_temp.xa(), pg_temp.rec('s2'), 2, jsonb_build_array(
    jsonb_build_object('question_id', pg_temp.qid(pg_temp.xa(), 2), 'choice_id', pg_temp.choice(pg_temp.xa(), 2, 1))), gen_random_uuid())->>'outcome' = 'saved', 'revisit after departure');
  -- A retried event returns its original outcome and counts nothing.
  out := edra_private.record_exam_departure_for(pg_temp.xa(), pg_temp.rec('s2'), 'fe000000-0000-4000-8000-000000000001', pg_temp.qid(pg_temp.xa(), 2));
  perform pg_temp.check(out->>'outcome' = 'duplicate' and out->'departure'->>'outcome' = 'warned' and (out->'departure'->>'ordinal')::integer = 1
    and (out->'state'->'attempt'->>'departure_count')::integer = 1, 'duplicate departure');
  perform pg_temp.expect_error(format($f$ select edra_private.record_exam_departure_for(%L, %L, 'fe000000-0000-4000-8000-000000000001', %L) $f$,
    pg_temp.xa(), pg_temp.rec('s2'), pg_temp.qid(pg_temp.xa(), 1)), 'idempotency_conflict');
  -- Leaving on the last question warns without inventing a next question.
  out := edra_private.record_exam_departure_for(pg_temp.xa(), pg_temp.rec('s2'), 'fe000000-0000-4000-8000-000000000002', pg_temp.qid(pg_temp.xa(), 3));
  perform pg_temp.check(out->>'outcome' = 'warned' and (out->'state'->'attempt'->>'departure_count')::integer = 2
    and out->'departure'->'next_question_id' = 'null'::jsonb and out->'state'->'submission' = 'null'::jsonb, 'second departure warns at the last question');
  -- The third distinct departure submits the saved answers as kicked.
  out := edra_private.record_exam_departure_for(pg_temp.xa(), pg_temp.rec('s2'), 'fe000000-0000-4000-8000-000000000003', pg_temp.qid(pg_temp.xa(), 1));
  perform pg_temp.check(out->>'outcome' = 'kicked' and out->'state'->'submission'->>'reason' = 'kicked'
    and out->'state'->'attempt'->>'finalization_reason' = 'kicked', 'third departure kicks');
  -- Mixed exam: not announced automatically; kicked is not a zero.
  perform pg_temp.check(out->'state'->'result' = 'null'::jsonb, 'no automatic announcement for manual work');
  perform pg_temp.check(pg_temp.student(pg_temp.xa(), 's2')->'result'->>'complete' = 'false'
    and (select count(*) from public.exam_submission_answers sa join public.exam_submissions s on s.id = sa.submission_id
      where s.exam_id = pg_temp.xa() and s.annual_student_record_id = pg_temp.rec('s2')) = 3, 'kicked work keeps every saved answer');
  -- Nothing resumes, and the kicking event replays its outcome.
  perform pg_temp.check(edra_private.save_exam_answers_for(pg_temp.xa(), pg_temp.rec('s2'), 3, jsonb_build_array(
    jsonb_build_object('question_id', pg_temp.qid(pg_temp.xa(), 1), 'choice_id', null)), gen_random_uuid())->>'outcome' = 'finalized', 'no saves after kick');
  out := edra_private.record_exam_departure_for(pg_temp.xa(), pg_temp.rec('s2'), 'fe000000-0000-4000-8000-000000000003', pg_temp.qid(pg_temp.xa(), 1));
  perform pg_temp.check(out->>'outcome' = 'duplicate' and out->'departure'->>'outcome' = 'kicked', 'kick retry replays the original outcome');
  out := edra_private.record_exam_departure_for(pg_temp.xa(), pg_temp.rec('s2'), 'fe000000-0000-4000-8000-000000000004', pg_temp.qid(pg_temp.xa(), 1));
  perform pg_temp.check(out->>'outcome' = 'finalized' and (out->'state'->'attempt'->>'departure_count')::integer = 3, 'later departures change nothing');
  perform pg_temp.check(edra_private.start_exam_attempt_for(pg_temp.xa(), pg_temp.rec('s2'))->'attempt'->>'finalization_reason' = 'kicked', 'returning cannot resume');
  perform pg_temp.check(jsonb_array_length(edra_private.exam_student_detail(pg_temp.xa(), pg_temp.rec('s2'))->'departures') = 3, 'staff see the departure log');
end $$;

-- s3 submits; a retried submit replays; physical confirmation then conflicts.
do $$ declare out jsonb; begin
  perform edra_private.start_exam_attempt_for(pg_temp.xa(), pg_temp.rec('s3'));
  perform edra_private.save_exam_answers_for(pg_temp.xa(), pg_temp.rec('s3'), 0, jsonb_build_array(
    jsonb_build_object('question_id', pg_temp.qid(pg_temp.xa(), 1), 'choice_id', pg_temp.choice(pg_temp.xa(), 1, 1)),
    jsonb_build_object('question_id', pg_temp.qid(pg_temp.xa(), 2), 'choice_id', pg_temp.choice(pg_temp.xa(), 2, 1))), gen_random_uuid());
  out := edra_private.submit_exam_attempt_for(pg_temp.xa(), pg_temp.rec('s3'), 'fe000000-0000-4000-8000-0000000000a3');
  perform pg_temp.check(out->>'outcome' = 'submitted' and out->'state'->'submission'->>'source' = 'online' and not (out->>'replayed')::boolean, 'submitted');
  out := edra_private.submit_exam_attempt_for(pg_temp.xa(), pg_temp.rec('s3'), 'fe000000-0000-4000-8000-0000000000a3');
  perform pg_temp.check((out->>'replayed')::boolean, 'submit retry replays');
  perform pg_temp.check(edra_private.submit_exam_attempt_for(pg_temp.xa(), pg_temp.rec('s3'), gen_random_uuid())->>'outcome' = 'finalized', 'second submit reports finalized');
end $$;
set local role authenticated;
select pg_temp.as_user('fa333333-3333-4333-8333-333333333333');
select pg_temp.check(public.confirm_exam_physical(pg_temp.academy(), pg_temp.xa(), pg_temp.rec('s3'), 0, gen_random_uuid())->>'outcome' = 'source_conflict'
  and pg_temp.student(pg_temp.xa(), 's3')->'submission'->>'source' = 'online', 'online accepted first: physical confirmation conflicts');
select pg_temp.check(public.save_exam_physical_draft(pg_temp.academy(), pg_temp.xa(), pg_temp.rec('s3'), 0, '[]', gen_random_uuid())->>'outcome' = 'source_conflict', 'no physical draft after acceptance');

-- Structure, target and timer are locked; title, instructions, model answers and notes stay editable.
do $$ declare q jsonb := pg_temp.exam(pg_temp.xa()); body jsonb := pg_temp.document(pg_temp.xa()); begin
  body := jsonb_set(jsonb_set(body, '{title}', '"Term exam (edited)"'), '{solution_notes}', '"Notes v2"');
  body := jsonb_set(body, '{parts,1,questions,0,model_answer}', '"Updated"');
  q := public.update_exam(pg_temp.academy(), pg_temp.xa(), (q->>'version')::integer, body);
  perform pg_temp.check(q->>'title' = 'Term exam (edited)' and pg_temp.question(pg_temp.xa(), 3)->>'model_answer' = 'Updated', 'locked exam keeps editable text');
  perform pg_temp.expect_error(format($f$ select public.update_exam(%L, %L, %s, %L) $f$, pg_temp.academy(), pg_temp.xa(), q->>'version',
    jsonb_set(body, '{parts,0,questions,0,max_score}', '"3"')), 'structure_locked');
  perform pg_temp.expect_error(format($f$ select public.update_exam(%L, %L, %s, %L) $f$, pg_temp.academy(), pg_temp.xa(), q->>'version',
    jsonb_set(body, '{parts,0,questions,0,choices,0,label}', '"Changed"')), 'structure_locked');
  perform pg_temp.expect_error(format($f$ select public.update_exam(%L, %L, %s, %L) $f$, pg_temp.academy(), pg_temp.xa(), q->>'version',
    body || '{"level_id":"secondary-1"}'), 'target_locked');
  perform pg_temp.expect_error(format($f$ select public.update_exam(%L, %L, %s, %L) $f$, pg_temp.academy(), pg_temp.xa(), q->>'version',
    body || '{"time_limit_minutes":90}'), 'target_locked');
end $$;

-- ---------------------------------------------------------------------------------------------
-- Physical entry: drafts coexist with an online draft; confirmation wins and supersedes it.

reset role;
select edra_private.start_exam_attempt_for(pg_temp.xa(), pg_temp.rec('s1'));
set local role authenticated;
select pg_temp.as_user('fa333333-3333-4333-8333-333333333333');
do $$ declare out jsonb; begin
  out := public.save_exam_physical_draft(pg_temp.academy(), pg_temp.xa(), pg_temp.rec('s1'), 0, jsonb_build_array(
    jsonb_build_object('question_id', pg_temp.qid(pg_temp.xa(), 1), 'choice_id', pg_temp.choice(pg_temp.xa(), 1, 1)),
    jsonb_build_object('question_id', pg_temp.qid(pg_temp.xa(), 2), 'choice_id', null)), gen_random_uuid());
  perform pg_temp.check(out->>'outcome' = 'saved' and (out->'student'->'physical_draft'->>'version')::integer = 1, 'physical draft saved');
  perform pg_temp.check(out->'student'->'submission' = 'null'::jsonb, 'a draft never chooses a source');
  perform pg_temp.check(public.save_exam_physical_draft(pg_temp.academy(), pg_temp.xa(), pg_temp.rec('s1'), 0, '[]', gen_random_uuid())->>'outcome' = 'conflict', 'stale draft');
  perform pg_temp.expect_error(format($f$ select public.save_exam_physical_draft(%L, %L, %L, 1, %L, gen_random_uuid()) $f$, pg_temp.academy(), pg_temp.xa(), pg_temp.rec('s1'),
    jsonb_build_array(jsonb_build_object('question_id', pg_temp.qid(pg_temp.xa(), 3), 'choice_id', null))), 'unknown_question');
  out := public.confirm_exam_physical(pg_temp.academy(), pg_temp.xa(), pg_temp.rec('s1'), 1, 'fe000000-0000-4000-8000-0000000000c1');
  perform pg_temp.check(out->'student'->'submission'->>'source' = 'physical' and (out->'student'->'attempt'->>'superseded')::boolean, 'physical wins, online superseded');
  perform pg_temp.check(out->'student'->'publication' = 'null'::jsonb, 'confirmation does not announce');
  perform pg_temp.check((public.confirm_exam_physical(pg_temp.academy(), pg_temp.xa(), pg_temp.rec('s1'), 1, 'fe000000-0000-4000-8000-0000000000c1')->>'replayed')::boolean, 'confirm retry replays');
  perform pg_temp.expect_error(format($f$ select public.confirm_exam_physical(%L, %L, %L, 1, 'fe000000-0000-4000-8000-0000000000c1') $f$, pg_temp.academy(), pg_temp.xa(), pg_temp.rec('s2')), 'idempotency_conflict');
  perform pg_temp.expect_error(format($f$ select public.save_exam_physical_draft(%L, %L, %L, 0, '[]', gen_random_uuid()) $f$, pg_temp.academy(), pg_temp.xa(), pg_temp.rec('ten')), 'not_eligible');
end $$;
reset role;
select pg_temp.check(edra_private.submit_exam_attempt_for(pg_temp.xa(), pg_temp.rec('s1'), gen_random_uuid())->>'outcome' = 'source_conflict', 'online cannot finalize after physical');
select pg_temp.check((select count(*) from public.exam_physical_answers where exam_id = pg_temp.xa()) = 2, 'losing draft kept separately');
set local role authenticated;

-- ---------------------------------------------------------------------------------------------
-- Marks and announcement.

select pg_temp.as_user('fa333333-3333-4333-8333-333333333333');
do $$ declare q3 uuid := pg_temp.qid(pg_temp.xa(), 3); v integer; out jsonb; begin
  perform pg_temp.expect_error(format($f$ select public.save_exam_marks(%L, %L, %L, 1, '{"marks":[]}', gen_random_uuid()) $f$, pg_temp.academy(), pg_temp.xa(), pg_temp.rec('s4')), 'not_submitted');
  v := (pg_temp.student(pg_temp.xa(), 's3')->>'version')::integer;
  perform pg_temp.check(pg_temp.student(pg_temp.xa(), 's3')->'result'->>'complete' = 'false', 'manual question unmarked');
  perform pg_temp.expect_error(format($f$ select public.save_exam_marks(%L, %L, %L, %s, %L, gen_random_uuid()) $f$, pg_temp.academy(), pg_temp.xa(), pg_temp.rec('s3'), v,
    jsonb_build_object('marks', jsonb_build_array(jsonb_build_object('question_id', q3, 'score', '6.5')))), 'invalid_score');
  perform pg_temp.expect_error(format($f$ select public.save_exam_marks(%L, %L, %L, %s, %L, gen_random_uuid()) $f$, pg_temp.academy(), pg_temp.xa(), pg_temp.rec('s3'), v,
    jsonb_build_object('marks', jsonb_build_array(jsonb_build_object('question_id', q3, 'score', '1.255')))), 'invalid_score');
  perform pg_temp.expect_error(format($f$ select public.save_exam_marks(%L, %L, %L, %s, %L, gen_random_uuid()) $f$, pg_temp.academy(), pg_temp.xa(), pg_temp.rec('s3'), v,
    jsonb_build_object('marks', jsonb_build_array(jsonb_build_object('question_id', q3, 'score', '-1')))), 'invalid_score');
  perform pg_temp.expect_error(format($f$ select public.save_exam_marks(%L, %L, %L, %s, %L, gen_random_uuid()) $f$, pg_temp.academy(), pg_temp.xa(), pg_temp.rec('s3'), v,
    jsonb_build_object('marks', jsonb_build_array(jsonb_build_object('question_id', pg_temp.qid(pg_temp.xa(), 1), 'score', '1')))), 'unknown_question');
  -- Zero is a mark and completes the result.
  out := public.save_exam_marks(pg_temp.academy(), pg_temp.xa(), pg_temp.rec('s3'), v,
    jsonb_build_object('marks', jsonb_build_array(jsonb_build_object('question_id', q3, 'score', '0')), 'feedback', 'Show steps'), gen_random_uuid());
  perform pg_temp.check(out->'student'->'result'->>'complete' = 'true' and out->'student'->'result'->>'total' = '2.00', 's3 complete at 2/10');
  -- Blank clears the mark again (unmarked), then it is re-entered.
  out := public.save_exam_marks(pg_temp.academy(), pg_temp.xa(), pg_temp.rec('s3'), v + 1,
    jsonb_build_object('marks', jsonb_build_array(jsonb_build_object('question_id', q3, 'score', null))), gen_random_uuid());
  perform pg_temp.check(out->'student'->'result'->>'complete' = 'false', 'blank is unmarked');
  out := public.save_exam_marks(pg_temp.academy(), pg_temp.xa(), pg_temp.rec('s3'), v + 2,
    jsonb_build_object('marks', jsonb_build_array(jsonb_build_object('question_id', q3, 'score', '0'))), gen_random_uuid());
  perform pg_temp.check(public.save_exam_marks(pg_temp.academy(), pg_temp.xa(), pg_temp.rec('s3'), v, '{"feedback":"x"}', gen_random_uuid())->>'outcome' = 'conflict', 'stale marks');
end $$;

do $$ declare rev integer := (pg_temp.exam(pg_temp.xa())->>'scoring_revision')::integer; out jsonb; v3 integer; v2 integer; begin
  v3 := (pg_temp.student(pg_temp.xa(), 's3')->>'version')::integer;
  v2 := (pg_temp.student(pg_temp.xa(), 's2')->>'version')::integer;
  -- All-or-nothing: s2's manual question is unmarked and s5 has no work, so nothing is announced.
  out := public.announce_exam_results(pg_temp.academy(), pg_temp.xa(), rev, jsonb_build_array(
    jsonb_build_object('annual_student_record_id', pg_temp.rec('s3'), 'expected_version', v3),
    jsonb_build_object('annual_student_record_id', pg_temp.rec('s2'), 'expected_version', v2),
    jsonb_build_object('annual_student_record_id', pg_temp.rec('s5'), 'expected_version', 1)), gen_random_uuid());
  perform pg_temp.check(out->>'outcome' = 'rejected' and out->'failures' @> jsonb_build_array(
    jsonb_build_object('annual_student_record_id', pg_temp.rec('s2'), 'reason', 'incomplete'),
    jsonb_build_object('annual_student_record_id', pg_temp.rec('s5'), 'reason', 'not_submitted')), 'rejected batch');
  perform pg_temp.check(pg_temp.effects() = 0, 'rejected batch writes nothing');
  out := public.announce_exam_results(pg_temp.academy(), pg_temp.xa(), rev, jsonb_build_array(
    jsonb_build_object('annual_student_record_id', pg_temp.rec('s3'), 'expected_version', v3 - 1)), gen_random_uuid());
  perform pg_temp.check(out->'failures'->0->>'reason' = 'stale', 'stale student');
  out := public.announce_exam_results(pg_temp.academy(), pg_temp.xa(), rev, jsonb_build_array(
    jsonb_build_object('annual_student_record_id', pg_temp.rec('s3'), 'expected_version', v3)), 'fe000000-0000-4000-8000-0000000000d3');
  perform pg_temp.check(out->>'outcome' = 'published' and out->'results'->0->>'outcome' = 'published', 'announced');
  perform pg_temp.check((public.announce_exam_results(pg_temp.academy(), pg_temp.xa(), rev, jsonb_build_array(
    jsonb_build_object('annual_student_record_id', pg_temp.rec('s3'), 'expected_version', v3)), 'fe000000-0000-4000-8000-0000000000d3')->>'replayed')::boolean, 'announce retry replays');
  out := public.announce_exam_results(pg_temp.academy(), pg_temp.xa(), rev, jsonb_build_array(
    jsonb_build_object('annual_student_record_id', pg_temp.rec('s3'), 'expected_version', v3)), gen_random_uuid());
  perform pg_temp.check(out->'results'->0->>'outcome' = 'unchanged' and pg_temp.effects('result_published') = 1, 'unchanged announcement adds nothing');
  perform pg_temp.check(pg_temp.state(pg_temp.xa(), 's3')->'result'->>'total' = '2.00', 'official result visible to the student');
end $$;

-- ---------------------------------------------------------------------------------------------
-- Corrections (managers only) and exclusions.

select pg_temp.expect_error($s$ select public.correct_exam_key(pg_temp.academy(), pg_temp.xa(), pg_temp.qid(pg_temp.xa(), 2),
  pg_temp.choice(pg_temp.xa(), 2, 1), 1, gen_random_uuid()) $s$, 'forbidden');
select pg_temp.expect_error($s$ select public.exclude_exam_question(pg_temp.academy(), pg_temp.xa(), pg_temp.qid(pg_temp.xa(), 2), 1, gen_random_uuid()) $s$, 'forbidden');
select pg_temp.as_user('fa777777-7777-4777-8777-777777777777');
do $$ declare out jsonb; official jsonb; begin
  -- Key of Q2 becomes choice 1: s3 (answered 1) gains 2 marks privately; the official result stays.
  out := public.correct_exam_key(pg_temp.academy(), pg_temp.xa(), pg_temp.qid(pg_temp.xa(), 2), pg_temp.choice(pg_temp.xa(), 2, 1), 1, gen_random_uuid());
  perform pg_temp.check((out->'exam'->>'scoring_revision')::integer = 2, 'scoring revision 2');
  official := pg_temp.student(pg_temp.xa(), 's3');
  perform pg_temp.check(official->>'publication_state' = 'pending_correction' and official->'publication'->>'total' = '2.00'
    and official->'result'->>'total' = '4.00', 'pending correction keeps the official result');
  perform pg_temp.check(pg_temp.state(pg_temp.xa(), 's3')->'result'->>'total' = '2.00', 'student still sees the official result');
  perform pg_temp.expect_error(format($f$ select public.announce_exam_results(%L, %L, 1, %L, gen_random_uuid()) $f$, pg_temp.academy(), pg_temp.xa(),
    jsonb_build_array(jsonb_build_object('annual_student_record_id', pg_temp.rec('s3'), 'expected_version', official->'version'))), 'stale_basis');
end $$;
-- An instructor announces the complete recalculated correction.
select pg_temp.as_user('fa333333-3333-4333-8333-333333333333');
do $$ declare out jsonb; official jsonb := pg_temp.student(pg_temp.xa(), 's3'); begin
  out := public.announce_exam_results(pg_temp.academy(), pg_temp.xa(), 2, jsonb_build_array(
    jsonb_build_object('annual_student_record_id', pg_temp.rec('s3'), 'expected_version', (official->>'version')::integer)), gen_random_uuid());
  perform pg_temp.check(out->'results'->0->>'outcome' = 'corrected' and (out->'results'->0->>'revision')::integer = 2 and pg_temp.effects('result_corrected') = 1, 'correction announced');
  perform pg_temp.check((select count(*) from public.exam_result_publications where annual_student_record_id = pg_temp.rec('s3')) = 2, 'previous revision kept');
end $$;
select pg_temp.as_user('fa777777-7777-4777-8777-777777777777');
do $$ declare out jsonb; begin
  out := public.exclude_exam_question(pg_temp.academy(), pg_temp.xa(), pg_temp.qid(pg_temp.xa(), 3), 2, gen_random_uuid());
  perform pg_temp.check(out->'exam'->>'effective_max_score' = '4.00' and (out->'exam'->>'fully_automatic')::boolean
    and (pg_temp.question(pg_temp.xa(), 3)->>'number')::integer = 3, 'excluded Q3 keeps its number');
  perform pg_temp.check(pg_temp.marks_on(pg_temp.qid(pg_temp.xa(), 3)) = 1, 'excluded mark retained');
  perform pg_temp.check(pg_temp.student(pg_temp.xa(), 's2')->'result'->>'complete' = 'true', 'exclusion removes the completeness requirement');
  perform pg_temp.expect_error(format($f$ select public.exclude_exam_question(%L, %L, %L, 3, gen_random_uuid()) $f$, pg_temp.academy(), pg_temp.xa(), pg_temp.qid(pg_temp.xa(), 3)), 'question_excluded');
  perform public.exclude_exam_question(pg_temp.academy(), pg_temp.xa(), pg_temp.qid(pg_temp.xa(), 2), 3, gen_random_uuid());
  perform pg_temp.expect_error(format($f$ select public.exclude_exam_question(%L, %L, %L, 4, gen_random_uuid()) $f$, pg_temp.academy(), pg_temp.xa(), pg_temp.qid(pg_temp.xa(), 1)), 'invalid_exclusion');
  perform pg_temp.expect_error(format($f$ select public.save_exam_marks(%L, %L, %L, %s, %L, gen_random_uuid()) $f$, pg_temp.academy(), pg_temp.xa(), pg_temp.rec('s3'),
    pg_temp.student(pg_temp.xa(), 's3')->>'version', jsonb_build_object('marks', jsonb_build_array(jsonb_build_object('question_id', pg_temp.qid(pg_temp.xa(), 3), 'score', '5')))), 'question_excluded');
end $$;
-- An active attempt cannot change an excluded answer, and a departure skips excluded questions.
reset role;
do $$ declare out jsonb; begin
  perform edra_private.start_exam_attempt_for(pg_temp.xa(), pg_temp.rec('s4'));
  perform pg_temp.expect_error(format($f$ select edra_private.save_exam_answers_for(%L, %L, 0, %L, gen_random_uuid()) $f$, pg_temp.xa(), pg_temp.rec('s4'),
    jsonb_build_array(jsonb_build_object('question_id', pg_temp.qid(pg_temp.xa(), 2), 'choice_id', pg_temp.choice(pg_temp.xa(), 2, 2)))), 'question_excluded');
  perform pg_temp.check(edra_private.exam_student_state(pg_temp.xa(), pg_temp.rec('s4'))->'excluded_question_ids' @> to_jsonb(array[pg_temp.qid(pg_temp.xa(), 2)]), 'excluded ids projected');
  -- Q2 and Q3 are excluded: leaving Q1 has no next question.
  out := edra_private.record_exam_departure_for(pg_temp.xa(), pg_temp.rec('s4'), gen_random_uuid(), pg_temp.qid(pg_temp.xa(), 1));
  perform pg_temp.check(out->>'outcome' = 'warned' and out->'departure'->'next_question_id' = 'null'::jsonb, 'no excluded next question');
end $$;
set local role authenticated;

-- Archive is manager-only and waits for running attempts (s4 is still answering).
select pg_temp.as_user('fa333333-3333-4333-8333-333333333333');
select pg_temp.expect_error($s$ select public.archive_exam(pg_temp.academy(), pg_temp.xa(), (pg_temp.exam(pg_temp.xa())->>'version')::integer) $s$, 'forbidden');
select pg_temp.as_user('fa777777-7777-4777-8777-777777777777');
select pg_temp.expect_error($s$ select public.archive_exam(pg_temp.academy(), pg_temp.xa(), (pg_temp.exam(pg_temp.xa())->>'version')::integer) $s$, 'exam_work_pending');

-- ---------------------------------------------------------------------------------------------
-- Deadlines on exam B: fully automatic, 10-minute timer.

select pg_temp.as_user('fa222222-2222-4222-8222-222222222222');
do $$ begin
  perform public.create_exam(pg_temp.academy(), pg_temp.year(), pg_temp.xb(), jsonb_build_object(
    'title', 'Timed', 'audience', 'groups', 'group_ids', jsonb_build_array('fc888888-0000-4000-8000-000000000001'), 'time_limit_minutes', 10,
    'parts', jsonb_build_array(jsonb_build_object('title', 'Choices', 'kind', 'question_sheet', 'questions', jsonb_build_array(
      jsonb_build_object('prompt', 'Q', 'max_score', '5', 'choices', '[{"label":"Yes","is_correct":true},{"label":"No"}]'::jsonb))))));
  perform public.configure_exam_availability(pg_temp.academy(), pg_temp.xb(), 1, now() - interval '1 minute', now() + interval '1 hour');
end $$;

reset role;
create function pg_temp.set_attempt(n text, started interval, deadline interval) returns void language plpgsql as $$
begin
  alter table public.exam_attempts disable trigger exam_attempts_guard;
  update public.exam_attempts set started_at = clock_timestamp() + started, deadline_at = clock_timestamp() + deadline
  where exam_id = pg_temp.xb() and annual_student_record_id = pg_temp.rec(n);
  alter table public.exam_attempts enable trigger exam_attempts_guard;
end;
$$;
create function pg_temp.set_window(closes interval) returns void language plpgsql as $$
declare c timestamptz := date_trunc('second', clock_timestamp()) + closes;
begin
  update public.exams set opens_at = c - interval '2 hours', closes_at = c, actual_closes_at = c + interval '2 minutes' where id = pg_temp.xb();
end;
$$;
create function pg_temp.answer(n text, pos integer) returns jsonb language sql as $$
  select edra_private.save_exam_answers_for(pg_temp.xb(), pg_temp.rec(n),
    (select answers_version from public.exam_attempts where exam_id = pg_temp.xb() and annual_student_record_id = pg_temp.rec(n)),
    jsonb_build_array(jsonb_build_object('question_id', pg_temp.qid(pg_temp.xb(), 1), 'choice_id', pg_temp.choice(pg_temp.xb(), 1, pos))),
    gen_random_uuid()) $$;

do $$ declare st jsonb; sub record; out jsonb; begin
  -- Timer expiry: s1 saved the right answer; its deadline passed well before closure.
  st := edra_private.start_exam_attempt_for(pg_temp.xb(), pg_temp.rec('s1'));
  perform pg_temp.check((st->'attempt'->>'deadline_at')::timestamptz = (st->'attempt'->>'started_at')::timestamptz + interval '10 minutes', 'timer deadline');
  perform pg_temp.answer('s1', 1);
  perform pg_temp.set_attempt('s1', interval '-20 minutes', interval '-10 minutes');
  -- Recovery after the deadline cannot reopen or extend; a late save settles and reports it.
  perform pg_temp.check(pg_temp.answer('s1', 2)->>'outcome' = 'finalized', 'late save finalizes, never saves');
  select s.* into sub from public.exam_submissions s where s.exam_id = pg_temp.xb() and s.annual_student_record_id = pg_temp.rec('s1');
  perform pg_temp.check(sub.reason = 'timer' and sub.submitted_at = sub.original_deadline_at and sub.processed_at > sub.submitted_at, 'timer submission at its deadline');
  -- Fully automatic online work is announced in the acceptance transaction; the late answer was not saved.
  st := edra_private.exam_student_state(pg_temp.xb(), pg_temp.rec('s1'));
  perform pg_temp.check(st->'result'->>'total' = '5.00' and st->'solutions' = 'null'::jsonb, 'automatic result, no solutions before closure');
  perform pg_temp.check((select automatic from public.exam_result_publications where exam_id = pg_temp.xb() and annual_student_record_id = pg_temp.rec('s1')), 'automatic publication');
  perform pg_temp.check(edra_private.start_exam_attempt_for(pg_temp.xb(), pg_temp.rec('s1'))->'attempt'->>'finalization_reason' = 'timer', 'recovery cannot reopen');

  -- A departure after the deadline is settled as timer first, never as kicked or warned.
  perform edra_private.start_exam_attempt_for(pg_temp.xb(), pg_temp.rec('s5'));
  perform pg_temp.answer('s5', 2);
  perform pg_temp.set_attempt('s5', interval '-20 minutes', interval '-1 second');
  out := edra_private.record_exam_departure_for(pg_temp.xb(), pg_temp.rec('s5'), gen_random_uuid(), pg_temp.qid(pg_temp.xb(), 1));
  perform pg_temp.check(out->>'outcome' = 'finalized' and out->'state'->'submission'->>'reason' = 'timer'
    and (out->'state'->'attempt'->>'departure_count')::integer = 0, 'deadline precedes departure');
  perform pg_temp.check(out->'state'->'result'->>'total' = '0.00', 'wrong answer scored 0, announced automatically');

  -- Headroom: s2 started; scheduled close passes; s2 continues, s3 cannot start.
  perform edra_private.start_exam_attempt_for(pg_temp.xb(), pg_temp.rec('s2'));
  perform pg_temp.set_attempt('s2', interval '-5 minutes', interval '5 minutes');
  -- s4 starts too: its deadline will coincide with actual closure (tie: timer wins).
  perform edra_private.start_exam_attempt_for(pg_temp.xb(), pg_temp.rec('s4'));
  -- s6 starts and saves nothing: closure still submits the empty attempt.
  perform edra_private.start_exam_attempt_for(pg_temp.xb(), pg_temp.rec('s6'));
  perform pg_temp.set_attempt('s6', interval '-5 minutes', interval '5 minutes');
  perform pg_temp.set_window(interval '-30 seconds');
  perform pg_temp.check(edra_private.exam_student_state(pg_temp.xb(), pg_temp.rec('s2'))->>'phase' = 'headroom', 'headroom phase');
  perform pg_temp.expect_error($s$ select edra_private.start_exam_attempt_for(pg_temp.xb(), pg_temp.rec('s3')) $s$, 'not_open');
  perform pg_temp.check(pg_temp.answer('s2', 2)->>'outcome' = 'saved', 'saves continue in headroom');
end $$;

do $$ declare c timestamptz; sub record; begin
  -- Actual closure passes: s2 and s6 (deadlines after closure) → window_closed at actual closure; s4 (deadline = actual closure) → timer.
  perform pg_temp.set_window(interval '-3 minutes');
  select actual_closes_at into c from public.exams where id = pg_temp.xb();
  alter table public.exam_attempts disable trigger exam_attempts_guard;
  update public.exam_attempts set deadline_at = c, started_at = c - interval '10 minutes' where exam_id = pg_temp.xb() and annual_student_record_id = pg_temp.rec('s4');
  update public.exam_attempts set deadline_at = c + interval '5 minutes', started_at = c - interval '5 minutes'
  where exam_id = pg_temp.xb() and annual_student_record_id in (pg_temp.rec('s2'), pg_temp.rec('s6'));
  alter table public.exam_attempts enable trigger exam_attempts_guard;
  perform pg_temp.check((edra_private.exam_json(pg_temp.xb())->>'processing_pending')::boolean, 'closed by time, pending processing');
  perform pg_temp.check(edra_private.settle_exam_closure(pg_temp.xb()) = 3, 'three attempts settled');
  select s.* into sub from public.exam_submissions s where s.exam_id = pg_temp.xb() and s.annual_student_record_id = pg_temp.rec('s2');
  perform pg_temp.check(sub.reason = 'window_closed' and sub.submitted_at = c and sub.processed_at >= c, 'window_closed at actual closure');
  select s.* into sub from public.exam_submissions s where s.exam_id = pg_temp.xb() and s.annual_student_record_id = pg_temp.rec('s4');
  perform pg_temp.check(sub.reason = 'timer' and sub.submitted_at = c, 'tie: timer wins');
  select s.* into sub from public.exam_submissions s where s.exam_id = pg_temp.xb() and s.annual_student_record_id = pg_temp.rec('s6');
  perform pg_temp.check(sub.reason = 'window_closed' and not exists (select 1 from public.exam_submission_answers where submission_id = sub.id), 'empty attempt still submitted');
  perform pg_temp.check(not exists (select 1 from public.exam_work where exam_id = pg_temp.xb() and annual_student_record_id = pg_temp.rec('s3')), 'never started: no work');
  perform pg_temp.check((select count(*) from public.exam_work where exam_id = pg_temp.xb() and solutions_qualified_at is not null) = 5, 'five qualified');
  perform pg_temp.check((select count(*) from public.exam_result_effects where exam_id = pg_temp.xb() and effect_type = 'solutions_qualified') = 5, 'qualification effects');
  perform pg_temp.check(edra_private.exam_student_state(pg_temp.xb(), pg_temp.rec('s2'))->'solutions'->'questions'->0->>'correct_choice_id' is not null, 'solutions released');
  perform pg_temp.check(edra_private.exam_student_state(pg_temp.xb(), pg_temp.rec('s3'))->'solutions' = 'null'::jsonb, 'no solutions without a submission');
  perform pg_temp.check(edra_private.settle_exam_closure(pg_temp.xb()) = 0
    and (select count(*) from public.exam_result_effects where exam_id = pg_temp.xb() and effect_type = 'solutions_qualified') = 5, 'idempotent closure');
end $$;

-- After actual closure: no physical work, no reopening, no earlier close.
set local role authenticated;
select pg_temp.as_user('fa333333-3333-4333-8333-333333333333');
select pg_temp.expect_error($s$ select public.confirm_exam_physical(pg_temp.academy(), pg_temp.xb(), pg_temp.rec('s3'), 0, gen_random_uuid()) $s$, 'exam_closed');
select pg_temp.expect_error($s$ select public.save_exam_physical_draft(pg_temp.academy(), pg_temp.xb(), pg_temp.rec('s3'), 0, '[]', gen_random_uuid()) $s$, 'exam_closed');
select pg_temp.as_user('fa222222-2222-4222-8222-222222222222');
select pg_temp.expect_error($s$ select public.configure_exam_availability(pg_temp.academy(), pg_temp.xb(), (pg_temp.exam(pg_temp.xb())->>'version')::integer, now(), now() + interval '1 day') $s$, 'exam_closed');
do $$ begin
  perform pg_temp.check(pg_temp.exam(pg_temp.xb())->>'phase' = 'closed' and pg_temp.exam(pg_temp.xb())->>'closure_settled_at' is not null, 'closed exam');
end $$;

-- An opened exam with work only moves its close later.
do $$ declare q jsonb := pg_temp.exam(pg_temp.xa()); begin
  perform pg_temp.expect_error(format($f$ select public.configure_exam_availability(%L, %L, %s, %L, %L) $f$, pg_temp.academy(), pg_temp.xa(), q->>'version',
    q->>'opens_at', ((q->>'closes_at')::timestamptz - interval '1 minute')::text), 'window_locked');
  perform pg_temp.expect_error(format($f$ select public.configure_exam_availability(%L, %L, %s, %L, %L) $f$, pg_temp.academy(), pg_temp.xa(), q->>'version',
    ((q->>'opens_at')::timestamptz - interval '1 minute')::text, q->>'closes_at'), 'already_open');
  perform pg_temp.expect_error(format($f$ select public.configure_exam_availability(%L, %L, %s, null, null) $f$, pg_temp.academy(), pg_temp.xa(), q->>'version'), 'already_open');
end $$;

-- ---------------------------------------------------------------------------------------------
-- Physical solutions on exam A: announced result + closure, in either order; the worker's lag.

select pg_temp.as_user('fa333333-3333-4333-8333-333333333333');
do $$ declare v integer; begin
  v := (pg_temp.student(pg_temp.xa(), 's1')->>'version')::integer;
  perform public.announce_exam_results(pg_temp.academy(), pg_temp.xa(), (pg_temp.exam(pg_temp.xa())->>'scoring_revision')::integer,
    jsonb_build_array(jsonb_build_object('annual_student_record_id', pg_temp.rec('s1'), 'expected_version', v)), gen_random_uuid());
  perform pg_temp.check(not (pg_temp.student(pg_temp.xa(), 's1')->>'solutions_qualified')::boolean, 'announcement alone does not qualify');
end $$;
reset role;
-- s4's open attempt on exam A is settled by closure.
update public.exams set opens_at = now() - interval '3 hours', closes_at = now() - interval '1 hour', actual_closes_at = now() - interval '58 minutes' where id = pg_temp.xa();
do $$ declare run record; begin
  -- A worker that was down for an hour recovers: the effective cutoff stays the actual closure.
  perform edra_private.run_exam_deadlines(50);
  select r.* into run from edra_private.exam_deadline_runs r order by r.id desc limit 1;
  perform pg_temp.check(run.failures = 0 and run.attempts >= 1 and run.max_lag_seconds > 3000, 'worker run recorded with its lag');
  perform pg_temp.check((select s.submitted_at = z.actual_closes_at and s.reason = 'window_closed' from public.exam_submissions s join public.exams z on z.id = s.exam_id
    where s.exam_id = pg_temp.xa() and s.annual_student_record_id = pg_temp.rec('s4')), 'late processing keeps the effective time');
  perform pg_temp.check((select solutions_qualified_at is not null from public.exam_work where exam_id = pg_temp.xa() and annual_student_record_id = pg_temp.rec('s1')), 'physical qualifies at closure after announcement');
  perform pg_temp.check((select solutions_qualified_at is not null from public.exam_work where exam_id = pg_temp.xa() and annual_student_record_id = pg_temp.rec('s2')), 'kicked work qualifies');
  perform pg_temp.check((select health.oldest_overdue_seconds is null from edra_private.exam_deadline_health() health), 'no overdue exam work left');
end $$;

-- ---------------------------------------------------------------------------------------------
-- Physical entry before any window, on a ready exam; announcement then closure qualifies.

set local role authenticated;
select pg_temp.as_user('fa333333-3333-4333-8333-333333333333');
do $$ declare out jsonb; v integer; begin
  perform public.create_exam(pg_temp.academy(), pg_temp.year(), pg_temp.xc(), pg_temp.mixed('Paper exam', 45));
  perform pg_temp.check(pg_temp.exam(pg_temp.xc())->>'phase' = 'ready' and pg_temp.exam(pg_temp.xc())->>'opens_at' is null, 'ready without a window');
  out := public.save_exam_physical_draft(pg_temp.academy(), pg_temp.xc(), pg_temp.rec('s1'), 0, jsonb_build_array(
    jsonb_build_object('question_id', pg_temp.qid(pg_temp.xc(), 1), 'choice_id', pg_temp.choice(pg_temp.xc(), 1, 1))), gen_random_uuid());
  perform pg_temp.check(out->>'outcome' = 'saved', 'physical draft before any window');
  out := public.confirm_exam_physical(pg_temp.academy(), pg_temp.xc(), pg_temp.rec('s1'), 1, gen_random_uuid());
  perform pg_temp.check(out->>'outcome' = 'confirmed' and out->'student'->'submission'->>'reason' = 'physical', 'confirmed before any window');
  v := (pg_temp.student(pg_temp.xc(), 's1')->>'version')::integer;
  out := public.save_exam_marks(pg_temp.academy(), pg_temp.xc(), pg_temp.rec('s1'), v,
    jsonb_build_object('marks', jsonb_build_array(jsonb_build_object('question_id', pg_temp.qid(pg_temp.xc(), 3), 'score', '4.5'))), gen_random_uuid());
  perform pg_temp.check(out->'student'->'result'->>'total' = '6.50', 'exact decimal total');
  perform public.announce_exam_results(pg_temp.academy(), pg_temp.xc(), 1, jsonb_build_array(
    jsonb_build_object('annual_student_record_id', pg_temp.rec('s1'), 'expected_version', v + 1)), gen_random_uuid());
  perform pg_temp.check(not (pg_temp.student(pg_temp.xc(), 's1')->>'solutions_qualified')::boolean
    and pg_temp.state(pg_temp.xc(), 's1')->'solutions' = 'null'::jsonb, 'announced physical work waits for closure');
end $$;
reset role;
update public.exams set opens_at = now() - interval '3 hours', closes_at = now() - interval '1 hour', actual_closes_at = now() - interval '58 minutes' where id = pg_temp.xc();
select edra_private.settle_exam_closure(pg_temp.xc());
select pg_temp.check((select solutions_qualified_at is not null from public.exam_work where exam_id = pg_temp.xc() and annual_student_record_id = pg_temp.rec('s1'))
  and pg_temp.state(pg_temp.xc(), 's1')->'solutions'->>'notes' = 'Worked solutions', 'announced then closed: qualified');

-- ---------------------------------------------------------------------------------------------
-- Live eligibility for new physical work (even with a draft) and the structure lock at acceptance.

set local role authenticated;
select pg_temp.as_user('fa333333-3333-4333-8333-333333333333');
do $$ begin
  perform public.create_exam(pg_temp.academy(), pg_temp.year(), 'fd000000-0000-4000-8000-000000000004', pg_temp.mixed('Moves', 30));
  perform public.create_exam(pg_temp.academy(), pg_temp.year(), 'fd000000-0000-4000-8000-000000000005', pg_temp.mixed('Blank', 30));
end $$;
do $$ declare out jsonb; begin
  out := public.save_exam_physical_draft(pg_temp.academy(), 'fd000000-0000-4000-8000-000000000004', pg_temp.rec('s6'), 0, jsonb_build_array(
    jsonb_build_object('question_id', pg_temp.qid('fd000000-0000-4000-8000-000000000004', 1),
      'choice_id', pg_temp.choice('fd000000-0000-4000-8000-000000000004', 1, 1))), gen_random_uuid());
  perform pg_temp.check(out->>'outcome' = 'saved', 'draft saved while eligible');
end $$;
reset role;
update public.annual_student_records set level_id = 'secondary-1', primary_group_id = null where id = pg_temp.rec('s6');
set local role authenticated;
select pg_temp.as_user('fa333333-3333-4333-8333-333333333333');
select pg_temp.expect_error(format($f$ select public.save_exam_physical_draft(%L, 'fd000000-0000-4000-8000-000000000004', %L, 1, '[]', gen_random_uuid()) $f$,
  pg_temp.academy(), pg_temp.rec('s6')), 'not_eligible');
select pg_temp.expect_error(format($f$ select public.confirm_exam_physical(%L, 'fd000000-0000-4000-8000-000000000004', %L, 1, gen_random_uuid()) $f$,
  pg_temp.academy(), pg_temp.rec('s6')), 'not_eligible');
select pg_temp.check((pg_temp.student('fd000000-0000-4000-8000-000000000004', 's6')->'physical_draft'->>'version')::integer = 1
  and not (pg_temp.student('fd000000-0000-4000-8000-000000000004', 's6')->>'eligible')::boolean, 'draft stays readable and the change is visible');
select pg_temp.check((select count(*) from public.exam_submissions where exam_id = 'fd000000-0000-4000-8000-000000000004') = 0, 'nothing was accepted');
-- The historical participant stays in the student list.
select pg_temp.check(exists (select 1 from jsonb_array_elements(public.list_exam_students(pg_temp.academy(), 'fd000000-0000-4000-8000-000000000004')->'items') i
  where (i->>'annual_student_record_id')::uuid = pg_temp.rec('s6')), 'historical participant listed');
reset role;
update public.annual_student_records set level_id = 'preparatory-3', primary_group_id = 'fc888888-0000-4000-8000-000000000001' where id = pg_temp.rec('s6');
set local role authenticated;
select pg_temp.as_user('fa333333-3333-4333-8333-333333333333');
do $$ declare out jsonb; q jsonb; begin
  perform pg_temp.check(pg_temp.exam('fd000000-0000-4000-8000-000000000005')->>'structure_locked_at' is null, 'fresh exam is unlocked');
  out := public.confirm_exam_physical(pg_temp.academy(), 'fd000000-0000-4000-8000-000000000005', pg_temp.rec('s2'), 0, gen_random_uuid());
  perform pg_temp.check(out->>'outcome' = 'confirmed', 'blank physical work confirmed');
  q := pg_temp.exam('fd000000-0000-4000-8000-000000000005');
  perform pg_temp.check(q->>'structure_locked_at' is not null, 'acceptance locked the structure');
  perform pg_temp.expect_error(format($f$ select public.update_exam(%L, %L, %s, %L) $f$, pg_temp.academy(), 'fd000000-0000-4000-8000-000000000005', q->>'version',
    jsonb_set(pg_temp.document('fd000000-0000-4000-8000-000000000005'), '{parts,0,questions,0,max_score}', '"5"')), 'structure_locked');
end $$;

-- ---------------------------------------------------------------------------------------------
-- Year closure settles due work and refuses while an attempt still runs; afterwards everything is read-only.

select pg_temp.as_user('fa222222-2222-4222-8222-222222222222');
do $$ begin
  perform public.create_exam(pg_temp.academy(), pg_temp.year(), 'fd000000-0000-4000-8000-000000000006', jsonb_build_object(
    'title', 'Running', 'audience', 'level', 'level_id', 'preparatory-3', 'time_limit_minutes', 120,
    'parts', jsonb_build_array(jsonb_build_object('title', 'W', 'kind', 'written_work', 'questions', jsonb_build_array(jsonb_build_object('prompt', 'Q', 'max_score', '1'))))));
  perform public.configure_exam_availability(pg_temp.academy(), 'fd000000-0000-4000-8000-000000000006', 1, now() - interval '1 minute', now() + interval '1 hour');
end $$;
reset role;
select edra_private.start_exam_attempt_for('fd000000-0000-4000-8000-000000000006', pg_temp.rec('s6'));
select pg_temp.expect_error($s$ update public.academic_years set closed_at = now() where id = pg_temp.year() $s$, 'exam_work_pending');
-- Archive also waits for the running attempt.
set local role authenticated;
select pg_temp.as_user('fa222222-2222-4222-8222-222222222222');
select pg_temp.expect_error($s$ select public.archive_exam(pg_temp.academy(), 'fd000000-0000-4000-8000-000000000006', (pg_temp.exam('fd000000-0000-4000-8000-000000000006')->>'version')::integer) $s$, 'exam_work_pending');
reset role;
update public.exams set opens_at = now() - interval '3 hours', closes_at = now() - interval '1 hour', actual_closes_at = now() - interval '58 minutes'
where id = 'fd000000-0000-4000-8000-000000000006';
update public.academic_years set closed_at = now() where id = pg_temp.year();
select pg_temp.check((select reason = 'window_closed' from public.exam_submissions where exam_id = 'fd000000-0000-4000-8000-000000000006'), 'year close settled the attempt');
set local role authenticated;
select pg_temp.as_user('fa333333-3333-4333-8333-333333333333');
select pg_temp.expect_error($s$ select public.save_exam_marks(pg_temp.academy(), pg_temp.xa(), pg_temp.rec('s2'), 1, '{"feedback":"x"}', gen_random_uuid()) $s$, 'year_unavailable');
select pg_temp.expect_error($s$ select public.update_exam(pg_temp.academy(), pg_temp.xa(), 1, '{"title":"x","parts":[]}') $s$, 'year_unavailable');
do $$ begin
  perform pg_temp.check((pg_temp.exam(pg_temp.xa())->>'year_open')::boolean = false, 'closed-year exam readable');
end $$;

rollback;
