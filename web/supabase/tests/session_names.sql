-- Schedule occurrence names: schedule-editor authority, actor stamping, tenant isolation and grants.
-- Run with `npm run test:db` against the disposable GitHub Actions database (see docs/engineering.md).
-- Everything runs in one transaction that is rolled back.
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
begin if ok is not true then raise exception 'Session names check failed: %', label; end if; end $$;
create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$
begin
  execute statement;
  raise exception 'Expected rejection: %', expected using errcode = 'XX001';
exception when sqlstate 'XX001' then raise;
  when others then if sqlerrm not like expected then raise exception 'Expected %, got %', expected, sqlerrm; end if;
end $$;
create temporary table name_ids(name text primary key, id uuid not null default gen_random_uuid());
insert into name_ids(name) values ('owner'),('instructor'),('suspended'),('outsider'),('academy'),('other');
grant select on pg_temp.name_ids to authenticated;
create function pg_temp.id(label text) returns uuid language sql as $$ select id from pg_temp.name_ids where name=label $$;
create function pg_temp.act(label text) returns void language sql as $$ select set_config('request.jwt.claim.sub',coalesce(pg_temp.id(label)::text,''),true) $$;

insert into auth.users(id) select id from name_ids where name in ('owner','instructor','suspended','outsider');
insert into public.academies(id,name,slug,icon,subject,created_by) values
 (pg_temp.id('academy'),'Names fixture','names-'||pg_temp.id('academy'),'school','Math',pg_temp.id('owner')),
 (pg_temp.id('other'),'Other names fixture','names-'||pg_temp.id('other'),'school','Math',pg_temp.id('outsider'));
insert into public.academy_memberships(academy_id,user_id,role,created_by,suspended_at) values
 (pg_temp.id('academy'),pg_temp.id('owner'),'owner',pg_temp.id('owner'),null),
 (pg_temp.id('academy'),pg_temp.id('instructor'),'instructor',pg_temp.id('owner'),null),
 (pg_temp.id('academy'),pg_temp.id('suspended'),'admin',pg_temp.id('owner'),now()),
 (pg_temp.id('other'),pg_temp.id('outsider'),'owner',pg_temp.id('outsider'),null);
insert into name_ids(name,id) select 'year',id from public.academic_years where academy_id=pg_temp.id('academy');
insert into public.academy_levels(academy_id,level_id,sort_order) values(pg_temp.id('academy'),'secondary-1',4);

select pg_temp.act('owner');
set local role authenticated;
insert into name_ids(name,id) values
 ('recurring',public.create_schedule(pg_temp.id('academy'),pg_temp.id('year'),'Weekly class','recurring','level',null,'secondary-1',null,true,null,
   '[{"weekday":1,"startsAt":"17:00","endsAt":"18:00"}]','[]')),
 ('oneoff',public.create_schedule(pg_temp.id('academy'),pg_temp.id('year'),'Extra class','one_off','level',null,'secondary-1',null,true,null,
   '[]',jsonb_build_array(jsonb_build_object('date',(now() at time zone 'Africa/Cairo')::date,'startsAt','17:00','endsAt','18:00'))));

-- Managers name any schedule's occurrence; the writer is stamped from the session, not the payload.
insert into public.schedule_occurrence_names(academy_id,academic_year_id,schedule_id,occurs_on,name,updated_by)
values (pg_temp.id('academy'),pg_temp.id('year'),pg_temp.id('recurring'),'2026-12-07','Chapter 3: Derivatives',pg_temp.id('instructor'));
select pg_temp.check((select updated_by from public.schedule_occurrence_names where schedule_id=pg_temp.id('recurring'))=pg_temp.id('owner'),'writer is the actor');
update public.schedule_occurrence_names set name='Chapter 3 review' where schedule_id=pg_temp.id('recurring');
select pg_temp.check((select name from public.schedule_occurrence_names where schedule_id=pg_temp.id('recurring'))='Chapter 3 review','manager renames');
select pg_temp.expect_error(format($$insert into public.schedule_occurrence_names(academy_id,academic_year_id,schedule_id,occurs_on,name) values (%L,%L,%L,'2026-12-14',' padded ')$$,
  pg_temp.id('academy'),pg_temp.id('year'),pg_temp.id('recurring')),'%check constraint%');

-- Instructors follow the schedule edit rule: one-offs only.
select pg_temp.act('instructor');
insert into public.schedule_occurrence_names(academy_id,academic_year_id,schedule_id,occurs_on,name)
values (pg_temp.id('academy'),pg_temp.id('year'),pg_temp.id('oneoff'),(now() at time zone 'Africa/Cairo')::date,'Mock exam walkthrough');
select pg_temp.check((select count(*) from public.schedule_occurrence_names)=2,'instructor sees academy names');
select pg_temp.expect_error(format($$insert into public.schedule_occurrence_names(academy_id,academic_year_id,schedule_id,occurs_on,name) values (%L,%L,%L,'2026-12-14','Not mine')$$,
  pg_temp.id('academy'),pg_temp.id('year'),pg_temp.id('recurring')),'%row-level security%');
update public.schedule_occurrence_names set name='Hijacked' where schedule_id=pg_temp.id('recurring');
delete from public.schedule_occurrence_names where schedule_id=pg_temp.id('recurring');
reset role;
select pg_temp.check((select name from public.schedule_occurrence_names where schedule_id=pg_temp.id('recurring'))='Chapter 3 review','instructor cannot rename or clear recurring names');

-- Suspended staff and other academies see and change nothing.
select pg_temp.act('suspended');
set local role authenticated;
select pg_temp.check((select count(*) from public.schedule_occurrence_names)=0,'suspended staff read nothing');
select pg_temp.act('outsider');
select pg_temp.check((select count(*) from public.schedule_occurrence_names)=0,'other academy reads nothing');
select pg_temp.expect_error(format($$insert into public.schedule_occurrence_names(academy_id,academic_year_id,schedule_id,occurs_on,name) values (%L,%L,%L,'2026-12-21','Foreign')$$,
  pg_temp.id('academy'),pg_temp.id('year'),pg_temp.id('recurring')),'%row-level security%');

-- Archived schedules keep their names but are no longer renameable.
select pg_temp.act('owner');
update public.schedules set archived_at=now() where id=pg_temp.id('oneoff');
update public.schedule_occurrence_names set name='After archive' where schedule_id=pg_temp.id('oneoff');
select pg_temp.check((select name from public.schedule_occurrence_names where schedule_id=pg_temp.id('oneoff'))='Mock exam walkthrough','archived names are frozen');
delete from public.schedule_occurrence_names where schedule_id=pg_temp.id('recurring');
select pg_temp.check(not exists(select 1 from public.schedule_occurrence_names where schedule_id=pg_temp.id('recurring')),'manager clears a name');
reset role;

select pg_temp.check(not has_table_privilege('anon','public.schedule_occurrence_names','select'),'anonymous read denied');
select pg_temp.check(not has_function_privilege('authenticated','public.stamp_schedule_occurrence_name()','execute'),'stamp trigger is private');

rollback;
