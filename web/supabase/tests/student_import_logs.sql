-- Import numbering, staff snapshots, atomic entry removal and tenant isolation.
-- Run with `npm run test:db` against the marked isolated test target (see docs/engineering.md).
-- Everything runs in one transaction that is rolled back.
begin;

create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$
begin
  execute statement;
  raise exception 'expected error "%" but the statement succeeded: %', expected, statement using errcode = 'XX001';
exception
  when sqlstate 'XX001' then raise;
  when others then
    if sqlerrm not like expected then
      raise exception 'expected error "%" but got "%": %', expected, sqlerrm, statement;
    end if;
end;
$$;

-- Fails unless the row's status (and optionally the issue codes, as "field:code" text) match.
create function pg_temp.expect_row(p_ordinal integer, p_status text, p_issues text[] default null) returns void language plpgsql as $$
declare r public.student_import_rows%rowtype; codes text[];
begin
  select * into r from public.student_import_rows where session_id = current_setting('test.s1')::uuid and ordinal = p_ordinal;
  select coalesce(array_agg((i ->> 'field') || ':' || (i ->> 'code') order by (i ->> 'field'), (i ->> 'code')), '{}')
  into codes from jsonb_array_elements(r.issues) i;
  if r.status is distinct from p_status or (p_issues is not null and codes <> p_issues) then
    raise exception 'row % expected % % but was % % (%)', p_ordinal, p_status, p_issues, r.status, codes, r.input;
  end if;
end;
$$;

insert into auth.users (id) values
  ('71111111-1111-4111-8111-111111111111'),  -- owner of G
  ('72222222-2222-4222-8222-222222222222'),  -- admin of G
  ('73333333-3333-4333-8333-333333333333'),  -- instructor of G
  ('74444444-4444-4444-8444-444444444444'),  -- owner of H
  ('75555555-5555-4555-8555-555555555555');  -- no membership

insert into public.academies (id, name, slug, icon, subject, created_by) values
  ('77777777-7777-4777-8777-777777777777', 'Academy G', 'academy-g', 'school', 'Math', '71111111-1111-4111-8111-111111111111'),
  ('78888888-8888-4888-8888-888888888888', 'Academy H', 'academy-h', 'school', 'Math', '74444444-4444-4444-8444-444444444444');
update public.academic_years set id = '77777777-1111-4111-8111-777777777777', start_year = 2030
where academy_id = '77777777-7777-4777-8777-777777777777';
update public.academic_years set id = '78888888-1111-4111-8111-888888888888', start_year = 2030
where academy_id = '78888888-8888-4888-8888-888888888888';
insert into public.academy_memberships (academy_id, user_id, role, created_by) values
  ('77777777-7777-4777-8777-777777777777', '71111111-1111-4111-8111-111111111111', 'owner', '71111111-1111-4111-8111-111111111111'),
  ('77777777-7777-4777-8777-777777777777', '72222222-2222-4222-8222-222222222222', 'admin', '71111111-1111-4111-8111-111111111111'),
  ('77777777-7777-4777-8777-777777777777', '73333333-3333-4333-8333-333333333333', 'instructor', '71111111-1111-4111-8111-111111111111'),
  ('78888888-8888-4888-8888-888888888888', '74444444-4444-4444-8444-444444444444', 'owner', '74444444-4444-4444-8444-444444444444');

insert into public.academy_levels (academy_id, level_id, sort_order) values
  ('77777777-7777-4777-8777-777777777777', 'preparatory-3', 9),
  ('77777777-7777-4777-8777-777777777777', 'secondary-2', 11),
  ('78888888-8888-4888-8888-888888888888', 'preparatory-3', 9);
insert into public.academy_tracks (id, academy_id, level_id, name, sort_order) values
  ('7a111111-1111-4111-8111-111111111111', '77777777-7777-4777-8777-777777777777', 'secondary-2', 'Science', 1),
  ('7a222222-2222-4222-8222-222222222222', '77777777-7777-4777-8777-777777777777', 'secondary-2', 'Dup', 2),
  -- Distinct under the name index, but identical after the importer's NFKC normalization.
  ('7a333333-3333-4333-8333-333333333333', '77777777-7777-4777-8777-777777777777', 'secondary-2', 'ｄｕｐ', 3);
insert into public.groups (id, academy_id, academic_year_id, level_id, track_id, name) values
  ('7b111111-1111-4111-8111-111111111111', '77777777-7777-4777-8777-777777777777', '77777777-1111-4111-8111-777777777777', 'preparatory-3', null, 'Nine A'),
  ('7b222222-2222-4222-8222-222222222222', '77777777-7777-4777-8777-777777777777', '77777777-1111-4111-8111-777777777777', 'preparatory-3', null, 'Nine B'),
  ('7b333333-3333-4333-8333-333333333333', '77777777-7777-4777-8777-777777777777', '77777777-1111-4111-8111-777777777777', 'secondary-2', '7a111111-1111-4111-8111-111111111111', 'Science A'),
  ('7b444444-4444-4444-8444-444444444444', '77777777-7777-4777-8777-777777777777', '77777777-1111-4111-8111-777777777777', 'preparatory-3', null, 'Nine archived'),
  ('7b555555-5555-4555-8555-555555555555', '78888888-8888-4888-8888-888888888888', '78888888-1111-4111-8111-888888888888', 'preparatory-3', null, 'H group');
update public.groups set archived_at = now() where id = '7b444444-4444-4444-8444-444444444444';

grant usage on schema public, auth to authenticated, anon;

reset role;
update public.profiles set full_name = 'Import Admin' where id = '72222222-2222-4222-8222-222222222222';
set local role authenticated;
set local request.jwt.claim.sub = '72222222-2222-4222-8222-222222222222';
select set_config('test.log', public.start_student_import('77777777-7777-4777-8777-777777777777', '77777777-1111-4111-8111-777777777777', 'log.csv', 'csv', null, 3, '{}', null)::text, true);
select set_config('test.log2', public.start_student_import('77777777-7777-4777-8777-777777777777', '77777777-1111-4111-8111-777777777777', 'second.csv', 'csv', null, 1, '{}', null)::text, true);
do $$ begin
  if (select import_number from public.student_import_sessions where id = current_setting('test.log')::uuid) <> 1
    or (select import_number from public.student_import_sessions where id = current_setting('test.log2')::uuid) <> 2 then
    raise exception 'Import numbering did not start at 1 and increment';
  end if;
end $$;
reset role;
update public.profiles set full_name = 'Renamed Admin' where id = '72222222-2222-4222-8222-222222222222';
set local role authenticated;
set local request.jwt.claim.sub = '72222222-2222-4222-8222-222222222222';
do $$ begin
  if public.student_import_summary(current_setting('test.log')::uuid)->>'imported_by_name' <> 'Import Admin' then
    raise exception 'Log did not preserve original staff name';
  end if;
end $$;
select public.stage_student_import_rows(current_setting('test.log')::uuid, '[
  {"ordinal":1,"source_row":2,"values":{"full_name":"Example","student_phone":"01000000601","parent_phone":"01200000600","level":"preparatory-3","student_type":"in_person"}},
  {"ordinal":2,"source_row":3,"values":{"full_name":"Example duplicate","student_phone":"01000000601","parent_phone":"01200000600","level":"preparatory-3","student_type":"in_person"}},
  {"ordinal":3,"source_row":4,"values":{"full_name":"Example third","student_phone":"01000000603","parent_phone":"01200000600","level":"preparatory-3","student_type":"in_person"}}
]');
select set_config('test.revision', public.finalize_student_import(current_setting('test.log')::uuid)::text, true);
select pg_temp.expect_error(format('select public.remove_student_import_entries(%L, 999, array[2])',current_setting('test.log')), 'stale_revision');
select pg_temp.expect_error(format('select public.remove_student_import_entries(%L, %s, array[2,999])',current_setting('test.log'),current_setting('test.revision')), 'not_found');
select pg_temp.expect_error(format('select public.remove_student_import_entries(%L, %s, array[2,2])',current_setting('test.log'),current_setting('test.revision')), 'validation');
do $$ begin
  if exists(select 1 from public.student_import_rows where session_id=current_setting('test.log')::uuid and excluded) then
    raise exception 'Rejected removal changed rows';
  end if;
end $$;
select public.remove_student_import_entries(current_setting('test.log')::uuid,current_setting('test.revision')::integer,array[2,3]);
do $$ begin
  if (public.list_student_import_rows(current_setting('test.log')::uuid,'entries',null,0,20)->>'total')::integer <> 1
    or (public.list_student_import_rows(current_setting('test.log')::uuid,null,null,0,20)->>'total')::integer <> 3
    or public.student_import_summary(current_setting('test.log')::uuid)->'counts'->>'ready' <> '1' then
    raise exception 'Removal did not preserve log rows or revalidate remaining duplicates';
  end if;
end $$;
set local request.jwt.claim.sub = '71111111-1111-4111-8111-111111111111';
select pg_temp.expect_error(format('select public.remove_student_import_entries(%L, 3, array[1])',current_setting('test.log')), 'not_found');
set local request.jwt.claim.sub = '73333333-3333-4333-8333-333333333333';
select pg_temp.expect_error(format('select public.remove_student_import_entries(%L, 3, array[1])',current_setting('test.log')), 'not_found');
do $$ begin
  if public.student_import_summary(current_setting('test.log')::uuid) is not null then raise exception 'Instructor could read log'; end if;
end $$;
set local request.jwt.claim.sub = '74444444-4444-4444-8444-444444444444';
select pg_temp.expect_error(format('select public.remove_student_import_entries(%L, 3, array[1])',current_setting('test.log')), 'not_found');
do $$ begin
  if public.student_import_summary(current_setting('test.log')::uuid) is not null then raise exception 'Cross-academy log leaked'; end if;
end $$;
select set_config('test.otherlog', public.start_student_import('78888888-8888-4888-8888-888888888888','78888888-1111-4111-8111-888888888888','other.csv','csv',null,1,'{}',null)::text,true);
do $$ begin
  if (select import_number from public.student_import_sessions where id=current_setting('test.otherlog')::uuid) <> 1 then raise exception 'Numbers not scoped to academy'; end if;
end $$;
reset role;
do $$ begin
  if has_table_privilege('authenticated','public.student_import_counters','select')
    or has_table_privilege('authenticated','public.student_import_counters','update')
    or has_function_privilege('anon','public.remove_student_import_entries(uuid,integer,integer[])','execute') then raise exception 'Log grants expose private counter or mutations'; end if;
end $$;
rollback;
