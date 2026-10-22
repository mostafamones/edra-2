-- Quizzes: grants, authority, preparation and locks, availability, online attempts, physical entry,
-- first-final-submission-wins, deadlines (timer, headroom, tie, window_closed, departure), private
-- marks, announcement, corrections, solution qualification, archive, year closure and the student
-- projection. Run with `npm run test:db` against the disposable GitHub Actions database (see
-- docs/engineering.md). Everything runs in one transaction that is rolled back.
--
-- Time: commands read clock_timestamp(), so the suite moves windows and attempt times by updating
-- them as the table owner (the attempt guard is disabled only for those fixture updates).

do $$ begin
  if not has_function_privilege('authenticated', 'public.create_quiz(uuid, uuid, uuid, jsonb)', 'execute')
    or not has_function_privilege('authenticated', 'public.save_quiz_marks(uuid, uuid, uuid, integer, jsonb, uuid)', 'execute')
    or not has_function_privilege('authenticated', 'public.announce_quiz_results(uuid, uuid, integer, jsonb, uuid)', 'execute')
    or has_function_privilege('anon', 'public.create_quiz(uuid, uuid, uuid, jsonb)', 'execute')
    or has_function_privilege('anon', 'public.get_quiz(uuid, uuid)', 'execute')
    or has_function_privilege('anon', 'public.start_quiz_attempt(uuid)', 'execute')
    or has_function_privilege('authenticated', 'edra_private.start_quiz_attempt_for(uuid, uuid)', 'execute')
    or has_function_privilege('authenticated', 'edra_private.save_quiz_answers_for(uuid, uuid, integer, jsonb, uuid)', 'execute')
    or has_function_privilege('authenticated', 'edra_private.settle_quiz_closure(uuid)', 'execute')
    or has_function_privilege('authenticated', 'edra_private.announce_quiz_result(public.quizzes, uuid, boolean, timestamptz)', 'execute')
    or has_table_privilege('authenticated', 'public.quizzes', 'insert')
    or has_table_privilege('authenticated', 'public.quizzes', 'update')
    or has_table_privilege('authenticated', 'public.quiz_choices', 'update')
    or has_table_privilege('authenticated', 'public.quiz_marks', 'select')
    or has_table_privilege('authenticated', 'public.quiz_online_answers', 'select')
    or has_table_privilege('authenticated', 'public.quiz_submission_answers', 'select')
    or has_table_privilege('authenticated', 'public.quiz_result_effects', 'select')
    or has_table_privilege('authenticated', 'public.quiz_requests', 'select')
    or has_table_privilege('authenticated', 'public.quiz_result_publications', 'insert')
    or has_table_privilege('anon', 'public.quizzes', 'select')
    or has_table_privilege('anon', 'public.quiz_questions', 'select') then
    raise exception 'Quiz grants are wrong';
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
  ('e1111111-1111-4111-8111-111111111111'),  -- owner of S
  ('e2222222-2222-4222-8222-222222222222'),  -- head admin of S
  ('e3333333-3333-4333-8333-333333333333'),  -- instructor of S
  ('e4444444-4444-4444-8444-444444444444'),  -- suspended admin of S
  ('e5555555-5555-4555-8555-555555555555'),  -- owner of T
  ('e6666666-6666-4666-8666-666666666666'),  -- no membership (also acts as the student account)
  ('e7777777-7777-4777-8777-777777777777');  -- admin of S
insert into public.academies (id, name, slug, icon, subject, created_by) values
  ('ea555555-5555-4555-8555-555555555555', 'Quiz S', 'quiz-s', 'school', 'Math', 'e1111111-1111-4111-8111-111111111111'),
  ('eb666666-6666-4666-8666-666666666666', 'Quiz T', 'quiz-t', 'school', 'Math', 'e5555555-5555-4555-8555-555555555555');
update public.academic_years set id = 'ea555555-1111-4111-8111-555555555555', start_year = 2031 where academy_id = 'ea555555-5555-4555-8555-555555555555';
update public.academic_years set id = 'eb666666-1111-4111-8111-666666666666', start_year = 2031 where academy_id = 'eb666666-6666-4666-8666-666666666666';
insert into public.academy_memberships (academy_id, user_id, role, created_by) values
  ('ea555555-5555-4555-8555-555555555555', 'e1111111-1111-4111-8111-111111111111', 'owner', 'e1111111-1111-4111-8111-111111111111'),
  ('ea555555-5555-4555-8555-555555555555', 'e2222222-2222-4222-8222-222222222222', 'head_admin', 'e1111111-1111-4111-8111-111111111111'),
  ('ea555555-5555-4555-8555-555555555555', 'e3333333-3333-4333-8333-333333333333', 'instructor', 'e1111111-1111-4111-8111-111111111111'),
  ('ea555555-5555-4555-8555-555555555555', 'e4444444-4444-4444-8444-444444444444', 'admin', 'e1111111-1111-4111-8111-111111111111'),
  ('ea555555-5555-4555-8555-555555555555', 'e7777777-7777-4777-8777-777777777777', 'admin', 'e1111111-1111-4111-8111-111111111111'),
  ('eb666666-6666-4666-8666-666666666666', 'e5555555-5555-4555-8555-555555555555', 'owner', 'e5555555-5555-4555-8555-555555555555');
update public.academy_memberships set suspended_at = now(), suspended_by = 'e1111111-1111-4111-8111-111111111111'
where academy_id = 'ea555555-5555-4555-8555-555555555555' and user_id = 'e4444444-4444-4444-8444-444444444444';
insert into public.academy_levels (academy_id, level_id, sort_order) values
  ('ea555555-5555-4555-8555-555555555555', 'preparatory-3', 9),
  ('ea555555-5555-4555-8555-555555555555', 'secondary-1', 10),
  ('eb666666-6666-4666-8666-666666666666', 'preparatory-3', 9);
insert into public.groups (id, academy_id, academic_year_id, level_id, track_id, name) values
  ('ea888888-0000-4000-8000-000000000001', 'ea555555-5555-4555-8555-555555555555', 'ea555555-1111-4111-8111-555555555555', 'preparatory-3', null, 'Nine A'),
  ('ea888888-0000-4000-8000-000000000002', 'ea555555-5555-4555-8555-555555555555', 'ea555555-1111-4111-8111-555555555555', 'preparatory-3', null, 'Nine B');
-- Helpers, created by the table owner so the read helpers (security definer) see every row whatever
-- the acting user. rec(n) is the record id of student n.
create function pg_temp.rec(n text) returns uuid language sql as $$ select current_setting('test.' || n)::uuid $$;
create function pg_temp.as_user(id text) returns void language sql as $$ select set_config('request.jwt.claim.sub', id, true) $$;
create function pg_temp.qa() returns uuid language sql as $$ select 'ec000000-0000-4000-8000-000000000001'::uuid $$;
create function pg_temp.qb() returns uuid language sql as $$ select 'ec000000-0000-4000-8000-000000000002'::uuid $$;
create function pg_temp.academy() returns uuid language sql as $$ select 'ea555555-5555-4555-8555-555555555555'::uuid $$;
create function pg_temp.year() returns uuid language sql as $$ select 'ea555555-1111-4111-8111-555555555555'::uuid $$;
create function pg_temp.quiz(id uuid) returns jsonb language sql security definer as $$ select edra_private.quiz_json(id) $$;
create function pg_temp.question(id uuid, n integer) returns jsonb language sql security definer as $$
  select q from jsonb_array_elements(edra_private.quiz_json(id)->'parts') p, jsonb_array_elements(p->'questions') q where (q->>'number')::integer = n $$;
create function pg_temp.choice(id uuid, n integer, pos integer) returns uuid language sql security definer as $$
  select (c->>'id')::uuid from jsonb_array_elements(pg_temp.question(id, n)->'choices') c where (c->>'position')::integer = pos $$;
create function pg_temp.student(id uuid, n text) returns jsonb language sql security definer as $$
  select edra_private.quiz_student_row(id, pg_temp.rec(n)) $$;
create function pg_temp.effects(kind text default null) returns integer language sql security definer as $$
  select count(*)::integer from public.quiz_result_effects where academy_id = 'ea555555-5555-4555-8555-555555555555' and (kind is null or effect_type::text = kind) $$;
create function pg_temp.marks_on(question uuid) returns integer language sql security definer as $$
  select count(*)::integer from public.quiz_marks where question_id = question $$;
grant usage on schema public, auth to authenticated, anon;

set local role authenticated;
set local request.jwt.claim.sub = 'e1111111-1111-4111-8111-111111111111';
-- Six preparatory-3 students (s1..s6) and one secondary-1 student (ten).
select set_config('test.s' || n, (public.create_student_record('ea555555-5555-4555-8555-555555555555', 'ea555555-1111-4111-8111-555555555555',
  'Student ' || n, '0100000030' || n, '01100000000', 'preparatory-3', null, 'ea888888-0000-4000-8000-000000000001', 'in_person')).id::text, true)
from generate_series(1, 6) n;
select set_config('test.ten', (public.create_student_record('ea555555-5555-4555-8555-555555555555', 'ea555555-1111-4111-8111-555555555555',
  'Tenth', '01000000399', '01100000000', 'secondary-1', null, null, 'online_only')).id::text, true);


-- Ids used below.
--   quiz A (ec000000-…01): mixed Question Sheet (Q1, Q2: 2 marks each) + Written Work (Q3: 6 marks), untimed.
--   quiz B (ec000000-…02): Question Sheet only (fully automatic), 10-minute timer.

-- ---------------------------------------------------------------------------------------------
-- Preparation.

-- Outsiders, other academies and suspended staff cannot create; Answer Sheet parts do not exist.
select pg_temp.as_user('e6666666-6666-4666-8666-666666666666');
select pg_temp.expect_error($s$ select public.create_quiz(pg_temp.academy(), pg_temp.year(), pg_temp.qa(), '{"title":"x","parts":[]}') $s$, 'forbidden');
select pg_temp.as_user('e5555555-5555-4555-8555-555555555555');
select pg_temp.expect_error($s$ select public.create_quiz(pg_temp.academy(), pg_temp.year(), pg_temp.qa(), '{"title":"x","parts":[]}') $s$, 'forbidden');
select pg_temp.as_user('e4444444-4444-4444-8444-444444444444');
select pg_temp.expect_error($s$ select public.create_quiz(pg_temp.academy(), pg_temp.year(), pg_temp.qa(), '{"title":"x","parts":[]}') $s$, 'forbidden');

select pg_temp.as_user('e3333333-3333-4333-8333-333333333333');
select pg_temp.expect_error($s$ select public.create_quiz(pg_temp.academy(), pg_temp.year(), pg_temp.qa(),
  '{"title":"x","parts":[{"title":"P","kind":"answer_sheet","questions":[]}]}') $s$, 'validation');
select pg_temp.expect_error($s$ select public.create_quiz(pg_temp.academy(), pg_temp.year(), pg_temp.qa(),
  '{"title":"x","parts":[{"title":"P","kind":"written_work","questions":[{"max_score":"2.555"}]}]}') $s$, 'validation');
select pg_temp.expect_error($s$ select public.create_quiz(pg_temp.academy(), pg_temp.year(), pg_temp.qa(),
  '{"title":"x","parts":[{"title":"P","kind":"written_work","questions":[{"max_score":"-1"}]}]}') $s$, 'validation');
select pg_temp.expect_error($s$ select public.create_quiz(pg_temp.academy(), pg_temp.year(), pg_temp.qa(),
  '{"title":"x","parts":[{"title":"P","kind":"written_work","questions":[{"max_score":"2","choices":[{"label":"A"}]}]}]}') $s$, 'validation');
select pg_temp.expect_error($s$ select public.create_quiz(pg_temp.academy(), pg_temp.year(), pg_temp.qa(),
  '{"title":"x","parts":[{"title":"P","kind":"question_sheet","questions":[{"max_score":"2","choices":[{"label":"A","is_correct":true},{"label":"B","is_correct":true}]}]}]}') $s$, 'validation');

-- An instructor saves incomplete preparation: no target and no parts. Not ready.
do $$ declare made jsonb; begin
  made := public.create_quiz(pg_temp.academy(), pg_temp.year(), pg_temp.qa(), '{"title":"Weekly quiz","instructions":"","parts":[]}');
  perform pg_temp.check(not (made->>'ready')::boolean and made->'issues' @> '[{"issue":"target"},{"issue":"parts"}]', 'incomplete preparation is not ready');
  perform pg_temp.check(made->>'phase' = 'preparing', 'phase preparing');
  -- An identical create retry returns the quiz; nothing duplicates.
  perform pg_temp.check((public.create_quiz(pg_temp.academy(), pg_temp.year(), pg_temp.qa(), '{"title":"Weekly quiz","parts":[]}')->>'version')::integer = 1, 'create retry');
end $$;

-- Complete it: Third Preparatory, Q1/Q2 Question Sheet (2 marks), Q3 Written Work (6 marks).
do $$ declare saved jsonb; again jsonb; begin
  saved := public.update_quiz(pg_temp.academy(), pg_temp.qa(), 1, jsonb_build_object(
    'title', 'Weekly quiz', 'instructions', 'Answer all', 'solution_notes', 'Worked solutions', 'audience', 'level', 'level_id', 'preparatory-3',
    'parts', jsonb_build_array(
      jsonb_build_object('title', 'Choices', 'kind', 'question_sheet', 'questions', jsonb_build_array(
        jsonb_build_object('prompt', 'One?', 'max_score', '2', 'choices', '[{"label":"A","is_correct":true},{"label":"B"}]'::jsonb),
        jsonb_build_object('prompt', 'Two?', 'max_score', '2', 'choices', '[{"label":"A"},{"label":"B","is_correct":true}]'::jsonb))),
      jsonb_build_object('title', 'Written', 'kind', 'written_work', 'questions', jsonb_build_array(
        jsonb_build_object('prompt', 'Prove it', 'model_answer', 'Because', 'max_score', '6'))))));
  perform pg_temp.check((saved->>'ready')::boolean and saved->>'max_score' = '10.00' and (saved->>'question_count')::integer = 3, 'complete quiz ready, max 10');
  -- Saving the same document with its ids keeps every id.
  again := public.update_quiz(pg_temp.academy(), pg_temp.qa(), 2, jsonb_build_object(
    'title', 'Weekly quiz', 'instructions', 'Answer all', 'solution_notes', 'Worked solutions', 'audience', 'level', 'level_id', 'preparatory-3',
    'parts', (select jsonb_agg(jsonb_build_object('id', p->'id', 'title', p->'title', 'kind', p->'kind',
      'questions', (select jsonb_agg(jsonb_build_object('id', q->'id', 'prompt', q->'prompt', 'model_answer', q->'model_answer', 'max_score', q->'max_score',
        'choices', (select coalesce(jsonb_agg(jsonb_build_object('id', c->'id', 'label', c->'label', 'is_correct', c->'is_correct') order by (c->>'position')::integer), '[]'::jsonb)
          from jsonb_array_elements(q->'choices') c)) order by (q->>'position')::integer) from jsonb_array_elements(p->'questions') q)) order by (p->>'position')::integer)
      from jsonb_array_elements(saved->'parts') p)));
  perform pg_temp.check(again->'parts'->0->'questions'->0->>'id' = saved->'parts'->0->'questions'->0->>'id'
    and again->'parts'->0->'questions'->0->'choices'->0->>'id' = saved->'parts'->0->'questions'->0->'choices'->0->>'id', 'ids preserved');
  -- A stale version writes nothing.
  perform pg_temp.expect_error(format($f$ select public.update_quiz(%L, %L, 2, %L) $f$, pg_temp.academy(), pg_temp.qa(), '{"title":"x","parts":[]}'), 'quiz_conflict');
end $$;

-- The list derives phase and filters by it.
do $$ declare page jsonb; begin
  page := public.list_quizzes(pg_temp.academy(), pg_temp.year(), 'weekly', 'ready', null, false, 25, 0);
  perform pg_temp.check((page->>'total')::integer = 1 and page->'items'->0->>'phase' = 'ready', 'list filters by phase');
  perform pg_temp.check((public.list_quizzes(pg_temp.academy(), null, 'nothing-matches', null, null, false, 25, 0)->>'total')::integer = 0, 'search');
end $$;

-- Opening the staff views locks nothing.
do $$ begin
  perform public.list_quiz_students(pg_temp.academy(), pg_temp.qa());
  perform pg_temp.check(pg_temp.quiz(pg_temp.qa())->>'structure_locked_at' is null and pg_temp.quiz(pg_temp.qa())->>'work_started_at' is null, 'reads lock nothing');
  perform pg_temp.check((pg_temp.quiz(pg_temp.qa())->'counts'->>'eligible')::integer = 6, 'six eligible preparatory-3 students');
end $$;

-- Other academies read nothing; direct table writes are denied.
select pg_temp.as_user('e5555555-5555-4555-8555-555555555555');
do $$ begin
  perform pg_temp.check(public.get_quiz(pg_temp.academy(), pg_temp.qa()) is null, 'other academy get');
  perform pg_temp.check(public.list_quiz_students(pg_temp.academy(), pg_temp.qa()) is null, 'other academy list');
  perform pg_temp.check(public.list_quizzes(pg_temp.academy(), null, null, null, null, true, 25, 0) is null, 'other academy quizzes');
  perform pg_temp.check(not exists (select 1 from public.quizzes where id = pg_temp.qa()), 'other academy row');
end $$;
select pg_temp.expect_error($s$ select public.save_quiz_physical_draft(pg_temp.academy(), pg_temp.qa(), pg_temp.rec('s1'), 0, '[]', gen_random_uuid()) $s$, 'forbidden');
select pg_temp.expect_error($s$ update public.quizzes set title = 'x' $s$, '%permission denied%');
select pg_temp.expect_error($s$ insert into public.quiz_marks (quiz_id) values (gen_random_uuid()) $s$, '%permission denied%');

-- Availability is manager-only; an instructor cannot set it.
select pg_temp.as_user('e3333333-3333-4333-8333-333333333333');
select pg_temp.expect_error($s$ select public.configure_quiz_availability(pg_temp.academy(), pg_temp.qa(), 3, now(), now() + interval '1 hour') $s$, 'forbidden');
select pg_temp.expect_error($s$ select public.configure_quiz_availability(pg_temp.academy(), gen_random_uuid(), 3, now(), now() + interval '1 hour') $s$, 'forbidden');
select pg_temp.as_user('e2222222-2222-4222-8222-222222222222');
select pg_temp.expect_error($s$ select public.configure_quiz_availability(pg_temp.academy(), pg_temp.qa(), 3, now(), now() - interval '1 minute') $s$, 'validation');
do $$ declare q jsonb; begin
  q := public.configure_quiz_availability(pg_temp.academy(), pg_temp.qa(), 3, now() - interval '1 minute', now() + interval '1 hour');
  perform pg_temp.check(q->>'phase' = 'open' and (q->>'actual_closes_at')::timestamptz = (q->>'closes_at')::timestamptz + interval '2 minutes', 'open with two-minute headroom');
end $$;

-- ---------------------------------------------------------------------------------------------
-- Online attempts (record-based trusted domain; the public wrappers deny until accounts link).

select pg_temp.as_user('e6666666-6666-4666-8666-666666666666');
select pg_temp.expect_error($s$ select public.start_quiz_attempt(pg_temp.qa()) $s$, 'student_link_unavailable');
select pg_temp.expect_error($s$ select public.get_my_quiz(pg_temp.qa()) $s$, 'student_link_unavailable');
reset role;

-- s2 starts, resumes (same start, no new attempt), saves and stale-saves.
do $$ declare first jsonb; again jsonb; saved jsonb; begin
  perform pg_temp.expect_error($s$ select edra_private.start_quiz_attempt_for(pg_temp.qa(), pg_temp.rec('ten')) $s$, 'not_eligible');
  first := edra_private.start_quiz_attempt_for(pg_temp.qa(), pg_temp.rec('s2'));
  perform pg_temp.check(first->'attempt'->>'deadline_at' is null and (first->'attempt'->>'answers_version')::integer = 0, 'untimed attempt');
  -- The student projection carries no key, model answer, notes or marks before qualification.
  perform pg_temp.check(first->'solutions' = 'null'::jsonb and first::text not like '%is_correct%' and first::text not like '%Because%'
    and first::text not like '%Worked solutions%', 'no key before qualification');
  again := edra_private.start_quiz_attempt_for(pg_temp.qa(), pg_temp.rec('s2'));
  perform pg_temp.check(again->'attempt'->>'started_at' = first->'attempt'->>'started_at', 'resume keeps the start');
  perform pg_temp.check((select count(*) from public.quiz_attempts where quiz_id = pg_temp.qa()) = 1, 'single attempt');
  -- Saving an answer locks the structure.
  saved := edra_private.save_quiz_answers_for(pg_temp.qa(), pg_temp.rec('s2'), 0, jsonb_build_array(
    jsonb_build_object('question_id', pg_temp.question(pg_temp.qa(), 1)->>'id', 'choice_id', pg_temp.choice(pg_temp.qa(), 1, 1)),
    jsonb_build_object('question_id', pg_temp.question(pg_temp.qa(), 3)->>'id', 'text_answer', 'My proof')), gen_random_uuid());
  perform pg_temp.check(saved->>'outcome' = 'saved' and (saved->'state'->'attempt'->>'answers_version')::integer = 1, 'saved');
  perform pg_temp.check((select structure_locked_at is not null from public.quizzes where id = pg_temp.qa()), 'answer locks structure');
  perform pg_temp.check(edra_private.save_quiz_answers_for(pg_temp.qa(), pg_temp.rec('s2'), 0, jsonb_build_array(
    jsonb_build_object('question_id', pg_temp.question(pg_temp.qa(), 2)->>'id', 'choice_id', null)), gen_random_uuid())->>'outcome' = 'conflict', 'stale save conflicts');
  -- Text on a choice question and a choice of another question are rejected.
  perform pg_temp.expect_error(format($f$ select edra_private.save_quiz_answers_for(%L, %L, 1, %L, gen_random_uuid()) $f$, pg_temp.qa(), pg_temp.rec('s2'),
    jsonb_build_array(jsonb_build_object('question_id', pg_temp.question(pg_temp.qa(), 1)->>'id', 'text_answer', 'x'))), 'unknown_question');
  perform pg_temp.expect_error(format($f$ select edra_private.save_quiz_answers_for(%L, %L, 1, %L, gen_random_uuid()) $f$, pg_temp.qa(), pg_temp.rec('s2'),
    jsonb_build_array(jsonb_build_object('question_id', pg_temp.question(pg_temp.qa(), 2)->>'id', 'choice_id', pg_temp.choice(pg_temp.qa(), 1, 1)))), 'unknown_question');
end $$;

-- Departures: first warns, a duplicate event changes nothing, the second submits (reason departure).
do $$ declare out jsonb; begin
  out := edra_private.record_quiz_departure_for(pg_temp.qa(), pg_temp.rec('s2'), 'ed000000-0000-4000-8000-000000000001');
  perform pg_temp.check(out->>'outcome' = 'warned' and (out->'state'->'attempt'->>'departure_count')::integer = 1, 'first departure warns');
  out := edra_private.record_quiz_departure_for(pg_temp.qa(), pg_temp.rec('s2'), 'ed000000-0000-4000-8000-000000000001');
  perform pg_temp.check(out->>'outcome' = 'duplicate' and (out->'state'->'attempt'->>'departure_count')::integer = 1, 'duplicate departure');
  out := edra_private.record_quiz_departure_for(pg_temp.qa(), pg_temp.rec('s2'), 'ed000000-0000-4000-8000-000000000002');
  perform pg_temp.check(out->>'outcome' = 'submitted' and out->'state'->'submission'->>'reason' = 'departure', 'second departure submits');
  -- Mixed quiz: not announced automatically, and no score leaks.
  perform pg_temp.check(out->'state'->'result' = 'null'::jsonb, 'no automatic announcement for manual work');
  perform pg_temp.check(edra_private.save_quiz_answers_for(pg_temp.qa(), pg_temp.rec('s2'), 1, jsonb_build_array(
    jsonb_build_object('question_id', pg_temp.question(pg_temp.qa(), 1)->>'id', 'choice_id', null)), gen_random_uuid())->>'outcome' = 'finalized', 'no saves after submission');
end $$;

-- s3 submits; a retried submit replays; physical confirmation then conflicts.
select pg_temp.as_user('e6666666-6666-4666-8666-666666666666');
reset role;
do $$ declare out jsonb; begin
  perform edra_private.start_quiz_attempt_for(pg_temp.qa(), pg_temp.rec('s3'));
  perform edra_private.save_quiz_answers_for(pg_temp.qa(), pg_temp.rec('s3'), 0, jsonb_build_array(
    jsonb_build_object('question_id', pg_temp.question(pg_temp.qa(), 1)->>'id', 'choice_id', pg_temp.choice(pg_temp.qa(), 1, 1)),
    jsonb_build_object('question_id', pg_temp.question(pg_temp.qa(), 2)->>'id', 'choice_id', pg_temp.choice(pg_temp.qa(), 2, 1))), gen_random_uuid());
  out := edra_private.submit_quiz_attempt_for(pg_temp.qa(), pg_temp.rec('s3'), 'ed000000-0000-4000-8000-0000000000a3');
  perform pg_temp.check(out->>'outcome' = 'submitted' and out->'state'->'submission'->>'source' = 'online' and not (out->>'replayed')::boolean, 'submitted');
  out := edra_private.submit_quiz_attempt_for(pg_temp.qa(), pg_temp.rec('s3'), 'ed000000-0000-4000-8000-0000000000a3');
  perform pg_temp.check((out->>'replayed')::boolean, 'submit retry replays');
  perform pg_temp.check(edra_private.submit_quiz_attempt_for(pg_temp.qa(), pg_temp.rec('s3'), gen_random_uuid())->>'outcome' = 'finalized', 'second submit reports finalized');
end $$;
set local role authenticated;
select pg_temp.as_user('e3333333-3333-4333-8333-333333333333');
select pg_temp.check(public.confirm_quiz_physical(pg_temp.academy(), pg_temp.qa(), pg_temp.rec('s3'), 0, gen_random_uuid())->>'outcome' = 'source_conflict'
  and pg_temp.student(pg_temp.qa(), 's3')->'submission'->>'source' = 'online', 'online accepted first: physical confirmation conflicts');
select pg_temp.check(public.save_quiz_physical_draft(pg_temp.academy(), pg_temp.qa(), pg_temp.rec('s3'), 0, '[]', gen_random_uuid())->>'outcome' = 'source_conflict', 'no physical draft after acceptance');

-- Structure and target are locked now; model answers and wording outside the structure remain editable.
do $$ declare q jsonb := pg_temp.quiz(pg_temp.qa()); body jsonb; begin
  body := jsonb_build_object('title', 'Weekly quiz (edited)', 'instructions', 'Answer all', 'solution_notes', 'Notes v2', 'audience', 'level', 'level_id', 'preparatory-3',
    'parts', (select jsonb_agg(jsonb_build_object('id', p->'id', 'title', p->'title', 'kind', p->'kind',
      'questions', (select jsonb_agg(jsonb_build_object('id', x->'id', 'prompt', x->'prompt', 'model_answer', 'Updated', 'max_score', x->'max_score',
        'choices', (select coalesce(jsonb_agg(jsonb_build_object('id', c->'id', 'label', c->'label', 'is_correct', c->'is_correct') order by (c->>'position')::integer), '[]'::jsonb)
          from jsonb_array_elements(x->'choices') c)) order by (x->>'position')::integer) from jsonb_array_elements(p->'questions') x)) order by (p->>'position')::integer)
      from jsonb_array_elements(q->'parts') p));
  q := public.update_quiz(pg_temp.academy(), pg_temp.qa(), (q->>'version')::integer, body);
  perform pg_temp.check(q->>'title' = 'Weekly quiz (edited)' and pg_temp.question(pg_temp.qa(), 3)->>'model_answer' = 'Updated', 'locked quiz keeps editable text');
  perform pg_temp.expect_error(format($f$ select public.update_quiz(%L, %L, %s, %L) $f$, pg_temp.academy(), pg_temp.qa(), q->>'version',
    jsonb_set(body, '{parts,0,questions,0,max_score}', '"3"')), 'structure_locked');
  perform pg_temp.expect_error(format($f$ select public.update_quiz(%L, %L, %s, %L) $f$, pg_temp.academy(), pg_temp.qa(), q->>'version',
    body || '{"level_id":"secondary-1"}'), 'target_locked');
end $$;

-- ---------------------------------------------------------------------------------------------
-- Physical entry: drafts coexist with an online draft; confirmation wins and supersedes it.

reset role;
select edra_private.start_quiz_attempt_for(pg_temp.qa(), pg_temp.rec('s1'));
set local role authenticated;
select pg_temp.as_user('e3333333-3333-4333-8333-333333333333');
do $$ declare out jsonb; begin
  out := public.save_quiz_physical_draft(pg_temp.academy(), pg_temp.qa(), pg_temp.rec('s1'), 0, jsonb_build_array(
    jsonb_build_object('question_id', pg_temp.question(pg_temp.qa(), 1)->>'id', 'choice_id', pg_temp.choice(pg_temp.qa(), 1, 1)),
    jsonb_build_object('question_id', pg_temp.question(pg_temp.qa(), 2)->>'id', 'choice_id', null)), gen_random_uuid());
  perform pg_temp.check(out->>'outcome' = 'saved' and (out->'student'->'physical_draft'->>'version')::integer = 1, 'physical draft saved');
  perform pg_temp.check(out->'student'->'submission' = 'null'::jsonb, 'a draft never chooses a source');
  -- Stale draft version.
  perform pg_temp.check(public.save_quiz_physical_draft(pg_temp.academy(), pg_temp.qa(), pg_temp.rec('s1'), 0, '[]', gen_random_uuid())->>'outcome' = 'conflict', 'stale draft');
  -- Written questions are not transcribed.
  perform pg_temp.expect_error(format($f$ select public.save_quiz_physical_draft(%L, %L, %L, 1, %L, gen_random_uuid()) $f$, pg_temp.academy(), pg_temp.qa(), pg_temp.rec('s1'),
    jsonb_build_array(jsonb_build_object('question_id', pg_temp.question(pg_temp.qa(), 3)->>'id', 'choice_id', null))), 'unknown_question');
  out := public.confirm_quiz_physical(pg_temp.academy(), pg_temp.qa(), pg_temp.rec('s1'), 1, 'ed000000-0000-4000-8000-0000000000c1');
  perform pg_temp.check(out->'student'->'submission'->>'source' = 'physical' and (out->'student'->'attempt'->>'superseded')::boolean, 'physical wins, online superseded');
  perform pg_temp.check(out->'student'->'publication' = 'null'::jsonb, 'confirmation does not announce');
  perform pg_temp.check((public.confirm_quiz_physical(pg_temp.academy(), pg_temp.qa(), pg_temp.rec('s1'), 1, 'ed000000-0000-4000-8000-0000000000c1')->>'replayed')::boolean, 'confirm retry replays');
  perform pg_temp.expect_error(format($f$ select public.confirm_quiz_physical(%L, %L, %L, 1, 'ed000000-0000-4000-8000-0000000000c1') $f$, pg_temp.academy(), pg_temp.qa(), pg_temp.rec('s2')), 'idempotency_conflict');
  -- Ineligible students get no new physical work.
  perform pg_temp.expect_error(format($f$ select public.save_quiz_physical_draft(%L, %L, %L, 0, '[]', gen_random_uuid()) $f$, pg_temp.academy(), pg_temp.qa(), pg_temp.rec('ten')), 'not_eligible');
end $$;
reset role;
select pg_temp.check(edra_private.submit_quiz_attempt_for(pg_temp.qa(), pg_temp.rec('s1'), gen_random_uuid())->>'outcome' = 'source_conflict', 'online cannot finalize after physical');
select pg_temp.check((select count(*) from public.quiz_physical_answers where quiz_id = pg_temp.qa()) = 2
  and (select count(*) from public.quiz_online_answers o join public.quiz_attempts a on a.id = o.attempt_id where a.annual_student_record_id = pg_temp.rec('s1')) = 0,
  'losing draft kept separately');
set local role authenticated;

-- ---------------------------------------------------------------------------------------------
-- Marks and announcement.

select pg_temp.as_user('e3333333-3333-4333-8333-333333333333');
do $$ declare q3 text := pg_temp.question(pg_temp.qa(), 3)->>'id'; v integer; out jsonb; begin
  perform pg_temp.expect_error(format($f$ select public.save_quiz_marks(%L, %L, %L, 1, '{"marks":[]}', gen_random_uuid()) $f$, pg_temp.academy(), pg_temp.qa(), pg_temp.rec('s4')), 'not_submitted');
  v := (pg_temp.student(pg_temp.qa(), 's3')->>'version')::integer;
  perform pg_temp.check(pg_temp.student(pg_temp.qa(), 's3')->'result'->>'complete' = 'false', 'manual question unmarked');
  perform pg_temp.expect_error(format($f$ select public.save_quiz_marks(%L, %L, %L, %s, %L, gen_random_uuid()) $f$, pg_temp.academy(), pg_temp.qa(), pg_temp.rec('s3'), v,
    jsonb_build_object('marks', jsonb_build_array(jsonb_build_object('question_id', q3, 'score', '6.5')))), 'invalid_score');
  perform pg_temp.expect_error(format($f$ select public.save_quiz_marks(%L, %L, %L, %s, %L, gen_random_uuid()) $f$, pg_temp.academy(), pg_temp.qa(), pg_temp.rec('s3'), v,
    jsonb_build_object('marks', jsonb_build_array(jsonb_build_object('question_id', q3, 'score', '1.255')))), 'invalid_score');
  perform pg_temp.expect_error(format($f$ select public.save_quiz_marks(%L, %L, %L, %s, %L, gen_random_uuid()) $f$, pg_temp.academy(), pg_temp.qa(), pg_temp.rec('s3'), v,
    jsonb_build_object('marks', jsonb_build_array(jsonb_build_object('question_id', pg_temp.question(pg_temp.qa(), 1)->>'id', 'score', '1')))), 'unknown_question');
  -- Zero is a mark and completes the result.
  out := public.save_quiz_marks(pg_temp.academy(), pg_temp.qa(), pg_temp.rec('s3'), v,
    jsonb_build_object('marks', jsonb_build_array(jsonb_build_object('question_id', q3, 'score', '0')), 'feedback', 'Show steps'), gen_random_uuid());
  perform pg_temp.check(out->'student'->'result'->>'complete' = 'true' and out->'student'->'result'->>'total' = '2.00', 's3 complete at 2/10');
  -- Stale version.
  perform pg_temp.check(public.save_quiz_marks(pg_temp.academy(), pg_temp.qa(), pg_temp.rec('s3'), v, '{"feedback":"x"}', gen_random_uuid())->>'outcome' = 'conflict', 'stale marks');
end $$;

do $$ declare rev integer := (pg_temp.quiz(pg_temp.qa())->>'scoring_revision')::integer; out jsonb; v3 integer; v2 integer; begin
  v3 := (pg_temp.student(pg_temp.qa(), 's3')->>'version')::integer;
  v2 := (pg_temp.student(pg_temp.qa(), 's2')->>'version')::integer;
  -- All-or-nothing: s2's manual question is unmarked, so nothing is announced.
  out := public.announce_quiz_results(pg_temp.academy(), pg_temp.qa(), rev, jsonb_build_array(
    jsonb_build_object('annual_student_record_id', pg_temp.rec('s3'), 'expected_version', v3),
    jsonb_build_object('annual_student_record_id', pg_temp.rec('s2'), 'expected_version', v2),
    jsonb_build_object('annual_student_record_id', pg_temp.rec('s5'), 'expected_version', 1)), gen_random_uuid());
  perform pg_temp.check(out->>'outcome' = 'rejected' and out->'failures' @> jsonb_build_array(
    jsonb_build_object('annual_student_record_id', pg_temp.rec('s2'), 'reason', 'incomplete'),
    jsonb_build_object('annual_student_record_id', pg_temp.rec('s5'), 'reason', 'not_submitted')), 'rejected batch');
  perform pg_temp.check(pg_temp.effects() = 0, 'rejected batch writes nothing');
  out := public.announce_quiz_results(pg_temp.academy(), pg_temp.qa(), rev, jsonb_build_array(
    jsonb_build_object('annual_student_record_id', pg_temp.rec('s3'), 'expected_version', v3 - 1)), gen_random_uuid());
  perform pg_temp.check(out->'failures'->0->>'reason' = 'stale', 'stale student');
  out := public.announce_quiz_results(pg_temp.academy(), pg_temp.qa(), rev, jsonb_build_array(
    jsonb_build_object('annual_student_record_id', pg_temp.rec('s3'), 'expected_version', v3)), gen_random_uuid());
  perform pg_temp.check(out->>'outcome' = 'published' and out->'results'->0->>'outcome' = 'published', 'announced');
  out := public.announce_quiz_results(pg_temp.academy(), pg_temp.qa(), rev, jsonb_build_array(
    jsonb_build_object('annual_student_record_id', pg_temp.rec('s3'), 'expected_version', v3)), gen_random_uuid());
  perform pg_temp.check(out->'results'->0->>'outcome' = 'unchanged' and pg_temp.effects('result_published') = 1, 'unchanged announcement adds nothing');
end $$;

-- ---------------------------------------------------------------------------------------------
-- Corrections.

select pg_temp.expect_error($s$ select public.correct_quiz_key(pg_temp.academy(), pg_temp.qa(), (pg_temp.question(pg_temp.qa(), 2)->>'id')::uuid,
  pg_temp.choice(pg_temp.qa(), 2, 1), 1, gen_random_uuid()) $s$, 'forbidden');
select pg_temp.as_user('e7777777-7777-4777-8777-777777777777');
do $$ declare out jsonb; official jsonb; v3 integer; begin
  -- Key of Q2 becomes choice 1: s3 (answered 1) gains 2 marks privately; the official result stays.
  out := public.correct_quiz_key(pg_temp.academy(), pg_temp.qa(), (pg_temp.question(pg_temp.qa(), 2)->>'id')::uuid, pg_temp.choice(pg_temp.qa(), 2, 1), 1, gen_random_uuid());
  perform pg_temp.check((out->'quiz'->>'scoring_revision')::integer = 2, 'scoring revision 2');
  official := pg_temp.student(pg_temp.qa(), 's3');
  perform pg_temp.check(official->>'publication_state' = 'pending_correction' and official->'publication'->>'total' = '2.00'
    and official->'result'->>'total' = '4.00', 'pending correction keeps the official result');
  -- A batch prepared before the correction is stale.
  perform pg_temp.expect_error(format($f$ select public.announce_quiz_results(%L, %L, 1, %L, gen_random_uuid()) $f$, pg_temp.academy(), pg_temp.qa(),
    jsonb_build_array(jsonb_build_object('annual_student_record_id', pg_temp.rec('s3'), 'expected_version', official->'version'))), 'stale_basis');
  out := public.announce_quiz_results(pg_temp.academy(), pg_temp.qa(), 2, jsonb_build_array(
    jsonb_build_object('annual_student_record_id', pg_temp.rec('s3'), 'expected_version', (official->>'version')::integer)), gen_random_uuid());
  perform pg_temp.check(out->'results'->0->>'outcome' = 'corrected' and (out->'results'->0->>'revision')::integer = 2 and pg_temp.effects('result_corrected') = 1, 'correction announced');
  perform pg_temp.check((select count(*) from public.quiz_result_publications where annual_student_record_id = pg_temp.rec('s3')) = 2, 'previous revision kept');
end $$;
-- Exclusions: keep numbering, answers and marks; the last scored question cannot go; no reinstatement.
do $$ declare out jsonb; begin
  out := public.exclude_quiz_question(pg_temp.academy(), pg_temp.qa(), (pg_temp.question(pg_temp.qa(), 3)->>'id')::uuid, 2, gen_random_uuid());
  perform pg_temp.check(out->'quiz'->>'effective_max_score' = '4.00' and (out->'quiz'->>'fully_automatic')::boolean
    and (pg_temp.question(pg_temp.qa(), 3)->>'number')::integer = 3, 'excluded Q3 keeps its number');
  perform pg_temp.check(pg_temp.marks_on((pg_temp.question(pg_temp.qa(), 3)->>'id')::uuid) = 1, 'excluded mark retained');
  perform pg_temp.check(pg_temp.student(pg_temp.qa(), 's2')->'result'->>'complete' = 'true', 'exclusion removes the completeness requirement');
  perform pg_temp.expect_error(format($f$ select public.exclude_quiz_question(%L, %L, %L, 3, gen_random_uuid()) $f$, pg_temp.academy(), pg_temp.qa(), pg_temp.question(pg_temp.qa(), 3)->>'id'), 'question_excluded');
  perform public.exclude_quiz_question(pg_temp.academy(), pg_temp.qa(), (pg_temp.question(pg_temp.qa(), 2)->>'id')::uuid, 3, gen_random_uuid());
  perform pg_temp.expect_error(format($f$ select public.exclude_quiz_question(%L, %L, %L, 4, gen_random_uuid()) $f$, pg_temp.academy(), pg_temp.qa(), pg_temp.question(pg_temp.qa(), 1)->>'id'), 'invalid_exclusion');
  perform pg_temp.expect_error(format($f$ select public.save_quiz_marks(%L, %L, %L, %s, %L, gen_random_uuid()) $f$, pg_temp.academy(), pg_temp.qa(), pg_temp.rec('s3'),
    pg_temp.student(pg_temp.qa(), 's3')->>'version', jsonb_build_object('marks', jsonb_build_array(jsonb_build_object('question_id', pg_temp.question(pg_temp.qa(), 3)->>'id', 'score', '5')))), 'question_excluded');
end $$;
-- An active attempt cannot change an excluded answer.
reset role;
do $$ begin
  perform edra_private.start_quiz_attempt_for(pg_temp.qa(), pg_temp.rec('s4'));
  perform pg_temp.expect_error(format($f$ select edra_private.save_quiz_answers_for(%L, %L, 0, %L, gen_random_uuid()) $f$, pg_temp.qa(), pg_temp.rec('s4'),
    jsonb_build_array(jsonb_build_object('question_id', pg_temp.question(pg_temp.qa(), 2)->>'id', 'choice_id', pg_temp.choice(pg_temp.qa(), 2, 2)))), 'question_excluded');
  perform pg_temp.check(edra_private.quiz_student_state(pg_temp.qa(), pg_temp.rec('s4'))->'excluded_question_ids' @> to_jsonb(array[pg_temp.question(pg_temp.qa(), 2)->>'id']), 'excluded ids projected');
end $$;
set local role authenticated;

-- Archive is manager-only and waits for running attempts (s4 is still answering).
select pg_temp.as_user('e3333333-3333-4333-8333-333333333333');
select pg_temp.expect_error($s$ select public.archive_quiz(pg_temp.academy(), pg_temp.qa(), (pg_temp.quiz(pg_temp.qa())->>'version')::integer) $s$, 'forbidden');
select pg_temp.as_user('e7777777-7777-4777-8777-777777777777');
select pg_temp.expect_error($s$ select public.archive_quiz(pg_temp.academy(), pg_temp.qa(), (pg_temp.quiz(pg_temp.qa())->>'version')::integer) $s$, 'quiz_work_pending');

-- ---------------------------------------------------------------------------------------------
-- Deadlines on quiz B: fully automatic, 10-minute timer.

select pg_temp.as_user('e2222222-2222-4222-8222-222222222222');
do $$ declare made jsonb; begin
  made := public.create_quiz(pg_temp.academy(), pg_temp.year(), pg_temp.qb(), jsonb_build_object(
    'title', 'Timed', 'audience', 'groups', 'group_ids', jsonb_build_array('ea888888-0000-4000-8000-000000000001'), 'time_limit_minutes', 10,
    'parts', jsonb_build_array(jsonb_build_object('title', 'Choices', 'kind', 'question_sheet', 'questions', jsonb_build_array(
      jsonb_build_object('prompt', 'Q', 'max_score', '5', 'choices', '[{"label":"Yes","is_correct":true},{"label":"No"}]'::jsonb))))));
  perform public.configure_quiz_availability(pg_temp.academy(), pg_temp.qb(), 1, now() - interval '1 minute', now() + interval '1 hour');
end $$;

reset role;
-- Moves an attempt's start/deadline into the past (fixture only) and the window around now.
create function pg_temp.set_attempt(n text, started interval, deadline interval) returns void language plpgsql as $$
begin
  alter table public.quiz_attempts disable trigger quiz_attempts_guard;
  update public.quiz_attempts set started_at = clock_timestamp() + started, deadline_at = clock_timestamp() + deadline
  where quiz_id = pg_temp.qb() and annual_student_record_id = pg_temp.rec(n);
  alter table public.quiz_attempts enable trigger quiz_attempts_guard;
end;
$$;
create function pg_temp.set_window(closes interval) returns void language plpgsql as $$
declare c timestamptz := date_trunc('second', clock_timestamp()) + closes;
begin
  update public.quizzes set opens_at = c - interval '2 hours', closes_at = c, actual_closes_at = c + interval '2 minutes' where id = pg_temp.qb();
end;
$$;
create function pg_temp.answer(n text, pos integer) returns jsonb language sql as $$
  select edra_private.save_quiz_answers_for(pg_temp.qb(), pg_temp.rec(n),
    (select answers_version from public.quiz_attempts where quiz_id = pg_temp.qb() and annual_student_record_id = pg_temp.rec(n)),
    jsonb_build_array(jsonb_build_object('question_id', pg_temp.question(pg_temp.qb(), 1)->>'id', 'choice_id', pg_temp.choice(pg_temp.qb(), 1, pos))),
    gen_random_uuid()) $$;

do $$ declare st jsonb; sub record; begin
  -- Timer expiry: s1 saved the right answer; its deadline passed well before closure.
  st := edra_private.start_quiz_attempt_for(pg_temp.qb(), pg_temp.rec('s1'));
  perform pg_temp.check((st->'attempt'->>'deadline_at')::timestamptz = (st->'attempt'->>'started_at')::timestamptz + interval '10 minutes', 'timer deadline');
  perform pg_temp.answer('s1', 1);
  perform pg_temp.set_attempt('s1', interval '-20 minutes', interval '-10 minutes');
  -- A late save cannot cross the cutoff: it settles the attempt and reports it.
  perform pg_temp.check(pg_temp.answer('s1', 2)->>'outcome' = 'finalized', 'late save finalizes, never saves');
  select s.* into sub from public.quiz_submissions s where s.quiz_id = pg_temp.qb() and s.annual_student_record_id = pg_temp.rec('s1');
  perform pg_temp.check(sub.reason = 'timer' and sub.submitted_at = sub.original_deadline_at and sub.processed_at > sub.submitted_at, 'timer submission at its deadline');
  -- Fully automatic online work is announced in the acceptance transaction; the late answer was not saved.
  st := edra_private.quiz_student_state(pg_temp.qb(), pg_temp.rec('s1'));
  perform pg_temp.check(st->'result'->>'total' = '5.00' and st->'solutions' = 'null'::jsonb, 'automatic result, no solutions before closure');
  perform pg_temp.check((select automatic from public.quiz_result_publications where quiz_id = pg_temp.qb() and annual_student_record_id = pg_temp.rec('s1')), 'automatic publication');

  -- Headroom: s2 started; scheduled close passes; s2 continues, s3 cannot start.
  perform edra_private.start_quiz_attempt_for(pg_temp.qb(), pg_temp.rec('s2'));
  perform pg_temp.set_attempt('s2', interval '-5 minutes', interval '5 minutes');
  -- s4 starts too: its deadline will coincide with actual closure (tie: timer wins).
  perform edra_private.start_quiz_attempt_for(pg_temp.qb(), pg_temp.rec('s4'));
  perform pg_temp.set_window(interval '-30 seconds');
  perform pg_temp.check(edra_private.quiz_student_state(pg_temp.qb(), pg_temp.rec('s2'))->>'phase' = 'headroom', 'headroom phase');
  perform pg_temp.expect_error($s$ select edra_private.start_quiz_attempt_for(pg_temp.qb(), pg_temp.rec('s3')) $s$, 'not_open');
  perform pg_temp.check(pg_temp.answer('s2', 2)->>'outcome' = 'saved', 'saves continue in headroom');
end $$;

do $$ declare c timestamptz; sub record; begin
  -- Actual closure passes: s2 (deadline after closure) → window_closed at actual closure; s4 (deadline = actual closure) → timer.
  perform pg_temp.set_window(interval '-3 minutes');
  select actual_closes_at into c from public.quizzes where id = pg_temp.qb();
  alter table public.quiz_attempts disable trigger quiz_attempts_guard;
  update public.quiz_attempts set deadline_at = c, started_at = c - interval '10 minutes' where quiz_id = pg_temp.qb() and annual_student_record_id = pg_temp.rec('s4');
  update public.quiz_attempts set deadline_at = c + interval '5 minutes', started_at = c - interval '5 minutes' where quiz_id = pg_temp.qb() and annual_student_record_id = pg_temp.rec('s2');
  alter table public.quiz_attempts enable trigger quiz_attempts_guard;
  -- The worker settles everything due (here called directly).
  perform pg_temp.check(edra_private.settle_quiz_closure(pg_temp.qb()) = 2, 'two attempts settled');
  select s.* into sub from public.quiz_submissions s where s.quiz_id = pg_temp.qb() and s.annual_student_record_id = pg_temp.rec('s2');
  perform pg_temp.check(sub.reason = 'window_closed' and sub.submitted_at = c, 'window_closed at actual closure');
  select s.* into sub from public.quiz_submissions s where s.quiz_id = pg_temp.qb() and s.annual_student_record_id = pg_temp.rec('s4');
  perform pg_temp.check(sub.reason = 'timer' and sub.submitted_at = c, 'tie: timer wins');
  -- The never-started student gets nothing; finalized students qualify for solutions.
  perform pg_temp.check(not exists (select 1 from public.quiz_work where quiz_id = pg_temp.qb() and annual_student_record_id = pg_temp.rec('s3')), 'never started: no work');
  perform pg_temp.check((select count(*) from public.quiz_work where quiz_id = pg_temp.qb() and solutions_qualified_at is not null) = 3, 'three qualified');
  perform pg_temp.check(pg_temp.effects('solutions_qualified') = 3, 'qualification effects');
  perform pg_temp.check(edra_private.quiz_student_state(pg_temp.qb(), pg_temp.rec('s2'))->'solutions'->'questions'->0->>'correct_choice_id' is not null, 'solutions released');
  perform pg_temp.check(edra_private.quiz_student_state(pg_temp.qb(), pg_temp.rec('s3'))->'solutions' = 'null'::jsonb, 'no solutions without a submission');
  -- Settling again is idempotent.
  perform pg_temp.check(edra_private.settle_quiz_closure(pg_temp.qb()) = 0 and pg_temp.effects('solutions_qualified') = 3, 'idempotent closure');
end $$;

-- After actual closure: no physical confirmation, no reopening.
set local role authenticated;
select pg_temp.as_user('e3333333-3333-4333-8333-333333333333');
select pg_temp.expect_error($s$ select public.confirm_quiz_physical(pg_temp.academy(), pg_temp.qb(), pg_temp.rec('s5'), 0, gen_random_uuid()) $s$, 'quiz_closed');
select pg_temp.as_user('e2222222-2222-4222-8222-222222222222');
select pg_temp.expect_error($s$ select public.configure_quiz_availability(pg_temp.academy(), pg_temp.qb(), (pg_temp.quiz(pg_temp.qb())->>'version')::integer, now(), now() + interval '1 day') $s$, 'quiz_closed');
do $$ begin
  perform pg_temp.check(pg_temp.quiz(pg_temp.qb())->>'phase' = 'closed' and pg_temp.quiz(pg_temp.qb())->>'closure_settled_at' is not null, 'closed quiz');
end $$;

-- ---------------------------------------------------------------------------------------------
-- Physical solutions on quiz A: announced result + closure, in either order.

select pg_temp.as_user('e3333333-3333-4333-8333-333333333333');
do $$ declare v integer; begin
  v := (pg_temp.student(pg_temp.qa(), 's1')->>'version')::integer;
  perform public.announce_quiz_results(pg_temp.academy(), pg_temp.qa(), (pg_temp.quiz(pg_temp.qa())->>'scoring_revision')::integer,
    jsonb_build_array(jsonb_build_object('annual_student_record_id', pg_temp.rec('s1'), 'expected_version', v)), gen_random_uuid());
  perform pg_temp.check(not (pg_temp.student(pg_temp.qa(), 's1')->>'solutions_qualified')::boolean, 'announcement alone does not qualify');
end $$;
reset role;
-- s4's open attempt on quiz A is settled by closure.
update public.quizzes set opens_at = now() - interval '3 hours', closes_at = now() - interval '1 hour', actual_closes_at = now() - interval '58 minutes' where id = pg_temp.qa();
do $$ declare run record; begin
  -- A worker that was down for an hour recovers: the effective cutoff stays the actual closure.
  perform edra_private.run_quiz_deadlines(50);
  select r.* into run from edra_private.quiz_deadline_runs r order by r.id desc limit 1;
  perform pg_temp.check(run.failures = 0 and run.attempts >= 1 and run.max_lag_seconds > 3000, 'worker run recorded with its lag');
  perform pg_temp.check((select submitted_at = actual_closes_at from public.quiz_submissions s join public.quizzes z on z.id = s.quiz_id
    where s.quiz_id = pg_temp.qa() and s.annual_student_record_id = pg_temp.rec('s4')), 'late processing keeps the effective time');
  perform pg_temp.check((select solutions_qualified_at is not null from public.quiz_work where quiz_id = pg_temp.qa() and annual_student_record_id = pg_temp.rec('s1')), 'physical qualifies at closure after announcement');
  perform pg_temp.check((select reason = 'window_closed' from public.quiz_submissions where quiz_id = pg_temp.qa() and annual_student_record_id = pg_temp.rec('s4')), 's4 window_closed');
end $$;

-- ---------------------------------------------------------------------------------------------
-- Refinement: live eligibility for new physical work (even with a draft), the structure lock at
-- acceptance, and truthful processing status. Each case uses a fresh quiz so no earlier lock hides it.

set local role authenticated;
select pg_temp.as_user('e3333333-3333-4333-8333-333333333333');
do $$ declare paper jsonb := jsonb_build_object(
  'title', 'Paper quiz', 'audience', 'level', 'level_id', 'preparatory-3',
  'parts', jsonb_build_array(jsonb_build_object('title', 'Choices', 'kind', 'question_sheet', 'questions', jsonb_build_array(
    jsonb_build_object('prompt', 'One?', 'max_score', '2', 'choices', '[{"label":"A","is_correct":true},{"label":"B"}]'::jsonb),
    jsonb_build_object('prompt', 'Two?', 'max_score', '2', 'choices', '[{"label":"A"},{"label":"B","is_correct":true}]'::jsonb)))));
begin
  perform public.create_quiz(pg_temp.academy(), pg_temp.year(), 'ec000000-0000-4000-8000-000000000004', paper);
  perform public.create_quiz(pg_temp.academy(), pg_temp.year(), 'ec000000-0000-4000-8000-000000000005', paper);
  perform public.create_quiz(pg_temp.academy(), pg_temp.year(), 'ec000000-0000-4000-8000-000000000006', paper);
end $$;

-- A draft saved while eligible survives a move out of the audience, but new work is refused.
do $$ declare out jsonb; begin
  out := public.save_quiz_physical_draft(pg_temp.academy(), 'ec000000-0000-4000-8000-000000000004', pg_temp.rec('s6'), 0, jsonb_build_array(
    jsonb_build_object('question_id', pg_temp.question('ec000000-0000-4000-8000-000000000004', 1)->>'id',
      'choice_id', pg_temp.choice('ec000000-0000-4000-8000-000000000004', 1, 1))), gen_random_uuid());
  perform pg_temp.check(out->>'outcome' = 'saved', 'draft saved while eligible');
end $$;
reset role;
update public.annual_student_records set level_id = 'secondary-1', primary_group_id = null where id = pg_temp.rec('s6');
set local role authenticated;
select pg_temp.as_user('e3333333-3333-4333-8333-333333333333');
select pg_temp.expect_error(format($f$ select public.save_quiz_physical_draft(%L, 'ec000000-0000-4000-8000-000000000004', %L, 1, '[]', gen_random_uuid()) $f$,
  pg_temp.academy(), pg_temp.rec('s6')), 'not_eligible');
select pg_temp.expect_error(format($f$ select public.confirm_quiz_physical(%L, 'ec000000-0000-4000-8000-000000000004', %L, 1, gen_random_uuid()) $f$,
  pg_temp.academy(), pg_temp.rec('s6')), 'not_eligible');
select pg_temp.check((pg_temp.student('ec000000-0000-4000-8000-000000000004', 's6')->'physical_draft'->>'version')::integer = 1
  and not (pg_temp.student('ec000000-0000-4000-8000-000000000004', 's6')->>'eligible')::boolean, 'draft stays readable and the change is visible');
select pg_temp.check((select count(*) from public.quiz_submissions where quiz_id = 'ec000000-0000-4000-8000-000000000004') = 0, 'nothing was accepted');
-- Back in the audience: confirmation works; moving out afterwards keeps the accepted work announceable.
reset role;
update public.annual_student_records set level_id = 'preparatory-3', primary_group_id = 'ea888888-0000-4000-8000-000000000001' where id = pg_temp.rec('s6');
set local role authenticated;
select pg_temp.as_user('e3333333-3333-4333-8333-333333333333');
do $$ declare out jsonb; begin
  out := public.confirm_quiz_physical(pg_temp.academy(), 'ec000000-0000-4000-8000-000000000004', pg_temp.rec('s6'), 1, 'ed000000-0000-4000-8000-0000000000d1');
  perform pg_temp.check(out->>'outcome' = 'confirmed', 'confirmed once eligible again');
end $$;
reset role;
update public.annual_student_records set level_id = 'secondary-1', primary_group_id = null where id = pg_temp.rec('s6');
set local role authenticated;
select pg_temp.as_user('e3333333-3333-4333-8333-333333333333');
do $$ declare out jsonb; begin
  -- A historical idempotent retry replays; it is not a fresh submission.
  out := public.confirm_quiz_physical(pg_temp.academy(), 'ec000000-0000-4000-8000-000000000004', pg_temp.rec('s6'), 1, 'ed000000-0000-4000-8000-0000000000d1');
  perform pg_temp.check((out->>'replayed')::boolean, 'retry replays after the move');
  out := public.announce_quiz_results(pg_temp.academy(), 'ec000000-0000-4000-8000-000000000004',
    (pg_temp.quiz('ec000000-0000-4000-8000-000000000004')->>'scoring_revision')::integer, jsonb_build_array(
    jsonb_build_object('annual_student_record_id', pg_temp.rec('s6'), 'expected_version',
      (pg_temp.student('ec000000-0000-4000-8000-000000000004', 's6')->>'version')::integer)), gen_random_uuid());
  perform pg_temp.check(out->>'outcome' = 'published', 'accepted work of a moved-out student is still announceable');
end $$;
reset role;
update public.annual_student_records set level_id = 'preparatory-3', primary_group_id = 'ea888888-0000-4000-8000-000000000001' where id = pg_temp.rec('s6');

-- A blank confirmation locks the scoring structure before any result exists.
set local role authenticated;
select pg_temp.as_user('e3333333-3333-4333-8333-333333333333');
do $$ declare out jsonb; q jsonb; begin
  perform pg_temp.check(pg_temp.quiz('ec000000-0000-4000-8000-000000000005')->>'structure_locked_at' is null, 'fresh quiz is unlocked');
  out := public.confirm_quiz_physical(pg_temp.academy(), 'ec000000-0000-4000-8000-000000000005', pg_temp.rec('s2'), 0, gen_random_uuid());
  perform pg_temp.check(out->>'outcome' = 'confirmed', 'blank physical work confirmed');
  q := pg_temp.quiz('ec000000-0000-4000-8000-000000000005');
  perform pg_temp.check(q->>'structure_locked_at' is not null, 'acceptance locked the structure');
  perform pg_temp.expect_error(format($f$ select public.update_quiz(%L, %L, %s, %L) $f$, pg_temp.academy(), 'ec000000-0000-4000-8000-000000000005', q->>'version',
    jsonb_set(jsonb_build_object('title', 'Paper quiz', 'audience', 'level', 'level_id', 'preparatory-3',
      'parts', jsonb_build_array(jsonb_build_object('id', q->'parts'->0->'id', 'title', 'Choices', 'kind', 'question_sheet', 'questions', jsonb_build_array(
        jsonb_build_object('id', q->'parts'->0->'questions'->0->'id', 'prompt', 'One?', 'max_score', '5',
          'choices', '[{"label":"A","is_correct":true},{"label":"B"}]'::jsonb),
        jsonb_build_object('id', q->'parts'->0->'questions'->1->'id', 'prompt', 'Two?', 'max_score', '2',
          'choices', '[{"label":"A"},{"label":"B","is_correct":true}]'::jsonb))))),
      '{title}', '"Paper quiz"')), 'structure_locked');
end $$;

-- A due attempt nobody has processed is reported as pending by the reads; the detail read settles it.
select pg_temp.as_user('e2222222-2222-4222-8222-222222222222');
do $$ begin
  perform public.configure_quiz_availability(pg_temp.academy(), 'ec000000-0000-4000-8000-000000000006', 1, now() - interval '1 minute', now() + interval '1 hour');
end $$;
reset role;
select edra_private.start_quiz_attempt_for('ec000000-0000-4000-8000-000000000006', pg_temp.rec('s3'));
update public.quizzes set opens_at = now() - interval '3 hours', closes_at = now() - interval '1 hour', actual_closes_at = now() - interval '58 minutes'
where id = 'ec000000-0000-4000-8000-000000000006';
select pg_temp.check((edra_private.quiz_json('ec000000-0000-4000-8000-000000000006')->>'processing_pending')::boolean
  and edra_private.quiz_json('ec000000-0000-4000-8000-000000000006')->>'phase' = 'closed', 'closed by time, still pending processing');
set local role authenticated;
select pg_temp.as_user('e2222222-2222-4222-8222-222222222222');
do $$ declare listed jsonb; detail jsonb; begin
  listed := public.list_quizzes(pg_temp.academy(), null, null, null, null, true, 50, 0);
  perform pg_temp.check((select (i->>'processing_pending')::boolean from jsonb_array_elements(listed->'items') i
    where i->>'id' = 'ec000000-0000-4000-8000-000000000006'), 'list reports pending processing');
  detail := public.get_quiz(pg_temp.academy(), 'ec000000-0000-4000-8000-000000000006');
  perform pg_temp.check(not (detail->>'processing_pending')::boolean and detail->>'closure_settled_at' is not null, 'detail settles and reports it');
end $$;
reset role;
select pg_temp.check((select reason = 'window_closed' and submitted_at < processed_at from public.quiz_submissions
  where quiz_id = 'ec000000-0000-4000-8000-000000000006'), 'saved work submitted with the original cutoff and a later processing time');

-- ---------------------------------------------------------------------------------------------
-- Year closure settles due work and refuses while an attempt still runs; afterwards everything is read-only.

set local role authenticated;
select pg_temp.as_user('e2222222-2222-4222-8222-222222222222');
do $$ begin
  perform public.create_quiz(pg_temp.academy(), pg_temp.year(), 'ec000000-0000-4000-8000-000000000003', jsonb_build_object(
    'title', 'Running', 'audience', 'level', 'level_id', 'preparatory-3',
    'parts', jsonb_build_array(jsonb_build_object('title', 'W', 'kind', 'written_work', 'questions', jsonb_build_array(jsonb_build_object('prompt', 'Q', 'max_score', '1'))))));
  perform public.configure_quiz_availability(pg_temp.academy(), 'ec000000-0000-4000-8000-000000000003', 1, now() - interval '1 minute', now() + interval '1 hour');
end $$;
reset role;
select edra_private.start_quiz_attempt_for('ec000000-0000-4000-8000-000000000003', pg_temp.rec('s6'));
select pg_temp.expect_error($s$ update public.academic_years set closed_at = now() where id = pg_temp.year() $s$, 'quiz_work_pending');
update public.quizzes set opens_at = now() - interval '3 hours', closes_at = now() - interval '1 hour', actual_closes_at = now() - interval '58 minutes'
where id = 'ec000000-0000-4000-8000-000000000003';
update public.academic_years set closed_at = now() where id = pg_temp.year();
select pg_temp.check((select reason = 'window_closed' from public.quiz_submissions where quiz_id = 'ec000000-0000-4000-8000-000000000003'), 'year close settled the attempt');
set local role authenticated;
select pg_temp.as_user('e3333333-3333-4333-8333-333333333333');
select pg_temp.expect_error($s$ select public.save_quiz_marks(pg_temp.academy(), pg_temp.qa(), pg_temp.rec('s2'), 1, '{"feedback":"x"}', gen_random_uuid()) $s$, 'year_unavailable');
select pg_temp.expect_error($s$ select public.update_quiz(pg_temp.academy(), pg_temp.qa(), 1, '{"title":"x","parts":[]}') $s$, 'year_unavailable');
do $$ begin
  perform pg_temp.check((pg_temp.quiz(pg_temp.qa())->>'year_open')::boolean = false, 'closed-year quiz readable');
end $$;

rollback;
