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
select pg_temp.check(jsonb_array_length(public.staff_home(pg_temp.id('academy'))->'attendance')=12,'twelve attendance weeks, including empty ones');
select pg_temp.check(public.staff_home(pg_temp.id('academy'))->'watch'='[]'::jsonb and public.staff_home(pg_temp.id('academy'))->'recent'='[]'::jsonb,'no sessions means nobody to watch and no recent sessions');
select pg_temp.check(public.staff_home(pg_temp.id('academy'))->'assignments'='[]'::jsonb,'no marks means no assignment performance');
select pg_temp.check((select bool_and((w->>'counted')::int=0 and (w->>'sessions')::int=0) from jsonb_array_elements(public.staff_home(pg_temp.id('academy'))->'attendance') w),'no finalized sheets is zero counted, not a rate');
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
-- Assignment-only evidence must flag low performance even with no attendance.
insert into label_ids(name) values ('watch-a'),('watch-b'),('watch-part-a'),('watch-part-b');
insert into public.assignments(id,academy_id,academic_year_id,title,audience,level_id,due_at,created_by,updated_by)
select pg_temp.id(n),pg_temp.id('academy'),pg_temp.id('year'),'Watch fixture','level','preparatory-3',now()-d*interval '1 day',pg_temp.id('owner'),pg_temp.id('owner')
from (values ('watch-a',8),('watch-b',15)) v(n,d);
insert into public.assignment_parts(id,academy_id,assignment_id,position,title,max_score)
select pg_temp.id(p),pg_temp.id('academy'),pg_temp.id(a),1,'Part',100
from (values ('watch-a','watch-part-a'),('watch-b','watch-part-b')) v(a,p);
insert into public.assignment_recipients(assignment_id,annual_student_record_id,academy_id,academic_year_id)
select pg_temp.id(a),r.id,pg_temp.id('academy'),pg_temp.id('year') from (values ('watch-a'),('watch-b')) v(a)
cross join public.annual_student_records r where r.academy_id=pg_temp.id('academy');
insert into public.assignment_marks(assignment_id,annual_student_record_id,part_id,academy_id,kind,score,updated_by)
select pg_temp.id(a),r.id,pg_temp.id(p),pg_temp.id('academy'),'mark',case when r.full_name='Home online student' then 30 else 90 end,pg_temp.id('owner')
from (values ('watch-a','watch-part-a'),('watch-b','watch-part-b')) v(a,p)
cross join public.annual_student_records r where r.academy_id=pg_temp.id('academy');
select pg_temp.act('owner');
set local role authenticated;
select pg_temp.check(jsonb_array_length(public.staff_home(pg_temp.id('academy'))->'watch')=1,'low assignment marks qualify without absences; strong marks do not');
select pg_temp.check(public.staff_home(pg_temp.id('academy'))#>>'{watch,0,score}'='30.0','assignment-only score does not treat missing attendance as zero');
select pg_temp.check(jsonb_array_length(public.staff_home(pg_temp.id('academy'))#>'{watch,0,trend}')=8,'eight weekly points preserve gaps');
select pg_temp.check(public.staff_home(pg_temp.id('academy'))#>'{watch,0,change}'='null'::jsonb,'missing prior evidence is unknown');
reset role;
-- The staff student projection reuses real unit progress and never accepts a foreign record.
update public.content_units set state='published',published_revision=1,published_version=version where id=pg_temp.id('unit');
insert into public.content_revisions(unit_id,academy_id,revision,document,published_by)
values(pg_temp.id('unit'),pg_temp.id('academy'),1,'{"title":"Review me","description":"","accessDays":7,"items":[]}',pg_temp.id('owner'));
select pg_temp.act('owner');
set local role authenticated;
select pg_temp.check((public.staff_student_learning(pg_temp.id('academy'),(select id from public.annual_student_records where full_name='Home online student' and academy_id=pg_temp.id('academy')),0)->>'total')::int=1,'staff sees eligible published unit');
select pg_temp.expect_error(format('select public.staff_student_learning(%L,%L,0)',pg_temp.id('other'),gen_random_uuid()),'forbidden');
select pg_temp.check((public.staff_student_assessments(pg_temp.id('academy'),(select id from public.annual_student_records where full_name='Home online student' and academy_id=pg_temp.id('academy')),0)->>'total')::int=0,'empty assessment history is scoped');
select pg_temp.expect_error(format('select public.staff_student_assessments(%L,%L,0)',pg_temp.id('other'),gen_random_uuid()),'forbidden');
select pg_temp.act('student');
select pg_temp.expect_error(format('select public.staff_student_learning(%L,%L,0)',pg_temp.id('academy'),gen_random_uuid()),'forbidden');
reset role;
select pg_temp.check(not has_function_privilege('anon','public.staff_home(uuid)','execute'),'anonymous execution denied');
select pg_temp.check(not has_function_privilege('anon','public.staff_student_learning(uuid,uuid,integer)','execute'),'anonymous student learning denied');
select pg_temp.check(not has_function_privilege('anon','public.staff_student_assessments(uuid,uuid,integer)','execute'),'anonymous assessment summary denied');
rollback;
