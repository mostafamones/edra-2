-- Supabase Auth stores phone values without the leading plus sign.
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
  if pg_catalog.ltrim(account_phone, '+') = pg_catalog.ltrim(p_phone, '+') then
    return 'same_phone';
  end if;

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
