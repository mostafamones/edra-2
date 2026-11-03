-- Disposable GitHub Actions database only; all fixtures roll back. Separate-session races are in concurrency.sh.
begin;

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
create temporary table ids(name text primary key,id uuid not null default gen_random_uuid());
insert into ids(name) values('owner'),('head'),('admin'),('instructor'),('student'),('outsider'),('academy'),('other-academy');
grant select on ids to authenticated;
create function pg_temp.id(label text) returns uuid language sql as $$ select id from pg_temp.ids where name=label $$;
create function pg_temp.act(label text) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claims','',true);
  perform set_config('edra.verified_session','',true);
  perform set_config('request.jwt.claim.sub',pg_temp.id(label)::text,true);
end $$;
create function pg_temp.assert_ok(ok boolean,label text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'Scheduled publication assertion: %',label; end if; end $$;
create function pg_temp.fails(statement text,expected text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then
    if position(expected in sqlerrm)>0 then return; end if;
    raise exception 'Expected %, received %',expected,sqlerrm;
  end;
  raise exception 'Expected % but operation succeeded',expected;
end $$;
-- Superuser helpers for facts a test can't wait for or make through a role.
create function pg_temp.make_due(label text) returns void language sql as $$
  update public.content_publication_schedules set scheduled_for=clock_timestamp()-interval '1 second',next_attempt_at=clock_timestamp()-interval '1 second' where unit_id=pg_temp.id(label) and state='pending';
$$;
create function pg_temp.sched(label text) returns public.content_publication_schedules language sql as $$
  select * from public.content_publication_schedules where unit_id=pg_temp.id(label);
$$;
create function pg_temp.unit(label text) returns public.content_units language sql as $$
  select * from public.content_units where id=pg_temp.id(label);
$$;
create function pg_temp.later(minutes integer default 60) returns timestamptz language sql as $$ select clock_timestamp()+make_interval(mins=>minutes) $$;

insert into auth.users(id) select id from ids where name in ('owner','head','admin','instructor','student','outsider');
insert into public.academies(id,name,slug,icon,subject,created_by) values
  (pg_temp.id('academy'),'Publication tests','publication-'||pg_temp.id('academy'),'school','Math',pg_temp.id('owner')),
  (pg_temp.id('other-academy'),'Other publication','publication-b-'||pg_temp.id('other-academy'),'school','Math',pg_temp.id('outsider'));
insert into ids(name,id) select 'year',id from public.academic_years where academy_id=pg_temp.id('academy');
insert into public.academy_memberships(academy_id,user_id,role,created_by) values
  (pg_temp.id('academy'),pg_temp.id('owner'),'owner',pg_temp.id('owner')),
  (pg_temp.id('academy'),pg_temp.id('head'),'head_admin',pg_temp.id('owner')),
  (pg_temp.id('academy'),pg_temp.id('admin'),'admin',pg_temp.id('owner')),
  (pg_temp.id('academy'),pg_temp.id('instructor'),'instructor',pg_temp.id('owner')),
  (pg_temp.id('other-academy'),pg_temp.id('outsider'),'owner',pg_temp.id('outsider'));
insert into public.academy_levels(academy_id,level_id,sort_order) values(pg_temp.id('academy'),'secondary-1',0);

-- Creates a saved unit with a ready video; `publish` makes revision 1 live. The saved version is 2 or 3.
create function pg_temp.make_unit(label text,publish boolean,author text default 'owner') returns void language plpgsql as $$
declare asset uuid:=gen_random_uuid();
begin
  insert into pg_temp.ids(name) values(label) on conflict do nothing;
  insert into pg_temp.ids(name,id) values('asset-'||label,asset);
  perform pg_temp.act(author);
  perform public.create_content_unit(pg_temp.id('academy'),pg_temp.id('year'),'secondary-1',null,pg_temp.id(label),'Lesson '||label);
  insert into public.content_assets(id,academy_id,unit_id,created_by,kind,name,mime_type,status,playback_id)
    values(asset,pg_temp.id('academy'),pg_temp.id(label),pg_temp.id(author),'video','Video','video/mp4','ready','test-playback');
  perform public.save_content_unit(pg_temp.id('academy'),pg_temp.id(label),1,pg_temp.doc(label,'Lesson '||label));
  if publish then perform pg_temp.act('owner'); perform public.change_content_unit(pg_temp.id('academy'),pg_temp.id(label),2,'publish'); end if;
end $$;
create function pg_temp.doc(label text,title text) returns jsonb language sql as $$
  select jsonb_build_object('title',title,'description','','accessDays',7,'items',jsonb_build_array(
    jsonb_build_object('id',pg_temp.id('asset-'||label),'kind','explanation','title','Explanation','assetId',pg_temp.id('asset-'||label))));
$$;
-- Saves the working draft as an ordinary edit, returning the new version.
create function pg_temp.edit(label text,title text) returns integer language sql as $$
  select public.save_content_unit(pg_temp.id('academy'),pg_temp.id(label),(pg_temp.unit(label)).version,pg_temp.doc(label,title));
$$;
-- Saves the working draft as a version: what a schedule publishes.
create function pg_temp.keep(label text) returns void language sql as $$
  select public.save_content_draft_version(pg_temp.id('academy'),pg_temp.id(label),(pg_temp.unit(label)).version);
$$;
create function pg_temp.schedule(label text,at_time timestamptz default null) returns jsonb language sql as $$
  select public.schedule_content_publication(pg_temp.id('academy'),pg_temp.id(label),coalesce(at_time,pg_temp.later()),coalesce((pg_temp.sched(label)).generation,0));
$$;
create function pg_temp.cancel(label text) returns jsonb language sql as $$
  select public.cancel_content_publication(pg_temp.id('academy'),pg_temp.id(label),(pg_temp.sched(label)).generation);
$$;

select pg_temp.make_unit('first',false);
select pg_temp.make_unit('update',true);

-- Any editor's saved version is a candidate; ordinary saves are not, and only managers schedule.
select pg_temp.make_unit('instructor-unit',false,'instructor');
select pg_temp.act('instructor');
select pg_temp.edit('instructor-unit','Autosaved');
select pg_temp.assert_ok(not exists(select 1 from public.content_publication_candidates where unit_id=pg_temp.id('instructor-unit')),'ordinary saves are not candidates');
select pg_temp.keep('instructor-unit');
select pg_temp.assert_ok((select count(*)=1 and min(confirmed_by::text)=pg_temp.id('instructor')::text and min(document->>'title')='Autosaved' from public.content_publication_candidates where unit_id=pg_temp.id('instructor-unit')),'an instructor''s saved version is a candidate');
select pg_temp.fails(format('select public.schedule_content_publication(%L,%L,%L,0)',pg_temp.id('academy'),pg_temp.id('first'),pg_temp.later()),'forbidden');
select pg_temp.act('outsider');
select pg_temp.fails(format('select pg_temp.keep(%L)','first'),'forbidden');
select pg_temp.act('student');
select pg_temp.fails(format('select public.schedule_content_publication(%L,%L,%L,0)',pg_temp.id('academy'),pg_temp.id('first'),pg_temp.later()),'forbidden');
select pg_temp.act('owner');
-- Scheduling with no saved version saves the current draft as one; an unchanged draft has nothing to publish.
select pg_temp.make_unit('auto',false);
select pg_temp.act('owner');
select pg_temp.schedule('auto');
select pg_temp.assert_ok((select count(*)=1 and min(document->>'title')='Lesson auto' and min(confirmed_by::text)=pg_temp.id('owner')::text from public.content_publication_candidates where unit_id=pg_temp.id('auto'))
  and (select count(*)=1 from public.content_drafts where unit_id=pg_temp.id('auto') and kind='version') and (pg_temp.sched('auto')).state='pending','scheduling saves the draft as the version to publish');
select pg_temp.cancel('auto');
select pg_temp.make_unit('unchanged',true);
select pg_temp.act('owner');
select pg_temp.fails(format('select pg_temp.schedule(%L)','unchanged'),'nothing_to_publish');
select pg_temp.assert_ok(not exists(select 1 from pg_proc where proname='confirm_content_version'),'there is no separate confirmation');
select pg_temp.assert_ok(not has_function_privilege('anon','public.schedule_content_publication(uuid,uuid,timestamptz,integer)','EXECUTE'),'anonymous callers cannot schedule');
select pg_temp.assert_ok(not has_function_privilege('anon','public.cancel_content_publication(uuid,uuid,integer)','EXECUTE'),'anonymous callers cannot cancel');
select pg_temp.assert_ok(not has_function_privilege('authenticated','edra_private.run_content_publications(integer)','EXECUTE'),'clients cannot run the worker');
select pg_temp.assert_ok(not has_function_privilege('authenticated','edra_private.execute_content_publication(uuid,integer)','EXECUTE'),'clients cannot execute a schedule');

-- A saved version binds the exact version, is idempotent and makes nothing live.
select pg_temp.fails(format('select public.save_content_draft_version(%L,%L,1)',pg_temp.id('academy'),pg_temp.id('first')),'content_conflict');
select pg_temp.keep('first');
select pg_temp.keep('first');
select pg_temp.assert_ok((select count(*)=1 and min(document->>'title')='Lesson first' and min(confirmed_by::text)=pg_temp.id('owner')::text and min(unit_version)=2 from public.content_publication_candidates where unit_id=pg_temp.id('first')),'a repeated save keeps one candidate');
select pg_temp.assert_ok(((pg_temp.unit('first')).version=2 and (pg_temp.unit('first')).state='draft' and (pg_temp.unit('first')).published_revision=0),'saving a version makes nothing live and changes no state');
select pg_temp.assert_ok((select count(*)=1 from public.content_drafts where unit_id=pg_temp.id('first') and kind='version'),'the candidate is the saved version entry');

-- Scheduling validates the future on the server.
select pg_temp.fails(format('select pg_temp.schedule(%L,%L)','first',clock_timestamp()-interval '1 minute'),'schedule_in_past');
select pg_temp.fails(format('select public.schedule_content_publication(%L,%L,null,0)',pg_temp.id('academy'),pg_temp.id('first')),'schedule_in_past');
create temporary table first_at as select pg_temp.later() as at_time;
grant select on first_at to authenticated;
select public.schedule_content_publication(pg_temp.id('academy'),pg_temp.id('first'),(select at_time from first_at),0);
-- Same outcome retried with the generation it started from.
select pg_temp.assert_ok((public.schedule_content_publication(pg_temp.id('academy'),pg_temp.id('first'),(select at_time from first_at),0))->>'generation'='1','a retried schedule is idempotent');
select pg_temp.fails(format('select public.schedule_content_publication(%L,%L,%L,0)',pg_temp.id('academy'),pg_temp.id('first'),pg_temp.later(90)),'schedule_conflict');
select pg_temp.assert_ok((pg_temp.sched('first')).scheduled_by=pg_temp.id('owner'),'the scheduler is recorded');

-- Reads: staff see saved candidates, only managers see schedules, other tenants see neither.
set local role authenticated;
select pg_temp.act('head');
select pg_temp.assert_ok((select count(*)=1 from public.content_publication_schedules where unit_id=pg_temp.id('first')),'a head admin inspects schedules');
select pg_temp.act('admin');
select pg_temp.assert_ok((select count(*)>0 from public.content_publication_events where unit_id=pg_temp.id('first')),'an admin inspects the record');
select pg_temp.act('instructor');
select pg_temp.assert_ok((select count(*)=1 from public.content_publication_candidates where unit_id=pg_temp.id('first')),'staff see saved candidates');
select pg_temp.assert_ok(not exists(select 1 from public.content_publication_schedules),'instructors do not read schedules');
select pg_temp.assert_ok(not exists(select 1 from public.content_publication_events),'instructors do not read the record');
select pg_temp.act('outsider');
select pg_temp.assert_ok(not exists(select 1 from public.content_publication_candidates),'other academies do not read candidates');
select pg_temp.assert_ok(not exists(select 1 from public.content_publication_schedules),'other academies do not read schedules');
select pg_temp.act('student');
select pg_temp.assert_ok(not exists(select 1 from public.content_publication_candidates),'students do not read candidates');
select pg_temp.fails(format('insert into public.content_publication_schedules(unit_id,academy_id,state,scheduled_for,scheduled_by,next_attempt_at) values(%L,%L,''pending'',now(),%L,now())',pg_temp.id('update'),pg_temp.id('academy'),pg_temp.id('student')),'permission denied');
select pg_temp.act('owner');
select pg_temp.fails(format('update public.content_publication_schedules set state=''cancelled'' where unit_id=%L',pg_temp.id('first')),'permission denied');
select pg_temp.fails(format('delete from public.content_publication_candidates where unit_id=%L',pg_temp.id('first')),'permission denied');
reset role;
select pg_temp.fails(format('update public.content_publication_candidates set document=''{}'' where unit_id=%L',pg_temp.id('first')),'content_publication_immutable');
select pg_temp.fails(format('delete from public.content_publication_events where unit_id=%L',pg_temp.id('first')),'content_publication_immutable');

-- Not due: nothing runs.
select edra_private.run_content_publications(25);
select pg_temp.assert_ok((pg_temp.unit('first')).published_revision=0,'a future schedule waits');

-- First publication selects the newest version saved since scheduling, never the working draft.
select pg_temp.act('owner');
select pg_temp.edit('first','Saved after scheduling');
select pg_temp.keep('first');
select pg_temp.edit('first','Unsaved working draft');
create temporary table first_before as select version from public.content_units where id=pg_temp.id('first');
select pg_temp.make_due('first');
select edra_private.run_content_publications(25);
select pg_temp.assert_ok((select document->>'title'='Saved after scheduling' and published_by=pg_temp.id('owner') and candidate_id is not null from public.content_revisions where unit_id=pg_temp.id('first') and revision=1),'the latest saved version publishes as the scheduler');
select pg_temp.assert_ok(((pg_temp.unit('first')).state='published' and (pg_temp.unit('first')).draft->>'title'='Unsaved working draft' and (pg_temp.unit('first')).version=(select version from first_before)),'the working draft and its version survive');
select pg_temp.assert_ok((pg_temp.unit('first')).published_version<(pg_temp.unit('first')).version,'newer working changes still read as unpublished');
select pg_temp.assert_ok(((pg_temp.sched('first')).state='published' and (pg_temp.sched('first')).published_revision=1 and (pg_temp.sched('first')).candidate_id is not null),'the schedule records its outcome');
select pg_temp.assert_ok((select count(*)=1 and min(actor_id::text)=pg_temp.id('owner')::text and min(revision)=1 from public.content_publication_events where unit_id=pg_temp.id('first') and kind='published'),'one receipt per execution');
-- Duplicate workers publish nothing more.
select edra_private.run_content_publications(25);
select pg_temp.assert_ok((select count(*)=1 from public.content_revisions where unit_id=pg_temp.id('first')),'a repeated run does not republish');
-- The live candidate retired with its publication.
select pg_temp.assert_ok((edra_private.content_latest_candidate(pg_temp.id('first'),(pg_temp.unit('first')).published_revision)).id is null,'a publication retires its candidate');

-- An update keeps the live snapshot and access periods until it succeeds.
select pg_temp.edit('update','Update candidate');
select pg_temp.keep('update');
select pg_temp.assert_ok((pg_temp.unit('update')).state='published','a published unit stays live after saving a version');
select pg_temp.schedule('update');
select pg_temp.act('owner');
insert into ids(name) values('record');
select set_config('test.record',(public.create_student_record(pg_temp.id('academy'),pg_temp.id('year'),'Publication student','01088170001','01188179999','secondary-1',null,null,'online_only')).id::text,true);
insert into public.content_access_accounts(academy_id,academic_year_id,annual_record_id,unit_id) values(pg_temp.id('academy'),pg_temp.id('year'),current_setting('test.record')::uuid,pg_temp.id('update'));
insert into public.content_access_grants(id,academy_id,academic_year_id,annual_record_id,unit_id,kind,actor_id,issued_at,starts_at,expires_at,duration_seconds)
  values(pg_temp.id('record'),pg_temp.id('academy'),pg_temp.id('year'),current_setting('test.record')::uuid,pg_temp.id('update'),'staff',pg_temp.id('owner'),now(),now(),now()+interval '3 days',259200);
create temporary table grant_before as select expires_at,duration_seconds from public.content_access_grants where id=pg_temp.id('record');
select pg_temp.assert_ok((select document->>'title'='Lesson update' from public.content_revisions r where r.unit_id=pg_temp.id('update') and r.revision=(pg_temp.unit('update')).published_revision),'live content stays visible before execution');
select pg_temp.make_due('update');
select edra_private.run_content_publications(25);
select pg_temp.assert_ok(((pg_temp.unit('update')).published_revision=2 and (select document->>'title'='Update candidate' from public.content_revisions where unit_id=pg_temp.id('update') and revision=2)),'the update publishes');
select pg_temp.assert_ok((select document->>'title'='Lesson update' from public.content_revisions where unit_id=pg_temp.id('update') and revision=1),'earlier publications remain');
select pg_temp.assert_ok((select g.expires_at=b.expires_at and g.duration_seconds=b.duration_seconds from public.content_access_grants g cross join grant_before b where g.id=pg_temp.id('record')),'access periods are not reset');
select pg_temp.assert_ok((pg_temp.unit('update')).review_requested_at is null,'publishing the working draft clears review');

-- Rescheduling transfers responsibility: the last scheduler's authority is what counts.
select pg_temp.make_unit('transfer',true);
select pg_temp.act('owner'); select pg_temp.edit('transfer','Transfer'); select pg_temp.keep('transfer');
select pg_temp.act('admin'); select pg_temp.schedule('transfer');
select pg_temp.act('head'); select pg_temp.schedule('transfer');
select pg_temp.assert_ok((pg_temp.sched('transfer')).scheduled_by=pg_temp.id('head') and (pg_temp.sched('transfer')).generation=2,'rescheduling records the new manager');
update public.academy_memberships set suspended_at=now() where academy_id=pg_temp.id('academy') and user_id=pg_temp.id('admin');
select pg_temp.make_due('transfer');
select edra_private.run_content_publications(25);
select pg_temp.assert_ok((pg_temp.unit('transfer')).published_revision=2,'an earlier scheduler''s lost authority does not matter');
select pg_temp.assert_ok((select published_by=pg_temp.id('head') from public.content_revisions where unit_id=pg_temp.id('transfer') and revision=2),'the last scheduler publishes');
update public.academy_memberships set suspended_at=null where academy_id=pg_temp.id('academy') and user_id=pg_temp.id('admin');

-- Lost authority stops with a reason; recovery is a new schedule.
select pg_temp.make_unit('authority',true);
select pg_temp.act('owner'); select pg_temp.edit('authority','Authority'); select pg_temp.keep('authority');
select pg_temp.act('admin'); select pg_temp.schedule('authority');
update public.academy_memberships set suspended_at=now() where academy_id=pg_temp.id('academy') and user_id=pg_temp.id('admin');
select pg_temp.make_due('authority');
select edra_private.run_content_publications(25);
select pg_temp.assert_ok(((pg_temp.sched('authority')).state='stopped' and (pg_temp.sched('authority')).reason='scheduler_authority_lost' and (pg_temp.unit('authority')).published_revision=1),'suspension stops execution with a reason');
select pg_temp.assert_ok((select count(*)=1 from public.content_publication_events where unit_id=pg_temp.id('authority') and kind='stopped' and reason='scheduler_authority_lost'),'the stop is recorded');
select pg_temp.act('admin');
select pg_temp.fails(format('select pg_temp.schedule(%L)','authority'),'forbidden');
select pg_temp.act('owner'); select pg_temp.schedule('authority');
select pg_temp.assert_ok(((pg_temp.sched('authority')).state='pending' and (pg_temp.sched('authority')).reason is null and (pg_temp.sched('authority')).attempts=0),'a manager recovers by rescheduling');
update public.academy_memberships set suspended_at=null,role='instructor' where academy_id=pg_temp.id('academy') and user_id=pg_temp.id('admin');
select pg_temp.act('admin');
select pg_temp.fails(format('select pg_temp.cancel(%L)','authority'),'forbidden');
reset role;
select pg_temp.make_due('authority');
select edra_private.run_content_publications(25);
select pg_temp.assert_ok((pg_temp.unit('authority')).published_revision=2,'the recovering manager''s authority now counts');
update public.academy_memberships set role='admin' where academy_id=pg_temp.id('academy') and user_id=pg_temp.id('admin');
-- A role downgrade loses authority like a suspension.
select pg_temp.make_unit('downgrade',true);
select pg_temp.act('owner'); select pg_temp.edit('downgrade','Downgrade'); select pg_temp.keep('downgrade');
select pg_temp.act('admin'); select pg_temp.schedule('downgrade');
update public.academy_memberships set role='instructor' where academy_id=pg_temp.id('academy') and user_id=pg_temp.id('admin');
select pg_temp.make_due('downgrade');
select edra_private.run_content_publications(25);
select pg_temp.assert_ok(((pg_temp.sched('downgrade')).state='stopped' and (pg_temp.sched('downgrade')).reason='scheduler_authority_lost'),'a downgrade stops execution');
update public.academy_memberships set role='admin' where academy_id=pg_temp.id('academy') and user_id=pg_temp.id('admin');

-- Readiness failure: an approved asset stops being ready.
select pg_temp.make_unit('ready',true);
select pg_temp.act('owner'); select pg_temp.edit('ready','Ready'); select pg_temp.keep('ready'); select pg_temp.schedule('ready');
update public.content_assets set status='processing' where id=pg_temp.id('asset-ready');
select pg_temp.make_due('ready');
select edra_private.run_content_publications(25);
select pg_temp.assert_ok(((pg_temp.sched('ready')).state='stopped' and (pg_temp.sched('ready')).reason='assets_not_ready' and (pg_temp.unit('ready')).published_revision=1),'readiness is rechecked at execution');
update public.content_assets set status='ready' where id=pg_temp.id('asset-ready');

-- A version needn't be publishable when saved: the worker checks it when it runs.
select pg_temp.make_unit('unready',false);
update public.content_assets set status='processing' where id=pg_temp.id('asset-unready');
select pg_temp.act('owner'); select pg_temp.keep('unready'); select pg_temp.schedule('unready');
select pg_temp.make_due('unready');
select edra_private.run_content_publications(25);
select pg_temp.assert_ok(((pg_temp.sched('unready')).state='stopped' and (pg_temp.sched('unready')).reason='assets_not_ready' and (pg_temp.unit('unready')).published_revision=0),'an unready saved version stops at execution');

-- Archive stops a schedule at once, so restoring can't publish on its own.
select pg_temp.make_unit('archive',true);
select pg_temp.act('owner'); select pg_temp.edit('archive','Archive'); select pg_temp.keep('archive'); select pg_temp.schedule('archive');
select public.change_content_unit(pg_temp.id('academy'),pg_temp.id('archive'),(pg_temp.unit('archive')).version,'archive');
select pg_temp.assert_ok(((pg_temp.sched('archive')).state='stopped' and (pg_temp.sched('archive')).reason='archived'),'archive stops the schedule');
select pg_temp.fails(format('select pg_temp.schedule(%L)','archive'),'archived');
select public.change_content_unit(pg_temp.id('academy'),pg_temp.id('archive'),(pg_temp.unit('archive')).version,'restore');
select pg_temp.make_due('archive');
select edra_private.run_content_publications(25);
select pg_temp.assert_ok((pg_temp.unit('archive')).published_revision=1,'a restored unit does not publish by itself');

-- Attachments: a candidate's assessment stays attached while the working draft drops it, and blocks another unit.
select pg_temp.make_unit('attached',false);
select pg_temp.make_unit('rival',false);
select pg_temp.act('owner');
select set_config('test.assignment',public.create_content_assessment(pg_temp.id('academy'),pg_temp.id('attached'),2,'assignment','Attached homework')::text,true);
select pg_temp.keep('attached');
select pg_temp.edit('attached','Without homework');
select pg_temp.assert_ok(exists(select 1 from public.content_assessments where unit_id=pg_temp.id('attached') and assessment_id=current_setting('test.assignment')::uuid),'the candidate keeps its attachment after the draft drops it');
select pg_temp.fails(format('select public.save_content_unit(%L,%L,%s,%L::jsonb)',pg_temp.id('academy'),pg_temp.id('rival'),(pg_temp.unit('rival')).version,
  pg_temp.doc('rival','Rival')||jsonb_build_object('items',pg_temp.doc('rival','Rival')->'items'||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'kind','assessment','title','Stolen','assessmentKind','assignment','assessmentId',current_setting('test.assignment'))))),'assessment_already_attached');
select pg_temp.schedule('attached');
select pg_temp.make_due('attached');
select edra_private.run_content_publications(25);
select pg_temp.assert_ok((select document->'items' @> jsonb_build_array(jsonb_build_object('kind','assessment','assessmentId',current_setting('test.assignment'))) from public.content_revisions where unit_id=pg_temp.id('attached') and revision=1),'the approved assessment publishes');
select pg_temp.assert_ok((pg_temp.unit('attached')).draft->>'title'='Without homework','a scheduled publication keeps the newer draft');
-- A newer draft's attachment isn't detached by publishing an older candidate.
select pg_temp.make_unit('newer',true);
select pg_temp.act('owner'); select pg_temp.edit('newer','Newer candidate'); select pg_temp.keep('newer'); select pg_temp.schedule('newer');
select set_config('test.newer',public.create_content_assessment(pg_temp.id('academy'),pg_temp.id('newer'),(pg_temp.unit('newer')).version,'assignment','Draft homework')::text,true);
select pg_temp.make_due('newer');
select edra_private.run_content_publications(25);
select pg_temp.assert_ok((pg_temp.unit('newer')).published_revision=2,'a candidate publishes beside a newer attachment');
select pg_temp.assert_ok(exists(select 1 from public.content_assessments where unit_id=pg_temp.id('newer') and assessment_id=current_setting('test.newer')::uuid),'the working draft keeps its attachment');
-- An assessment that became incompatible stops execution.
select pg_temp.make_unit('incompatible',false);
select pg_temp.act('owner');
select set_config('test.incompatible',public.create_content_assessment(pg_temp.id('academy'),pg_temp.id('incompatible'),2,'assignment','Archived homework')::text,true);
select pg_temp.keep('incompatible'); select pg_temp.schedule('incompatible');
update public.assignments set state='archived',archived_at=now(),archived_by=pg_temp.id('owner') where id=current_setting('test.incompatible')::uuid;
select pg_temp.make_due('incompatible');
select edra_private.run_content_publications(25);
select pg_temp.assert_ok(((pg_temp.sched('incompatible')).state='stopped' and (pg_temp.sched('incompatible')).reason='incompatible_assessment'),'audience and attachment compatibility is rechecked');

-- Assets used only by an approved version can't be deleted.
select pg_temp.make_unit('kept',false);
select pg_temp.act('owner');
select pg_temp.keep('kept');
insert into ids(name) values('asset-replacement');
insert into public.content_assets(id,academy_id,unit_id,created_by,kind,name,mime_type,status,playback_id)
  values(pg_temp.id('asset-replacement'),pg_temp.id('academy'),pg_temp.id('kept'),pg_temp.id('owner'),'video','Replacement','video/mp4','ready','test-playback');
select public.save_content_unit(pg_temp.id('academy'),pg_temp.id('kept'),(pg_temp.unit('kept')).version,jsonb_build_object('title','Replaced','description','','accessDays',7,'items',jsonb_build_array(jsonb_build_object('id',pg_temp.id('asset-replacement'),'kind','explanation','title','New','assetId',pg_temp.id('asset-replacement')))));
select pg_temp.fails(format('select public.request_content_video_deletion(%L,%L)',pg_temp.id('academy'),pg_temp.id('asset-kept')),'asset_in_use');

-- Transient errors retry with backoff and leave everything else alone; one unit can't block another.
create function public.edra_test_transient() returns trigger language plpgsql as $t$
begin
  if new.document->>'title'='Transient' then raise exception 'simulated' using errcode='40001'; end if;
  return new;
end $t$;
create trigger edra_test_transient before insert on public.content_revisions for each row execute function public.edra_test_transient();
select pg_temp.make_unit('transient',true);
select pg_temp.make_unit('neighbor',true);
select pg_temp.act('owner');
select pg_temp.edit('transient','Transient'); select pg_temp.keep('transient'); select pg_temp.schedule('transient');
select pg_temp.edit('neighbor','Neighbor'); select pg_temp.keep('neighbor'); select pg_temp.schedule('neighbor');
select pg_temp.make_due('transient'); select pg_temp.make_due('neighbor');
select pg_temp.assert_ok(edra_private.run_content_publications(25)=1,'the healthy unit still publishes');
select pg_temp.assert_ok((pg_temp.unit('neighbor')).published_revision=2,'one failure does not block another unit');
select pg_temp.assert_ok(((pg_temp.sched('transient')).state='pending' and (pg_temp.sched('transient')).attempts=1 and (pg_temp.sched('transient')).next_attempt_at>clock_timestamp() and (pg_temp.unit('transient')).published_revision=1),'a transient error retries later without publishing');
select pg_temp.assert_ok((select error like '%simulated%' from edra_private.content_publication_runs order by id desc limit 1),'the run records the error');
select pg_temp.assert_ok((select oldest_overdue_seconds>0 and last_run_at is not null from edra_private.content_publication_health()),'health reports the overdue schedule');
select pg_temp.assert_ok((select published_last_hour>0 and retried_last_hour>0 from edra_private.content_publication_health()),'health reports outcomes');
select edra_private.run_content_publications(25);
select pg_temp.assert_ok((pg_temp.sched('transient')).attempts=1,'backoff holds the next attempt');
do $$ declare generation integer:=(pg_temp.sched('transient')).generation; begin
  for i in 1..6 loop perform edra_private.content_publication_failed(pg_temp.id('transient'),generation,'40001','simulated'); end loop;
  perform pg_temp.assert_ok((pg_temp.sched('transient')).state='pending' and (pg_temp.sched('transient')).attempts=7,'retries continue up to the bound');
  perform pg_temp.assert_ok(edra_private.content_publication_failed(pg_temp.id('transient'),generation,'40001','simulated')='stopped','retries are bounded');
  perform pg_temp.assert_ok(edra_private.content_publication_failed(pg_temp.id('transient'),generation,'40001','late')='skipped','a stale generation is ignored');
end $$;
select pg_temp.assert_ok(((pg_temp.sched('transient')).reason='retries_exhausted' and (pg_temp.sched('transient')).next_attempt_at is null),'exhausted retries record a reason');
-- Cancel dismisses a stopped schedule.
select pg_temp.act('owner');
select pg_temp.assert_ok(pg_temp.cancel('transient')->>'state'='cancelled','a stopped schedule can be dismissed');
drop trigger edra_test_transient on public.content_revisions;

-- Publish now: failure leaves the schedule and snapshot, success atomically cancels.
select pg_temp.make_unit('now',true);
select pg_temp.act('owner');
select pg_temp.edit('now','Scheduled candidate'); select pg_temp.keep('now'); select pg_temp.schedule('now');
select pg_temp.fails(format('select public.publish_content_edits(%L,%L,%s,%L::jsonb)',pg_temp.id('academy'),pg_temp.id('now'),(pg_temp.unit('now')).version,'{"title":"Empty","description":"","items":[]}'),'explanation_required');
select pg_temp.assert_ok(((pg_temp.sched('now')).state='pending' and (pg_temp.unit('now')).published_revision=1 and (pg_temp.unit('now')).draft->>'title'='Scheduled candidate'),'failed immediate publication changes nothing');
select public.publish_content_edits(pg_temp.id('academy'),pg_temp.id('now'),(pg_temp.unit('now')).version,pg_temp.doc('now','Published now'));
select pg_temp.assert_ok(((pg_temp.unit('now')).published_revision=2 and (pg_temp.sched('now')).state='cancelled' and (pg_temp.sched('now')).reason='published_now' and (pg_temp.sched('now')).next_attempt_at is null),'success cancels the schedule');
select pg_temp.assert_ok((select candidate_id is null from public.content_revisions where unit_id=pg_temp.id('now') and revision=2),'immediate publication has no candidate');
-- The older candidate can't roll the new publication back.
select pg_temp.fails(format('select pg_temp.schedule(%L)','now'),'nothing_to_publish');

-- Cancel prevents execution; a stale cancel after execution reports what happened.
select pg_temp.make_unit('cancel',true);
select pg_temp.act('owner');
select pg_temp.edit('cancel','Cancelled'); select pg_temp.keep('cancel'); select pg_temp.schedule('cancel');
create temporary table cancel_generation as select generation from public.content_publication_schedules where unit_id=pg_temp.id('cancel');
select pg_temp.assert_ok(pg_temp.cancel('cancel')->>'state'='cancelled','cancel acknowledges');
select pg_temp.assert_ok((select public.cancel_content_publication(pg_temp.id('academy'),pg_temp.id('cancel'),generation)->>'state'='cancelled' from cancel_generation),'a retried cancel reports the same outcome');
select pg_temp.make_due('cancel');
select edra_private.run_content_publications(25);
select pg_temp.assert_ok((pg_temp.unit('cancel')).published_revision=1,'a cancelled schedule never executes');
select pg_temp.schedule('cancel');
create temporary table race_generation as select generation from public.content_publication_schedules where unit_id=pg_temp.id('cancel');
select pg_temp.make_due('cancel');
select edra_private.run_content_publications(25);
select pg_temp.assert_ok((select public.cancel_content_publication(pg_temp.id('academy'),pg_temp.id('cancel'),generation)->>'state'='published' from race_generation),'cancelling after execution reports publication');
select pg_temp.assert_ok((pg_temp.unit('cancel')).published_revision=2,'the executed publication stands');
select pg_temp.fails(format('select public.schedule_content_publication(%L,%L,%L,%s)',pg_temp.id('academy'),pg_temp.id('cancel'),pg_temp.later(),(select generation from race_generation)),'schedule_conflict');

-- Cross-academy ids are refused.
select pg_temp.act('outsider');
select pg_temp.fails(format('select public.schedule_content_publication(%L,%L,%L,0)',pg_temp.id('other-academy'),pg_temp.id('cancel'),pg_temp.later()),'not_found');
select pg_temp.fails(format('select public.cancel_content_publication(%L,%L,1)',pg_temp.id('other-academy'),pg_temp.id('cancel')),'not_found');
select pg_temp.fails(format('select public.save_content_draft_version(%L,%L,1)',pg_temp.id('other-academy'),pg_temp.id('cancel')),'not_found');

-- A closed year stops execution and refuses commands. Last: it closes the fixture year.
select pg_temp.make_unit('closed',true);
select pg_temp.act('owner');
select pg_temp.edit('closed','Closed'); select pg_temp.keep('closed'); select pg_temp.schedule('closed');
update public.academic_years set closed_at=now() where id=pg_temp.id('year');
select pg_temp.make_due('closed');
select edra_private.run_content_publications(25);
select pg_temp.assert_ok(((pg_temp.sched('closed')).state='stopped' and (pg_temp.sched('closed')).reason='year_closed' and (pg_temp.unit('closed')).published_revision=1),'a closed year stops execution');
select pg_temp.fails(format('select pg_temp.keep(%L)','closed'),'year_closed');
select pg_temp.fails(format('select pg_temp.schedule(%L)','closed'),'year_closed');
rollback;
select 'Scheduled publication passed' as result;
