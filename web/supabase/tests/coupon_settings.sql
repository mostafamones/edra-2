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

insert into learning_ids(name) values('auto-unit'),('other-track'),('other-unit'),('shared'),('track-only'),('old-batch'),('new-batch'),('prefix-request');
insert into public.academy_tracks(id,academy_id,level_id,name,sort_order) values(pg_temp.lid('other-track'),pg_temp.lid('academy'),'secondary-1','Other track',1);
select public.create_content_unit(pg_temp.lid('academy'),pg_temp.lid('year'),'secondary-1',pg_temp.lid('track'),pg_temp.lid('auto-unit'),'Automatic default');
select public.create_content_unit(pg_temp.lid('academy'),pg_temp.lid('year'),'secondary-1',pg_temp.lid('other-track'),pg_temp.lid('other-unit'),'Other default');
do $$ declare a uuid; b uuid; t public.content_coupon_types; begin
 select (draft->>'couponTypeId')::uuid into a from public.content_units where id=pg_temp.lid('auto-unit');
 select (draft->>'couponTypeId')::uuid into b from public.content_units where id=pg_temp.lid('other-unit');
 select * into strict t from public.content_coupon_types where id=a;
 perform pg_temp.lcheck(a=b and t.all_tracks and t.is_default and t.track_id is null and t.prefix='REG','new units in different tracks pick the same shared Regular default');
 perform pg_temp.lcheck(t.level_id is null and t.program_id is null,'new units default to the academy-wide Regular');
 perform pg_temp.lcheck((select count(*)=1 from public.content_coupon_types where academy_id=pg_temp.lid('academy') and academic_year_id=pg_temp.lid('year') and level_id is null and is_default),'one academy-wide default per year');
end $$;
set local role authenticated;
select pg_temp.lact('owner');
select public.create_content_coupon_type(pg_temp.lid('academy'),(select program_id from public.content_units where id=pg_temp.lid('auto-unit')),'Revision shared',pg_temp.lid('shared'),'rev',true);
select public.create_content_coupon_type(pg_temp.lid('academy'),(select program_id from public.content_units where id=pg_temp.lid('auto-unit')),'Scientific only',pg_temp.lid('track-only'),'SCI',false);
reset role;
create function pg_temp.settings_save(label text,type_label text) returns void language plpgsql as $$
declare u public.content_units; begin
 select * into strict u from public.content_units where id=pg_temp.lid(label);
 perform public.save_content_unit(u.academy_id,u.id,u.version,u.draft||jsonb_build_object('couponTypeId',pg_temp.lid(type_label)));
end $$;
select pg_temp.settings_save('auto-unit','shared');
select pg_temp.settings_save('other-unit','shared');
select pg_temp.lerror('select pg_temp.settings_save(''other-unit'',''track-only'')','coupon_type_mismatch');
select pg_temp.settings_save('track-unit','shared');
select public.change_content_unit(pg_temp.lid('academy'),pg_temp.lid('track-unit'),(select version from public.content_units where id=pg_temp.lid('track-unit')),'publish');
select public.generate_content_coupons(pg_temp.lid('academy'),pg_temp.lid('shared'),2,pg_temp.lid('old-batch'));
select public.change_content_coupon_prefix(pg_temp.lid('academy'),pg_temp.lid('shared'),'mock',pg_temp.lid('prefix-request'));
select public.generate_content_coupons(pg_temp.lid('academy'),pg_temp.lid('shared'),1,pg_temp.lid('new-batch'));
select pg_temp.lcheck((select prefix='REV' from public.content_coupon_batches where id=pg_temp.lid('old-batch')) and (select prefix='MOCK' from public.content_coupon_batches where id=pg_temp.lid('new-batch')),'prefix edit preserves printed batches');
select pg_temp.lcheck(public.generate_content_coupons(pg_temp.lid('academy'),pg_temp.lid('shared'),2,pg_temp.lid('old-batch'))->'codes'->0->>'prefix'='REV','lost-response generation retry retains original prefix');
select pg_temp.lcheck(jsonb_array_length(public.get_content_coupons(pg_temp.lid('academy'),(select program_id from public.content_units where id=pg_temp.lid('other-unit')))->'codes')=3,'shared coupons listed from another track');
select pg_temp.lcheck(jsonb_path_exists(public.get_content_coupon_options(pg_temp.lid('academy')),'$.types[*] ? (@.isDefault == true && @.allTracks == true && @.prefix == "REG")'),'options expose shared defaults');
-- The student still needs their own eligible track, despite the shared coupon scope.
update public.annual_student_records set track_id=pg_temp.lid('track') where id in (pg_temp.lid('record-student'),pg_temp.lid('record-second'));
create temporary table settings_codes as select row_number() over(order by id) as n,code,id from public.content_coupons where batch_id=pg_temp.lid('old-batch');
grant select on settings_codes to authenticated;
set local role authenticated;
select pg_temp.lact('student');
do $$ declare code text; result jsonb; begin
 select c.code into code from settings_codes c where n=1;
 result:=public.redeem_content_coupon(pg_temp.lid('academy'),pg_temp.lid('track-unit'),'MOCK-'||code,gen_random_uuid());
 perform pg_temp.lcheck(result->>'error'='code_unavailable','wrong prefix cannot redeem an old printed code');
 result:=public.redeem_content_coupon(pg_temp.lid('academy'),pg_temp.lid('track-unit'),'rev-'||lower(substr(code,1,4))||'- '||lower(substr(code,5)),gen_random_uuid());
 perform pg_temp.lcheck(result->>'grantId' is not null,'original printed prefix works on selected track unit');
end $$;
select pg_temp.lact('second');
do $$ declare code text; result jsonb; begin
 select c.code into code from settings_codes c where n=2;
 result:=public.redeem_content_coupon(pg_temp.lid('academy'),pg_temp.lid('track-unit'),code,gen_random_uuid());
 perform pg_temp.lcheck(result->>'grantId' is not null,'bare eight-character code is still accepted');
end $$;
-- Academy-wide types are valid for units in any grade.
reset role;
insert into learning_ids(name) values('academy-type'),('academy-batch'),('academy-default-batch'),('grade-two-unit');
set local role authenticated;
select pg_temp.lact('student');
select pg_temp.lerror(format('select public.create_academy_coupon_type(%L,%L,''Pass'',''PAS'',%L)',pg_temp.lid('academy'),pg_temp.lid('year'),gen_random_uuid()),'forbidden');
select pg_temp.lact('owner');
select public.create_academy_coupon_type(pg_temp.lid('academy'),pg_temp.lid('year'),'Academy pass','acd',pg_temp.lid('academy-type'));
select pg_temp.lerror(format('select public.create_academy_coupon_type(%L,%L,''academy pass'',''APX'',%L)',pg_temp.lid('academy'),pg_temp.lid('year'),gen_random_uuid()),'coupon_type_exists');
select public.create_content_unit(pg_temp.lid('academy'),pg_temp.lid('year'),'secondary-2',null,pg_temp.lid('grade-two-unit'),'Grade two lesson');
reset role;
select pg_temp.settings_save('grade-two-unit','academy-type');
select pg_temp.settings_save('unit','academy-type');
select public.change_content_unit(pg_temp.lid('academy'),pg_temp.lid('unit'),(select version from public.content_units where id=pg_temp.lid('unit')),'publish');
select public.generate_content_coupons(pg_temp.lid('academy'),pg_temp.lid('academy-type'),1,pg_temp.lid('academy-batch'));
select public.generate_academy_default_coupons(pg_temp.lid('academy'),pg_temp.lid('year'),2,pg_temp.lid('academy-default-batch'));
select pg_temp.lcheck((select t.level_id is null and t.is_default from public.content_coupon_batches b join public.content_coupon_types t on t.id=b.type_id where b.id=pg_temp.lid('academy-default-batch')),'academy default generation uses the academy Regular');
select pg_temp.lcheck(jsonb_array_length(public.get_content_coupon_batches(pg_temp.lid('academy'),p_academy_wide=>true)->'batches')=2,'academy filter lists only academy-wide batches');
select pg_temp.lcheck((public.get_content_coupon_batches(pg_temp.lid('academy'),p_academy_wide=>true)->'batches'->0->>'level') is null,'academy batches have no grade');
create temporary table academy_codes as select code from public.content_coupons where batch_id=pg_temp.lid('academy-batch');
grant select on academy_codes to authenticated;
set local role authenticated;
select pg_temp.lact('student');
do $$ declare result jsonb; begin
 result:=public.redeem_content_coupon(pg_temp.lid('academy'),pg_temp.lid('unit'),'ACD-'||(select code from academy_codes),gen_random_uuid());
 perform pg_temp.lcheck(result->>'grantId' is not null,'academy-wide coupon redeems on a grade unit');
end $$;
select pg_temp.lact('outsider');
select pg_temp.lerror(format('select public.change_content_coupon_prefix(%L,%L,''BAD'',%L)',pg_temp.lid('academy'),pg_temp.lid('shared'),gen_random_uuid()),'forbidden');
select pg_temp.lact('owner');
select pg_temp.lerror(format('select public.change_content_coupon_prefix(%L,%L,''A1'',%L)',pg_temp.lid('academy'),pg_temp.lid('shared'),gen_random_uuid()),'validation');
reset role;
select pg_temp.lcheck(not has_function_privilege('authenticated','edra_private.default_coupon_type(uuid)','EXECUTE'),'default helper is private');
select pg_temp.lcheck(not has_function_privilege('authenticated','edra_private.academy_coupon_default(uuid,uuid)','EXECUTE'),'academy default helper is private');
-- Batch reads and type management keep staff authority and immutable coupon history.
insert into learning_ids(name) values('unused-type');
select pg_temp.lact('owner');
select public.create_academy_coupon_type(pg_temp.lid('academy'),pg_temp.lid('year'),'Unused type','UNU',pg_temp.lid('unused-type'));
set local role authenticated;
select pg_temp.lact('student');
select pg_temp.lerror(format('select public.get_content_coupon_batch(%L,%L)',pg_temp.lid('academy'),pg_temp.lid('academy-batch')),'forbidden');
select pg_temp.lerror(format('select public.get_content_coupon_batches(%L)',pg_temp.lid('academy')),'forbidden');
select pg_temp.lerror(format('select public.rename_content_coupon_type(%L,%L,''Changed'',%L)',pg_temp.lid('academy'),pg_temp.lid('unused-type'),gen_random_uuid()),'forbidden');
select pg_temp.lact('outsider');
select pg_temp.lerror(format('select public.get_content_coupon_batch(%L,%L)',pg_temp.lid('academy'),pg_temp.lid('academy-batch')),'forbidden');
select pg_temp.lact('instructor');
select pg_temp.lcheck(jsonb_array_length(public.get_content_coupon_batch(pg_temp.lid('academy'),pg_temp.lid('academy-batch'))->'codes')=1,'instructor can read a batch');
select pg_temp.lerror(format('select public.delete_content_coupon_type(%L,%L,%L)',pg_temp.lid('academy'),pg_temp.lid('unused-type'),gen_random_uuid()),'forbidden');
select pg_temp.lact('owner');
select public.rename_content_coupon_type(pg_temp.lid('academy'),pg_temp.lid('unused-type'),'Renamed type',gen_random_uuid());
select pg_temp.lerror(format('select public.delete_content_coupon_type(%L,%L,%L)',pg_temp.lid('academy'),pg_temp.lid('academy-type'),gen_random_uuid()),'coupon_type_in_use');
select public.delete_content_coupon_type(pg_temp.lid('academy'),pg_temp.lid('unused-type'),gen_random_uuid());
reset role;
select pg_temp.lcheck((select retired and name='Renamed type' from public.content_coupon_types where id=pg_temp.lid('unused-type')),'deleting an unused type retires it');
select pg_temp.lcheck((select count(*)=1 from public.content_coupons where batch_id=pg_temp.lid('academy-batch')),'type management preserves issued coupons');
rollback;
select 'Coupon shared defaults and printed prefixes passed' as result;
