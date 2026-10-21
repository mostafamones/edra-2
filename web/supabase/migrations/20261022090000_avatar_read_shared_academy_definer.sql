-- The shared-academy avatar policy called `edra_auth.session_allowed()` directly, which browser roles
-- cannot execute, so every avatar read failed with "permission denied" (including the owner's own).
-- Move the check into a security-definer helper, as `owns_avatar_object` does.
create or replace function public.can_read_avatar_object(p_name text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and edra_auth.session_allowed() and p_name is not null
    and p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$'
    and public.shares_academy_with(split_part(p_name, '/', 1)::uuid);
$$;

revoke all on function public.can_read_avatar_object(text) from public, anon;
grant execute on function public.can_read_avatar_object(text) to authenticated;

drop policy avatars_select_shared_academy on storage.objects;
create policy avatars_select_shared_academy on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and public.can_read_avatar_object(name));
