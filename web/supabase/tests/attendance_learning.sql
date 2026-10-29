-- Only the disposable GitHub Actions database. Fixtures and all mutations roll back.
begin;
do $$ begin
  if (select count(*) from edra_db_test.target)<>1 or not exists(select 1 from edra_db_test.target where name like 'edra-db-check-%') then raise exception 'Isolated Edra test target required'; end if;
end $$;
create temporary table al_ids(name text primary key,id uuid not null default gen_random_uuid());
insert into al_ids(name) values('owner'),('student'),('academy'),('regular'),('revision'),('blocked'),('prerequisite'),('run');
grant select on al_ids to authenticated;
create function pg_temp.aid(label text) returns uuid language sql as $$ select id from pg_temp.al_ids where name=label $$;
create function pg_temp.assert(ok boolean,label text) returns void language plpgsql as $$ begin
  if ok is not true then raise exception 'Attendance learning assertion: %',label; end if;
end $$;
insert into auth.users(id) select id from al_ids where name in ('owner','student');
insert into public.academies(id,name,slug,icon,subject,created_by)
  values(pg_temp.aid('academy'),'Attendance learning','al-'||pg_temp.aid('academy'),'school','Math',pg_temp.aid('owner'));
insert into al_ids(name,id) select 'year',id from public.academic_years where academy_id=pg_temp.aid('academy');
insert into public.academy_memberships(academy_id,user_id,role,created_by)
  values(pg_temp.aid('academy'),pg_temp.aid('owner'),'owner',pg_temp.aid('owner'));
insert into public.academy_levels(academy_id,level_id,sort_order) values(pg_temp.aid('academy'),'secondary-1',0);
select set_config('request.jwt.claim.sub',pg_temp.aid('owner')::text,true);
insert into al_ids(name,id) select label,(public.create_student_record(pg_temp.aid('academy'),pg_temp.aid('year'),
  'Attendance '||label,'0108815000'||n,'01188159999','secondary-1',null,null,'in_person')).id
  from (values('present',1),('late',2),('absent',3),('excused',4),('unknown',5),('suspended',6)) v(label,n);
update public.academy_student_profiles p set user_id=pg_temp.aid('student'),linked_at=now()
  from public.annual_student_records r where r.id=pg_temp.aid('present') and p.id=r.academy_student_profile_id;
update public.academy_student_profiles p set access_suspended_at=now()
  from public.annual_student_records r where r.id=pg_temp.aid('suspended') and p.id=r.academy_student_profile_id;
do $$ declare label text; doc jsonb; asset uuid; begin
  foreach label in array array['regular','revision','prerequisite','blocked'] loop
    perform public.create_content_unit(pg_temp.aid('academy'),pg_temp.aid('year'),'secondary-1',null,pg_temp.aid(label),label);
    asset:=gen_random_uuid();
    insert into public.content_assets(id,academy_id,unit_id,created_by,kind,name,mime_type,status,playback_id)
      values(asset,pg_temp.aid('academy'),pg_temp.aid(label),pg_temp.aid('owner'),'video','Video','video/mp4','ready','test-playback');
    doc:=jsonb_build_object('title',label,'description','','accessDays',case when label='revision' then 30 else 7 end,
      'items',jsonb_build_array(jsonb_build_object('id',asset,'kind','explanation','title','Video','assetId',asset)));
    if label='blocked' then doc:=doc||jsonb_build_object('prerequisites',jsonb_build_array(
      jsonb_build_object('unitId',pg_temp.aid('prerequisite'),'kind','access'))); end if;
    perform public.save_content_unit(pg_temp.aid('academy'),pg_temp.aid(label),1,doc);
    perform public.change_content_unit(pg_temp.aid('academy'),pg_temp.aid(label),2,'publish');
  end loop;
end $$;
-- Existing access lasts longer than the automatic seven-day grant.
select edra_private.learning_issue(gen_random_uuid(),pg_temp.aid('academy'),
  edra_private.learning_publication(pg_temp.aid('academy'),pg_temp.aid('regular')),
  pg_temp.aid('present'),pg_temp.aid('regular'),'staff',40*86400);
create function pg_temp.make_session(label text) returns uuid language plpgsql as $$
declare schedule uuid; sid uuid; changes jsonb; begin
  schedule:=public.create_schedule(pg_temp.aid('academy'),pg_temp.aid('year'),label,'recurring','program',null,'secondary-1',null,true,null,
    '[{"weekday":1,"startsAt":"17:00","endsAt":"18:00"}]','[]');
  select session_id into sid from public.start_session(pg_temp.aid('academy'),schedule,gen_random_uuid());
  perform public.save_session_content(pg_temp.aid('academy'),sid,0,
    (select jsonb_agg(jsonb_build_object('unitId',id,'revision',1) order by name) from pg_temp.al_ids where name in ('regular','revision','blocked')),gen_random_uuid());
  select jsonb_agg(jsonb_build_object('annual_student_record_id',id,'expected_version',0,
    'status',case when name='suspended' then 'present' else name end)) into changes from pg_temp.al_ids
    where name in ('present','late','absent','excused','suspended');
  perform public.apply_attendance_changes(pg_temp.aid('academy'),sid,changes,'bulk',gen_random_uuid());
  return sid;
end $$;
insert into al_ids(name,id) values('session',pg_temp.make_session('ordinary'));
select pg_temp.assert(not exists(select 1 from public.content_access_grants where kind='attendance' and academy_id=pg_temp.aid('academy')),'draft attendance grants nothing');
set local role authenticated;
select public.publish_attendance(pg_temp.aid('academy'),pg_temp.aid('session'),
  (select revision from public.attendance_sheets where session_id=pg_temp.aid('session')),gen_random_uuid());
reset role;
do $$ declare effect uuid; count_before integer; expiry timestamptz; begin
  perform pg_temp.assert((select count(*)=3 from public.content_access_grants where academy_id=pg_temp.aid('academy') and kind='attendance'),'Present/Late receive eligible taught units only');
  perform pg_temp.assert(exists(select 1 from edra_private.attendance_learning_outcomes o join public.attendance_effects e on e.id=o.effect_id
    where e.annual_student_record_id=pg_temp.aid('present') and o.unit_id=pg_temp.aid('regular') and o.outcome='preserved'),'longer expiry preserved');
  perform pg_temp.assert((select count(*)=2 from edra_private.attendance_learning_outcomes o join public.attendance_effects e on e.id=o.effect_id
    where e.session_id=pg_temp.aid('session') and o.outcome='prerequisites_required'),'unmet prerequisites skip grants without failing finalization');
  perform pg_temp.assert((select count(*)=3 from edra_private.attendance_learning_outcomes o join public.attendance_effects e on e.id=o.effect_id
    where e.session_id=pg_temp.aid('session') and e.annual_student_record_id=pg_temp.aid('suspended') and o.outcome='student_unavailable'),'suspension blocks every grant');
  perform pg_temp.assert(not exists(select 1 from public.content_access_grants where annual_record_id in (pg_temp.aid('absent'),pg_temp.aid('excused'),pg_temp.aid('unknown'))),'Absent/Excused/Unknown never unlock');
  perform pg_temp.assert(not exists(select 1 from public.content_access_grants g join public.attendance_publications p on p.id=(select publication_id from public.attendance_effects e where e.session_id=pg_temp.aid('session') and e.annual_student_record_id=g.annual_record_id and e.effect_type='explanation_access')
    where g.kind='attendance' and g.academy_id=pg_temp.aid('academy') and (g.starts_at<>p.published_at or g.expires_at<>p.published_at+make_interval(days=>case when g.unit_id=pg_temp.aid('revision') then 30 else 7 end))),'published durations start at original finalization');
  select id into effect from public.attendance_effects where session_id=pg_temp.aid('session') and annual_student_record_id=pg_temp.aid('late') and effect_type='explanation_access';
  select count(*) into count_before from public.content_access_grants;
  expiry:=(edra_private.learning_state(pg_temp.aid('late'),pg_temp.aid('revision'))->>'expiresAt')::timestamptz;
  perform edra_private.consume_attendance_learning(effect);
  perform pg_temp.assert((select count(*)=count_before from public.content_access_grants) and
    (edra_private.learning_state(pg_temp.aid('late'),pg_temp.aid('revision'))->>'expiresAt')::timestamptz=expiry,'retry is idempotent and never restarts expiry');
  perform pg_temp.assert(not has_function_privilege('authenticated','edra_private.consume_attendance_learning(uuid)','execute')
    and not has_table_privilege('authenticated','edra_private.attendance_learning_outcomes','select'),'private authority and provenance are not browser writable/readable');
end $$;
-- Student retrieval uses the same authoritative grant: no special preview access bypass.
set local role authenticated;
select public.start_year_learning(pg_temp.aid('academy'),pg_temp.aid('year'));
select set_config('request.jwt.claim.sub',pg_temp.aid('student')::text,true);
select pg_temp.assert(public.get_my_content_unit(pg_temp.aid('academy'),pg_temp.aid('revision'))#>>'{access,status}'='active','student sees attendance access');
reset role;
select set_config('request.jwt.claim.sub',pg_temp.aid('owner')::text,true);
-- Now register this fixture academy as synthetic; only internal access may run.
insert into edra_private.dev_runs(id,project_ref,recipe_version,seed,reference_date,student_count,scenario_hash,developer_id,academy_id,state,ready_at)
  values(pg_temp.aid('run'),repeat('a',20),'test','test',current_date,20,repeat('a',64),pg_temp.aid('owner'),pg_temp.aid('academy'),'ready',now());
insert into al_ids(name,id) values('dev-session',pg_temp.make_session('generated'));
set local role authenticated;
select public.publish_attendance(pg_temp.aid('academy'),pg_temp.aid('dev-session'),
  (select revision from public.attendance_sheets where session_id=pg_temp.aid('dev-session')),gen_random_uuid());
select public.end_session(pg_temp.aid('academy'),pg_temp.aid('dev-session'));
select public.archive_session(pg_temp.aid('academy'),pg_temp.aid('dev-session'),
  (select metadata_version from public.sessions where id=pg_temp.aid('dev-session')),gen_random_uuid(),null);
reset role;
do $$ declare effect uuid; count_before integer; begin
  select id into effect from public.attendance_effects where session_id=pg_temp.aid('dev-session') and annual_student_record_id=pg_temp.aid('late') and effect_type='explanation_access';
  perform pg_temp.assert(exists(select 1 from edra_private.attendance_learning_outcomes where effect_id=effect and outcome in ('granted','preserved')),'internal access runs in generated academy');
  perform pg_temp.assert(exists(select 1 from edra_private.dev_effect_suppressions where effect_id=effect and source_table='attendance_effects')
    and edra_private.attendance_effect_pending(effect)=false,'external synthetic suppression remains');
  select count(*) into count_before from public.content_access_grants;
  perform edra_private.consume_attendance_learning(effect);
  perform pg_temp.assert((select count(*)=count_before from public.content_access_grants),'archival preserves processed access without reissue');
  perform pg_temp.assert((edra_private.learning_state(pg_temp.aid('late'),pg_temp.aid('revision'))->>'status')='active','processed access survives archival');
  begin
    update edra_private.attendance_learning_outcomes set outcome='content_unavailable' where effect_id=effect;
    raise exception 'Expected immutable history rejection';
  exception when raise_exception then if sqlerrm<>'history_protected' then raise; end if; end;
end $$;
rollback;
