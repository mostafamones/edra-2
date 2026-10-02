-- A one-off schedule can meet on several dates. Its dated sessions move out of the schedule row
-- into schedule_sessions, mirroring how recurring schedules keep their weekly schedule_slots.
--
-- DATA PRESERVATION: every existing one-off's occurs_on/starts_at/ends_at becomes its first
-- session before the columns are dropped. Rolling back means re-adding the columns and copying
-- each one-off's earliest session back, so take a backup first if the table holds real data.

create table public.schedule_sessions (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null,
  academic_year_id uuid not null,
  schedule_id uuid not null,
  occurs_on date not null,
  starts_at time without time zone not null,
  ends_at time without time zone not null,
  check (starts_at < ends_at),
  unique (schedule_id, occurs_on, starts_at),
  foreign key (academy_id, academic_year_id, schedule_id)
    references public.schedules (academy_id, academic_year_id, id) on delete cascade
);

create index schedule_sessions_schedule_idx on public.schedule_sessions (schedule_id);

insert into public.schedule_sessions (academy_id, academic_year_id, schedule_id, occurs_on, starts_at, ends_at)
select academy_id, academic_year_id, id, occurs_on, starts_at, ends_at
from public.schedules where kind = 'one_off';

alter table public.schedules drop constraint schedules_kind_shape;
alter table public.schedules drop column occurs_on, drop column starts_at, drop column ends_at;

-- Schedule writes no longer carry one-off dates; the year boundary moves to the session trigger.
create or replace function public.validate_schedule_write()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform 1 from public.academic_years
  where id = new.academic_year_id and academy_id = new.academy_id and closed_at is null;
  if not found then raise exception 'Schedule must belong to the active academic year'; end if;
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

-- Sessions: same locking protocol as slots (parent schedule row first), plus the year boundary.
create or replace function public.validate_schedule_session()
returns trigger language plpgsql set search_path = '' as $$
declare
  target_id uuid := case when tg_op = 'DELETE' then old.schedule_id else new.schedule_id end;
  parent public.schedules%rowtype;
  year_row public.academic_years%rowtype;
begin
  if tg_op = 'UPDATE' and (new.schedule_id, new.academy_id, new.academic_year_id)
    is distinct from (old.schedule_id, old.academy_id, old.academic_year_id) then
    raise exception 'Schedule session parent cannot be changed';
  end if;

  select * into parent from public.schedules s where s.id = target_id for no key update;
  if not found then
    if tg_op = 'DELETE' then return old; end if; -- parent already removed (cascade)
    raise exception 'Sessions require an active one-off schedule';
  end if;

  select * into year_row from public.academic_years y
  where y.id = parent.academic_year_id and y.academy_id = parent.academy_id and y.closed_at is null;
  if parent.kind <> 'one_off' or parent.archived_at is not null
    or parent.academy_id <> (case when tg_op = 'DELETE' then old.academy_id else new.academy_id end)
    or parent.academic_year_id <> (case when tg_op = 'DELETE' then old.academic_year_id else new.academic_year_id end)
    or not found then
    raise exception 'Sessions require an active one-off schedule';
  end if;
  if tg_op <> 'DELETE' and (new.occurs_on < year_row.starts_on or new.occurs_on > year_row.ends_on) then
    raise exception 'Schedule date must be within the academic year';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger schedule_sessions_validate before insert or update or delete on public.schedule_sessions
for each row execute function public.validate_schedule_session();

create or replace function public.check_one_off_schedule_sessions()
returns trigger language plpgsql set search_path = '' as $$
declare target_id uuid;
begin
  if tg_table_name = 'schedule_sessions' then
    target_id := case when tg_op = 'DELETE' then old.schedule_id else new.schedule_id end;
  else
    target_id := new.id;
  end if;
  if exists (select 1 from public.schedules s where s.id = target_id and s.kind = 'one_off'
    and s.archived_at is null)
    and not exists (select 1 from public.schedule_sessions ss where ss.schedule_id = target_id) then
    raise exception 'One-off schedules require at least one session';
  end if;
  return null;
end;
$$;

create constraint trigger schedules_require_sessions
after insert or update on public.schedules deferrable initially deferred
for each row execute function public.check_one_off_schedule_sessions();
create constraint trigger sessions_keep_schedule_nonempty
after delete or update on public.schedule_sessions deferrable initially deferred
for each row execute function public.check_one_off_schedule_sessions();

alter table public.schedule_sessions enable row level security;
revoke all on public.schedule_sessions from anon, authenticated;
grant select, insert, update, delete on public.schedule_sessions to authenticated;

create policy sessions_select_members on public.schedule_sessions
  for select to authenticated using (public.is_academy_member(academy_id));
create policy sessions_insert_staff on public.schedule_sessions
  for insert to authenticated with check (
    public.academy_role_for(academy_id) in ('owner', 'admin', 'instructor')
  );
create policy sessions_update_staff on public.schedule_sessions
  for update to authenticated using (public.academy_role_for(academy_id) in ('owner', 'admin', 'instructor'))
  with check (public.academy_role_for(academy_id) in ('owner', 'admin', 'instructor'));
create policy sessions_delete_staff on public.schedule_sessions
  for delete to authenticated using (public.academy_role_for(academy_id) in ('owner', 'admin', 'instructor'));

revoke all on function public.validate_schedule_session() from public, anon, authenticated;
revoke all on function public.check_one_off_schedule_sessions() from public, anon, authenticated;
revoke all on function public.validate_schedule_write() from public, anon, authenticated;

-- RPCs: p_sessions replaces the single date and times. Drop the obsolete signatures first.
drop function public.create_schedule(uuid, uuid, text, public.schedule_kind, public.schedule_audience, uuid, text, uuid, boolean, text, date, time, time, jsonb);
drop function public.update_schedule(uuid, uuid, text, public.schedule_audience, uuid, text, uuid, boolean, text, date, time, time, jsonb);

create function public.create_schedule(
  p_academy_id uuid, p_academic_year_id uuid, p_title text,
  p_kind public.schedule_kind, p_audience public.schedule_audience,
  p_group_id uuid, p_level_id text, p_track_id uuid,
  p_mandatory boolean, p_location text,
  p_slots jsonb, p_sessions jsonb
)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare schedule_id uuid;
declare item jsonb;
begin
  p_slots := coalesce(p_slots, '[]'::jsonb);
  p_sessions := coalesce(p_sessions, '[]'::jsonb);
  if jsonb_typeof(p_slots) <> 'array' or jsonb_typeof(p_sessions) <> 'array' then
    raise exception 'Slots and sessions must be arrays';
  end if;
  if p_kind = 'recurring' and jsonb_array_length(p_slots) = 0 then
    raise exception 'Recurring schedules require weekly slots';
  end if;
  if p_kind = 'recurring' and jsonb_array_length(p_slots) > 20 then
    raise exception 'Recurring schedules allow at most 20 weekly slots';
  end if;
  if p_kind = 'recurring' and jsonb_array_length(p_sessions) > 0 then
    raise exception 'Recurring schedules cannot have dated sessions';
  end if;
  if p_kind = 'one_off' and jsonb_array_length(p_slots) > 0 then
    raise exception 'One-off schedules cannot have weekly slots';
  end if;
  if p_kind = 'one_off' and jsonb_array_length(p_sessions) = 0 then
    raise exception 'One-off schedules require at least one session';
  end if;
  if p_kind = 'one_off' and jsonb_array_length(p_sessions) > 50 then
    raise exception 'One-off schedules allow at most 50 sessions';
  end if;
  insert into public.schedules (
    academy_id, academic_year_id, title, kind, audience, group_id, level_id, track_id,
    mandatory, location
  ) values (
    p_academy_id, p_academic_year_id, trim(p_title), p_kind, p_audience,
    p_group_id, p_level_id, p_track_id, p_mandatory, nullif(trim(p_location), '')
  ) returning id into schedule_id;
  if p_kind = 'recurring' then
    for item in select value from jsonb_array_elements(p_slots) loop
      insert into public.schedule_slots (academy_id, academic_year_id, schedule_id, weekday, starts_at, ends_at)
      values (p_academy_id, p_academic_year_id, schedule_id,
        (item ->> 'weekday')::smallint, (item ->> 'startsAt')::time, (item ->> 'endsAt')::time);
    end loop;
  else
    for item in select value from jsonb_array_elements(p_sessions) loop
      insert into public.schedule_sessions (academy_id, academic_year_id, schedule_id, occurs_on, starts_at, ends_at)
      values (p_academy_id, p_academic_year_id, schedule_id,
        (item ->> 'date')::date, (item ->> 'startsAt')::time, (item ->> 'endsAt')::time);
    end loop;
  end if;
  return schedule_id;
end;
$$;

revoke all on function public.create_schedule(uuid, uuid, text, public.schedule_kind, public.schedule_audience, uuid, text, uuid, boolean, text, jsonb, jsonb) from public, anon;
grant execute on function public.create_schedule(uuid, uuid, text, public.schedule_kind, public.schedule_audience, uuid, text, uuid, boolean, text, jsonb, jsonb) to authenticated;

create function public.update_schedule(
  p_schedule_id uuid, p_academy_id uuid, p_title text,
  p_audience public.schedule_audience,
  p_group_id uuid, p_level_id text, p_track_id uuid,
  p_mandatory boolean, p_location text,
  p_slots jsonb, p_sessions jsonb
)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare existing public.schedules%rowtype;
declare item jsonb;
begin
  p_slots := coalesce(p_slots, '[]'::jsonb);
  p_sessions := coalesce(p_sessions, '[]'::jsonb);
  if jsonb_typeof(p_slots) <> 'array' or jsonb_typeof(p_sessions) <> 'array' then
    raise exception 'Slots and sessions must be arrays';
  end if;
  -- RLS limits this lock to rows the caller may update; anything else reads as not found.
  select * into existing from public.schedules
    where id = p_schedule_id and academy_id = p_academy_id and archived_at is null
    for update;
  if not found then return false; end if;
  if existing.kind = 'recurring' and jsonb_array_length(p_slots) = 0 then
    raise exception 'Recurring schedules require weekly slots';
  end if;
  if existing.kind = 'recurring' and jsonb_array_length(p_slots) > 20 then
    raise exception 'Recurring schedules allow at most 20 weekly slots';
  end if;
  if existing.kind = 'recurring' and jsonb_array_length(p_sessions) > 0 then
    raise exception 'Recurring schedules cannot have dated sessions';
  end if;
  if existing.kind = 'one_off' and jsonb_array_length(p_slots) > 0 then
    raise exception 'One-off schedules cannot have weekly slots';
  end if;
  if existing.kind = 'one_off' and jsonb_array_length(p_sessions) = 0 then
    raise exception 'One-off schedules require at least one session';
  end if;
  if existing.kind = 'one_off' and jsonb_array_length(p_sessions) > 50 then
    raise exception 'One-off schedules allow at most 50 sessions';
  end if;
  update public.schedules set
    title = trim(p_title), audience = p_audience, group_id = p_group_id,
    level_id = p_level_id, track_id = p_track_id,
    mandatory = p_mandatory, location = nullif(trim(p_location), '')
  where id = p_schedule_id and academy_id = p_academy_id;
  if not found then return false; end if;
  if existing.kind = 'recurring' then
    delete from public.schedule_slots where schedule_id = p_schedule_id;
    for item in select value from jsonb_array_elements(p_slots) loop
      insert into public.schedule_slots (academy_id, academic_year_id, schedule_id, weekday, starts_at, ends_at)
      values (p_academy_id, existing.academic_year_id, p_schedule_id,
        (item ->> 'weekday')::smallint, (item ->> 'startsAt')::time, (item ->> 'endsAt')::time);
    end loop;
  else
    delete from public.schedule_sessions where schedule_id = p_schedule_id;
    for item in select value from jsonb_array_elements(p_sessions) loop
      insert into public.schedule_sessions (academy_id, academic_year_id, schedule_id, occurs_on, starts_at, ends_at)
      values (p_academy_id, existing.academic_year_id, p_schedule_id,
        (item ->> 'date')::date, (item ->> 'startsAt')::time, (item ->> 'endsAt')::time);
    end loop;
  end if;
  return true;
end;
$$;

revoke all on function public.update_schedule(uuid, uuid, text, public.schedule_audience, uuid, text, uuid, boolean, text, jsonb, jsonb) from public, anon;
grant execute on function public.update_schedule(uuid, uuid, text, public.schedule_audience, uuid, text, uuid, boolean, text, jsonb, jsonb) to authenticated;
