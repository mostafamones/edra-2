-- Task 4 / R01. Tests public standalone exam wrappers with connected accounts and the private
-- quiz projection without relaxing its content guard. All fixtures and work roll back.
begin;

-- Fixture years start student learning when created; preparation is covered by student_booking.sql.
create function public.edra_test_start_fixture_year() returns trigger language plpgsql as $fixture$
begin
  new.student_learning_started_at := coalesce(new.student_learning_started_at, now());
  new.student_learning_start_source := coalesce(new.student_learning_start_source, 'legacy');
  return new;
end $fixture$;
create trigger edra_test_fixture_year_started before insert on public.academic_years
for each row execute function public.edra_test_start_fixture_year();
create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'Exposure check failed: %', label; end if; end $$;
create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$
begin
  execute statement;
  raise exception 'Expected rejection: %', expected using errcode = 'XX001';
exception when sqlstate 'XX001' then raise;
  when others then if sqlerrm not like expected then raise exception 'Expected %, got %', expected, sqlerrm; end if;
end $$;
create temporary table exposure_ids(name text primary key, id uuid not null default gen_random_uuid());
insert into exposure_ids(name) values ('owner'),('student'),('physical'),('unannounced'),('outsider'),('academy'),('exam'),('quiz'),('image');
grant select on pg_temp.exposure_ids to authenticated;
create function pg_temp.id(label text) returns uuid language sql as $$ select id from pg_temp.exposure_ids where name=label $$;
create function pg_temp.act(label text) returns void language sql as $$ select set_config('request.jwt.claim.sub',pg_temp.id(label)::text,true) $$;
insert into auth.users(id) select id from exposure_ids where name in ('owner','student','physical','unannounced','outsider');
insert into public.academies(id,name,slug,icon,subject,created_by)
values(pg_temp.id('academy'),'Exposure fixture','exposure-'||pg_temp.id('academy'),'school','Math',pg_temp.id('owner'));
insert into public.academy_memberships(academy_id,user_id,role,created_by)
values(pg_temp.id('academy'),pg_temp.id('owner'),'owner',pg_temp.id('owner'));
insert into exposure_ids(name,id) select 'year',id from public.academic_years where academy_id=pg_temp.id('academy');
insert into public.academy_levels(academy_id,level_id,sort_order) values(pg_temp.id('academy'),'preparatory-3',9);
select pg_temp.act('owner');
insert into exposure_ids(name,id) select 'record-'||n,
 (public.create_student_record(pg_temp.id('academy'),pg_temp.id('year'),'Exposure student '||n,'0106000000'||n,'01100000000','preparatory-3',null,null,'in_person')).id
from generate_series(1,3) n;
update public.academy_student_profiles p set user_id=pg_temp.id(case r.id when pg_temp.id('record-1') then 'student' when pg_temp.id('record-2') then 'physical' else 'unannounced' end),linked_at=now()
from public.annual_student_records r where r.academy_student_profile_id=p.id and r.academy_id=pg_temp.id('academy');
insert into storage.objects(bucket_id,name)
values('assignment-images',pg_temp.id('academy')::text||'/'||pg_temp.id('image'));
create function pg_temp.hidden(state jsonb) returns void language plpgsql as $$
begin
  perform pg_temp.check(state->'parts'='[]'::jsonb and state->'excluded_question_ids'='[]'::jsonb,'empty material arrays');
  perform pg_temp.check(state->'solutions'='null'::jsonb,'no solutions');
  perform pg_temp.check(not jsonb_path_exists(state,'$.**.prompt') and not jsonb_path_exists(state,'$.**.choices')
    and not jsonb_path_exists(state,'$.**.model_answer') and not jsonb_path_exists(state,'$.**.correct_choice_id')
    and not jsonb_path_exists(state,'$.**.is_correct') and not jsonb_path_exists(state,'$.**.solution_notes')
    and state::text not like '%{{image:%' and state::text not like '%SECRET-%','field-by-field leak check');
end $$;
create function pg_temp.questions_only(state jsonb) returns void language plpgsql as $$
begin
  perform pg_temp.check(jsonb_array_length(state->'parts')=2 and state::text like '%SECRET-PROMPT%' and state::text like '%{{image:%','started attempt receives material');
  perform pg_temp.check(coalesce(state->'solutions','null'::jsonb)='null'::jsonb and not jsonb_path_exists(state,'$.**.model_answer')
    and not jsonb_path_exists(state,'$.**.correct_choice_id') and not jsonb_path_exists(state,'$.**.is_correct')
    and state::text not like '%SECRET-MODEL%' and state::text not like '%SECRET-SOLUTION%','questions reveal no keys or private marks');
end $$;

-- exam: overview, own attempt, physical sources, closure/announcement and unauthorized callers.
select pg_temp.act('owner');
select public.create_exam(pg_temp.id('academy'),pg_temp.id('year'),pg_temp.id('exam'),jsonb_build_object(
 'title','Overview','instructions','Safe overview','solution_notes','SECRET-SOLUTION','audience','level','level_id','preparatory-3','time_limit_minutes',60,
 'parts',jsonb_build_array(
  jsonb_build_object('title','SECRET-PART','instructions','SECRET-PART-INSTRUCTIONS','kind','question_sheet','questions',jsonb_build_array(
   jsonb_build_object('prompt','SECRET-PROMPT {{image:'||pg_temp.id('image')||'}}','max_score','2','choices',jsonb_build_array(
    jsonb_build_object('label','SECRET-CHOICE','is_correct',true),jsonb_build_object('label','Other'))))),
  jsonb_build_object('title','Written','kind','written_work','questions',jsonb_build_array(jsonb_build_object('prompt','SECRET-WRITTEN','model_answer','SECRET-MODEL','max_score','2'))))));
insert into exposure_ids(name,id) select 'exam-q1',id from public.exam_questions where exam_id=pg_temp.id('exam') and prompt like 'SECRET-PROMPT%';
insert into exposure_ids(name,id) select 'exam-q2',id from public.exam_questions where exam_id=pg_temp.id('exam') and prompt='SECRET-WRITTEN';
insert into exposure_ids(name,id) select 'exam-choice',id from public.exam_choices where question_id=pg_temp.id('exam-q1') and is_correct;
select pg_temp.hidden(edra_private.exam_student_state(pg_temp.id('exam'),pg_temp.id('record-1')));
select pg_temp.check(not exists(select 1 from public.exam_work where exam_id=pg_temp.id('exam')),'overview creates no work');
select pg_temp.act('student');
set local role authenticated;
select pg_temp.hidden(public.get_my_exam(pg_temp.id('exam')));
select pg_temp.check(not exists(select 1 from public.exam_questions where exam_id=pg_temp.id('exam')),'no raw question RLS access');
select pg_temp.check(not exists(select 1 from storage.objects where bucket_id='assignment-images' and name like pg_temp.id('academy')::text||'/%'),'no alternate storage preview');
reset role;
select pg_temp.act('owner');
select public.save_exam_physical_draft(pg_temp.id('academy'),pg_temp.id('exam'),pg_temp.id('record-2'),0,jsonb_build_array(jsonb_build_object('question_id',pg_temp.id('exam-q1'),'choice_id',pg_temp.id('exam-choice'))),gen_random_uuid());
select pg_temp.hidden(edra_private.exam_student_state(pg_temp.id('exam'),pg_temp.id('record-2')));
select public.confirm_exam_physical(pg_temp.id('academy'),pg_temp.id('exam'),pg_temp.id('record-2'),1,gen_random_uuid());
select pg_temp.hidden(edra_private.exam_student_state(pg_temp.id('exam'),pg_temp.id('record-2')));
select public.save_exam_marks(pg_temp.id('academy'),pg_temp.id('exam'),pg_temp.id('record-2'),(select version from public.exam_work where exam_id=pg_temp.id('exam') and annual_student_record_id=pg_temp.id('record-2')),
 jsonb_build_object('marks',jsonb_build_array(jsonb_build_object('question_id',pg_temp.id('exam-q2'),'score','1'))),gen_random_uuid());
select public.announce_exam_results(pg_temp.id('academy'),pg_temp.id('exam'),1,jsonb_build_array(jsonb_build_object('annual_student_record_id',pg_temp.id('record-2'),'expected_version',
 (select version from public.exam_work where exam_id=pg_temp.id('exam') and annual_student_record_id=pg_temp.id('record-2')))),gen_random_uuid());
select pg_temp.hidden(edra_private.exam_student_state(pg_temp.id('exam'),pg_temp.id('record-2')));
select public.save_exam_physical_draft(pg_temp.id('academy'),pg_temp.id('exam'),pg_temp.id('record-3'),0,'[]',gen_random_uuid());
select public.confirm_exam_physical(pg_temp.id('academy'),pg_temp.id('exam'),pg_temp.id('record-3'),1,gen_random_uuid());
select public.configure_exam_availability(pg_temp.id('academy'),pg_temp.id('exam'),(select version from public.exams where id=pg_temp.id('exam')),now()-interval '1 minute',now()+interval '2 hours');
select pg_temp.act('student');
set local role authenticated;
select pg_temp.hidden(public.get_my_exam(pg_temp.id('exam')));
-- EDRA-233: direct wrappers stay hidden during the attempt; the current editor reads the material.
select pg_temp.hidden(public.start_exam_attempt(pg_temp.id('exam')));
select pg_temp.hidden(public.get_my_exam(pg_temp.id('exam')));
select pg_temp.questions_only(public.get_my_exam_answering(pg_temp.id('academy'),pg_temp.id('exam'),
  public.claim_my_exam_editor(pg_temp.id('academy'),pg_temp.id('exam'),null)->>'token')->'state');
reset role;
select pg_temp.hidden(edra_private.exam_student_state(pg_temp.id('exam'),pg_temp.id('record-3')));
insert into exposure_ids(name,id) select 'exam-started',id from public.exam_attempts where exam_id=pg_temp.id('exam') and annual_student_record_id=pg_temp.id('record-1');
select edra_private.submit_exam_attempt_for(pg_temp.id('exam'),pg_temp.id('record-1'),gen_random_uuid());
-- EDRA-83: after final submission and before solution qualification, no question/answer review.
select pg_temp.hidden(edra_private.start_exam_attempt_for(pg_temp.id('exam'),pg_temp.id('record-1')));
select pg_temp.hidden(public.get_my_exam(pg_temp.id('exam')));
select pg_temp.check((select count(*)=1 and bool_and(id=pg_temp.id('exam-started')) from public.exam_attempts where exam_id=pg_temp.id('exam')),'finalized attempt never retakes');
update public.exams set opens_at=now()-interval '3 hours',closes_at=now()-interval '1 hour',actual_closes_at=now()-interval '58 minutes' where id=pg_temp.id('exam');
select edra_private.settle_exam_closure(pg_temp.id('exam'));
select pg_temp.check(edra_private.exam_student_state(pg_temp.id('exam'),pg_temp.id('record-1'))->'solutions'->'questions'->0 ? 'correct_choice_id','online closure qualifies without manual announcement');
select pg_temp.check(jsonb_array_length(edra_private.exam_student_state(pg_temp.id('exam'),pg_temp.id('record-2'))->'parts')=2 and edra_private.exam_student_state(pg_temp.id('exam'),pg_temp.id('record-2'))->'solutions' is distinct from 'null'::jsonb,'physical closure plus announcement reveals');
select pg_temp.hidden(edra_private.exam_student_state(pg_temp.id('exam'),pg_temp.id('record-3')));
select pg_temp.act('owner');
select public.save_exam_marks(pg_temp.id('academy'),pg_temp.id('exam'),pg_temp.id('record-3'),(select version from public.exam_work where exam_id=pg_temp.id('exam') and annual_student_record_id=pg_temp.id('record-3')),
 jsonb_build_object('marks',jsonb_build_array(jsonb_build_object('question_id',pg_temp.id('exam-q2'),'score','0'))),gen_random_uuid());
select public.announce_exam_results(pg_temp.id('academy'),pg_temp.id('exam'),1,jsonb_build_array(jsonb_build_object('annual_student_record_id',pg_temp.id('record-3'),'expected_version',
 (select version from public.exam_work where exam_id=pg_temp.id('exam') and annual_student_record_id=pg_temp.id('record-3')))),gen_random_uuid());
select pg_temp.check(jsonb_array_length(edra_private.exam_student_state(pg_temp.id('exam'),pg_temp.id('record-3'))->'parts')=2 and edra_private.exam_student_state(pg_temp.id('exam'),pg_temp.id('record-3'))->'solutions' is distinct from 'null'::jsonb,'announcement after closure qualifies');
select pg_temp.act('outsider');
set local role authenticated;
select pg_temp.expect_error($q$select public.get_my_exam(pg_temp.id('exam'))$q$,'student_link_unavailable');
select pg_temp.expect_error($q$select edra_private.exam_student_state(pg_temp.id('exam'),pg_temp.id('record-1'))$q$,'%permission denied%');
reset role;

-- quiz: overview, own attempt, physical sources, closure/announcement and unauthorized callers.
select pg_temp.act('owner');
select public.create_quiz(pg_temp.id('academy'),pg_temp.id('year'),pg_temp.id('quiz'),jsonb_build_object(
 'title','Overview','instructions','Safe overview','solution_notes','SECRET-SOLUTION','audience','level','level_id','preparatory-3','time_limit_minutes',60,
 'parts',jsonb_build_array(
  jsonb_build_object('title','SECRET-PART','instructions','SECRET-PART-INSTRUCTIONS','kind','question_sheet','questions',jsonb_build_array(
   jsonb_build_object('prompt','SECRET-PROMPT {{image:'||pg_temp.id('image')||'}}','max_score','2','choices',jsonb_build_array(
    jsonb_build_object('label','SECRET-CHOICE','is_correct',true),jsonb_build_object('label','Other'))))),
  jsonb_build_object('title','Written','kind','written_work','questions',jsonb_build_array(jsonb_build_object('prompt','SECRET-WRITTEN','model_answer','SECRET-MODEL','max_score','2'))))));
insert into exposure_ids(name,id) select 'quiz-q1',id from public.quiz_questions where quiz_id=pg_temp.id('quiz') and prompt like 'SECRET-PROMPT%';
insert into exposure_ids(name,id) select 'quiz-q2',id from public.quiz_questions where quiz_id=pg_temp.id('quiz') and prompt='SECRET-WRITTEN';
insert into exposure_ids(name,id) select 'quiz-choice',id from public.quiz_choices where question_id=pg_temp.id('quiz-q1') and is_correct;
select pg_temp.hidden(edra_private.quiz_student_state(pg_temp.id('quiz'),pg_temp.id('record-1')));
select pg_temp.check(not exists(select 1 from public.quiz_work where quiz_id=pg_temp.id('quiz')),'overview creates no work');
select pg_temp.act('student');
set local role authenticated;
select pg_temp.expect_error($q$select public.get_my_quiz(pg_temp.id('quiz'))$q$,'content_unavailable');
select pg_temp.expect_error($q$select public.start_quiz_attempt(pg_temp.id('quiz'))$q$,'content_unavailable');
reset role;
select pg_temp.act('owner');
select public.save_quiz_physical_draft(pg_temp.id('academy'),pg_temp.id('quiz'),pg_temp.id('record-2'),0,jsonb_build_array(jsonb_build_object('question_id',pg_temp.id('quiz-q1'),'choice_id',pg_temp.id('quiz-choice'))),gen_random_uuid());
select pg_temp.hidden(edra_private.quiz_student_state(pg_temp.id('quiz'),pg_temp.id('record-2')));
select public.confirm_quiz_physical(pg_temp.id('academy'),pg_temp.id('quiz'),pg_temp.id('record-2'),1,gen_random_uuid());
select pg_temp.hidden(edra_private.quiz_student_state(pg_temp.id('quiz'),pg_temp.id('record-2')));
select public.save_quiz_marks(pg_temp.id('academy'),pg_temp.id('quiz'),pg_temp.id('record-2'),(select version from public.quiz_work where quiz_id=pg_temp.id('quiz') and annual_student_record_id=pg_temp.id('record-2')),
 jsonb_build_object('marks',jsonb_build_array(jsonb_build_object('question_id',pg_temp.id('quiz-q2'),'score','1'))),gen_random_uuid());
select public.announce_quiz_results(pg_temp.id('academy'),pg_temp.id('quiz'),1,jsonb_build_array(jsonb_build_object('annual_student_record_id',pg_temp.id('record-2'),'expected_version',
 (select version from public.quiz_work where quiz_id=pg_temp.id('quiz') and annual_student_record_id=pg_temp.id('record-2')))),gen_random_uuid());
select pg_temp.hidden(edra_private.quiz_student_state(pg_temp.id('quiz'),pg_temp.id('record-2')));
select public.save_quiz_physical_draft(pg_temp.id('academy'),pg_temp.id('quiz'),pg_temp.id('record-3'),0,'[]',gen_random_uuid());
select public.confirm_quiz_physical(pg_temp.id('academy'),pg_temp.id('quiz'),pg_temp.id('record-3'),1,gen_random_uuid());
select public.configure_quiz_availability(pg_temp.id('academy'),pg_temp.id('quiz'),(select version from public.quizzes where id=pg_temp.id('quiz')),now()-interval '1 minute',now()+interval '2 hours');
select pg_temp.act('student');
select pg_temp.questions_only(edra_private.start_quiz_attempt_for(pg_temp.id('quiz'),pg_temp.id('record-1')));
select pg_temp.hidden(edra_private.quiz_student_state(pg_temp.id('quiz'),pg_temp.id('record-3')));
insert into exposure_ids(name,id) select 'quiz-started',id from public.quiz_attempts where quiz_id=pg_temp.id('quiz') and annual_student_record_id=pg_temp.id('record-1');
select edra_private.submit_quiz_attempt_for(pg_temp.id('quiz'),pg_temp.id('record-1'),gen_random_uuid());
select pg_temp.questions_only(edra_private.start_quiz_attempt_for(pg_temp.id('quiz'),pg_temp.id('record-1')));
select pg_temp.check((select count(*)=1 and bool_and(id=pg_temp.id('quiz-started')) from public.quiz_attempts where quiz_id=pg_temp.id('quiz')),'finalized attempt never retakes');
update public.quizzes set opens_at=now()-interval '3 hours',closes_at=now()-interval '1 hour',actual_closes_at=now()-interval '58 minutes' where id=pg_temp.id('quiz');
select edra_private.settle_quiz_closure(pg_temp.id('quiz'));
select pg_temp.check(edra_private.quiz_student_state(pg_temp.id('quiz'),pg_temp.id('record-1'))->'solutions'->'questions'->0 ? 'correct_choice_id','online closure qualifies without manual announcement');
select pg_temp.check(jsonb_array_length(edra_private.quiz_student_state(pg_temp.id('quiz'),pg_temp.id('record-2'))->'parts')=2 and edra_private.quiz_student_state(pg_temp.id('quiz'),pg_temp.id('record-2'))->'solutions' is distinct from 'null'::jsonb,'physical closure plus announcement reveals');
select pg_temp.hidden(edra_private.quiz_student_state(pg_temp.id('quiz'),pg_temp.id('record-3')));
select pg_temp.act('owner');
select public.save_quiz_marks(pg_temp.id('academy'),pg_temp.id('quiz'),pg_temp.id('record-3'),(select version from public.quiz_work where quiz_id=pg_temp.id('quiz') and annual_student_record_id=pg_temp.id('record-3')),
 jsonb_build_object('marks',jsonb_build_array(jsonb_build_object('question_id',pg_temp.id('quiz-q2'),'score','0'))),gen_random_uuid());
select public.announce_quiz_results(pg_temp.id('academy'),pg_temp.id('quiz'),1,jsonb_build_array(jsonb_build_object('annual_student_record_id',pg_temp.id('record-3'),'expected_version',
 (select version from public.quiz_work where quiz_id=pg_temp.id('quiz') and annual_student_record_id=pg_temp.id('record-3')))),gen_random_uuid());
select pg_temp.check(jsonb_array_length(edra_private.quiz_student_state(pg_temp.id('quiz'),pg_temp.id('record-3'))->'parts')=2 and edra_private.quiz_student_state(pg_temp.id('quiz'),pg_temp.id('record-3'))->'solutions' is distinct from 'null'::jsonb,'announcement after closure qualifies');
select pg_temp.act('outsider');
set local role authenticated;
select pg_temp.expect_error($q$select public.get_my_quiz(pg_temp.id('quiz'))$q$,'student_link_unavailable');
select pg_temp.expect_error($q$select edra_private.quiz_student_state(pg_temp.id('quiz'),pg_temp.id('record-1'))$q$,'%permission denied%');
reset role;
rollback;
