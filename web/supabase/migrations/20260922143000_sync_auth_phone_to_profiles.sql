create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    new.phone
  );
  return new;
end;
$$;

create or replace function public.sync_profile_phone_from_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set phone = new.phone
  where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_phone_changed
after update of phone on auth.users
for each row
when (old.phone is distinct from new.phone)
execute function public.sync_profile_phone_from_auth();

update public.profiles as profile
set phone = auth_user.phone
from auth.users as auth_user
where profile.id = auth_user.id
  and profile.phone is null
  and auth_user.phone is not null;

revoke update on table public.profiles from anon, authenticated;
grant update (full_name) on table public.profiles to authenticated;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.sync_profile_phone_from_auth() from public, anon, authenticated;
