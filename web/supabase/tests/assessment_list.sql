-- Staff Assessments list (list_assessments): mixed-type ordering, totals, paging, filters, archive,
-- validation and academy authority. All fixtures roll back.
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
begin if ok is not true then raise exception 'Assessment list check failed: %', label; end if; end $$;
create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$
begin
  execute statement;
  raise exception 'Expected rejection: %', expected using errcode = 'XX001';
exception when sqlstate 'XX001' then raise;
  when others then if sqlerrm not like expected then raise exception 'Expected %, got %', expected, sqlerrm; end if;
end $$;
create temporary table list_ids(name text primary key, id uuid not null default gen_random_uuid());
insert into list_ids(name) values ('owner'),('outsider'),('academy'),('other'),('a1'),('a2'),('q1'),('q2'),('x1'),('xo'),('group');
grant select on pg_temp.list_ids to authenticated;
create function pg_temp.id(label text) returns uuid language sql as $$ select id from pg_temp.list_ids where name=label $$;
create function pg_temp.act(label text) returns void language sql as $$ select set_config('request.jwt.claim.sub',pg_temp.id(label)::text,true) $$;

do $$
begin
  if not has_function_privilege('authenticated', 'public.list_assessments(uuid, uuid, text[], text, text, text, uuid, uuid, text[], text, text, integer, integer)', 'execute')
    or has_function_privilege('anon', 'public.list_assessments(uuid, uuid, text[], text, text, text, uuid, uuid, text[], text, text, integer, integer)', 'execute') then
    raise exception 'Assessment list check failed: grants';
  end if;
end $$;

insert into auth.users(id) select id from list_ids where name in ('owner','outsider');
insert into public.academies(id,name,slug,icon,subject,created_by) values
 (pg_temp.id('academy'),'List fixture','list-'||pg_temp.id('academy'),'school','Math',pg_temp.id('owner')),
 (pg_temp.id('other'),'Other list fixture','list-'||pg_temp.id('other'),'school','Math',pg_temp.id('outsider'));
insert into public.academy_memberships(academy_id,user_id,role,created_by) values
 (pg_temp.id('academy'),pg_temp.id('owner'),'owner',pg_temp.id('owner')),
 (pg_temp.id('other'),pg_temp.id('outsider'),'owner',pg_temp.id('outsider'));
insert into list_ids(name,id) select 'year',id from public.academic_years where academy_id=pg_temp.id('academy');
insert into list_ids(name,id) select 'other-year',id from public.academic_years where academy_id=pg_temp.id('other');
insert into public.academy_levels(academy_id,level_id,sort_order) values(pg_temp.id('academy'),'preparatory-3',9);

create function pg_temp.assignment(title text) returns jsonb language sql as $$
  select jsonb_build_object('title',title,'instructions','','due_at',null,'audience','level','level_id','preparatory-3',
    'parts','[{"title":"A","kind":"file_upload","questions":[{"max_score":"10"}]}]'::jsonb)
$$;
select pg_temp.act('owner');
set local role authenticated;
select public.create_assignment(pg_temp.id('academy'),pg_temp.id('year'),pg_temp.id('a1'),pg_temp.assignment('Beta homework'));
select public.create_assignment(pg_temp.id('academy'),pg_temp.id('year'),pg_temp.id('a2'),pg_temp.assignment('delta homework'));
select public.create_quiz(pg_temp.id('academy'),pg_temp.id('year'),pg_temp.id('q1'),'{"title":"Alpha quiz","instructions":"","parts":[]}');
select public.create_quiz(pg_temp.id('academy'),pg_temp.id('year'),pg_temp.id('q2'),'{"title":"Archived quiz","instructions":"","parts":[]}');
select public.create_exam(pg_temp.id('academy'),pg_temp.id('year'),pg_temp.id('x1'),'{"title":"Charlie exam","instructions":"","parts":[]}');
reset role;
select pg_temp.act('outsider');
set local role authenticated;
select public.create_exam(pg_temp.id('other'),pg_temp.id('other-year'),pg_temp.id('xo'),'{"title":"Other exam","instructions":"","parts":[]}');
reset role;

-- Distinct creation times (newest first: x1, a2, q1, a1, q2), set without firing update guards.
set local session_replication_role = replica;
update public.assignments set created_at = now() - interval '4 hours' where id = pg_temp.id('a1');
update public.assignments set created_at = now() - interval '2 hours' where id = pg_temp.id('a2');
update public.quizzes set created_at = now() - interval '3 hours' where id = pg_temp.id('q1');
update public.quizzes set created_at = now() - interval '5 hours' where id = pg_temp.id('q2');
update public.exams set created_at = now() - interval '1 hour' where id = pg_temp.id('x1');
-- q1 targets a group in preparatory-3; set directly, like the creation times.
insert into public.groups(id, academy_id, academic_year_id, level_id, name)
values (pg_temp.id('group'), pg_temp.id('academy'), pg_temp.id('year'), 'preparatory-3', 'Group A');
update public.quizzes set audience = 'groups', level_id = null, track_id = null where id = pg_temp.id('q1');
insert into public.quiz_audience_groups(quiz_id, academy_id, academic_year_id, group_id)
values (pg_temp.id('q1'), pg_temp.id('academy'), pg_temp.id('year'), pg_temp.id('group'));
set local session_replication_role = origin;

select pg_temp.act('owner');
set local role authenticated;
select public.archive_quiz(pg_temp.id('academy'), pg_temp.id('q2'), (public.get_quiz(pg_temp.id('academy'), pg_temp.id('q2'))->>'version')::integer);

-- Every type:status key; `archived` adds the archived ones to the default selection unless `statuses` is given.
create function pg_temp.all_statuses() returns text[] language sql as $$ select array[
  'assignment:active','assignment:closed','assignment:archived',
  'quiz:preparing','quiz:ready','quiz:scheduled','quiz:open','quiz:headroom','quiz:closed','quiz:archived',
  'exam:preparing','exam:ready','exam:scheduled','exam:open','exam:headroom','exam:closed','exam:archived'] $$;
create function pg_temp.list(types text[] default array['assignment','quiz','exam'], search text default '', audience text default null,
  archived boolean default false, sort text default 'newest', lim integer default 25, skip integer default 0, year uuid default pg_temp.id('year'),
  statuses text[] default null, grp text default 'none', level text default null, track uuid default null, grp_id uuid default null)
returns jsonb language sql as $$
  select public.list_assessments(pg_temp.id('academy'), year, types, search, audience, level, track, grp_id,
    coalesce(statuses, array(select k from unnest(pg_temp.all_statuses()) k where archived or k not like '%:archived')), sort, grp, lim, skip)
$$;
create function pg_temp.order_of(page jsonb) returns text language sql as $$
  select coalesce(string_agg(n.name, ',' order by e.ordinality), '')
  from jsonb_array_elements(page->'items') with ordinality e(item, ordinality)
  join pg_temp.list_ids n on n.id = (e.item->>'id')::uuid
$$;

-- Global newest-first order across types, totals, and the archived quiz hidden by default.
select pg_temp.check(pg_temp.order_of(pg_temp.list()) = 'x1,a2,q1,a1', 'mixed newest order: '||pg_temp.order_of(pg_temp.list()));
select pg_temp.check((pg_temp.list()->>'total')::integer = 4, 'total without archived');
-- Paging slices the one combined order; totals stay global.
select pg_temp.check(pg_temp.order_of(pg_temp.list(lim => 2, skip => 0)) = 'x1,a2', 'page 1');
select pg_temp.check(pg_temp.order_of(pg_temp.list(lim => 2, skip => 2)) = 'q1,a1', 'page 2');
select pg_temp.check((pg_temp.list(lim => 2, skip => 2)->>'total')::integer = 4, 'page 2 total');
select pg_temp.check(pg_temp.order_of(pg_temp.list(lim => 2, skip => 4)) = '', 'past the end');
-- Archive inclusion keeps native status.
select pg_temp.check(pg_temp.order_of(pg_temp.list(archived => true)) = 'x1,a2,q1,a1,q2', 'with archived');
select pg_temp.check(pg_temp.list(archived => true)->'items'->4->>'status' = 'archived', 'quiz archived phase');
select pg_temp.check(pg_temp.list()->'items'->1->>'type' = 'assignment' and pg_temp.list()->'items'->1->>'status' = 'active', 'assignment state');
select pg_temp.check(pg_temp.list()->'items'->1->>'max_score' = '10.00' or pg_temp.list()->'items'->1->>'max_score' = '10', 'assignment max');
-- Marked and audience counts are present for every type; this academy has no students yet.
select pg_temp.check((select bool_and((i->>'marked_count')::integer = 0 and (i->>'audience_count')::integer = 0)
  from jsonb_array_elements(pg_temp.list(archived => true)->'items') i), 'zero marked and audience counts');
-- Parts arrive in order with their kind; preparing quizzes and exams may have none.
select pg_temp.check(pg_temp.list()->'items'->1->'parts' = '[{"title":"A","kind":"file_upload"}]'::jsonb, 'assignment parts');
select pg_temp.check(pg_temp.list()->'items'->0->'parts' = '[]'::jsonb, 'exam without parts');
-- Type, search, audience and year filters.
select pg_temp.check(pg_temp.order_of(pg_temp.list(types => array['quiz'], archived => true)) = 'q1,q2', 'quiz only');
select pg_temp.check(pg_temp.order_of(pg_temp.list(types => array['assignment','exam'])) = 'x1,a2,a1', 'assignments and exams');
select pg_temp.check(pg_temp.order_of(pg_temp.list(search => ' HOMEWORK ')) = 'a2,a1', 'case-insensitive title search');
select pg_temp.check(pg_temp.order_of(pg_temp.list(audience => 'level')) = 'a2,a1', 'audience category');
select pg_temp.check(pg_temp.order_of(pg_temp.list(audience => 'groups')) = 'q1', 'group audiences');
select pg_temp.check(pg_temp.order_of(pg_temp.list(audience => 'program')) = 'a2,a1', 'program-wide includes whole-level audiences');
select pg_temp.check(pg_temp.order_of(pg_temp.list(year => null)) = 'x1,a2,q1,a1', 'all years');
select pg_temp.check((pg_temp.list(year => pg_temp.id('other-year'))->>'total')::integer = 0, 'other academy year has nothing here');
-- Title order is case-insensitive with deterministic ties.
select pg_temp.check(pg_temp.order_of(pg_temp.list(sort => 'title')) = 'q1,a1,x1,a2', 'title order');
-- Status selection is by type and status; one type's status never selects another's.
select pg_temp.check(pg_temp.order_of(pg_temp.list(statuses => array['quiz:archived'])) = 'q2', 'only archived quizzes');
select pg_temp.check(pg_temp.order_of(pg_temp.list(statuses => array['assignment:active','exam:preparing'])) = 'x1,a2,a1', 'chosen statuses');
select pg_temp.check(pg_temp.order_of(pg_temp.list(statuses => array['assignment:closed'])) = '', 'no closed assignments');
select pg_temp.check((pg_temp.list(statuses => array[]::text[])->>'total')::integer = 0, 'no statuses, no rows');
-- Grouping keeps groups contiguous: by type, or by status word across every type.
select pg_temp.check(pg_temp.order_of(pg_temp.list(grp => 'type')) = 'a2,a1,q1,x1', 'grouped by type');
select pg_temp.check(pg_temp.order_of(pg_temp.list(grp => 'status', archived => true)) = 'x1,q1,a2,a1,q2', 'grouped by status across types');
select pg_temp.check(pg_temp.order_of(pg_temp.list(grp => 'type', lim => 2, skip => 2)) = 'q1,x1', 'grouped paging');
select pg_temp.check(pg_temp.order_of(pg_temp.list(grp => 'type', sort => 'title')) = 'a1,a2,q1,x1', 'title order within groups');
-- Level matches program audiences of that level and group audiences with a group in it; track and group narrow.
select pg_temp.check(pg_temp.order_of(pg_temp.list(level => 'preparatory-3')) = 'a2,q1,a1', 'level filter');
select pg_temp.check(pg_temp.order_of(pg_temp.list(level => 'secondary-1')) = '', 'other level');
select pg_temp.check(pg_temp.order_of(pg_temp.list(grp_id => pg_temp.id('group'))) = 'q1', 'group filter');
select pg_temp.check(pg_temp.order_of(pg_temp.list(grp_id => gen_random_uuid())) = '', 'unknown group');
select pg_temp.check(pg_temp.order_of(pg_temp.list(track => gen_random_uuid())) = '', 'track filter');
-- Invalid input.
select pg_temp.expect_error($s$ select pg_temp.list(types => array['homework']) $s$, 'validation');
select pg_temp.expect_error($s$ select pg_temp.list(types => array[]::text[]) $s$, 'validation');
select pg_temp.expect_error($s$ select pg_temp.list(sort => 'oldest') $s$, 'validation');
select pg_temp.expect_error($s$ select pg_temp.list(audience => 'everyone') $s$, 'validation');
select pg_temp.expect_error($s$ select pg_temp.list(lim => 101) $s$, 'validation');
select pg_temp.expect_error($s$ select pg_temp.list(statuses => array['quiz:active']) $s$, 'validation');
select pg_temp.expect_error($s$ select pg_temp.list(grp => 'audience') $s$, 'validation');

-- Another academy's owner and a signed-out caller get nothing; the other academy's exam never leaks.
select pg_temp.act('outsider');
select pg_temp.check(pg_temp.list() is null, 'cross-academy denied');
select pg_temp.check(public.list_assessments(pg_temp.id('other'), null, array['exam'], '', null, null, null, null, array['exam:preparing'], 'newest', 'none', 25, 0)->'items'->0->>'id' = pg_temp.id('xo')::text, 'own academy works');
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.check(pg_temp.list() is null, 'signed out denied');
reset role;

-- Settings saves combine preparation and availability atomically using the existing commands.
create function pg_temp.settings_draft() returns jsonb language sql as $$
  select '{"title":"Settings saved","audience":"level","level_id":"preparatory-3","time_limit_minutes":20,
    "parts":[{"title":"Written","kind":"written_work","questions":[{"prompt":"Explain","max_score":"2"}]}]}'::jsonb
$$;
create function pg_temp.settings(kind text, target uuid, version integer, draft jsonb, opens timestamptz, closes timestamptz)
returns jsonb language plpgsql as $$
begin
  if kind = 'quiz' then return public.save_quiz_settings(pg_temp.id('academy'), target, version, draft, opens, closes); end if;
  return public.save_exam_settings(pg_temp.id('academy'), target, version, draft, opens, closes);
end $$;
create function pg_temp.settings_record(kind text, target uuid) returns jsonb language plpgsql as $$
begin
  if kind = 'quiz' then return public.get_quiz(pg_temp.id('academy'), target); end if;
  return public.get_exam(pg_temp.id('academy'), target);
end $$;

select pg_temp.check(not has_function_privilege('anon', 'public.save_quiz_settings(uuid,uuid,integer,jsonb,timestamptz,timestamptz)', 'execute'), 'quiz settings anon grant');
select pg_temp.check(not has_function_privilege('anon', 'public.save_exam_settings(uuid,uuid,integer,jsonb,timestamptz,timestamptz)', 'execute'), 'exam settings anon grant');
select pg_temp.act('outsider');
set local role authenticated;
select pg_temp.expect_error($s$ select pg_temp.settings('quiz',pg_temp.id('q1'),1,pg_temp.settings_draft(),now()+interval '1 day',now()+interval '2 days') $s$, 'forbidden');
select pg_temp.expect_error($s$ select pg_temp.settings('exam',pg_temp.id('x1'),1,pg_temp.settings_draft(),now()+interval '1 day',now()+interval '2 days') $s$, 'forbidden');
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.expect_error($s$ select pg_temp.settings('quiz',pg_temp.id('q1'),1,pg_temp.settings_draft(),null,null) $s$, 'forbidden');
reset role;
select pg_temp.act('owner');
set local role authenticated;
do $$ declare kind text; target uuid; before jsonb; after jsonb; saved jsonb; version integer; begin
  foreach kind in array array['quiz','exam'] loop
    target := case kind when 'quiz' then pg_temp.id('q1') else pg_temp.id('x1') end;
    before := pg_temp.settings_record(kind,target);
    version := (before->>'version')::integer;
    begin
      perform pg_temp.settings(kind,target,version,pg_temp.settings_draft(),now()+interval '2 days',now()+interval '1 day');
      raise exception 'Invalid window accepted' using errcode='XX001';
    exception when sqlstate 'P0001' then if sqlerrm <> 'validation' then raise; end if; end;
    after := pg_temp.settings_record(kind,target);
    perform pg_temp.check(after->>'version'=before->>'version' and after->>'title'=before->>'title' and after->'parts'=before->'parts',kind||' failed window rolls back preparation');
    saved := pg_temp.settings(kind,target,version,pg_temp.settings_draft(),now()+interval '1 day',now()+interval '2 days');
    perform pg_temp.check(saved->>'title'='Settings saved' and (saved->>'version')::integer=version+2 and saved->>'opens_at' is not null,kind||' details and window saved together');
    begin
      perform pg_temp.settings(kind,target,version,pg_temp.settings_draft(),null,null);
      raise exception 'Stale settings accepted' using errcode='XX001';
    exception when sqlstate 'P0001' then if sqlerrm <> kind||'_conflict' then raise; end if; end;
  end loop;
end $$;
reset role;
-- An instructor may prepare either type but cannot change availability; the whole save rolls back.
select pg_temp.act('owner');
insert into public.academy_memberships(academy_id,user_id,role,created_by)
values(pg_temp.id('academy'),pg_temp.id('outsider'),'instructor',pg_temp.id('owner'));
select pg_temp.act('outsider');
set local role authenticated;
do $$ declare kind text; target uuid; before jsonb; after jsonb; begin
  foreach kind in array array['quiz','exam'] loop
    target := case kind when 'quiz' then pg_temp.id('q1') else pg_temp.id('x1') end;
    before := pg_temp.settings_record(kind,target);
    begin
      perform pg_temp.settings(kind,target,(before->>'version')::integer,jsonb_set(pg_temp.settings_draft(),'{title}','"Instructor edit"'),now()+interval '1 day',now()+interval '3 days');
      raise exception 'Instructor changed window' using errcode='XX001';
    exception when sqlstate 'P0001' then if sqlerrm <> 'forbidden' then raise; end if; end;
    after := pg_temp.settings_record(kind,target);
    perform pg_temp.check(after->>'version'=before->>'version' and after->>'title'=before->>'title',kind||' instructor save rolled back');
  end loop;
end $$;
reset role;

rollback;
