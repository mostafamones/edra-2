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

insert into learning_ids(name) values('used-type'),('unused-type'),('batch-type'),('update-type'),('remove-unused'),('archive-used');
select public.create_content_coupon_type(pg_temp.lid('academy'),(select program_id from public.content_units where id=pg_temp.lid('unit')),'Revision',pg_temp.lid('used-type'),'REV',true);
select public.create_content_coupon_type(pg_temp.lid('academy'),(select program_id from public.content_units where id=pg_temp.lid('unit')),'Unused',pg_temp.lid('unused-type'),'UNU',true);
select public.generate_content_coupons(pg_temp.lid('academy'),pg_temp.lid('used-type'),2,pg_temp.lid('batch-type'));
do $$ declare u public.content_units; begin
 select * into u from public.content_units where id=pg_temp.lid('unit');
 perform public.save_content_unit(u.academy_id,u.id,u.version,u.draft||jsonb_build_object('couponTypeId',pg_temp.lid('used-type')));
 perform public.change_content_unit(u.academy_id,u.id,u.version+1,'publish');
end $$;
create temporary table management_codes as select id,code from public.content_coupons where batch_id=pg_temp.lid('batch-type');
grant select on management_codes to authenticated;
insert into learning_ids(name,id) select 'protected-default',id from public.content_coupon_types where academy_id=pg_temp.lid('academy') and level_id='secondary-1' and track_id is null and is_default;
set local role authenticated;
select pg_temp.lact('instructor');
select pg_temp.lerror(format('select public.remove_content_coupon_type(%L,%L,%L)',pg_temp.lid('academy'),pg_temp.lid('used-type'),gen_random_uuid()),'forbidden');
select pg_temp.lact('outsider');
select pg_temp.lerror(format('select public.update_scoped_coupon_type(%L,%L,%L,''secondary-1'',null,''Other'',''OTH'',%L)',pg_temp.lid('academy'),pg_temp.lid('used-type'),pg_temp.lid('year'),gen_random_uuid()),'forbidden');
select pg_temp.lact('owner');
do $$ declare result jsonb; begin
 result:=public.update_scoped_coupon_type(pg_temp.lid('academy'),pg_temp.lid('used-type'),pg_temp.lid('year'),'secondary-1',null,'Revision course','RV',pg_temp.lid('update-type'));
 perform pg_temp.lcheck(result=public.update_scoped_coupon_type(pg_temp.lid('academy'),pg_temp.lid('used-type'),pg_temp.lid('year'),'secondary-1',null,'Revision course','RV',pg_temp.lid('update-type')),'edit retry returns original receipt');
end $$;
select pg_temp.lerror(format('select public.update_scoped_coupon_type(%L,%L,%L,''secondary-1'',null,''Unused'',''NEW'',%L)',pg_temp.lid('academy'),pg_temp.lid('used-type'),pg_temp.lid('year'),gen_random_uuid()),'coupon_type_exists');
select pg_temp.lerror(format('select public.remove_content_coupon_type(%L,%L,%L)',pg_temp.lid('academy'),pg_temp.lid('protected-default'),gen_random_uuid()),'default_coupon_type');
select pg_temp.lcheck(public.remove_content_coupon_type(pg_temp.lid('academy'),pg_temp.lid('unused-type'),pg_temp.lid('remove-unused'))->>'mode'='deleted','unused custom type is deleted');
select pg_temp.lcheck(public.remove_content_coupon_type(pg_temp.lid('academy'),pg_temp.lid('unused-type'),pg_temp.lid('remove-unused'))->>'mode'='deleted','delete retry works after the row is removed');
select pg_temp.lcheck(public.remove_content_coupon_type(pg_temp.lid('academy'),pg_temp.lid('used-type'),pg_temp.lid('archive-used'))->>'mode'='archived','used type is archived');
select pg_temp.lerror(format('select public.generate_content_coupons(%L,%L,1,%L)',pg_temp.lid('academy'),pg_temp.lid('used-type'),gen_random_uuid()),'validation');
reset role;
select pg_temp.lcheck(not exists(select 1 from public.content_coupon_types where id=pg_temp.lid('unused-type')),'unused row removed');
select pg_temp.lcheck((select retired and name='Revision course' and prefix='S1-RV' and level_id='secondary-1' and track_id is null from public.content_coupon_types where id=pg_temp.lid('used-type')),'archive preserves metadata; failed duplicate edit changed nothing');
select pg_temp.lcheck((select prefix='S1-REV' from public.content_coupon_batches where id=pg_temp.lid('batch-type')),'printed prefix remains unchanged');
select pg_temp.lcheck((select count(*)=2 from public.content_coupons where batch_id=pg_temp.lid('batch-type')),'archive preserves every generated code');
-- Existing working/public selections remain usable, but new selections are denied.
select pg_temp.lact('owner');
do $$ declare u public.content_units; begin
 select * into u from public.content_units where id=pg_temp.lid('unit');
 perform public.save_content_unit(u.academy_id,u.id,u.version,u.draft||jsonb_build_object('title','Retained archived type'));
 perform public.change_content_unit(u.academy_id,u.id,u.version+1,'publish');
 select * into u from public.content_units where id=pg_temp.lid('second-unit');
 perform pg_temp.lerror(format('select public.save_content_unit(%L,%L,%s,%L::jsonb)',u.academy_id,u.id,u.version,u.draft||jsonb_build_object('couponTypeId',pg_temp.lid('used-type'))),'coupon_type_mismatch');
 perform pg_temp.lcheck(exists(select 1 from jsonb_array_elements(public.get_content_requirement_options(pg_temp.lid('academy'),pg_temp.lid('unit'))->'types') t where t->>'id'=pg_temp.lid('used-type')::text and t->>'name' like '%(Legacy)'),'unit editor retains its archived type choice');
end $$;
set local role authenticated;
select pg_temp.lact('student');
do $$ declare code text; result jsonb; begin
 select c.code into code from management_codes c order by id limit 1;
 result:=public.redeem_content_coupon(pg_temp.lid('academy'),pg_temp.lid('unit'),'S1-REV-'||code,gen_random_uuid());
 perform pg_temp.lcheck(result->>'grantId' is not null,'previously issued coupon still redeems after type archive');
end $$;
reset role;
rollback;
select 'Coupon type updates, safe removal and archived-code continuity passed' as result;
