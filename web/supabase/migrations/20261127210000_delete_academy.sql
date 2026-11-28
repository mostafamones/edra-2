-- Owner-only permanent deletion of an entire academy and everything it owns.
-- History guards and foreign keys are triggers, so the purge runs with session_replication_role = replica
-- and walks the foreign key graph itself: every row that would be left pointing at a deleted row is
-- deleted too (or set null/default when its key says so). Storage objects are not removed.

-- Deletes rows of p_rel matching p_cond after the plain (no academy_id) rows that reference them.
-- Tables with an academy_id column are purged directly by delete_academy, so they are not walked here.
create function edra_private.purge_academy_rows(p_rel regclass, p_cond text, p_path regclass[])
returns void
language plpgsql
set search_path = ''
as $$
declare
  fk record;
  child_cols text;
  parent_cols text;
  matches text;
  assignments text;
begin
  for fk in
    select k.conrelid, k.conkey, k.confkey, k.confdeltype, k.confdelsetcols
    from pg_constraint k
    join pg_class c on c.oid = k.conrelid
    where k.contype = 'f' and k.confrelid = p_rel
      and c.relnamespace in ('public'::regnamespace, 'edra_private'::regnamespace, 'edra_auth'::regnamespace)
      and not exists (select 1 from pg_attribute a where a.attrelid = k.conrelid and a.attname = 'academy_id' and not a.attisdropped)
  loop
    select string_agg(quote_ident(a.attname), ', ' order by n) into child_cols
      from unnest(fk.conkey) with ordinality u(attnum, n) join pg_attribute a on a.attrelid = fk.conrelid and a.attnum = u.attnum;
    select string_agg(quote_ident(a.attname), ', ' order by n) into parent_cols
      from unnest(fk.confkey) with ordinality u(attnum, n) join pg_attribute a on a.attrelid = p_rel and a.attnum = u.attnum;
    matches := format('(%s) in (select %s from %s where %s)', child_cols, parent_cols, p_rel, p_cond);

    if fk.confdeltype in ('n', 'd') then
      select string_agg(format('%I = %s', a.attname, case fk.confdeltype when 'n' then 'null' else 'default' end), ', ') into assignments
        from unnest(coalesce(fk.confdelsetcols, fk.conkey)) u(attnum) join pg_attribute a on a.attrelid = fk.conrelid and a.attnum = u.attnum;
      execute format('update %s set %s where %s', fk.conrelid::regclass, assignments, matches);
    elsif fk.conrelid::regclass <> all (p_path || p_rel) then
      perform edra_private.purge_academy_rows(fk.conrelid::regclass, matches, p_path || p_rel);
    end if;
  end loop;
  execute format('delete from %s where %s', p_rel, p_cond);
end;
$$;

revoke all on function edra_private.purge_academy_rows(regclass, text, regclass[]) from public, anon, authenticated;

create function public.delete_academy(p_academy_id uuid, p_confirm_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  academy_name text;
  scoped regclass;
  cond text := format('academy_id = %L', p_academy_id);
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
end;
$$;

revoke all on function public.delete_academy(uuid, text) from public, anon;
grant execute on function public.delete_academy(uuid, text) to authenticated;
