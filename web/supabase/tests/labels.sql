-- Shared academy labels and their assessment integration: grants, RLS, manager vs Instructor
-- authority, suspended/signed-out/student/cross-academy denial, multiple labels on every assessment
-- type, archived and closed-year assignment, global rename/recolor/delete, conditional deletion,
-- list filtering/totals/paging, and preservation of academic records. All fixtures roll back.
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

-- Writes only through the commands; reads only for staff.
do $$
declare t text;
begin
  foreach t in array array['labels','assignment_labels','quiz_labels','exam_labels','content_unit_labels','annual_student_record_labels'] loop
    if has_table_privilege('anon', 'public.'||t, 'select') or has_table_privilege('authenticated', 'public.'||t, 'insert')
      or has_table_privilege('authenticated', 'public.'||t, 'update') or has_table_privilege('authenticated', 'public.'||t, 'delete')
      or not has_table_privilege('authenticated', 'public.'||t, 'select') then
      raise exception 'Labels check failed: % grants', t;
    end if;
  end loop;
  if has_function_privilege('anon', 'public.create_label(uuid,uuid,text,text,text)', 'execute')
    or has_function_privilege('anon', 'public.set_assessment_label(uuid,text,uuid,uuid,boolean)', 'execute')
    or has_function_privilege('anon', 'public.delete_label(uuid,uuid,boolean)', 'execute')
    or has_function_privilege('anon', 'public.set_content_unit_label(uuid,uuid,uuid,boolean)', 'execute')
    or not has_function_privilege('authenticated', 'public.set_content_unit_label(uuid,uuid,uuid,boolean)', 'execute')
    or has_function_privilege('anon', 'public.set_student_records_label(uuid,uuid[],uuid,boolean)', 'execute')
    or not has_function_privilege('authenticated', 'public.set_student_records_label(uuid,uuid[],uuid,boolean)', 'execute')
    or has_function_privilege('anon', 'public.list_student_records(uuid,uuid,text,text,text,text,text,text,jsonb,integer,integer,uuid[],boolean,text)', 'execute')
    or not has_function_privilege('authenticated', 'public.list_student_records(uuid,uuid,text,text,text,text,text,text,jsonb,integer,integer,uuid[],boolean,text)', 'execute')
    or has_function_privilege('anon', 'public.list_assessments(uuid,uuid,text[],text,text,text,uuid,uuid,text[],text,text,integer,integer,uuid[],boolean)', 'execute')
    or not has_function_privilege('authenticated', 'public.update_label(uuid,uuid,text,text)', 'execute')
    or has_function_privilege('authenticated', 'edra_private.require_label_role(uuid,boolean)', 'execute') then
    raise exception 'Labels check failed: function grants';
  end if;
end $$;

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

select pg_temp.act('owner');
set local role authenticated;
select public.create_assignment(pg_temp.id('academy'),pg_temp.id('year'),pg_temp.id('a1'),
  '{"title":"Homework","instructions":"","due_at":null,"audience":"level","level_id":"preparatory-3","parts":[{"title":"A","kind":"file_upload","questions":[{"max_score":"10"}]}]}');
select public.create_quiz(pg_temp.id('academy'),pg_temp.id('year'),pg_temp.id('q1'),'{"title":"Quiz","instructions":"","parts":[]}');
select public.create_quiz(pg_temp.id('academy'),pg_temp.id('year'),pg_temp.id('q2'),'{"title":"Archived quiz","instructions":"","parts":[]}');
select public.create_exam(pg_temp.id('academy'),pg_temp.id('year'),pg_temp.id('x1'),'{"title":"Exam","instructions":"","parts":[]}');
select public.archive_quiz(pg_temp.id('academy'), pg_temp.id('q2'), (public.get_quiz(pg_temp.id('academy'), pg_temp.id('q2'))->>'version')::integer);
reset role;
select pg_temp.act('outsider');
set local role authenticated;
select public.create_exam(pg_temp.id('other'),pg_temp.id('other-year'),pg_temp.id('xo'),'{"title":"Other exam","instructions":"","parts":[]}');
select public.create_label(pg_temp.id('other'),pg_temp.id('foreign'),'Foreign','red');
reset role;

-- Managers create; a retried create returns the same label; names are unique per academy, case-insensitively.
select pg_temp.act('admin');
set local role authenticated;
select pg_temp.check(public.create_label(pg_temp.id('academy'),pg_temp.id('red'),'  Revision ','red') = jsonb_build_object('id',pg_temp.id('red'),'name','Revision','color','red'), 'admin creates, trimmed');
select pg_temp.check(public.create_label(pg_temp.id('academy'),pg_temp.id('red'),'Revision','red')->>'id' = pg_temp.id('red')::text, 'retried create is idempotent');
select public.create_label(pg_temp.id('academy'),pg_temp.id('blue'),'Homework week','blue');
reset role;
select pg_temp.act('owner');
set local role authenticated;
select public.create_label(pg_temp.id('academy'),pg_temp.id('green'),'Exam prep','green');
select pg_temp.expect_error($s$ select public.create_label(pg_temp.id('academy'),gen_random_uuid(),'REVISION','teal') $s$, 'duplicate_name');
select pg_temp.expect_error($s$ select public.create_label(pg_temp.id('academy'),gen_random_uuid(),'Bad','#ff0000') $s$, 'validation');
select pg_temp.expect_error($s$ select public.create_label(pg_temp.id('academy'),gen_random_uuid(),'   ','red') $s$, 'validation');
select pg_temp.expect_error($s$ select public.create_label(pg_temp.id('academy'),gen_random_uuid(),repeat('x',41),'red') $s$, 'validation');
-- Reusing another academy's label ID is not a retry.
select pg_temp.expect_error($s$ select public.create_label(pg_temp.id('academy'),pg_temp.id('foreign'),'Foreign','red') $s$, 'validation');
reset role;

-- Instructors apply labels but cannot manage definitions.
select pg_temp.act('instructor');
set local role authenticated;
select pg_temp.expect_error($s$ select public.create_label(pg_temp.id('academy'),gen_random_uuid(),'Mine','red') $s$, 'forbidden');
select pg_temp.expect_error($s$ select public.update_label(pg_temp.id('academy'),pg_temp.id('red'),'Renamed','red') $s$, 'forbidden');
select pg_temp.expect_error($s$ select public.delete_label(pg_temp.id('academy'),pg_temp.id('red'),true) $s$, 'forbidden');
select pg_temp.check((select string_agg(name, ',' order by name) from public.labels where lower(name) in ('online only','ready for in-person','needs review')) = 'Needs review,Online only,Ready for in-person', 'a new academy starts with the default labels');
select pg_temp.check((select count(*) from public.labels where domain = 'assessments') = 6
  and (select count(*) from public.labels where domain = 'content') = 3
  and (select count(*) from public.labels where domain = 'students') = 3, 'instructor reads all three academy catalogs');
select pg_temp.check(not exists (select 1 from public.labels where academy_id <> pg_temp.id('academy')), 'instructor reads only this academy catalog');
-- Multiple labels on every type, applied as a desired state: repeating it changes nothing.
select public.set_assessment_label(pg_temp.id('academy'),'assignment',pg_temp.id('a1'),pg_temp.id('red'),true);
select public.set_assessment_label(pg_temp.id('academy'),'assignment',pg_temp.id('a1'),pg_temp.id('blue'),true);
select pg_temp.check(jsonb_array_length(public.set_assessment_label(pg_temp.id('academy'),'assignment',pg_temp.id('a1'),pg_temp.id('blue'),true)) = 2, 'repeated apply keeps two labels');
select public.set_assessment_label(pg_temp.id('academy'),'quiz',pg_temp.id('q1'),pg_temp.id('red'),true);
select public.set_assessment_label(pg_temp.id('academy'),'exam',pg_temp.id('x1'),pg_temp.id('blue'),true);
select public.set_assessment_label(pg_temp.id('academy'),'exam',pg_temp.id('x1'),pg_temp.id('green'),true);
-- Archived assessments may be labelled.
select public.set_assessment_label(pg_temp.id('academy'),'quiz',pg_temp.id('q2'),pg_temp.id('green'),true);
-- Removing twice is safe and leaves other labels alone.
select pg_temp.check(public.set_assessment_label(pg_temp.id('academy'),'exam',pg_temp.id('x1'),pg_temp.id('blue'),false) = jsonb_build_array(pg_temp.id('green')), 'remove keeps others');
select pg_temp.check(public.set_assessment_label(pg_temp.id('academy'),'exam',pg_temp.id('x1'),pg_temp.id('blue'),false) = jsonb_build_array(pg_temp.id('green')), 'repeated remove');
select public.set_assessment_label(pg_temp.id('academy'),'exam',pg_temp.id('x1'),pg_temp.id('blue'),true);
-- Type, tenant and label must match.
select pg_temp.expect_error($s$ select public.set_assessment_label(pg_temp.id('academy'),'quiz',pg_temp.id('a1'),pg_temp.id('red'),true) $s$, 'not_found');
select pg_temp.expect_error($s$ select public.set_assessment_label(pg_temp.id('academy'),'exam',pg_temp.id('xo'),pg_temp.id('red'),true) $s$, 'not_found');
select pg_temp.expect_error($s$ select public.set_assessment_label(pg_temp.id('academy'),'assignment',pg_temp.id('a1'),pg_temp.id('foreign'),true) $s$, 'label_not_found');
select pg_temp.expect_error($s$ select public.set_assessment_label(pg_temp.id('academy'),'homework',pg_temp.id('a1'),pg_temp.id('red'),true) $s$, 'validation');
reset role;

-- Direct writes are refused even to managers; foreign keys reject cross-academy links.
select pg_temp.act('owner');
set local role authenticated;
select pg_temp.expect_error($s$ insert into public.labels(id,academy_id,name,color) values (gen_random_uuid(),pg_temp.id('academy'),'Direct','red') $s$, 'permission denied%');
select pg_temp.expect_error($s$ delete from public.quiz_labels $s$, 'permission denied%');
reset role;
select pg_temp.expect_error($s$ insert into public.exam_labels(academy_id,exam_id,label_id) values (pg_temp.id('academy'),pg_temp.id('x1'),pg_temp.id('foreign')) $s$, '%foreign key%');
select pg_temp.expect_error($s$ insert into public.exam_labels(academy_id,exam_id,label_id) values (pg_temp.id('other'),pg_temp.id('x1'),pg_temp.id('foreign')) $s$, '%foreign key%');
select pg_temp.expect_error($s$ insert into public.labels(id,academy_id,name,color) values (gen_random_uuid(),pg_temp.id('academy'),'Bad color','magenta') $s$, '%labels_color_check%');

-- Suspended staff, students/parents (no staff membership), other academies and signed-out callers see and change nothing.
create function pg_temp.denied(who text) returns void language plpgsql as $$
begin
  perform pg_temp.check((select count(*) from public.labels where academy_id = pg_temp.id('academy')) = 0, who||' reads no labels');
  perform pg_temp.check((select count(*) from public.assignment_labels where academy_id = pg_temp.id('academy'))
    + (select count(*) from public.quiz_labels where academy_id = pg_temp.id('academy'))
    + (select count(*) from public.exam_labels where academy_id = pg_temp.id('academy')) = 0, who||' reads no label uses');
  perform pg_temp.expect_error($s$ select public.set_assessment_label(pg_temp.id('academy'),'assignment',pg_temp.id('a1'),pg_temp.id('red'),false) $s$, 'forbidden');
  perform pg_temp.expect_error($s$ select public.set_student_records_label(pg_temp.id('academy'),array[pg_temp.id('a1')],pg_temp.id('red'),false) $s$, 'forbidden');
  perform pg_temp.check((select count(*) from public.annual_student_record_labels where academy_id = pg_temp.id('academy')) = 0, who||' reads no student label uses');
  perform pg_temp.expect_error($s$ select public.list_student_records(pg_temp.id('academy'),pg_temp.id('year'),null,'all',null,null,null,null,null,0,10) $s$, 'forbidden');
  perform pg_temp.expect_error($s$ select public.create_label(pg_temp.id('academy'),gen_random_uuid(),'Sneaky','red') $s$, 'forbidden');
  perform pg_temp.expect_error($s$ select public.delete_label(pg_temp.id('academy'),pg_temp.id('green'),true) $s$, 'forbidden');
  perform pg_temp.check(public.list_assessments(pg_temp.id('academy'),null,array['assignment','quiz','exam'],'',null,null,null,null,array['quiz:preparing'],'newest','none',25,0) is null, who||' list denied');
end $$;
select pg_temp.act('suspended');
set local role authenticated;
select pg_temp.denied('suspended admin');
reset role;
-- Students and parents have no staff membership.
select pg_temp.act('student');
set local role authenticated;
select pg_temp.denied('student');
reset role;
select pg_temp.act('outsider');
set local role authenticated;
select pg_temp.denied('other academy owner');
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role authenticated;
select pg_temp.denied('signed out');
reset role;

-- The list returns each row's labels by name and filters in the database: any selected label, or Unlabeled.
create function pg_temp.all_statuses() returns text[] language sql as $$ select array[
  'assignment:active','assignment:closed','assignment:archived',
  'quiz:preparing','quiz:ready','quiz:scheduled','quiz:open','quiz:headroom','quiz:closed','quiz:archived',
  'exam:preparing','exam:ready','exam:scheduled','exam:open','exam:headroom','exam:closed','exam:archived'] $$;
create function pg_temp.list(label_ids uuid[] default null, unlabeled boolean default false, lim integer default 25, skip integer default 0, year uuid default null)
returns jsonb language sql as $$
  select public.list_assessments(pg_temp.id('academy'), year, array['assignment','quiz','exam'], '', null, null, null, null,
    pg_temp.all_statuses(), 'title', 'none', lim, skip, label_ids, unlabeled)
$$;
create function pg_temp.order_of(page jsonb) returns text language sql as $$
  select coalesce(string_agg(n.name, ',' order by e.ordinality), '')
  from jsonb_array_elements(page->'items') with ordinality e(item, ordinality)
  join pg_temp.label_ids n on n.id = (e.item->>'id')::uuid
$$;
select pg_temp.act('instructor');
set local role authenticated;
-- Title order: Archived quiz, Exam, Homework, Quiz.
select pg_temp.check(pg_temp.order_of(pg_temp.list()) = 'q2,x1,a1,q1', 'unfiltered');
select pg_temp.check(pg_temp.list()->'items'->2->'labels' = jsonb_build_array(
  jsonb_build_object('id',pg_temp.id('blue'),'name','Homework week','color','blue'), jsonb_build_object('id',pg_temp.id('red'),'name','Revision','color','red')), 'row labels by name');
select pg_temp.check(pg_temp.order_of(pg_temp.list(array[pg_temp.id('red')])) = 'a1,q1', 'one label');
-- a1 has both red and blue, yet appears once and counts once.
select pg_temp.check(pg_temp.order_of(pg_temp.list(array[pg_temp.id('red'),pg_temp.id('blue')])) = 'x1,a1,q1', 'any of several labels');
select pg_temp.check((pg_temp.list(array[pg_temp.id('red'),pg_temp.id('blue')])->>'total')::integer = 3, 'no duplicate totals');
select pg_temp.check(pg_temp.order_of(pg_temp.list(array[pg_temp.id('red'),pg_temp.id('blue')], lim => 2, skip => 2)) = 'q1', 'filtered paging');
select pg_temp.check(pg_temp.order_of(pg_temp.list(array[pg_temp.id('foreign')])) = '', 'another academy label matches nothing');
select pg_temp.expect_error($s$ select pg_temp.list(array[pg_temp.id('red')], true) $s$, 'validation');
select pg_temp.expect_error($s$ select pg_temp.list(array(select gen_random_uuid() from generate_series(1,101))) $s$, 'validation');
select pg_temp.expect_error($s$ select pg_temp.list(null, null) $s$, 'validation');
select public.set_assessment_label(pg_temp.id('academy'),'quiz',pg_temp.id('q2'),pg_temp.id('green'),false);
select pg_temp.check(pg_temp.order_of(pg_temp.list(unlabeled => true)) = 'q2', 'unlabeled');
select public.set_assessment_label(pg_temp.id('academy'),'quiz',pg_temp.id('q2'),pg_temp.id('green'),true);
reset role;

-- Closed years: labels still change while academic work stays read-only.
update public.academic_years set closed_at = now() where id = pg_temp.id('year');
create temporary table before_records as
  select 'quiz' as type, id, version, title, updated_at from public.quizzes where academy_id = pg_temp.id('academy')
  union all select 'exam', id, version, title, updated_at from public.exams where academy_id = pg_temp.id('academy')
  union all select 'assignment', id, version, title, updated_at from public.assignments where academy_id = pg_temp.id('academy');
grant select on pg_temp.before_records to authenticated;
select pg_temp.act('instructor');
set local role authenticated;
select pg_temp.expect_error($s$ select public.create_quiz(pg_temp.id('academy'),pg_temp.id('year'),gen_random_uuid(),'{"title":"Late","instructions":"","parts":[]}') $s$, 'year_unavailable');
select public.set_assessment_label(pg_temp.id('academy'),'quiz',pg_temp.id('q1'),pg_temp.id('blue'),true);
select public.set_assessment_label(pg_temp.id('academy'),'assignment',pg_temp.id('a1'),pg_temp.id('blue'),false);
select public.set_assessment_label(pg_temp.id('academy'),'assignment',pg_temp.id('a1'),pg_temp.id('blue'),true);
select pg_temp.check((select count(*) from public.quiz_labels where quiz_id = pg_temp.id('q1')) = 2, 'closed-year quiz labelled');
reset role;
-- Managers rename and recolor globally, including closed-year and archived uses.
select pg_temp.act('admin');
set local role authenticated;
select pg_temp.check(public.update_label(pg_temp.id('academy'),pg_temp.id('green'),'Final prep','teal') = jsonb_build_object('id',pg_temp.id('green'),'name','Final prep','color','teal'), 'rename and recolor');
select pg_temp.check(public.update_label(pg_temp.id('academy'),pg_temp.id('green'),'Final prep','teal')->>'name' = 'Final prep', 'repeated update');
select pg_temp.expect_error($s$ select public.update_label(pg_temp.id('academy'),pg_temp.id('green'),'revision','teal') $s$, 'duplicate_name');
select pg_temp.expect_error($s$ select public.update_label(pg_temp.id('academy'),pg_temp.id('foreign'),'Mine','teal') $s$, 'not_found');
select pg_temp.check((select l->>'color' from jsonb_array_elements(pg_temp.list(year => null)->'items') i, jsonb_array_elements(i->'labels') l
  where i->>'id' = pg_temp.id('q2')::text) = 'teal', 'archived closed-year use shows the new color');

-- Deletion: a used label needs confirmation, counted across types, years and archived records.
select pg_temp.check(public.delete_label(pg_temp.id('academy'),pg_temp.id('blue'),false) = '{"status":"confirm","uses":3}'::jsonb, 'used label needs confirmation');
select pg_temp.check(exists (select 1 from public.labels where id = pg_temp.id('blue')) and (select count(*) from public.exam_labels where label_id = pg_temp.id('blue')) = 1, 'unconfirmed delete changes nothing');
select pg_temp.check(public.delete_label(pg_temp.id('academy'),pg_temp.id('green'),false)->>'status' = 'confirm', 'archived-only use still needs confirmation');
select pg_temp.check(public.delete_label(pg_temp.id('academy'),pg_temp.id('blue'),true) = '{"status":"deleted","uses":3}'::jsonb, 'confirmed delete');
select pg_temp.check(not exists (select 1 from public.labels where id = pg_temp.id('blue'))
  and not exists (select 1 from public.assignment_labels where label_id = pg_temp.id('blue'))
  and not exists (select 1 from public.quiz_labels where label_id = pg_temp.id('blue'))
  and not exists (select 1 from public.exam_labels where label_id = pg_temp.id('blue')), 'every association removed');
select pg_temp.check(public.delete_label(pg_temp.id('academy'),pg_temp.id('blue'),false)->>'status' = 'deleted', 'retried delete succeeds');
select pg_temp.check(public.delete_label(pg_temp.id('academy'),pg_temp.id('foreign'),true)->>'status' = 'deleted', 'foreign label untouched by delete');
-- An unused label goes without confirmation.
select public.create_label(pg_temp.id('academy'),'0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e','Unused','gray');
select pg_temp.check(public.delete_label(pg_temp.id('academy'),'0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e',false)->>'status' = 'deleted', 'unused deleted at once');
-- Removing a label that was deleted meanwhile is already the desired state; applying it is refused.
select pg_temp.check(public.set_assessment_label(pg_temp.id('academy'),'quiz',pg_temp.id('q1'),pg_temp.id('blue'),false) = jsonb_build_array(pg_temp.id('red')), 'remove deleted label');
select pg_temp.expect_error($s$ select public.set_assessment_label(pg_temp.id('academy'),'quiz',pg_temp.id('q1'),pg_temp.id('blue'),true) $s$, 'label_not_found');
reset role;
select pg_temp.check(exists (select 1 from public.labels where id = pg_temp.id('foreign')), 'other academy label kept');

-- A failure inside deletion rolls the whole command back.
create function public.edra_test_fail_label_delete() returns trigger language plpgsql as $$ begin raise exception 'injected'; end $$;
create trigger edra_test_fail_label_delete before delete on public.labels for each row execute function public.edra_test_fail_label_delete();
select pg_temp.act('admin');
set local role authenticated;
select pg_temp.expect_error($s$ select public.delete_label(pg_temp.id('academy'),pg_temp.id('red'),true) $s$, 'injected');
reset role;
drop trigger edra_test_fail_label_delete on public.labels;
select pg_temp.check(exists (select 1 from public.labels where id = pg_temp.id('red'))
  and (select count(*) from public.assignment_labels where label_id = pg_temp.id('red')) = 1
  and (select count(*) from public.quiz_labels where label_id = pg_temp.id('red')) = 1, 'failed delete kept label and uses');

-- Content units: any staff applies a desired state, the unit never changes, tenants stay apart, and a unit counts as a use.
insert into label_ids(name) values ('content-year'),('unit'),('other-unit'),('unit-only'),('unit-second');
insert into public.academic_years(id,academy_id,start_year)
  select pg_temp.id('content-year'),pg_temp.id('academy'),max(start_year)+1
  from public.academic_years where academy_id=pg_temp.id('academy');
insert into public.academy_levels(academy_id,level_id,sort_order) values(pg_temp.id('other'),'preparatory-3',9);
select pg_temp.act('owner');
set local role authenticated;
select public.create_content_unit(pg_temp.id('academy'),pg_temp.id('content-year'),'preparatory-3',null,pg_temp.id('unit'),'Labelled unit');
select pg_temp.check((select string_agg(name, ',' order by name) from public.labels where academy_id = pg_temp.id('academy') and domain = 'content') = 'Core,Needs update,Revision', 'a new academy starts with the default content labels');
select public.create_label(pg_temp.id('academy'),pg_temp.id('unit-only'),'Unit only','teal','content');
-- Each module has its own catalog: names repeat across catalogs but not within one, and a retry cannot switch catalog.
select public.create_label(pg_temp.id('academy'),pg_temp.id('unit-second'),'Unit second','red','content');
select pg_temp.expect_error($s$ select public.create_label(pg_temp.id('academy'),gen_random_uuid(),'REVISION','teal','content') $s$, 'duplicate_name');
select pg_temp.expect_error($s$ select public.create_label(pg_temp.id('academy'),pg_temp.id('unit-only'),'Unit only','teal','assessments') $s$, 'validation');
select pg_temp.expect_error($s$ select public.create_label(pg_temp.id('academy'),gen_random_uuid(),'Other','teal','nonsense') $s$, 'validation');
select pg_temp.check((select count(*) from public.labels where lower(name) = 'revision' and academy_id = pg_temp.id('academy')) = 2, 'same name in two catalogs');
reset role;
select pg_temp.act('outsider');
set local role authenticated;
select public.create_content_unit(pg_temp.id('other'),pg_temp.id('other-year'),'preparatory-3',null,pg_temp.id('other-unit'),'Other unit');
select pg_temp.check(not exists (select 1 from public.content_unit_labels where academy_id = pg_temp.id('academy')), 'outsider reads no unit labels');
select pg_temp.expect_error($s$ select public.set_content_unit_label(pg_temp.id('academy'),pg_temp.id('unit'),pg_temp.id('unit-only'),true) $s$, 'forbidden');
reset role;
create temporary table before_unit on commit drop as select version, updated_at, draft, state from public.content_units where id = pg_temp.id('unit');
grant select on pg_temp.before_unit to authenticated;
select pg_temp.act('instructor');
set local role authenticated;
select pg_temp.check(public.set_content_unit_label(pg_temp.id('academy'),pg_temp.id('unit'),pg_temp.id('unit-only'),true) = jsonb_build_array(pg_temp.id('unit-only')), 'instructor applies');
select pg_temp.check(jsonb_array_length(public.set_content_unit_label(pg_temp.id('academy'),pg_temp.id('unit'),pg_temp.id('unit-only'),true)) = 1, 'repeated apply keeps one');
select pg_temp.check(jsonb_array_length(public.set_content_unit_label(pg_temp.id('academy'),pg_temp.id('unit'),pg_temp.id('unit-second'),true)) = 2, 'multiple labels');
select pg_temp.check(jsonb_array_length(public.set_content_unit_label(pg_temp.id('academy'),pg_temp.id('unit'),pg_temp.id('unit-second'),false)) = 1, 'removes one');
select pg_temp.check(jsonb_array_length(public.set_content_unit_label(pg_temp.id('academy'),pg_temp.id('unit'),pg_temp.id('unit-second'),false)) = 1, 'repeated remove changes nothing');
select pg_temp.expect_error($s$ select public.set_content_unit_label(pg_temp.id('academy'),pg_temp.id('other-unit'),pg_temp.id('unit-only'),true) $s$, 'not_found');
select pg_temp.expect_error($s$ select public.set_content_unit_label(pg_temp.id('academy'),pg_temp.id('unit'),pg_temp.id('foreign'),true) $s$, 'label_not_found');
-- Labels stay in their own module, through the commands and against the foreign key.
select pg_temp.expect_error($s$ select public.set_content_unit_label(pg_temp.id('academy'),pg_temp.id('unit'),pg_temp.id('red'),true) $s$, 'label_not_found');
select pg_temp.expect_error($s$ select public.set_assessment_label(pg_temp.id('academy'),'quiz',pg_temp.id('q1'),pg_temp.id('unit-only'),true) $s$, 'label_not_found');
select pg_temp.check((select count(*) from public.content_units c join pg_temp.before_unit b on c.version = b.version and c.updated_at = b.updated_at and c.draft = b.draft and c.state = b.state where c.id = pg_temp.id('unit')) = 1, 'labelling leaves the unit unchanged');
reset role;
select pg_temp.act('suspended');
set local role authenticated;
select pg_temp.expect_error($s$ select public.set_content_unit_label(pg_temp.id('academy'),pg_temp.id('unit'),pg_temp.id('unit-only'),false) $s$, 'forbidden');
reset role;
select pg_temp.act('owner');
set local role authenticated;
select public.change_content_unit(pg_temp.id('academy'),pg_temp.id('unit'),(select version from public.content_units where id = pg_temp.id('unit')),'archive','');
select pg_temp.check(jsonb_array_length(public.set_content_unit_label(pg_temp.id('academy'),pg_temp.id('unit'),pg_temp.id('unit-second'),true)) = 2, 'archived unit still takes labels');
select public.set_content_unit_label(pg_temp.id('academy'),pg_temp.id('unit'),pg_temp.id('unit-second'),false);
select pg_temp.check(public.delete_label(pg_temp.id('academy'),pg_temp.id('unit-only'),false) = '{"status":"confirm","uses":1}'::jsonb, 'a unit counts as a use');
select pg_temp.check(public.delete_label(pg_temp.id('academy'),pg_temp.id('unit-only'),true) = '{"status":"deleted","uses":1}'::jsonb, 'confirmed delete');
select pg_temp.check(not exists (select 1 from public.content_unit_labels where unit_id = pg_temp.id('unit')) and exists (select 1 from public.content_units where id = pg_temp.id('unit')), 'delete removes the use, not the unit');
reset role;
select pg_temp.expect_error($s$ insert into public.content_unit_labels(academy_id,unit_id,label_id) values (pg_temp.id('academy'),pg_temp.id('unit'),pg_temp.id('red')) $s$, '%foreign key%');
select pg_temp.expect_error($s$ insert into public.quiz_labels(academy_id,quiz_id,label_id) values (pg_temp.id('academy'),pg_temp.id('q1'),pg_temp.id('unit-second')) $s$, '%foreign key%');

-- Student records: associations belong to the annual record; any staff member applies a desired state, one
-- label at a time and atomically; the record never changes, including when archived or in a closed year.
insert into label_ids(name) values ('next-year'),('s1'),('s2'),('s3'),('r1'),('r2'),('r3'),('r-next'),('r-other');
select pg_temp.act('owner');
set local role authenticated;
select pg_temp.check((select string_agg(name, ',' order by name) from public.labels where academy_id = pg_temp.id('academy') and domain = 'students') = 'Needs follow-up,Scholarship,Top student', 'the student catalog starts with its three defaults');
select set_config('test.r1', id::text, true) from public.create_student_record(pg_temp.id('academy'),pg_temp.id('content-year'),'Amal','01012340001','01112223333','preparatory-3',null,null,'in_person');
select set_config('test.r2', id::text, true) from public.create_student_record(pg_temp.id('academy'),pg_temp.id('content-year'),'Basma','01012340002','01112223333','preparatory-3',null,null,'in_person');
select set_config('test.r3', id::text, true) from public.create_student_record(pg_temp.id('academy'),pg_temp.id('content-year'),'Camelia','01012340003','01112223333','preparatory-3',null,null,'online_only');
select public.create_label(pg_temp.id('academy'),pg_temp.id('s1'),'Revision','red','students');
select public.create_label(pg_temp.id('academy'),pg_temp.id('s2'),'Sponsored','blue','students');
select public.create_label(pg_temp.id('academy'),pg_temp.id('s3'),'Unused here','green','students');
reset role;
select pg_temp.act('outsider');
set local role authenticated;
select set_config('test.r_other', id::text, true) from public.create_student_record(pg_temp.id('other'),pg_temp.id('other-year'),'Other student','01012340009','01112223333','preparatory-3',null,null,'in_person');
reset role;
update label_ids set id = current_setting('test.'||replace(name,'-','_'))::uuid where name in ('r1','r2','r3','r-other');
create temporary table before_students on commit drop as select id, version, updated_at, primary_group_id, archived_at, full_name from public.annual_student_records where academy_id = pg_temp.id('academy');
grant select on pg_temp.before_students to authenticated;
create function pg_temp.students(label_filter uuid[] default null, unlabeled boolean default false, year uuid default null, lim integer default 10, skip integer default 0, stat text default 'all')
returns jsonb language sql as $$
  select public.list_student_records(pg_temp.id('academy'), coalesce(year, pg_temp.id('content-year')), null, stat, null, null, null, null, '[{"id":"name","desc":false}]'::jsonb, skip, lim, label_filter, unlabeled)
$$;
create function pg_temp.student_names(page jsonb) returns text language sql as $$
  select coalesce(string_agg(e.item->>'full_name', ',' order by e.ordinality), '') from jsonb_array_elements(page->'rows') with ordinality e(item, ordinality)
$$;
select pg_temp.act('instructor');
set local role authenticated;
-- An Instructor applies and removes in bulk; duplicates collapse, repeats change nothing, other labels stay.
select pg_temp.check(public.set_student_records_label(pg_temp.id('academy'),array[pg_temp.id('r1'),pg_temp.id('r2'),pg_temp.id('r1')],pg_temp.id('s1'),true) = 2, 'bulk apply with a duplicate id');
select pg_temp.check(public.set_student_records_label(pg_temp.id('academy'),array[pg_temp.id('r1'),pg_temp.id('r2')],pg_temp.id('s1'),true) = 0, 'repeated apply changes nothing');
select pg_temp.check(public.set_student_records_label(pg_temp.id('academy'),array[pg_temp.id('r1')],pg_temp.id('s2'),true) = 1, 'a second label on one record');
select pg_temp.check(public.set_student_records_label(pg_temp.id('academy'),array[pg_temp.id('r2'),pg_temp.id('r3')],pg_temp.id('s1'),false) = 1, 'mixed removal removes only where present');
select pg_temp.check(public.set_student_records_label(pg_temp.id('academy'),array[pg_temp.id('r2'),pg_temp.id('r3')],pg_temp.id('s1'),false) = 0, 'repeated removal changes nothing');
select pg_temp.check((select count(*) from public.annual_student_record_labels where annual_student_record_id = pg_temp.id('r1')) = 2, 'removal elsewhere kept this record''s labels');
-- One invalid target rejects the whole call, and nothing else is written.
select pg_temp.expect_error($s$ select public.set_student_records_label(pg_temp.id('academy'),array[pg_temp.id('r3'),pg_temp.id('r-other')],pg_temp.id('s1'),true) $s$, 'not_found');
select pg_temp.expect_error($s$ select public.set_student_records_label(pg_temp.id('academy'),array[pg_temp.id('r3'),gen_random_uuid()],pg_temp.id('s1'),false) $s$, 'not_found');
select pg_temp.check(not exists (select 1 from public.annual_student_record_labels where annual_student_record_id = pg_temp.id('r3')), 'a rejected bulk call wrote nothing');
select pg_temp.expect_error($s$ select public.set_student_records_label(pg_temp.id('academy'),array[pg_temp.id('r3'),null],pg_temp.id('s1'),true) $s$, 'validation');
select pg_temp.expect_error($s$ select public.set_student_records_label(pg_temp.id('academy'),'{}',pg_temp.id('s1'),true) $s$, 'validation');
select pg_temp.expect_error($s$ select public.set_student_records_label(pg_temp.id('academy'),array(select gen_random_uuid() from generate_series(1,501)),pg_temp.id('s1'),true) $s$, 'validation');
-- Catalogs and academies stay apart. Removing a label of another catalog is already the desired state.
select pg_temp.expect_error($s$ select public.set_student_records_label(pg_temp.id('academy'),array[pg_temp.id('r3')],pg_temp.id('red'),true) $s$, 'label_not_found');
select pg_temp.expect_error($s$ select public.set_student_records_label(pg_temp.id('academy'),array[pg_temp.id('r3')],pg_temp.id('foreign'),true) $s$, 'label_not_found');
select pg_temp.expect_error($s$ select public.set_content_unit_label(pg_temp.id('academy'),pg_temp.id('unit'),pg_temp.id('s1'),true) $s$, 'label_not_found');
select pg_temp.check(public.set_student_records_label(pg_temp.id('academy'),array[pg_temp.id('r3')],pg_temp.id('red'),false) = 0, 'removing another catalog''s label');
-- Instructors still cannot manage definitions or write directly.
select pg_temp.expect_error($s$ select public.create_label(pg_temp.id('academy'),gen_random_uuid(),'Mine','red','students') $s$, 'forbidden');
select pg_temp.expect_error($s$ delete from public.annual_student_record_labels $s$, 'permission denied%');
-- Filters run in the database before paging: any selected label, or Unlabeled, with correct totals.
select pg_temp.check(pg_temp.students()->'rows'->0->'label_ids' @> jsonb_build_array(pg_temp.id('s1'),pg_temp.id('s2')), 'row label ids');
select pg_temp.check(pg_temp.student_names(pg_temp.students(array[pg_temp.id('s1')])) = 'Amal', 'one label');
select public.set_student_records_label(pg_temp.id('academy'),array[pg_temp.id('r2')],pg_temp.id('s2'),true);
select pg_temp.check(pg_temp.student_names(pg_temp.students(array[pg_temp.id('s1'),pg_temp.id('s2')])) = 'Amal,Basma', 'any of several, each record once');
select pg_temp.check((pg_temp.students(array[pg_temp.id('s1'),pg_temp.id('s2')])->>'total')::integer = 2, 'no duplicate totals');
select pg_temp.check(pg_temp.student_names(pg_temp.students(array[pg_temp.id('s1'),pg_temp.id('s2')], lim => 10, skip => 1)) = '' and (pg_temp.students(array[pg_temp.id('s1'),pg_temp.id('s2')], skip => 1)->>'total')::integer = 2, 'a later page keeps the matching total');
select pg_temp.check(pg_temp.student_names(public.list_student_records(pg_temp.id('academy'),pg_temp.id('content-year'),null,'all',null,null,null,'online_only',null,0,10,array[pg_temp.id('s2')],false)) = '', 'combined with other filters using AND');
select pg_temp.check(pg_temp.student_names(pg_temp.students(unlabeled => true)) = 'Camelia', 'unlabeled');
select pg_temp.check(pg_temp.student_names(pg_temp.students(array[pg_temp.id('s3')])) = '', 'an unused label matches nothing');
select pg_temp.check(pg_temp.student_names(pg_temp.students(array[gen_random_uuid()])) = '', 'a deleted or unknown label matches nothing, never everything');
select pg_temp.check(pg_temp.student_names(pg_temp.students(array[pg_temp.id('foreign')])) = '', 'another academy label matches nothing');
select pg_temp.expect_error($s$ select pg_temp.students(array[pg_temp.id('s1')], true) $s$, 'validation');
select pg_temp.expect_error($s$ select pg_temp.students(array(select gen_random_uuid() from generate_series(1,101))) $s$, 'validation');
select pg_temp.expect_error($s$ select pg_temp.students(null, null) $s$, 'validation');
-- Archived records take labels without being restored.
reset role;
select pg_temp.act('owner');
set local role authenticated;
select public.set_student_records_archived(pg_temp.id('academy'),pg_temp.id('content-year'),jsonb_build_array(jsonb_build_object('id',pg_temp.id('r3'),'version',1)),true);
reset role;
select pg_temp.act('instructor');
set local role authenticated;
select pg_temp.check(public.set_student_records_label(pg_temp.id('academy'),array[pg_temp.id('r3')],pg_temp.id('s1'),true) = 1, 'archived record takes a label');
select pg_temp.check(pg_temp.student_names(pg_temp.students(array[pg_temp.id('s1')], stat => 'archived')) = 'Camelia', 'label filter within archived records');
select pg_temp.check((select archived_at is not null from public.annual_student_records where id = pg_temp.id('r3')), 'still archived');
select pg_temp.check(not exists (select 1 from public.annual_student_records r join pg_temp.before_students b on b.id = r.id
  where r.id <> pg_temp.id('r3') and (r.version, r.updated_at, r.primary_group_id, r.archived_at, r.full_name) is distinct from (b.version, b.updated_at, b.primary_group_id, b.archived_at, b.full_name)), 'labels changed no record');
select pg_temp.check((select version from public.annual_student_records where id = pg_temp.id('r3')) = 2, 'labelling did not bump the archived record');
reset role;
-- Annual ownership: the next year's record of the same profile starts unlabeled, and closed-year records still take labels.
update public.academic_years set closed_at = now() where id = pg_temp.id('content-year');
insert into public.academic_years(id,academy_id,start_year)
  select pg_temp.id('next-year'),pg_temp.id('academy'),max(start_year)+1 from public.academic_years where academy_id=pg_temp.id('academy');
insert into public.annual_student_records(id,academy_id,academic_year_id,academy_student_profile_id,full_name,student_phone,parent_phone,level_id,participation_type,created_by)
  select pg_temp.id('r-next'),academy_id,pg_temp.id('next-year'),academy_student_profile_id,full_name,student_phone,parent_phone,level_id,participation_type,pg_temp.id('owner')
  from public.annual_student_records where id = pg_temp.id('r1');
select pg_temp.act('instructor');
set local role authenticated;
select pg_temp.check(pg_temp.student_names(pg_temp.students(unlabeled => true, year => pg_temp.id('next-year'))) = 'Amal', 'a new annual record starts unlabeled');
select pg_temp.check(pg_temp.student_names(pg_temp.students(array[pg_temp.id('s1')], year => pg_temp.id('next-year'))) = '', 'another year''s association does not match');
select pg_temp.check(public.set_student_records_label(pg_temp.id('academy'),array[pg_temp.id('r-next')],pg_temp.id('s3'),true) = 1, 'the catalog spans years');
select pg_temp.check(public.set_student_records_label(pg_temp.id('academy'),array[pg_temp.id('r1')],pg_temp.id('s3'),true) = 1, 'closed-year record takes a label');
select pg_temp.check(public.set_student_records_label(pg_temp.id('academy'),array[pg_temp.id('r2')],pg_temp.id('s2'),false) = 1, 'closed-year record loses a label');
select pg_temp.check((select count(*) from public.annual_student_record_labels where annual_student_record_id = pg_temp.id('r-next')) = 1, 'each year keeps its own labels');
select pg_temp.expect_error($s$ select public.update_student_record(pg_temp.id('r1'),1,pg_temp.id('academy'),'Renamed','01012340001','01112223333','preparatory-3',null,null,'in_person') $s$, 'year_unavailable');
select pg_temp.check((select version from public.annual_student_records where id = pg_temp.id('r1')) = 1, 'closed-year labelling left the version alone');
reset role;
-- Deletion counts uses across years and archive states, then removes only associations.
select pg_temp.act('admin');
set local role authenticated;
select pg_temp.check(public.delete_label(pg_temp.id('academy'),pg_temp.id('s3'),false) = '{"status":"confirm","uses":2}'::jsonb, 'uses counted across years');
select pg_temp.check(public.delete_label(pg_temp.id('academy'),pg_temp.id('s1'),false) = '{"status":"confirm","uses":2}'::jsonb, 'an archived record counts as a use');
select pg_temp.check(public.delete_label(pg_temp.id('academy'),pg_temp.id('s3'),true) = '{"status":"deleted","uses":2}'::jsonb, 'confirmed delete');
select pg_temp.check(not exists (select 1 from public.annual_student_record_labels where label_id = pg_temp.id('s3'))
  and (select count(*) from public.annual_student_records where id in (pg_temp.id('r1'),pg_temp.id('r-next'))) = 2, 'delete removes the uses, not the records');
select pg_temp.check(public.set_student_records_label(pg_temp.id('academy'),array[pg_temp.id('r1')],pg_temp.id('s3'),false) = 0, 'removing a deleted label is already done');
select pg_temp.expect_error($s$ select public.set_student_records_label(pg_temp.id('academy'),array[pg_temp.id('r1')],pg_temp.id('s3'),true) $s$, 'label_not_found');
reset role;
select pg_temp.expect_error($s$ insert into public.annual_student_record_labels(academy_id,annual_student_record_id,label_id) values (pg_temp.id('academy'),pg_temp.id('r1'),pg_temp.id('red')) $s$, '%foreign key%');
select pg_temp.expect_error($s$ insert into public.annual_student_record_labels(academy_id,annual_student_record_id,label_id) values (pg_temp.id('other'),pg_temp.id('r1'),pg_temp.id('foreign')) $s$, '%foreign key%');

-- Assessments, versions and the academic record were never touched by any label change.
select pg_temp.check(not exists (
  select 1 from pg_temp.before_records b
  where not exists (
    select 1 from public.quizzes q where b.type = 'quiz' and q.id = b.id and q.version = b.version and q.title = b.title and q.updated_at = b.updated_at
    union all select 1 from public.exams x where b.type = 'exam' and x.id = b.id and x.version = b.version and x.title = b.title and x.updated_at = b.updated_at
    union all select 1 from public.assignments a where b.type = 'assignment' and a.id = b.id and a.version = b.version and a.title = b.title and a.updated_at = b.updated_at)), 'assessments unchanged');
select pg_temp.check((select count(*) from pg_temp.before_records) = 4, 'every assessment kept');

rollback;
