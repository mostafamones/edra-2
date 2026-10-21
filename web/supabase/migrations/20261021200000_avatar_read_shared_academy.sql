-- Team pages show each member's picture: let a signed-in user (live password session) read the
-- avatar objects of accounts that share an academy with them. Writes stay owner-only.
create policy avatars_select_shared_academy on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and edra_auth.session_allowed()
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    and public.shares_academy_with(((storage.foldername(name))[1])::uuid)
  );
