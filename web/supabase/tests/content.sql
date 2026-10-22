-- Disposable GitHub Actions database only; all fixtures roll back.
begin;
do $$ begin
  if (select count(*) from edra_db_test.target)<>1 or not exists(select 1 from edra_db_test.target where name like 'edra-db-check-%') then raise exception 'Isolated Edra test target required'; end if;
end $$;
create temporary table content_test_context(actor uuid,other_actor uuid,outsider uuid,academy uuid,other_academy uuid,year_id uuid,unit_id uuid,asset_id uuid,copy_id uuid,assessment_id uuid);
insert into content_test_context select gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid();
grant select,update on content_test_context to authenticated;
insert into auth.users(id) select actor from content_test_context union all select other_actor from content_test_context union all select outsider from content_test_context;
insert into public.academies(id,name,slug,icon,subject,created_by)
select academy,'Content test','content-'||academy,'school','Math',actor from content_test_context
union all select other_academy,'Other content test','other-content-'||other_academy,'school','Math',outsider from content_test_context;
update content_test_context c set year_id=(select id from public.academic_years where academy_id=c.academy and closed_at is null);
insert into public.academy_memberships(academy_id,user_id,role,created_by)
select academy,actor,'instructor'::public.academy_role,actor from content_test_context
union all select academy,other_actor,'admin'::public.academy_role,actor from content_test_context
union all select other_academy,outsider,'owner'::public.academy_role,outsider from content_test_context;
insert into public.academy_levels(academy_id,level_id,sort_order) select academy,'secondary-1',0 from content_test_context;
create function pg_temp.expect_content_error(statement text,expected text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then
    if position(expected in sqlerrm)>0 then return; end if;
    raise exception 'Expected %, received %',expected,sqlerrm;
  end;
  raise exception 'Expected error % but command succeeded',expected;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub',actor::text,true) from content_test_context;
do $$ declare c record; v integer; begin
  select * into c from content_test_context;
  perform public.create_content_unit(c.academy,c.year_id,'secondary-1',null,c.unit_id,'Lesson');
  if not exists(select 1 from public.content_units where id=c.unit_id and state='draft' and draft->'items'='[]') then raise exception 'Empty draft not created'; end if;
  perform public.save_content_unit(c.academy,c.unit_id,1,'{"title":"Lesson","description":"","items":[]}');
  perform pg_temp.expect_content_error(format('select public.save_content_unit(%L,%L,2,%L)',c.academy,c.unit_id,'{"title":123,"description":"","items":[]}'),'validation');
  perform pg_temp.expect_content_error(format('select public.create_content_unit(%L,%L,''secondary-1'',null,%L,null)',c.academy,c.year_id,gen_random_uuid()),'validation');
  perform pg_temp.expect_content_error(format('select public.save_content_unit(%L,%L,null,%L)',c.academy,c.unit_id,'{"title":"No version","description":"","items":[]}'),'validation');
  perform pg_temp.expect_content_error(format('select public.save_content_unit(%L,%L,1,%L)',c.academy,c.unit_id,'{"title":"Stale","description":"","items":[]}'),'content_conflict');
  perform public.change_content_unit(c.academy,c.unit_id,2,'submit');
  perform public.save_content_unit(c.academy,c.unit_id,3,'{"title":"Edited during review","description":"","items":[]}');
  perform pg_temp.expect_content_error(format('select public.change_content_unit(%L,%L,4,''publish'')',c.academy,c.unit_id),'forbidden');
  perform pg_temp.expect_content_error(format('select public.change_content_unit(%L,%L,4,''archive'')',c.academy,c.unit_id),'forbidden');
  -- New assessments inherit program/year and attach atomically.
  update content_test_context set assessment_id=public.create_content_assessment(c.academy,c.unit_id,4,'assignment','Homework');
  if not exists(select 1 from public.assignments a where a.id=(select assessment_id from content_test_context) and a.academic_year_id=c.year_id and a.level_id='secondary-1' and a.due_at is null) then raise exception 'Assessment context not inherited'; end if;
end $$;

select set_config('request.jwt.claim.sub',outsider::text,true) from content_test_context;
do $$ declare c record; begin
  select * into c from content_test_context;
  if exists(select 1 from public.content_units where academy_id=c.academy) then raise exception 'Cross-academy read leaked'; end if;
  perform pg_temp.expect_content_error(format('select public.save_content_unit(%L,%L,5,%L)',c.academy,c.unit_id,'{"title":"Attack","description":"","items":[]}'),'forbidden');
end $$;
reset role;
-- Fake provider metadata tests domain readiness without contacting or storing videos at Mux.
insert into public.content_assets(id,academy_id,unit_id,created_by,kind,name,mime_type,status,playback_id)
select asset_id,academy,unit_id,actor,'video','Lesson.mp4','video/mp4','ready','test-only' from content_test_context;
set local role authenticated;
select set_config('request.jwt.claim.sub',other_actor::text,true) from content_test_context;
do $$ declare c record; u public.content_units; doc jsonb; p public.content_programs; copied_assessment uuid; begin
  select * into c from content_test_context;
  perform pg_temp.expect_content_error(format('select public.change_content_unit(%L,%L,5,''publish'')',c.academy,c.unit_id),'explanation_required');
  select * into u from public.content_units where id=c.unit_id;
  doc:=u.draft||jsonb_build_object('items',(u.draft->'items')||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'kind','explanation','title','Explanation','assetId',c.asset_id)));
  perform public.save_content_unit(c.academy,c.unit_id,5,doc);
  perform public.change_content_unit(c.academy,c.unit_id,6,'publish');
  perform public.save_content_unit(c.academy,c.unit_id,7,doc||'{"title":"Unpublished edit"}');
  if (select document->>'title' from public.content_revisions where unit_id=c.unit_id and revision=1)='Unpublished edit' then raise exception 'Draft edit leaked into publication'; end if;
  perform public.copy_content_unit(c.academy,c.unit_id,c.year_id,'secondary-1',null,c.copy_id);
  if (select draft->>'title' from public.content_units where id=c.copy_id)<>'Edited during review' then raise exception 'Copy used unpublished source'; end if;
  select assessment_id into copied_assessment from public.content_assessments where unit_id=c.copy_id;
  if copied_assessment=c.assessment_id or copied_assessment is null then raise exception 'Copy did not create fresh assessment'; end if;
  if exists(select 1 from public.assignment_marks where assignment_id=copied_assessment) then raise exception 'Marks copied'; end if;
  if (select due_at from public.assignments where id=copied_assessment) is not null then raise exception 'Copied dates not cleared'; end if;
  if not exists(select 1 from public.assignments where id=copied_assessment and audience='level' and level_id='secondary-1' and track_id is null) then raise exception 'Copied audience not reset'; end if;
  perform public.change_content_unit(c.academy,c.unit_id,8,'archive');
  perform public.change_content_unit(c.academy,c.unit_id,9,'restore');
  if not exists(select 1 from public.content_units where id=c.unit_id and state='draft' and published_revision=1) then raise exception 'Restore did not preserve history and return draft'; end if;
  -- Fresh quizzes/exams and answer videos also copy together, preserving their relationships.
  perform public.create_content_assessment(c.academy,c.unit_id,10,'quiz','Practice quiz');
  perform public.create_content_assessment(c.academy,c.unit_id,11,'exam','Practice exam');
  select * into u from public.content_units where id=c.unit_id;
  select assessment_id into copied_assessment from public.content_assessments where unit_id=c.unit_id and kind='quiz';
  doc:=u.draft||jsonb_build_object('items',(u.draft->'items')||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'kind','answer','title','Quiz solution','assetId',c.asset_id,'assessmentKind','quiz','assessmentId',copied_assessment)));
  perform public.save_content_unit(c.academy,c.unit_id,12,doc);
  perform public.change_content_unit(c.academy,c.unit_id,13,'publish');
  perform public.copy_content_unit(c.academy,c.unit_id,c.year_id,'secondary-1',null,gen_random_uuid());
  if not exists(select 1 from public.content_units x where x.source_unit_id=c.unit_id and x.id<>c.copy_id and (select count(*) from public.content_assessments l where l.unit_id=x.id)=3) then raise exception 'Whole-unit copy lost assessment types'; end if;
  perform public.copy_content_material(c.academy,c.unit_id,(doc->'items'->-1->>'id')::uuid,c.copy_id,2);
  if not exists(select 1 from public.content_assessments where unit_id=c.copy_id and kind='quiz' and assessment_id<>copied_assessment) then raise exception 'Answer-video reuse lost fresh assessment'; end if;
  -- Even after working-draft removal, published history pins the original video.
  perform public.save_content_unit(c.academy,c.unit_id,14,doc||jsonb_build_object('items',(select coalesce(jsonb_agg(i),'[]'::jsonb) from jsonb_array_elements(doc->'items') i where not(i ? 'assetId'))));
  perform pg_temp.expect_content_error(format('select public.request_content_video_deletion(%L,%L)',c.academy,c.asset_id),'asset_in_use');
  perform public.save_content_unit(c.academy,c.unit_id,15,doc);
end $$;
select set_config('request.jwt.claim.sub',actor::text,true) from content_test_context;
do $$ declare c record; begin
  select * into c from content_test_context;
  perform pg_temp.expect_content_error(format('select public.save_content_unit(%L,%L,16,%L)',c.academy,c.unit_id,'{"title":"Instructor edit after publication","description":"","items":[]}'),'forbidden');
end $$;
reset role;
-- Exercise deferred guards too: ROLLBACK alone never fires deferred triggers.
do $$ declare c record; group_id uuid:=gen_random_uuid(); begin
  select * into c from content_test_context;
  insert into public.groups(id,academy_id,academic_year_id,level_id,name)
    values(group_id,c.academy,c.year_id,'secondary-1','Content group');
  update public.assignments set audience='groups',level_id=null,track_id=null where id=c.assessment_id;
  insert into public.assignment_audience_groups(assignment_id,academy_id,academic_year_id,group_id)
    values(c.assessment_id,c.academy,c.year_id,group_id);
  update public.groups set notes='Covered audience' where id=group_id;
end $$;
set constraints all immediate;
do $$ declare c record; begin
  select * into c from content_test_context;
  insert into public.academy_levels(academy_id,level_id,sort_order) values(c.academy,'secondary-2',1);
  perform pg_temp.expect_content_error(format('update public.groups set level_id=''secondary-2'' where academy_id=%L',c.academy),'incompatible_assessment');
end $$;
-- Ownership, closed years, duplicate attachments, and live membership removal.
update public.academy_memberships set role='instructor' where user_id=(select other_actor from content_test_context) and academy_id=(select academy from content_test_context);
set local role authenticated;
select set_config('request.jwt.claim.sub',actor::text,true) from content_test_context;
do $$ declare c record; private_draft uuid:=gen_random_uuid(); target public.content_units; begin
  select * into c from content_test_context;
  perform public.create_content_unit(c.academy,c.year_id,'secondary-1',null,private_draft,'Owner draft');
  perform set_config('request.jwt.claim.sub',c.other_actor::text,true);
  perform pg_temp.expect_content_error(format('select public.save_content_unit(%L,%L,1,%L)',c.academy,private_draft,'{"title":"Another instructor","description":"","items":[]}'),'forbidden');
  perform set_config('request.jwt.claim.sub',c.actor::text,true);
  select * into target from public.content_units where id=private_draft;
  perform pg_temp.expect_content_error(format('select public.save_content_unit(%L,%L,1,%L)',c.academy,private_draft,
    (target.draft||jsonb_build_object('items',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'kind','assessment','title','Duplicate','assessmentKind','assignment','assessmentId',c.assessment_id))))::text),'assessment_already_attached');
  perform pg_temp.expect_content_error(format('select public.save_content_unit(%L,%L,1,%L)',c.academy,private_draft,
    (target.draft||jsonb_build_object('items',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'kind','explanation','title','Unavailable','assetId',gen_random_uuid()))))::text),'invalid_asset');
  c.asset_id:=gen_random_uuid();
  perform public.register_content_asset(c.academy,private_draft,c.asset_id,'document','Policy document.pdf','application/pdf');
  update content_test_context set copy_id=private_draft,asset_id=c.asset_id;
end $$;
reset role;
insert into storage.objects(bucket_id,name)
  select 'content-documents',a.storage_path from public.content_assets a join content_test_context c on a.id=c.asset_id;
set local role authenticated;
do $$ begin
  if not exists(select 1 from storage.objects where bucket_id='content-documents' and name=(select storage_path from public.content_assets where id=(select asset_id from content_test_context))) then raise exception 'Staff cannot read their private document object'; end if;
end $$;
reset role;
create temporary table content_deletion_test(academy uuid,id uuid,token uuid);
grant select,insert on content_deletion_test to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub',actor::text,true) from content_test_context;
do $$ declare c record; unit_id uuid:=gen_random_uuid(); video_id uuid:=gen_random_uuid(); token uuid; doc jsonb; begin
  select * into c from content_test_context;
  perform public.create_content_unit(c.academy,c.year_id,'secondary-1',null,unit_id,'Deletion draft');
  perform public.register_content_asset(c.academy,unit_id,video_id,'video','Delete me.mp4','video/mp4');
  select draft into doc from public.content_units where id=unit_id;
  perform public.save_content_unit(c.academy,unit_id,1,doc||jsonb_build_object('items',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'kind','explanation','title','Delete me','assetId',video_id))));
  perform pg_temp.expect_content_error(format('select public.request_content_video_deletion(%L,%L)',c.academy,video_id),'asset_in_use');
  perform public.save_content_unit(c.academy,unit_id,2,doc);
  perform set_config('request.jwt.claim.sub',c.other_actor::text,true);
  perform pg_temp.expect_content_error(format('select public.request_content_video_deletion(%L,%L)',c.academy,video_id),'forbidden');
  perform set_config('request.jwt.claim.sub',c.outsider::text,true);
  perform pg_temp.expect_content_error(format('select public.request_content_video_deletion(%L,%L)',c.academy,video_id),'forbidden');
  perform set_config('request.jwt.claim.sub',c.actor::text,true);
  token:=public.request_content_video_deletion(c.academy,video_id);
  if token is null or public.request_content_video_deletion(c.academy,video_id)<>token then raise exception 'Deletion retry lost reservation'; end if;
  perform pg_temp.expect_content_error(format('select public.save_content_unit(%L,%L,3,%L)',c.academy,unit_id,(doc||jsonb_build_object('items',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'kind','explanation','title','Race deletion','assetId',video_id))))::text),'asset_deleting');
  insert into content_deletion_test values(c.academy,video_id,token);
end $$;
reset role;
do $$ declare c record; begin
  select * into c from content_deletion_test;
  if has_function_privilege('authenticated','public.complete_content_video_deletion(uuid,uuid,uuid)','EXECUTE') then raise exception 'Client can bypass provider deletion'; end if;
  perform pg_temp.expect_content_error(format('select public.complete_content_video_deletion(%L,%L,%L)',c.academy,c.id,gen_random_uuid()),'forbidden');
  perform public.complete_content_video_deletion(c.academy,c.id,c.token);
  perform public.complete_content_video_deletion(c.academy,c.id,c.token);
  if exists(select 1 from public.content_assets where id=c.id) then raise exception 'Deleted upload metadata remains'; end if;
end $$;
update public.academic_years set closed_at=now() where id=(select year_id from content_test_context);
set local role authenticated;
select set_config('request.jwt.claim.sub',actor::text,true) from content_test_context;
do $$ declare c record; begin
  select * into c from content_test_context;
  perform pg_temp.expect_content_error(format('select public.save_content_unit(%L,%L,1,%L)',c.academy,c.copy_id,'{"title":"Closed year","description":"","items":[]}'),'year_closed');
end $$;
reset role;
update public.academy_memberships set suspended_at=now() where user_id=(select actor from content_test_context) and academy_id=(select academy from content_test_context);
set local role authenticated;
select set_config('request.jwt.claim.sub',actor::text,true) from content_test_context;
do $$ declare c record; begin
  select * into c from content_test_context;
  if exists(select 1 from public.content_units where academy_id=c.academy) then raise exception 'Suspended membership retained content reads'; end if;
  if exists(select 1 from storage.objects where bucket_id='content-documents' and name like c.academy::text||'/%') then raise exception 'Suspended membership retained document reads'; end if;
  perform pg_temp.expect_content_error(format('select public.save_content_unit(%L,%L,1,%L)',c.academy,c.copy_id,'{"title":"Suspended actor","description":"","items":[]}'),'forbidden');
end $$;
reset role;
do $$ begin
  if has_table_privilege('authenticated','public.content_units','UPDATE') or has_table_privilege('anon','public.content_units','SELECT') then raise exception 'Unsafe content grants'; end if;
end $$;
rollback;
select 'Content lifecycle, ownership, isolation, publication and copy checks passed' as result;
