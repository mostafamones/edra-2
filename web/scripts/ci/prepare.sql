-- Runs once on the fresh GitHub Actions instance after `supabase db start` (scripts/db-ci.sh), in
-- one transaction: asserts the managed Supabase objects and permission baseline the suites rely on,
-- pauses the deadline cron jobs so they cannot race the explicit worker assertions, and marks the
-- instance as the isolated target. Never run it against any other database.
\set ON_ERROR_STOP 1
begin;
select 'db-ci: ' || version();

do $check$
declare missing text;
begin
  if current_setting('server_version_num')::int / 10000 <> 17 then
    raise exception 'expected PostgreSQL 17, got %', current_setting('server_version');
  end if;
  select string_agg(n, ', ') into missing
  from unnest(array['auth', 'storage', 'realtime', 'cron', 'extensions', 'supabase_migrations']) n
  where to_regnamespace(n) is null;
  if missing is not null then raise exception 'missing schemas: %', missing; end if;
  select string_agg(r, ', ') into missing
  from unnest(array['anon', 'authenticated', 'service_role']) r
  where not exists (select 1 from pg_roles where rolname = r);
  if missing is not null then raise exception 'missing roles: %', missing; end if;
  select string_agg(e, ', ') into missing
  from unnest(array['pgcrypto', 'pg_cron']) e
  where not exists (select 1 from pg_extension where extname = e);
  if missing is not null then raise exception 'missing extensions: %', missing; end if;
  select string_agg(c, ', ') into missing
  from unnest(array['auth.users.id', 'auth.users.phone', 'auth.users.phone_confirmed_at', 'auth.sessions.id',
    'auth.sessions.user_id', 'storage.objects.bucket_id', 'storage.buckets.id', 'realtime.messages.topic']) c
  where not exists (
    select 1 from information_schema.columns
    where table_schema || '.' || table_name || '.' || column_name = c);
  if missing is not null then raise exception 'missing managed columns: %', missing; end if;
  if to_regprocedure('auth.uid()') is null then raise exception 'missing function auth.uid()'; end if;

  -- The cloud default-privilege baseline restored by roles.sql must still be in force.
  select string_agg(want.objtype || ' ' || want.priv || ' to ' || want.grantee, ', ') into missing
  from (
    select t.objtype, p.priv, g.grantee
    from (values ('r', array['SELECT', 'INSERT', 'UPDATE', 'DELETE']), ('S', array['USAGE', 'SELECT']),
      ('f', array['EXECUTE'])) t(objtype, privs)
    cross join lateral unnest(t.privs) p(priv)
    cross join unnest(array['anon', 'authenticated', 'service_role']) g(grantee)
  ) want
  where not exists (
    select 1 from pg_default_acl d, aclexplode(d.defaclacl) a
    where d.defaclrole = 'postgres'::regrole and d.defaclnamespace = 'public'::regnamespace
      and d.defaclobjtype = want.objtype::"char" and a.grantee = want.grantee::regrole
      and a.privilege_type = want.priv);
  if missing is not null then raise exception 'default privileges differ from the cloud baseline: %', missing; end if;

  -- Both deadline workers must be registered exactly as their migrations define them.
  select string_agg(want.name, ', ') into missing
  from (values ('edra-quiz-deadlines', 'select edra_private.run_quiz_deadlines(50)'),
    ('edra-exam-deadlines', 'select edra_private.run_exam_deadlines(50)')) want(name, command)
  where not exists (
    select 1 from cron.job j
    where j.jobname = want.name and j.schedule = '30 seconds' and j.command = want.command and j.active);
  if missing is not null then raise exception 'cron jobs missing or changed: %', missing; end if;
end
$check$;

-- Pause, not unschedule: the jobs, extension and worker functions stay in place.
select cron.alter_job(jobid, active := false) from cron.job
where jobname in ('edra-quiz-deadlines', 'edra-exam-deadlines');
do $check$
begin
  if exists (select 1 from cron.job where jobname in ('edra-quiz-deadlines', 'edra-exam-deadlines') and active) then
    raise exception 'deadline cron jobs are still active';
  end if;
end
$check$;

create schema edra_db_test;
create table edra_db_test.target (name text primary key);
revoke all on schema edra_db_test from public, anon, authenticated;
insert into edra_db_test.target values (:'target');
commit;
