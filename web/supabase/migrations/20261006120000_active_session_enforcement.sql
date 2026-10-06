-- Application authority requires an active, password-authenticated session.
--
-- Recovery: a phone code (signInWithOtp + verifyOtp) yields an ordinary Supabase session whose
-- JWT `amr` records the `otp` method. Such sessions may only set a new password through Auth; they
-- get no data access, RPCs, Realtime, or Storage authority. Signup verification also produces an
-- `otp` session, so the signup flow exchanges it for a password session before entering the app.
--
-- Revocation: sign-out (local or global) and password recovery delete rows from auth.sessions, but
-- already issued access JWTs stay cryptographically valid until expiry. Requests are accepted only
-- while the JWT's session_id still names a live auth.sessions row of the same user.
--
-- Enforcement points:
--   * PostgREST pre-request (every REST/RPC request, including direct calls with a copied token).
--   * The membership helpers used by RLS policies, Realtime channel policies, and RPC role guards.

create schema if not exists edra_auth;
revoke all on schema edra_auth from public;
grant usage on schema edra_auth to anon, authenticated;

-- True unless the request carries an authenticated JWT whose session is revoked, expired, or was
-- established with a phone code. Requests without JWT claims (database owner, migrations, SQL
-- tests) and anon/service_role requests are not user sessions and pass; anon has no academy
-- authority anyway.
create or replace function edra_auth.session_allowed()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims jsonb;
  sid uuid;
  uid uuid;
  limit_at timestamptz;
begin
  begin
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    return false;
  end;
  if claims is null or claims->>'role' is distinct from 'authenticated' then
    return true;
  end if;
  -- Already verified for this session earlier in the same request transaction.
  if current_setting('edra.verified_session', true) = claims->>'session_id' then
    return true;
  end if;
  if jsonb_path_exists(claims, '$.amr[*] ? (@.method == "otp" || @.method == "recovery" || @.method == "magiclink")') then
    return false;
  end if;
  begin
    sid := (claims->>'session_id')::uuid;
    uid := (claims->>'sub')::uuid;
  exception when others then
    return false;
  end;
  if sid is null or uid is null then
    return false;
  end if;
  select s.not_after into limit_at from auth.sessions s where s.id = sid and s.user_id = uid;
  if not found then
    return false;
  end if;
  return limit_at is null or limit_at > now();
end;
$$;

-- PostgREST pre-request hook. Runs in the request transaction after the role switch; a rejected
-- session receives HTTP 401 with code EDRA_SESSION_INACTIVE and no statement runs. A successful
-- check is cached for the rest of the transaction so per-row RLS helper calls stay cheap.
create or replace function edra_auth.check_request()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not edra_auth.session_allowed() then
    raise sqlstate 'PGRST' using
      message = json_build_object(
        'code', 'EDRA_SESSION_INACTIVE',
        'message', 'This session has ended or can only be used to set a new password. Sign in again.')::text,
      detail = json_build_object('status', 401)::text;
  end if;
  if current_setting('request.jwt.claims', true)::jsonb->>'role' = 'authenticated' then
    perform pg_catalog.set_config('edra.verified_session',
      current_setting('request.jwt.claims', true)::jsonb->>'session_id', true);
  end if;
end;
$$;

revoke all on function edra_auth.session_allowed() from public, anon, authenticated;
revoke all on function edra_auth.check_request() from public;
grant execute on function edra_auth.check_request() to anon, authenticated;

alter role authenticator set pgrst.db_pre_request = 'edra_auth.check_request';
notify pgrst, 'reload config';

-- Membership helpers deny every academy role to an inactive or recovery-only session. This covers
-- RLS reads, Realtime channel policies, Storage policies, and the RPC role guards built on them,
-- including non-PostgREST entry points where the pre-request hook does not run.
create or replace function public.is_academy_member(target_academy_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select edra_auth.session_allowed() and exists (
    select 1
    from public.academy_memberships
    where academy_id = target_academy_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.academy_role_for(target_academy_id uuid)
returns public.academy_role
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.academy_memberships
  where academy_id = target_academy_id
    and user_id = auth.uid()
    and edra_auth.session_allowed();
$$;

create or replace function public.shares_academy_with(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select edra_auth.session_allowed() and (target_user_id = auth.uid() or exists (
    select 1
    from public.academy_memberships mine
    join public.academy_memberships theirs
      on theirs.academy_id = mine.academy_id
    where mine.user_id = auth.uid()
      and theirs.user_id = target_user_id
  ));
$$;
