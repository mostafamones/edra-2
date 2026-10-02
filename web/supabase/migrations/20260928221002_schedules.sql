create type public.schedule_kind as enum ('recurring', 'one_off');
create type public.schedule_audience as enum ('group', 'level', 'program');

create table public.schedules (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null,
  academic_year_id uuid not null,
  title text not null check (char_length(trim(title)) between 2 and 100 and title = trim(title)),
  kind public.schedule_kind not null,
  audience public.schedule_audience not null,
  group_id uuid,
  level_id text,
  track_id uuid,
  mandatory boolean not null default true,
  location text not null check (char_length(trim(location)) between 1 and 120 and location = trim(location)),
  starts_on date,
  ends_on date,
  occurs_on date,
  starts_at time without time zone,
  ends_at time without time zone,
  archived_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academy_id, academic_year_id, id),
  foreign key (academy_id, academic_year_id)
    references public.academic_years (academy_id, id),
  foreign key (academy_id, academic_year_id, group_id)
    references public.groups (academy_id, academic_year_id, id),
  foreign key (academy_id, level_id)
    references public.academy_levels (academy_id, level_id),
  foreign key (academy_id, level_id, track_id)
    references public.academy_tracks (academy_id, level_id, id),
  constraint schedules_audience_shape check (
    (audience = 'group' and group_id is not null and level_id is null and track_id is null)
    or (audience = 'level' and group_id is null and level_id is not null and track_id is null)
    or (audience = 'program' and group_id is null and level_id is not null and track_id is not null)
  ),
  constraint schedules_kind_shape check (
    (kind = 'recurring' and starts_on is not null and ends_on is not null
      and starts_on <= ends_on and occurs_on is null and starts_at is null and ends_at is null)
    or (kind = 'one_off' and occurs_on is not null and starts_at is not null
      and ends_at is not null and starts_at < ends_at
      and starts_on is null and ends_on is null)
  )
);

create index schedules_academy_year_idx on public.schedules (academy_id, academic_year_id);
create index schedules_group_idx on public.schedules (group_id) where group_id is not null;

create table public.schedule_slots (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null,
  academic_year_id uuid not null,
  schedule_id uuid not null,
  weekday smallint not null check (weekday between 1 and 7),
  starts_at time without time zone not null,
  ends_at time without time zone not null,
  check (starts_at < ends_at),
  unique (schedule_id, weekday, starts_at),
  foreign key (academy_id, academic_year_id, schedule_id)
    references public.schedules (academy_id, academic_year_id, id) on delete cascade
);

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
  if new.audience = 'group' and not exists (
    select 1 from public.groups g where g.id = new.group_id
      and g.academy_id = new.academy_id and g.academic_year_id = new.academic_year_id
      and g.archived_at is null
  ) then raise exception 'Schedule group must be active'; end if;
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

create or replace function public.validate_schedule_slot()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from public.schedules s where s.id = new.schedule_id
      and s.academy_id = new.academy_id and s.academic_year_id = new.academic_year_id
      and s.kind = 'recurring' and s.archived_at is null
  ) then raise exception 'Slots require an active recurring schedule'; end if;
  return new;
end;
$$;

create trigger schedules_validate_write before insert or update on public.schedules
for each row execute function public.validate_schedule_write();
create trigger schedules_set_updated_at before update on public.schedules
for each row execute function public.set_updated_at();
create trigger schedule_slots_validate before insert or update on public.schedule_slots
for each row execute function public.validate_schedule_slot();

create or replace function public.check_recurring_schedule_slots()
returns trigger language plpgsql set search_path = '' as $$
declare target_id uuid;
begin
  target_id := case when tg_table_name = 'schedule_slots' then coalesce(new.schedule_id, old.schedule_id)
    else coalesce(new.id, old.id) end;
  if exists (select 1 from public.schedules s where s.id = target_id and s.kind = 'recurring'
    and s.archived_at is null)
    and not exists (select 1 from public.schedule_slots sl where sl.schedule_id = target_id) then
    raise exception 'Recurring schedules require at least one weekly slot';
  end if;
  return null;
end;
$$;

create constraint trigger schedules_require_slots
after insert or update on public.schedules deferrable initially deferred
for each row execute function public.check_recurring_schedule_slots();
create constraint trigger slots_keep_schedule_nonempty
after delete or update on public.schedule_slots deferrable initially deferred
for each row execute function public.check_recurring_schedule_slots();

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

create trigger groups_protect_dependencies before update on public.groups
for each row execute function public.protect_group_dependencies();

alter table public.schedules enable row level security;
alter table public.schedule_slots enable row level security;
revoke all on public.schedules, public.schedule_slots from anon, authenticated;
grant select, insert, update on public.schedules to authenticated;
grant select, insert, update, delete on public.schedule_slots to authenticated;

create policy schedules_select_members on public.schedules
  for select to authenticated using (public.is_academy_member(academy_id));
create policy schedules_insert_staff on public.schedules
  for insert to authenticated with check (
    created_by = auth.uid() and (
      public.academy_role_for(academy_id) in ('owner', 'admin')
      or (public.academy_role_for(academy_id) = 'instructor' and kind = 'one_off')
    )
  );
create policy schedules_update_staff on public.schedules
  for update to authenticated using (
    archived_at is null and (public.academy_role_for(academy_id) in ('owner', 'admin')
      or (public.academy_role_for(academy_id) = 'instructor'
        and kind = 'one_off' and created_by = auth.uid()))
  ) with check (
    public.academy_role_for(academy_id) in ('owner', 'admin')
    or (public.academy_role_for(academy_id) = 'instructor'
      and kind = 'one_off' and created_by = auth.uid())
  );
create policy slots_select_members on public.schedule_slots
  for select to authenticated using (public.is_academy_member(academy_id));
create policy slots_insert_managers on public.schedule_slots
  for insert to authenticated with check (
    public.academy_role_for(academy_id) in ('owner', 'admin')
  );
create policy slots_update_managers on public.schedule_slots
  for update to authenticated using (public.academy_role_for(academy_id) in ('owner', 'admin'))
  with check (public.academy_role_for(academy_id) in ('owner', 'admin'));
create policy slots_delete_managers on public.schedule_slots
  for delete to authenticated using (public.academy_role_for(academy_id) in ('owner', 'admin'));

revoke all on function public.validate_schedule_write() from public, anon, authenticated;
revoke all on function public.validate_schedule_slot() from public, anon, authenticated;
revoke all on function public.check_recurring_schedule_slots() from public, anon, authenticated;
revoke all on function public.protect_group_dependencies() from public, anon, authenticated;

create or replace function public.create_schedule(
  p_academy_id uuid, p_academic_year_id uuid, p_title text,
  p_kind public.schedule_kind, p_audience public.schedule_audience,
  p_group_id uuid, p_level_id text, p_track_id uuid,
  p_mandatory boolean, p_location text,
  p_starts_on date, p_ends_on date, p_occurs_on date,
  p_starts_at time without time zone, p_ends_at time without time zone,
  p_slots jsonb
)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare schedule_id uuid;
declare slot jsonb;
begin
  if p_kind = 'recurring' and (p_slots is null or jsonb_typeof(p_slots) <> 'array' or jsonb_array_length(p_slots) = 0) then
    raise exception 'Recurring schedules require weekly slots';
  end if;
  if p_kind = 'one_off' and p_slots <> '[]'::jsonb then
    raise exception 'One-off schedules cannot have weekly slots';
  end if;
  insert into public.schedules (
    academy_id, academic_year_id, title, kind, audience, group_id, level_id, track_id,
    mandatory, location, starts_on, ends_on, occurs_on, starts_at, ends_at
  ) values (
    p_academy_id, p_academic_year_id, trim(p_title), p_kind, p_audience,
    p_group_id, p_level_id, p_track_id, p_mandatory, trim(p_location),
    p_starts_on, p_ends_on, p_occurs_on, p_starts_at, p_ends_at
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

revoke all on function public.create_schedule(uuid, uuid, text, public.schedule_kind, public.schedule_audience, uuid, text, uuid, boolean, text, date, date, date, time, time, jsonb) from public, anon;
grant execute on function public.create_schedule(uuid, uuid, text, public.schedule_kind, public.schedule_audience, uuid, text, uuid, boolean, text, date, date, date, time, time, jsonb) to authenticated;

create or replace function public.update_schedule(
  p_schedule_id uuid, p_academy_id uuid, p_title text,
  p_audience public.schedule_audience,
  p_group_id uuid, p_level_id text, p_track_id uuid,
  p_mandatory boolean, p_location text,
  p_starts_on date, p_ends_on date, p_occurs_on date,
  p_starts_at time without time zone, p_ends_at time without time zone,
  p_slots jsonb
)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare existing public.schedules%rowtype;
declare slot jsonb;
begin
  select * into existing from public.schedules
    where id = p_schedule_id and academy_id = p_academy_id and archived_at is null
    for update;
  if not found then return false; end if;
  if existing.kind = 'recurring' and (p_slots is null or jsonb_typeof(p_slots) <> 'array' or jsonb_array_length(p_slots) = 0) then
    raise exception 'Recurring schedules require weekly slots';
  end if;
  if existing.kind = 'one_off' and p_slots <> '[]'::jsonb then
    raise exception 'One-off schedules cannot have weekly slots';
  end if;
  update public.schedules set
    title = trim(p_title), audience = p_audience, group_id = p_group_id,
    level_id = p_level_id, track_id = p_track_id,
    mandatory = p_mandatory, location = trim(p_location),
    starts_on = p_starts_on, ends_on = p_ends_on, occurs_on = p_occurs_on,
    starts_at = p_starts_at, ends_at = p_ends_at
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

revoke all on function public.update_schedule(uuid, uuid, text, public.schedule_audience, uuid, text, uuid, boolean, text, date, date, date, time, time, jsonb) from public, anon;
grant execute on function public.update_schedule(uuid, uuid, text, public.schedule_audience, uuid, text, uuid, boolean, text, date, date, date, time, time, jsonb) to authenticated;
