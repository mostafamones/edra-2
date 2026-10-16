-- FOR NO KEY UPDATE applies schedules' UPDATE policy, which hides archived parents.
-- A hidden parent is not a cascading deletion: keep the guard under the caller's RLS
-- and use an ordinary SELECT to distinguish an archived parent from a removed one.
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
    if tg_op = 'DELETE' and not exists (
      select 1 from public.schedules s where s.id = target_id
    ) then
      return old; -- parent already removed (cascade)
    end if;
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
