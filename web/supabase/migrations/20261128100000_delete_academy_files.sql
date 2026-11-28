-- delete_academy now returns the academy's uploaded files (bucket and object name) so the server can remove
-- the bytes through the Storage API once the database delete has committed. Direct deletes from
-- storage.objects would leave the bytes in the store, so the database only reports them.

drop function public.delete_academy(uuid, text);

create function public.delete_academy(p_academy_id uuid, p_confirm_name text)
returns table(bucket_id text, name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  academy_name text;
  scoped regclass;
  cond text := format('academy_id = %L', p_academy_id);
  files jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select a.name into academy_name from public.academies a where a.id = p_academy_id for update;
  if academy_name is null or not exists (
    select 1 from public.academy_memberships m
    where m.academy_id = p_academy_id and m.user_id = auth.uid() and m.role = 'owner' and m.suspended_at is null
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_confirm_name is distinct from academy_name then
    raise exception 'academy_name_mismatch' using errcode = '22023';
  end if;

  -- Uploads live under '<academy id>/' in these buckets; avatars belong to accounts and stay. The caller removes the
  -- bytes through the Storage API after this transaction commits, so the list is captured before the rows go.
  select coalesce(jsonb_agg(jsonb_build_object('bucket_id', o.bucket_id, 'name', o.name)), '[]') into files
    from storage.objects o
    where o.bucket_id in ('assignment-images', 'assignment-work', 'content-documents') and o.name like p_academy_id::text || '/%';

  perform set_config('session_replication_role', 'replica', true);
  for scoped in
    select c.oid::regclass
    from pg_class c
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'academy_id' and not a.attisdropped
    where c.relkind in ('r', 'p') and not c.relispartition
      and c.relnamespace in ('public'::regnamespace, 'edra_private'::regnamespace, 'edra_auth'::regnamespace)
  loop
    perform edra_private.purge_academy_rows(scoped, cond, '{}');
  end loop;
  perform edra_private.purge_academy_rows('public.academies'::regclass, format('id = %L', p_academy_id), '{}');
  perform set_config('session_replication_role', 'origin', true);
  return query select f.bucket_id, f.name from jsonb_to_recordset(files) f(bucket_id text, name text);
end;
$$;

revoke all on function public.delete_academy(uuid, text) from public, anon;
grant execute on function public.delete_academy(uuid, text) to authenticated;
