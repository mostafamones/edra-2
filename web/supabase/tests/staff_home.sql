-- Disposable CI only: scoped summary, manager-only work and identity denial.
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
begin if ok is not true then raise exception 'Labels check failed: %', label; end if; end $$;
create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$
begin
  execute statement;
  raise exception 'Expected rejection: %', expected using errcode = 'XX001';
exception when sqlstate 'XX001' then raise;
  when others then if sqlerrm not like expected then raise exception 'Expected %, got %', expected, sqlerrm; end if;
end $$;
create temporary table label_ids(name text primary key, id uuid not null default gen_random_uuid());
insert into label_ids(name) values ('owner'),('admin'),('instructor'),('suspended'),('student'),('outsider'),('academy'),('other'),
  ('a1'),('q1'),('q2'),('x1'),('xo'),('red'),('blue'),('green'),('foreign');
grant select on pg_temp.label_ids to authenticated;
create function pg_temp.id(label text) returns uuid language sql as $$ select id from pg_temp.label_ids where name=label $$;
create function pg_temp.act(label text) returns void language sql as $$ select set_config('request.jwt.claim.sub',coalesce(pg_temp.id(label)::text,''),true) $$;

insert into auth.users(id) select id from label_ids where name in ('owner','admin','instructor','suspended','student','outsider');
insert into public.academies(id,name,slug,icon,subject,created_by) values
 (pg_temp.id('academy'),'Labels fixture','labels-'||pg_temp.id('academy'),'school','Math',pg_temp.id('owner')),
 (pg_temp.id('other'),'Other labels fixture','labels-'||pg_temp.id('other'),'school','Math',pg_temp.id('outsider'));
insert into public.academy_memberships(academy_id,user_id,role,created_by,suspended_at) values
 (pg_temp.id('academy'),pg_temp.id('owner'),'owner',pg_temp.id('owner'),null),
 (pg_temp.id('academy'),pg_temp.id('admin'),'admin',pg_temp.id('owner'),null),
 (pg_temp.id('academy'),pg_temp.id('instructor'),'instructor',pg_temp.id('owner'),null),
 (pg_temp.id('academy'),pg_temp.id('suspended'),'admin',pg_temp.id('owner'),now()),
 (pg_temp.id('other'),pg_temp.id('outsider'),'owner',pg_temp.id('outsider'),null);
insert into label_ids(name,id) select 'year',id from public.academic_years where academy_id=pg_temp.id('academy');
insert into label_ids(name,id) select 'other-year',id from public.academic_years where academy_id=pg_temp.id('other');
insert into public.academy_levels(academy_id,level_id,sort_order) values(pg_temp.id('academy'),'preparatory-3',9);


insert into label_ids(name) values ('program'),('unit');
insert into public.content_programs(id,academy_id,academic_year_id,level_id) values (pg_temp.id('program'),pg_temp.id('academy'),pg_temp.id('year'),'preparatory-3');
insert into public.content_units(id,academy_id,program_id,created_by,state,draft) values (pg_temp.id('unit'),pg_temp.id('academy'),pg_temp.id('program'),pg_temp.id('owner'),'review','{"title":"Review me","description":"","items":[]}');
select pg_temp.act('owner');
set local role authenticated;
select pg_temp.check((public.staff_home(pg_temp.id('academy'))->>'attentionCount')::int=1,'manager review queue');
select pg_temp.check((public.staff_home(pg_temp.id('academy'))#>>'{students,total}')::int=0,'empty year is zero, not historical records');
select pg_temp.check((public.staff_home(pg_temp.id('academy'))#>>'{attention,0,id}')=pg_temp.id('unit')::text,'exact destination identity');
select public.create_student_record(pg_temp.id('academy'),pg_temp.id('year'),'Home online student','01012345678','01112223333','preparatory-3',null,null,'online_only');
select public.create_student_record(pg_temp.id('academy'),pg_temp.id('year'),'Home physical student','01012345679','01112223333','preparatory-3',null,null,'in_person');
select pg_temp.check((public.staff_home(pg_temp.id('academy'))#>>'{students,total}')::int=2,'aggregate enrollment counts every active record');
select pg_temp.check((public.staff_home(pg_temp.id('academy'))#>>'{students,online}')::int=1,'online participation is distinct from all students');
select pg_temp.check((public.staff_home(pg_temp.id('academy'))#>>'{students,levels,0,total}')::int=2,'grade breakdown agrees with total');
select pg_temp.expect_error(format('select public.staff_home(%L)',pg_temp.id('other')),'forbidden');
select pg_temp.act('instructor');
select pg_temp.check((public.staff_home(pg_temp.id('academy'))->>'attentionCount')::int=0,'instructor cannot see manager publication queue');
select pg_temp.act('suspended');
select pg_temp.expect_error(format('select public.staff_home(%L)',pg_temp.id('academy')),'forbidden');
select pg_temp.act('student');
select pg_temp.expect_error(format('select public.staff_home(%L)',pg_temp.id('academy')),'forbidden');
select set_config('request.jwt.claim.sub','',true);
select pg_temp.expect_error(format('select public.staff_home(%L)',pg_temp.id('academy')),'forbidden');
reset role;
select pg_temp.check(not has_function_privilege('anon','public.staff_home(uuid)','execute'),'anonymous execution denied');
rollback;
