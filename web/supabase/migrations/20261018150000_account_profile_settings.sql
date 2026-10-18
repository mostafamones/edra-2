-- EDRA-126: personal account profile (full name, optional display name, cropped avatar).
--
--   * `profiles` stays the canonical application profile. `display_name` is optional; readers use
--     it when present, else `full_name`. Bounds match annual student record names (1-200).
--   * Account owners update only `full_name` and `display_name` directly (column grant + the
--     existing self-only RLS policy). Phone, identity and verification remain Auth-controlled.
--   * `avatar_path` names the current object in the private `avatars` bucket. It is written only by
--     `set_my_avatar`, which derives the owner from the caller, requires the object to exist, and
--     switches only from the version the caller saw, so a losing concurrent change cannot replace
--     or orphan the winner's picture.
--   * Objects live at `<user_id>/<uuid>.webp`: final square crops only, re-encoded by the server.
--     Storage policies let only the owner, with a live password session, insert, read or delete
--     their own objects. No update policy: objects are immutable; replacement uses a new name.

alter table public.profiles
  add column display_name text,
  add column avatar_path text,
  add constraint profiles_full_name_length
    check (full_name is null or char_length(pg_catalog.btrim(full_name)) between 1 and 200),
  add constraint profiles_display_name_value
    check (display_name is null or (display_name = pg_catalog.btrim(display_name) and char_length(display_name) between 1 and 200)),
  add constraint profiles_avatar_path_format
    check (avatar_path is null or avatar_path ~ ('^' || id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$'));

revoke update on table public.profiles from anon, authenticated;
grant update (full_name, display_name) on table public.profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 262144, array['image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- True when `p_name` is an avatar object name in the caller's own folder and the request carries a
-- live password session. Storage requests do not pass through the PostgREST pre-request hook.
create or replace function public.owns_avatar_object(p_name text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and edra_auth.session_allowed() and p_name is not null
    and p_name ~ ('^' || auth.uid()::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$');
$$;

revoke all on function public.owns_avatar_object(text) from public, anon;
grant execute on function public.owns_avatar_object(text) to authenticated;

create policy avatars_insert_owner on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and public.owns_avatar_object(name));
create policy avatars_select_owner on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and public.owns_avatar_object(name));
create policy avatars_delete_owner on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and public.owns_avatar_object(name));

-- Sets (p_path) or removes (null) the caller's avatar, only if the current avatar is still
-- p_expected. Returns `saved` with the superseded path for cleanup, `conflict` with the current
-- path when another change won, or `invalid`/`unauthenticated`.
create or replace function public.set_my_avatar(p_path text, p_expected text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  current_path text;
begin
  if actor is null or not edra_auth.session_allowed() then
    return jsonb_build_object('result', 'unauthenticated');
  end if;
  if p_path is not null and (not public.owns_avatar_object(p_path) or not exists (
    select 1 from storage.objects o where o.bucket_id = 'avatars' and o.name = p_path
  )) then
    return jsonb_build_object('result', 'invalid');
  end if;

  select p.avatar_path into current_path from public.profiles p where p.id = actor for update;
  if not found then return jsonb_build_object('result', 'invalid'); end if;
  if current_path is distinct from p_expected then
    return jsonb_build_object('result', 'conflict', 'current', current_path);
  end if;
  if current_path is not distinct from p_path then
    return jsonb_build_object('result', 'saved', 'previous', null);
  end if;

  update public.profiles set avatar_path = p_path where id = actor;
  return jsonb_build_object('result', 'saved', 'previous', current_path);
end;
$$;

revoke all on function public.set_my_avatar(text, text) from public, anon;
grant execute on function public.set_my_avatar(text, text) to authenticated;
