-- EDRA-81: student assignment journey. Marked isolated / disposable CI only; everything rolls back.
begin;
do $$ begin
  if (select count(*) from edra_db_test.target)<>1 then raise exception 'Isolated Edra test target required'; end if;
end $$;
create temporary table sa_ids(name text primary key,id uuid not null default gen_random_uuid());
insert into sa_ids(name) values('owner'),('instructor'),('student'),('inperson'),('other-level'),('outsider'),('academy'),('other-academy'),
  ('choice'),('written'),('attached'),('unit'),('video'),('answer-video'),('explanation'),('t1'),('t2'),('t3'),('t4'),('t5'),('t6'),('t7');
grant select on sa_ids to authenticated, service_role;
create function pg_temp.sid(label text) returns uuid language sql as $$ select id from pg_temp.sa_ids where name=label $$;
create function pg_temp.act(label text) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claims','',true);
  perform set_config('edra.verified_session','',true);
  perform set_config('request.jwt.claim.sub',pg_temp.sid(label)::text,true);
end $$;
create function pg_temp.check(ok boolean,label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'Student assignment assertion: %',label; end if; end $$;
create function pg_temp.fails(statement text,expected text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then
    if position(expected in sqlerrm)>0 then return; end if;
    raise exception 'Expected %, received %',expected,sqlerrm;
  end;
  raise exception 'Expected % but operation succeeded',expected;
end $$;
-- Command helper: builds the JSON input for the caller's editor.
create function pg_temp.cmd(target text,operation text,token text,extra jsonb default '{}') returns jsonb language sql as $$
  select public.assignment_student_command(jsonb_build_object('academyId',pg_temp.sid('academy'),'assignmentId',pg_temp.sid(target),
    'operation',operation,'token',pg_temp.sid(token))||extra) $$;
create function pg_temp.cmd_sql(target text,operation text,token text,extra jsonb default '{}') returns text language sql as $$
  select format('select public.assignment_student_command(%L::jsonb)',(jsonb_build_object('academyId',pg_temp.sid('academy'),'assignmentId',pg_temp.sid(target),
    'operation',operation,'token',pg_temp.sid(token))||extra)::text) $$;
create function pg_temp.doc(target text) returns jsonb language sql security definer as $$ select edra_private.assignment_json(pg_temp.sid(target)) $$;

insert into auth.users(id) select id from sa_ids where name in ('owner','instructor','student','inperson','other-level','outsider');
insert into public.academies(id,name,slug,icon,subject,created_by) values
  (pg_temp.sid('academy'),'Assignment journey','journey-'||pg_temp.sid('academy'),'school','Math',pg_temp.sid('owner')),
  (pg_temp.sid('other-academy'),'Other journey','journey-b-'||pg_temp.sid('other-academy'),'school','Math',pg_temp.sid('outsider'));
insert into sa_ids(name,id) select 'year',id from public.academic_years where academy_id=pg_temp.sid('academy');
insert into public.academy_memberships(academy_id,user_id,role,created_by) values
  (pg_temp.sid('academy'),pg_temp.sid('owner'),'owner',pg_temp.sid('owner')),
  (pg_temp.sid('academy'),pg_temp.sid('instructor'),'instructor',pg_temp.sid('owner')),
  (pg_temp.sid('other-academy'),pg_temp.sid('outsider'),'owner',pg_temp.sid('outsider'));
insert into public.academy_levels(academy_id,level_id,sort_order) values(pg_temp.sid('academy'),'secondary-1',0),(pg_temp.sid('academy'),'secondary-2',1);
select pg_temp.act('owner');
insert into sa_ids(name,id) select 'record-'||label,(public.create_student_record(pg_temp.sid('academy'),pg_temp.sid('year'),'Journey '||label,'0108818000'||n,'01188179999',level,null,null,kind::public.student_participation_type)).id
  from (values('student',1,'secondary-1','online_only'),('inperson',2,'secondary-1','in_person'),('other-level',3,'secondary-2','online_only')) v(label,n,level,kind);
update public.academy_student_profiles profile set user_id=pg_temp.sid(substr(ids.name,8)),linked_at=now()
  from public.annual_student_records r join sa_ids ids on ids.id=r.id and ids.name like 'record-%'
  where profile.id=r.academy_student_profile_id;

-- Choice-only (automatic), Written Work (manual) and unit-attached assignments.
create function pg_temp.choices(correct integer) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('label','Option '||n,'is_correct',n=correct) order by n) from generate_series(1,3) n $$;
set local role authenticated;
select public.create_assignment(pg_temp.sid('academy'),pg_temp.sid('year'),pg_temp.sid('choice'),jsonb_build_object('title','Choice work','audience','level','level_id','secondary-1',
  'parts',jsonb_build_array(
    jsonb_build_object('title','Questions','kind','online_questions','questions',jsonb_build_array(
      jsonb_build_object('prompt','Two plus two?','max_score','2','choices',pg_temp.choices(1)),
      jsonb_build_object('prompt','Three plus three?','max_score','3','choices',pg_temp.choices(2)))),
    jsonb_build_object('title','Sheet','kind','answer_sheet','questions',jsonb_build_array(
      jsonb_build_object('prompt','','max_score','1','choices',pg_temp.choices(3)))))));
select public.create_assignment(pg_temp.sid('academy'),pg_temp.sid('year'),pg_temp.sid('written'),jsonb_build_object('title','Written work','audience','level','level_id','secondary-1',
  'parts',jsonb_build_array(
    jsonb_build_object('title','Quick','kind','online_questions','questions',jsonb_build_array(
      jsonb_build_object('prompt','Pick one','max_score','1','choices',pg_temp.choices(1)))),
    jsonb_build_object('title','Essay','kind','file_upload','questions',jsonb_build_array(jsonb_build_object('prompt','','max_score','5'))))));
select public.create_assignment(pg_temp.sid('academy'),pg_temp.sid('year'),pg_temp.sid('attached'),jsonb_build_object('title','Unit work','audience','level','level_id','secondary-1',
  'parts',jsonb_build_array(jsonb_build_object('title','Questions','kind','online_questions','questions',jsonb_build_array(
    jsonb_build_object('prompt','Unit question','max_score','4','choices',pg_temp.choices(1)))))));
select public.create_content_unit(pg_temp.sid('academy'),pg_temp.sid('year'),'secondary-1',null,pg_temp.sid('unit'),'Unit');
reset role;
insert into public.content_assets(id,academy_id,unit_id,created_by,kind,name,mime_type,status,playback_id)
  select x.id,pg_temp.sid('academy'),pg_temp.sid('unit'),pg_temp.sid('owner'),'video',x.name,'video/mp4','ready','playback-'||x.name
  from sa_ids x where x.name in ('explanation','answer-video');
create function pg_temp.grant_id() returns uuid language sql security definer as $$
  select current_grant_id from public.content_access_accounts where annual_record_id=pg_temp.sid('record-student') and unit_id=pg_temp.sid('unit') $$;
set local role authenticated;
select public.save_content_unit(pg_temp.sid('academy'),pg_temp.sid('unit'),1,jsonb_build_object('title','Unit','description','','accessDays',7,'items',jsonb_build_array(
  jsonb_build_object('id',pg_temp.sid('explanation'),'kind','explanation','title','Explanation','assetId',pg_temp.sid('explanation')),
  jsonb_build_object('id',pg_temp.sid('video'),'kind','assessment','title','Unit work','assessmentKind','assignment','assessmentId',pg_temp.sid('attached')),
  jsonb_build_object('id',pg_temp.sid('answer-video'),'kind','answer','title','Solution','assetId',pg_temp.sid('answer-video'),'assessmentKind','assignment','assessmentId',pg_temp.sid('attached')))));

-- Discovery: standalone work is listed; the unpublished attachment is still standalone.
select pg_temp.act('student');
do $$ declare page jsonb; one jsonb; begin
  page:=public.list_my_assignments(pg_temp.sid('academy'));
  perform pg_temp.check(jsonb_array_length(page->'items')=3,'three listed before unit publication');
  perform pg_temp.check(jsonb_array_length(public.list_my_assignments(pg_temp.sid('academy'),0,'',gen_random_uuid())->'items')=0,'unit filter excludes other units');
  one:=public.get_my_assignment(pg_temp.sid('academy'),pg_temp.sid('attached'));
  perform pg_temp.check(one->'unit'='null'::jsonb and (one->>'canEdit')::boolean,'working attachment is not authority');
  one:=public.get_my_assignment(pg_temp.sid('academy'),pg_temp.sid('choice'));
  perform pg_temp.check((one->>'canEdit')::boolean and (one->>'required')::boolean and one->'receipt'='null'::jsonb,'overview action state');
  perform pg_temp.check(not jsonb_path_exists(one,'$.**.prompt') and not jsonb_path_exists(one,'$.**.is_correct') and not jsonb_path_exists(one,'$.**.choices'),'overview has no protected material');
  perform pg_temp.fails(format('select public.get_my_assignment(%L,%L)',pg_temp.sid('other-academy'),pg_temp.sid('choice')),'not_found');
end $$;
reset role;
select pg_temp.check(not exists(select 1 from edra_private.assignment_online_drafts),'reads create no drafts');
set local role authenticated;
select pg_temp.act('other-level');
select pg_temp.check(jsonb_array_length(public.list_my_assignments(pg_temp.sid('academy'))->'items')=0,'other level sees nothing');
select pg_temp.fails(format('select public.get_my_assignment(%L,%L)',pg_temp.sid('academy'),pg_temp.sid('choice')),'not_found');
select pg_temp.act('outsider');
select pg_temp.fails(format('select public.list_my_assignments(%L)',pg_temp.sid('academy')),'student_unavailable');
select pg_temp.fails(format('select public.get_my_assignment(%L,%L)',pg_temp.sid('academy'),pg_temp.sid('choice')),'student_unavailable');

-- Editor: claim, busy, explicit transfer and stale-generation fencing.
select pg_temp.act('student');
do $$ declare d jsonb; q1 text; q2 text; q3 text; c jsonb; begin
  d:=pg_temp.cmd('choice','claim','t1');
  perform pg_temp.check((d->>'generation')::integer=1 and jsonb_array_length(d->'parts')=2,'first claim');
  perform pg_temp.check(not jsonb_path_exists(d,'$.**.is_correct') and not jsonb_path_exists(d,'$.**.max_score'),'editor has no key or marks');
  perform pg_temp.check(d#>>'{parts,1,questions,0,choices,0,label}'='' and d#>>'{parts,0,questions,0,choices,0,label}'='Option 1','answer sheet shows letters only');
  perform pg_temp.check(pg_temp.cmd('choice','claim','t2')->>'busy'='true','second device is busy');
  d:=pg_temp.cmd('choice','claim','t2','{"transfer":true}');
  perform pg_temp.check((d->>'generation')::integer=2,'explicit transfer advances generation');
  perform pg_temp.fails(pg_temp.cmd_sql('choice','read','t1'),'editor_stale');
  q1:=d#>>'{parts,0,questions,0,id}'; q2:=d#>>'{parts,0,questions,1,id}'; q3:=d#>>'{parts,1,questions,0,id}';
  perform pg_temp.fails(pg_temp.cmd_sql('choice','save','t1',jsonb_build_object('generation',1,'version',0,'key',gen_random_uuid(),'answers',jsonb_build_object(q1,d#>>'{parts,0,questions,0,choices,0,id}'))),'editor_stale');
  -- The first saved answer selects online work and creates the recipient.
  c:=jsonb_build_object('generation',2,'version',0,'key',pg_temp.sid('t3'),'answers',jsonb_build_object(q1,d#>>'{parts,0,questions,0,choices,0,id}',q3,d#>>'{parts,1,questions,0,choices,1,id}'));
  perform pg_temp.check(pg_temp.cmd('choice','save','t2',c)->>'version'='1','first save');
  perform pg_temp.check(pg_temp.cmd('choice','save','t2',c)->>'version'='1','exact retry replays');
  perform pg_temp.fails(pg_temp.cmd_sql('choice','save','t2',c||jsonb_build_object('answers',jsonb_build_object(q1,null))),'idempotency_conflict');
  perform pg_temp.fails(pg_temp.cmd_sql('choice','save','t2',c||jsonb_build_object('key',gen_random_uuid())),'draft_conflict');
  perform pg_temp.fails(pg_temp.cmd_sql('choice','save','t2',c||jsonb_build_object('key',gen_random_uuid(),'version',1,'answers',jsonb_build_object(q1,gen_random_uuid()))),'validation');
  perform pg_temp.check(public.get_my_assignment(pg_temp.sid('academy'),pg_temp.sid('choice'))->>'started'='true','overview reports started draft');
end $$;

-- Online draft locks out separate physical work and premature publication.
select pg_temp.act('instructor');
select pg_temp.fails(format('select public.record_assignment_work(%L,%L,%L,2,''submitted'',now(),'''')',pg_temp.sid('academy'),pg_temp.sid('choice'),pg_temp.sid('record-student')),'source_locked');
select pg_temp.fails(format('select public.publish_assignment_results(%L,%L,%L::jsonb,%L)',pg_temp.sid('academy'),pg_temp.sid('choice'),
  jsonb_build_array(jsonb_build_object('annual_student_record_id',pg_temp.sid('record-student'),'expected_version',1))::text,gen_random_uuid()),'online_draft');

-- Closing blocks the draft without deleting it; reopening continues.
select pg_temp.act('owner');
select public.change_assignment_state(pg_temp.sid('academy'),pg_temp.sid('choice'),(pg_temp.doc('choice')->>'version')::integer,'close');
select pg_temp.act('student');
select pg_temp.check(public.get_my_assignment(pg_temp.sid('academy'),pg_temp.sid('choice'))->>'blockedReason'='assignment_closed','closed reason');
select pg_temp.fails(pg_temp.cmd_sql('choice','read','t2'),'assignment_closed');
select pg_temp.act('owner');
select public.change_assignment_state(pg_temp.sid('academy'),pg_temp.sid('choice'),(pg_temp.doc('choice')->>'version')::integer,'reopen');
select pg_temp.act('student');
do $$ declare d jsonb; first_receipt jsonb; key uuid:=gen_random_uuid(); payload jsonb; begin
  d:=pg_temp.cmd('choice','claim','t2');
  perform pg_temp.check(d->>'version'='1' and jsonb_typeof(d->'answers')='object' and (select count(*) from jsonb_object_keys(d->'answers'))=2,'draft kept across closure');
  perform pg_temp.fails(pg_temp.cmd_sql('choice','submit','t2',jsonb_build_object('generation',2,'version',1,'key',key,'scoringRevision',99)),'draft_conflict');
  payload:=jsonb_build_object('generation',2,'version',1,'key',key,'scoringRevision',(d->>'scoringRevision')::integer);
  first_receipt:=pg_temp.cmd('choice','submit','t2',payload);
  perform pg_temp.check(first_receipt->'receipt'->>'late'='false' and first_receipt->'result'->>'total'='2.00' and first_receipt->'result'->>'maxScore'='6.00','automatic result announced');
  perform pg_temp.check(pg_temp.cmd('choice','submit','t2',payload)->'receipt'=first_receipt->'receipt','submit retry returns the original receipt');
  perform pg_temp.fails(pg_temp.cmd_sql('choice','read','t2'),'submitted');
  perform pg_temp.check(not jsonb_path_exists(first_receipt,'$.**.marks') and not jsonb_path_exists(first_receipt,'$.**.answers'),'receipt hides per-part marks and submitted answers');
end $$;
reset role;
select pg_temp.check((select count(*)=1 from public.assignment_result_publications where assignment_id=pg_temp.sid('choice')),'one publication');
select pg_temp.check((select count(*)=1 from public.assignment_online_submissions where assignment_id=pg_temp.sid('choice')),'one submission');
select pg_temp.check((select count(*)=3 from public.assignment_question_answers where assignment_id=pg_temp.sid('choice') and annual_student_record_id=pg_temp.sid('record-student')),'blank answers recorded');
select pg_temp.fails(format('update public.assignment_online_submissions set late=true where assignment_id=%L',pg_temp.sid('choice')),'validation');

-- Earlier unannounced physical work becomes history when the in-person student starts online work.
set local role authenticated;
select pg_temp.act('inperson');
select pg_temp.check(public.get_my_assignment(pg_temp.sid('academy'),pg_temp.sid('choice'))->>'blockedReason'='in_person_disabled','in-person online disabled by default');
select pg_temp.act('instructor');
select pg_temp.fails(format('select public.assignment_online_setting(%L,true,1)',pg_temp.sid('academy')),'forbidden');
do $$ declare part uuid; begin
  part:=(pg_temp.doc('choice')#>>'{parts,0,id}')::uuid;
  perform public.save_assignment_marks(pg_temp.sid('academy'),pg_temp.sid('choice'),pg_temp.sid('record-inperson'),null,
    (select (r->>'version')::integer from jsonb_array_elements(public.list_assignment_marks(pg_temp.sid('academy'),pg_temp.sid('choice'))->'items') r
      where r->>'annual_student_record_id'=pg_temp.sid('record-inperson')::text),
    jsonb_build_object('marks',jsonb_build_array(jsonb_build_object('part_id',part,'score','1'))),gen_random_uuid());
end $$;
select pg_temp.act('owner');
select pg_temp.check(public.assignment_online_setting(pg_temp.sid('academy'),true,1)->>'enabled'='true','manager enables in-person online work');
select pg_temp.act('inperson');
do $$ declare d jsonb; begin
  d:=pg_temp.cmd('choice','claim','t4');
  perform pg_temp.cmd('choice','save','t4',jsonb_build_object('generation',1,'version',0,'key',gen_random_uuid(),
    'answers',jsonb_build_object(d#>>'{parts,0,questions,0,id}',d#>>'{parts,0,questions,0,choices,0,id}')));
end $$;
reset role;
select pg_temp.check((select count(*)=1 from public.assignment_physical_history where record_id=pg_temp.sid('record-inperson'))
  and not exists(select 1 from public.assignment_marks where assignment_id=pg_temp.sid('choice') and annual_student_record_id=pg_temp.sid('record-inperson')),'physical draft preserved as history, not mixed in');
select pg_temp.check((select participation_type='in_person' from public.annual_student_records where id=pg_temp.sid('record-inperson')),'participation type unchanged');

-- Written Work: registration, attested bytes, required files, manual marking and staff file access.
set local role authenticated;
select pg_temp.act('student');
create temporary table sa_file(id uuid,path text,part uuid);
grant all on sa_file to authenticated, service_role;
do $$ declare d jsonb; f jsonb; part uuid; begin
  d:=pg_temp.cmd('written','claim','t5');
  part:=(d#>>'{parts,1,id}')::uuid;
  perform pg_temp.fails(pg_temp.cmd_sql('written','submit','t5',jsonb_build_object('generation',1,'version',0,'key',gen_random_uuid(),'scoringRevision',1)),'files_required');
  perform pg_temp.fails(pg_temp.cmd_sql('written','register','t5',jsonb_build_object('generation',1,'key',gen_random_uuid(),'partId',part,'name','a.exe','mime','application/x-msdownload','size',10)),'validation');
  perform pg_temp.fails(pg_temp.cmd_sql('written','register','t5',jsonb_build_object('generation',1,'key',gen_random_uuid(),'partId',part,'name','big.pdf','mime','application/pdf','size',8388609)),'validation');
  f:=pg_temp.cmd('written','register','t5',jsonb_build_object('generation',1,'key',gen_random_uuid(),'partId',part,'name','work.pdf','mime','application/pdf','size',1234));
  insert into sa_file values((f->>'fileId')::uuid,f->>'path',part);
  perform pg_temp.check(f->>'path' like pg_temp.sid('academy')::text||'/'||pg_temp.sid('record-student')::text||'/%','owned storage path');
  perform pg_temp.fails(pg_temp.cmd_sql('written','finish','t5',jsonb_build_object('generation',1,'key',gen_random_uuid(),'fileId',f->>'fileId')),'file_unavailable');
  perform pg_temp.check(public.get_my_assignment(pg_temp.sid('academy'),pg_temp.sid('written'))->>'started'='false','unaccepted bytes select no source');
end $$;
reset role;
insert into storage.objects(bucket_id,name,metadata) select 'assignment-work',path,'{"size":1234}' from sa_file;
set local role service_role;
select public.attest_assignment_upload((select id from sa_file),repeat('a',64),1234,'application/pdf');
set local role authenticated;
select pg_temp.fails(format('select public.attest_assignment_upload(%L,%L,1234,''application/pdf'')',(select id from sa_file),repeat('b',64)),'permission denied');
select pg_temp.act('student');
do $$ declare key uuid:=gen_random_uuid(); r jsonb; begin
  perform pg_temp.cmd('written','finish','t5',jsonb_build_object('generation',1,'key',gen_random_uuid(),'fileId',(select id from sa_file)));
  perform pg_temp.check(public.get_my_assignment(pg_temp.sid('academy'),pg_temp.sid('written'))->>'started'='true','accepted file selects online source');
  r:=pg_temp.cmd('written','submit','t5',jsonb_build_object('generation',1,'version',0,'key',key,'scoringRevision',1));
  perform pg_temp.check(r->'receipt' is not null and r->'result'='null'::jsonb,'manual work waits for staff');
end $$;
reset role;
select pg_temp.fails(format('delete from public.assignment_work_files where id=%L',(select id from sa_file)),'history_immutable');
set local role authenticated;
select pg_temp.act('outsider');
select pg_temp.fails(format('select public.authorize_assignment_received_file(%L,%L)',pg_temp.sid('academy'),(select id from sa_file)),'forbidden');
select pg_temp.fails(format('select public.authorize_assignment_received_file(%L,%L)',pg_temp.sid('other-academy'),(select id from sa_file)),'not_found');
select pg_temp.act('instructor');
do $$ declare files jsonb; doc jsonb; version integer; begin
  files:=public.list_assignment_received_files(pg_temp.sid('academy'),pg_temp.sid('written'),pg_temp.sid('record-student'));
  perform pg_temp.check(jsonb_array_length(files->'files')=1 and files->>'submittedAt' is not null,'staff list accepted files');
  perform pg_temp.check(public.authorize_assignment_received_file(pg_temp.sid('academy'),(select id from sa_file))->>'path'=(select path from sa_file),'staff file authorization');
  doc:=pg_temp.doc('written');
  select (r->>'version')::integer into version from jsonb_array_elements(public.list_assignment_marks(pg_temp.sid('academy'),pg_temp.sid('written'))->'items') r
    where r->>'annual_student_record_id'=pg_temp.sid('record-student')::text;
  perform pg_temp.fails(format('select public.save_assignment_marks(%L,%L,%L,null,%s,%L::jsonb,%L)',pg_temp.sid('academy'),pg_temp.sid('written'),pg_temp.sid('record-student'),version,
    jsonb_build_object('marks',jsonb_build_array(jsonb_build_object('part_id',doc#>>'{parts,0,id}','score','1')))::text,gen_random_uuid()),'source_locked');
  perform public.save_assignment_marks(pg_temp.sid('academy'),pg_temp.sid('written'),pg_temp.sid('record-student'),null,version,
    jsonb_build_object('answers',jsonb_build_array(jsonb_build_object('question_id',doc#>>'{parts,1,questions,0,id}','score','4'))),gen_random_uuid());
  perform public.publish_assignment_results(pg_temp.sid('academy'),pg_temp.sid('written'),
    jsonb_build_array(jsonb_build_object('annual_student_record_id',pg_temp.sid('record-student'),'expected_version',version+1)),gen_random_uuid());
end $$;
select pg_temp.act('student');
select pg_temp.check(public.get_my_assignment(pg_temp.sid('academy'),pg_temp.sid('written'))->'result'->>'total'='4.00','manual result after staff announcement');

-- Published unit: entitlement gates work; earned answer videos play without explanation access.
select pg_temp.act('owner');
select public.change_content_unit(pg_temp.sid('academy'),pg_temp.sid('unit'),2,'publish');
select pg_temp.act('student');
do $$ declare one jsonb; unit jsonb; begin
  one:=public.get_my_assignment(pg_temp.sid('academy'),pg_temp.sid('attached'));
  perform pg_temp.check(one->'unit'->>'id'=pg_temp.sid('unit')::text and one->>'blockedReason'='entitlement_required','published unit requires entitlement');
  perform pg_temp.check(jsonb_array_length(one->'answerVideos')=0,'no answer videos before qualifying work');
  perform pg_temp.fails(format('select public.authorize_content_material(%L,%L,%L)',pg_temp.sid('academy'),pg_temp.sid('unit'),pg_temp.sid('answer-video')),'material_unavailable');
  unit:=public.get_my_content_unit(pg_temp.sid('academy'),pg_temp.sid('unit'));
  perform pg_temp.check(not (select (i->>'available')::boolean from jsonb_array_elements(unit->'items') i where i->>'kind'='assessment')
    and (select i->>'assessmentId'=pg_temp.sid('attached')::text from jsonb_array_elements(unit->'items') i where i->>'kind'='assessment'),'locked unit retains assignment metadata without an open action');
end $$;
reset role;
savepoint expired_assignment_link;
-- Immutable expired history is fixture-only; roll it back before the normal grant journey.
do $$ declare grant_id uuid:=gen_random_uuid(); begin
 insert into public.content_access_accounts(academy_id,academic_year_id,annual_record_id,unit_id)
 values(pg_temp.sid('academy'),pg_temp.sid('year'),pg_temp.sid('record-student'),pg_temp.sid('unit'));
 insert into public.content_access_grants(id,academy_id,academic_year_id,annual_record_id,unit_id,kind,actor_id,issued_at,starts_at,expires_at,duration_seconds)
 values(grant_id,pg_temp.sid('academy'),pg_temp.sid('year'),pg_temp.sid('record-student'),pg_temp.sid('unit'),'staff',pg_temp.sid('owner'),now()-interval '10 days',now()-interval '10 days',now()-interval '3 days',604800);
 update public.content_access_accounts set current_grant_id=grant_id where annual_record_id=pg_temp.sid('record-student') and unit_id=pg_temp.sid('unit');
end $$;
select pg_temp.check((select (i->>'available')::boolean from jsonb_array_elements(public.get_my_content_unit(pg_temp.sid('academy'),pg_temp.sid('unit'))->'items') i where i->>'kind'='assessment'),'expired unrevoked entitlement retains the assignment link');
select pg_temp.check(not edra_private.content_assignment_openable(pg_temp.sid('academy'),pg_temp.sid('unit'),gen_random_uuid(),pg_temp.sid('record-student')),'missing assignment has no open action');
select pg_temp.check(not edra_private.content_assignment_openable(pg_temp.sid('other-academy'),pg_temp.sid('unit'),pg_temp.sid('attached'),pg_temp.sid('record-student')),'cross-academy assignment has no open action');
rollback to savepoint expired_assignment_link;
set local role authenticated;
select pg_temp.act('instructor');
select public.confirm_content_access(pg_temp.sid('academy'),pg_temp.sid('unit'),pg_temp.sid('record-student'),gen_random_uuid(),null,1);
select pg_temp.act('student');
select pg_temp.check((select (i->>'available')::boolean from jsonb_array_elements(public.get_my_content_unit(pg_temp.sid('academy'),pg_temp.sid('unit'))->'items') i where i->>'kind'='assessment'),'active entitlement opens a visible assignment');
select pg_temp.act('owner');
select public.revoke_content_access(pg_temp.sid('academy'),pg_temp.sid('unit'),pg_temp.sid('record-student'),gen_random_uuid(),'Revoked for test',
  pg_temp.grant_id());
select pg_temp.act('student');
select pg_temp.check(public.get_my_assignment(pg_temp.sid('academy'),pg_temp.sid('attached'))->>'blockedReason'='entitlement_required','revoked head never falls back');
select pg_temp.check(not (select (i->>'available')::boolean from jsonb_array_elements(public.get_my_content_unit(pg_temp.sid('academy'),pg_temp.sid('unit'))->'items') i where i->>'kind'='assessment'),'revoked entitlement removes the assignment open action');
select pg_temp.act('instructor');
select public.confirm_content_access(pg_temp.sid('academy'),pg_temp.sid('unit'),pg_temp.sid('record-student'),gen_random_uuid(),
  pg_temp.grant_id(),1);
select pg_temp.act('student');
do $$ declare d jsonb; r jsonb; begin
  perform pg_temp.check((public.get_my_assignment(pg_temp.sid('academy'),pg_temp.sid('attached'))->>'canEdit')::boolean,'current entitlement permits work');
  d:=pg_temp.cmd('attached','claim','t6');
  perform pg_temp.cmd('attached','save','t6',jsonb_build_object('generation',1,'version',0,'key',gen_random_uuid(),
    'answers',jsonb_build_object(d#>>'{parts,0,questions,0,id}',d#>>'{parts,0,questions,0,choices,1,id}')));
  r:=pg_temp.cmd('attached','submit','t6',jsonb_build_object('generation',1,'version',1,'key',gen_random_uuid(),'scoringRevision',1));
  perform pg_temp.check(jsonb_array_length(r->'answerVideos')=1 and r->'result'->>'total'='0.00','submission qualifies answer videos');
  perform pg_temp.check(public.authorize_content_material(pg_temp.sid('academy'),pg_temp.sid('unit'),pg_temp.sid('answer-video'))->>'playbackId'='playback-answer-video','answer video authorized');
end $$;
select pg_temp.act('outsider');
select pg_temp.fails(format('select public.authorize_content_material(%L,%L,%L)',pg_temp.sid('academy'),pg_temp.sid('unit'),pg_temp.sid('answer-video')),'student_unavailable');

-- Answer access: managers revoke invalid qualifying work with a reason, and restore it while that
-- work remains valid. The latest event decides every answer surface; history is immutable.
select pg_temp.act('instructor');
select pg_temp.fails(format('select public.change_assignment_answer_access(%L,%L,%L,''revoke'',''Copied'',%L)',
  pg_temp.sid('academy'),pg_temp.sid('attached'),pg_temp.sid('record-student'),gen_random_uuid()),'forbidden');
select pg_temp.check((public.get_assignment_answer_access(pg_temp.sid('academy'),pg_temp.sid('attached'),pg_temp.sid('record-student'))->>'qualifyingWork')::boolean,'staff see qualifying work');
select pg_temp.act('owner');
create temporary table sa_request(id uuid);
insert into sa_request values(gen_random_uuid());
grant select on sa_request to authenticated;
do $$ declare first jsonb; begin
  first:=public.change_assignment_answer_access(pg_temp.sid('academy'),pg_temp.sid('attached'),pg_temp.sid('record-student'),'revoke','Copied work',(select id from sa_request));
  perform pg_temp.check((first->>'revoked')::boolean and jsonb_array_length(first->'history')=1,'revocation recorded');
  perform pg_temp.check(public.change_assignment_answer_access(pg_temp.sid('academy'),pg_temp.sid('attached'),pg_temp.sid('record-student'),'revoke','Copied work',(select id from sa_request))=first,'revocation retry replays');
  perform pg_temp.fails(format('select public.change_assignment_answer_access(%L,%L,%L,''revoke'',''Other reason'',%L)',
    pg_temp.sid('academy'),pg_temp.sid('attached'),pg_temp.sid('record-student'),(select id from sa_request)),'idempotency_conflict');
  perform pg_temp.fails(format('select public.change_assignment_answer_access(%L,%L,%L,''revoke'',''Again'',%L)',
    pg_temp.sid('academy'),pg_temp.sid('attached'),pg_temp.sid('record-student'),gen_random_uuid()),'assignment_conflict');
  perform pg_temp.fails(format('select public.change_assignment_answer_access(%L,%L,%L,''revoke'',''No work'',%L)',
    pg_temp.sid('academy'),pg_temp.sid('attached'),pg_temp.sid('record-inperson'),gen_random_uuid()),'not_qualified');
  perform pg_temp.fails(format('select public.change_assignment_answer_access(%L,%L,%L,''revoke'','' '',%L)',
    pg_temp.sid('academy'),pg_temp.sid('attached'),pg_temp.sid('record-student'),gen_random_uuid()),'validation');
end $$;
select pg_temp.act('student');
select pg_temp.check(jsonb_array_length(public.get_my_assignment(pg_temp.sid('academy'),pg_temp.sid('attached'))->'answerVideos')=0,'revoked answers hidden');
select pg_temp.fails(format('select public.authorize_content_material(%L,%L,%L)',pg_temp.sid('academy'),pg_temp.sid('unit'),pg_temp.sid('answer-video')),'material_unavailable');
select pg_temp.check(not (select (i->>'available')::boolean from jsonb_array_elements(public.get_my_content_unit(pg_temp.sid('academy'),pg_temp.sid('unit'))->'items') i where i->>'kind'='answer'),'unit page shows revoked answers locked');
select pg_temp.act('owner');
select pg_temp.check(not (public.change_assignment_answer_access(pg_temp.sid('academy'),pg_temp.sid('attached'),pg_temp.sid('record-student'),'restore','Reviewed: original work',gen_random_uuid())->>'revoked')::boolean,'restoration recorded');
select pg_temp.act('student');
select pg_temp.check(public.authorize_content_material(pg_temp.sid('academy'),pg_temp.sid('unit'),pg_temp.sid('answer-video'))->>'playbackId'='playback-answer-video','restored answers play again');
reset role;
select pg_temp.fails(format('delete from public.assignment_answer_access_events where record_id=%L',pg_temp.sid('record-student')),'validation');
set local role authenticated;

-- HEIC photos are accepted Written Work types; the editor document names its annual record.
select pg_temp.act('inperson');
do $$ declare d jsonb; begin
  d:=pg_temp.cmd('written','claim','t7');
  perform pg_temp.check(d->>'recordId'=pg_temp.sid('record-inperson')::text,'editor document is record-scoped');
  perform pg_temp.check(pg_temp.cmd('written','register','t7',jsonb_build_object('generation',1,'key',gen_random_uuid(),'partId',d#>>'{parts,1,id}',
    'name','IMG_0001.HEIC','mime','image/heic','size',2048))->>'fileId' is not null,'HEIC registration accepted');
  perform pg_temp.fails(pg_temp.cmd_sql('written','register','t7',jsonb_build_object('generation',1,'key',gen_random_uuid(),'partId',d#>>'{parts,1,id}',
    'name','anim.gif','mime','image/gif','size',2048)),'validation');
end $$;

-- Direct table and private function access stays denied.
select pg_temp.act('student');
select pg_temp.fails('select * from public.assignment_work_files','permission denied');
select pg_temp.fails('select * from public.assignment_online_submissions','permission denied');
select pg_temp.fails(format('select edra_private.assignment_student_scope(%L,%L)',pg_temp.sid('academy'),pg_temp.sid('choice')),'permission denied');
select pg_temp.fails(format('select edra_private.content_assignment_openable(%L,%L,%L,%L)',pg_temp.sid('academy'),pg_temp.sid('unit'),pg_temp.sid('attached'),pg_temp.sid('record-student')),'permission denied');
reset role;
rollback;
