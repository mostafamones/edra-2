-- Session authority: phone-code (recovery) sessions and revoked or expired sessions get no
-- application authority, through the PostgREST pre-request hook or the membership helpers.
-- Run with `npm run test:db` against the marked isolated test target (see docs/engineering.md).
-- Everything runs in one transaction that is rolled back.

do $$ begin
  if has_function_privilege('anon', 'public.academy_role_for(uuid)', 'execute')
    or has_function_privilege('authenticated', 'edra_auth.session_allowed()', 'execute')
    or not has_function_privilege('authenticated', 'edra_auth.check_request()', 'execute') then
    raise exception 'Session authority grants are wrong';
  end if;
end $$;

begin;

create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$
begin
  execute statement;
  raise exception 'expected error "%" but the statement succeeded: %', expected, statement using errcode = 'XX001';
exception
  when sqlstate 'XX001' then raise;
  when others then
    if sqlerrm not like expected then
      raise exception 'expected error "%" but got "%": %', expected, sqlerrm, statement;
    end if;
end;
$$;

-- Acts as a JWT with the given session and authentication method; clears the per-request cache.
create function pg_temp.act(session_id text, method text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', '81111111-1111-4111-8111-111111111111', 'role', 'authenticated', 'session_id', session_id,
    'amr', jsonb_build_array(jsonb_build_object('method', method, 'timestamp', 1)))::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('edra.verified_session', '', true);
end;
$$;

insert into auth.users (id) values ('81111111-1111-4111-8111-111111111111'), ('82222222-2222-4222-8222-222222222222');
insert into public.academies (id, name, slug, icon, subject, created_by) values
  ('88888888-8888-4888-8888-888888888888', 'Academy U', 'academy-u', 'school', 'Math', '81111111-1111-4111-8111-111111111111');
insert into public.academy_memberships (academy_id, user_id, role, created_by) values
  ('88888888-8888-4888-8888-888888888888', '81111111-1111-4111-8111-111111111111', 'owner', '81111111-1111-4111-8111-111111111111');
insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('8a111111-1111-4111-8111-111111111111', '81111111-1111-4111-8111-111111111111', now(), now()),
  ('8b111111-1111-4111-8111-111111111111', '81111111-1111-4111-8111-111111111111', now(), now()),
  ('8c111111-1111-4111-8111-111111111111', '81111111-1111-4111-8111-111111111111', now(), now()),
  ('8d222222-2222-4222-8222-222222222222', '82222222-2222-4222-8222-222222222222', now(), now());
update auth.sessions set not_after = now() - interval '1 minute' where id = '8c111111-1111-4111-8111-111111111111';

grant usage on schema public, auth to authenticated, anon;
set local role authenticated;

-- An active password session has its normal authority.
select pg_temp.act('8a111111-1111-4111-8111-111111111111', 'password');
select edra_auth.check_request();
do $$ begin
  if public.academy_role_for('88888888-8888-4888-8888-888888888888') is distinct from 'owner'
    or not public.is_academy_member('88888888-8888-4888-8888-888888888888')
    or not exists (select 1 from public.academies where id = '88888888-8888-4888-8888-888888888888') then
    raise exception 'An active password session lost access';
  end if;
end $$;

-- A phone-code session (recovery or direct verifyOtp) of an existing session row has none.
select pg_temp.act('8b111111-1111-4111-8111-111111111111', 'otp');
select pg_temp.expect_error($s$ select edra_auth.check_request() $s$, '%EDRA_SESSION_INACTIVE%');
do $$ begin
  if public.academy_role_for('88888888-8888-4888-8888-888888888888') is not null
    or public.is_academy_member('88888888-8888-4888-8888-888888888888')
    or public.shares_academy_with('81111111-1111-4111-8111-111111111111')
    or exists (select 1 from public.academies where id = '88888888-8888-4888-8888-888888888888') then
    raise exception 'A phone-code session has application authority';
  end if;
end $$;
select pg_temp.expect_error($s$ select public.delete_session('88888888-8888-4888-8888-888888888888',
  '8e111111-1111-4111-8111-111111111111') $s$, 'forbidden');

-- Expired (time-boxed) sessions, unknown sessions, another user's session, and a missing
-- session_id are rejected.
select pg_temp.act('8c111111-1111-4111-8111-111111111111', 'password');
select pg_temp.expect_error($s$ select edra_auth.check_request() $s$, '%EDRA_SESSION_INACTIVE%');
select pg_temp.act('8f111111-1111-4111-8111-111111111111', 'password');
select pg_temp.expect_error($s$ select edra_auth.check_request() $s$, '%EDRA_SESSION_INACTIVE%');
select pg_temp.act('8d222222-2222-4222-8222-222222222222', 'password');
select pg_temp.expect_error($s$ select edra_auth.check_request() $s$, '%EDRA_SESSION_INACTIVE%');
select pg_temp.act(null, 'password');
select pg_temp.expect_error($s$ select edra_auth.check_request() $s$, '%EDRA_SESSION_INACTIVE%');

-- Sign-out removes the session row: the still-unexpired JWT loses access immediately.
reset role;
delete from auth.sessions where id = '8a111111-1111-4111-8111-111111111111';
set local role authenticated;
select pg_temp.act('8a111111-1111-4111-8111-111111111111', 'password');
select pg_temp.expect_error($s$ select edra_auth.check_request() $s$, '%EDRA_SESSION_INACTIVE%');
do $$ begin
  if public.is_academy_member('88888888-8888-4888-8888-888888888888') then
    raise exception 'A signed-out session kept access';
  end if;
end $$;

-- Anonymous requests pass the hook but have no academy authority.
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select edra_auth.check_request();
select pg_temp.expect_error($s$ select public.academy_role_for('88888888-8888-4888-8888-888888888888') $s$, '%permission denied%');
reset role;

rollback;
