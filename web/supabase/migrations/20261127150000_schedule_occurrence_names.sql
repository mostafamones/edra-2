-- Staff-chosen names for individual schedule occurrences (for example the content planned for that day).
-- Keyed by schedule and Cairo date, so a planned occurrence and the session recorded from it share one
-- name without touching the immutable session snapshot. Ended sessions stay renameable.
begin;

create table public.schedule_occurrence_names (
  academy_id uuid not null,
  academic_year_id uuid not null,
  schedule_id uuid not null,
  occurs_on date not null,
  name text not null check (char_length(name) between 1 and 120 and name = trim(name)),
  updated_by uuid not null default auth.uid() references public.profiles (id),
  updated_at timestamptz not null default now(),
  primary key (schedule_id, occurs_on),
  foreign key (academy_id, academic_year_id, schedule_id)
    references public.schedules (academy_id, academic_year_id, id)
);
create index schedule_occurrence_names_year_idx on public.schedule_occurrence_names (academy_id, academic_year_id);

-- The writer and time are always the actual actor and now, whatever the client sends.
create function public.stamp_schedule_occurrence_name()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.stamp_schedule_occurrence_name() from public, anon, authenticated;
create trigger schedule_occurrence_names_stamp before insert or update on public.schedule_occurrence_names
for each row execute function public.stamp_schedule_occurrence_name();

-- Same authority as editing the schedule: managers for any active schedule, instructors for one-offs.
create function public.can_name_schedule_occurrence(target_academy_id uuid, target_schedule_id uuid)
returns boolean language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.schedules s
    where s.id = target_schedule_id and s.academy_id = target_academy_id and s.archived_at is null
      and (public.is_academy_manager(target_academy_id)
        or (public.academy_role_for(target_academy_id) = 'instructor' and s.kind = 'one_off'))
  );
$$;
revoke all on function public.can_name_schedule_occurrence(uuid, uuid) from public, anon;
grant execute on function public.can_name_schedule_occurrence(uuid, uuid) to authenticated;

alter table public.schedule_occurrence_names enable row level security;
revoke all on public.schedule_occurrence_names from anon, authenticated;
grant select, insert, update, delete on public.schedule_occurrence_names to authenticated;

create policy occurrence_names_select_members on public.schedule_occurrence_names
  for select to authenticated using (public.is_academy_member(academy_id));
create policy occurrence_names_insert_editors on public.schedule_occurrence_names
  for insert to authenticated with check (public.can_name_schedule_occurrence(academy_id, schedule_id));
create policy occurrence_names_update_editors on public.schedule_occurrence_names
  for update to authenticated using (public.can_name_schedule_occurrence(academy_id, schedule_id))
  with check (public.can_name_schedule_occurrence(academy_id, schedule_id));
create policy occurrence_names_delete_editors on public.schedule_occurrence_names
  for delete to authenticated using (public.can_name_schedule_occurrence(academy_id, schedule_id));

commit;
