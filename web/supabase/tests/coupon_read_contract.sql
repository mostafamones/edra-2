-- Disposable GitHub Actions database only; all fixtures roll back.
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

-- Academy-wide nullable read contract.
insert into learning_ids(name) values('global-type'),('global-batch'),('grade-type'),('grade-batch');
insert into public.content_coupon_types(id,academy_id,program_id,academic_year_id,level_id,track_id,name,prefix,all_tracks,created_by)
 values(pg_temp.lid('global-type'),pg_temp.lid('academy'),null,pg_temp.lid('year'),null,null,'Academy wide','GLB',true,pg_temp.lid('owner'));
insert into public.content_coupon_batches(id,academy_id,type_id,created_by,quantity) values(pg_temp.lid('global-batch'),pg_temp.lid('academy'),pg_temp.lid('global-type'),pg_temp.lid('owner'),1);
insert into public.content_coupons(academy_id,type_id,batch_id,code) values(pg_temp.lid('academy'),pg_temp.lid('global-type'),pg_temp.lid('global-batch'),'ABCDEFGH');
select public.create_academy_coupon_type(pg_temp.lid('academy'),pg_temp.lid('year'),'Another academy type','GRD',pg_temp.lid('grade-type'));
select public.generate_content_coupons(pg_temp.lid('academy'),pg_temp.lid('grade-type'),1,pg_temp.lid('grade-batch'));
set local role authenticated;
select pg_temp.lact('owner');
select pg_temp.lcheck(jsonb_array_length(public.get_scoped_content_coupons(pg_temp.lid('academy'),pg_temp.lid('year'),'secondary-1',pg_temp.lid('track'))->'codes')=2,'selected grade includes grade-wide and academy-wide codes');
select pg_temp.lcheck(jsonb_array_length(public.get_scoped_content_coupons(pg_temp.lid('academy'),pg_temp.lid('year'),'secondary-2',null)->'codes')=2,'every grade includes the same academy-wide codes');
select pg_temp.lcheck(jsonb_array_length(public.get_scoped_content_coupons(pg_temp.lid('academy'),gen_random_uuid(),'secondary-1',null)->'codes')=0,'academy-wide codes remain restricted to their year');
select pg_temp.lcheck(jsonb_array_length(public.get_scoped_content_coupons(pg_temp.lid('academy'),pg_temp.lid('year'),'secondary-1',null,pg_temp.lid('global-type'))->'codes')=1,'academy-wide type filter remains functional');
select pg_temp.lact('outsider');
select pg_temp.lerror(format('select public.get_scoped_content_coupons(%L,%L,''secondary-1'',null)',pg_temp.lid('academy'),pg_temp.lid('year')),'forbidden');
select pg_temp.lact('student');
select pg_temp.lerror(format('select public.get_scoped_content_coupons(%L,%L,''secondary-1'',null)',pg_temp.lid('academy'),pg_temp.lid('year')),'forbidden');
reset role;
rollback;
select 'Nullable academy-wide coupon read contract passed' as result;
