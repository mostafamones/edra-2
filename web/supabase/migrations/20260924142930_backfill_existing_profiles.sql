-- Accounts created before the foundation migration did not fire on_auth_user_created.
-- Restore the profile row required by academy ownership without changing existing profiles.
insert into public.profiles (id, full_name, phone)
select
  auth_user.id,
  nullif(trim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
  auth_user.phone
from auth.users as auth_user
on conflict (id) do nothing;
