-- EDRA-232: student exam discovery, overview and the academy-scoped start/resume boundary.
-- Grants, connected-account authority (two students, a second academy, suspension, unconnected and
-- recovery sessions), discovery rules, pagination, allowlisted payloads, read-only overviews,
-- idempotent start, wrong-academy and attached-exam denial, history after placement moves and the
-- tightened post-submission projection with total-only, corrected results. Run with
-- `npm run test:db -- student_exams`. Everything runs in one transaction that is rolled back.

do $$ begin
  if not has_function_privilege('authenticated', 'public.list_my_exams(uuid, integer, integer)', 'execute')
    or not has_function_privilege('authenticated', 'public.get_my_exam_overview(uuid, uuid)', 'execute')
    or not has_function_privilege('authenticated', 'public.start_my_exam(uuid, uuid)', 'execute')
    or has_function_privilege('anon', 'public.list_my_exams(uuid, integer, integer)', 'execute')
    or has_function_privilege('anon', 'public.get_my_exam_overview(uuid, uuid)', 'execute')
    or has_function_privilege('anon', 'public.start_my_exam(uuid, uuid)', 'execute')
    or has_function_privilege('anon', 'public.start_exam_attempt(uuid)', 'execute')
    or has_function_privilege('authenticated', 'edra_private.start_my_exam_for(uuid, uuid)', 'execute')
    or has_function_privilege('authenticated', 'edra_private.my_exam_record(uuid)', 'execute')
    or has_function_privilege('authenticated', 'edra_private.exam_official_result_json(uuid, uuid)', 'execute')
    or has_function_privilege('authenticated', 'edra_private.my_exam_overview_json(public.exams, text, uuid, timestamptz)', 'execute') then
    raise exception 'Student exam grants are wrong';
  end if;
end $$;

begin;
create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'Student exam check failed: %', label; end if; end $$;
create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$
begin
  execute statement;
  raise exception 'Expected rejection: % (%)', expected, statement using errcode = 'XX001';
exception when sqlstate 'XX001' then raise;
  when others then if sqlerrm not like expected then raise exception 'Expected %, got %: %', expected, sqlerrm, statement; end if;
end $$;

create temporary table se_ids(name text primary key, id uuid not null default gen_random_uuid());
insert into se_ids(name) values ('owner'),('owner-b'),('s1'),('s2'),('s3'),('suspended'),('outsider'),('academy'),('academy-b'),
  ('open'),('upcoming'),('draft'),('unscheduled'),('other'),('closed'),('history'),('headroom'),('attached'),('empty'),('b-open');
grant select on pg_temp.se_ids to authenticated;
create function pg_temp.id(label text) returns uuid language sql as $$ select id from pg_temp.se_ids where name = label $$;
create function pg_temp.act(label text) returns void language sql as $$ select set_config('request.jwt.claim.sub', pg_temp.id(label)::text, true) $$;
create function pg_temp.ids(page jsonb) returns uuid[] language sql as $$
  select coalesce(array_agg((i->>'exam_id')::uuid order by o), '{}') from jsonb_array_elements(page->'items') with ordinality t(i, o) $$;
create function pg_temp.no_material(doc jsonb) returns boolean language sql as $$
  select not jsonb_path_exists(doc, '$.**.prompt') and not jsonb_path_exists(doc, '$.**.choices')
    and not jsonb_path_exists(doc, '$.**.questions') and not jsonb_path_exists(doc, '$.**.parts')
    and not jsonb_path_exists(doc, '$.**.answers') and not jsonb_path_exists(doc, '$.**.departures')
    and not jsonb_path_exists(doc, '$.**.items') and not jsonb_path_exists(doc, '$.**.feedback')
    and not jsonb_path_exists(doc, '$.**.model_answer') and not jsonb_path_exists(doc, '$.**.correct_choice_id')
    and not jsonb_path_exists(doc, '$.**.solutions') and not jsonb_path_exists(doc, '$.**.annual_student_record_id')
    and doc::text not like '%SECRET-%' $$;

insert into auth.users(id) select id from se_ids where name in ('owner','owner-b','s1','s2','s3','suspended','outsider');
insert into public.academies(id, name, slug, icon, subject, created_by) values
  (pg_temp.id('academy'), 'Student exams A', 'se-a-' || pg_temp.id('academy'), 'school', 'Math', pg_temp.id('owner')),
  (pg_temp.id('academy-b'), 'Student exams B', 'se-b-' || pg_temp.id('academy-b'), 'school', 'Math', pg_temp.id('owner-b'));
insert into public.academy_memberships(academy_id, user_id, role, created_by) values
  (pg_temp.id('academy'), pg_temp.id('owner'), 'owner', pg_temp.id('owner')),
  (pg_temp.id('academy-b'), pg_temp.id('owner-b'), 'owner', pg_temp.id('owner-b'));
insert into se_ids(name, id) select 'year', id from public.academic_years where academy_id = pg_temp.id('academy');
insert into se_ids(name, id) select 'year-b', id from public.academic_years where academy_id = pg_temp.id('academy-b');
insert into public.academy_levels(academy_id, level_id, sort_order) values
  (pg_temp.id('academy'), 'preparatory-3', 9), (pg_temp.id('academy'), 'secondary-1', 10), (pg_temp.id('academy-b'), 'preparatory-3', 9);

select pg_temp.act('owner');
insert into se_ids(name, id) select 'rec-' || s.name,
  (public.create_student_record(pg_temp.id('academy'), pg_temp.id('year'), 'Student exam ' || s.name, '0107232000' || s.n, '01107232000',
    s.level, null, null, 'in_person')).id
from (values ('s1', 1, 'preparatory-3'), ('s2', 2, 'preparatory-3'), ('s3', 3, 'secondary-1'), ('suspended', 4, 'preparatory-3')) s(name, n, level);
select pg_temp.act('owner-b');
insert into se_ids(name, id) select 'rec-b-s1',
  (public.create_student_record(pg_temp.id('academy-b'), pg_temp.id('year-b'), 'Student exam b', '01072320005', '01107232000', 'preparatory-3', null, null, 'in_person')).id;
update public.academy_student_profiles p set user_id = pg_temp.id(substr(x.name, 5)), linked_at = now()
from public.annual_student_records r join pg_temp.se_ids x on x.id = r.id and x.name in ('rec-s1','rec-s2','rec-s3','rec-suspended')
where r.academy_student_profile_id = p.id;
update public.academy_student_profiles p set user_id = pg_temp.id('s1'), linked_at = now()
from public.annual_student_records r where r.id = pg_temp.id('rec-b-s1') and r.academy_student_profile_id = p.id;
update public.academy_student_profiles p set access_suspended_at = now()
from public.annual_student_records r where r.id = pg_temp.id('rec-suspended') and r.academy_student_profile_id = p.id;

-- Exams. make(label, academy, level, ready): one Question Sheet question plus one Written Work question.
create function pg_temp.make(label text, academy text, level text, ready boolean) returns void language plpgsql as $$
begin
  perform public.create_exam(pg_temp.id(academy), pg_temp.id(case academy when 'academy' then 'year' else 'year-b' end), pg_temp.id(label), jsonb_build_object(
    'title', 'Exam ' || label, 'instructions', 'Instructions ' || label, 'solution_notes', 'SECRET-NOTES', 'audience', 'level', 'level_id', level,
    'time_limit_minutes', 30,
    'parts', case when ready then jsonb_build_array(
      jsonb_build_object('title', 'SECRET-PART', 'kind', 'question_sheet', 'questions', jsonb_build_array(
        jsonb_build_object('prompt', 'SECRET-PROMPT', 'max_score', '2', 'choices', jsonb_build_array(
          jsonb_build_object('label', 'SECRET-RIGHT', 'is_correct', true), jsonb_build_object('label', 'SECRET-WRONG')))))) else '[]'::jsonb end));
end $$;
create function pg_temp.window(label text, opens interval, closes interval) returns void language sql as $$
  update public.exams set opens_at = now() + opens, closes_at = now() + closes, actual_closes_at = now() + closes + interval '2 minutes'
  where id = pg_temp.id(label) $$;

select pg_temp.act('owner');
select pg_temp.make(x, 'academy', 'preparatory-3', true) from unnest(array['open','upcoming','unscheduled','closed','history','headroom','attached','empty']) x;
select pg_temp.make('draft', 'academy', 'preparatory-3', false);
select pg_temp.make('other', 'academy', 'secondary-1', true);
select pg_temp.act('owner-b');
select pg_temp.make('b-open', 'academy-b', 'preparatory-3', true);
reset role;
select pg_temp.window(x, interval '-1 minute', interval '1 hour') from unnest(array['open','history','attached','empty','other','b-open']) x;
select pg_temp.window('upcoming', interval '1 day', interval '2 days');
select pg_temp.window('draft', interval '-1 minute', interval '1 hour');
select pg_temp.window('closed', interval '-3 hours', interval '-1 hour');
select pg_temp.window('headroom', interval '-1 hour', interval '-1 minute');
insert into public.content_programs(id, academy_id, academic_year_id, level_id)
values (pg_temp.id('attached'), pg_temp.id('academy'), pg_temp.id('year'), 'preparatory-3');
insert into public.content_units(id, academy_id, program_id, created_by, draft)
values (pg_temp.id('attached'), pg_temp.id('academy'), pg_temp.id('attached'), pg_temp.id('owner'), '{"title":"Unit","description":"","items":[]}');
insert into public.content_assessments(academy_id, unit_id, kind, assessment_id)
values (pg_temp.id('academy'), pg_temp.id('attached'), 'exam', pg_temp.id('attached'));
-- An incidental empty work row (no attempt, submission or physical answers) is not participation.
insert into public.exam_work(exam_id, annual_student_record_id, academy_id, academic_year_id)
values (pg_temp.id('empty'), pg_temp.id('rec-s1'), pg_temp.id('academy'), pg_temp.id('year'));
update public.exams set opens_at = now() - interval '3 hours', closes_at = now() - interval '1 hour', actual_closes_at = now() - interval '58 minutes'
where id = pg_temp.id('empty');

-- s1 participates in "history" while it is open; it then closes and settles (window_closed).
select pg_temp.act('s1');
set local role authenticated;
select pg_temp.check(public.start_my_exam(pg_temp.id('academy'), pg_temp.id('history'))->'attempt'->>'started_at' is not null, 'history attempt started');
reset role;
update public.exams set opens_at = now() - interval '3 hours', closes_at = now() - interval '1 hour', actual_closes_at = now() - interval '58 minutes'
where id = pg_temp.id('history');
select edra_private.settle_exam_closure(pg_temp.id('history'));

-- Discovery: open, upcoming and own history only; resumable/open first, then upcoming, then history.
select pg_temp.act('s1');
set local role authenticated;
do $$
declare page jsonb := public.list_my_exams(pg_temp.id('academy'), 25, 0);
begin
  perform pg_temp.check((page->>'total')::integer = 3, 'discoverable total');
  perform pg_temp.check(pg_temp.ids(page) = array[pg_temp.id('open'), pg_temp.id('upcoming'), pg_temp.id('history')], 'discovery set and order');
  perform pg_temp.check(page->'items'->0->>'action' = 'start' and page->'items'->1->>'action' = 'not_yet_open'
    and page->'items'->2->>'action' = 'submitted', 'list actions');
  perform pg_temp.check(pg_temp.no_material(page->'items') and not jsonb_path_exists(page, '$.**.instructions'), 'list is a minimal allowlist');
  page := public.list_my_exams(pg_temp.id('academy'), 1, 1);
  perform pg_temp.check((page->>'total')::integer = 3 and pg_temp.ids(page) = array[pg_temp.id('upcoming')], 'stable pagination');
  perform pg_temp.check(pg_temp.ids(public.list_my_exams(pg_temp.id('academy-b'), 25, 0)) = array[pg_temp.id('b-open')], 'second academy is separate');
end $$;
select pg_temp.expect_error($q$select public.list_my_exams(pg_temp.id('academy'), 0, 0)$q$, 'validation');
select pg_temp.expect_error($q$select public.list_my_exams(pg_temp.id('academy'), 101, 0)$q$, 'validation');
select pg_temp.expect_error($q$select public.list_my_exams(pg_temp.id('academy'), 10, -1)$q$, 'validation');
select pg_temp.expect_error($q$select public.list_my_exams(null, 10, 0)$q$, 'validation');

-- Overview: allowlisted, read-only, non-enumerating.
do $$
declare overview jsonb := public.get_my_exam_overview(pg_temp.id('academy'), pg_temp.id('open'));
begin
  perform pg_temp.check(overview->>'action' = 'start' and overview->>'instructions' = 'Instructions open'
    and overview->>'time_limit_minutes' = '30' and overview->'attempt' = 'null'::jsonb and overview->'result' = 'null'::jsonb, 'open overview');
  perform pg_temp.check(pg_temp.no_material(overview), 'overview carries no question material');
  perform pg_temp.check(public.get_my_exam_overview(pg_temp.id('academy'), pg_temp.id('upcoming'))->>'action' = 'not_yet_open', 'upcoming overview');
  overview := public.get_my_exam_overview(pg_temp.id('academy'), pg_temp.id('history'));
  perform pg_temp.check(overview->>'action' = 'submitted' and overview->'submission'->>'reason' = 'window_closed'
    and overview->'attempt'->>'finalization_reason' = 'window_closed', 'own history overview');
  perform pg_temp.check(pg_temp.no_material(overview), 'history overview carries no review material');
  perform pg_temp.check(public.get_my_exam_overview(pg_temp.id('academy-b'), pg_temp.id('b-open'))->>'action' = 'start', 'second academy overview');
end $$;
reset role;
select pg_temp.check(not exists (select 1 from public.exam_work where exam_id in (pg_temp.id('open'), pg_temp.id('upcoming'))), 'reads create no work');
select pg_temp.act('s1');
set local role authenticated;
select pg_temp.expect_error(format('select public.get_my_exam_overview(%L, %L)', pg_temp.id('academy'), pg_temp.id(x)), 'not_found')
from unnest(array['draft','unscheduled','other','closed','headroom','attached','empty','b-open']) x;
select pg_temp.expect_error(format('select public.get_my_exam_overview(%L, %L)', pg_temp.id('academy-b'), pg_temp.id('open')), 'not_found');
select pg_temp.expect_error(format('select public.get_my_exam_overview(%L, %L)', pg_temp.id('academy'), gen_random_uuid()), 'not_found');

-- Start: wrong academy, attached, not open and headroom are denied without creating work.
select pg_temp.expect_error(format('select public.start_my_exam(%L, %L)', pg_temp.id('academy-b'), pg_temp.id('open')), 'not_found');
select pg_temp.expect_error(format('select public.start_my_exam(%L, %L)', pg_temp.id('academy'), pg_temp.id('attached')), 'content_unavailable');
select pg_temp.expect_error(format('select public.start_exam_attempt(%L)', pg_temp.id('attached')), 'content_unavailable');
select pg_temp.expect_error(format('select public.get_my_exam(%L)', pg_temp.id('attached')), 'content_unavailable');
select pg_temp.expect_error(format('select public.start_my_exam(%L, %L)', pg_temp.id('academy'), pg_temp.id('upcoming')), 'not_open');
select pg_temp.expect_error(format('select public.start_my_exam(%L, %L)', pg_temp.id('academy'), pg_temp.id('headroom')), 'not_open');
select pg_temp.expect_error(format('select public.start_my_exam(%L, %L)', pg_temp.id('academy'), pg_temp.id('other')), 'not_eligible');
reset role;
select pg_temp.check(not exists (select 1 from public.exam_work where exam_id in (pg_temp.id('attached'), pg_temp.id('upcoming'), pg_temp.id('headroom'), pg_temp.id('other'))),
  'denied starts leave no work');

-- Start and retry: one attempt, original start and deadline.
select pg_temp.act('s1');
set local role authenticated;
do $$
declare first jsonb := public.start_my_exam(pg_temp.id('academy'), pg_temp.id('open'));
  again jsonb;
  overview jsonb;
begin
  -- EDRA-233: during the attempt, material is available only through the fenced answering read.
  perform pg_temp.check(first->'parts' = '[]'::jsonb and first->'attempt'->'answers' = '[]'::jsonb
    and first->'solutions' = 'null'::jsonb, 'direct start reveals no material');
  perform pg_temp.check(not jsonb_path_exists(first, '$.**.correct_choice_id') and not jsonb_path_exists(first, '$.**.is_correct')
    and first::text not like '%SECRET-NOTES%', 'no keys during the attempt');
  again := public.start_my_exam(pg_temp.id('academy'), pg_temp.id('open'));
  perform pg_temp.check(again->'attempt'->'started_at' = first->'attempt'->'started_at'
    and again->'attempt'->'deadline_at' = first->'attempt'->'deadline_at', 'retry resumes the original attempt');
  again := public.start_exam_attempt(pg_temp.id('open'));
  perform pg_temp.check(again->'attempt'->'deadline_at' = first->'attempt'->'deadline_at', 'unscoped wrapper resumes the same attempt');
  overview := public.get_my_exam_overview(pg_temp.id('academy'), pg_temp.id('open'));
  perform pg_temp.check(overview->>'action' = 'resume' and overview->'attempt'->'deadline_at' = first->'attempt'->'deadline_at'
    and overview->'attempt'->>'departure_count' = '0', 'resume overview');
  perform pg_temp.check(pg_temp.no_material(overview), 'resume overview carries no answers or questions');
end $$;
reset role;
select pg_temp.check((select count(*) from public.exam_attempts where exam_id = pg_temp.id('open')) = 1, 'exactly one attempt');

-- Another student sees nothing of s1's work; s3 (other level) sees only their audience.
select pg_temp.act('s2');
set local role authenticated;
do $$
declare overview jsonb := public.get_my_exam_overview(pg_temp.id('academy'), pg_temp.id('open'));
begin
  perform pg_temp.check(overview->>'action' = 'start' and overview->'attempt' = 'null'::jsonb, 'no cross-student attempt');
  perform pg_temp.check(pg_temp.ids(public.list_my_exams(pg_temp.id('academy'), 25, 0)) = array[pg_temp.id('open'), pg_temp.id('upcoming')], 'no foreign history');
end $$;
select pg_temp.expect_error(format('select public.get_my_exam_overview(%L, %L)', pg_temp.id('academy'), pg_temp.id('history')), 'not_found');
select pg_temp.expect_error(format('select public.list_my_exams(%L, 25, 0)', pg_temp.id('academy-b')), 'student_link_unavailable');
select pg_temp.act('s3');
select pg_temp.check(pg_temp.ids(public.list_my_exams(pg_temp.id('academy'), 25, 0)) = array[pg_temp.id('other')], 'audience-scoped discovery');
select pg_temp.check(public.start_my_exam(pg_temp.id('academy'), pg_temp.id('other'))->'attempt'->>'started_at' is not null, 'eligible start');

-- Unauthorized callers.
select pg_temp.act('suspended');
select pg_temp.expect_error(format('select public.list_my_exams(%L, 25, 0)', pg_temp.id('academy')), 'student_link_unavailable');
select pg_temp.expect_error(format('select public.get_my_exam_overview(%L, %L)', pg_temp.id('academy'), pg_temp.id('open')), 'student_link_unavailable');
select pg_temp.expect_error(format('select public.start_my_exam(%L, %L)', pg_temp.id('academy'), pg_temp.id('open')), 'student_link_unavailable');
select pg_temp.act('outsider');
select pg_temp.expect_error(format('select public.list_my_exams(%L, 25, 0)', pg_temp.id('academy')), 'student_link_unavailable');
select pg_temp.expect_error(format('select public.start_my_exam(%L, %L)', pg_temp.id('academy'), pg_temp.id('open')), 'student_link_unavailable');
select pg_temp.act('owner');
select pg_temp.expect_error(format('select public.list_my_exams(%L, 25, 0)', pg_temp.id('academy')), 'student_link_unavailable');
reset role;
select set_config('request.jwt.claim.sub', '', true);
set local role authenticated;
select pg_temp.expect_error(format('select public.list_my_exams(%L, 25, 0)', pg_temp.id('academy')), 'forbidden');
reset role;
do $$
declare session_id uuid := gen_random_uuid();
begin
  insert into auth.sessions(id, user_id, created_at, updated_at) values (session_id, pg_temp.id('s1'), now(), now());
  perform set_config('edra.verified_session', '', true);
  perform set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'sub', pg_temp.id('s1'), 'session_id', session_id,
    'amr', jsonb_build_array(jsonb_build_object('method', 'recovery')))::text, true);
  perform pg_temp.act('s1');
  perform pg_temp.expect_error(format('select public.list_my_exams(%L, 25, 0)', pg_temp.id('academy')), 'student_link_unavailable');
  perform pg_temp.expect_error(format('select public.start_my_exam(%L, %L)', pg_temp.id('academy'), pg_temp.id('open')), 'student_link_unavailable');
  perform set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'sub', pg_temp.id('s1'), 'session_id', session_id,
    'amr', jsonb_build_array(jsonb_build_object('method', 'password')))::text, true);
  perform pg_temp.check((public.list_my_exams(pg_temp.id('academy'), 25, 0)->>'total')::integer = 3, 'ordinary session restored');
  perform set_config('request.jwt.claims', '', true);
end $$;

-- History after a placement move stays readable; new work is refused.
select pg_temp.act('s2');
set local role authenticated;
select public.start_my_exam(pg_temp.id('academy'), pg_temp.id('open'));
reset role;
update public.annual_student_records set level_id = 'secondary-1' where id = pg_temp.id('rec-s2');
select pg_temp.act('s2');
set local role authenticated;
select pg_temp.check(public.get_my_exam_overview(pg_temp.id('academy'), pg_temp.id('open'))->>'action' = 'ineligible', 'moved student keeps history, cannot answer');
select pg_temp.check(pg_temp.ids(public.list_my_exams(pg_temp.id('academy'), 25, 0)) = array[pg_temp.id('other'), pg_temp.id('open')], 'new audience first, then history');
reset role;

-- Post-submission: status and the official total only, until solutions qualify.
select pg_temp.act('owner');
insert into se_ids(name, id) select 'q-open', id from public.exam_questions where exam_id = pg_temp.id('open');
insert into se_ids(name, id) select 'right', id from public.exam_choices where question_id = pg_temp.id('q-open') and is_correct;
insert into se_ids(name, id) select 'wrong', id from public.exam_choices where question_id = pg_temp.id('q-open') and not is_correct;
select edra_private.save_exam_answers_for(pg_temp.id('open'), pg_temp.id('rec-s1'), 0,
  jsonb_build_array(jsonb_build_object('question_id', pg_temp.id('q-open'), 'choice_id', pg_temp.id('wrong'))), gen_random_uuid());
select edra_private.submit_exam_attempt_for(pg_temp.id('open'), pg_temp.id('rec-s1'), gen_random_uuid());
do $$
declare state jsonb := edra_private.exam_student_state(pg_temp.id('open'), pg_temp.id('rec-s1'));
begin
  perform pg_temp.check(state->'parts' = '[]'::jsonb and state->'excluded_question_ids' = '[]'::jsonb
    and state->'attempt'->'answers' = '[]'::jsonb and state->'attempt'->'departures' = '[]'::jsonb
    and state->'solutions' = 'null'::jsonb and state::text not like '%SECRET-%', 'no review before qualification');
  perform pg_temp.check(state->'result'->>'total' = '0.00' and state->'result'->>'max_score' = '2.00'
    and state->'result'->>'corrected' = 'false' and not (state->'result' ? 'items') and not (state->'result' ? 'feedback'), 'total-only result');
end $$;
select public.correct_exam_key(pg_temp.id('academy'), pg_temp.id('open'), pg_temp.id('q-open'), pg_temp.id('wrong'), 1, gen_random_uuid());
select public.announce_exam_results(pg_temp.id('academy'), pg_temp.id('open'), 2, jsonb_build_array(jsonb_build_object(
  'annual_student_record_id', pg_temp.id('rec-s1'),
  'expected_version', (select version from public.exam_work where exam_id = pg_temp.id('open') and annual_student_record_id = pg_temp.id('rec-s1')))), gen_random_uuid());
select pg_temp.act('s1');
set local role authenticated;
do $$
declare overview jsonb := public.get_my_exam_overview(pg_temp.id('academy'), pg_temp.id('open'));
begin
  perform pg_temp.check(overview->>'action' = 'submitted' and overview->'submission'->>'reason' = 'submitted', 'submitted overview');
  perform pg_temp.check(overview->'result'->>'total' = '2.00' and overview->'result'->>'corrected' = 'true'
    and overview->'result'->>'corrected_at' is not null and overview->'result'->>'published_at' is not null, 'corrected official total');
  perform pg_temp.check(pg_temp.no_material(overview), 'submitted overview allowlist');
  perform pg_temp.check(public.get_my_exam(pg_temp.id('open'))->'parts' = '[]'::jsonb, 'direct RPC hides review before qualification');
  perform pg_temp.check(public.start_my_exam(pg_temp.id('academy'), pg_temp.id('open'))->'parts' = '[]'::jsonb, 'start after submission reveals nothing');
end $$;
reset role;
select pg_temp.check((select count(*) from public.exam_attempts where exam_id = pg_temp.id('open') and annual_student_record_id = pg_temp.id('rec-s1')) = 1, 'no retake');

-- Actual closure qualifies solutions: review material returns with saved answers.
update public.exams set opens_at = now() - interval '3 hours', closes_at = now() - interval '1 hour', actual_closes_at = now() - interval '58 minutes'
where id = pg_temp.id('open');
select pg_temp.act('s1');
set local role authenticated;
do $$
declare state jsonb := public.get_my_exam(pg_temp.id('open'));
begin
  perform pg_temp.check(jsonb_array_length(state->'parts') = 1 and jsonb_array_length(state->'attempt'->'answers') = 1
    and state->'solutions'->'questions'->0->>'correct_choice_id' is not null, 'qualified review');
  perform pg_temp.check(not (state->'result' ? 'items'), 'qualified result stays total-only');
end $$;
reset role;

rollback;
