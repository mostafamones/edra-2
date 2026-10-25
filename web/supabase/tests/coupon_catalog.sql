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

insert into learning_ids(name) values('unused-track'),('custom-type'),('default-batch'),('default-prefix'),('retired-type');
insert into public.academy_tracks(id,academy_id,level_id,name,sort_order) values(pg_temp.lid('unused-track'),pg_temp.lid('academy'),'secondary-2','Unused track',0);
create temporary table catalog_before as select count(*) programs from public.content_programs where academy_id=pg_temp.lid('academy');
set local role authenticated;
select pg_temp.lact('owner');
do $$ declare options jsonb; begin
 options:=public.get_content_coupon_options(pg_temp.lid('academy'));
 perform pg_temp.lcheck(jsonb_array_length(options->'programs')=1,'catalog exposes one academy context per academic year');
 perform pg_temp.lcheck(not exists(select 1 from jsonb_array_elements(options->'programs') p where p->>'levelId' is not null or p->>'trackId' is not null),'catalog has no grade or track choices');
end $$;
reset role;
select pg_temp.lcheck((select count(*) from public.content_programs where academy_id=pg_temp.lid('academy'))=(select programs from catalog_before),'catalog read creates no program records');
select pg_temp.lcheck(not exists(select 1 from public.content_programs where academy_id=pg_temp.lid('academy') and level_id='secondary-2'),'unused grade still has no content scope');
set local role authenticated;
select pg_temp.lact('owner');
select public.generate_academy_default_coupons(pg_temp.lid('academy'),pg_temp.lid('year'),2,pg_temp.lid('default-batch'));
select public.change_academy_default_prefix(pg_temp.lid('academy'),pg_temp.lid('year'),'GEN',pg_temp.lid('default-prefix'));
select public.create_academy_coupon_type(pg_temp.lid('academy'),pg_temp.lid('year'),'Revision','REV',pg_temp.lid('custom-type'));
do $$ declare page jsonb; begin
 page:=public.get_scoped_content_coupons(pg_temp.lid('academy'),pg_temp.lid('year'),'secondary-2',pg_temp.lid('unused-track'));
 perform pg_temp.lcheck(jsonb_array_length(page->'codes')=2,'default generation works before units exist');
 perform pg_temp.lcheck(page->'codes'->0->>'prefix'='REG','prefix change does not rewrite generated codes');
 perform pg_temp.lcheck(jsonb_array_length(public.get_scoped_content_coupons(pg_temp.lid('academy'),pg_temp.lid('year'),'secondary-1',null)->'codes')=2,'both grades see the same academy coupon catalog');
end $$;
select pg_temp.lact('student');
select pg_temp.lerror(format('select public.generate_academy_default_coupons(%L,%L,1,%L)',pg_temp.lid('academy'),pg_temp.lid('year'),gen_random_uuid()),'forbidden');
select pg_temp.lact('outsider');
select pg_temp.lerror(format('select public.get_content_coupon_options(%L)',pg_temp.lid('academy')),'forbidden');
select pg_temp.lerror(format('select public.get_scoped_content_coupons(%L,%L,''secondary-2'',null)',pg_temp.lid('academy'),pg_temp.lid('year')),'forbidden');
reset role;
select pg_temp.lcheck((select count(*)=5 from public.content_units where academy_id=pg_temp.lid('academy')),'coupon operations did not create units');
select pg_temp.lcheck((select count(*)=1 from public.content_coupon_types where academy_id=pg_temp.lid('academy') and academic_year_id=pg_temp.lid('year') and level_id is null and is_default and all_tracks and not retired),'only one shared Regular default');
insert into public.content_coupon_types(id,academy_id,program_id,academic_year_id,level_id,track_id,name,prefix,created_by,retired)
 select pg_temp.lid('retired-type'),pg_temp.lid('academy'),program_id,academic_year_id,level_id,track_id,'Old automatic type','REG',pg_temp.lid('owner'),true from public.content_coupon_types where id=pg_temp.lid('custom-type');
select pg_temp.lact('owner');
select pg_temp.lcheck(not exists(select 1 from jsonb_array_elements(public.get_content_coupon_options(pg_temp.lid('academy'))->'types') t where t->>'id'=pg_temp.lid('retired-type')::text),'retired types are absent from picker');
select pg_temp.lerror(format('select public.generate_content_coupons(%L,%L,1,%L)',pg_temp.lid('academy'),pg_temp.lid('retired-type'),gen_random_uuid()),'validation');
select pg_temp.lerror(format('select public.change_content_coupon_prefix(%L,%L,''NEW'',%L)',pg_temp.lid('academy'),pg_temp.lid('retired-type'),gen_random_uuid()),'validation');
select pg_temp.lcheck(not has_function_privilege('authenticated','public.generate_default_coupons(uuid,uuid,text,uuid,integer,uuid)','execute'),'scoped generation endpoint is unavailable');
rollback;
select 'Coupon offering catalog and content-free generation passed' as result;
