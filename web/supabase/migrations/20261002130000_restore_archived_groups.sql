-- Owners and Admins can restore an archived group in the active academic year.
-- A restore may only clear archived_at; every other edit of an archived group is still rejected.
-- The active-name unique index rejects a restore that would duplicate an active group's name.

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
    if old.archived_at is not null and (
      new.archived_at is not null
      or (new.name, new.level_id, new.track_id, new.capacity, new.notes)
        is distinct from (old.name, old.level_id, old.track_id, old.capacity, old.notes)
    ) then raise exception 'Archived groups cannot be edited'; end if;
    if new.archived_at is not null and new.archived_at < now() - interval '1 minute' then
      raise exception 'Invalid archive timestamp';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.validate_group_write() from public, anon, authenticated;

-- The old policy hid archived rows from UPDATE entirely; the trigger above now limits them to a restore.
drop policy groups_update_managers on public.groups;
create policy groups_update_managers on public.groups
  for update to authenticated
  using (public.academy_role_for(academy_id) in ('owner', 'admin'))
  with check (public.academy_role_for(academy_id) in ('owner', 'admin'));
