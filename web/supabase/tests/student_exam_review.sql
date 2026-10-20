-- EDRA-235: finalized exam work review and released solutions. Grants, connected-account authority
-- (second academy, suspension, unconnected, staff, anonymous and recovery callers, wrong academy,
-- guessed and attached exams), qualification (online at actual closure independently of manual
-- results; physical at closure plus announcement in both orders; never-started and draft-only never),
-- accepted-source answers (a losing online draft is never shown; paper Written Work is paper_work),
-- exclusions, field allowlists (no maxima, marks, items, feedback or revisions), the legacy direct-RPC
-- projection, announced versus unannounced result changes, read-only settlement without side effects,
-- placement moves, review-image authorization and year closure. Run with
-- `npm run test:db -- student_exam_review`. Everything runs in one transaction that is rolled back.

do $$ begin
  if not has_function_privilege('authenticated', 'public.get_my_exam_review(uuid, uuid)', 'execute')
    or not has_function_privilege('authenticated', 'public.authorize_my_exam_review_images(uuid, uuid, uuid[])', 'execute')
    or has_function_privilege('anon', 'public.get_my_exam_review(uuid, uuid)', 'execute')
    or has_function_privilege('anon', 'public.authorize_my_exam_review_images(uuid, uuid, uuid[])', 'execute')
    or has_function_privilege('authenticated', 'edra_private.my_exam_review_record(uuid, uuid)', 'execute')
    or has_function_privilege('authenticated', 'edra_private.exam_review_json(uuid, uuid)', 'execute')
    or has_function_privilege('authenticated', 'edra_private.authorize_my_exam_review_images_for(uuid, uuid, uuid[])', 'execute')
    or has_function_privilege('authenticated', 'edra_private.exam_public_state(uuid, uuid)', 'execute')
    or has_function_privilege('anon', 'edra_private.exam_review_json(uuid, uuid)', 'execute')
    or has_table_privilege('authenticated', 'public.exam_submission_answers', 'select')
    or has_table_privilege('authenticated', 'public.exam_online_answers', 'select') then
    raise exception 'Student exam review grants are wrong';
  end if;
end $$;

begin;
create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'Review check failed: %', label; end if; end $$;
create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$
begin
  execute statement;
  raise exception 'Expected rejection: % (%)', expected, statement using errcode = 'XX001';
exception when sqlstate 'XX001' then raise;
  when others then if sqlerrm not like expected then raise exception 'Expected %, got %: %', expected, sqlerrm, statement; end if;
end $$;

create temporary table rv_ids(name text primary key, id uuid not null default gen_random_uuid());
insert into rv_ids(name) values ('owner'),('owner-b'),('s1'),('s2'),('s3'),('s4'),('s5'),('suspended'),('outsider'),('academy'),('academy-b'),
  ('main'),('auto'),('attached'),('b-exam'),('img-prompt'),('img-choice'),('img-excl'),('img-model'),('img-notes'),('img-auto'),('img-b');
grant select on pg_temp.rv_ids to authenticated;
create function pg_temp.id(label text) returns uuid language sql as $$ select id from pg_temp.rv_ids where name = label $$;
create function pg_temp.act(label text) returns void language sql as $$ select set_config('request.jwt.claim.sub', pg_temp.id(label)::text, true) $$;
create function pg_temp.token(label text) returns text language sql as $$ select '{{image:' || pg_temp.id(label) || '}}' $$;
-- Nothing reviewable: no material, keys, answers, marks, maxima or revisions.
create function pg_temp.no_material(doc jsonb) returns boolean language sql as $$
  select not jsonb_path_exists(doc, '$.**.prompt') and not jsonb_path_exists(doc, '$.**.choices')
    and not jsonb_path_exists(doc, '$.**.questions') and not jsonb_path_exists(doc, '$.**.parts')
    and not jsonb_path_exists(doc, '$.**.answer') and not jsonb_path_exists(doc, '$.**.answers')
    and not jsonb_path_exists(doc, '$.**.model_answer') and not jsonb_path_exists(doc, '$.**.correct_choice_id')
    and not jsonb_path_exists(doc, '$.**.notes') and not jsonb_path_exists(doc, '$.**.solutions')
    and doc::text not like '%SECRET-%' and doc::text not like '%{{image:%' $$;
-- Never in any student review document.
create function pg_temp.no_marks(doc jsonb) returns boolean language sql as $$
  select not jsonb_path_exists(doc, '$.**.max_score') and not jsonb_path_exists(doc, '$.**.score')
    and not jsonb_path_exists(doc, '$.**.items') and not jsonb_path_exists(doc, '$.**.feedback')
    and not jsonb_path_exists(doc, '$.**.revision') and not jsonb_path_exists(doc, '$.**.total')
    and not jsonb_path_exists(doc, '$.**.departures') and not jsonb_path_exists(doc, '$.**.is_correct')
    and not jsonb_path_exists(doc, '$.**.annual_student_record_id') and not jsonb_path_exists(doc, '$.**.published_by')
    and doc::text not like '%PRIVATE-%' and doc::text not like '%LOSING-%' $$;
create function pg_temp.question(doc jsonb, label text) returns jsonb language sql as $$
  select q from jsonb_array_elements(doc->'parts') p, jsonb_array_elements(p->'questions') q where q->>'id' = pg_temp.id(label)::text $$;
create function pg_temp.review(student text, exam text) returns jsonb language plpgsql as $$
begin
  perform pg_temp.act(student);
  return public.get_my_exam_review(pg_temp.id('academy'), pg_temp.id(exam));
end $$;
create function pg_temp.images(exam text, labels text[]) returns jsonb language sql as $$
  select public.authorize_my_exam_review_images(pg_temp.id('academy'), pg_temp.id(exam), array(select pg_temp.id(x) from unnest(labels) x)) $$;
create function pg_temp.image_set(doc jsonb) returns uuid[] language sql as $$
  select coalesce(array_agg(x::uuid order by x::uuid), '{}') from jsonb_array_elements_text(doc->'image_ids') x $$;
create function pg_temp.work_version(student text) returns integer language sql as $$
  select version from public.exam_work where exam_id = pg_temp.id('main') and annual_student_record_id = pg_temp.id('rec-' || student) $$;
create function pg_temp.announce(student text) returns jsonb language sql as $$
  select public.announce_exam_results(pg_temp.id('academy'), pg_temp.id('main'), (select scoring_revision from public.exams where id = pg_temp.id('main')),
    jsonb_build_array(jsonb_build_object('annual_student_record_id', pg_temp.id('rec-' || student), 'expected_version', pg_temp.work_version(student))),
    gen_random_uuid()) $$;
create function pg_temp.mark(student text, score text) returns jsonb language sql as $$
  select public.save_exam_marks(pg_temp.id('academy'), pg_temp.id('main'), pg_temp.id('rec-' || student), pg_temp.work_version(student),
    jsonb_build_object('marks', jsonb_build_array(jsonb_build_object('question_id', pg_temp.id('q3'), 'score', score))), gen_random_uuid()) $$;

insert into auth.users(id) select id from rv_ids where name in ('owner','owner-b','s1','s2','s3','s4','s5','suspended','outsider');
insert into public.academies(id, name, slug, icon, subject, created_by) values
  (pg_temp.id('academy'), 'Review A', 'rv-a-' || pg_temp.id('academy'), 'school', 'Math', pg_temp.id('owner')),
  (pg_temp.id('academy-b'), 'Review B', 'rv-b-' || pg_temp.id('academy-b'), 'school', 'Math', pg_temp.id('owner-b'));
insert into public.academy_memberships(academy_id, user_id, role, created_by) values
  (pg_temp.id('academy'), pg_temp.id('owner'), 'owner', pg_temp.id('owner')),
  (pg_temp.id('academy-b'), pg_temp.id('owner-b'), 'owner', pg_temp.id('owner-b'));
insert into rv_ids(name, id) select 'year', id from public.academic_years where academy_id = pg_temp.id('academy');
insert into rv_ids(name, id) select 'year-b', id from public.academic_years where academy_id = pg_temp.id('academy-b');
insert into public.academy_levels(academy_id, level_id, sort_order) values
  (pg_temp.id('academy'), 'preparatory-3', 9), (pg_temp.id('academy'), 'secondary-1', 10), (pg_temp.id('academy-b'), 'preparatory-3', 9);
insert into storage.objects(bucket_id, name) select 'assignment-images', pg_temp.id('academy')::text || '/' || pg_temp.id(x)
from unnest(array['img-prompt','img-choice','img-excl','img-model','img-notes','img-auto']) x;
insert into storage.objects(bucket_id, name) values ('assignment-images', pg_temp.id('academy-b')::text || '/' || pg_temp.id('img-b'));

select pg_temp.act('owner');
insert into rv_ids(name, id) select 'rec-' || s.name,
  (public.create_student_record(pg_temp.id('academy'), pg_temp.id('year'), 'Review ' || s.name, '0107235000' || s.n, '01107235000',
    'preparatory-3', null, null, 'in_person')).id
from (values ('s1', 1), ('s2', 2), ('s3', 3), ('s4', 4), ('s5', 5), ('suspended', 6)) s(name, n);
update public.academy_student_profiles p set user_id = pg_temp.id(substr(x.name, 5)), linked_at = now()
from public.annual_student_records r join pg_temp.rv_ids x on x.id = r.id and x.name like 'rec-%'
where r.academy_student_profile_id = p.id;
update public.academy_student_profiles p set access_suspended_at = now()
from public.annual_student_records r where r.id = pg_temp.id('rec-suspended') and r.academy_student_profile_id = p.id;

-- main: Q1 choice (images in the prompt and the right choice), Q2 choice (image; excluded later),
-- Q3 written work (model answer with an image). Notes carry an image. Manual marking is required.
select public.create_exam(pg_temp.id('academy'), pg_temp.id('year'), pg_temp.id('main'), jsonb_build_object(
  'title', 'Main', 'instructions', 'Main instructions', 'solution_notes', 'SECRET-NOTES ' || pg_temp.token('img-notes'),
  'audience', 'level', 'level_id', 'preparatory-3', 'time_limit_minutes', 30, 'parts', jsonb_build_array(
    jsonb_build_object('title', 'Sheet', 'instructions', 'Choose one', 'kind', 'question_sheet', 'questions', jsonb_build_array(
      jsonb_build_object('prompt', 'SECRET-PROMPT ' || pg_temp.token('img-prompt'), 'max_score', '2', 'choices', jsonb_build_array(
        jsonb_build_object('label', 'SECRET-RIGHT ' || pg_temp.token('img-choice'), 'is_correct', true),
        jsonb_build_object('label', 'SECRET-WRONG'))),
      jsonb_build_object('prompt', 'SECRET-SECOND ' || pg_temp.token('img-excl'), 'max_score', '1', 'choices', jsonb_build_array(
        jsonb_build_object('label', 'Yes', 'is_correct', true), jsonb_build_object('label', 'No'))))),
    jsonb_build_object('title', 'Written', 'kind', 'written_work', 'questions', jsonb_build_array(
      jsonb_build_object('prompt', 'SECRET-WRITTEN', 'model_answer', 'SECRET-MODEL ' || pg_temp.token('img-model'), 'max_score', '2'))))));
-- auto: fully automatic (one choice question), announced by its acceptance.
select public.create_exam(pg_temp.id('academy'), pg_temp.id('year'), pg_temp.id(x), jsonb_build_object(
  'title', 'Exam ' || x, 'audience', 'level', 'level_id', 'preparatory-3', 'time_limit_minutes', 30, 'parts', jsonb_build_array(
    jsonb_build_object('title', 'P', 'kind', 'question_sheet', 'questions', jsonb_build_array(
      jsonb_build_object('prompt', 'SECRET-AUTO ' || pg_temp.token('img-auto'), 'max_score', '1', 'choices', jsonb_build_array(
        jsonb_build_object('label', 'A', 'is_correct', true), jsonb_build_object('label', 'B'))))))))
from unnest(array['auto', 'attached']) x;
select pg_temp.act('owner-b');
select public.create_exam(pg_temp.id('academy-b'), pg_temp.id('year-b'), pg_temp.id('b-exam'), jsonb_build_object(
  'title', 'B', 'audience', 'level', 'level_id', 'preparatory-3', 'time_limit_minutes', 30, 'parts', jsonb_build_array(
    jsonb_build_object('title', 'P', 'kind', 'question_sheet', 'questions', jsonb_build_array(
      jsonb_build_object('prompt', 'B ' || pg_temp.token('img-b'), 'max_score', '1', 'choices', jsonb_build_array(
        jsonb_build_object('label', 'A', 'is_correct', true), jsonb_build_object('label', 'B'))))))));
select pg_temp.act('owner');
update public.exams set opens_at = now() - interval '1 minute', closes_at = now() + interval '1 hour', actual_closes_at = now() + interval '62 minutes'
where id in (pg_temp.id('main'), pg_temp.id('auto'), pg_temp.id('attached'), pg_temp.id('b-exam'));
insert into rv_ids(name, id) select 'q' || n.number, n.id from (
  select q.id, row_number() over (order by p.position, q.position) as number
  from public.exam_questions q join public.exam_parts p on p.id = q.part_id where q.exam_id = pg_temp.id('main')) n;
insert into rv_ids(name, id) select 'q1-right', id from public.exam_choices where question_id = pg_temp.id('q1') and is_correct;
insert into rv_ids(name, id) select 'q1-wrong', id from public.exam_choices where question_id = pg_temp.id('q1') and not is_correct;
insert into rv_ids(name, id) select 'auto-q', id from public.exam_questions where exam_id = pg_temp.id('auto');
insert into rv_ids(name, id) select 'auto-right', id from public.exam_choices where question_id = pg_temp.id('auto-q') and is_correct;
insert into public.content_programs(id, academy_id, academic_year_id, level_id)
values (pg_temp.id('attached'), pg_temp.id('academy'), pg_temp.id('year'), 'preparatory-3');
insert into public.content_units(id, academy_id, program_id, created_by, draft)
values (pg_temp.id('attached'), pg_temp.id('academy'), pg_temp.id('attached'), pg_temp.id('owner'), '{"title":"Unit","description":"","items":[]}');
insert into public.content_assessments(academy_id, unit_id, kind, assessment_id)
values (pg_temp.id('academy'), pg_temp.id('attached'), 'exam', pg_temp.id('attached'));

-- ---------------------------------------------------------------------------------------------
-- Work. s1 submits online (wrong choice, text). s2 saves an online draft, then paper work with a
-- different choice is confirmed first. s3 never starts. s4 has paper work only. s5 starts and stops.
select pg_temp.act('s1');
set local role authenticated;
select public.start_my_exam(pg_temp.id('academy'), pg_temp.id(x)) from unnest(array['main', 'auto']) x;
select pg_temp.act('s2');
select public.start_my_exam(pg_temp.id('academy'), pg_temp.id('main'));
select pg_temp.act('s5');
select public.start_my_exam(pg_temp.id('academy'), pg_temp.id('main'));
reset role;
select pg_temp.act('owner');
select edra_private.save_exam_answers_for(pg_temp.id('main'), pg_temp.id('rec-s1'), 0, jsonb_build_array(
  jsonb_build_object('question_id', pg_temp.id('q1'), 'choice_id', pg_temp.id('q1-wrong')),
  jsonb_build_object('question_id', pg_temp.id('q3'), 'text_answer', 'MY-TEXT')), gen_random_uuid());
select edra_private.submit_exam_attempt_for(pg_temp.id('main'), pg_temp.id('rec-s1'), gen_random_uuid());
select edra_private.save_exam_answers_for(pg_temp.id('auto'), pg_temp.id('rec-s1'), 0, jsonb_build_array(
  jsonb_build_object('question_id', pg_temp.id('auto-q'), 'choice_id', pg_temp.id('auto-right'))), gen_random_uuid());
select edra_private.submit_exam_attempt_for(pg_temp.id('auto'), pg_temp.id('rec-s1'), gen_random_uuid());
select edra_private.save_exam_answers_for(pg_temp.id('main'), pg_temp.id('rec-s2'), 0, jsonb_build_array(
  jsonb_build_object('question_id', pg_temp.id('q1'), 'choice_id', pg_temp.id('q1-right')),
  jsonb_build_object('question_id', pg_temp.id('q3'), 'text_answer', 'LOSING-DRAFT')), gen_random_uuid());
select pg_temp.act('owner');
select public.save_exam_physical_draft(pg_temp.id('academy'), pg_temp.id('main'), pg_temp.id('rec-s2'), 0,
  jsonb_build_array(jsonb_build_object('question_id', pg_temp.id('q1'), 'choice_id', pg_temp.id('q1-wrong'))), gen_random_uuid());
select public.confirm_exam_physical(pg_temp.id('academy'), pg_temp.id('main'), pg_temp.id('rec-s2'), 1, gen_random_uuid());
select public.save_exam_physical_draft(pg_temp.id('academy'), pg_temp.id('main'), pg_temp.id('rec-s4'), 0,
  jsonb_build_array(jsonb_build_object('question_id', pg_temp.id('q1'), 'choice_id', pg_temp.id('q1-right'))), gen_random_uuid());
select public.confirm_exam_physical(pg_temp.id('academy'), pg_temp.id('main'), pg_temp.id('rec-s4'), 1, gen_random_uuid());
select public.exclude_exam_question(pg_temp.id('academy'), pg_temp.id('main'), pg_temp.id('q2'), 1, gen_random_uuid());
-- Physical s2: announced before closure (the first order).
select pg_temp.mark('s2', '1');
select pg_temp.announce('s2');
-- Private mark on s1 without announcement.
select pg_temp.mark('s1', '2');
select pg_temp.check((select superseded_at is not null from public.exam_attempts where exam_id = pg_temp.id('main') and annual_student_record_id = pg_temp.id('rec-s2')),
  'paper work won over the online draft');

-- ---------------------------------------------------------------------------------------------
-- Authority: no review, status or images for unauthorized callers.
select pg_temp.act('s1');
set local role authenticated;
select pg_temp.expect_error(format('select public.get_my_exam_review(%L, %L)', pg_temp.id('academy-b'), pg_temp.id('main')), 'student_link_unavailable');
select pg_temp.expect_error(format('select public.get_my_exam_review(%L, %L)', pg_temp.id('academy'), pg_temp.id('b-exam')), 'not_found');
select pg_temp.expect_error(format('select public.get_my_exam_review(%L, %L)', pg_temp.id('academy'), gen_random_uuid()), 'not_found');
select pg_temp.expect_error(format('select public.get_my_exam_review(%L, %L)', pg_temp.id('academy'), pg_temp.id('attached')), 'not_found');
select pg_temp.expect_error(format('select public.get_my_exam_review(null, %L)', pg_temp.id('main')), 'validation');
select pg_temp.expect_error(format('select public.authorize_my_exam_review_images(%L, %L, array[%L]::uuid[])', pg_temp.id('academy'), pg_temp.id('attached'), pg_temp.id('img-auto')), 'not_found');
select pg_temp.expect_error(format('select public.authorize_my_exam_review_images(%L, %L, array[%L]::uuid[])', pg_temp.id('academy'), pg_temp.id('b-exam'), pg_temp.id('img-b')), 'not_found');
select pg_temp.expect_error(format('select public.authorize_my_exam_review_images(%L, %L, %L::uuid[])', pg_temp.id('academy'), pg_temp.id('main'), '{}'), 'validation');
select pg_temp.expect_error(format('select public.authorize_my_exam_review_images(%L, %L, array(select gen_random_uuid() from generate_series(1, 21)))', pg_temp.id('academy'), pg_temp.id('main')), 'validation');
select pg_temp.expect_error(format('select public.authorize_my_exam_review_images(%L, %L, array[null]::uuid[])', pg_temp.id('academy'), pg_temp.id('main')), 'validation');
select pg_temp.act('outsider');
select pg_temp.expect_error(format('select public.get_my_exam_review(%L, %L)', pg_temp.id('academy'), pg_temp.id('main')), 'student_link_unavailable');
select pg_temp.act('suspended');
select pg_temp.expect_error(format('select public.get_my_exam_review(%L, %L)', pg_temp.id('academy'), pg_temp.id('main')), 'student_link_unavailable');
select pg_temp.expect_error(format('select public.authorize_my_exam_review_images(%L, %L, array[%L]::uuid[])', pg_temp.id('academy'), pg_temp.id('main'), pg_temp.id('img-prompt')), 'student_link_unavailable');
select pg_temp.act('owner');
select pg_temp.expect_error(format('select public.get_my_exam_review(%L, %L)', pg_temp.id('academy'), pg_temp.id('main')), 'student_link_unavailable');
reset role;
select set_config('request.jwt.claim.sub', '', true);
set local role authenticated;
select pg_temp.expect_error(format('select public.get_my_exam_review(%L, %L)', pg_temp.id('academy'), pg_temp.id('main')), 'forbidden');
reset role;
do $$
declare session_id uuid := gen_random_uuid();
begin
  insert into auth.sessions(id, user_id, created_at, updated_at) values (session_id, pg_temp.id('s1'), now(), now());
  perform set_config('edra.verified_session', '', true);
  perform set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'sub', pg_temp.id('s1'), 'session_id', session_id,
    'amr', jsonb_build_array(jsonb_build_object('method', 'recovery')))::text, true);
  perform pg_temp.act('s1');
  perform pg_temp.expect_error(format('select public.get_my_exam_review(%L, %L)', pg_temp.id('academy'), pg_temp.id('main')), 'student_link_unavailable');
  perform set_config('request.jwt.claims', '', true);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Before actual closure: status reasons only, even with an official total or an announced paper result.
set local role authenticated;
do $$
declare doc jsonb;
begin
  doc := pg_temp.review('s1', 'auto');
  perform pg_temp.check(doc->>'status' = 'unavailable' and doc->>'reason' = 'awaiting_closure' and doc->>'account_id' = pg_temp.id('s1')::text,
    'automatic result before closure: review locked');
  perform pg_temp.check(pg_temp.no_material(doc) and pg_temp.no_marks(doc), 'locked review carries no material');
  perform pg_temp.check(public.get_my_exam_overview(pg_temp.id('academy'), pg_temp.id('auto'))->'result'->>'total' = '1.00',
    'the automatic official total is already visible');
  doc := pg_temp.review('s1', 'main');
  perform pg_temp.check(doc->>'status' = 'unavailable' and doc->>'reason' = 'awaiting_closure' and pg_temp.no_material(doc), 'online before closure');
  perform pg_temp.check(public.get_my_exam_overview(pg_temp.id('academy'), pg_temp.id('main'))->'result' = 'null'::jsonb,
    'private marks are not a result');
  perform pg_temp.check(public.get_my_exam(pg_temp.id('main'))->'parts' = '[]'::jsonb, 'legacy read stays locked');
  perform pg_temp.check(pg_temp.images('main', array['img-prompt'])->>'status' = 'unavailable', 'no images before qualification');
  doc := pg_temp.review('s2', 'main');
  perform pg_temp.check(doc->>'status' = 'unavailable' and doc->>'reason' = 'awaiting_closure' and pg_temp.no_material(doc),
    'announced paper work before closure');
  perform pg_temp.check(public.get_my_exam_overview(pg_temp.id('academy'), pg_temp.id('main'))->'result'->>'total' = '1.00', 'paper total is visible');
  doc := pg_temp.review('s3', 'main');
  perform pg_temp.check(doc->>'status' = 'unavailable' and doc->>'reason' = 'not_submitted' and pg_temp.no_material(doc), 'never started');
  doc := pg_temp.review('s5', 'main');
  perform pg_temp.check(doc->>'status' = 'unavailable' and doc->>'reason' = 'not_submitted' and pg_temp.no_material(doc), 'running draft only');
  doc := pg_temp.review('s4', 'main');
  perform pg_temp.check(doc->>'status' = 'unavailable' and doc->>'reason' = 'awaiting_closure', 'paper work, not announced, not closed');
end $$;
reset role;

-- Scheduled close alone (headroom) does not qualify.
update public.exams set opens_at = now() - interval '2 hours', closes_at = now() - interval '1 minute', actual_closes_at = now() + interval '1 minute'
where id = pg_temp.id('main');
set local role authenticated;
select pg_temp.check(pg_temp.review('s1', 'main')->>'reason' = 'awaiting_closure', 'headroom does not qualify');
reset role;

-- ---------------------------------------------------------------------------------------------
-- Actual closure. The review read itself settles s5's running attempt (window_closed) and commits.
update public.exams set opens_at = now() - interval '3 hours', closes_at = now() - interval '1 hour', actual_closes_at = now() - interval '58 minutes'
where id in (pg_temp.id('main'), pg_temp.id('auto'));
create temporary table rv_counts as select
  (select count(*) from public.exam_attempts) as attempts, (select count(*) from public.exam_editor_claims) as claims,
  (select count(*) from public.exam_departures) as departures, (select count(*) from public.exam_result_publications) as publications;
set local role authenticated;
do $$
declare doc jsonb;
  q jsonb;
begin
  doc := pg_temp.review('s5', 'main');
  perform pg_temp.check(doc->>'status' = 'available' and doc->>'source' = 'online', 'window_closed work qualifies at closure');
  perform pg_temp.check(pg_temp.question(doc, 'q1')->'answer' = '{"state": "blank"}'::jsonb
    and pg_temp.question(doc, 'q3')->'answer' = '{"state": "blank"}'::jsonb, 'unanswered online work is blank');
  perform pg_temp.check(public.get_my_exam_overview(pg_temp.id('academy'), pg_temp.id('main'))->'submission'->>'reason' = 'window_closed', 'settled by the read');

  -- Online, manual marking incomplete and unannounced: qualifies independently of the result.
  doc := pg_temp.review('s1', 'main');
  perform pg_temp.check(doc->>'status' = 'available' and doc->>'notes' like 'SECRET-NOTES%', 'online qualifies at actual closure');
  perform pg_temp.check(jsonb_array_length(doc->'parts') = 2 and jsonb_array_length(doc->'parts'->0->'questions') = 2
    and doc->'parts'->0->>'title' = 'Sheet' and doc->'parts'->1->>'kind' = 'written_work', 'parts in authored order');
  q := pg_temp.question(doc, 'q1');
  perform pg_temp.check((q->>'number')::integer = 1 and q->'answer' = jsonb_build_object('state', 'choice', 'choice_id', pg_temp.id('q1-wrong'))
    and q->>'correct_choice_id' = pg_temp.id('q1-right')::text and jsonb_array_length(q->'choices') = 2, 'accepted choice beside the key');
  q := pg_temp.question(doc, 'q2');
  perform pg_temp.check((q->>'number')::integer = 2 and q->>'excluded' = 'true' and q->'answer' = '{"state": "blank"}'::jsonb,
    'excluded question kept with its original number');
  q := pg_temp.question(doc, 'q3');
  perform pg_temp.check((q->>'number')::integer = 3 and q->'answer' = '{"state": "text", "text": "MY-TEXT"}'::jsonb
    and q->>'model_answer' like 'SECRET-MODEL%' and q->'correct_choice_id' = 'null'::jsonb, 'accepted text beside the model answer');
  perform pg_temp.check(pg_temp.no_marks(doc), 'no maxima, marks, items, feedback or revisions');
  perform pg_temp.check(public.get_my_exam_overview(pg_temp.id('academy'), pg_temp.id('main'))->'result' = 'null'::jsonb,
    'qualification does not publish the private mark');

  -- Paper work announced first, closed second: the accepted paper answers, never the losing online draft.
  doc := pg_temp.review('s2', 'main');
  perform pg_temp.check(doc->>'status' = 'available' and doc->>'source' = 'physical', 'announcement then closure');
  perform pg_temp.check(pg_temp.question(doc, 'q1')->'answer' = jsonb_build_object('state', 'choice', 'choice_id', pg_temp.id('q1-wrong')),
    'paper choice, not the online draft');
  perform pg_temp.check(pg_temp.question(doc, 'q3')->'answer' = '{"state": "paper_work"}'::jsonb, 'paper written work is not blank');
  perform pg_temp.check(pg_temp.no_marks(doc), 'losing draft and marks never appear');
  -- Legacy direct RPC: qualified, but no maxima, departures or losing draft.
  doc := public.get_my_exam(pg_temp.id('main'));
  perform pg_temp.check(jsonb_array_length(doc->'parts') = 2 and doc->'attempt'->'answers' = '[]'::jsonb
    and doc->'attempt'->'departures' = '[]'::jsonb, 'legacy qualified projection drops the losing draft');
  perform pg_temp.check(not jsonb_path_exists(doc, '$.**.max_score') and doc::text not like '%LOSING-%'
    and not (doc->'result' ? 'items'), 'legacy projection allowlist');

  -- Paper work closed but not yet announced: locked.
  doc := pg_temp.review('s4', 'main');
  perform pg_temp.check(doc->>'status' = 'unavailable' and doc->>'reason' = 'awaiting_result' and pg_temp.no_material(doc), 'closure alone is not enough for paper');
  perform pg_temp.check(pg_temp.images('main', array['img-prompt'])->>'status' = 'unavailable', 'paper images wait for the result');

  -- A never-started student has nothing discoverable once the exam closed.
  perform pg_temp.act('s3');
  perform pg_temp.expect_error(format('select public.get_my_exam_review(%L, %L)', pg_temp.id('academy'), pg_temp.id('main')), 'not_found');
  perform pg_temp.expect_error(format('select public.authorize_my_exam_review_images(%L, %L, array[%L]::uuid[])',
    pg_temp.id('academy'), pg_temp.id('main'), pg_temp.id('img-prompt')), 'not_found');

  -- Legacy online projection: frozen accepted answers.
  perform pg_temp.act('s1');
  doc := public.get_my_exam(pg_temp.id('main'));
  perform pg_temp.check(jsonb_array_length(doc->'attempt'->'answers') = 2 and not jsonb_path_exists(doc, '$.**.max_score'), 'legacy online answers');
end $$;
reset role;

-- Repeated reads have no side effects: no attempts, claims, departures or publications.
set local role authenticated;
select pg_temp.review('s1', 'main') from generate_series(1, 3);
select pg_temp.review('s4', 'main') from generate_series(1, 3);
reset role;
select pg_temp.check((select attempts = (select count(*) from public.exam_attempts) and claims = (select count(*) from public.exam_editor_claims)
  and departures = (select count(*) from public.exam_departures) and publications = (select count(*) from public.exam_result_publications)
  from rv_counts), 'review reads change nothing');
select pg_temp.check(not exists (select 1 from public.exam_attempts where exam_id = pg_temp.id('main') and annual_student_record_id = pg_temp.id('rec-s3')),
  'no attempt for a never-started reader');

-- ---------------------------------------------------------------------------------------------
-- Images: only ids referenced by the qualified review document; no editor token.
select pg_temp.act('s1');
set local role authenticated;
do $$
declare doc jsonb := pg_temp.images('main', array['img-prompt','img-choice','img-excl','img-model','img-notes','img-auto','img-b']);
begin
  perform pg_temp.check(doc->>'status' = 'ok' and doc->>'academy_id' = pg_temp.id('academy')::text, 'qualified images authorized');
  perform pg_temp.check(pg_temp.image_set(doc) = (select array_agg(pg_temp.id(x) order by pg_temp.id(x))
    from unnest(array['img-prompt','img-choice','img-excl','img-model','img-notes']) x), 'exactly the review document images');
  perform pg_temp.check(pg_temp.image_set(pg_temp.images('main', array['img-b'])) = '{}', 'another academy image is never authorized');
  perform pg_temp.check(pg_temp.image_set(pg_temp.images('auto', array['img-prompt', 'img-auto'])) = array[pg_temp.id('img-auto')],
    'another exam image is never authorized');
end $$;
reset role;

-- Paper work closed first, announced second: qualifies, without any online attempt.
select pg_temp.act('owner');
select pg_temp.mark('s4', '2');
select pg_temp.announce('s4');
set local role authenticated;
do $$
declare doc jsonb := pg_temp.review('s4', 'main');
begin
  perform pg_temp.check(doc->>'status' = 'available' and pg_temp.question(doc, 'q1')->'answer'
    = jsonb_build_object('state', 'choice', 'choice_id', pg_temp.id('q1-right')), 'closure then announcement');
  perform pg_temp.check(pg_temp.question(doc, 'q2')->'answer' = '{"state": "blank"}'::jsonb
    and pg_temp.question(doc, 'q3')->'answer' = '{"state": "paper_work"}'::jsonb, 'untranscribed paper work');
  perform pg_temp.check(pg_temp.images('main', array['img-model'])->>'status' = 'ok', 'paper review images without an editor');
end $$;
reset role;
select pg_temp.check(not exists (select 1 from public.exam_attempts where exam_id = pg_temp.id('main') and annual_student_record_id = pg_temp.id('rec-s4')),
  'paper review needs no online attempt');

-- ---------------------------------------------------------------------------------------------
-- Results: announced corrections update the total; unannounced changes stay private. Review keys
-- follow the current released key; the review never carries totals or revisions.
select pg_temp.act('owner');
select pg_temp.announce('s1');
select pg_temp.act('s1');
set local role authenticated;
select set_config('rv.total', public.get_my_exam_overview(pg_temp.id('academy'), pg_temp.id('main'))->'result'->>'total', true);
reset role;
select pg_temp.act('owner');
select pg_temp.mark('s1', '1');
select pg_temp.act('s1');
set local role authenticated;
select pg_temp.check(public.get_my_exam_overview(pg_temp.id('academy'), pg_temp.id('main'))->'result'->>'total' = current_setting('rv.total')
  and public.get_my_exam_overview(pg_temp.id('academy'), pg_temp.id('main'))->'result'->>'corrected' = 'false', 'unannounced change stays private');
reset role;
select pg_temp.act('owner');
select public.correct_exam_key(pg_temp.id('academy'), pg_temp.id('main'), pg_temp.id('q1'), pg_temp.id('q1-wrong'),
  (select scoring_revision from public.exams where id = pg_temp.id('main')), gen_random_uuid());
select pg_temp.announce('s1');
select pg_temp.act('s1');
set local role authenticated;
do $$
declare overview jsonb := public.get_my_exam_overview(pg_temp.id('academy'), pg_temp.id('main'));
  doc jsonb := pg_temp.review('s1', 'main');
begin
  perform pg_temp.check(overview->'result'->>'corrected' = 'true' and overview->'result'->>'corrected_at' is not null
    and overview->'result'->>'total' <> current_setting('rv.total'), 'announced correction updates the official total');
  perform pg_temp.check(pg_temp.question(doc, 'q1')->>'correct_choice_id' = pg_temp.id('q1-wrong')::text
    and pg_temp.question(doc, 'q1')->'answer' = jsonb_build_object('state', 'choice', 'choice_id', pg_temp.id('q1-wrong')), 'current key, frozen answer');
  perform pg_temp.check(pg_temp.no_marks(doc), 'no revision history in review');
  -- Staff-only RLS: students never read publications, submissions or work rows directly.
  perform pg_temp.check(not exists (select 1 from public.exam_result_publications) and not exists (select 1 from public.exam_submissions)
    and not exists (select 1 from public.exam_work), 'no direct student table reads');
end $$;
reset role;

-- History after a placement move stays reviewable.
update public.annual_student_records set level_id = 'secondary-1' where id = pg_temp.id('rec-s1');
select pg_temp.act('s1');
set local role authenticated;
select pg_temp.check(pg_temp.review('s1', 'main')->>'status' = 'available', 'moved student keeps own review');
reset role;

-- Year closure: the open-year resolver no longer resolves; nothing is disclosed.
update public.academic_years set closed_at = now() where id = pg_temp.id('year');
select pg_temp.act('s1');
set local role authenticated;
select pg_temp.expect_error(format('select public.get_my_exam_review(%L, %L)', pg_temp.id('academy'), pg_temp.id('main')), 'student_link_unavailable');
select pg_temp.expect_error(format('select public.authorize_my_exam_review_images(%L, %L, array[%L]::uuid[])', pg_temp.id('academy'), pg_temp.id('main'), pg_temp.id('img-prompt')), 'student_link_unavailable');
reset role;

rollback;
