-- Isolated cloud/disposable CI only. Random fixtures; no retained changes.
begin;
do $$ begin
  if (select count(*) from edra_db_test.target)<>1 or not exists(select 1 from edra_db_test.target where name='edra-ci' or name like 'edra-ci-%') then raise exception 'Isolated Edra test target required'; end if;
  if has_function_privilege('anon','public.save_session_content(uuid,uuid,integer,jsonb,uuid)','execute')
    or has_table_privilege('authenticated','public.session_content_sets','insert')
    or has_table_privilege('authenticated','public.session_content_items','update')
    or has_table_privilege('authenticated','public.session_content_requests','select')
    or not (select relrowsecurity from pg_class where oid='public.session_content_items'::regclass)
    then raise exception 'Unsafe session-content grants'; end if;
end $$;
create function pg_temp.check(ok boolean,message text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'FAILED: %',message; end if; end $$;
create function pg_temp.denied(statement text,expected text) returns void language plpgsql as $$
begin execute statement; raise exception 'Expected %',expected using errcode='XX001';
exception when sqlstate 'XX001' then raise; when others then if sqlerrm<>expected then raise exception 'Expected %, got %',expected,sqlerrm; end if; end $$;
create temporary table taught_context(owner_id uuid,instructor uuid,outsider uuid,academy uuid,other_academy uuid,year_id uuid,old_year uuid,track_a uuid,track_b uuid,session_id uuid,empty_session uuid,archive_session uuid,saved_key uuid);
insert into taught_context select gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),null,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),null,null,null,gen_random_uuid();
grant select,update on taught_context to authenticated;
insert into auth.users(id) select owner_id from taught_context union all select instructor from taught_context union all select outsider from taught_context;
insert into public.academies(id,name,slug,icon,subject,created_by)
  select academy,'Taught test','taught-'||academy,'school','Math',owner_id from taught_context
  union all select other_academy,'Foreign taught test','other-'||other_academy,'school','Math',outsider from taught_context;
insert into public.academy_memberships(academy_id,user_id,role,created_by)
  select academy,owner_id,'owner'::public.academy_role,owner_id from taught_context
  union all select academy,instructor,'instructor',owner_id from taught_context
  union all select other_academy,outsider,'owner',outsider from taught_context;
insert into public.academy_levels(academy_id,level_id,sort_order)
  select academy,'secondary-3',0 from taught_context union all select academy,'secondary-1',1 from taught_context
  union all select other_academy,'secondary-3',0 from taught_context;
insert into public.academy_tracks(id,academy_id,level_id,name,sort_order)
  select track_a,academy,'secondary-3','A',0 from taught_context union all select track_b,academy,'secondary-3','B',1 from taught_context;
update taught_context c set year_id=(select id from public.academic_years where academy_id=c.academy and closed_at is null);
insert into public.academic_years(id,academy_id,start_year,closed_at) select old_year,academy,(select start_year-1 from public.academic_years where id=year_id),now() from taught_context;
create temporary table taught_candidates(id uuid,label text);
grant select on taught_candidates to authenticated;
do $$ declare c record; spec record; p uuid; u uuid; a uuid; y uuid; t uuid; begin
  select * into c from taught_context;
  for spec in select * from (values ('wide','secondary-3',null::text,'published'),('track','secondary-3','a','published'),('other-track','secondary-3','b','published'),('other-grade','secondary-1',null,'published'),('draft','secondary-3',null,'draft'),('archived','secondary-3',null,'archived'),('old','secondary-3',null,'published'),('foreign','secondary-3',null,'published')) s(label,level_id,track,state) loop
    p:=gen_random_uuid(); u:=gen_random_uuid(); a:=case when spec.label='foreign' then c.other_academy else c.academy end;
    select id into y from public.academic_years where academy_id=a and closed_at is null;
    if spec.label='old' then y:=c.old_year; end if;
    t:=case spec.track when 'a' then c.track_a when 'b' then c.track_b end;
    insert into public.content_programs(id,academy_id,academic_year_id,level_id,track_id) values(p,a,y,spec.level_id,t);
    insert into public.content_units(id,academy_id,program_id,created_by,state,draft,published_revision,published_version)
      values(u,a,p,case when spec.label='foreign' then c.outsider else c.owner_id end,spec.state,jsonb_build_object('title',spec.label,'description','','items','[]'::jsonb),case when spec.state='draft' then 0 else 1 end,1);
    if spec.state<>'draft' then insert into public.content_revisions(unit_id,academy_id,revision,document,published_by) values(u,a,1,jsonb_build_object('title',spec.label,'description','','items','[]'::jsonb),case when spec.label='foreign' then c.outsider else c.owner_id end); end if;
    insert into taught_candidates values(u,spec.label);
  end loop;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',owner_id::text,true) from taught_context;
do $$ declare c record; schedule_id uuid; sid uuid; label text; begin
  select * into c from taught_context;
  foreach label in array array['session','empty','archive'] loop
    schedule_id:=public.create_schedule(c.academy,c.year_id,label,'recurring','program',null,'secondary-3',c.track_a,true,null,'[{"weekday":1,"startsAt":"17:00","endsAt":"18:00"}]','[]');
    select session_id into sid from public.start_session(c.academy,schedule_id,gen_random_uuid());
    if label='session' then update taught_context set session_id=sid;
    elsif label='empty' then update taught_context set empty_session=sid;
    else update taught_context set archive_session=sid; end if;
  end loop;
end $$;
select set_config('request.jwt.claim.sub',instructor::text,true) from taught_context;
do $$ declare c record; items jsonb; result jsonb; version integer; begin
  select * into c from taught_context;
  perform pg_temp.check((select count(*)=2 from public.session_content_options(c.academy,c.session_id)),'Picker must contain only wide and matching-track published units');
  perform pg_temp.check((select count(*)=1 from public.session_content_options(c.academy,c.session_id,1,1)),'Pagination');
  items:=(select jsonb_agg(jsonb_build_object('unitId',id,'revision',1) order by label) from taught_candidates where label in ('wide','track'));
  result:=public.save_session_content(c.academy,c.session_id,0,items,c.saved_key);
  perform pg_temp.check(result->>'outcome'='saved' and result->>'revision'='1','Instructor save');
  perform pg_temp.check((public.get_session_content(c.academy,c.session_id)->>'revision')='1','Read saved version');
  perform pg_temp.check((select count(*)=2 from public.session_taught_content where session_id=c.session_id),'Latest view');
  result:=public.save_session_content(c.academy,c.session_id,1,items,gen_random_uuid());
  perform pg_temp.check(result->>'outcome'='unchanged' and result->>'revision'='1','No-op must not create history');
  perform pg_temp.denied(format('select public.save_session_content(%L,%L,0,%L,%L)',c.academy,c.session_id,items,gen_random_uuid()),'content_conflict');
  perform pg_temp.denied(format('select public.publish_attendance(%L,%L,0,%L)',c.academy,c.session_id,gen_random_uuid()),'publication_stale');
  perform pg_temp.denied(format('select public.save_session_content(%L,%L,1,%L,%L)',c.academy,c.session_id,items,c.saved_key),'idempotency_conflict');
  perform pg_temp.denied(format('select public.save_session_content(%L,%L,1,%L,%L)',c.academy,c.session_id,items||items,gen_random_uuid()),'validation');
  perform pg_temp.denied(format('select public.save_session_content(%L,%L,1,%L,%L)',c.academy,c.session_id,jsonb_build_array(jsonb_build_object('unitId',(select id from taught_candidates where label='other-track'),'revision',1)),gen_random_uuid()),'incompatible_content');
  perform pg_temp.denied(format('select public.save_session_content(%L,%L,1,%L,%L)',c.academy,c.session_id,jsonb_build_array(jsonb_build_object('unitId',(select id from taught_candidates where label='old'),'revision',1)),gen_random_uuid()),'incompatible_content');
  perform pg_temp.denied(format('select public.save_session_content(%L,%L,1,%L,%L)',c.academy,c.session_id,jsonb_build_array(jsonb_build_object('unitId',(select id from taught_candidates where label='draft'),'revision',1)),gen_random_uuid()),'content_unavailable');
  perform pg_temp.denied(format('select public.save_session_content(%L,%L,1,%L,%L)',c.academy,c.session_id,jsonb_build_array(jsonb_build_object('unitId',(select id from taught_candidates where label='foreign'),'revision',1)),gen_random_uuid()),'content_unavailable');
  perform pg_temp.check((select count(*)=1 from public.session_content_sets where session_id=c.session_id),'Rejected changes must be atomic');
  perform public.end_session(c.academy,c.session_id);
end $$;
reset role;
-- A later publication and source archive cannot rewrite the saved taught snapshot.
insert into public.content_revisions(unit_id,academy_id,revision,document,published_by)
select tc.id,c.academy,2,'{"title":"Renamed source","description":"","items":[]}',c.owner_id from taught_candidates tc cross join taught_context c where tc.label='wide';
update public.content_units set published_revision=2,state='archived' where id=(select id from taught_candidates where label='wide');
set local role authenticated;
select set_config('request.jwt.claim.sub',instructor::text,true) from taught_context;
do $$ declare c record; items jsonb; result jsonb; revision integer; begin
  select * into c from taught_context;
  items:=jsonb_build_array(jsonb_build_object('unitId',(select id from taught_candidates where label='wide'),'revision',1));
  result:=public.save_session_content(c.academy,c.session_id,1,items,gen_random_uuid());
  perform pg_temp.check(result->>'revision'='2','Ended session can edit before finalization');
  perform pg_temp.check(public.get_session_content(c.academy,c.session_id)#>>'{items,0,title}'='wide','Frozen title');
  perform pg_temp.check((select count(*)=3 from public.session_content_items where session_id=c.session_id),'Prior association history retained');
  select sh.revision into revision from public.attendance_sheets sh where sh.session_id=c.session_id;
  perform public.publish_attendance(c.academy,c.session_id,revision,gen_random_uuid());
  perform pg_temp.check(public.get_session_content(c.academy,c.session_id)->>'lockReason'='finalized','First finalization freezes links');
  perform pg_temp.denied(format('select public.save_session_content(%L,%L,2,%L,%L)',c.academy,c.session_id,'[]',gen_random_uuid()),'content_finalized');
  items:=(select jsonb_agg(jsonb_build_object('unitId',id,'revision',1) order by label) from taught_candidates where label in ('wide','track'));
  result:=public.save_session_content(c.academy,c.session_id,0,items,c.saved_key);
  perform pg_temp.check(result->>'revision'='1' and (result->>'replayed')::boolean,'Retry acknowledgment survives finalization and later changes');
  perform public.publish_attendance(c.academy,c.empty_session,0,gen_random_uuid());
  perform pg_temp.check(public.get_session_content(c.academy,c.empty_session)->>'lockReason'='finalized','Optional empty set also freezes');
end $$;
select set_config('request.jwt.claim.sub',outsider::text,true) from taught_context;
do $$ declare c record; begin select * into c from taught_context;
  perform pg_temp.denied(format('select public.get_session_content(%L,%L)',c.academy,c.session_id),'forbidden');
  perform pg_temp.denied(format('select public.session_content_options(%L,%L)',c.other_academy,c.session_id),'not_found');
  perform pg_temp.check((select count(*)=0 from public.session_content_items),'RLS hides another academy history');
  perform pg_temp.check((select count(*)=0 from public.session_taught_content),'View cannot bypass RLS');
end $$;
reset role;
update public.academy_memberships set suspended_at=now() where user_id=(select instructor from taught_context);
set local role authenticated;
select set_config('request.jwt.claim.sub',instructor::text,true) from taught_context;
do $$ declare c record; begin select * into c from taught_context;
  perform pg_temp.denied(format('select public.save_session_content(%L,%L,0,%L,%L)',c.academy,c.archive_session,'[]',gen_random_uuid()),'forbidden');
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',owner_id::text,true) from taught_context;
do $$ declare c record; ver integer; begin select * into c from taught_context;
  select metadata_version into ver from public.sessions where id=c.archive_session;
  perform public.archive_session(c.academy,c.archive_session,ver,gen_random_uuid(),null);
  perform pg_temp.check(public.get_session_content(c.academy,c.archive_session)->>'lockReason'='archived','Archived session read-only');
  perform pg_temp.denied(format('select public.save_session_content(%L,%L,0,%L,%L)',c.academy,c.archive_session,'[]',gen_random_uuid()),'session_archived');
  select metadata_version into ver from public.sessions where id=c.archive_session;
  perform public.restore_session(c.academy,c.archive_session,ver,gen_random_uuid());
end $$;
reset role;
update public.academic_years set closed_at=now() where id=(select year_id from taught_context);
set local role authenticated;
do $$ declare c record; begin select * into c from taught_context;
  perform pg_temp.check(public.get_session_content(c.academy,c.archive_session)->>'lockReason'='year_closed','Closed year read-only');
  perform pg_temp.denied(format('select public.save_session_content(%L,%L,0,%L,%L)',c.academy,c.archive_session,'[]',gen_random_uuid()),'year_unavailable');
end $$;
reset role;
select pg_temp.denied('delete from public.session_content_items','history_preserved');
set constraints all immediate;
rollback;
select 'Session content: scope, snapshots, locks, retries, isolation and history passed' as result;
