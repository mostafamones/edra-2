-- Included with \ir by suites that build rich academy history, to prove delete_academy removes all of it.
-- pg_temp.delete_and_check(academy, owner) deletes as the owner, then fails if any academy row or any
-- foreign key orphan remains in the application schemas.
create function pg_temp.delete_and_check(p_academy uuid, p_owner uuid) returns void language plpgsql as $$
declare
  fk record;
  t record;
  n bigint;
  problems text[] := '{}';
  joined text;
  present text;
begin
  perform set_config('request.jwt.claim.sub', p_owner::text, true);
  set local role authenticated;
  perform public.delete_academy(p_academy, (select name from public.academies where id = p_academy));
  reset role;

  for t in select c.oid::regclass as rel from pg_class c join pg_attribute a on a.attrelid = c.oid and a.attname = 'academy_id'
    where c.relkind in ('r', 'p') and c.relnamespace in ('public'::regnamespace, 'edra_private'::regnamespace, 'edra_auth'::regnamespace)
  loop
    execute format('select count(*) from %s where academy_id = %L', t.rel, p_academy) into n;
    if n > 0 then problems := problems || format('%s keeps %s rows', t.rel, n); end if;
  end loop;

  for fk in select k.conname, k.conrelid::regclass as child, k.confrelid::regclass as parent, k.conkey, k.confkey, k.conrelid, k.confrelid
    from pg_constraint k join pg_class c on c.oid = k.conrelid
    where k.contype = 'f' and c.relnamespace in ('public'::regnamespace, 'edra_private'::regnamespace, 'edra_auth'::regnamespace)
  loop
    select string_agg(format('p.%I = c.%I', pa.attname, ca.attname), ' and '), string_agg(format('c.%I is not null', ca.attname), ' and ')
      into joined, present
      from unnest(fk.conkey, fk.confkey) u(ck, pk)
      join pg_attribute ca on ca.attrelid = fk.conrelid and ca.attnum = u.ck
      join pg_attribute pa on pa.attrelid = fk.confrelid and pa.attnum = u.pk;
    execute format('select count(*) from %s c where %s and not exists (select 1 from %s p where %s)', fk.child, present, fk.parent, joined) into n;
    if n > 0 then problems := problems || format('%s orphans %s rows', fk.conname, n); end if;
  end loop;

  if cardinality(problems) > 0 then raise exception 'FAILED: academy delete left %', problems; end if;
end;
$$;
