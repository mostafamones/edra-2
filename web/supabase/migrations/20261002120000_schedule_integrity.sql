-- Corrective migration for schedule/slot integrity and group-dependency races.
--
-- Locking protocol (always acquired in this order, never reversed):
--   1. schedules row     (FOR NO KEY UPDATE; taken by update_schedule and by every slot write)
--   2. groups row        (FOR SHARE when a schedule depends on it; FOR NO KEY UPDATE implicitly
--                         when a group is updated/archived)
-- Group archival/program changes hold the group lock before looking for dependent schedules, and
-- schedule creation/audience changes share-lock the group before deciding it is active, so the two
-- serialize on the group row instead of relying on the FK, which only protects key columns.

-- Slots: parent identity is immutable, and writes are serialized per parent schedule.
create or replace function public.validate_schedule_slot()
returns trigger language plpgsql set search_path = '' as $$
declare
  target_id uuid := case when tg_op = 'DELETE' then old.schedule_id else new.schedule_id end;
  parent public.schedules%rowtype;
begin
  if tg_op = 'UPDATE' and (new.schedule_id, new.academy_id, new.academic_year_id)
    is distinct from (old.schedule_id, old.academy_id, old.academic_year_id) then
    raise exception 'Schedule slot parent cannot be changed';
  end if;

  -- Serialize every mutation that can change whether the parent has slots.
  select * into parent from public.schedules s where s.id = target_id for no key update;
  if not found then
    if tg_op = 'DELETE' then return old; end if; -- parent already removed (cascade)
    raise exception 'Slots require an active recurring schedule';
  end if;

  if parent.kind <> 'recurring' or parent.archived_at is not null
    or parent.academy_id <> (case when tg_op = 'DELETE' then old.academy_id else new.academy_id end)
    or parent.academic_year_id <> (case when tg_op = 'DELETE' then old.academic_year_id else new.academic_year_id end)
    or not exists (
      select 1 from public.academic_years y
      where y.id = parent.academic_year_id and y.academy_id = parent.academy_id and y.closed_at is null
    ) then
    raise exception 'Slots require an active recurring schedule';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists schedule_slots_validate on public.schedule_slots;
create trigger schedule_slots_validate before insert or update or delete on public.schedule_slots
for each row execute function public.validate_schedule_slot();

-- The deferred nonempty check now sees the parent lock holder's committed state at commit time.
create or replace function public.check_recurring_schedule_slots()
returns trigger language plpgsql set search_path = '' as $$
declare target_id uuid;
begin
  if tg_table_name = 'schedule_slots' then
    target_id := case when tg_op = 'DELETE' then old.schedule_id else new.schedule_id end;
  else
    target_id := new.id;
  end if;
  if exists (select 1 from public.schedules s where s.id = target_id and s.kind = 'recurring'
    and s.archived_at is null)
    and not exists (select 1 from public.schedule_slots sl where sl.schedule_id = target_id) then
    raise exception 'Recurring schedules require at least one weekly slot';
  end if;
  return null;
end;
$$;

-- Schedules: lock the audience group before deciding it is active.
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
  if new.kind = 'recurring' and (new.starts_on < year_row.starts_on or new.ends_on > year_row.ends_on) then
    raise exception 'Recurring schedule must be within the academic year';
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

-- Groups: the BEFORE UPDATE trigger runs after the group row is locked, so the dependency check
-- below cannot interleave with a concurrent schedule insert that share-locked the group first
-- (that insert either commits before this check sees it, or waits and then sees archived_at).
create or replace function public.protect_group_dependencies()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.level_id, new.track_id) is distinct from (old.level_id, old.track_id)
    or (new.archived_at is not null and old.archived_at is null) then
    if exists (select 1 from public.schedules s where s.group_id = old.id) then
      raise exception 'Group has schedules and cannot change program or be archived';
    end if;
    -- Future annual student records must add a matching dependency check.
  end if;
  return new;
end;
$$;

revoke all on function public.validate_schedule_slot() from public, anon, authenticated;
revoke all on function public.check_recurring_schedule_slots() from public, anon, authenticated;
revoke all on function public.validate_schedule_write() from public, anon, authenticated;
revoke all on function public.protect_group_dependencies() from public, anon, authenticated;
