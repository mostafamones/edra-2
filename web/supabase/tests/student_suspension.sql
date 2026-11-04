-- Student online-access suspension management (EDRA-277): grants and RLS, direct-write denial, manager vs
-- Instructor/suspended/student/cross-academy authority and live authority loss, suspension before and
-- after connection, profile-level effect across years including archived and closed-year records,
-- independence from archival suspension, atomic deduplicated batches, unchanged targets, stale revisions,
-- audit events and latest change, the online-access list filter with totals and paging, and preservation
-- of annual records, account links and the shared protected-learning resolver. All fixtures roll back.
begin;

create function public.edra_test_start_fixture_year() returns trigger language plpgsql as $fixture$
begin
  new.student_learning_started_at := coalesce(new.student_learning_started_at, now());
  new.student_learning_start_source := coalesce(new.student_learning_start_source, 'legacy');
  return new;
end $fixture$;
create trigger edra_test_fixture_year_started before insert on public.academic_years
for each row execute function public.edra_test_start_fixture_year();
create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'Suspension check failed: %', label; end if; end $$;
create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$
begin
  execute statement;
  raise exception 'Expected rejection: %', expected using errcode = 'XX001';
exception when sqlstate 'XX001' then raise;
  when others then if sqlerrm not like expected then raise exception 'Expected %, got %', expected, sqlerrm; end if;
end $$;
create temporary table ids(name text primary key, id uuid not null default gen_random_uuid());
insert into ids(name) values ('owner'),('head'),('admin'),('instructor'),('suspended'),('outsider'),('student1'),('student2'),('student3'),
  ('academy'),('other');
grant select on pg_temp.ids to authenticated;
create function pg_temp.id(label text) returns uuid language sql as $$ select id from pg_temp.ids where name=label $$;
create function pg_temp.act(label text) returns void language sql as $$ select set_config('request.jwt.claim.sub',coalesce(pg_temp.id(label)::text,''),true) $$;
create function pg_temp.target(label text, revision integer) returns jsonb language sql as $$ select jsonb_build_object('id',pg_temp.id(label),'revision',revision) $$;
create function pg_temp.profile(label text) returns public.academy_student_profiles language sql as $$
  select p.* from public.academy_student_profiles p join public.annual_student_records r on r.academy_student_profile_id = p.id where r.id = pg_temp.id(label)
$$;
create function pg_temp.events(label text) returns bigint language sql as $$
  select count(*) from public.student_access_suspension_events e where e.academy_student_profile_id = (pg_temp.profile(label)).id
$$;

-- Grants: staff read events, nobody writes them or profiles directly; anon executes nothing.
do $$
begin
  if has_table_privilege('anon', 'public.student_access_suspension_events', 'select')
    or not has_table_privilege('authenticated', 'public.student_access_suspension_events', 'select')
    or has_table_privilege('authenticated', 'public.student_access_suspension_events', 'insert')
    or has_table_privilege('authenticated', 'public.student_access_suspension_events', 'update')
    or has_table_privilege('authenticated', 'public.student_access_suspension_events', 'delete')
    or has_table_privilege('authenticated', 'public.academy_student_profiles', 'update')
    or has_table_privilege('authenticated', 'public.academy_student_profiles', 'insert')
    or has_function_privilege('anon', 'public.set_student_access_suspension(uuid,jsonb,boolean,text)', 'execute')
    or not has_function_privilege('authenticated', 'public.set_student_access_suspension(uuid,jsonb,boolean,text)', 'execute')
    or has_function_privilege('anon', 'public.preview_student_access_suspension(uuid,uuid[])', 'execute')
    or not has_function_privilege('authenticated', 'public.preview_student_access_suspension(uuid,uuid[])', 'execute')
    or has_function_privilege('anon', 'public.get_student_access_suspension(uuid,uuid)', 'execute')
    or not has_function_privilege('authenticated', 'public.get_student_access_suspension(uuid,uuid)', 'execute')
    or has_function_privilege('anon', 'public.list_student_records(uuid,uuid,text,text,text,text,text,text,jsonb,integer,integer,uuid[],boolean,text)', 'execute')
    or not has_function_privilege('authenticated', 'public.list_student_records(uuid,uuid,text,text,text,text,text,text,jsonb,integer,integer,uuid[],boolean,text)', 'execute')
    or has_function_privilege('authenticated', 'edra_private.require_student_manager(uuid)', 'execute')
    or (select count(*) from pg_proc where proname = 'list_student_records' and pronamespace = 'public'::regnamespace) <> 1 then
    raise exception 'Suspension check failed: grants';
  end if;
end $$;

insert into auth.users(id) select id from ids where name in ('owner','head','admin','instructor','suspended','outsider','student1','student2','student3');
insert into public.academies(id,name,slug,icon,subject,created_by) values
 (pg_temp.id('academy'),'Suspension fixture','suspension-'||pg_temp.id('academy'),'school','Math',pg_temp.id('owner')),
 (pg_temp.id('other'),'Other suspension fixture','suspension-'||pg_temp.id('other'),'school','Math',pg_temp.id('outsider'));
insert into public.academy_memberships(academy_id,user_id,role,created_by,suspended_at) values
 (pg_temp.id('academy'),pg_temp.id('owner'),'owner',pg_temp.id('owner'),null),
 (pg_temp.id('academy'),pg_temp.id('head'),'head_admin',pg_temp.id('owner'),null),
 (pg_temp.id('academy'),pg_temp.id('admin'),'admin',pg_temp.id('owner'),null),
 (pg_temp.id('academy'),pg_temp.id('instructor'),'instructor',pg_temp.id('owner'),null),
 (pg_temp.id('academy'),pg_temp.id('suspended'),'admin',pg_temp.id('owner'),now()),
 (pg_temp.id('other'),pg_temp.id('outsider'),'owner',pg_temp.id('outsider'),null);
update public.profiles set full_name = 'Admin Person' where id = pg_temp.id('admin');
insert into ids(name,id) select 'year',id from public.academic_years where academy_id=pg_temp.id('academy');
insert into ids(name,id) select 'other-year',id from public.academic_years where academy_id=pg_temp.id('other');
insert into public.academy_levels(academy_id,level_id,sort_order) values(pg_temp.id('academy'),'preparatory-3',9),(pg_temp.id('other'),'preparatory-3',9);

select pg_temp.act('owner');
set local role authenticated;
select set_config('test.r1', id::text, true) from public.create_student_record(pg_temp.id('academy'),pg_temp.id('year'),'Amal','01012350001','01112223333','preparatory-3',null,null,'in_person');
select set_config('test.r2', id::text, true) from public.create_student_record(pg_temp.id('academy'),pg_temp.id('year'),'Basma','01012350002','01112223333','preparatory-3',null,null,'online_only');
select set_config('test.r3', id::text, true) from public.create_student_record(pg_temp.id('academy'),pg_temp.id('year'),'Camelia','01012350003','01112223333','preparatory-3',null,null,'in_person');
select set_config('test.r4', id::text, true) from public.create_student_record(pg_temp.id('academy'),pg_temp.id('year'),'Dalia','01012350004','01112223333','preparatory-3',null,null,'online_only');
reset role;
select pg_temp.act('outsider');
set local role authenticated;
select set_config('test.rb', id::text, true) from public.create_student_record(pg_temp.id('other'),pg_temp.id('other-year'),'Other student','01012350009','01112223333','preparatory-3',null,null,'in_person');
reset role;
insert into ids(name,id) values ('r1',current_setting('test.r1')::uuid),('r2',current_setting('test.r2')::uuid),('r3',current_setting('test.r3')::uuid),
  ('r4',current_setting('test.r4')::uuid),('rb',current_setting('test.rb')::uuid);
-- r1 and r3 are connected; r2 and r4 are not.
update public.academy_student_profiles set user_id = pg_temp.id('student1'), linked_at = now() where id = (pg_temp.profile('r1')).id;
update public.academy_student_profiles set user_id = pg_temp.id('student3'), linked_at = now() where id = (pg_temp.profile('r3')).id;
-- A suspension that predates this feature: suspended at revision 0 with no event, and stays suspended.
update public.academy_student_profiles set access_suspended_at = now() - interval '1 day' where id = (pg_temp.profile('r4')).id;
select pg_temp.check((pg_temp.profile('r4')).access_suspension_revision = 0 and pg_temp.events('r4') = 0, 'legacy suspension keeps revision 0 and no fabricated event');
create temporary table before_records on commit drop as select id, version, updated_at, archived_at, primary_group_id, participation_type from public.annual_student_records where academy_id = pg_temp.id('academy');

create function pg_temp.list(access text, stat text default 'all', lim integer default 10, skip integer default 0, kind text default null, year uuid default null)
returns jsonb language sql as $$
  select public.list_student_records(pg_temp.id('academy'), coalesce(year, pg_temp.id('year')), null, stat, null, null, null, kind, '[{"id":"name","desc":false}]'::jsonb, skip, lim, null, false, access)
$$;
create function pg_temp.names(page jsonb) returns text language sql as $$
  select coalesce(string_agg(e.item->>'full_name', ',' order by e.ordinality), '') from jsonb_array_elements(page->'rows') with ordinality e(item, ordinality)
$$;
create function pg_temp.row_of(page jsonb, name text) returns jsonb language sql as $$
  select e from jsonb_array_elements(page->'rows') e where e->>'full_name' = name
$$;

-- Instructors inspect but cannot change or preview; suspended staff, students and other academies get nothing.
select pg_temp.act('instructor');
set local role authenticated;
select pg_temp.expect_error($s$ select public.set_student_access_suspension(pg_temp.id('academy'),jsonb_build_array(pg_temp.target('r1',0)),true,null) $s$, 'forbidden');
select pg_temp.expect_error($s$ select public.preview_student_access_suspension(pg_temp.id('academy'),array[pg_temp.id('r1')]) $s$, 'forbidden');
select pg_temp.check((public.get_student_access_suspension(pg_temp.id('academy'),pg_temp.id('r4'))->>'suspended')::boolean, 'instructor reads the state');
select pg_temp.expect_error($s$ update public.academy_student_profiles set access_suspended_at = null $s$, 'permission denied%');
select pg_temp.expect_error($s$ insert into public.student_access_suspension_events(academy_id,academy_student_profile_id,revision,action) values (pg_temp.id('academy'),(pg_temp.profile('r1')).id,1,'suspended') $s$, 'permission denied%');
reset role;
select pg_temp.act('suspended');
set local role authenticated;
select pg_temp.expect_error($s$ select public.set_student_access_suspension(pg_temp.id('academy'),jsonb_build_array(pg_temp.target('r1',0)),true,null) $s$, 'forbidden');
select pg_temp.expect_error($s$ select public.get_student_access_suspension(pg_temp.id('academy'),pg_temp.id('r1')) $s$, 'forbidden');
reset role;
select pg_temp.act('outsider');
set local role authenticated;
select pg_temp.expect_error($s$ select public.set_student_access_suspension(pg_temp.id('academy'),jsonb_build_array(pg_temp.target('r1',0)),true,null) $s$, 'forbidden');
select pg_temp.expect_error($s$ select public.set_student_access_suspension(pg_temp.id('other'),jsonb_build_array(pg_temp.target('r1',0)),true,null) $s$, 'not_found');
select pg_temp.check(public.preview_student_access_suspension(pg_temp.id('other'),array[pg_temp.id('r1')]) = '[]'::jsonb, 'another academy''s record is not previewed');
select pg_temp.expect_error($s$ select public.get_student_access_suspension(pg_temp.id('other'),pg_temp.id('r1')) $s$, 'not_found');
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
select pg_temp.expect_error($s$ select public.set_student_access_suspension(pg_temp.id('academy'),'[]'::jsonb,true,null) $s$, 'permission denied%');
reset role;

-- Validation: bounded, unambiguous input and reasons.
select pg_temp.act('admin');
set local role authenticated;
select pg_temp.expect_error($s$ select public.set_student_access_suspension(pg_temp.id('academy'),'[]'::jsonb,true,null) $s$, 'validation');
select pg_temp.expect_error($s$ select public.set_student_access_suspension(pg_temp.id('academy'),(select jsonb_agg(jsonb_build_object('id',gen_random_uuid(),'revision',0)) from generate_series(1,501)),true,null) $s$, 'validation');
select pg_temp.expect_error($s$ select public.set_student_access_suspension(pg_temp.id('academy'),jsonb_build_array(pg_temp.target('r1',0)),null,null) $s$, 'validation');
select pg_temp.expect_error($s$ select public.set_student_access_suspension(pg_temp.id('academy'),jsonb_build_array(pg_temp.target('r1',0)),true,repeat('x',501)) $s$, 'validation');
select pg_temp.expect_error($s$ select public.set_student_access_suspension(pg_temp.id('academy'),jsonb_build_array(pg_temp.target('r1',0),pg_temp.target('r1',1)),true,null) $s$, 'validation');
select pg_temp.expect_error($s$ select public.set_student_access_suspension(pg_temp.id('academy'),jsonb_build_array(pg_temp.target('r1',-1)),true,null) $s$, 'validation');
select pg_temp.expect_error($s$ select public.set_student_access_suspension(pg_temp.id('academy'),'[{"id":"nope","revision":0}]'::jsonb,true,null) $s$, 'validation');
select pg_temp.expect_error($s$ select public.set_student_access_suspension(pg_temp.id('academy'),jsonb_build_array(jsonb_build_object('id',pg_temp.id('r1'))),true,null) $s$, 'validation');

-- Preview is fresh, bounded and omits missing records.
select pg_temp.check(jsonb_array_length(public.preview_student_access_suspension(pg_temp.id('academy'),array[pg_temp.id('r1'),pg_temp.id('r4'),gen_random_uuid(),pg_temp.id('r1')])) = 2, 'preview deduplicates and omits missing');
select pg_temp.check((select e from jsonb_array_elements(public.preview_student_access_suspension(pg_temp.id('academy'),array[pg_temp.id('r4')])) e)
  @> '{"connected":false,"suspended":true,"revision":0,"archived":false,"year_closed":false}'::jsonb, 'preview state');

-- One invalid target rejects the whole batch and writes nothing.
select pg_temp.expect_error($s$ select public.set_student_access_suspension(pg_temp.id('academy'),jsonb_build_array(pg_temp.target('r1',0),jsonb_build_object('id',gen_random_uuid(),'revision',0)),true,null) $s$, 'not_found');
select pg_temp.expect_error($s$ select public.set_student_access_suspension(pg_temp.id('academy'),jsonb_build_array(pg_temp.target('r1',0),pg_temp.target('rb',0)),true,null) $s$, 'not_found');
select pg_temp.check((pg_temp.profile('r1')).access_suspended_at is null and pg_temp.events('r1') = 0, 'rejected batches wrote nothing');

-- Suspension before connection, a shared trimmed reason, deduplicated targets, one event per change.
select pg_temp.check(public.set_student_access_suspension(pg_temp.id('academy'),jsonb_build_array(pg_temp.target('r1',0),pg_temp.target('r2',0),pg_temp.target('r2',0),pg_temp.target('r4',0)),true,'  Unpaid fees  ')
  = jsonb_build_object(
    'changed', (select jsonb_agg(x order by x->>'record_id') from (values (jsonb_build_object('record_id',pg_temp.id('r1'),'profile_id',(pg_temp.profile('r1')).id,'revision',1))),
      (jsonb_build_object('record_id',pg_temp.id('r2'),'profile_id',(pg_temp.profile('r2')).id,'revision',1))) v(x)),
    'unchanged', jsonb_build_array(jsonb_build_object('record_id',pg_temp.id('r4'),'profile_id',(pg_temp.profile('r4')).id,'revision',0))), 'mixed batch reports changed and unchanged');
reset role;
select pg_temp.check((select count(*) from public.student_access_suspension_events e where e.reason = 'Unpaid fees' and e.action = 'suspended' and e.actor_id = pg_temp.id('admin') and e.revision = 1
  and e.academy_id = pg_temp.id('academy')) = 2, 'one event per changed profile, actor and trimmed reason');
select pg_temp.check(pg_temp.events('r4') = 0 and (pg_temp.profile('r4')).access_suspended_at < now() - interval '1 hour', 'an unchanged profile keeps its timestamp and gets no event');
select pg_temp.check((pg_temp.profile('r1')).user_id = pg_temp.id('student1') and (pg_temp.profile('r2')).user_id is null, 'account links preserved');
select pg_temp.check((pg_temp.profile('r1')).access_suspended_at = (select created_at from public.student_access_suspension_events where academy_student_profile_id = (pg_temp.profile('r1')).id), 'event timestamp matches the state');

-- Unchanged targets ignore their revision and keep the latest reason; changes check it.
select pg_temp.act('admin');
set local role authenticated;
select pg_temp.check(public.set_student_access_suspension(pg_temp.id('academy'),jsonb_build_array(pg_temp.target('r1',0)),true,'Different') ->'changed' = '[]'::jsonb, 'a delayed repeat is unchanged');
select pg_temp.check((public.get_student_access_suspension(pg_temp.id('academy'),pg_temp.id('r1'))->'latest'->>'reason') = 'Unpaid fees', 'repeat kept the latest reason');
-- A delayed restore from before the suspension is stale and the whole batch is rejected.
select pg_temp.expect_error($s$ select public.set_student_access_suspension(pg_temp.id('academy'),jsonb_build_array(pg_temp.target('r1',0),pg_temp.target('r2',1)),false,null) $s$, 'stale_suspension');
select pg_temp.check((pg_temp.profile('r2')).access_suspended_at is not null, 'stale batch restored nothing');
select pg_temp.check(public.set_student_access_suspension(pg_temp.id('academy'),jsonb_build_array(pg_temp.target('r1',1)),false,'   ') -> 'changed' -> 0 ->> 'revision' = '2', 'restore with the current revision');
select pg_temp.check((public.get_student_access_suspension(pg_temp.id('academy'),pg_temp.id('r1'))->'latest') @> '{"action":"restored","reason":null,"actor_name":"Admin Person"}'::jsonb, 'latest change: blank reason is null, actor named');
-- The legacy suspension restores at revision 0.
select pg_temp.check(public.set_student_access_suspension(pg_temp.id('academy'),jsonb_build_array(pg_temp.target('r4',0)),false,null) -> 'changed' -> 0 ->> 'revision' = '1', 'legacy suspension restores');
select public.set_student_access_suspension(pg_temp.id('academy'),jsonb_build_array(pg_temp.target('r4',1)),true,null);
reset role;
select pg_temp.check((select string_agg(action||':'||revision, ',' order by revision) from public.student_access_suspension_events where academy_student_profile_id = (pg_temp.profile('r1')).id) = 'suspended:1,restored:2', 'earlier events retained');
select pg_temp.expect_error($s$ update public.student_access_suspension_events set reason = 'x' $s$, 'validation');

-- Suspension survives connection and blocks the shared protected-learning resolver (quizzes, exams, content and coupons).
update public.academy_student_profiles set user_id = pg_temp.id('student2'), linked_at = now() where id = (pg_temp.profile('r2')).id;
select pg_temp.act('student2');
select pg_temp.check(edra_private.student_caller_record(pg_temp.id('academy'),pg_temp.id('year')) is null, 'suspended connected student does not resolve');
select pg_temp.expect_error($s$ select edra_private.learning_student(pg_temp.id('academy'),gen_random_uuid()) $s$, 'student_unavailable');
select pg_temp.act('student1');
select pg_temp.check(edra_private.student_caller_record(pg_temp.id('academy'),pg_temp.id('year')) = pg_temp.id('r1'), 'restored student resolves again');
-- Students read neither reasons nor events.
set local role authenticated;
select pg_temp.check(not exists (select 1 from public.student_access_suspension_events), 'students read no events');
select pg_temp.expect_error($s$ select public.get_student_access_suspension(pg_temp.id('academy'),pg_temp.id('r1')) $s$, 'forbidden');
reset role;

-- Manual and archival suspension are independent.
select pg_temp.act('owner');
set local role authenticated;
select public.set_student_records_archived(pg_temp.id('academy'),pg_temp.id('year'),jsonb_build_array(jsonb_build_object('id',pg_temp.id('r3'),'version',1)),true);
select pg_temp.check(pg_temp.row_of(pg_temp.list(null),'Camelia') @> '{"online_account":"suspended","manually_suspended":false}'::jsonb, 'archival alone suspends effective access');
-- Archived records take manual suspension, which survives restoring the record.
select public.set_student_access_suspension(pg_temp.id('academy'),jsonb_build_array(pg_temp.target('r3',0)),true,null);
select public.set_student_records_archived(pg_temp.id('academy'),pg_temp.id('year'),jsonb_build_array(jsonb_build_object('id',pg_temp.id('r3'),'version',2)),false);
select pg_temp.check(pg_temp.row_of(pg_temp.list(null),'Camelia') @> '{"online_account":"suspended","manually_suspended":true}'::jsonb, 'manual suspension survives record restore');
-- Removing manual suspension while archived leaves the archival cause.
select public.set_student_records_archived(pg_temp.id('academy'),pg_temp.id('year'),jsonb_build_array(jsonb_build_object('id',pg_temp.id('r3'),'version',3)),true);
select public.set_student_access_suspension(pg_temp.id('academy'),jsonb_build_array(pg_temp.target('r3',1)),false,null);
select pg_temp.check(pg_temp.row_of(pg_temp.list(null),'Camelia') @> '{"online_account":"suspended","manually_suspended":false,"suspension_revision":2}'::jsonb, 'archival remains after manual restore');
reset role;
select pg_temp.check((select version from public.annual_student_records where id = pg_temp.id('r3')) = 4, 'suspension changed no record version (only the three archive writes)');
select pg_temp.check(not exists (select 1 from public.annual_student_records r join pg_temp.before_records b on b.id = r.id
  where r.id <> pg_temp.id('r3') and (r.version, r.updated_at, r.archived_at, r.primary_group_id, r.participation_type) is distinct from (b.version, b.updated_at, b.archived_at, b.primary_group_id, b.participation_type)), 'records untouched');

-- Filters: r1 connected (Has Access), r2 connected+suspended, r3 connected+archived only, r4 unconnected+suspended.
select pg_temp.act('owner');
set local role authenticated;
select public.create_student_record(pg_temp.id('academy'),pg_temp.id('year'),'Plain student','01012369999','01112223333','preparatory-3',null,null,'online_only');
reset role;
select pg_temp.act('instructor');
set local role authenticated;
select pg_temp.check(pg_temp.names(pg_temp.list('suspended')) = 'Basma,Dalia', 'Suspended: manual only, connected or not; archival alone does not match');
select pg_temp.check(pg_temp.names(pg_temp.list('has_access')) = 'Amal', 'Has Access: connected, no manual or archival suspension');
select pg_temp.check(pg_temp.names(pg_temp.list(null)) = 'Amal,Basma,Camelia,Dalia,Plain student', 'All adds nothing');
select pg_temp.check(pg_temp.names(pg_temp.list('suspended', kind => 'in_person')) = '', 'AND with participation');
select pg_temp.check(pg_temp.names(pg_temp.list('suspended', stat => 'archived')) = '' and pg_temp.names(pg_temp.list(null, stat => 'archived')) = 'Camelia', 'AND with the archive filter');
select pg_temp.check(pg_temp.row_of(pg_temp.list(null),'Dalia') @> '{"online_account":"not_connected","manually_suspended":true}'::jsonb, 'unconnected suspension is explicit');
select pg_temp.expect_error($s$ select pg_temp.list('connected') $s$, 'validation');
-- The default keeps old callers working.
select pg_temp.check((public.list_student_records(pg_temp.id('academy'),pg_temp.id('year'),null,'all',null,null,null,null,null,0,10)->>'total')::integer = 5, 'default access filter');
reset role;
-- More than a page of suspended students: filtering precedes counting and paging.
select pg_temp.act('admin');
set local role authenticated;
do $$
declare created uuid; n integer;
begin
  for n in 10..21 loop
    select id into created from public.create_student_record(pg_temp.id('academy'),pg_temp.id('year'),'Zeina '||n,'010123600'||n,'01112223333','preparatory-3',null,null,'online_only');
    perform public.set_student_access_suspension(pg_temp.id('academy'),jsonb_build_array(jsonb_build_object('id',created,'revision',0)),true,'Bulk');
  end loop;
end $$;
select pg_temp.check((pg_temp.list('suspended')->>'total')::integer = 14 and jsonb_array_length(pg_temp.list('suspended')->'rows') = 10, 'first page with the full total');
select pg_temp.check(jsonb_array_length(pg_temp.list('suspended', skip => 1)->'rows') = 4 and (pg_temp.list('suspended', skip => 1)->>'total')::integer = 14, 'second page keeps the total');
select pg_temp.check((pg_temp.list('has_access')->>'total')::integer = 1, 'has-access total');
reset role;

-- Profile-level effect across years, from a closed-year record; the old record and year stay as they were.
update public.academic_years set closed_at = now() where id = pg_temp.id('year');
insert into ids(name) values ('next-year'),('r1-next');
insert into public.academic_years(id,academy_id,start_year)
  select pg_temp.id('next-year'),pg_temp.id('academy'),max(start_year)+1 from public.academic_years where academy_id=pg_temp.id('academy');
insert into public.annual_student_records(id,academy_id,academic_year_id,academy_student_profile_id,full_name,student_phone,parent_phone,level_id,participation_type,created_by)
  select pg_temp.id('r1-next'),academy_id,pg_temp.id('next-year'),academy_student_profile_id,full_name,student_phone,parent_phone,level_id,participation_type,pg_temp.id('owner')
  from public.annual_student_records where id = pg_temp.id('r1');
select pg_temp.act('head');
set local role authenticated;
select pg_temp.check(pg_temp.names(pg_temp.list('has_access', year => pg_temp.id('next-year'))) = 'Amal', 'current participation has access');
select public.set_student_access_suspension(pg_temp.id('academy'),jsonb_build_array(pg_temp.target('r1',2)),true,'From history');
select pg_temp.check(pg_temp.names(pg_temp.list('suspended', year => pg_temp.id('next-year'))) = 'Amal', 'acting on the closed-year record suspends current participation');
select pg_temp.check((public.get_student_access_suspension(pg_temp.id('academy'),pg_temp.id('r1-next'))->'latest'->>'reason') = 'From history', 'the latest change is shared across years');
reset role;
select pg_temp.check((select closed_at is not null from public.academic_years where id = pg_temp.id('year'))
  and (select version from public.annual_student_records where id = pg_temp.id('r1')) = 1, 'year stays closed and the historical record unchanged');
select pg_temp.act('student1');
select pg_temp.check(edra_private.student_caller_record(pg_temp.id('academy'),pg_temp.id('next-year')) is null, 'current participation is blocked');

-- Live authority loss: a manager suspended mid-session is refused on the next call.
update public.academy_memberships set suspended_at = now() where academy_id = pg_temp.id('academy') and user_id = pg_temp.id('admin');
select pg_temp.act('admin');
set local role authenticated;
select pg_temp.expect_error($s$ select public.set_student_access_suspension(pg_temp.id('academy'),jsonb_build_array(pg_temp.target('r2',1)),false,null) $s$, 'forbidden');
select pg_temp.check(not exists (select 1 from public.student_access_suspension_events), 'suspended staff read no events');
reset role;

-- Other academies are unaffected.
select pg_temp.check((select access_suspended_at is null and access_suspension_revision = 0 from public.academy_student_profiles where academy_id = pg_temp.id('other')), 'other academy untouched');

rollback;
