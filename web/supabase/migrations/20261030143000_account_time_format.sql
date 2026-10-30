-- Display-only preference. Existing self-profile RLS remains the authority.
alter table public.profiles add column time_format text not null default '24h'
  constraint profiles_time_format_check check (time_format in ('12h', '24h'));
grant update (time_format) on public.profiles to authenticated;
