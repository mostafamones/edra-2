-- EDRA-129: authority, maintenance, track transitions, fixed rosters and shutdown/resume.
-- Runs only through the marked-target runner; all fixtures roll back.
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
update edra_private.offering_release set enabled=true;

create function pg_temp.check(condition boolean,message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'FAILED: %',message; end if; end $$;
create function pg_temp.fails(statement text) returns boolean language plpgsql as $$
begin execute statement; return false; exception when others then return true; end $$;
create function pg_temp.act(account uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub',coalesce(account::text,''),true);
$$;
create function pg_temp.apply(change jsonb,request_key uuid default gen_random_uuid()) returns jsonb language plpgsql as $$
declare preview jsonb;
begin
  preview:=public.preview_offering_change('ed129000-0000-4000-8000-000000000001',change);
  return public.maintain_academy_offering('ed129000-0000-4000-8000-000000000001',change,
    (preview->>'revision')::bigint,preview->>'fingerprint',request_key);
end $$;

insert into auth.users(id,phone,phone_confirmed_at) values
  ('ed129001-0000-4000-8000-000000000001','201069129001',now()),
  ('ed129001-0000-4000-8000-000000000002','201069129002',now()),
  ('ed129001-0000-4000-8000-000000000003','201069129003',now()),
  ('ed129001-0000-4000-8000-000000000004','201069129004',now()),
  ('ed129001-0000-4000-8000-000000000005','201069129005',now()),
  ('ed129001-0000-4000-8000-000000000006','201069129006',now());
insert into public.academies(id,name,slug,icon,subject,created_by) values
  ('ed129000-0000-4000-8000-000000000001','Structure A','structure-129-a','school','Math','ed129001-0000-4000-8000-000000000001'),
  ('ed129000-0000-4000-8000-000000000002','Structure B','structure-129-b','school','Math','ed129001-0000-4000-8000-000000000006');
insert into public.academy_memberships(academy_id,user_id,role,created_by,suspended_at) values
  ('ed129000-0000-4000-8000-000000000001','ed129001-0000-4000-8000-000000000001','owner','ed129001-0000-4000-8000-000000000001',null),
  ('ed129000-0000-4000-8000-000000000001','ed129001-0000-4000-8000-000000000002','head_admin','ed129001-0000-4000-8000-000000000001',null),
  ('ed129000-0000-4000-8000-000000000001','ed129001-0000-4000-8000-000000000003','admin','ed129001-0000-4000-8000-000000000001',null),
  ('ed129000-0000-4000-8000-000000000001','ed129001-0000-4000-8000-000000000004','instructor','ed129001-0000-4000-8000-000000000001',null),
  ('ed129000-0000-4000-8000-000000000001','ed129001-0000-4000-8000-000000000005','admin','ed129001-0000-4000-8000-000000000001',now()),
  ('ed129000-0000-4000-8000-000000000002','ed129001-0000-4000-8000-000000000006','owner','ed129001-0000-4000-8000-000000000006',null);

do $$ begin
  perform pg_temp.check(not has_column_privilege('authenticated','public.academy_levels','stopped_at','update'),'offering state cannot be written directly');
  perform pg_temp.check(not has_table_privilege('authenticated','edra_private.offering_requests','insert'),'receipts are private');
  perform pg_temp.check(not has_table_privilege('authenticated','edra_private.offering_transitions','insert'),'no caller-supplied transition capability');
  perform pg_temp.check(not has_table_privilege('authenticated','edra_private.exam_fixed_roster','insert'),'frozen roster is private');
  perform pg_temp.check(not has_function_privilege('anon','public.maintain_academy_offering(uuid,jsonb,bigint,text,uuid)','execute'),'anonymous command denied');
end $$;

grant usage on schema public,auth to authenticated;
set local role authenticated;
select pg_temp.act('ed129001-0000-4000-8000-000000000001');

do $$
declare change jsonb:='{"operation":"add_level","levelId":"secondary-2"}'; preview jsonb; result jsonb; key uuid:=gen_random_uuid();
begin
  preview:=public.preview_offering_change('ed129000-0000-4000-8000-000000000001',change);
  result:=public.maintain_academy_offering('ed129000-0000-4000-8000-000000000001',change,(preview->>'revision')::bigint,preview->>'fingerprint',key);
  perform pg_temp.check(result->>'outcome'='committed','owner adds offered catalog level');
  result:=public.maintain_academy_offering('ed129000-0000-4000-8000-000000000001',change,(preview->>'revision')::bigint,preview->>'fingerprint',key);
  perform pg_temp.check((result->>'replayed')::boolean,'same-key replay returns committed result');
  perform pg_temp.check(pg_temp.fails(format($q$select public.maintain_academy_offering('ed129000-0000-4000-8000-000000000001',
    '{"operation":"add_level","levelId":"secondary-1"}',%s,%L,%L)$q$,(preview->>'revision')::bigint,preview->>'fingerprint',key)),'changed payload cannot reuse key');
  perform pg_temp.check(pg_temp.fails($q$select pg_temp.apply('{"operation":"add_level","levelId":"grade-10"}')$q$),'legacy catalog cannot be offered');
  perform pg_temp.check((select count(*)=0 from public.annual_student_records where academy_id='ed129000-0000-4000-8000-000000000001'),'adding offering creates no participation');
end $$;

-- Establish a level-only legacy record before the first track is added.
select set_config('test.structure_record',id::text,true) from public.create_student_record(
  'ed129000-0000-4000-8000-000000000001',
  (select id from public.academic_years where academy_id='ed129000-0000-4000-8000-000000000001' and closed_at is null),
  'Structure Student','01069129001','01269129001','secondary-2',null,null,'in_person');
select pg_temp.act('ed129001-0000-4000-8000-000000000002');
select pg_temp.check(pg_temp.apply('{"operation":"add_track","levelId":"secondary-2","name":" Scientific "}')->>'outcome'='committed','head admin adds track');
select pg_temp.check((select track_id is null from public.annual_student_records where id=current_setting('test.structure_record')::uuid),'first track does not move legacy placement');
select pg_temp.check(pg_temp.fails($q$select pg_temp.apply('{"operation":"add_track","levelId":"secondary-2","name":"scientific"}')$q$),'track names are case-insensitively unique');
select pg_temp.check(pg_temp.fails($q$select pg_temp.apply('{"operation":"add_track","levelId":"secondary-2","name":" "}')$q$),'empty names fail');
select pg_temp.act('ed129001-0000-4000-8000-000000000003');
select pg_temp.check(pg_temp.apply(jsonb_build_object('operation','rename_track','levelId','secondary-2','name','Science',
  'trackId',(select id from public.academy_tracks where academy_id='ed129000-0000-4000-8000-000000000001' and name='Scientific')))->>'outcome'='committed','Admin manages offerings unlike profile edits');

-- A membership change makes a preview stale even without an offering revision change.
select set_config('test.structure_preview',public.preview_offering_change('ed129000-0000-4000-8000-000000000001',
  '{"operation":"add_level","levelId":"secondary-1"}')::text,true);
reset role;
update public.academy_memberships set suspended_at=now() where academy_id='ed129000-0000-4000-8000-000000000001' and user_id='ed129001-0000-4000-8000-000000000004';
set local role authenticated;
do $$ declare preview jsonb:=current_setting('test.structure_preview')::jsonb;
begin
  perform pg_temp.check(public.maintain_academy_offering('ed129000-0000-4000-8000-000000000001',preview->'change',
    (preview->>'revision')::bigint,preview->>'fingerprint',gen_random_uuid())->>'outcome'='conflict','membership changes invalidate preview');
end $$;

-- An actually unused academy offering can be removed without deleting the catalog.
select pg_temp.check(pg_temp.apply('{"operation":"add_level","levelId":"secondary-1"}')->>'outcome'='committed','Admin adds level');
select pg_temp.check(pg_temp.apply('{"operation":"remove_level","levelId":"secondary-1"}')->>'outcome'='committed','unused offering removed');
select pg_temp.check((select count(*)=1 from public.global_levels where id='secondary-1'),'catalog retained');
select pg_temp.check(pg_temp.apply('{"operation":"remove_level","levelId":"secondary-2"}')->>'outcome'='blocked','student and child tracks block deletion');

do $$ declare actor uuid;
begin
  foreach actor in array array['ed129001-0000-4000-8000-000000000004','ed129001-0000-4000-8000-000000000005',
    'ed129001-0000-4000-8000-000000000006']::uuid[] loop
    perform pg_temp.act(actor);
    perform pg_temp.check(pg_temp.fails($q$select public.preview_offering_change('ed129000-0000-4000-8000-000000000001',
      '{"operation":"add_level","levelId":"secondary-1"}')$q$),'instructor/suspended/cross-academy mutation denied');
  end loop;
  perform pg_temp.act(null);
  perform pg_temp.check(pg_temp.fails($q$select public.get_academy_structure('ed129000-0000-4000-8000-000000000001')$q$),'unauthenticated read denied');
end $$;

-- Protected-transition scenarios. The release switch changes only inside this rolled-back suite.
reset role;
update edra_private.offering_release set enabled=true;
select pg_temp.act('ed129001-0000-4000-8000-000000000001');
create function pg_temp.academy() returns uuid language sql as $$select 'ed129000-0000-4000-8000-000000000001'::uuid$$;
create function pg_temp.year() returns uuid language sql as $$select id from public.academic_years where academy_id=pg_temp.academy() and closed_at is null$$;
create function pg_temp.id(key text) returns uuid language sql as $$select current_setting('test.structure_'||key)::uuid$$;
create function pg_temp.exam_draft(track uuid default null) returns jsonb language sql as $$select jsonb_build_object(
  'title','Offering exam','audience',case when track is null then 'level' else 'program' end,'level_id','secondary-2','track_id',track,'time_limit_minutes',60,
  'parts',jsonb_build_array(jsonb_build_object('title','Sheet','kind','question_sheet','questions',jsonb_build_array(jsonb_build_object(
    'prompt','One?','max_score','2','choices','[{"label":"A","is_correct":true},{"label":"B"}]'::jsonb)))))$$;
create function pg_temp.assignment_draft(track uuid default null) returns jsonb language sql as $$select jsonb_build_object(
  'title','Offering assignment','audience',case when track is null then 'level' else 'program' end,'level_id','secondary-2','track_id',track,
  'parts',jsonb_build_array(jsonb_build_object('title','Written','kind','file_upload','questions',jsonb_build_array(jsonb_build_object('prompt','','max_score','5')))))$$;
select set_config('test.structure_sci',id::text,true) from public.academy_tracks where academy_id=pg_temp.academy() and name='Science';
select pg_temp.apply('{"operation":"add_track","levelId":"secondary-2","name":"Literature"}');
select set_config('test.structure_lit',id::text,true) from public.academy_tracks where academy_id=pg_temp.academy() and name='Literature';
select pg_temp.apply('{"operation":"add_track","levelId":"secondary-2","name":"Empty"}');
select set_config('test.structure_empty',id::text,true) from public.academy_tracks where academy_id=pg_temp.academy() and name='Empty';
update public.academic_years set start_year=extract(year from now())::integer+1 where id=pg_temp.year();
select set_config('test.structure_g1',gen_random_uuid()::text,true),set_config('test.structure_g2',gen_random_uuid()::text,true);
insert into public.groups(id,academy_id,academic_year_id,level_id,track_id,name) values
  (pg_temp.id('g1'),pg_temp.academy(),pg_temp.year(),'secondary-2',pg_temp.id('sci'),'Evening'),
  (pg_temp.id('g2'),pg_temp.academy(),pg_temp.year(),'secondary-2',pg_temp.id('lit'),'Evening');
select set_config('test.structure_r1',id::text,true) from public.create_student_record(pg_temp.academy(),pg_temp.year(),'Science pupil','01069129021','01269129001','secondary-2',pg_temp.id('sci'),pg_temp.id('g1'),'in_person');
select set_config('test.structure_r2',id::text,true) from public.create_student_record(pg_temp.academy(),pg_temp.year(),'Literature pupil','01069129022','01269129001','secondary-2',pg_temp.id('lit'),pg_temp.id('g2'),'in_person');
select set_config('test.structure_e1',gen_random_uuid()::text,true),set_config('test.structure_e2',gen_random_uuid()::text,true),set_config('test.structure_e0',gen_random_uuid()::text,true);
select public.create_exam(pg_temp.academy(),pg_temp.year(),pg_temp.id('e1'),pg_temp.exam_draft(pg_temp.id('sci')));
select public.create_exam(pg_temp.academy(),pg_temp.year(),pg_temp.id('e2'),pg_temp.exam_draft()||jsonb_build_object('audience','groups','level_id',null,'group_ids',jsonb_build_array(pg_temp.id('g1'))));
select public.create_exam(pg_temp.academy(),pg_temp.year(),pg_temp.id('e0'),pg_temp.exam_draft(pg_temp.id('empty')));
select public.configure_exam_availability(pg_temp.academy(),pg_temp.id('e1'),1,clock_timestamp()-interval '2 hours',clock_timestamp()+interval '2 hours');
select set_config('test.structure_assignment',gen_random_uuid()::text,true),set_config('test.structure_closed',gen_random_uuid()::text,true);
select public.create_assignment(pg_temp.academy(),pg_temp.year(),pg_temp.id('assignment'),pg_temp.assignment_draft(pg_temp.id('sci')));
select public.create_assignment(pg_temp.academy(),pg_temp.year(),pg_temp.id('closed'),pg_temp.assignment_draft(pg_temp.id('sci')));
select public.change_assignment_state(pg_temp.academy(),pg_temp.id('closed'),(select version from public.assignments where id=pg_temp.id('closed')),'close');
select set_config('test.structure_cohort',(select jsonb_agg(to_jsonb(m) order by annual_student_record_id)::text from public.assignment_cohort_members m where assignment_id in(pg_temp.id('assignment'),pg_temp.id('closed'))),true);
select set_config('test.structure_u1',gen_random_uuid()::text,true),set_config('test.structure_u2',gen_random_uuid()::text,true);
select public.create_content_unit(pg_temp.academy(),pg_temp.year(),'secondary-2',pg_temp.id('sci'),pg_temp.id('u1'),'Science lesson');
select public.create_content_unit(pg_temp.academy(),pg_temp.year(),'secondary-2',pg_temp.id('lit'),pg_temp.id('u2'),'Literature lesson');
select set_config('test.structure_quiz',public.create_content_assessment(pg_temp.academy(),pg_temp.id('u1'),1,'quiz','Attached quiz')::text,true);
select set_config('test.structure_programs',(select jsonb_agg(program_id order by id)::text from public.content_units where id in(pg_temp.id('u1'),pg_temp.id('u2'))),true);

-- A completed teaching snapshot must be byte-for-byte unchanged by retirement.
select set_config('test.structure_schedule',public.create_schedule(
  pg_temp.academy(),pg_temp.year(),'Science teaching','recurring','group',pg_temp.id('g1'),null,null,true,null,
  '[{"weekday":1,"startsAt":"16:00","endsAt":"17:00"}]'::jsonb,'[]'::jsonb)::text,true);
select set_config('test.structure_session',session_id::text,true) from public.start_session(pg_temp.academy(),pg_temp.id('schedule'),gen_random_uuid());
select public.end_session(pg_temp.academy(),pg_temp.id('session'));
select set_config('test.structure_history',jsonb_build_object('session',(select to_jsonb(s) from public.sessions s where id=pg_temp.id('session')),
  'roster',(select jsonb_agg(to_jsonb(r) order by annual_student_record_id) from public.session_roster_entries r where session_id=pg_temp.id('session')))::text,true);
select pg_temp.check(pg_temp.apply(jsonb_build_object('operation','remove_track','levelId','secondary-2','trackId',pg_temp.id('sci')))->>'outcome'='committed','used track retirement commits');
select pg_temp.check((select primary_group_id=pg_temp.id('g1') and track_id is null from public.annual_student_records where id=pg_temp.id('r1')),'primary group retained when track clears');
select pg_temp.check((select retired_track_id=pg_temp.id('sci') and track_id is null from public.groups where id=pg_temp.id('g1')),'group broadens with protected lineage');
select pg_temp.check(edra_private.exam_is_eligible(pg_temp.id('e1'),pg_temp.id('r1')) and edra_private.exam_is_eligible(pg_temp.id('e2'),pg_temp.id('r1')),'captured pupil without prior work remains eligible for direct/group exams');
select pg_temp.check(not edra_private.exam_is_eligible(pg_temp.id('e1'),current_setting('test.structure_record')::uuid),'level-only late match is not captured');
select pg_temp.check((select track_id=pg_temp.id('sci') from public.assignments where id=pg_temp.id('closed')),'closed assignment keeps original identity');
select pg_temp.check((select track_id is null and cohort_revision=1 and recipient_count=1 from public.assignments where id=pg_temp.id('assignment')),'active assignment broadens without recapturing required cohort');
select pg_temp.check((select jsonb_agg(to_jsonb(m) order by annual_student_record_id) from public.assignment_cohort_members m where assignment_id in(pg_temp.id('assignment'),pg_temp.id('closed')))=current_setting('test.structure_cohort')::jsonb,'required cohort and closed cohort history unchanged');
select pg_temp.check((select jsonb_agg(program_id order by id) from public.content_units where id in(pg_temp.id('u1'),pg_temp.id('u2')))=current_setting('test.structure_programs')::jsonb,'distinct content identities retained');
select pg_temp.check((select track_id is null and audience='level' from public.quizzes where id=pg_temp.id('quiz')),'content-owned quiz follows program broadening');
select pg_temp.check(jsonb_build_object('session',(select to_jsonb(s) from public.sessions s where id=pg_temp.id('session')),
  'roster',(select jsonb_agg(to_jsonb(r) order by annual_student_record_id) from public.session_roster_entries r where session_id=pg_temp.id('session')))=current_setting('test.structure_history')::jsonb,'session/roster snapshots unchanged');
select set_config('test.structure_late',id::text,true) from public.create_student_record(pg_temp.academy(),pg_temp.year(),'Later pupil','01069129023','01269129001','secondary-2',pg_temp.id('lit'),pg_temp.id('g1'),'in_person');
select pg_temp.check(not edra_private.exam_is_eligible(pg_temp.id('e2'),pg_temp.id('late')),'later group arrival denied by fixed roster');
select pg_temp.check(not exists(select 1 from public.assignment_cohort_members where assignment_id=pg_temp.id('assignment') and annual_student_record_id=pg_temp.id('late')),'new assignment match is optional');
select edra_private.start_exam_attempt_for(pg_temp.id('e1'),pg_temp.id('r1'));
select pg_temp.check(exists(select 1 from public.exam_attempts where exam_id=pg_temp.id('e1') and annual_student_record_id=pg_temp.id('r1')),'captured pupil starts after retirement');
select pg_temp.check(pg_temp.apply(jsonb_build_object('operation','remove_track','levelId','secondary-2','trackId',pg_temp.id('empty')))->>'outcome'='committed','empty exam roster captured');
select pg_temp.check((select roster_frozen_at is not null from public.exams where id=pg_temp.id('e0')) and not edra_private.exam_is_eligible(pg_temp.id('e0'),pg_temp.id('r1')),'empty fixed roster never falls back to live eligibility');
select pg_temp.apply(jsonb_build_object('operation','remove_track','levelId','secondary-2','trackId',pg_temp.id('lit')));
select pg_temp.check((select count(*)=2 from public.groups where id in(pg_temp.id('g1'),pg_temp.id('g2')) and name='Evening' and track_id is null),'both names and IDs survive final track removal');
select pg_temp.check(pg_temp.fails(format('insert into public.groups(academy_id,academic_year_id,level_id,name) values(%L,%L,''secondary-2'',''Evening'')',pg_temp.academy(),pg_temp.year())),'ordinary create cannot exploit the duplicate exception');
select pg_temp.check(pg_temp.fails(format('update public.groups set retired_track_id=null where id=%L',pg_temp.id('g1'))),'lineage cannot be forged or erased');

-- Shutdown: ten enrolled students; shared work blocks until explicitly closed.
select pg_temp.apply('{"operation":"add_level","levelId":"secondary-3"}');
select set_config('test.structure_stopgroup',gen_random_uuid()::text,true);
insert into public.groups(id,academy_id,academic_year_id,level_id,name) values(pg_temp.id('stopgroup'),pg_temp.academy(),pg_temp.year(),'secondary-3','Stop group');
select set_config('test.structure_stop'||n,id::text,true) from generate_series(1,10) n cross join lateral public.create_student_record(
  pg_temp.academy(),pg_temp.year(),'Stop pupil '||n,'010691291'||lpad(n::text,2,'0'),'01269129001','secondary-3',null,pg_temp.id('stopgroup'),'in_person');
select set_config('test.structure_stopschedule',public.create_schedule(
  pg_temp.academy(),pg_temp.year(),'Stop teaching','recurring','group',pg_temp.id('stopgroup'),null,null,true,null,
  '[{"weekday":1,"startsAt":"16:00","endsAt":"17:00"}]'::jsonb,'[]'::jsonb)::text,true);
select set_config('test.structure_live',session_id::text,true) from public.start_session(pg_temp.academy(),pg_temp.id('stopschedule'),gen_random_uuid());
select pg_temp.check(pg_temp.apply('{"operation":"stop_level","levelId":"secondary-3"}')->>'outcome'='blocked','live session blocks shutdown');
select pg_temp.check((select count(*)=10 from public.annual_student_records where academy_id=pg_temp.academy() and level_id='secondary-3' and archived_at is null),'blocked shutdown has no partial archive');
select public.end_session(pg_temp.academy(),pg_temp.id('live'));
select set_config('test.structure_shared',gen_random_uuid()::text,true);
select public.create_assignment(pg_temp.academy(),pg_temp.year(),pg_temp.id('shared'),pg_temp.assignment_draft()||jsonb_build_object('audience','groups','level_id',null,'group_ids',jsonb_build_array(pg_temp.id('g1'),pg_temp.id('stopgroup'))));
select pg_temp.check((public.preview_offering_change(pg_temp.academy(),'{"operation":"stop_level","levelId":"secondary-3"}')->'blockers'->>'sharedAssessments')::integer=1,'cross-level open assignment is an actionable blocker');
select pg_temp.check(pg_temp.apply('{"operation":"stop_level","levelId":"secondary-3"}')->>'outcome'='blocked','shared assessment blocks stop');
select public.change_assignment_state(pg_temp.academy(),pg_temp.id('shared'),(select version from public.assignments where id=pg_temp.id('shared')),'close');
select set_config('test.structure_stopexam',gen_random_uuid()::text,true);
select public.create_exam(pg_temp.academy(),pg_temp.year(),pg_temp.id('stopexam'),pg_temp.exam_draft()||'{"level_id":"secondary-3"}');
select public.configure_exam_availability(pg_temp.academy(),pg_temp.id('stopexam'),1,clock_timestamp()-interval '2 hours',clock_timestamp()+interval '2 hours');
select edra_private.start_exam_attempt_for(pg_temp.id('stopexam'),pg_temp.id('stop1'));
select pg_temp.check(pg_temp.apply('{"operation":"stop_level","levelId":"secondary-3"}')->>'outcome'='blocked','running exam is not force-submitted by shutdown');
select edra_private.submit_exam_attempt_for(pg_temp.id('stopexam'),pg_temp.id('stop1'),gen_random_uuid());
-- Seed one genuinely due attempt with ordinary constraints/triggers enabled, like a delayed worker.
insert into public.exam_work(exam_id,annual_student_record_id,academy_id,academic_year_id) values(pg_temp.id('stopexam'),pg_temp.id('stop2'),pg_temp.academy(),pg_temp.year());
insert into public.exam_attempts(exam_id,annual_student_record_id,academy_id,started_at,deadline_at)
  values(pg_temp.id('stopexam'),pg_temp.id('stop2'),pg_temp.academy(),clock_timestamp()-interval '61 minutes',clock_timestamp()-interval '1 minute');
select pg_temp.check(pg_temp.apply('{"operation":"stop_level","levelId":"secondary-3"}')->>'outcome'='committed','due work settles and shutdown commits');
select pg_temp.check((select finalization_reason='timer' and finalized_at is not null from public.exam_attempts where exam_id=pg_temp.id('stopexam') and annual_student_record_id=pg_temp.id('stop2')),'due attempt settles through ordinary timer logic');
select pg_temp.check((select count(*)=10 from public.annual_student_records where academy_id=pg_temp.academy() and level_id='secondary-3' and archived_at is not null),'all ten annual records archived');
select pg_temp.check((select archived_at is not null from public.groups where id=pg_temp.id('stopgroup')) and (select archived_at is not null from public.schedules where id=pg_temp.id('stopschedule')),'groups and schedules stop together');
select pg_temp.check(pg_temp.fails(format('select public.start_session(%L,%L,gen_random_uuid())',pg_temp.academy(),pg_temp.id('stopschedule'))),'fresh start denied after shutdown');
select pg_temp.check(pg_temp.fails(format('select public.set_student_records_archived(%L,%L,%L,false)',pg_temp.academy(),pg_temp.year(),jsonb_build_array(jsonb_build_object('id',pg_temp.id('stop1'),'version',(select version from public.annual_student_records where id=pg_temp.id('stop1')))))),'restore while stopped denied');
select pg_temp.check(pg_temp.fails(format('select edra_private.start_exam_attempt_for(%L,%L)',pg_temp.id('stopexam'),pg_temp.id('stop3'))),'new attempt denied after stop');
select public.save_exam_marks(pg_temp.academy(),pg_temp.id('stopexam'),pg_temp.id('stop1'),(select version from public.exam_work where exam_id=pg_temp.id('stopexam') and annual_student_record_id=pg_temp.id('stop1')),'{"feedback":"Reviewed after shutdown"}',gen_random_uuid());
select pg_temp.check((select feedback='Reviewed after shutdown' from public.exam_work where exam_id=pg_temp.id('stopexam') and annual_student_record_id=pg_temp.id('stop1')),'accepted work remains markable after archival');
select pg_temp.apply('{"operation":"resume_level","levelId":"secondary-3"}');
select pg_temp.check((select count(*)=10 from public.annual_student_records where academy_id=pg_temp.academy() and level_id='secondary-3' and archived_at is not null),'resume does not restore students');
select pg_temp.check((select offering_closed_at is not null from public.exams where id=pg_temp.id('stopexam')),'resume does not reopen assessments');
select public.set_student_records_archived(pg_temp.academy(),pg_temp.year(),jsonb_build_array(jsonb_build_object('id',pg_temp.id('stop1'),'version',(select version from public.annual_student_records where id=pg_temp.id('stop1')))),false);
select pg_temp.check((select archived_at is null from public.annual_student_records where id=pg_temp.id('stop1')),'explicit compatible restore works after resume');
select pg_temp.check(pg_temp.apply('{"operation":"remove_level","levelId":"secondary-3"}')->>'outcome'='blocked','archived and assessed history prevent permanent removal');

reset role;
rollback;
