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

create temporary table publish_before as select version,draft,published_revision from public.content_units where id=pg_temp.lid('unit');
set local role authenticated;
select pg_temp.lact('instructor');
select pg_temp.lerror(format('select public.publish_content_edits(%L,%L,3,%L::jsonb)',pg_temp.lid('academy'),pg_temp.lid('unit'),'{"title":"Forbidden","description":"","items":[]}'),'forbidden');
select pg_temp.lact('outsider');
select pg_temp.lerror(format('select public.publish_content_edits(%L,%L,3,%L::jsonb)',pg_temp.lid('academy'),pg_temp.lid('unit'),'{"title":"Foreign","description":"","items":[]}'),'forbidden');
select pg_temp.lact('owner');
-- This is a valid working document but cannot publish without an explanation.
select pg_temp.lerror(format('select public.publish_content_edits(%L,%L,3,%L::jsonb)',pg_temp.lid('academy'),pg_temp.lid('unit'),'{"title":"Must roll back","description":"","items":[]}'),'explanation_required');
reset role;
select pg_temp.lcheck((select u.version=b.version and u.draft=b.draft and u.published_revision=b.published_revision from public.content_units u cross join publish_before b where u.id=pg_temp.lid('unit')),'failed publish leaves stored draft and publication untouched');
set local role authenticated;
select pg_temp.lact('owner');
do $$ declare doc jsonb; next_version integer; begin
 select draft into doc from public.content_units where id=pg_temp.lid('unit');
 next_version:=public.publish_content_edits(pg_temp.lid('academy'),pg_temp.lid('unit'),3,doc||jsonb_build_object('title','Published directly','accessDays',30));
 perform pg_temp.lcheck(next_version=5,'save and publish use the resulting draft version');
end $$;
reset role;
select pg_temp.lcheck((select u.version=5 and u.published_version=5 and u.published_revision=2 and r.document->>'title'='Published directly' and r.document->>'accessDays'='30' from public.content_units u join public.content_revisions r on r.unit_id=u.id and r.revision=u.published_revision where u.id=pg_temp.lid('unit')),'current edits are published in the same operation');
select pg_temp.lcheck((select document->>'title'='Lesson unit' from public.content_revisions where unit_id=pg_temp.lid('unit') and revision=1),'previous publication remains intact');
select pg_temp.lact('owner');
select pg_temp.lerror(format('select public.publish_content_edits(%L,%L,3,%L::jsonb)',pg_temp.lid('academy'),pg_temp.lid('unit'),'{"title":"Stale edit","description":"","items":[]}'),'content_conflict');
select pg_temp.lcheck((select version=5 and published_revision=2 from public.content_units where id=pg_temp.lid('unit')),'stale request cannot overwrite a newer publication');
select pg_temp.lact('student');
select pg_temp.lcheck(public.get_my_content_unit(pg_temp.lid('academy'),pg_temp.lid('unit'))->>'title'='Published directly','student sees the newly published snapshot');
select pg_temp.lact('owner');
select public.change_content_unit(pg_temp.lid('academy'),pg_temp.lid('unit'),5,'archive');
select pg_temp.lerror(format('select public.publish_content_edits(%L,%L,6,%L::jsonb)',pg_temp.lid('academy'),pg_temp.lid('unit'),'{"title":"Archived","description":"","items":[]}'),'archived');
reset role;
update public.academic_years set closed_at=now() where id=pg_temp.lid('year');
select pg_temp.lact('owner');
select pg_temp.lerror(format('select public.publish_content_edits(%L,%L,3,%L::jsonb)',pg_temp.lid('academy'),pg_temp.lid('second-unit'),'{"title":"Closed year","description":"","items":[]}'),'year_closed');
select pg_temp.lcheck(not has_function_privilege('anon','public.publish_content_edits(uuid,uuid,integer,jsonb)','EXECUTE'),'anonymous callers cannot publish');
-- Draft history: creation, each stored draft and save-and-publish edits are kept; failed or unchanged writes are not.
select pg_temp.lcheck((select array_agg(kind order by id)=array['created','saved','saved'] from public.content_drafts where unit_id=pg_temp.lid('unit')),'draft history records creation, the editor save and the save-and-publish edit');
select pg_temp.lcheck((select document->>'title'='Published directly' and saved_by=pg_temp.lid('owner') and version=4 from public.content_drafts where unit_id=pg_temp.lid('unit') order by id desc limit 1),'draft history keeps the stored document, its author and version');
select pg_temp.lcheck(not exists(select 1 from public.content_drafts where document->>'title' in ('Must roll back','Stale edit')),'rolled back saves leave no draft history');
set local role authenticated;
select pg_temp.lact('instructor');
select pg_temp.lcheck((select count(*)>0 from public.content_drafts where unit_id=pg_temp.lid('unit')),'academy staff can read draft history');
select pg_temp.lact('outsider');
select pg_temp.lcheck(not exists(select 1 from public.content_drafts where unit_id=pg_temp.lid('unit')),'other academies cannot read draft history');
select pg_temp.lact('student');
select pg_temp.lcheck(not exists(select 1 from public.content_drafts),'students cannot read draft history');
select pg_temp.lerror(format('insert into public.content_drafts(unit_id,academy_id,version,kind,document) values(%L,%L,9,%L,%L::jsonb)',pg_temp.lid('unit'),pg_temp.lid('academy'),'saved','{}'),'permission denied');
reset role;
rollback;
select 'Atomic save-and-publish passed' as result;
