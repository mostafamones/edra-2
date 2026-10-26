-- Egyptian level catalog: six selectable levels, legacy rows kept as non-selectable history, and
-- guards that stop legacy ids from being written again.
-- Run with `npm run test:db` against the disposable GitHub Actions database (see docs/engineering.md).
-- Everything runs in one transaction that is rolled back.

begin;

-- Fixture years start student learning when created; preparation is covered by student_booking.sql.
create function public.edra_test_start_fixture_year() returns trigger language plpgsql as $fixture$
begin
  new.student_learning_started_at := coalesce(new.student_learning_started_at, now());
  new.student_learning_start_source := coalesce(new.student_learning_start_source, 'legacy');
  return new;
end $fixture$;
create trigger edra_test_fixture_year_started before insert on public.academic_years
for each row execute function public.edra_test_start_fixture_year();

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

do $$
begin
  if (select array_agg(id order by sort_order) from public.global_levels where selectable)
     <> array['preparatory-1','preparatory-2','preparatory-3','secondary-1','secondary-2','secondary-3'] then
    raise exception 'the selectable catalog is not the six Egyptian levels in order';
  end if;
  if (select count(*) from public.global_levels where not selectable and replaced_by is not null) <> 4 then
    raise exception 'expected four legacy rows pointing at their replacement';
  end if;
  if (select array_agg(replaced_by order by id) from public.global_levels where not selectable)
     <> array['secondary-1','secondary-2','secondary-3','preparatory-3'] then
    raise exception 'legacy rows map to the wrong replacements';
  end if;
  if exists (select 1 from public.global_levels where selectable and replaced_by is not null) then
    raise exception 'a selectable level must not be replaced';
  end if;
end $$;

insert into auth.users (id) values ('c1111111-1111-4111-8111-c11111111111');
insert into public.academies (id, name, slug, icon, subject, created_by) values
  ('c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0', 'Academy C', 'academy-lc-c', 'school', 'Math', 'c1111111-1111-4111-8111-c11111111111');

insert into public.academy_levels (academy_id, level_id, sort_order)
select 'c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0', id, sort_order from public.global_levels where selectable;

select pg_temp.expect_error(
  $$insert into public.academy_levels (academy_id, level_id, sort_order) values ('c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0', 'grade-9', 20)$$,
  '%');

do $$
begin
  if (select count(*) from public.academy_levels where academy_id = 'c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0') <> 6 then
    raise exception 'the academy should offer exactly the six selectable levels';
  end if;
end $$;

rollback;
