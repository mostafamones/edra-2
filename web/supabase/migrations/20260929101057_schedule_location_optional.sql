alter table public.schedules
  alter column location drop not null,
  drop constraint if exists schedules_location_check,
  add constraint schedules_location_check
    check (
      location is null
      or (
        char_length(trim(location)) between 1 and 120
        and location = trim(location)
      )
    );
