-- EDRA-126: code-verified password change from account settings.
--
-- The `account-password` Edge Function verifies the caller's JWT, refuses phone-code sessions, and
-- calls these security-definer functions, executable only by the service role. One challenge row per account; a new request
-- supersedes the previous challenge and any grant it produced. Every step is bound to the account,
-- the originating live Auth session and the verified account phone at request time, so a proof
-- cannot be used from another session, after sign-out, or after the phone changes.
--
-- Codes: six digits, HMAC-hashed by the function, ten-minute expiry, five attempts, one-minute
-- resend interval and five sends per hour (the existing verified-contact limits). A verified code
-- grants ten minutes to set a password, with at most three completion attempts. Each completion
-- claims a 30-second lease so competing completions are serialized; an uncertain Auth response
-- leaves the lease to expire and still consumes an attempt.

create table public.account_password_challenges (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  challenge_id uuid not null unique,
  session_id uuid not null,
  phone text not null,
  code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  sent_at timestamptz not null,
  expires_at timestamptz not null,
  attempts smallint not null default 0 check (attempts between 0 and 5),
  window_started_at timestamptz not null,
  sends_in_window smallint not null default 1 check (sends_in_window between 1 and 5),
  verified_at timestamptz,
  grant_expires_at timestamptz,
  completion_attempts smallint not null default 0 check (completion_attempts between 0 and 3),
  claimed_until timestamptz,
  consumed_at timestamptz,
  constraint account_password_expiry_after_send check (expires_at > sent_at),
  constraint account_password_grant_pair check ((verified_at is null) = (grant_expires_at is null))
);

alter table public.account_password_challenges enable row level security;
revoke all on public.account_password_challenges from anon, authenticated;

-- The challenge's session is still a live Auth session of the account and its phone is unchanged.
create or replace function edra_private.password_challenge_current(c public.account_password_challenges)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.sessions s join auth.users u on u.id = s.user_id
    where s.id = c.session_id and s.user_id = c.user_id
      and (s.not_after is null or s.not_after > now())
      and u.phone = c.phone and u.phone_confirmed_at is not null
  );
$$;

revoke all on function edra_private.password_challenge_current(public.account_password_challenges) from public, anon, authenticated;

create or replace function public.start_account_password_challenge(
  p_user_id uuid, p_session_id uuid, p_challenge_id uuid, p_code_hash text
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  account_phone text;
  existing public.account_password_challenges%rowtype;
  requested_at timestamptz := now();
  next_window timestamptz := now();
  next_count smallint := 1;
begin
  if p_user_id is null or p_session_id is null or p_challenge_id is null
    or p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('result', 'invalid');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('account_password:' || p_user_id::text, 0));

  if not exists (
    select 1 from auth.sessions s where s.id = p_session_id and s.user_id = p_user_id
      and (s.not_after is null or s.not_after > now())
  ) then
    return jsonb_build_object('result', 'session_inactive');
  end if;
  select u.phone into account_phone from auth.users u
  where u.id = p_user_id and u.phone_confirmed_at is not null and nullif(u.phone, '') is not null;
  if account_phone is null then return jsonb_build_object('result', 'phone_unverified'); end if;

  select * into existing from public.account_password_challenges where user_id = p_user_id for update;
  if found then
    if existing.sent_at > requested_at - interval '60 seconds' then
      return jsonb_build_object('result', 'cooldown', 'retry_at', existing.sent_at + interval '60 seconds');
    end if;
    if existing.window_started_at > requested_at - interval '1 hour' then
      if existing.sends_in_window >= 5 then
        return jsonb_build_object('result', 'rate_limited', 'retry_at', existing.window_started_at + interval '1 hour');
      end if;
      next_window := existing.window_started_at;
      next_count := existing.sends_in_window + 1;
    end if;
  end if;

  insert into public.account_password_challenges as c (
    user_id, challenge_id, session_id, phone, code_hash, sent_at, expires_at, window_started_at, sends_in_window
  ) values (
    p_user_id, p_challenge_id, p_session_id, account_phone, p_code_hash, requested_at,
    requested_at + interval '10 minutes', next_window, next_count
  )
  on conflict (user_id) do update set
    challenge_id = excluded.challenge_id, session_id = excluded.session_id, phone = excluded.phone,
    code_hash = excluded.code_hash, sent_at = excluded.sent_at, expires_at = excluded.expires_at,
    attempts = 0, window_started_at = excluded.window_started_at, sends_in_window = excluded.sends_in_window,
    verified_at = null, grant_expires_at = null, completion_attempts = 0, claimed_until = null, consumed_at = null;

  return jsonb_build_object('result', 'sent', 'phone', account_phone,
    'expires_at', requested_at + interval '10 minutes', 'retry_at', requested_at + interval '60 seconds');
end;
$$;

-- Returns verified, invalid, used, expired, locked or session_inactive.
create or replace function public.verify_account_password_challenge(
  p_user_id uuid, p_session_id uuid, p_challenge_id uuid, p_code_hash text
)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  c public.account_password_challenges%rowtype;
begin
  if p_user_id is null or p_session_id is null or p_challenge_id is null
    or p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then
    return 'invalid';
  end if;
  select * into c from public.account_password_challenges where user_id = p_user_id for update;
  if not found or c.challenge_id <> p_challenge_id or c.session_id <> p_session_id then return 'invalid'; end if;
  if c.consumed_at is not null then return 'used'; end if;
  if not edra_private.password_challenge_current(c) then return 'session_inactive'; end if;
  if c.verified_at is not null then
    return case when c.code_hash = p_code_hash then 'verified' else 'invalid' end;
  end if;
  if c.expires_at <= now() then return 'expired'; end if;
  if c.attempts >= 5 then return 'locked'; end if;

  update public.account_password_challenges set
    attempts = attempts + 1,
    verified_at = case when code_hash = p_code_hash then now() end,
    grant_expires_at = case when code_hash = p_code_hash then now() + interval '10 minutes' end
  where user_id = p_user_id;
  return case when c.code_hash = p_code_hash then 'verified' else 'invalid' end;
end;
$$;

-- Claims one completion attempt. Returns claimed, invalid, used, unverified, expired, locked, busy
-- or session_inactive.
create or replace function public.claim_account_password_change(
  p_user_id uuid, p_session_id uuid, p_challenge_id uuid
)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  c public.account_password_challenges%rowtype;
begin
  if p_user_id is null or p_session_id is null or p_challenge_id is null then return 'invalid'; end if;
  select * into c from public.account_password_challenges where user_id = p_user_id for update;
  if not found or c.challenge_id <> p_challenge_id or c.session_id <> p_session_id then return 'invalid'; end if;
  if c.consumed_at is not null then return 'used'; end if;
  if c.verified_at is null then return 'unverified'; end if;
  if not edra_private.password_challenge_current(c) then return 'session_inactive'; end if;
  if c.grant_expires_at <= now() then return 'expired'; end if;
  if c.claimed_until > now() then return 'busy'; end if;
  if c.completion_attempts >= 3 then return 'locked'; end if;

  update public.account_password_challenges
  set completion_attempts = completion_attempts + 1, claimed_until = now() + interval '30 seconds'
  where user_id = p_user_id;
  return 'claimed';
end;
$$;

-- Ends a claimed completion: `p_changed` consumes the challenge; otherwise (Auth definitively
-- rejected the password) the lease is released so the user may retry within the grant.
create or replace function public.finish_account_password_change(
  p_user_id uuid, p_challenge_id uuid, p_changed boolean
)
returns void
language sql security definer set search_path = '' as $$
  update public.account_password_challenges
  set claimed_until = null, consumed_at = case when p_changed then now() else consumed_at end
  where user_id = p_user_id and challenge_id = p_challenge_id and consumed_at is null;
$$;

create or replace function public.cancel_account_password_challenge(p_user_id uuid, p_challenge_id uuid)
returns void
language sql security definer set search_path = '' as $$
  update public.account_password_challenges set consumed_at = now()
  where user_id = p_user_id and challenge_id = p_challenge_id and consumed_at is null;
$$;

revoke all on function public.start_account_password_challenge(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.verify_account_password_challenge(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.claim_account_password_change(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.finish_account_password_change(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.cancel_account_password_challenge(uuid, uuid) from public, anon, authenticated;
grant execute on function public.start_account_password_challenge(uuid, uuid, uuid, text) to service_role;
grant execute on function public.verify_account_password_challenge(uuid, uuid, uuid, text) to service_role;
grant execute on function public.claim_account_password_change(uuid, uuid, uuid) to service_role;
grant execute on function public.finish_account_password_change(uuid, uuid, boolean) to service_role;
grant execute on function public.cancel_account_password_challenge(uuid, uuid) to service_role;
