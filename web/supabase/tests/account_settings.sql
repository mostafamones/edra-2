-- Personal account settings (EDRA-126): profile column grants and constraints, self-only profile
-- writes without academy membership, avatar object ownership and session authority, race-safe
-- avatar switching, and the password-change challenge lifecycle.
-- Run with `npm run test:db` against the disposable GitHub Actions database (see docs/engineering.md).
-- Everything runs in one transaction that is rolled back. Separate-session races are not covered.

begin;

create function pg_temp.check(condition boolean, message text) returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'FAILED: %', message; end if;
end;
$$;

create function pg_temp.fails(statement text) returns boolean language plpgsql as $$
begin
  execute statement;
  return false;
exception when others then
  return true;
end;
$$;

-- Acts as a JWT for the given account, session and authentication method.
create function pg_temp.act(account uuid, session_id uuid, method text default 'password') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', account, 'role', 'authenticated', 'session_id', session_id,
    'amr', jsonb_build_array(jsonb_build_object('method', method, 'timestamp', 1)))::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('edra.verified_session', '', true);
end;
$$;

do $$ begin
  perform pg_temp.check(
    has_column_privilege('authenticated', 'public.profiles', 'full_name', 'update')
    and has_column_privilege('authenticated', 'public.profiles', 'display_name', 'update')
    and not has_column_privilege('authenticated', 'public.profiles', 'avatar_path', 'update')
    and not has_column_privilege('authenticated', 'public.profiles', 'phone', 'update')
    and not has_column_privilege('anon', 'public.profiles', 'full_name', 'update')
    and has_function_privilege('authenticated', 'public.set_my_avatar(text, text)', 'execute')
    and not has_function_privilege('anon', 'public.set_my_avatar(text, text)', 'execute')
    and not has_table_privilege('authenticated', 'public.account_password_challenges', 'select')
    and not has_table_privilege('anon', 'public.account_password_challenges', 'select')
    and not has_function_privilege('authenticated', 'public.start_account_password_challenge(uuid, uuid, uuid, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.verify_account_password_challenge(uuid, uuid, uuid, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.claim_account_password_change(uuid, uuid, uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.finish_account_password_change(uuid, uuid, boolean)', 'execute')
    and has_function_privilege('service_role', 'public.claim_account_password_change(uuid, uuid, uuid)', 'execute'),
    'account grants');
end $$;

insert into auth.users (id, phone, phone_confirmed_at, raw_user_meta_data) values
  ('9a111111-1111-4111-8111-111111111111', '201290000001', now(), '{"full_name":"Sara Hassan"}'),
  ('9a222222-2222-4222-8222-222222222222', '201290000002', now(), '{"full_name":"Other Person"}');
insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('9b111111-1111-4111-8111-111111111111', '9a111111-1111-4111-8111-111111111111', now(), now()),
  ('9b111112-1111-4111-8111-111111111111', '9a111111-1111-4111-8111-111111111111', now(), now()),
  ('9b222222-2222-4222-8222-222222222222', '9a222222-2222-4222-8222-222222222222', now(), now());

-- Signup initialization is unchanged; constraints reject blank, untrimmed or oversized names.
do $$ begin
  perform pg_temp.check((select full_name = 'Sara Hassan' and display_name is null and avatar_path is null
    from public.profiles where id = '9a111111-1111-4111-8111-111111111111'), 'signup profile');
  perform pg_temp.check(pg_temp.fails($s$ update public.profiles set full_name = '   ' where id = '9a111111-1111-4111-8111-111111111111' $s$), 'blank full name');
  perform pg_temp.check(pg_temp.fails($s$ update public.profiles set display_name = ' Sara ' where id = '9a111111-1111-4111-8111-111111111111' $s$), 'untrimmed display name');
  perform pg_temp.check(pg_temp.fails($s$ update public.profiles set display_name = '' where id = '9a111111-1111-4111-8111-111111111111' $s$), 'empty display name');
  perform pg_temp.check(pg_temp.fails(format('update public.profiles set display_name = %L where id = %L', repeat('a', 201), '9a111111-1111-4111-8111-111111111111')), 'long display name');
  perform pg_temp.check(pg_temp.fails($s$ update public.profiles set avatar_path = '9a222222-2222-4222-8222-222222222222/9c000000-0000-4000-8000-000000000000.webp' where id = '9a111111-1111-4111-8111-111111111111' $s$), 'foreign avatar path');
end $$;

insert into storage.objects (bucket_id, name) values
  ('avatars', '9a111111-1111-4111-8111-111111111111/9c111111-1111-4111-8111-111111111111.webp'),
  ('avatars', '9a111111-1111-4111-8111-111111111111/9c111112-1111-4111-8111-111111111111.webp'),
  ('avatars', '9a222222-2222-4222-8222-222222222222/9c222222-2222-4222-8222-222222222222.webp');

grant usage on schema public, auth, storage to authenticated;
set local role authenticated;

-- A student account with no academy maintains its own profile, and only its own.
do $$
declare
  rows integer;
begin
  perform pg_temp.act('9a111111-1111-4111-8111-111111111111', '9b111111-1111-4111-8111-111111111111');
  update public.profiles set full_name = 'سارة حسن محمود', display_name = 'سارة' where id = '9a111111-1111-4111-8111-111111111111';
  get diagnostics rows = row_count;
  perform pg_temp.check(rows = 1, 'own profile update');
  perform pg_temp.check((select display_name from public.profiles where id = auth.uid()) = 'سارة', 'own profile read');
  update public.profiles set full_name = 'Hijacked' where id = '9a222222-2222-4222-8222-222222222222';
  get diagnostics rows = row_count;
  perform pg_temp.check(rows = 0, 'other profile is not writable');
  perform pg_temp.check(pg_temp.fails($s$ update public.profiles set avatar_path = null where id = auth.uid() $s$), 'avatar path is not directly writable');
end $$;

-- Avatar ownership needs the owner's folder and a live password session.
do $$
declare
  mine constant text := '9a111111-1111-4111-8111-111111111111/9c111111-1111-4111-8111-111111111111.webp';
  theirs constant text := '9a222222-2222-4222-8222-222222222222/9c222222-2222-4222-8222-222222222222.webp';
  result jsonb;
begin
  perform pg_temp.act('9a111111-1111-4111-8111-111111111111', '9b111111-1111-4111-8111-111111111111');
  perform pg_temp.check(public.owns_avatar_object(mine) and not public.owns_avatar_object(theirs)
    and not public.owns_avatar_object('9a111111-1111-4111-8111-111111111111/x.png')
    and not public.owns_avatar_object('9a111111-1111-4111-8111-111111111111/../' || theirs), 'avatar object ownership');
  perform pg_temp.check((select count(*) from storage.objects where bucket_id = 'avatars') = 2, 'owner sees only own objects');
  perform pg_temp.check(pg_temp.fails(format($s$ insert into storage.objects (bucket_id, name) values ('avatars', %L) $s$,
    '9a222222-2222-4222-8222-222222222222/9c333333-3333-4333-8333-333333333333.webp')), 'no upload into another folder');

  perform pg_temp.check(public.set_my_avatar(theirs, null) ->> 'result' = 'invalid', 'cannot adopt another account''s object');
  perform pg_temp.check(public.set_my_avatar('9a111111-1111-4111-8111-111111111111/9c999999-9999-4999-8999-999999999999.webp', null) ->> 'result' = 'invalid', 'object must exist');
  result := public.set_my_avatar(mine, null);
  perform pg_temp.check(result ->> 'result' = 'saved' and result -> 'previous' = 'null'::jsonb, 'first avatar saved');
  -- A competing change that saw no avatar loses and must clean up its own upload.
  result := public.set_my_avatar('9a111111-1111-4111-8111-111111111111/9c111112-1111-4111-8111-111111111111.webp', null);
  perform pg_temp.check(result ->> 'result' = 'conflict' and result ->> 'current' = mine, 'losing replace');
  result := public.set_my_avatar('9a111111-1111-4111-8111-111111111111/9c111112-1111-4111-8111-111111111111.webp', mine);
  perform pg_temp.check(result ->> 'result' = 'saved' and result ->> 'previous' = mine, 'replace returns the superseded object');
  perform pg_temp.check(public.set_my_avatar(null, mine) ->> 'result' = 'conflict', 'losing remove');
  result := public.set_my_avatar(null, '9a111111-1111-4111-8111-111111111111/9c111112-1111-4111-8111-111111111111.webp');
  perform pg_temp.check(result ->> 'result' = 'saved' and result ->> 'previous' like '%9c111112%', 'remove');

  -- Recovery, revoked and wrong-account sessions get nothing.
  perform pg_temp.act('9a111111-1111-4111-8111-111111111111', '9b111111-1111-4111-8111-111111111111', 'otp');
  perform pg_temp.check(not public.owns_avatar_object(mine), 'recovery session owns nothing');
  perform pg_temp.check((select count(*) from storage.objects where bucket_id = 'avatars') = 0, 'recovery session reads nothing');
  perform pg_temp.check(public.set_my_avatar(mine, null) ->> 'result' = 'unauthenticated', 'recovery session cannot set avatar');
  perform pg_temp.act('9a111111-1111-4111-8111-111111111111', '9b999999-9999-4999-8999-999999999999');
  perform pg_temp.check(not public.owns_avatar_object(mine), 'revoked session owns nothing');
  perform pg_temp.act('9a111111-1111-4111-8111-111111111111', '9b222222-2222-4222-8222-222222222222');
  perform pg_temp.check(not public.owns_avatar_object(mine), 'another account''s session owns nothing');
end $$;

-- The functions are service-role only (checked above); fixtures change auth rows as the owner.
reset role;

-- Password-change challenge: request, verification, grant and completion.
do $$
declare
  me constant uuid := '9a111111-1111-4111-8111-111111111111';
  s1 constant uuid := '9b111111-1111-4111-8111-111111111111';
  s2 constant uuid := '9b111112-1111-4111-8111-111111111111';
  c1 constant uuid := '9d111111-1111-4111-8111-111111111111';
  c2 constant uuid := '9d222222-2222-4222-8222-222222222222';
  good constant text := repeat('a', 64);
  bad constant text := repeat('b', 64);
  started jsonb;
begin
  started := public.start_account_password_challenge(me, s1, c1, good);
  perform pg_temp.check(started ->> 'result' = 'sent' and started ->> 'phone' = '201290000001', 'challenge sent to the verified account phone');
  perform pg_temp.check(public.start_account_password_challenge(me, s1, c2, good) ->> 'result' = 'cooldown', 'resend cooldown');
  perform pg_temp.check(public.start_account_password_challenge(me, '9b999999-9999-4999-8999-999999999999', c2, good) ->> 'result' = 'session_inactive', 'revoked session cannot request');
  perform pg_temp.check(public.start_account_password_challenge(me, '9b222222-2222-4222-8222-222222222222', c2, good) ->> 'result' = 'session_inactive', 'other account session cannot request');

  perform pg_temp.check(public.claim_account_password_change(me, s1, c1) = 'unverified', 'code is mandatory');
  perform pg_temp.check(public.verify_account_password_challenge(me, s1, c1, bad) = 'invalid', 'wrong code');
  perform pg_temp.check(public.verify_account_password_challenge(me, s2, c1, good) = 'invalid', 'other session cannot verify');
  perform pg_temp.check(public.verify_account_password_challenge(me, s1, c1, good) = 'verified', 'right code');
  perform pg_temp.check(public.claim_account_password_change(me, s2, c1) = 'invalid', 'proof is bound to its session');
  perform pg_temp.check(public.claim_account_password_change('9a222222-2222-4222-8222-222222222222', s1, c1) = 'invalid', 'proof is bound to its account');

  perform pg_temp.check(public.claim_account_password_change(me, s1, c1) = 'claimed', 'first completion');
  perform pg_temp.check(public.claim_account_password_change(me, s1, c1) = 'busy', 'competing completion');
  perform public.finish_account_password_change(me, c1, false);
  perform pg_temp.check(public.claim_account_password_change(me, s1, c1) = 'claimed', 'retry after rejected password');
  perform public.finish_account_password_change(me, c1, false);
  perform pg_temp.check(public.claim_account_password_change(me, s1, c1) = 'claimed', 'third attempt');
  perform public.finish_account_password_change(me, c1, false);
  perform pg_temp.check(public.claim_account_password_change(me, s1, c1) = 'locked', 'completion attempts are bounded');

  -- A new request supersedes the old challenge and its grant.
  update public.account_password_challenges set sent_at = now() - interval '2 minutes' where user_id = me;
  perform pg_temp.check(public.start_account_password_challenge(me, s1, c2, good) ->> 'result' = 'sent', 'new challenge');
  perform pg_temp.check(public.claim_account_password_change(me, s1, c1) = 'invalid', 'superseded proof');
  perform pg_temp.check(public.verify_account_password_challenge(me, s1, c2, good) = 'verified', 'verify new challenge');

  -- A phone change or sign-out of the originating session makes the proof unusable.
  -- Unconfirmed first: the EDRA-127 guard only lets settings replace a confirmed phone.
  update auth.users set phone_confirmed_at = null where id = me;
  update auth.users set phone = '201290000009', phone_confirmed_at = now() where id = me;
  perform pg_temp.check(public.claim_account_password_change(me, s1, c2) = 'session_inactive', 'phone changed during verification');
  update auth.users set phone_confirmed_at = null where id = me;
  update auth.users set phone = '201290000001', phone_confirmed_at = now() where id = me;
  update public.account_password_challenges set grant_expires_at = now() - interval '1 second' where user_id = me;
  perform pg_temp.check(public.claim_account_password_change(me, s1, c2) = 'expired', 'expired grant');
  update public.account_password_challenges set grant_expires_at = now() + interval '5 minutes' where user_id = me;
  perform pg_temp.check(public.claim_account_password_change(me, s1, c2) = 'claimed', 'claim for success');
  perform public.finish_account_password_change(me, c2, true);
  perform pg_temp.check(public.claim_account_password_change(me, s1, c2) = 'used', 'no replay after success');
  perform pg_temp.check(public.verify_account_password_challenge(me, s1, c2, good) = 'used', 'no re-verify after success');

  -- Expiry, attempt lockout, cancellation, revocation and the hourly limit.
  update public.account_password_challenges set sent_at = now() - interval '2 minutes' where user_id = me;
  perform public.start_account_password_challenge(me, s1, c1, good);
  update public.account_password_challenges set expires_at = now() - interval '1 second', sent_at = now() - interval '11 minutes' where user_id = me;
  perform pg_temp.check(public.verify_account_password_challenge(me, s1, c1, good) = 'expired', 'expired code');
  perform public.start_account_password_challenge(me, s1, c2, good);
  for i in 1..5 loop perform public.verify_account_password_challenge(me, s1, c2, bad); end loop;
  perform pg_temp.check(public.verify_account_password_challenge(me, s1, c2, good) = 'locked', 'attempt lockout');
  update public.account_password_challenges set sent_at = now() - interval '2 minutes' where user_id = me;
  perform public.start_account_password_challenge(me, s1, c1, good);
  perform public.cancel_account_password_challenge(me, c1);
  perform pg_temp.check(public.verify_account_password_challenge(me, s1, c1, good) = 'used', 'canceled challenge');
  update public.account_password_challenges set sent_at = now() - interval '2 minutes' where user_id = me;
  perform pg_temp.check(public.start_account_password_challenge(me, s1, c2, good) ->> 'result' = 'rate_limited', 'hourly send limit');
  update public.account_password_challenges set sends_in_window = 1, window_started_at = now(), sent_at = now() - interval '2 minutes' where user_id = me;
  perform public.start_account_password_challenge(me, s1, c1, good);
  delete from auth.sessions where id = s1;
  perform pg_temp.check(public.verify_account_password_challenge(me, s1, c1, good) = 'session_inactive', 'signed-out session');
end $$;

rollback;
