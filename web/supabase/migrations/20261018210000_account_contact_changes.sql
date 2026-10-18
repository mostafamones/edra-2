-- EDRA-127: verified login-phone and parent-contact replacement from account settings.
--
-- The `account-contact` Edge Function verifies the caller's JWT, refuses phone-code sessions and
-- calls these security-definer functions, executable only by the service role. One row per account
-- and purpose; a new start supersedes the previous operation and every proof it held.
--
-- An operation binds the account, purpose, originating live Auth session, the expected old contact
-- and the normalized replacement before any code is sent. Stages: `old` (code to the old contact)
-- → `new` (code to the replacement) → completion. Parent replacement commits in the same
-- transaction that verifies the new code. Login replacement moves to `verified`, then `committing`
-- while the function asks Auth to update the user; the guard trigger on auth.users accepts the
-- phone change only for a committing operation whose expected old and replacement match, and
-- completes the operation inside Auth's own transaction. Auth's change and proof consumption
-- therefore commit or roll back together, and a late Auth write after the operation was released,
-- canceled or superseded is rejected.
--
-- Codes: six digits, HMAC-hashed by the function (bound to purpose, stage, account, operation and
-- recipient), ten-minute expiry, five attempts per code. Sends: one-minute interval and five per hour
-- for each stage, kept across superseded operations so switching targets does not reset them.
-- Both proofs grant ten minutes to commit, with at most three commit attempts.

create table public.account_contact_changes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  purpose text not null check (purpose in ('login_phone', 'parent_phone')),
  operation_id uuid not null unique,
  session_id uuid not null,
  -- auth.users format (no plus) for login_phone; E.164 for parent_phone, as stored by each source.
  old_phone text not null,
  new_phone text not null check (new_phone ~ '^\+201[0125][0-9]{8}$'),
  stage text not null check (stage in ('old', 'new', 'verified', 'committing', 'completed', 'canceled')),
  code_hash text check (code_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz,
  attempts smallint not null default 0 check (attempts between 0 and 5),
  commit_attempts smallint not null default 0 check (commit_attempts between 0 and 3),
  old_sent_at timestamptz,
  old_window_started_at timestamptz,
  old_sends smallint not null default 0 check (old_sends between 0 and 5),
  new_sent_at timestamptz,
  new_window_started_at timestamptz,
  new_sends smallint not null default 0 check (new_sends between 0 and 5),
  updated_at timestamptz not null default now(),
  primary key (user_id, purpose),
  constraint account_contact_parent_only_e164 check (purpose = 'login_phone' or old_phone ~ '^\+201[0125][0-9]{8}$'),
  constraint account_contact_terminal_has_no_code check (stage not in ('completed', 'canceled') or code_hash is null)
);

alter table public.account_contact_changes enable row level security;
revoke all on public.account_contact_changes from public, anon, authenticated;

create or replace function edra_private.digits(p_phone text)
returns text language sql immutable set search_path = '' as $$
  select pg_catalog.ltrim(coalesce(p_phone, ''), '+');
$$;

-- The originating session is still live for the account.
create or replace function edra_private.contact_session_live(p_user_id uuid, p_session_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.sessions s
    where s.id = p_session_id and s.user_id = p_user_id and (s.not_after is null or s.not_after > now())
  );
$$;

-- The account's current verified contact for a purpose, in its stored format; null when absent.
create or replace function edra_private.current_contact(p_user_id uuid, p_purpose text)
returns text language sql stable security definer set search_path = '' as $$
  select case p_purpose
    when 'login_phone' then (
      select nullif(u.phone, '') from auth.users u where u.id = p_user_id and u.phone_confirmed_at is not null)
    when 'parent_phone' then (
      select sp.parent_phone from public.student_profiles sp
      where sp.user_id = p_user_id and sp.level_id is not null and sp.parent_phone_verified_at is not null)
  end;
$$;

-- Validates a replacement against the account's other contacts and login uniqueness. Rechecked at
-- commit. Returns null when acceptable.
create or replace function edra_private.contact_replacement_problem(p_user_id uuid, p_purpose text, p_new_phone text)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when edra_private.digits(p_new_phone) = edra_private.digits(edra_private.current_contact(p_user_id, p_purpose)) then 'same_phone'
    when p_purpose = 'login_phone' and exists (
      select 1 from auth.users u where u.phone = edra_private.digits(p_new_phone) and u.id <> p_user_id) then 'phone_taken'
    when p_purpose = 'login_phone' and exists (
      select 1 from public.student_profiles sp where sp.user_id = p_user_id and sp.parent_phone = p_new_phone) then 'parent_phone'
    when p_purpose = 'parent_phone' and exists (
      select 1 from auth.users u where u.id = p_user_id and u.phone = edra_private.digits(p_new_phone)) then 'account_phone'
  end;
$$;

-- Locks and returns the caller's operation after checking its identity, session and expected old
-- contact. A stale operation is canceled. Result: ok, invalid, used, session_inactive or stale.
create or replace function edra_private.lock_contact_change(
  p_user_id uuid, p_session_id uuid, p_operation_id uuid, out result text, out c public.account_contact_changes
)
language plpgsql security definer set search_path = '' as $$
begin
  select * into c from public.account_contact_changes where operation_id = p_operation_id for update;
  if not found or c.user_id is distinct from p_user_id or c.session_id is distinct from p_session_id then
    result := 'invalid'; return;
  end if;
  if c.stage in ('completed', 'canceled') then result := 'used'; return; end if;
  if c.stage = 'committing' then result := 'ok'; return; end if;
  if not edra_private.contact_session_live(p_user_id, p_session_id) then result := 'session_inactive'; return; end if;
  if c.old_phone is distinct from edra_private.current_contact(p_user_id, c.purpose) then
    update public.account_contact_changes set stage = 'canceled', code_hash = null, expires_at = null, updated_at = now()
    where operation_id = p_operation_id;
    result := 'stale'; return;
  end if;
  result := 'ok';
end;
$$;

-- Records one send for a stage after the cooldown and hourly checks. Result: sent, cooldown or
-- rate_limited, with retry_at.
create or replace function edra_private.contact_send_allowed(c public.account_contact_changes, p_stage text)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  sent_at timestamptz := case p_stage when 'old' then c.old_sent_at else c.new_sent_at end;
  window_at timestamptz := case p_stage when 'old' then c.old_window_started_at else c.new_window_started_at end;
  sends smallint := case p_stage when 'old' then c.old_sends else c.new_sends end;
begin
  if sent_at > now() - interval '60 seconds' then
    return jsonb_build_object('result', 'cooldown', 'retry_at', sent_at + interval '60 seconds');
  end if;
  if window_at > now() - interval '1 hour' and sends >= 5 then
    return jsonb_build_object('result', 'rate_limited', 'retry_at', window_at + interval '1 hour');
  end if;
  return jsonb_build_object('result', 'sent');
end;
$$;

create or replace function edra_private.record_contact_send(p_operation_id uuid, p_stage text, p_code_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c public.account_contact_changes%rowtype;
begin
  update public.account_contact_changes x set
    code_hash = p_code_hash, attempts = 0, expires_at = now() + interval '10 minutes', updated_at = now(),
    old_sent_at = case when p_stage = 'old' then now() else x.old_sent_at end,
    old_window_started_at = case when p_stage <> 'old' then x.old_window_started_at
      when x.old_window_started_at > now() - interval '1 hour' then x.old_window_started_at else now() end,
    old_sends = case when p_stage <> 'old' then x.old_sends
      when x.old_window_started_at > now() - interval '1 hour' then x.old_sends + 1 else 1 end,
    new_sent_at = case when p_stage = 'new' then now() else x.new_sent_at end,
    new_window_started_at = case when p_stage <> 'new' then x.new_window_started_at
      when x.new_window_started_at > now() - interval '1 hour' then x.new_window_started_at else now() end,
    new_sends = case when p_stage <> 'new' then x.new_sends
      when x.new_window_started_at > now() - interval '1 hour' then x.new_sends + 1 else 1 end
  where operation_id = p_operation_id
  returning * into c;
  return jsonb_build_object('result', 'sent', 'stage', p_stage,
    'recipient', case p_stage when 'old' then c.old_phone else c.new_phone end,
    'expires_at', c.expires_at, 'retry_at', now() + interval '60 seconds');
end;
$$;

-- Starts (or supersedes) the account's operation for a purpose and records the code to the old
-- contact. `p_expected_old` is the contact the function read from Auth or the student profile.
create or replace function public.start_contact_change(
  p_user_id uuid, p_session_id uuid, p_purpose text, p_operation_id uuid,
  p_expected_old text, p_new_phone text, p_code_hash text
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  existing public.account_contact_changes%rowtype;
  current_old text;
  problem text;
  allowed jsonb;
begin
  if p_user_id is null or p_session_id is null or p_operation_id is null
    or p_purpose is null or p_purpose not in ('login_phone', 'parent_phone')
    or p_new_phone is null or p_new_phone !~ '^\+201[0125][0-9]{8}$'
    or p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('result', 'invalid');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('account_contact:' || p_user_id::text || ':' || p_purpose, 0));

  if not edra_private.contact_session_live(p_user_id, p_session_id) then
    return jsonb_build_object('result', 'session_inactive');
  end if;
  current_old := edra_private.current_contact(p_user_id, p_purpose);
  if current_old is null then
    return jsonb_build_object('result', case p_purpose when 'login_phone' then 'phone_unverified' else 'not_student' end);
  end if;
  if current_old is distinct from p_expected_old then return jsonb_build_object('result', 'stale'); end if;
  problem := edra_private.contact_replacement_problem(p_user_id, p_purpose, p_new_phone);
  if problem is not null then return jsonb_build_object('result', problem); end if;

  select * into existing from public.account_contact_changes where user_id = p_user_id and purpose = p_purpose for update;
  if found then
    -- A commit in flight is settled before it may be superseded.
    if existing.stage = 'committing' then return jsonb_build_object('result', 'busy'); end if;
    allowed := edra_private.contact_send_allowed(existing, 'old');
    if allowed ->> 'result' <> 'sent' then return allowed; end if;
    update public.account_contact_changes set
      operation_id = p_operation_id, session_id = p_session_id, old_phone = current_old, new_phone = p_new_phone,
      stage = 'old', code_hash = null, expires_at = null, attempts = 0, commit_attempts = 0, updated_at = now()
    where user_id = p_user_id and purpose = p_purpose;
  else
    insert into public.account_contact_changes (user_id, purpose, operation_id, session_id, old_phone, new_phone, stage)
    values (p_user_id, p_purpose, p_operation_id, p_session_id, current_old, p_new_phone, 'old');
  end if;

  return edra_private.record_contact_send(p_operation_id, 'old', p_code_hash);
end;
$$;

-- Sends a fresh code for the operation's current code stage (`p_stage`, old or new).
create or replace function public.resend_contact_change_code(
  p_user_id uuid, p_session_id uuid, p_operation_id uuid, p_stage text, p_code_hash text
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  locked record;
  allowed jsonb;
begin
  if p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('result', 'invalid'); end if;
  select * into locked from edra_private.lock_contact_change(p_user_id, p_session_id, p_operation_id);
  if locked.result <> 'ok' then return jsonb_build_object('result', locked.result); end if;
  if (locked.c).stage is distinct from p_stage or p_stage not in ('old', 'new') then return jsonb_build_object('result', 'invalid'); end if;
  allowed := edra_private.contact_send_allowed(locked.c, p_stage);
  if allowed ->> 'result' <> 'sent' then return allowed; end if;
  return edra_private.record_contact_send(p_operation_id, p_stage, p_code_hash);
end;
$$;

-- Verifies the current stage's code. Old → new (the function then sends the new code). New → for
-- parent_phone, commits the replacement in this transaction; for login_phone, grants the commit.
-- Result: next, completed, verified, invalid_code, expired, locked, unsent, invalid, used,
-- session_inactive, stale or a replacement problem.
create or replace function public.verify_contact_change_code(
  p_user_id uuid, p_session_id uuid, p_operation_id uuid, p_stage text, p_code_hash text
)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  locked record;
  c public.account_contact_changes%rowtype;
  problem text;
begin
  if p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then return 'invalid'; end if;
  select * into locked from edra_private.lock_contact_change(p_user_id, p_session_id, p_operation_id);
  if locked.result <> 'ok' then return locked.result; end if;
  c := locked.c;
  if c.stage is distinct from p_stage or p_stage not in ('old', 'new') then return 'invalid'; end if;
  if c.code_hash is null then return 'unsent'; end if;
  if c.expires_at <= now() then return 'expired'; end if;
  if c.attempts >= 5 then return 'locked'; end if;

  if c.code_hash <> p_code_hash then
    update public.account_contact_changes set attempts = attempts + 1, updated_at = now() where operation_id = p_operation_id;
    return 'invalid_code';
  end if;

  if p_stage = 'old' then
    update public.account_contact_changes set stage = 'new', code_hash = null, expires_at = null, attempts = 0, updated_at = now()
    where operation_id = p_operation_id;
    return 'next';
  end if;

  problem := edra_private.contact_replacement_problem(p_user_id, c.purpose, c.new_phone);
  if problem is not null then
    update public.account_contact_changes set stage = 'canceled', code_hash = null, expires_at = null, updated_at = now()
    where operation_id = p_operation_id;
    return problem;
  end if;

  if c.purpose = 'parent_phone' then
    -- Level and setup completion are untouched; the guard on the old value keeps this conditional.
    update public.student_profiles set parent_phone = c.new_phone, parent_phone_verified_at = now()
    where user_id = p_user_id and parent_phone = c.old_phone and level_id is not null;
    if not found then
      update public.account_contact_changes set stage = 'canceled', code_hash = null, expires_at = null, updated_at = now()
      where operation_id = p_operation_id;
      return 'stale';
    end if;
    update public.account_contact_changes set stage = 'completed', code_hash = null, expires_at = null, updated_at = now()
    where operation_id = p_operation_id;
    return 'completed';
  end if;

  update public.account_contact_changes
  set stage = 'verified', code_hash = null, attempts = 0, expires_at = now() + interval '10 minutes', updated_at = now()
  where operation_id = p_operation_id;
  return 'verified';
end;
$$;

-- Claims one login commit attempt. Result: claimed (with the replacement), busy, expired, locked,
-- unverified, invalid, used, session_inactive, stale or a replacement problem.
create or replace function public.claim_login_phone_change(p_user_id uuid, p_session_id uuid, p_operation_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  locked record;
  c public.account_contact_changes%rowtype;
  problem text;
begin
  select * into locked from edra_private.lock_contact_change(p_user_id, p_session_id, p_operation_id);
  if locked.result <> 'ok' then return jsonb_build_object('result', locked.result); end if;
  c := locked.c;
  if c.purpose <> 'login_phone' then return jsonb_build_object('result', 'invalid'); end if;
  if c.stage = 'committing' then return jsonb_build_object('result', 'busy'); end if;
  if c.stage <> 'verified' then return jsonb_build_object('result', 'unverified'); end if;
  if c.expires_at <= now() or c.commit_attempts >= 3 then
    update public.account_contact_changes set stage = 'canceled', expires_at = null, updated_at = now()
    where operation_id = p_operation_id;
    return jsonb_build_object('result', case when c.commit_attempts >= 3 then 'locked' else 'expired' end);
  end if;
  problem := edra_private.contact_replacement_problem(p_user_id, c.purpose, c.new_phone);
  if problem is not null then
    update public.account_contact_changes set stage = 'canceled', expires_at = null, updated_at = now()
    where operation_id = p_operation_id;
    return jsonb_build_object('result', problem);
  end if;
  update public.account_contact_changes set stage = 'committing', commit_attempts = commit_attempts + 1, updated_at = now()
  where operation_id = p_operation_id;
  return jsonb_build_object('result', 'claimed', 'phone', c.new_phone);
end;
$$;

-- Settles a login commit after Auth answered, failed or timed out. Under the operation's row lock it
-- either observes the completion written by the guard trigger, or releases the claim so a delayed
-- Auth write is rejected. `p_end` ends the operation instead (Auth refused the number).
-- Result: completed, retry or ended.
create or replace function public.settle_login_phone_change(p_user_id uuid, p_operation_id uuid, p_end boolean)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  c public.account_contact_changes%rowtype;
begin
  select * into c from public.account_contact_changes
  where operation_id = p_operation_id and user_id = p_user_id and purpose = 'login_phone' for update;
  if not found then return 'ended'; end if;
  if c.stage = 'completed' then return 'completed'; end if;
  if c.stage <> 'committing' then return case when c.stage = 'verified' then 'retry' else 'ended' end; end if;
  if p_end or c.commit_attempts >= 3 or c.expires_at <= now() then
    update public.account_contact_changes set stage = 'canceled', expires_at = null, updated_at = now()
    where operation_id = p_operation_id;
    return 'ended';
  end if;
  update public.account_contact_changes set stage = 'verified', updated_at = now() where operation_id = p_operation_id;
  return 'retry';
end;
$$;

create or replace function public.cancel_contact_change(p_user_id uuid, p_operation_id uuid)
returns text
language plpgsql security definer set search_path = '' as $$
begin
  update public.account_contact_changes set stage = 'canceled', code_hash = null, expires_at = null, updated_at = now()
  where operation_id = p_operation_id and user_id = p_user_id and stage in ('old', 'new', 'verified');
  if found then return 'canceled'; end if;
  return case when exists (
    select 1 from public.account_contact_changes where operation_id = p_operation_id and user_id = p_user_id and stage = 'committing'
  ) then 'busy' else 'used' end;
end;
$$;

-- Platform guard: Auth may replace a confirmed phone only for this account's committing settings
-- operation with the same expected old number and replacement. This also covers Auth's own phone
-- change API (`updateUser({ phone })` + `phone_change` verification) and administrator updates,
-- which would otherwise skip the old-number proof. The operation is completed in Auth's transaction.
create or replace function edra_private.guard_auth_phone_change()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  c public.account_contact_changes%rowtype;
begin
  if old.phone_confirmed_at is null or nullif(old.phone, '') is null then return new; end if;
  select * into c from public.account_contact_changes where user_id = new.id and purpose = 'login_phone' for update;
  if not found or c.stage <> 'committing' or c.old_phone is distinct from old.phone
    or edra_private.digits(c.new_phone) is distinct from new.phone then
    raise exception using errcode = 'P0001', message = 'phone_change_requires_verification';
  end if;
  update public.account_contact_changes set stage = 'completed', code_hash = null, expires_at = null, updated_at = now()
  where user_id = new.id and purpose = 'login_phone';
  return new;
end;
$$;

create trigger guard_auth_phone_change
before update of phone on auth.users
for each row
when (old.phone is distinct from new.phone)
execute function edra_private.guard_auth_phone_change();

revoke all on function edra_private.digits(text) from public, anon, authenticated;
revoke all on function edra_private.contact_session_live(uuid, uuid) from public, anon, authenticated;
revoke all on function edra_private.current_contact(uuid, text) from public, anon, authenticated;
revoke all on function edra_private.contact_replacement_problem(uuid, text, text) from public, anon, authenticated;
revoke all on function edra_private.lock_contact_change(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function edra_private.contact_send_allowed(public.account_contact_changes, text) from public, anon, authenticated;
revoke all on function edra_private.record_contact_send(uuid, text, text) from public, anon, authenticated;
revoke all on function edra_private.guard_auth_phone_change() from public, anon, authenticated;
revoke all on function public.start_contact_change(uuid, uuid, text, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.resend_contact_change_code(uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.verify_contact_change_code(uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.claim_login_phone_change(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.settle_login_phone_change(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.cancel_contact_change(uuid, uuid) from public, anon, authenticated;
grant execute on function public.start_contact_change(uuid, uuid, text, uuid, text, text, text) to service_role;
grant execute on function public.resend_contact_change_code(uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.verify_contact_change_code(uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.claim_login_phone_change(uuid, uuid, uuid) to service_role;
grant execute on function public.settle_login_phone_change(uuid, uuid, boolean) to service_role;
grant execute on function public.cancel_contact_change(uuid, uuid) to service_role;
grant select on public.account_contact_changes to service_role;
