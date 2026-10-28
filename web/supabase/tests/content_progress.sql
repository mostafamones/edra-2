-- Disposable GitHub Actions database only; all fixtures roll back.
begin;
do $$ begin
  if (select count(*) from edra_db_test.target)<>1 or not exists(select 1 from edra_db_test.target where name like 'edra-db-check-%') then raise exception 'Isolated Edra test target required'; end if;
end $$;
create temporary table learning_ids(name text primary key,id uuid not null default gen_random_uuid());
insert into learning_ids(name) values('owner'),('instructor'),('student'),('second'),('wrong-level'),('outsider'),('academy'),('other-academy'),('unit'),('second-unit'),('third-unit'),('draft'),('track-unit'),('track'),('request'),('batch'),('redeem'),('extension'),('revoke'),('allowance'),('coupon-type');
grant select on learning_ids to authenticated;
create function pg_temp.lid(label text) returns uuid language sql as $$ select id from pg_temp.learning_ids where name=label $$;
create function pg_temp.lact(label text) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claims','',true);
  perform set_config('edra.verified_session','',true);
  perform set_config('request.jwt.claim.sub',pg_temp.lid(label)::text,true);
end $$;
create function pg_temp.lcheck(ok boolean,label text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'Learning access assertion: %',label; end if; end $$;
create function pg_temp.lerror(statement text,expected text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then
    if position(expected in sqlerrm)>0 then return; end if;
    raise exception 'Expected %, received %',expected,sqlerrm;
  end;
  raise exception 'Expected % but operation succeeded',expected;
end $$;

insert into auth.users(id) select id from learning_ids where name in ('owner','instructor','student','second','wrong-level','outsider');
insert into public.academies(id,name,slug,icon,subject,created_by) values
  (pg_temp.lid('academy'),'Learning access tests','learning-'||pg_temp.lid('academy'),'school','Math',pg_temp.lid('owner')),
  (pg_temp.lid('other-academy'),'Other learning','learn-b-'||pg_temp.lid('other-academy'),'school','Math',pg_temp.lid('outsider'));
insert into learning_ids(name,id) select 'year',id from public.academic_years where academy_id=pg_temp.lid('academy');
insert into public.academy_memberships(academy_id,user_id,role,created_by) values
  (pg_temp.lid('academy'),pg_temp.lid('owner'),'owner',pg_temp.lid('owner')),
  (pg_temp.lid('academy'),pg_temp.lid('instructor'),'instructor',pg_temp.lid('owner')),
  (pg_temp.lid('other-academy'),pg_temp.lid('outsider'),'owner',pg_temp.lid('outsider'));
insert into public.academy_levels(academy_id,level_id,sort_order) values(pg_temp.lid('academy'),'secondary-1',0),(pg_temp.lid('academy'),'secondary-2',1);
select pg_temp.lact('owner');
insert into learning_ids(name,id) select 'record-'||label,(public.create_student_record(pg_temp.lid('academy'),pg_temp.lid('year'),'Learning '||label,'0108817000'||n,'01188179999',level,null,null,'online_only')).id
  from (values('student',1,'secondary-1'),('second',2,'secondary-1'),('wrong-level',3,'secondary-2')) v(label,n,level);
update public.academy_student_profiles profile set user_id=pg_temp.lid(substr(ids.name,8)),linked_at=now()
  from public.annual_student_records r join learning_ids ids on ids.id=r.id and ids.name in ('record-student','record-second','record-wrong-level')
  where profile.id=r.academy_student_profile_id;
-- Adding an offering does not move the already enrolled level-wide students.
insert into public.academy_tracks(id,academy_id,level_id,name,sort_order) values(pg_temp.lid('track'),pg_temp.lid('academy'),'secondary-1','Science',0);

-- Provider-independent ready assets; no video upload or real Storage bytes are created.
do $$ declare label text; asset_id uuid; note_id uuid; doc jsonb; begin
  foreach label in array array['unit','second-unit','third-unit','draft','track-unit'] loop
    perform public.create_content_unit(pg_temp.lid('academy'),pg_temp.lid('year'),'secondary-1',case when label='track-unit' then pg_temp.lid('track') else null end,pg_temp.lid(label),'Lesson '||label);
    asset_id:=gen_random_uuid(); note_id:=gen_random_uuid();
    insert into public.content_assets(id,academy_id,unit_id,created_by,kind,name,mime_type,status,playback_id)
      values(asset_id,pg_temp.lid('academy'),pg_temp.lid(label),pg_temp.lid('owner'),'video','Learning video','video/mp4','ready','test-playback');
    insert into public.content_assets(id,academy_id,unit_id,created_by,kind,name,mime_type,status,storage_path)
      values(note_id,pg_temp.lid('academy'),pg_temp.lid(label),pg_temp.lid('owner'),'document','Learning PDF','application/pdf','ready',pg_temp.lid('academy')||'/'||pg_temp.lid(label)||'/'||note_id);
    doc:=jsonb_build_object('title','Lesson '||label,'description','','accessDays',case when label='second-unit' then 30 else 7 end,'items',jsonb_build_array(
      jsonb_build_object('id',asset_id,'kind','explanation','title','Explanation','assetId',asset_id),
      jsonb_build_object('id',note_id,'kind','document','title','Notes','assetId',note_id)));
    perform public.save_content_unit(pg_temp.lid('academy'),pg_temp.lid(label),1,doc);
    if label<>'draft' then perform public.change_content_unit(pg_temp.lid('academy'),pg_temp.lid(label),2,'publish'); end if;
  end loop;
end $$;


-- Trusted provider metadata, never browser-supplied duration.
update public.content_assets set duration_seconds=100 where academy_id=pg_temp.lid('academy') and kind='video';
select pg_temp.lact('owner');
select public.issue_content_access(pg_temp.lid('academy'),pg_temp.lid('unit'),pg_temp.lid('record-student'),gen_random_uuid());
select public.issue_content_access(pg_temp.lid('academy'),pg_temp.lid('unit'),pg_temp.lid('record-second'),gen_random_uuid());
set local role authenticated;
select pg_temp.lact('student');
do $$ declare item_id uuid; first_session uuid; newer_session uuid; response jsonb; progress jsonb; unit jsonb; begin
 unit:=public.get_my_content_unit(pg_temp.lid('academy'),pg_temp.lid('unit'));
 item_id:=(unit->'items'->0->>'id')::uuid;
 perform pg_temp.lcheck(unit->'progress'->>'total'='1','documents excluded from denominator');
 first_session:=(public.start_my_content_progress(pg_temp.lid('academy'),pg_temp.lid('unit'),item_id)->>'sessionId')::uuid;
 response:=public.save_my_content_progress(pg_temp.lid('academy'),pg_temp.lid('unit'),first_session,1,50,'[[0,50]]');
 perform pg_temp.lcheck(response->>'completed'='false' and response->>'watchedSeconds'='50','partial viewing');
 response:=public.save_my_content_progress(pg_temp.lid('academy'),pg_temp.lid('unit'),first_session,2,70,'[[20,70]]');
 perform pg_temp.lcheck(response->>'watchedSeconds'='70','overlap counted once');
 response:=public.save_my_content_progress(pg_temp.lid('academy'),pg_temp.lid('unit'),first_session,1,10,'[[70,100]]');
 perform pg_temp.lcheck(response->>'watchedSeconds'='70' and response->>'positionSeconds'='70','out-of-order checkpoint ignored');
 newer_session:=(public.start_my_content_progress(pg_temp.lid('academy'),pg_temp.lid('unit'),item_id)->>'sessionId')::uuid;
 response:=public.save_my_content_progress(pg_temp.lid('academy'),pg_temp.lid('unit'),newer_session,1,95,'[]');
 perform pg_temp.lcheck(response->>'completed'='false','seeking to end does not complete');
 response:=public.save_my_content_progress(pg_temp.lid('academy'),pg_temp.lid('unit'),first_session,3,89,'[[70,89]]');
 perform pg_temp.lcheck(response->>'watchedSeconds'='89' and response->>'positionSeconds'='95','older device contributes coverage without rewinding resume');
 response:=public.save_my_content_progress(pg_temp.lid('academy'),pg_temp.lid('unit'),newer_session,2,90,'[[89,90]]');
 perform pg_temp.lcheck(response->>'completed'='true','exactly ninety percent completes');
 unit:=public.get_my_content_unit(pg_temp.lid('academy'),pg_temp.lid('unit'));
 perform pg_temp.lcheck(unit->'progress'->>'completed'='1','unit summary reads persisted activity');
 perform pg_temp.lcheck(public.list_my_content_units(pg_temp.lid('academy')) @> jsonb_build_object('units',jsonb_build_array(jsonb_build_object('id',pg_temp.lid('unit'),'progress',jsonb_build_object('completed',1)))),'browse projection');
 perform pg_temp.lcheck(public.list_my_content_units(pg_temp.lid('academy')) @> jsonb_build_object('units',jsonb_build_array(jsonb_build_object('id',pg_temp.lid('unit'),'contents',jsonb_build_array(jsonb_build_object('kind','video','completed',1))))),'browse contents by kind');
 perform pg_temp.lerror(format('select public.save_my_content_progress(%L,%L,%L,3,101,''[]'')',pg_temp.lid('academy'),pg_temp.lid('unit'),newer_session),'validation');
 perform pg_temp.lerror(format('select public.save_my_content_progress(%L,%L,%L,3,90,''[[90,101]]'')',pg_temp.lid('academy'),pg_temp.lid('unit'),newer_session),'validation');
 perform pg_temp.lerror(format('select public.start_my_content_progress(%L,%L,%L)',pg_temp.lid('academy'),pg_temp.lid('unit'),(unit->'items'->1->>'id')::uuid),'material_unavailable');
 perform pg_temp.lact('second');
 perform pg_temp.lcheck(public.get_my_content_unit(pg_temp.lid('academy'),pg_temp.lid('unit'))->'progress'->>'completed'='0','other student isolated');
 perform pg_temp.lerror(format('select public.save_my_content_progress(%L,%L,%L,3,90,''[]'')',pg_temp.lid('academy'),pg_temp.lid('unit'),newer_session),'material_unavailable');
 perform pg_temp.lact('outsider');
 perform pg_temp.lerror(format('select public.start_my_content_progress(%L,%L,%L)',pg_temp.lid('academy'),pg_temp.lid('unit'),item_id),'student_unavailable');
 perform pg_temp.lact('student');
 perform pg_temp.lerror(format('select public.start_my_content_progress(%L,%L,%L)',pg_temp.lid('other-academy'),pg_temp.lid('unit'),item_id),'student_unavailable');
 perform pg_temp.lerror(format('select public.start_my_content_progress(%L,%L,%L)',pg_temp.lid('academy'),pg_temp.lid('second-unit'),item_id),'access_required');
 perform pg_temp.lerror('select * from edra_private.content_video_progress','permission denied');
end $$;
reset role;
-- Reusing the same asset in another unit does not transfer progress.
select pg_temp.lact('owner');
do $$ declare u public.content_units; source jsonb; begin
 select * into u from public.content_units where id=pg_temp.lid('second-unit');
 select document->'items' into source from public.content_revisions where unit_id=pg_temp.lid('unit') and revision=1;
 perform public.save_content_unit(u.academy_id,u.id,u.version,u.draft||jsonb_build_object('items',source));
 perform public.change_content_unit(u.academy_id,u.id,u.version+1,'publish');
end $$;
select public.issue_content_access(pg_temp.lid('academy'),pg_temp.lid('second-unit'),pg_temp.lid('record-student'),gen_random_uuid());
set local role authenticated;
select pg_temp.lact('student');
select pg_temp.lcheck(public.get_my_content_unit(pg_temp.lid('academy'),pg_temp.lid('second-unit'))->'progress'->>'completed'='0','same asset in another unit starts fresh');
reset role;
-- Title/order changes retain coverage; replacing an asset resets current completion, retaining history.
select pg_temp.lact('owner');
do $$ declare u public.content_units; replacement uuid:=gen_random_uuid(); begin
 select * into u from public.content_units where id=pg_temp.lid('unit');
 perform public.save_content_unit(u.academy_id,u.id,u.version,u.draft||jsonb_build_object('title','Renamed lesson'));
 perform public.change_content_unit(u.academy_id,u.id,u.version+1,'publish');
 perform pg_temp.lact('student');
 perform pg_temp.lcheck(public.get_my_content_unit(pg_temp.lid('academy'),u.id)->'progress'->>'completed'='1','renaming preserves completion');
 perform pg_temp.lact('owner');
 select * into u from public.content_units where id=u.id;
 insert into public.content_assets(id,academy_id,unit_id,created_by,kind,name,mime_type,status,playback_id,duration_seconds)
 values(replacement,u.academy_id,u.id,pg_temp.lid('owner'),'video','Replacement','video/mp4','ready','replacement',100);
 perform public.save_content_unit(u.academy_id,u.id,u.version,jsonb_set(u.draft,'{items,0,assetId}',to_jsonb(replacement::text)));
 perform public.change_content_unit(u.academy_id,u.id,u.version+1,'publish');
 perform pg_temp.lact('student');
 perform pg_temp.lcheck(public.get_my_content_unit(pg_temp.lid('academy'),u.id)->'progress'->>'completed'='0','replacement changes current completion');
 perform pg_temp.lcheck((select count(*) from edra_private.content_video_progress where unit_id=u.id and annual_record_id=pg_temp.lid('record-student'))=1,'old progress preserved');
end $$;
-- Official attached assessment work contributes; drafts do not.
select pg_temp.lact('owner');
do $$ declare u public.content_units; assignment_key uuid; quiz_key uuid; begin
 select * into u from public.content_units where id=pg_temp.lid('unit');
 assignment_key:=public.create_content_assessment(u.academy_id,u.id,u.version,'assignment','Progress homework');
 quiz_key:=public.create_content_assessment(u.academy_id,u.id,u.version+1,'quiz','Progress quiz');
 perform public.change_content_unit(u.academy_id,u.id,u.version+2,'publish');
 perform pg_temp.lact('student');
 perform pg_temp.lcheck(public.get_my_content_unit(u.academy_id,u.id)->'progress'->>'total'='3','two assessments plus explanation; no document');
 perform pg_temp.lact('owner');
 insert into public.quiz_work(quiz_id,annual_student_record_id,academy_id,academic_year_id)
 values(quiz_key,pg_temp.lid('record-student'),u.academy_id,pg_temp.lid('year'));
 perform pg_temp.lact('student');
 perform pg_temp.lcheck(public.get_my_content_unit(u.academy_id,u.id)->'progress'->>'completed'='0','draft quiz work is incomplete');
 perform pg_temp.lact('owner');
 insert into public.assignment_recipients(assignment_id,annual_student_record_id,academy_id,academic_year_id,work_status,received_at,work_recorded_at,work_recorded_by)
 values(assignment_key,pg_temp.lid('record-student'),u.academy_id,pg_temp.lid('year'),'late',now(),now(),pg_temp.lid('owner'))
 on conflict(assignment_id,annual_student_record_id) do update set work_status='late',received_at=now(),work_recorded_at=now(),work_recorded_by=pg_temp.lid('owner');
 insert into public.quiz_submissions(academy_id,academic_year_id,quiz_id,annual_student_record_id,source,reason,submitted_at,processed_at,scoring_revision,confirmed_by)
 values(u.academy_id,pg_temp.lid('year'),quiz_key,pg_temp.lid('record-student'),'physical','physical',now(),now(),1,pg_temp.lid('owner'));
 perform pg_temp.lact('student');
 perform pg_temp.lcheck(public.get_my_content_unit(u.academy_id,u.id)->'progress'->>'completed'='2','official assignment and quiz submissions complete');
end $$;
-- Immutable expired grant fixture on another unit: preserved history does not authorize playback.
insert into public.content_access_accounts(academy_id,academic_year_id,annual_record_id,unit_id)
 values(pg_temp.lid('academy'),pg_temp.lid('year'),pg_temp.lid('record-student'),pg_temp.lid('third-unit'));
insert into public.content_access_grants(id,academy_id,academic_year_id,annual_record_id,unit_id,kind,actor_id,issued_at,starts_at,expires_at,duration_seconds)
 values(pg_temp.lid('allowance'),pg_temp.lid('academy'),pg_temp.lid('year'),pg_temp.lid('record-student'),pg_temp.lid('third-unit'),'staff',pg_temp.lid('owner'),now()-interval '2 days',now()-interval '2 days',now()-interval '1 day',86400);
update public.content_access_accounts set current_grant_id=pg_temp.lid('allowance') where unit_id=pg_temp.lid('third-unit') and annual_record_id=pg_temp.lid('record-student');
set local role authenticated;
select pg_temp.lact('student');
do $$ declare unit jsonb; begin
 unit:=public.get_my_content_unit(pg_temp.lid('academy'),pg_temp.lid('third-unit'));
 perform pg_temp.lerror(format('select public.start_my_content_progress(%L,%L,%L)',pg_temp.lid('academy'),pg_temp.lid('third-unit'),unit->'items'->0->>'id'),'access_required');
end $$;
reset role;
-- Revocation blocks both a previously issued progress session and fresh playback.
insert into public.content_access_revocations(id,grant_id,actor_id,reason)
 select gen_random_uuid(),current_grant_id,pg_temp.lid('owner'),'Progress test' from public.content_access_accounts
 where unit_id=pg_temp.lid('second-unit') and annual_record_id=pg_temp.lid('record-student');
set local role authenticated;
select pg_temp.lact('student');
do $$ declare unit jsonb; begin
 unit:=public.get_my_content_unit(pg_temp.lid('academy'),pg_temp.lid('second-unit'));
 perform pg_temp.lerror(format('select public.start_my_content_progress(%L,%L,%L)',pg_temp.lid('academy'),pg_temp.lid('second-unit'),unit->'items'->0->>'id'),'access_required');
end $$;
reset role;
-- Suspension and expiry deny writes without clearing history.
update public.academy_student_profiles p set access_suspended_at=clock_timestamp() from public.annual_student_records r where r.academy_student_profile_id=p.id and r.id=pg_temp.lid('record-student');
set local role authenticated;
select pg_temp.lact('student');
select pg_temp.lerror(format('select public.get_my_content_unit(%L,%L)',pg_temp.lid('academy'),pg_temp.lid('unit')),'student_unavailable');
reset role;
select pg_temp.lcheck(not has_function_privilege('authenticated','edra_private.content_unit_progress(uuid,uuid,jsonb)','EXECUTE'),'private projection inaccessible');
rollback;
select 'Content progress assertions passed' as result;
