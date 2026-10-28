-- Random fixtures on the disposable GitHub Actions database; nothing is retained.
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
create temporary table option_context(actor uuid,outsider uuid,academy uuid,other_academy uuid,year_id uuid,other_year uuid,track_a uuid,track_b uuid,target uuid,wide uuid,foreign_unit uuid);
insert into option_context select gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),null,null,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),null;
grant select,update on option_context to authenticated;
create temporary table option_candidates(id uuid,kind text,label text);
grant select,insert on option_candidates to authenticated;
insert into auth.users(id) select actor from option_context union all select outsider from option_context;
insert into public.academies(id,name,slug,icon,subject,created_by)
  select academy,'Options test','options-'||academy,'school','Math',actor from option_context
  union all select other_academy,'Foreign options','options-'||other_academy,'school','Math',outsider from option_context;
insert into public.academy_memberships(academy_id,user_id,role,created_by)
  select academy,actor,'owner'::public.academy_role,actor from option_context
  union all select other_academy,outsider,'owner'::public.academy_role,outsider from option_context;
insert into public.academy_levels(academy_id,level_id,sort_order)
  select academy,'secondary-3',0 from option_context union all select academy,'secondary-1',1 from option_context
  union all select other_academy,'secondary-3',0 from option_context;
insert into public.academy_tracks(id,academy_id,level_id,name,sort_order)
  select track_a,academy,'secondary-3','Track A',0 from option_context
  union all select track_b,academy,'secondary-3','Track B',1 from option_context;
update option_context c set year_id=(select id from public.academic_years where academy_id=c.academy and closed_at is null),other_year=(select id from public.academic_years where academy_id=c.other_academy and closed_at is null);
create function pg_temp.option_batch(p_label text,p_level text,p_track uuid,p_attached boolean default false)
returns uuid language plpgsql as $$
declare c record; unit_id uuid:=gen_random_uuid(); k text; v integer:=1; fresh uuid; begin
  select * into c from option_context;
  perform public.create_content_unit(c.academy,c.year_id,p_level,p_track,unit_id,p_label);
  foreach k in array array['assignment','quiz','exam'] loop
    fresh:=public.create_content_assessment(c.academy,unit_id,v,k,p_label||' '||k);
    insert into option_candidates values(fresh,k,p_label); v:=v+1;
  end loop;
  if not p_attached then perform public.save_content_unit(c.academy,unit_id,v,jsonb_build_object('title',p_label,'description','','items','[]'::jsonb)); end if;
  return unit_id;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',actor::text,true) from option_context;
select pg_temp.option_batch('old-year','secondary-3',null);
reset role;
update public.academic_years set closed_at=now() where id=(select year_id from option_context);
insert into public.academic_years(academy_id,start_year) select academy,(select start_year+1 from public.academic_years where id=c.year_id) from option_context c;
update option_context c set year_id=(select id from public.academic_years where academy_id=c.academy and closed_at is null);
set local role authenticated;
select public.create_content_unit(academy,year_id,'secondary-3',track_a,target,'Target') from option_context;
select public.create_content_unit(academy,year_id,'secondary-3',null,wide,'Whole grade') from option_context;
select pg_temp.option_batch('compatible','secondary-3',track_a) from option_context;
select pg_temp.option_batch('wrong-track','secondary-3',track_b) from option_context;
select pg_temp.option_batch('wrong-grade','secondary-1',null);
select pg_temp.option_batch('broad-audience','secondary-3',null);
select pg_temp.option_batch('already-attached','secondary-3',track_a,true) from option_context;
select pg_temp.option_batch('group-fit','secondary-3',track_a) from option_context;
select pg_temp.option_batch('group-mixed','secondary-3',null);
select pg_temp.option_batch('archived','secondary-3',track_a) from option_context;
select set_config('request.jwt.claim.sub',outsider::text,true) from option_context;
do $$ declare c record; foreign_unit uuid:=gen_random_uuid(); k text; v integer:=1; fresh uuid; begin
  select * into c from option_context;
  perform public.create_content_unit(c.other_academy,c.other_year,'secondary-3',null,foreign_unit,'Foreign');
  foreach k in array array['assignment','quiz','exam'] loop
    fresh:=public.create_content_assessment(c.other_academy,foreign_unit,v,k,'Foreign '||k);
    insert into option_candidates values(fresh,k,'foreign'); v:=v+1;
  end loop;
  perform public.save_content_unit(c.other_academy,foreign_unit,v,'{"title":"Foreign","description":"","items":[]}');
end $$;
reset role;
update option_context c set foreign_unit=(select id from public.content_units where academy_id=c.other_academy limit 1);
do $$ declare c record; ga uuid:=gen_random_uuid(); gb uuid:=gen_random_uuid(); r record; table_name text; groups_table text; begin
  select * into c from option_context;
  insert into public.groups(id,academy_id,academic_year_id,level_id,track_id,name) values
    (ga,c.academy,c.year_id,'secondary-3',c.track_a,'Group A'),(gb,c.academy,c.year_id,'secondary-3',c.track_b,'Group B');
  for r in select * from option_candidates where label in ('group-fit','group-mixed','archived') loop
    table_name:=case r.kind when 'assignment' then 'assignments' when 'quiz' then 'quizzes' else 'exams' end;
    if r.label='archived' then
      execute format('update public.%I set archived_at=now(),archived_by=$2%s where id=$1',table_name,case when r.kind='assignment' then ',state=''archived''' else '' end) using r.id,c.actor;
    else
      execute format('update public.%I set audience=''groups'',level_id=null,track_id=null where id=$1',table_name) using r.id;
      groups_table:=r.kind||'_audience_groups';
      execute format('insert into public.%I(%I,academy_id,academic_year_id,group_id) values($1,$2,$3,$4)',groups_table,r.kind||'_id') using r.id,c.academy,c.year_id,ga;
      if r.label='group-mixed' then execute format('insert into public.%I(%I,academy_id,academic_year_id,group_id) values($1,$2,$3,$4)',groups_table,r.kind||'_id') using r.id,c.academy,c.year_id,gb; end if;
    end if;
  end loop;
end $$;
set constraints all immediate;
set local role authenticated;
select set_config('request.jwt.claim.sub',actor::text,true) from option_context;
do $$ declare c record; n integer; doc jsonb; begin
  select * into c from option_context;
  select count(*) into n from public.content_assessment_options(c.academy,c.target);
  if n<>6 then raise exception 'Expected 6 compatible options, got %',n; end if;
  if exists(select 1 from public.content_assessment_options(c.academy,c.target) o join option_candidates a using(id) where a.label not in ('compatible','group-fit')) then raise exception 'Incompatible candidate shown'; end if;
  select count(*) into n from public.content_assessment_options(c.academy,c.wide);
  if n<>15 then raise exception 'Whole-grade program omitted covered track/group audiences: %',n; end if;
  if (select count(*) from public.content_assessment_options(c.academy,c.target,2,2))<>2 then raise exception 'Picker pagination failed'; end if;
  if exists(select id from public.content_assessment_options(c.academy,c.target,0,2) intersect select id from public.content_assessment_options(c.academy,c.target,2,2)) then raise exception 'Picker pages overlap'; end if;
  select jsonb_build_object('title','Target','description','','items',jsonb_agg(jsonb_build_object('id',gen_random_uuid(),'kind','assessment','title',o.title,'assessmentKind',o.kind,'assessmentId',o.id))) into doc from public.content_assessment_options(c.academy,c.target) o;
  perform public.save_content_unit(c.academy,c.target,1,doc);
  if exists(select 1 from public.content_assessment_options(c.academy,c.target)) then raise exception 'Saved attachments still offered'; end if;
  begin perform public.content_assessment_options(c.academy,c.foreign_unit); raise exception 'Foreign unit leaked'; exception when raise_exception then if sqlerrm<>'not_found' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub',outsider::text,true) from option_context;
do $$ declare c record; begin
  select * into c from option_context;
  begin perform public.content_assessment_options(c.academy,c.target); raise exception 'Cross-academy picker allowed'; exception when raise_exception then if sqlerrm<>'forbidden' then raise; end if; end;
end $$;
reset role;
rollback;
select 'Assessment picker program/year/group/attachment/isolation checks passed' as result;
