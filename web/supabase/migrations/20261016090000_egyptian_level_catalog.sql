-- Egyptian level catalog. Replaces the development Grade 9-12 catalog with the six approved levels
-- and converts every persisted reference to its approved replacement:
--
--   grade-9  -> preparatory-3   grade-10 -> secondary-1   grade-11 -> secondary-2   grade-12 -> secondary-3
--
-- preparatory-1 and preparatory-2 are new catalog entries. No academy offers them automatically.
--
-- Design (resolved from the actual constraints; see docs/engineering notes in the module README):
--  * Every converted table keeps its rows, ownership, year, group/track membership, scores and issued
--    code strings. Only the level_id value changes; a before/after digest of every other column is
--    verified inside the transaction and the migration aborts (rolling everything back) on any drift.
--  * Retaining legacy academy_levels rows is not viable: tracks, groups, schedules, records and
--    assessments reference (academy_id, level_id, track_id), and check-in compares a record's level to
--    its issued code's level. A partly converted academy would break those references. All academy
--    placements are therefore converted, including closed-year and archived history.
--  * That conversion must touch rows protected by history guards. Only the named guard and
--    updated_at triggers below are disabled, inside this transaction, for statements that assign
--    level_id and nothing else, and they are re-enabled and verified before the migration ends. No
--    trigger is disabled on sessions or session_roster_entries: they are immutable attendance snapshots
--    with no foreign key to the catalog, so they keep their stored legacy level_id.
--  * The four legacy global_levels rows are retained as non-selectable history entries so joins that
--    name a snapshot's level keep working. They carry the replacement level's name. Selection and new
--    writes exclude them (selectable = false, plus a guard trigger on academy_levels and student_profiles).
--  * Foreign keys to academy_levels/academy_tracks are made deferrable only for the conversion, checked
--    with SET CONSTRAINTS IMMEDIATE, and restored to non-deferrable.
--  * Unfinished imports (staging, reviewing, importing, blocked) have their defaults, staged inputs and
--    corrections converted; completed and cancelled imports remain logs and are not rewritten.
--
-- Rollback: before new records use the new levels, reverse the mapping with the same procedure
-- (new id -> legacy id for the four mapped levels). Afterwards it is a data change that must be planned.
-- Run with low write traffic: the transaction holds SHARE ROW EXCLUSIVE locks on the touched tables.

begin;

-- Serialise with writers to every table the conversion touches (reads continue).
lock table
  public.global_levels, public.academy_levels, public.academy_tracks,
  public.annual_student_records, public.groups, public.schedules,
  public.assignments, public.quizzes, public.exams,
  public.student_code_assignments, public.student_code_level_patterns,
  public.student_profiles, public.student_import_sessions, public.student_import_rows
  in share row exclusive mode;

alter table public.global_levels
  add column selectable boolean not null default true,
  add column replaced_by text references public.global_levels (id);

alter table public.global_levels add constraint global_levels_replacement_shape
  check ((selectable and replaced_by is null) or (not selectable and replaced_by is not null));

insert into public.global_levels (id, name, sort_order) values
  ('preparatory-1', 'First Preparatory', 1),
  ('preparatory-2', 'Second Preparatory', 2),
  ('preparatory-3', 'Third Preparatory', 3),
  ('secondary-1', 'First Secondary', 4),
  ('secondary-2', 'Second Secondary', 5),
  ('secondary-3', 'Third Secondary', 6);

create temp table level_map (old_id text primary key, new_id text not null unique) on commit drop;
insert into level_map values
  ('grade-9', 'preparatory-3'), ('grade-10', 'secondary-1'),
  ('grade-11', 'secondary-2'), ('grade-12', 'secondary-3');

-- Legacy rows stay as non-selectable history entries named like their replacement.
update public.global_levels g
set selectable = false, replaced_by = m.new_id, name = n.name, sort_order = g.sort_order + 100
from level_map m
join public.global_levels n on n.id = m.new_id
where g.id = m.old_id;

-- Row counts and a digest of every column except level_id, to prove nothing else changed.
create temp table level_conversion_before (tbl text primary key, rows_total bigint, rows_legacy bigint, digest text) on commit drop;

create function pg_temp.level_fingerprint(p_table regclass, p_ignore text[])
returns table (rows_total bigint, rows_legacy bigint, digest text)
language plpgsql as $$
begin
  return query execute format(
    'select count(*), count(*) filter (where t.level_id in (select old_id from level_map)),
            md5(coalesce(string_agg((to_jsonb(t) - %L::text[])::text, ''|'' order by (to_jsonb(t) - %L::text[])::text), ''''))
     from %s t', p_ignore, p_ignore, p_table);
end $$;

do $$
declare
  tbl regclass;
  fp record;
begin
  foreach tbl in array array[
    'public.annual_student_records', 'public.groups', 'public.schedules', 'public.assignments',
    'public.quizzes', 'public.exams', 'public.student_code_assignments',
    'public.student_code_level_patterns', 'public.student_profiles', 'public.academy_tracks'
  ]::regclass[] loop
    select * into fp from pg_temp.level_fingerprint(tbl, array['level_id']);
    insert into level_conversion_before values (tbl::text, fp.rows_total, fp.rows_legacy, fp.digest);
  end loop;

  -- The guard triggers must all be enabled so re-enabling them restores the original state.
  if exists (
    select 1 from pg_trigger t
    where t.tgrelid in ('public.groups'::regclass, 'public.annual_student_records'::regclass, 'public.schedules'::regclass,
                        'public.student_code_assignments'::regclass, 'public.student_profiles'::regclass)
      and t.tgname in ('groups_validate_write', 'groups_protect_dependencies', 'groups_set_updated_at',
        'annual_student_records_validate', 'annual_student_records_retire_code', 'schedules_validate_write',
        'schedules_set_updated_at', 'student_code_assignments_protect', 'student_profiles_set_updated_at')
      and t.tgenabled <> 'O'
  ) then
    raise exception 'level catalog: a guard trigger is not in its normal enabled state';
  end if;
end $$;

-- Give every academy that offers a legacy level the replacement level, ahead of the conversion.
-- The temporary sort offset keeps (academy_id, sort_order) unique until the legacy rows are removed.
insert into public.academy_levels (academy_id, level_id, sort_order)
select al.academy_id, m.new_id, al.sort_order + 1000
from public.academy_levels al join level_map m on m.old_id = al.level_id;

-- Defer the (academy_id, level_id[, track_id]) foreign keys while parents and children move together.
do $$
declare fk record;
begin
  for fk in
    select c.conrelid::regclass as tbl, c.conname
    from pg_constraint c
    where c.contype = 'f' and c.confrelid in ('public.academy_levels'::regclass, 'public.academy_tracks'::regclass)
  loop
    execute format('alter table %s alter constraint %I deferrable initially immediate', fk.tbl, fk.conname);
  end loop;
end $$;
set constraints all deferred;

alter table public.groups
  disable trigger groups_validate_write, disable trigger groups_protect_dependencies, disable trigger groups_set_updated_at;
alter table public.annual_student_records
  disable trigger annual_student_records_validate, disable trigger annual_student_records_retire_code;
alter table public.schedules
  disable trigger schedules_validate_write, disable trigger schedules_set_updated_at;
alter table public.student_code_assignments disable trigger student_code_assignments_protect;
alter table public.student_profiles disable trigger student_profiles_set_updated_at;

update public.academy_tracks x set level_id = m.new_id from level_map m where x.level_id = m.old_id;
update public.annual_student_records x set level_id = m.new_id from level_map m where x.level_id = m.old_id;
update public.groups x set level_id = m.new_id from level_map m where x.level_id = m.old_id;
update public.schedules x set level_id = m.new_id from level_map m where x.level_id = m.old_id;
update public.assignments x set level_id = m.new_id from level_map m where x.level_id = m.old_id;
update public.quizzes x set level_id = m.new_id from level_map m where x.level_id = m.old_id;
update public.exams x set level_id = m.new_id from level_map m where x.level_id = m.old_id;
update public.student_code_assignments x set level_id = m.new_id from level_map m where x.level_id = m.old_id;
update public.student_code_level_patterns x set level_id = m.new_id from level_map m where x.level_id = m.old_id;
update public.student_profiles x set level_id = m.new_id from level_map m where x.level_id = m.old_id;

-- Unfinished imports resume against the converted levels. Completed and cancelled imports stay as logs.
-- A staged cell naming a legacy level by its code or old display name now names its replacement.
do $$
declare m record;
begin
  for m in select old_id, new_id from level_map loop
    update public.student_import_sessions s
    set defaults = jsonb_set(s.defaults, '{level_id}', to_jsonb(m.new_id))
    where s.defaults ->> 'level_id' = m.old_id and s.state in ('staging', 'reviewing', 'importing', 'blocked');

    update public.student_import_rows r
    set input = case when r.input ->> 'level_id' = m.old_id then jsonb_set(r.input, '{level_id}', to_jsonb(m.new_id)) else r.input end,
        corrected = case when r.corrected ->> 'level_id' = m.old_id then jsonb_set(r.corrected, '{level_id}', to_jsonb(m.new_id)) else r.corrected end,
        source = case
          when jsonb_typeof(r.source -> 'level') = 'string' and public.normalize_import_label(r.source ->> 'level') in
            (public.normalize_import_label(m.old_id), public.normalize_import_label(initcap(replace(m.old_id, '-', ' '))))
          then jsonb_set(r.source, '{level}', to_jsonb(m.new_id)) else r.source end
    from public.student_import_sessions s
    where r.session_id = s.id and s.state in ('staging', 'reviewing', 'importing', 'blocked')
      and (r.input ->> 'level_id' = m.old_id or r.corrected ->> 'level_id' = m.old_id
        or (jsonb_typeof(r.source -> 'level') = 'string' and public.normalize_import_label(r.source ->> 'level') in
            (public.normalize_import_label(m.old_id), public.normalize_import_label(initcap(replace(m.old_id, '-', ' '))))));
  end loop;
end $$;

-- Nothing may still reference a legacy academy level; then remove those offerings and restore order.
do $$
begin
  if exists (select 1 from public.academy_tracks where level_id in (select old_id from level_map)) then
    raise exception 'level catalog: tracks still reference a legacy level';
  end if;
end $$;

delete from public.academy_levels where level_id in (select old_id from level_map);
update public.academy_levels set sort_order = sort_order - 1000 where sort_order >= 1000;

set constraints all immediate;

do $$
declare fk record;
begin
  for fk in
    select c.conrelid::regclass as tbl, c.conname
    from pg_constraint c
    where c.contype = 'f' and c.condeferrable
      and c.confrelid in ('public.academy_levels'::regclass, 'public.academy_tracks'::regclass)
  loop
    execute format('alter table %s alter constraint %I not deferrable', fk.tbl, fk.conname);
  end loop;
end $$;

alter table public.groups
  enable trigger groups_validate_write, enable trigger groups_protect_dependencies, enable trigger groups_set_updated_at;
alter table public.annual_student_records
  enable trigger annual_student_records_validate, enable trigger annual_student_records_retire_code;
alter table public.schedules
  enable trigger schedules_validate_write, enable trigger schedules_set_updated_at;
alter table public.student_code_assignments enable trigger student_code_assignments_protect;
alter table public.student_profiles enable trigger student_profiles_set_updated_at;

-- New writes can only name selectable levels. SECURITY DEFINER RPCs are the only write path; this
-- guards them (create_academy_setup, finish_student_profile) against the retained legacy rows.
create function edra_private.require_selectable_level()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.level_id is not null and not exists (
    select 1 from public.global_levels g where g.id = new.level_id and g.selectable
  ) then
    raise exception using errcode = 'P0001', message = 'invalid_academy_levels',
      hint = 'The level is not part of the current catalog.';
  end if;
  return new;
end $$;
revoke all on function edra_private.require_selectable_level() from public, anon, authenticated;

create trigger academy_levels_selectable before insert or update of level_id on public.academy_levels
  for each row execute function edra_private.require_selectable_level();
create trigger student_profiles_selectable before insert or update of level_id on public.student_profiles
  for each row execute function edra_private.require_selectable_level();

-- Verification: abort and roll back on any drift.
do $$
declare
  rec record;
  fp record;
  leftover record;
  n bigint;
begin
  for rec in select * from level_conversion_before loop
    select * into fp from pg_temp.level_fingerprint(rec.tbl::regclass, array['level_id']);
    if fp.rows_total <> rec.rows_total or fp.digest <> rec.digest then
      raise exception 'level catalog: % changed beyond level_id (rows % -> %)', rec.tbl, rec.rows_total, fp.rows_total;
    end if;
    execute format('select count(*) from %s where level_id in (select old_id from level_map)', rec.tbl::regclass) into strict n;
    if n <> 0 then
      raise exception 'level catalog: % still has % legacy level references', rec.tbl, n;
    end if;
  end loop;

  if (select count(*) from public.global_levels where selectable) <> 6
     or (select count(*) from public.global_levels where not selectable and replaced_by is not null) <> 4 then
    raise exception 'level catalog: unexpected catalog contents';
  end if;

  if exists (select 1 from pg_trigger t where t.tgname in (
        'groups_validate_write', 'groups_protect_dependencies', 'groups_set_updated_at',
        'annual_student_records_validate', 'annual_student_records_retire_code', 'schedules_validate_write',
        'schedules_set_updated_at', 'student_code_assignments_protect', 'student_profiles_set_updated_at')
      and t.tgenabled <> 'O') then
    raise exception 'level catalog: a guard trigger was not restored';
  end if;

  -- Any other persisted level column or payload still naming a legacy id is reported, not guessed:
  -- sessions and session_roster_entries are intentional immutable snapshots.
  for leftover in
    select c.table_schema, c.table_name, c.column_name
    from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
    where c.table_schema in ('public', 'edra_private')
      and c.column_name in ('level_id', 'level_ids')
      and c.table_name not in ('sessions', 'session_roster_entries', 'global_levels')
  loop
    execute format('select count(*) from %I.%I where %I::text ~ ''grade-(9|10|11|12)''',
      leftover.table_schema, leftover.table_name, leftover.column_name) into strict n;
    if n <> 0 then
      raise exception 'level catalog: %.%.% still references a legacy level in % rows',
        leftover.table_schema, leftover.table_name, leftover.column_name, n;
    end if;
  end loop;
end $$;

commit;
