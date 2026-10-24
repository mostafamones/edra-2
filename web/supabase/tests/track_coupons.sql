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

-- Build real content-linked assessments through the authoring API.
insert into learning_ids(name) values('regular'),('revision'),('track-type'),('batch-regular'),('batch-revision'),('batch-track');
insert into learning_ids(name,id) select 'assignment',public.create_content_assessment(pg_temp.lid('academy'),pg_temp.lid('unit'),3,'assignment','Required homework');
insert into learning_ids(name,id) select 'quiz',public.create_content_assessment(pg_temp.lid('academy'),pg_temp.lid('unit'),4,'quiz','Required quiz');
select public.change_content_unit(pg_temp.lid('academy'),pg_temp.lid('unit'),5,'publish');
select public.create_content_coupon_type(pg_temp.lid('academy'),(select program_id from public.content_units where id=pg_temp.lid('unit')),'Regular',pg_temp.lid('regular'));
select public.create_content_coupon_type(pg_temp.lid('academy'),(select program_id from public.content_units where id=pg_temp.lid('unit')),'Revision',pg_temp.lid('revision'));
select public.create_content_coupon_type(pg_temp.lid('academy'),(select program_id from public.content_units where id=pg_temp.lid('track-unit')),'Regular',pg_temp.lid('track-type'));
select public.generate_content_coupons(pg_temp.lid('academy'),pg_temp.lid('regular'),3,pg_temp.lid('batch-regular'));
select public.generate_content_coupons(pg_temp.lid('academy'),pg_temp.lid('revision'),1,pg_temp.lid('batch-revision'));
select public.generate_content_coupons(pg_temp.lid('academy'),pg_temp.lid('track-type'),1,pg_temp.lid('batch-track'));
create temporary table coupons as select row_number() over(partition by type_id order by id) as n,* from public.content_coupons where academy_id=pg_temp.lid('academy');
grant select on coupons to authenticated;
create function pg_temp.code(label text,num integer default 1) returns text language sql as $$select code from pg_temp.coupons where type_id=pg_temp.lid(label) and n=num$$;
create function pg_temp.publish_policy(label text,patch jsonb) returns void language plpgsql as $$
declare u public.content_units; begin
 select * into strict u from public.content_units where id=pg_temp.lid(label);
 perform public.save_content_unit(u.academy_id,u.id,u.version,u.draft||patch);
 perform public.change_content_unit(u.academy_id,u.id,u.version+1,'publish');
end $$;
select pg_temp.publish_policy('second-unit',jsonb_build_object('couponTypeId',pg_temp.lid('regular')));
select pg_temp.publish_policy('third-unit',jsonb_build_object('couponTypeId',pg_temp.lid('revision')));
-- Existing access survives a subsequently published prerequisite.
select public.issue_content_access(pg_temp.lid('academy'),pg_temp.lid('second-unit'),pg_temp.lid('record-second'),gen_random_uuid());
select pg_temp.publish_policy('second-unit',jsonb_build_object('prerequisites',jsonb_build_array(
 jsonb_build_object('unitId',pg_temp.lid('unit'),'kind','assignment','assessmentId',pg_temp.lid('assignment')),
 jsonb_build_object('unitId',pg_temp.lid('unit'),'kind','quiz','assessmentId',pg_temp.lid('quiz')))));

set local role authenticated;
select pg_temp.lact('student');
do $$ declare result jsonb; i integer; begin
 result:=public.get_my_content_unit(pg_temp.lid('academy'),pg_temp.lid('second-unit'));
 perform pg_temp.lcheck(result->>'title' is not null and result->>'prerequisitesMet'='false','blocked unit remains visible');
 perform pg_temp.lcheck(jsonb_array_length(result->'prerequisites')=2,'both chosen assessments listed');
 perform pg_temp.lcheck(public.redeem_content_coupon(pg_temp.lid('academy'),pg_temp.lid('third-unit'),pg_temp.code('regular'),gen_random_uuid())->>'error'='coupon_type_mismatch','regular code cannot unlock revision unit');
 perform pg_temp.lcheck(public.redeem_content_coupon(pg_temp.lid('academy'),pg_temp.lid('second-unit'),pg_temp.code('track-type'),gen_random_uuid())->>'error'='coupon_type_mismatch','track code cannot unlock whole-grade unit');
 perform pg_temp.lcheck(public.redeem_content_coupon(pg_temp.lid('academy'),pg_temp.lid('second-unit'),pg_temp.code('regular'),gen_random_uuid())->>'error'='prerequisites_required','code blocked by prerequisites');
end $$;
select pg_temp.lact('owner');
select pg_temp.lerror(format('select public.issue_content_access(%L,%L,%L,%L)',pg_temp.lid('academy'),pg_temp.lid('second-unit'),pg_temp.lid('record-student'),gen_random_uuid()),'prerequisites_required');
select pg_temp.lerror(format('select public.issue_content_access(%L,%L,%L,%L,48)',pg_temp.lid('academy'),pg_temp.lid('second-unit'),pg_temp.lid('record-second'),gen_random_uuid()),'prerequisites_required');
select pg_temp.lact('second');
select pg_temp.lcheck(public.get_my_content_unit(pg_temp.lid('academy'),pg_temp.lid('second-unit'))->'access'->>'status'='active','existing active access grandfathered');
select pg_temp.lact('outsider');
select pg_temp.lerror(format('select public.get_content_coupons(%L)',pg_temp.lid('academy')),'forbidden');
select pg_temp.lerror(format('select public.generate_content_coupons(%L,%L,1,%L)',pg_temp.lid('academy'),pg_temp.lid('regular'),gen_random_uuid()),'forbidden');
select pg_temp.lact('student');
select pg_temp.lerror(format('select public.get_content_coupon_options(%L)',pg_temp.lid('academy')),'forbidden');
reset role;
select pg_temp.lcheck(not exists(select 1 from public.content_coupon_redemptions where coupon_id in (select id from coupons)),'failed attempts consumed no coupons');
-- A saved/draft quiz work row is not an official submission.
insert into public.quiz_work(quiz_id,annual_student_record_id,academy_id,academic_year_id)
 values(pg_temp.lid('quiz'),pg_temp.lid('record-student'),pg_temp.lid('academy'),pg_temp.lid('year'));
insert into public.assignment_recipients(assignment_id,annual_student_record_id,academy_id,academic_year_id,work_status,received_at,work_recorded_at,work_recorded_by)
 values(pg_temp.lid('assignment'),pg_temp.lid('record-student'),pg_temp.lid('academy'),pg_temp.lid('year'),'late',now(),now(),pg_temp.lid('owner'))
 on conflict(assignment_id,annual_student_record_id) do update set work_status='late',received_at=now(),work_recorded_at=now(),work_recorded_by=pg_temp.lid('owner');
select pg_temp.lcheck(not edra_private.content_requirements_met(pg_temp.lid('second-unit'),pg_temp.lid('record-student')),'assignment alone and draft quiz insufficient');
insert into public.quiz_submissions(academy_id,academic_year_id,quiz_id,annual_student_record_id,source,reason,submitted_at,processed_at,scoring_revision,confirmed_by)
 values(pg_temp.lid('academy'),pg_temp.lid('year'),pg_temp.lid('quiz'),pg_temp.lid('record-student'),'physical','physical',now(),now(),1,pg_temp.lid('owner'));
select pg_temp.lcheck(edra_private.content_requirements_met(pg_temp.lid('second-unit'),pg_temp.lid('record-student')),'late assignment and official quiz satisfy all requirements');
set local role authenticated;
select pg_temp.lact('student');
do $$ declare result jsonb; code text; request uuid:=gen_random_uuid(); begin
 code:=lower(substr(pg_temp.code('regular'),1,4)||'- '||substr(pg_temp.code('regular'),5));
 result:=public.redeem_content_coupon(pg_temp.lid('academy'),pg_temp.lid('second-unit'),code,request);
 perform pg_temp.lcheck(result->>'grantId' is not null,'formatted lowercase coupon works after prerequisites');
 perform pg_temp.lcheck(result=public.redeem_content_coupon(pg_temp.lid('academy'),pg_temp.lid('second-unit'),code,request),'retry returns exact grant');
 perform pg_temp.lcheck(public.redeem_content_coupon(pg_temp.lid('academy'),pg_temp.lid('second-unit'),pg_temp.code('regular',2),gen_random_uuid())->>'error'='code_used','one coupon allowance per student/unit');
 perform pg_temp.lcheck(public.redeem_content_coupon(pg_temp.lid('academy'),pg_temp.lid('third-unit'),pg_temp.code('revision'),gen_random_uuid())->>'grantId' is not null,'different type unlocks chosen revision unit');
end $$;
select pg_temp.lact('second');
select pg_temp.lcheck(public.redeem_content_coupon(pg_temp.lid('academy'),pg_temp.lid('second-unit'),pg_temp.code('regular'),gen_random_uuid())->>'error'='code_unavailable','same coupon cannot be reused by another student');
select pg_temp.lact('owner');
do $$ declare i integer; page jsonb; begin
 page:=public.get_content_coupons(pg_temp.lid('academy'));
 perform pg_temp.lcheck(jsonb_array_length(page->'codes')=5,'management list contains only own academy coupons');
 perform pg_temp.lcheck(jsonb_array_length(public.get_content_coupons(pg_temp.lid('academy'),null,null,'redeemed')->'codes')=2,'redemption filter');

end $$;
reset role;
-- Private generation helper is intentionally inaccessible from authenticated callers.
select pg_temp.lcheck(not has_function_privilege('authenticated','edra_private.new_coupon_code()','EXECUTE'),'generator is private');
select pg_temp.lcheck(to_regclass('public.content_access_codes') is null and to_regclass('public.content_code_redemptions') is null and to_regclass('public.content_code_batches') is null,'legacy code tables retired');
-- Persistent rate limit: a returned business denial must not roll the counter back.
select pg_temp.lact('second');
do $$ declare i integer; result jsonb; begin
 for i in 1..21 loop result:=public.redeem_content_coupon(pg_temp.lid('academy'),pg_temp.lid('third-unit'),'ZZZZZZZZ',gen_random_uuid()); end loop;
 perform pg_temp.lcheck(result->>'error'='coupon_rate_limited','failed guesses exhaust rate limit');
end $$;
rollback;
select 'Track coupons and prerequisite gates passed' as result;
