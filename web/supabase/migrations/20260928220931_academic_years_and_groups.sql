create table public.academic_years (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.academies (id) on delete cascade,
  start_year integer not null check (start_year between 2000 and 2100),
  starts_on date generated always as (make_date(start_year, 8, 16)) stored,
  ends_on date generated always as (make_date(start_year + 1, 8, 15)) stored,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (academy_id, id),
  unique (academy_id, start_year)
);

create unique index academic_years_one_active_per_academy
  on public.academic_years (academy_id) where closed_at is null;

create or replace function public.initialize_academic_year()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  cairo_today date := (now() at time zone 'Africa/Cairo')::date;
  first_year integer;
begin
  first_year := extract(year from cairo_today)::integer;
  if cairo_today < make_date(first_year, 8, 16) then first_year := first_year - 1; end if;
  insert into public.academic_years (academy_id, start_year) values (new.id, first_year);
  return new;
end;
$$;

create trigger academies_initialize_academic_year
after insert on public.academies
for each row execute function public.initialize_academic_year();

insert into public.academic_years (academy_id, start_year)
select id, 2026 from public.academies;

alter table public.academy_tracks
  add constraint academy_tracks_academy_level_id_unique unique (academy_id, level_id, id);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null,
  academic_year_id uuid not null,
  level_id text not null,
  track_id uuid,
  name text not null check (char_length(trim(name)) between 2 and 100 and name = trim(name)),
  capacity integer check (capacity > 0),
  notes text check (notes is null or char_length(notes) <= 2000),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academy_id, academic_year_id, id),
  foreign key (academy_id, academic_year_id)
    references public.academic_years (academy_id, id),
  foreign key (academy_id, level_id)
    references public.academy_levels (academy_id, level_id),
  foreign key (academy_id, level_id, track_id)
    references public.academy_tracks (academy_id, level_id, id)
);

create unique index groups_active_name_per_program
  on public.groups (academy_id, academic_year_id, level_id, coalesce(track_id::text, ''), lower(name))
  where archived_at is null;
create index groups_academy_year_idx on public.groups (academy_id, academic_year_id);

create or replace function public.validate_group_write()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from public.academic_years y
    where y.id = new.academic_year_id and y.academy_id = new.academy_id and y.closed_at is null
  ) then raise exception 'Group must belong to the active academic year'; end if;
  if exists (
    select 1 from public.academy_tracks t
    where t.academy_id = new.academy_id and t.level_id = new.level_id
  ) and new.track_id is null then
    raise exception 'A track is required for this level';
  end if;
  if tg_op = 'UPDATE' then
    if new.academy_id is distinct from old.academy_id
      or new.academic_year_id is distinct from old.academic_year_id
      or new.created_at is distinct from old.created_at then
      raise exception 'Group academy and year cannot be changed';
    end if;
    if old.archived_at is not null then raise exception 'Archived groups cannot be edited'; end if;
    if new.archived_at is not null and new.archived_at < now() - interval '1 minute' then
      raise exception 'Invalid archive timestamp';
    end if;
    -- Dependent schedule and student records are protected by their foreign keys;
    -- the schedule check is added after schedules are created.
  end if;
  return new;
end;
$$;

create trigger groups_validate_write before insert or update on public.groups
for each row execute function public.validate_group_write();
create trigger groups_set_updated_at before update on public.groups
for each row execute function public.set_updated_at();

alter table public.academic_years enable row level security;
alter table public.groups enable row level security;
revoke all on public.academic_years, public.groups from anon, authenticated;
grant select on public.academic_years to authenticated;
grant select, insert, update on public.groups to authenticated;

create policy academic_years_select_members on public.academic_years
  for select to authenticated using (public.is_academy_member(academy_id));
create policy groups_select_members on public.groups
  for select to authenticated using (public.is_academy_member(academy_id));
create policy groups_insert_managers on public.groups
  for insert to authenticated with check (
    public.academy_role_for(academy_id) in ('owner', 'admin')
    and archived_at is null
  );
create policy groups_update_managers on public.groups
  for update to authenticated using (
    public.academy_role_for(academy_id) in ('owner', 'admin') and archived_at is null
  ) with check (public.academy_role_for(academy_id) in ('owner', 'admin'));

revoke all on function public.initialize_academic_year() from public, anon, authenticated;
revoke all on function public.validate_group_write() from public, anon, authenticated;
