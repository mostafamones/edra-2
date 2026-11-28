-- Permanent academy deletion: Owner only, exact name confirmation, nothing left behind, other academies untouched.
-- Run with `npm run test:db` against the disposable GitHub Actions database (see docs/engineering.md).
-- Everything runs in one transaction that is rolled back. Any failed assertion aborts with an error.

begin;

\ir helpers/academy_delete.sql

create function pg_temp.check(condition boolean, message text) returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'FAILED: %', message; end if;
end;
$$;

-- The error message raised by statement as `who`, or null when it succeeds.
create function pg_temp.error_as(who uuid, statement text) returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(who::text, ''), true);
  set local role authenticated;
  execute statement;
  reset role;
  return null;
exception when others then
  reset role;
  return sqlerrm;
end;
$$;

insert into auth.users (id, phone, phone_confirmed_at) values
  ('de111111-1111-4111-8111-111111111111', '201066700001', now()),  -- owner of P
  ('de222222-2222-4222-8222-222222222222', '201066700002', now()),  -- head admin of P
  ('de333333-3333-4333-8333-333333333333', '201066700003', now());  -- owner of Q

insert into public.academies (id, name, slug, icon, subject, created_by) values
  ('dededede-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Delete Academy P', 'delete-academy-p', 'school', 'Math', 'de111111-1111-4111-8111-111111111111'),
  ('dededede-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Delete Academy Q', 'delete-academy-q', 'book', 'Science', 'de333333-3333-4333-8333-333333333333');

insert into public.academy_memberships (academy_id, user_id, role, created_by) values
  ('dededede-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'de111111-1111-4111-8111-111111111111', 'owner', 'de111111-1111-4111-8111-111111111111'),
  ('dededede-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'de222222-2222-4222-8222-222222222222', 'head_admin', 'de111111-1111-4111-8111-111111111111'),
  ('dededede-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'de333333-3333-4333-8333-333333333333', 'owner', 'de333333-3333-4333-8333-333333333333'),
  ('dededede-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'de222222-2222-4222-8222-222222222222', 'admin', 'de333333-3333-4333-8333-333333333333');

do $$
declare
  p constant uuid := 'dededede-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  call_p constant text := 'select public.delete_academy(''dededede-aaaa-4aaa-8aaa-aaaaaaaaaaaa'', %L)';
begin
  perform pg_temp.check(not has_function_privilege('anon', 'public.delete_academy(uuid, text)', 'execute'), 'anon cannot call');
  perform pg_temp.check(pg_temp.error_as(null, format(call_p, 'Delete Academy P')) = 'not_authenticated', 'signed out refused');
  perform pg_temp.check(pg_temp.error_as('de222222-2222-4222-8222-222222222222', format(call_p, 'Delete Academy P')) = 'forbidden', 'head admin refused');
  perform pg_temp.check(pg_temp.error_as('de333333-3333-4333-8333-333333333333', format(call_p, 'Delete Academy P')) = 'forbidden', 'other academy owner refused');
  perform pg_temp.check(pg_temp.error_as('de111111-1111-4111-8111-111111111111', format(call_p, 'delete academy p')) = 'academy_name_mismatch', 'case-different name refused');
  perform pg_temp.check(pg_temp.error_as('de111111-1111-4111-8111-111111111111', format(call_p, 'Delete Academy P ')) = 'academy_name_mismatch', 'padded name refused');
  perform pg_temp.check(pg_temp.error_as('de111111-1111-4111-8111-111111111111', format(call_p, null)) = 'academy_name_mismatch', 'missing name refused');

  set local session_replication_role = replica;
  update public.academy_memberships set suspended_at = now() where academy_id = p and role = 'owner';
  set local session_replication_role = origin;
  perform pg_temp.check(pg_temp.error_as('de111111-1111-4111-8111-111111111111', format(call_p, 'Delete Academy P')) = 'forbidden', 'suspended owner refused');
  set local session_replication_role = replica;
  update public.academy_memberships set suspended_at = null where academy_id = p and role = 'owner';
  set local session_replication_role = origin;

  perform pg_temp.check(exists (select 1 from public.academies where id = p) and exists (select 1 from public.academic_years where academy_id = p),
    'refused calls change nothing');
end $$;

select pg_temp.delete_and_check('dededede-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'de111111-1111-4111-8111-111111111111');

do $$ begin
  perform pg_temp.check(current_setting('session_replication_role') = 'origin', 'triggers re-enabled after delete');
  perform pg_temp.check(not exists (select 1 from public.academies where id = 'dededede-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'academy gone');
  perform pg_temp.check(exists (select 1 from public.academies where id = 'dededede-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
    and (select count(*) = 2 from public.academy_memberships where academy_id = 'dededede-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
    and exists (select 1 from public.academic_years where academy_id = 'dededede-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 'other academy untouched');
  perform pg_temp.check((select count(*) = 3 from public.profiles where id::text like 'de%'), 'accounts kept');
end $$;

rollback;
select 'academy delete checks passed';
