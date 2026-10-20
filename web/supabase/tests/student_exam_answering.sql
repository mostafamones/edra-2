-- EDRA-233: student exam answering. Grants, connected-account authority (two students, a second
-- academy, suspension, unconnected, recovery and anonymous callers), claim-aware entry without
-- material, single-editor claims (busy, same-token recovery, expiry and generations), fencing of
-- stale editors on read/save/submit/departure/images, retired direct-RPC paths, receipt replays that
-- never re-expose material, batch/text/exclusion limits, authorized question images and terminal
-- outcomes (explicit submission, timer, kick, physical confirmation, closed year). Run with
-- `npm run test:db -- student_exam_answering`. Everything runs in one transaction that is rolled back.

do $$ begin
  if not has_function_privilege('authenticated', 'public.enter_my_exam(uuid, uuid, text)', 'execute')
    or not has_function_privilege('authenticated', 'public.claim_my_exam_editor(uuid, uuid, text)', 'execute')
    or not has_function_privilege('authenticated', 'public.renew_my_exam_editor(uuid, uuid, text)', 'execute')
    or not has_function_privilege('authenticated', 'public.release_my_exam_editor(uuid, uuid, text)', 'execute')
    or not has_function_privilege('authenticated', 'public.get_my_exam_answering(uuid, uuid, text)', 'execute')
    or not has_function_privilege('authenticated', 'public.save_my_exam_answers(uuid, uuid, text, integer, jsonb, uuid, integer)', 'execute')
    or not has_function_privilege('authenticated', 'public.submit_my_exam(uuid, uuid, text, integer, uuid, integer)', 'execute')
    or not has_function_privilege('authenticated', 'public.record_my_exam_departure(uuid, uuid, text, uuid, uuid, integer)', 'execute')
    or not has_function_privilege('authenticated', 'public.authorize_my_exam_images(uuid, uuid, text, uuid[])', 'execute')
    or has_function_privilege('anon', 'public.enter_my_exam(uuid, uuid, text)', 'execute')
    or has_function_privilege('anon', 'public.save_my_exam_answers(uuid, uuid, text, integer, jsonb, uuid, integer)', 'execute')
    or has_function_privilege('anon', 'public.authorize_my_exam_images(uuid, uuid, text, uuid[])', 'execute')
    -- Unfenced student mutations are retired for every client role.
    or has_function_privilege('authenticated', 'public.save_exam_answers(uuid, integer, jsonb, uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.submit_exam_attempt(uuid, uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.record_exam_departure(uuid, uuid, uuid)', 'execute')
    or has_function_privilege('anon', 'public.save_exam_answers(uuid, integer, jsonb, uuid)', 'execute')
    or has_function_privilege('authenticated', 'edra_private.claim_exam_editor_for(uuid, uuid, text)', 'execute')
    or has_function_privilege('authenticated', 'edra_private.save_my_exam_answers_for(uuid, uuid, text, integer, jsonb, uuid, integer)', 'execute')
    or has_function_privilege('authenticated', 'edra_private.exam_answering_json(uuid, uuid)', 'execute')
    or has_function_privilege('authenticated', 'edra_private.authorize_my_exam_images_for(uuid, uuid, text, uuid[])', 'execute')
    or has_function_privilege('authenticated', 'edra_private.exam_editor_state(uuid, text)', 'execute')
    or has_table_privilege('authenticated', 'public.exam_editor_claims', 'select')
    or has_table_privilege('authenticated', 'public.exam_editor_claims', 'update')
    or has_table_privilege('anon', 'public.exam_editor_claims', 'select') then
    raise exception 'Student exam answering grants are wrong';
  end if;
end $$;

begin;
create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'Answering check failed: %', label; end if; end $$;
create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$
begin
  execute statement;
  raise exception 'Expected rejection: % (%)', expected, statement using errcode = 'XX001';
exception when sqlstate 'XX001' then raise;
  when others then if sqlerrm not like expected then raise exception 'Expected %, got %: %', expected, sqlerrm, statement; end if;
end $$;

create temporary table sa_ids(name text primary key, id uuid not null default gen_random_uuid());
insert into sa_ids(name) values ('owner'),('owner-b'),('s1'),('s2'),('s3'),('s4'),('suspended'),('outsider'),('academy'),('academy-b'),
  ('main'),('other'),('attached'),('b-open'),('img-prompt'),('img-choice'),('img-excl'),('img-other'),('img-b');
grant select on pg_temp.sa_ids to authenticated;
create function pg_temp.id(label text) returns uuid language sql as $$ select id from pg_temp.sa_ids where name = label $$;
create function pg_temp.act(label text) returns void language sql as $$ select set_config('request.jwt.claim.sub', pg_temp.id(label)::text, true) $$;
-- Tokens and keys survive role switches as transaction-local settings.
create function pg_temp.put(name text, value text) returns text language sql as $$ select set_config('sa.' || name, coalesce(value, ''), true) $$;
create function pg_temp.got(name text) returns text language sql as $$ select nullif(current_setting('sa.' || name, true), '') $$;
create function pg_temp.no_material(doc jsonb) returns boolean language sql as $$
  select not jsonb_path_exists(doc, '$.**.prompt') and not jsonb_path_exists(doc, '$.**.choices')
    and not jsonb_path_exists(doc, '$.**.questions') and not jsonb_path_exists(doc, '$.**.parts')
    and not jsonb_path_exists(doc, '$.**.answers') and not jsonb_path_exists(doc, '$.**.departures')
    and not jsonb_path_exists(doc, '$.**.text_answer') and not jsonb_path_exists(doc, '$.**.choice_id')
    and not jsonb_path_exists(doc, '$.**.model_answer') and not jsonb_path_exists(doc, '$.**.correct_choice_id')
    and not jsonb_path_exists(doc, '$.**.solutions') and not jsonb_path_exists(doc, '$.**.annual_student_record_id')
    and doc::text not like '%SECRET-%' and doc::text not like '%{{image:%' $$;
create function pg_temp.save(exam text, token text, version integer, answers jsonb, command uuid) returns jsonb language sql as $$
  select public.save_my_exam_answers(pg_temp.id('academy'), pg_temp.id(exam), token, version, answers, command, case when token = pg_temp.got('t3') then 3 when token = pg_temp.got('t2') then 2 else 1 end) $$;
create function pg_temp.choice(question text, choice text) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('question_id', pg_temp.id(question), 'choice_id', pg_temp.id(choice))) $$;

insert into auth.users(id) select id from sa_ids where name in ('owner','owner-b','s1','s2','s3','s4','suspended','outsider');
insert into public.academies(id, name, slug, icon, subject, created_by) values
  (pg_temp.id('academy'), 'Answering A', 'sa-a-' || pg_temp.id('academy'), 'school', 'Math', pg_temp.id('owner')),
  (pg_temp.id('academy-b'), 'Answering B', 'sa-b-' || pg_temp.id('academy-b'), 'school', 'Math', pg_temp.id('owner-b'));
insert into public.academy_memberships(academy_id, user_id, role, created_by) values
  (pg_temp.id('academy'), pg_temp.id('owner'), 'owner', pg_temp.id('owner')),
  (pg_temp.id('academy-b'), pg_temp.id('owner-b'), 'owner', pg_temp.id('owner-b'));
insert into sa_ids(name, id) select 'year', id from public.academic_years where academy_id = pg_temp.id('academy');
insert into sa_ids(name, id) select 'year-b', id from public.academic_years where academy_id = pg_temp.id('academy-b');
insert into public.academy_levels(academy_id, level_id, sort_order) values
  (pg_temp.id('academy'), 'preparatory-3', 9), (pg_temp.id('academy-b'), 'preparatory-3', 9);
insert into storage.objects(bucket_id, name) select 'assignment-images', pg_temp.id('academy')::text || '/' || pg_temp.id(x)
from unnest(array['img-prompt','img-choice','img-excl','img-other']) x;
insert into storage.objects(bucket_id, name) values ('assignment-images', pg_temp.id('academy-b')::text || '/' || pg_temp.id('img-b'));

select pg_temp.act('owner');
insert into sa_ids(name, id) select 'rec-' || s.name,
  (public.create_student_record(pg_temp.id('academy'), pg_temp.id('year'), 'Answering ' || s.name, '0107233000' || s.n, '01107233000',
    'preparatory-3', null, null, 'in_person')).id
from (values ('s1', 1), ('s2', 2), ('s3', 3), ('s4', 4), ('suspended', 5)) s(name, n);
update public.academy_student_profiles p set user_id = pg_temp.id(substr(x.name, 5)), linked_at = now()
from public.annual_student_records r join pg_temp.sa_ids x on x.id = r.id and x.name like 'rec-%'
where r.academy_student_profile_id = p.id;
update public.academy_student_profiles p set access_suspended_at = now()
from public.annual_student_records r where r.id = pg_temp.id('rec-suspended') and r.academy_student_profile_id = p.id;

-- main: Q1 (choice, images in the prompt and the right choice), Q2 (choice, image; excluded later),
-- Q3 (written work). other: another exam of the same academy with its own image.
select public.create_exam(pg_temp.id('academy'), pg_temp.id('year'), pg_temp.id('main'), jsonb_build_object(
  'title', 'Main', 'instructions', 'Main instructions', 'solution_notes', 'SECRET-NOTES', 'audience', 'level', 'level_id', 'preparatory-3',
  'time_limit_minutes', 30, 'parts', jsonb_build_array(
    jsonb_build_object('title', 'Sheet', 'instructions', 'Choose one', 'kind', 'question_sheet', 'questions', jsonb_build_array(
      jsonb_build_object('prompt', 'SECRET-PROMPT {{image:' || pg_temp.id('img-prompt') || '}}', 'max_score', '2', 'choices', jsonb_build_array(
        jsonb_build_object('label', 'SECRET-RIGHT {{image:' || pg_temp.id('img-choice') || '}}', 'is_correct', true),
        jsonb_build_object('label', 'SECRET-WRONG'))),
      jsonb_build_object('prompt', 'SECRET-SECOND {{image:' || pg_temp.id('img-excl') || '}}', 'max_score', '1', 'choices', jsonb_build_array(
        jsonb_build_object('label', 'Yes', 'is_correct', true), jsonb_build_object('label', 'No'))))),
    jsonb_build_object('title', 'Written', 'kind', 'written_work', 'questions', jsonb_build_array(
      jsonb_build_object('prompt', 'SECRET-WRITTEN', 'model_answer', 'SECRET-MODEL', 'max_score', '2'))))));
select public.create_exam(pg_temp.id('academy'), pg_temp.id('year'), pg_temp.id(x), jsonb_build_object(
  'title', 'Exam ' || x, 'audience', 'level', 'level_id', 'preparatory-3', 'time_limit_minutes', 30, 'parts', jsonb_build_array(
    jsonb_build_object('title', 'P', 'kind', 'question_sheet', 'questions', jsonb_build_array(
      jsonb_build_object('prompt', 'Other {{image:' || pg_temp.id('img-other') || '}}', 'max_score', '1', 'choices', jsonb_build_array(
        jsonb_build_object('label', 'A', 'is_correct', true), jsonb_build_object('label', 'B'))))))))
from unnest(array['other', 'attached']) x;
select pg_temp.act('owner-b');
select public.create_exam(pg_temp.id('academy-b'), pg_temp.id('year-b'), pg_temp.id('b-open'), jsonb_build_object(
  'title', 'B', 'audience', 'level', 'level_id', 'preparatory-3', 'time_limit_minutes', 30, 'parts', jsonb_build_array(
    jsonb_build_object('title', 'P', 'kind', 'question_sheet', 'questions', jsonb_build_array(
      jsonb_build_object('prompt', 'B {{image:' || pg_temp.id('img-b') || '}}', 'max_score', '1', 'choices', jsonb_build_array(
        jsonb_build_object('label', 'A', 'is_correct', true), jsonb_build_object('label', 'B'))))))));
select pg_temp.act('owner');
update public.exams set opens_at = now() - interval '1 minute', closes_at = now() + interval '1 hour', actual_closes_at = now() + interval '62 minutes'
where id in (pg_temp.id('main'), pg_temp.id('other'), pg_temp.id('attached'), pg_temp.id('b-open'));
insert into sa_ids(name, id) select 'q' || n.number, n.id from (
  select q.id, row_number() over (order by p.position, q.position) as number
  from public.exam_questions q join public.exam_parts p on p.id = q.part_id where q.exam_id = pg_temp.id('main')) n;
insert into sa_ids(name, id) select 'q1-right', id from public.exam_choices where question_id = pg_temp.id('q1') and is_correct;
insert into sa_ids(name, id) select 'q1-wrong', id from public.exam_choices where question_id = pg_temp.id('q1') and not is_correct;
insert into sa_ids(name, id) select 'q2-yes', id from public.exam_choices where question_id = pg_temp.id('q2') and is_correct;
insert into sa_ids(name, id) select 'q2-no', id from public.exam_choices where question_id = pg_temp.id('q2') and not is_correct;
insert into public.content_programs(id, academy_id, academic_year_id, level_id)
values (pg_temp.id('attached'), pg_temp.id('academy'), pg_temp.id('year'), 'preparatory-3');
insert into public.content_units(id, academy_id, program_id, created_by, draft)
values (pg_temp.id('attached'), pg_temp.id('academy'), pg_temp.id('attached'), pg_temp.id('owner'), '{"title":"Unit","description":"","items":[]}');
insert into public.content_assessments(academy_id, unit_id, kind, assessment_id)
values (pg_temp.id('academy'), pg_temp.id('attached'), 'exam', pg_temp.id('attached'));

-- ---------------------------------------------------------------------------------------------
-- Authority: no state, tokens or writes for unauthorized callers.
select pg_temp.act('s1');
set local role authenticated;
select pg_temp.expect_error(format('select public.enter_my_exam(%L, %L, null)', pg_temp.id('academy-b'), pg_temp.id('main')), 'not_found');
select pg_temp.expect_error(format('select public.enter_my_exam(%L, %L, null)', pg_temp.id('academy'), pg_temp.id('b-open')), 'not_found');
select pg_temp.expect_error(format('select public.enter_my_exam(%L, %L, null)', pg_temp.id('academy'), pg_temp.id('attached')), 'content_unavailable');
select pg_temp.expect_error(format('select public.authorize_my_exam_images(%L, %L, null, array[%L]::uuid[])', pg_temp.id('academy'), pg_temp.id('attached'), pg_temp.id('img-other')), 'content_unavailable');
-- Pre-start: nothing to read, claim or authorize.
select pg_temp.expect_error(format('select public.get_my_exam_answering(%L, %L, null)', pg_temp.id('academy'), pg_temp.id('main')), 'not_open');
select pg_temp.expect_error(format('select public.claim_my_exam_editor(%L, %L, null)', pg_temp.id('academy'), pg_temp.id('main')), 'not_open');
select pg_temp.expect_error(format('select public.authorize_my_exam_images(%L, %L, null, array[%L]::uuid[])', pg_temp.id('academy'), pg_temp.id('main'), pg_temp.id('img-prompt')), 'not_open');
select pg_temp.act('outsider');
select pg_temp.expect_error(format('select public.enter_my_exam(%L, %L, null)', pg_temp.id('academy'), pg_temp.id('main')), 'student_link_unavailable');
select pg_temp.act('suspended');
select pg_temp.expect_error(format('select public.enter_my_exam(%L, %L, null)', pg_temp.id('academy'), pg_temp.id('main')), 'student_link_unavailable');
select pg_temp.act('owner');
select pg_temp.expect_error(format('select public.enter_my_exam(%L, %L, null)', pg_temp.id('academy'), pg_temp.id('main')), 'student_link_unavailable');
reset role;
select set_config('request.jwt.claim.sub', '', true);
set local role authenticated;
select pg_temp.expect_error(format('select public.enter_my_exam(%L, %L, null)', pg_temp.id('academy'), pg_temp.id('main')), 'forbidden');
reset role;
do $$
declare session_id uuid := gen_random_uuid();
begin
  insert into auth.sessions(id, user_id, created_at, updated_at) values (session_id, pg_temp.id('s1'), now(), now());
  perform set_config('edra.verified_session', '', true);
  perform set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'sub', pg_temp.id('s1'), 'session_id', session_id,
    'amr', jsonb_build_array(jsonb_build_object('method', 'recovery')))::text, true);
  perform pg_temp.act('s1');
  perform pg_temp.expect_error(format('select public.enter_my_exam(%L, %L, null)', pg_temp.id('academy'), pg_temp.id('main')), 'student_link_unavailable');
  perform set_config('request.jwt.claims', '', true);
end $$;
select pg_temp.check(not exists (select 1 from public.exam_attempts where exam_id = pg_temp.id('main')), 'refused entries start nothing');

-- ---------------------------------------------------------------------------------------------
-- Entry: start and claim in one step, attempt metadata only.
select pg_temp.act('s1');
set local role authenticated;
do $$
declare entry jsonb := public.enter_my_exam(pg_temp.id('academy'), pg_temp.id('main'), null);
  again jsonb;
begin
  perform pg_temp.check(entry->>'active' = 'true' and entry->'editor'->>'status' = 'claimed'
    and entry->'editor'->>'token' ~ '^[0-9a-f]{64}$' and entry->'editor'->>'generation' = '1'
    and entry->'editor'->>'heartbeat_seconds' = '10' and entry->'editor'->>'lease_seconds' = '45', 'entry claims the editor');
  perform pg_temp.check(entry->'attempt'->>'id' is not null and entry->'attempt'->>'answers_version' = '0'
    and entry->'attempt'->>'departure_count' = '0', 'entry acknowledges the attempt');
  perform pg_temp.check(pg_temp.no_material(entry), 'entry carries no material');
  perform pg_temp.put('t1', entry->'editor'->>'token');
  perform pg_temp.put('deadline', entry->'attempt'->>'deadline_at');
  -- A second tab/device: busy, no token, no material, the same attempt.
  again := public.enter_my_exam(pg_temp.id('academy'), pg_temp.id('main'), null);
  perform pg_temp.check(again->>'active' = 'true' and again->'editor'->>'status' = 'busy' and not (again->'editor' ? 'token')
    and (again->'editor'->>'retry_after')::integer between 1 and 45, 'second editor is busy');
  perform pg_temp.check(pg_temp.no_material(again) and again->'attempt'->>'deadline_at' = pg_temp.got('deadline'), 'busy entry keeps the original attempt');
  again := public.claim_my_exam_editor(pg_temp.id('academy'), pg_temp.id('main'), repeat('a', 64));
  perform pg_temp.check(again->>'status' = 'busy', 'a guessed token cannot take over');
  -- Same-document recovery: the current live token renews in place.
  again := public.enter_my_exam(pg_temp.id('academy'), pg_temp.id('main'), pg_temp.got('t1'));
  perform pg_temp.check(again->'editor'->>'status' = 'claimed' and again->'editor'->>'token' = pg_temp.got('t1')
    and again->'editor'->>'generation' = '1' and again->'attempt'->>'deadline_at' = pg_temp.got('deadline'), 'refresh recovery keeps the claim and deadline');
end $$;
reset role;
select pg_temp.check((select count(*) from public.exam_attempts where exam_id = pg_temp.id('main')) = 1, 'one attempt after repeated entries');
select pg_temp.check((select token_hash <> pg_temp.got('t1') and generation = 1 from public.exam_editor_claims c
  join public.exam_attempts a on a.id = c.attempt_id where a.exam_id = pg_temp.id('main')), 'only the token hash is stored');

-- Direct RPC cannot bypass the fence.
select pg_temp.act('s1');
set local role authenticated;
select pg_temp.check(public.get_my_exam(pg_temp.id('main'))->'parts' = '[]'::jsonb
  and public.get_my_exam(pg_temp.id('main'))->'attempt'->'answers' = '[]'::jsonb, 'legacy read hides material during the attempt');
select pg_temp.check(public.start_my_exam(pg_temp.id('academy'), pg_temp.id('main'))->'parts' = '[]'::jsonb, 'legacy start hides material');
select pg_temp.check(public.start_exam_attempt(pg_temp.id('main'))->'parts' = '[]'::jsonb, 'legacy unscoped start hides material');
select pg_temp.expect_error(format('select public.save_exam_answers(%L, 0, %L::jsonb, gen_random_uuid())', pg_temp.id('main'), pg_temp.choice('q1', 'q1-wrong')), '%permission denied%');
select pg_temp.expect_error(format('select public.submit_exam_attempt(%L, gen_random_uuid())', pg_temp.id('main')), '%permission denied%');
select pg_temp.expect_error(format('select public.record_exam_departure(%L, gen_random_uuid(), %L)', pg_temp.id('main'), pg_temp.id('q1')), '%permission denied%');
select pg_temp.expect_error('select count(*) from public.exam_editor_claims', '%permission denied%');

-- The fenced read: material for the current editor only.
do $$
declare doc jsonb := public.get_my_exam_answering(pg_temp.id('academy'), pg_temp.id('main'), pg_temp.got('t1'));
begin
  perform pg_temp.check(doc->>'status' = 'state' and doc->'state'->>'account_id' = pg_temp.id('s1')::text, 'current editor reads');
  perform pg_temp.check(jsonb_array_length(doc->'state'->'parts') = 2 and doc->'state'->'parts'->0->'questions'->1->>'number' = '2'
    and doc->'state'->'parts'->1->'questions'->0->>'number' = '3' and doc::text like '%{{image:%', 'ordered material with original numbers');
  perform pg_temp.check(not jsonb_path_exists(doc, '$.**.is_correct') and not jsonb_path_exists(doc, '$.**.correct_choice_id')
    and not jsonb_path_exists(doc, '$.**.model_answer') and not jsonb_path_exists(doc, '$.**.max_score')
    and doc::text not like '%SECRET-MODEL%' and doc::text not like '%SECRET-NOTES%', 'no keys, model answers, notes or marks');
  perform pg_temp.check(doc->'state'->'answers' = '[]'::jsonb and doc->'state'->'editor'->>'generation' = '1', 'no answers yet');
  doc := public.get_my_exam_answering(pg_temp.id('academy'), pg_temp.id('main'), repeat('b', 64));
  perform pg_temp.check(doc->>'status' = 'lost' and doc->>'reason' = 'replaced' and pg_temp.no_material(doc), 'a wrong token reads nothing');
  doc := public.get_my_exam_answering(pg_temp.id('academy'), pg_temp.id('main'), null);
  perform pg_temp.check(doc->>'status' = 'lost' and pg_temp.no_material(doc), 'no token reads nothing');
end $$;

-- ---------------------------------------------------------------------------------------------
-- Saves: patches, receipts and conflicts.
do $$
declare result jsonb;
  k1 uuid := gen_random_uuid();
begin
  perform pg_temp.put('k1', k1::text);
  result := pg_temp.save('main', pg_temp.got('t1'), 0, pg_temp.choice('q1', 'q1-wrong'), k1);
  perform pg_temp.check(result->>'outcome' = 'saved' and result->>'answers_version' = '1' and result->>'replayed' = 'false'
    and result->'state'->'attempt'->>'answers_version' = '1', 'saved');
  perform pg_temp.check(pg_temp.no_material(result) and not (result ? 'editor_generation'), 'save response is metadata and brief state');
  result := pg_temp.save('main', pg_temp.got('t1'), 0, pg_temp.choice('q1', 'q1-wrong'), k1);
  perform pg_temp.check(result->>'outcome' = 'saved' and result->>'answers_version' = '1' and result->>'replayed' = 'true'
    and result->'state'->'attempt'->>'answers_version' = '1', 'exact retry replays without writing again');
  perform pg_temp.expect_error(format('select pg_temp.save(%L, %L, 0, %L::jsonb, %L)', 'main', pg_temp.got('t1'), pg_temp.choice('q1', 'q1-right'), k1), 'idempotency_conflict');
  result := pg_temp.save('main', pg_temp.got('t1'), 0, pg_temp.choice('q1', 'q1-right'), gen_random_uuid());
  perform pg_temp.check(result->>'outcome' = 'conflict' and result->>'answers_version' = '1' and pg_temp.no_material(result), 'stale version conflicts');
  -- Typing while a save is in flight is a later patch on the acknowledged version.
  result := pg_temp.save('main', pg_temp.got('t1'), 1, jsonb_build_array(
    jsonb_build_object('question_id', pg_temp.id('q3'), 'text_answer', 'First draft'),
    jsonb_build_object('question_id', pg_temp.id('q2'), 'choice_id', pg_temp.id('q2-no'))), gen_random_uuid());
  perform pg_temp.check(result->>'outcome' = 'saved' and result->>'answers_version' = '2', 'multi-question patch');
end $$;
select pg_temp.expect_error(format('select pg_temp.save(%L, %L, 2, %L::jsonb, null)', 'main', pg_temp.got('t1'), pg_temp.choice('q1', 'q1-right')), 'validation');
select pg_temp.expect_error(format('select pg_temp.save(%L, %L, 2, %L::jsonb, gen_random_uuid())', 'main', pg_temp.got('t1'),
  (select jsonb_agg(jsonb_build_object('question_id', gen_random_uuid())) from generate_series(1, 301))), 'validation');
select pg_temp.expect_error(format('select pg_temp.save(%L, %L, 2, %L::jsonb, gen_random_uuid())', 'main', pg_temp.got('t1'),
  jsonb_build_array(jsonb_build_object('question_id', pg_temp.id('q3'), 'text_answer', repeat('x', 10001)))), 'validation');
select pg_temp.expect_error(format('select pg_temp.save(%L, %L, 2, %L::jsonb, gen_random_uuid())', 'main', pg_temp.got('t1'),
  jsonb_build_array(jsonb_build_object('question_id', pg_temp.id('q1'), 'choice_id', pg_temp.id('q2-yes')))), 'unknown_question');
select pg_temp.expect_error(format('select pg_temp.save(%L, %L, 2, %L::jsonb, gen_random_uuid())', 'main', pg_temp.got('t1'),
  jsonb_build_array(jsonb_build_object('question_id', pg_temp.id('q1'), 'choice_id', pg_temp.id('q1-right'), 'extra', 1))), 'validation');
select pg_temp.check(pg_temp.save('main', pg_temp.got('t1'), 2, jsonb_build_array(jsonb_build_object('question_id', pg_temp.id('q3'), 'text_answer', repeat('x', 10000))),
  gen_random_uuid())->>'answers_version' = '3', 'the 10,000-character cap is accepted');
reset role;
select pg_temp.check((select answers_version = 3 from public.exam_attempts where exam_id = pg_temp.id('main') and annual_student_record_id = pg_temp.id('rec-s1')),
  'rejected saves wrote nothing');

-- Exclusion mid-exam: the excluded question can no longer be changed and its images are withheld.
select pg_temp.act('owner');
select public.exclude_exam_question(pg_temp.id('academy'), pg_temp.id('main'), pg_temp.id('q2'), 1, gen_random_uuid());
select pg_temp.act('s1');
set local role authenticated;
select pg_temp.expect_error(format('select pg_temp.save(%L, %L, 3, %L::jsonb, gen_random_uuid())', 'main', pg_temp.got('t1'), pg_temp.choice('q2', 'q2-yes')), 'question_excluded');
do $$
declare result jsonb := public.renew_my_exam_editor(pg_temp.id('academy'), pg_temp.id('main'), pg_temp.got('t1'));
begin
  perform pg_temp.check(result->>'status' = 'renewed' and result->'state'->'excluded_question_ids' = jsonb_build_array(pg_temp.id('q2'))
    and pg_temp.no_material(result), 'heartbeat reports the exclusion without material');
  result := public.authorize_my_exam_images(pg_temp.id('academy'), pg_temp.id('main'), pg_temp.got('t1'),
    array[pg_temp.id('img-prompt'), pg_temp.id('img-choice'), pg_temp.id('img-excl'), pg_temp.id('img-other'), pg_temp.id('img-b'), gen_random_uuid()]);
  perform pg_temp.check(result->>'status' = 'ok' and result->>'academy_id' = pg_temp.id('academy')::text
    and result->'image_ids' @> jsonb_build_array(pg_temp.id('img-prompt'), pg_temp.id('img-choice'))
    and jsonb_array_length(result->'image_ids') = 2, 'only images of the current non-excluded questions');
  result := public.authorize_my_exam_images(pg_temp.id('academy'), pg_temp.id('main'), repeat('c', 64), array[pg_temp.id('img-prompt')]);
  perform pg_temp.check(result->>'status' = 'lost' and not (result ? 'image_ids'), 'images need the current editor');
end $$;
select pg_temp.expect_error(format('select public.authorize_my_exam_images(%L, %L, %L, %L::uuid[])', pg_temp.id('academy'), pg_temp.id('main'), pg_temp.got('t1'),
  (select array_agg(gen_random_uuid()) from generate_series(1, 21))), 'validation');
select pg_temp.expect_error(format('select public.authorize_my_exam_images(%L, %L, %L, array[%L]::uuid[])', pg_temp.id('academy-b'), pg_temp.id('main'), pg_temp.got('t1'), pg_temp.id('img-prompt')), 'not_found');

-- Departure (EDRA-234 delivery): the warning skips the excluded question; a repeat is deduplicated.
do $$
declare result jsonb;
  e1 uuid := gen_random_uuid();
begin
  result := public.record_my_exam_departure(pg_temp.id('academy'), pg_temp.id('main'), pg_temp.got('t1'), e1, pg_temp.id('q1'), 1);
  perform pg_temp.check(result->>'outcome' = 'warned' and result->'departure'->>'next_question_id' = pg_temp.id('q3')::text
    and result->'state'->'attempt'->>'departure_count' = '1' and pg_temp.no_material(result->'state'), 'first departure warns and skips the excluded question');
  result := public.record_my_exam_departure(pg_temp.id('academy'), pg_temp.id('main'), pg_temp.got('t1'), e1, pg_temp.id('q1'), 1);
  perform pg_temp.check(result->>'outcome' = 'duplicate' and result->'state'->'attempt'->>'departure_count' = '1', 'repeated event counted once');
end $$;
reset role;

-- ---------------------------------------------------------------------------------------------
-- Lease expiry and generations: a stale editor is fenced everywhere; the latest generation's delayed
-- departure is still recorded; nothing moves the deadline.
update public.exam_editor_claims set expires_at = claimed_at
where attempt_id = (select id from public.exam_attempts where exam_id = pg_temp.id('main') and annual_student_record_id = pg_temp.id('rec-s1'));
select pg_temp.act('s1');
set local role authenticated;
do $$
declare result jsonb;
begin
  result := pg_temp.save('main', pg_temp.got('t1'), 3, pg_temp.choice('q1', 'q1-right'), gen_random_uuid());
  perform pg_temp.check(result->>'outcome' = 'editor_lost' and result->>'reason' = 'expired' and pg_temp.no_material(result), 'expired lease cannot save');
  result := public.renew_my_exam_editor(pg_temp.id('academy'), pg_temp.id('main'), pg_temp.got('t1'));
  perform pg_temp.check(result->>'status' = 'lost' and result->>'reason' = 'expired', 'expired lease cannot renew');
  -- The delayed refresh/close event of the latest generation is not dropped.
  result := public.record_my_exam_departure(pg_temp.id('academy'), pg_temp.id('main'), pg_temp.got('t1'), gen_random_uuid(), pg_temp.id('q3'), 1);
  perform pg_temp.check(result->>'outcome' = 'warned' and result->'state'->'attempt'->>'departure_count' = '2', 'latest generation departure recorded after expiry');
  -- Another device recovers after expiry with a fresh generation.
  result := public.claim_my_exam_editor(pg_temp.id('academy'), pg_temp.id('main'), null);
  perform pg_temp.check(result->>'status' = 'claimed' and result->>'generation' = '2' and result->>'token' <> pg_temp.got('t1'), 'fresh generation after expiry');
  perform pg_temp.put('t2', result->>'token');
  result := public.save_my_exam_answers(pg_temp.id('academy'), pg_temp.id('main'), pg_temp.got('t2'), 3, pg_temp.choice('q1', 'q1-right'), gen_random_uuid(), 1);
  perform pg_temp.check(result->>'outcome' = 'editor_lost', 'fresh token cannot execute an old-generation request');
  result := pg_temp.save('main', pg_temp.got('t1'), 3, pg_temp.choice('q1', 'q1-right'), gen_random_uuid());
  perform pg_temp.check(result->>'outcome' = 'editor_lost' and result->>'reason' = 'replaced', 'old generation cannot save');
  result := public.claim_my_exam_editor(pg_temp.id('academy'), pg_temp.id('main'), pg_temp.got('t1'));
  perform pg_temp.check(result->>'status' = 'busy', 'old generation cannot reclaim a live claim');
  result := public.renew_my_exam_editor(pg_temp.id('academy'), pg_temp.id('main'), pg_temp.got('t1'));
  perform pg_temp.check(result->>'status' = 'lost' and result->>'reason' = 'replaced', 'old generation cannot renew');
  result := public.record_my_exam_departure(pg_temp.id('academy'), pg_temp.id('main'), pg_temp.got('t1'), gen_random_uuid(), pg_temp.id('q3'), 1);
  perform pg_temp.check(result->>'outcome' = 'editor_lost' and result->'state' is null, 'old generation departures are refused');
  result := public.authorize_my_exam_images(pg_temp.id('academy'), pg_temp.id('main'), pg_temp.got('t1'), array[pg_temp.id('img-prompt')]);
  perform pg_temp.check(result->>'status' = 'lost', 'old generation cannot sign images');
  result := public.get_my_exam_answering(pg_temp.id('academy'), pg_temp.id('main'), pg_temp.got('t1'));
  perform pg_temp.check(result->>'status' = 'lost' and pg_temp.no_material(result), 'old generation cannot read');
  -- Replaying the old generation's accepted command returns its receipt only: no state, no writer powers.
  result := pg_temp.save('main', pg_temp.got('t1'), 0, pg_temp.choice('q1', 'q1-wrong'), pg_temp.got('k1')::uuid);
  perform pg_temp.check(result->>'outcome' = 'saved' and result->>'replayed' = 'true' and result->'editor'->>'status' = 'lost'
    and not (result ? 'state') and pg_temp.no_material(result), 'stale replay is receipt-only');
  -- The new generation reads the acknowledged answers (old offline edits never landed).
  result := public.get_my_exam_answering(pg_temp.id('academy'), pg_temp.id('main'), pg_temp.got('t2'));
  perform pg_temp.check(result->'state'->'attempt'->>'answers_version' = '3' and result->'state'->'attempt'->>'deadline_at' = pg_temp.got('deadline')
    and result->'state'->'attempt'->>'departure_count' = '2'
    and result->'state'->'answers' @> jsonb_build_array(jsonb_build_object('question_id', pg_temp.id('q1'), 'choice_id', pg_temp.id('q1-wrong'))),
    'recovery keeps acknowledged answers, deadline and departures');
  -- Release ends the lease conditionally; a wrong token releases nothing.
  result := public.release_my_exam_editor(pg_temp.id('academy'), pg_temp.id('main'), pg_temp.got('t1'));
  perform pg_temp.check(result->>'status' = 'lost', 'stale release is refused');
  result := public.release_my_exam_editor(pg_temp.id('academy'), pg_temp.id('main'), pg_temp.got('t2'));
  perform pg_temp.check(result->>'status' = 'released', 'current editor releases');
  result := public.enter_my_exam(pg_temp.id('academy'), pg_temp.id('main'), null);
  perform pg_temp.check(result->'editor'->>'status' = 'claimed' and result->'editor'->>'generation' = '3', 'released claim is acquired fresh');
  perform pg_temp.put('t3', result->'editor'->>'token');
end $$;

-- Cross-student: another student's token is useless; their own attempt has its own claim.
select pg_temp.act('s2');
do $$
declare result jsonb;
begin
  perform pg_temp.expect_error(format('select public.get_my_exam_answering(%L, %L, %L)', pg_temp.id('academy'), pg_temp.id('main'), pg_temp.got('t3')), 'not_open');
  result := public.enter_my_exam(pg_temp.id('academy'), pg_temp.id('main'), pg_temp.got('t3'));
  perform pg_temp.check(result->'editor'->>'status' = 'claimed' and result->'editor'->>'generation' = '1'
    and result->'editor'->>'token' <> pg_temp.got('t3'), 'a foreign token does not recover another student''s claim');
  perform pg_temp.put('s2t', result->'editor'->>'token');
  result := public.get_my_exam_answering(pg_temp.id('academy'), pg_temp.id('main'), pg_temp.got('t3'));
  perform pg_temp.check(result->>'status' = 'lost' and pg_temp.no_material(result), 'foreign token reads nothing');
  result := public.get_my_exam_answering(pg_temp.id('academy'), pg_temp.id('main'), pg_temp.got('s2t'));
  perform pg_temp.check(result->'state'->'answers' = '[]'::jsonb and result->'state'->>'account_id' = pg_temp.id('s2')::text, 'no cross-student answers');
  perform pg_temp.check(pg_temp.save('main', pg_temp.got('s2t'), 0, pg_temp.choice('q1', 'q1-right'), gen_random_uuid())->>'outcome' = 'saved', 's2 saves');
end $$;

-- ---------------------------------------------------------------------------------------------
-- Placement changes remove active material and image access as well as write authority.
reset role;
insert into public.academy_levels(academy_id, level_id, sort_order) values (pg_temp.id('academy'), 'secondary-1', 10);
update public.annual_student_records set level_id = 'secondary-1' where id = pg_temp.id('rec-s2');
select pg_temp.act('s2');
set local role authenticated;
select pg_temp.expect_error(format('select public.get_my_exam_answering(%L, %L, %L)', pg_temp.id('academy'), pg_temp.id('main'), pg_temp.got('s2t')), 'not_eligible');
select pg_temp.expect_error(format('select public.claim_my_exam_editor(%L, %L, %L)', pg_temp.id('academy'), pg_temp.id('main'), pg_temp.got('s2t')), 'not_eligible');
select pg_temp.expect_error(format('select public.authorize_my_exam_images(%L, %L, %L, array[%L]::uuid[])', pg_temp.id('academy'), pg_temp.id('main'), pg_temp.got('s2t'), pg_temp.id('img-prompt')), 'not_eligible');
reset role;
update public.annual_student_records set level_id = 'preparatory-3' where id = pg_temp.id('rec-s2');
set local role authenticated;

-- Explicit submission at the acknowledged version; retries never submit twice.
select pg_temp.act('s1');
do $$
declare result jsonb;
  ks uuid := gen_random_uuid();
begin
  result := public.submit_my_exam(pg_temp.id('academy'), pg_temp.id('main'), pg_temp.got('t3'), 2, gen_random_uuid(), 3);
  perform pg_temp.check(result->>'outcome' = 'conflict' and result->>'answers_version' = '3', 'submission at an unacknowledged version is refused');
  result := public.submit_my_exam(pg_temp.id('academy'), pg_temp.id('main'), pg_temp.got('t2'), 3, gen_random_uuid(), 2);
  perform pg_temp.check(result->>'outcome' = 'editor_lost', 'a replaced editor cannot submit');
  result := public.submit_my_exam(pg_temp.id('academy'), pg_temp.id('main'), pg_temp.got('t3'), 3, ks, 3);
  perform pg_temp.check(result->>'outcome' = 'submitted' and result->'state'->'submission'->>'reason' = 'submitted'
    and result->'state'->'attempt'->>'finalization_reason' = 'submitted' and pg_temp.no_material(result), 'submitted with terminal status only');
  result := public.submit_my_exam(pg_temp.id('academy'), pg_temp.id('main'), pg_temp.got('t3'), 3, ks, 3);
  perform pg_temp.check(result->>'outcome' = 'submitted' and result->>'replayed' = 'true' and pg_temp.no_material(result), 'retry replays the submission');
  result := public.submit_my_exam(pg_temp.id('academy'), pg_temp.id('main'), pg_temp.got('t3'), 3, gen_random_uuid(), 3);
  perform pg_temp.check(result->>'outcome' = 'finalized' and pg_temp.no_material(result), 'a second confirmation is finalized, not resubmitted');
  -- After finalization: no material anywhere, no writer, no retake.
  result := public.get_my_exam_answering(pg_temp.id('academy'), pg_temp.id('main'), pg_temp.got('t3'));
  perform pg_temp.check(result->>'status' = 'finalized' and pg_temp.no_material(result), 'terminal read');
  result := pg_temp.save('main', pg_temp.got('t3'), 3, pg_temp.choice('q1', 'q1-right'), gen_random_uuid());
  perform pg_temp.check(result->>'outcome' = 'finalized' and pg_temp.no_material(result), 'late save is finalized');
  result := pg_temp.save('main', pg_temp.got('t1'), 0, pg_temp.choice('q1', 'q1-wrong'), pg_temp.got('k1')::uuid);
  perform pg_temp.check(result->>'outcome' = 'saved' and result->>'finalized' = 'true' and pg_temp.no_material(result), 'replay after finalization reveals nothing');
  result := public.authorize_my_exam_images(pg_temp.id('academy'), pg_temp.id('main'), pg_temp.got('t3'), array[pg_temp.id('img-prompt')]);
  perform pg_temp.check(result->>'status' = 'finalized' and not (result ? 'image_ids'), 'no images after finalization');
  result := public.enter_my_exam(pg_temp.id('academy'), pg_temp.id('main'), null);
  perform pg_temp.check(result->>'active' = 'false' and result->'editor' = 'null'::jsonb and pg_temp.no_material(result), 'entry after submission is inactive');
  perform pg_temp.check(public.get_my_exam(pg_temp.id('main'))->'parts' = '[]'::jsonb, 'no review before qualification');
end $$;
reset role;
select pg_temp.check((select count(*) = 1 from public.exam_submissions where exam_id = pg_temp.id('main') and annual_student_record_id = pg_temp.id('rec-s1')),
  'exactly one submission');
select pg_temp.check((select count(*) = 1 from public.exam_attempts where exam_id = pg_temp.id('main') and annual_student_record_id = pg_temp.id('rec-s1')),
  'no retake');
select pg_temp.check((select a.choice_id = pg_temp.id('q1-wrong')
  from public.exam_submissions s join public.exam_submission_answers a on a.submission_id = s.id
  where s.exam_id = pg_temp.id('main') and s.annual_student_record_id = pg_temp.id('rec-s1') and a.question_id = pg_temp.id('q1')),
  'the acknowledged answer was submitted');

-- Timer expiry wins: the next command settles saved work as timer and reports finalized.
alter table public.exam_attempts disable trigger exam_attempts_guard;
update public.exam_attempts set started_at = clock_timestamp() - interval '31 minutes', deadline_at = clock_timestamp() - interval '1 minute'
where exam_id = pg_temp.id('main') and annual_student_record_id = pg_temp.id('rec-s2');
alter table public.exam_attempts enable trigger exam_attempts_guard;
select pg_temp.act('s2');
set local role authenticated;
do $$
declare result jsonb;
begin
  result := public.record_my_exam_departure(pg_temp.id('academy'), pg_temp.id('main'), pg_temp.got('s2t'), gen_random_uuid(), null, 1);
  perform pg_temp.check(result->>'outcome' = 'finalized' and result->'state'->'submission'->>'reason' = 'timer',
    'due timer wins over context-free departure');
  result := pg_temp.save('main', pg_temp.got('s2t'), 1, pg_temp.choice('q1', 'q1-wrong'), gen_random_uuid());
  perform pg_temp.check(result->>'outcome' = 'finalized' and result->'state'->'submission'->>'reason' = 'timer' and pg_temp.no_material(result),
    'timer settles before a late save');
  result := public.renew_my_exam_editor(pg_temp.id('academy'), pg_temp.id('main'), pg_temp.got('s2t'));
  perform pg_temp.check(result->>'status' = 'finalized', 'heartbeat after the deadline is terminal');
end $$;
reset role;
select pg_temp.check((select a.choice_id = pg_temp.id('q1-right') from public.exam_submissions s join public.exam_submission_answers a on a.submission_id = s.id
  where s.exam_id = pg_temp.id('main') and s.annual_student_record_id = pg_temp.id('rec-s2') and a.question_id = pg_temp.id('q1')), 'timer submits the saved answer');

-- Physical confirmation wins: the online editor stops; its draft stays as history.
select pg_temp.act('s3');
set local role authenticated;
select pg_temp.put('s3t', public.enter_my_exam(pg_temp.id('academy'), pg_temp.id('main'), null)->'editor'->>'token');
select pg_temp.check(pg_temp.save('main', pg_temp.got('s3t'), 0, pg_temp.choice('q1', 'q1-right'), gen_random_uuid())->>'outcome' = 'saved', 's3 saves');
reset role;
select pg_temp.act('owner');
select public.confirm_exam_physical(pg_temp.id('academy'), pg_temp.id('main'), pg_temp.id('rec-s3'), 0, gen_random_uuid());
select pg_temp.act('s3');
set local role authenticated;
select pg_temp.check(public.submit_my_exam(pg_temp.id('academy'), pg_temp.id('main'), pg_temp.got('s3t'), 1, gen_random_uuid(), 1)->>'outcome' = 'source_conflict',
  'physical first wins over online submission');
select pg_temp.check(pg_temp.save('main', pg_temp.got('s3t'), 1, pg_temp.choice('q1', 'q1-wrong'), gen_random_uuid())->>'outcome' = 'finalized', 'superseded editor cannot save');
reset role;
select pg_temp.check((select count(*) = 1 from public.exam_online_answers o join public.exam_attempts a on a.id = o.attempt_id
  where a.exam_id = pg_temp.id('main') and a.annual_student_record_id = pg_temp.id('rec-s3')), 'losing online draft preserved');

-- Third departure ends the attempt as kicked and stops the editor.
select pg_temp.act('s4');
set local role authenticated;
do $$
declare token text := public.enter_my_exam(pg_temp.id('academy'), pg_temp.id('main'), null)->'editor'->>'token';
  result jsonb;
  loading_event uuid := gen_random_uuid();
begin
  perform pg_temp.check(pg_temp.save('main', token, 0, pg_temp.choice('q1', 'q1-right'), gen_random_uuid())->>'outcome' = 'saved', 's4 saves');
  result := public.record_my_exam_departure(pg_temp.id('academy'), pg_temp.id('main'), token, loading_event, null, 1);
  perform pg_temp.check(result->>'outcome' = 'warned' and result->'departure'->'question_id' = 'null'::jsonb
    and result->'departure'->'question_number' = 'null'::jsonb
    and result->'departure'->>'next_question_id' = pg_temp.id('q1')::text, 'loading departure has null context and first continuation');
  result := public.record_my_exam_departure(pg_temp.id('academy'), pg_temp.id('main'), token, loading_event, null, 1);
  perform pg_temp.check(result->>'outcome' = 'duplicate', 'null-context replay is idempotent');
  perform pg_temp.expect_error(format('select public.record_my_exam_departure(%L, %L, %L, %L, %L, 1)',
    pg_temp.id('academy'), pg_temp.id('main'), token, loading_event, pg_temp.id('q1')), 'idempotency_conflict');
  perform pg_temp.expect_error(format('select public.record_my_exam_departure(%L, %L, %L, gen_random_uuid(), %L, 1)',
    pg_temp.id('academy'), pg_temp.id('main'), token, gen_random_uuid()), 'unknown_question');
  perform public.record_my_exam_departure(pg_temp.id('academy'), pg_temp.id('main'), token, gen_random_uuid(), pg_temp.id('q3'), 1);
  result := public.record_my_exam_departure(pg_temp.id('academy'), pg_temp.id('main'), token, gen_random_uuid(), pg_temp.id('q3'), 1);
  perform pg_temp.check(result->>'outcome' = 'kicked' and result->'state'->'submission'->>'reason' = 'kicked' and pg_temp.no_material(result), 'third departure kicks');
  result := public.get_my_exam_answering(pg_temp.id('academy'), pg_temp.id('main'), token);
  perform pg_temp.check(result->>'status' = 'finalized', 'kicked editor is terminal');
end $$;
reset role;

-- Year closure: no running attempts remain, so the year closes; entry is then refused.
update public.academic_years set closed_at = now() where id = pg_temp.id('year');
select pg_temp.act('s1');
set local role authenticated;
select pg_temp.expect_error(format('select public.enter_my_exam(%L, %L, null)', pg_temp.id('academy'), pg_temp.id('main')), '%unavailable');
reset role;

rollback;
