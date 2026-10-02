-- Recurring schedules repeat throughout their academic year, so schedule-level date ranges go away.
-- Instructors may edit any academy one-off, but may archive only the one-offs they created.
--
-- DATA PRESERVATION (destructive: drops schedules.starts_on and schedules.ends_on)
-- Every existing recurring schedule becomes an academic-year-wide plan, including schedules that
-- previously carried a shorter range. Before applying this migration to a populated database,
-- export the original bounds to a secured backup that only operators can read, for example:
--
--   \copy (select id, academy_id, academic_year_id, starts_on, ends_on from public.schedules
--          where kind = 'recurring' order by id) to 'schedule_ranges_<env>_<date>.csv' with csv header
--
-- Rollback requires a coordinated application rollback: the previous application sends
-- p_starts_on/p_ends_on to create_schedule/update_schedule and reads both columns. To restore,
-- deploy the previous application together with a corrective migration that re-adds both nullable
-- columns, reloads them from the backup (falling back to the academic year's starts_on/ends_on for
-- schedules created after this migration), restores the previous kind-shape constraint, trigger,
-- RPC signatures, grants, and update policy, and only then re-enables writes.

-- 1. Timing shape: recurring schedules have weekly slots and no one-off timing fields.
alter table public.schedules drop constraint schedules_kind_shape;
alter table public.schedules drop column starts_on, drop column ends_on;
alter table public.schedules add constraint schedules_kind_shape check (
  (kind = 'recurring' and occurs_on is null and starts_at is null and ends_at is null)
  or (kind = 'one_off' and occurs_on is not null and starts_at is not null
    and ends_at is not null and starts_at < ends_at)
);

-- 2. Write validation keeps the active-year, one-off date, audience lock, and identity checks.
create or replace function public.validate_schedule_write()
returns trigger language plpgsql set search_path = '' as $$
declare
  year_row public.academic_years%rowtype;
begin
  select * into year_row from public.academic_years
  where id = new.academic_year_id and academy_id = new.academy_id and closed_at is null;
  if not found then raise exception 'Schedule must belong to the active academic year'; end if;
  if new.kind = 'one_off' and (new.occurs_on < year_row.starts_on or new.occurs_on > year_row.ends_on) then
    raise exception 'Schedule date must be within the academic year';
  end if;
  if new.audience = 'group' then
    perform 1 from public.groups g where g.id = new.group_id
      and g.academy_id = new.academy_id and g.academic_year_id = new.academic_year_id
      and g.archived_at is null
    for share of g;
    if not found then raise exception 'Schedule group must be active'; end if;
  end if;
  if new.audience = 'program' and not exists (
    select 1 from public.academy_tracks t where t.id = new.track_id
      and t.academy_id = new.academy_id and t.level_id = new.level_id
  ) then raise exception 'Invalid program track'; end if;
  if tg_op = 'UPDATE' then
    if new.academy_id is distinct from old.academy_id
      or new.academic_year_id is distinct from old.academic_year_id
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at then
      raise exception 'Schedule identity cannot be changed';
    end if;
    if new.kind is distinct from old.kind then
      raise exception 'Schedule type cannot be changed';
    end if;
    if old.archived_at is not null then raise exception 'Archived schedules cannot be edited'; end if;
  end if;
  return new;
end;
$$;

revoke all on function public.validate_schedule_write() from public, anon, authenticated;

-- 3. Update policy: edit and archive are separate decisions.
--    USING picks the rows a member may touch: managers any active schedule, instructors any active
--    one-off. WITH CHECK then rejects an instructor result that archives another creator's one-off.
--    created_by, kind, academy, and year are immutable (trigger above), so the check cannot be
--    satisfied by rewriting them.
drop policy schedules_update_staff on public.schedules;
create policy schedules_update_staff on public.schedules
  for update to authenticated using (
    archived_at is null and (
      public.academy_role_for(academy_id) in ('owner', 'admin')
      or (public.academy_role_for(academy_id) = 'instructor' and kind = 'one_off')
    )
  ) with check (
    public.academy_role_for(academy_id) in ('owner', 'admin')
    or (public.academy_role_for(academy_id) = 'instructor' and kind = 'one_off'
      and (archived_at is null or created_by = (select auth.uid())))
  );

-- 4. RPCs without schedule-level date ranges. Drop the obsolete signatures so no overload remains.
drop function public.create_schedule(uuid, uuid, text, public.schedule_kind, public.schedule_audience, uuid, text, uuid, boolean, text, date, date, date, time, time, jsonb);
drop function public.update_schedule(uuid, uuid, text, public.schedule_audience, uuid, text, uuid, boolean, text, date, date, date, time, time, jsonb);

create function public.create_schedule(
  p_academy_id uuid, p_academic_year_id uuid, p_title text,
  p_kind public.schedule_kind, p_audience public.schedule_audience,
  p_group_id uuid, p_level_id text, p_track_id uuid,
  p_mandatory boolean, p_location text,
  p_occurs_on date, p_starts_at time without time zone, p_ends_at time without time zone,
  p_slots jsonb
)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare schedule_id uuid;
declare slot jsonb;
begin
  if p_kind = 'recurring' and (p_slots is null or jsonb_typeof(p_slots) <> 'array'
    or jsonb_array_length(p_slots) = 0) then
    raise exception 'Recurring schedules require weekly slots';
  end if;
  if p_kind = 'recurring' and jsonb_array_length(p_slots) > 20 then
    raise exception 'Recurring schedules allow at most 20 weekly slots';
  end if;
  if p_kind = 'one_off' and coalesce(p_slots, '[]'::jsonb) <> '[]'::jsonb then
    raise exception 'One-off schedules cannot have weekly slots';
  end if;
  insert into public.schedules (
    academy_id, academic_year_id, title, kind, audience, group_id, level_id, track_id,
    mandatory, location, occurs_on, starts_at, ends_at
  ) values (
    p_academy_id, p_academic_year_id, trim(p_title), p_kind, p_audience,
    p_group_id, p_level_id, p_track_id, p_mandatory, nullif(trim(p_location), ''),
    p_occurs_on, p_starts_at, p_ends_at
  ) returning id into schedule_id;
  if p_kind = 'recurring' then
    for slot in select value from jsonb_array_elements(p_slots) loop
      insert into public.schedule_slots (
        academy_id, academic_year_id, schedule_id, weekday, starts_at, ends_at
      ) values (
        p_academy_id, p_academic_year_id, schedule_id,
        (slot ->> 'weekday')::smallint,
        (slot ->> 'startsAt')::time,
        (slot ->> 'endsAt')::time
      );
    end loop;
  end if;
  return schedule_id;
end;
$$;

revoke all on function public.create_schedule(uuid, uuid, text, public.schedule_kind, public.schedule_audience, uuid, text, uuid, boolean, text, date, time, time, jsonb) from public, anon;
grant execute on function public.create_schedule(uuid, uuid, text, public.schedule_kind, public.schedule_audience, uuid, text, uuid, boolean, text, date, time, time, jsonb) to authenticated;

create function public.update_schedule(
  p_schedule_id uuid, p_academy_id uuid, p_title text,
  p_audience public.schedule_audience,
  p_group_id uuid, p_level_id text, p_track_id uuid,
  p_mandatory boolean, p_location text,
  p_occurs_on date, p_starts_at time without time zone, p_ends_at time without time zone,
  p_slots jsonb
)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare existing public.schedules%rowtype;
declare slot jsonb;
begin
  -- RLS limits this lock to rows the caller may update; anything else reads as not found.
  select * into existing from public.schedules
    where id = p_schedule_id and academy_id = p_academy_id and archived_at is null
    for update;
  if not found then return false; end if;
  if existing.kind = 'recurring' and (p_slots is null or jsonb_typeof(p_slots) <> 'array'
    or jsonb_array_length(p_slots) = 0) then
    raise exception 'Recurring schedules require weekly slots';
  end if;
  if existing.kind = 'recurring' and jsonb_array_length(p_slots) > 20 then
    raise exception 'Recurring schedules allow at most 20 weekly slots';
  end if;
  if existing.kind = 'one_off' and coalesce(p_slots, '[]'::jsonb) <> '[]'::jsonb then
    raise exception 'One-off schedules cannot have weekly slots';
  end if;
  update public.schedules set
    title = trim(p_title), audience = p_audience, group_id = p_group_id,
    level_id = p_level_id, track_id = p_track_id,
    mandatory = p_mandatory, location = nullif(trim(p_location), ''),
    occurs_on = p_occurs_on, starts_at = p_starts_at, ends_at = p_ends_at
  where id = p_schedule_id and academy_id = p_academy_id;
  if not found then return false; end if;
  if existing.kind = 'recurring' then
    delete from public.schedule_slots where schedule_id = p_schedule_id;
    for slot in select value from jsonb_array_elements(p_slots) loop
      insert into public.schedule_slots (
        academy_id, academic_year_id, schedule_id, weekday, starts_at, ends_at
      ) values (
        p_academy_id, existing.academic_year_id, p_schedule_id,
        (slot ->> 'weekday')::smallint,
        (slot ->> 'startsAt')::time,
        (slot ->> 'endsAt')::time
      );
    end loop;
  end if;
  return true;
end;
$$;

revoke all on function public.update_schedule(uuid, uuid, text, public.schedule_audience, uuid, text, uuid, boolean, text, date, time, time, jsonb) from public, anon;
grant execute on function public.update_schedule(uuid, uuid, text, public.schedule_audience, uuid, text, uuid, boolean, text, date, time, time, jsonb) to authenticated;
