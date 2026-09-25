-- A global account's student setup is separate from academy student records.
create table public.student_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  level_id text references public.global_levels (id),
  parent_phone text,
  parent_phone_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_parent_phone_format check (
    parent_phone is null or parent_phone ~ '^\+201[0125][0-9]{8}$'
  ),
  constraint student_parent_verification_pair check (
    (parent_phone is null) = (parent_phone_verified_at is null)
  ),
  constraint student_level_requires_verified_parent check (
    level_id is null or parent_phone_verified_at is not null
  )
);

create trigger student_profiles_set_updated_at
before update on public.student_profiles
for each row execute function public.set_updated_at();

-- Only the authenticated Edge Function may read or change challenges.
create table public.student_phone_challenges (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  challenge_id uuid not null unique,
  phone text not null check (phone ~ '^\+201[0125][0-9]{8}$'),
  code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  sent_at timestamptz not null,
  expires_at timestamptz not null,
  attempts smallint not null default 0 check (attempts between 0 and 5),
  window_started_at timestamptz not null,
  sends_in_window smallint not null default 1 check (sends_in_window between 1 and 5),
  consumed_at timestamptz,
  constraint student_code_expiry_after_send check (expires_at > sent_at)
);

alter table public.student_profiles enable row level security;
alter table public.student_phone_challenges enable row level security;

revoke all on public.student_profiles from anon, authenticated;
revoke all on public.student_phone_challenges from anon, authenticated;
grant select on public.student_profiles to authenticated;

create policy "student_profiles_select_self"
on public.student_profiles
for select to authenticated
using ((select auth.uid()) = user_id);

-- All mutations run with the Edge Function's service role after it verifies
-- the caller's JWT. The advisory lock also covers the first request for a user.
create or replace function public.start_student_parent_challenge(
  p_user_id uuid,
  p_challenge_id uuid,
  p_phone text,
  p_code_hash text
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  account_phone text;
  existing public.student_phone_challenges%rowtype;
  requested_at timestamptz := now();
  next_window timestamptz;
  next_count smallint;
begin
  if p_user_id is null or p_challenge_id is null
    or p_phone is null or p_phone !~ '^\+201[0125][0-9]{8}$'
    or p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then
    return 'invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));

  select phone into account_phone from public.profiles where id = p_user_id;
  if account_phone is null then return 'account_phone_missing'; end if;
  if account_phone = p_phone then return 'same_phone'; end if;

  if exists (
    select 1 from public.student_profiles
    where user_id = p_user_id and level_id is not null
  ) then
    return 'already_complete';
  end if;

  select * into existing
  from public.student_phone_challenges
  where user_id = p_user_id
  for update;

  if found then
    if existing.sent_at > requested_at - interval '60 seconds' then
      return 'cooldown';
    end if;
    if existing.window_started_at > requested_at - interval '1 hour' then
      if existing.sends_in_window >= 5 then return 'rate_limited'; end if;
      next_window := existing.window_started_at;
      next_count := existing.sends_in_window + 1;
    else
      next_window := requested_at;
      next_count := 1;
    end if;

    update public.student_phone_challenges
    set challenge_id = p_challenge_id,
        phone = p_phone,
        code_hash = p_code_hash,
        sent_at = requested_at,
        expires_at = requested_at + interval '10 minutes',
        attempts = 0,
        window_started_at = next_window,
        sends_in_window = next_count,
        consumed_at = null
    where user_id = p_user_id;
  else
    insert into public.student_phone_challenges (
      user_id, challenge_id, phone, code_hash, sent_at, expires_at,
      window_started_at, sends_in_window
    ) values (
      p_user_id, p_challenge_id, p_phone, p_code_hash, requested_at,
      requested_at + interval '10 minutes', requested_at, 1
    );
  end if;

  return 'sent';
end;
$$;

create or replace function public.verify_student_parent_challenge(
  p_user_id uuid,
  p_challenge_id uuid,
  p_code_hash text
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  challenge public.student_phone_challenges%rowtype;
begin
  if p_user_id is null or p_challenge_id is null
    or p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then
    return 'invalid';
  end if;

  select * into challenge
  from public.student_phone_challenges
  where user_id = p_user_id
  for update;

  if not found or challenge.challenge_id <> p_challenge_id then return 'invalid'; end if;
  if challenge.consumed_at is not null then return 'used'; end if;
  if challenge.expires_at <= now() then return 'expired'; end if;
  if challenge.attempts >= 5 then return 'locked'; end if;

  update public.student_phone_challenges
  set attempts = attempts + 1,
      consumed_at = case when code_hash = p_code_hash then now() else null end
  where user_id = p_user_id;

  if challenge.code_hash <> p_code_hash then return 'invalid'; end if;

  insert into public.student_profiles (
    user_id, parent_phone, parent_phone_verified_at
  ) values (
    p_user_id, challenge.phone, now()
  )
  on conflict (user_id) do update
  set parent_phone = excluded.parent_phone,
      parent_phone_verified_at = excluded.parent_phone_verified_at,
      level_id = null
  where public.student_profiles.level_id is null;

  if not found then return 'already_complete'; end if;
  return 'verified';
end;
$$;

create or replace function public.finish_student_profile(
  p_user_id uuid,
  p_level_id text
)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  if p_user_id is null or p_level_id is null
    or not exists (select 1 from public.global_levels where id = p_level_id) then
    return false;
  end if;

  update public.student_profiles
  set level_id = p_level_id
  where user_id = p_user_id
    and parent_phone_verified_at is not null
    and level_id is null;

  if found then return true; end if;

  return exists (
    select 1 from public.student_profiles
    where user_id = p_user_id
      and parent_phone_verified_at is not null
      and level_id = p_level_id
  );
end;
$$;

revoke all on function public.start_student_parent_challenge(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.verify_student_parent_challenge(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.finish_student_profile(uuid, text) from public, anon, authenticated;
grant execute on function public.start_student_parent_challenge(uuid, uuid, text, text) to service_role;
grant execute on function public.verify_student_parent_challenge(uuid, uuid, text) to service_role;
grant execute on function public.finish_student_profile(uuid, text) to service_role;
