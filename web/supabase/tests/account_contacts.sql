-- Verified contact changes (EDRA-127): grants, old-and-new proofs for login and parent phones,
-- stage/purpose/session binding, stale and superseded operations, send limits across targets,
-- login uniqueness, the auth.users phone guard (Auth commit and proof consumption in one
-- transaction, late writes rejected) and preserved student setup.
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

-- Distinct 64-hex stand-ins for the function's HMAC values.
create function pg_temp.h(label text) returns text language sql as $$ select encode(extensions.digest(label, 'sha256'), 'hex') $$;

do $$ begin
  perform pg_temp.check(
    not has_table_privilege('authenticated', 'public.account_contact_changes', 'select')
    and not has_table_privilege('anon', 'public.account_contact_changes', 'select')
    and not has_function_privilege('authenticated', 'public.start_contact_change(uuid, uuid, text, uuid, text, text, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.verify_contact_change_code(uuid, uuid, uuid, text, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.claim_login_phone_change(uuid, uuid, uuid)', 'execute')
    and not has_function_privilege('anon', 'public.settle_login_phone_change(uuid, uuid, boolean)', 'execute')
    and has_function_privilege('service_role', 'public.start_contact_change(uuid, uuid, text, uuid, text, text, text)', 'execute')
    and not has_column_privilege('authenticated', 'public.student_profiles', 'parent_phone', 'update'),
    'contact grants');
end $$;

insert into auth.users (id, phone, phone_confirmed_at, raw_user_meta_data) values
  ('9c111111-1111-4111-8111-111111111111', '201290000101', now(), '{"full_name":"Contact Owner"}'),
  ('9c222222-2222-4222-8222-222222222222', '201290000102', now(), '{"full_name":"Other Person"}');
insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('9d111111-1111-4111-8111-111111111111', '9c111111-1111-4111-8111-111111111111', now(), now()),
  ('9d111112-1111-4111-8111-111111111111', '9c111111-1111-4111-8111-111111111111', now(), now()),
  ('9d222222-2222-4222-8222-222222222222', '9c222222-2222-4222-8222-222222222222', now(), now());
insert into public.student_profiles (user_id, parent_phone, parent_phone_verified_at, level_id) values
  ('9c111111-1111-4111-8111-111111111111', '+201290000301', now(), 'preparatory-3'),
  ('9c222222-2222-4222-8222-222222222222', '+201290000302', now(), 'preparatory-3');

do $$
declare
  me uuid := '9c111111-1111-4111-8111-111111111111';
  other uuid := '9c222222-2222-4222-8222-222222222222';
  s1 uuid := '9d111111-1111-4111-8111-111111111111';
  s2 uuid := '9d111112-1111-4111-8111-111111111111';
  so uuid := '9d222222-2222-4222-8222-222222222222';
  o1 uuid := '9e000001-0000-4000-8000-000000000001';
  o2 uuid := '9e000002-0000-4000-8000-000000000002';
  o3 uuid := '9e000003-0000-4000-8000-000000000003';
  p1 uuid := '9e000011-0000-4000-8000-000000000011';
  p2 uuid := '9e000012-0000-4000-8000-000000000012';
  result jsonb;
  op public.account_contact_changes%rowtype;
begin
  -- Start: the expected old contact must be current; equal, taken and parent numbers are refused.
  perform pg_temp.check(public.start_contact_change(me, s1, 'login_phone', o1, '201290000999', '+201290000201', pg_temp.h('o')) ->> 'result' = 'stale', 'expected old must match');
  perform pg_temp.check(public.start_contact_change(me, s1, 'login_phone', o1, '201290000101', '+201290000101', pg_temp.h('o')) ->> 'result' = 'same_phone', 'equal number');
  perform pg_temp.check(public.start_contact_change(me, s1, 'login_phone', o1, '201290000101', '+201290000102', pg_temp.h('o')) ->> 'result' = 'phone_taken', 'login uniqueness');
  perform pg_temp.check(public.start_contact_change(me, s1, 'login_phone', o1, '201290000101', '+201290000301', pg_temp.h('o')) ->> 'result' = 'parent_phone', 'own parent phone');
  perform pg_temp.check(public.start_contact_change(me, s1, 'login_phone', o1, '201290000101', 'bad', pg_temp.h('o')) ->> 'result' = 'invalid', 'format');
  perform pg_temp.check(public.start_contact_change(me, '9d999999-9999-4999-8999-999999999999', 'login_phone', o1, '201290000101', '+201290000201', pg_temp.h('o')) ->> 'result' = 'session_inactive', 'session required');

  result := public.start_contact_change(me, s1, 'login_phone', o1, '201290000101', '+201290000201', pg_temp.h('o1-old'));
  perform pg_temp.check(result ->> 'result' = 'sent' and result ->> 'recipient' = '201290000101', 'old code goes to the current number');
  perform pg_temp.check(public.start_contact_change(me, s1, 'login_phone', o2, '201290000101', '+201290000202', pg_temp.h('x')) ->> 'result' = 'cooldown', 'cooldown blocks switching targets');

  -- Binding: other accounts, sessions, stages and completion before both proofs are refused.
  perform pg_temp.check(public.verify_contact_change_code(other, so, o1, 'old', pg_temp.h('o1-old')) = 'invalid', 'cross-account');
  perform pg_temp.check(public.verify_contact_change_code(me, s2, o1, 'old', pg_temp.h('o1-old')) = 'invalid', 'other session');
  perform pg_temp.check(public.verify_contact_change_code(me, s1, o1, 'new', pg_temp.h('o1-old')) = 'invalid', 'wrong stage');
  perform pg_temp.check(public.claim_login_phone_change(me, s1, o1) ->> 'result' = 'unverified', 'old-only completion refused');
  perform pg_temp.check(public.verify_contact_change_code(me, s1, o1, 'old', pg_temp.h('wrong')) = 'invalid_code', 'wrong code');
  perform pg_temp.check(public.verify_contact_change_code(me, s1, o1, 'old', pg_temp.h('o1-old')) = 'next', 'old proof');
  perform pg_temp.check(public.verify_contact_change_code(me, s1, o1, 'new', pg_temp.h('o1-old')) = 'unsent', 'no new code yet');
  perform pg_temp.check(public.claim_login_phone_change(me, s1, o1) ->> 'result' = 'unverified', 'new proof required');
  result := public.resend_contact_change_code(me, s1, o1, 'new', pg_temp.h('o1-new'));
  perform pg_temp.check(result ->> 'result' = 'sent' and result ->> 'recipient' = '+201290000201', 'new code goes to the replacement');
  perform pg_temp.check(public.verify_contact_change_code(me, s1, o1, 'new', pg_temp.h('o1-old')) = 'invalid_code', 'old code cannot satisfy new stage');
  perform pg_temp.check(public.verify_contact_change_code(me, s1, o1, 'new', pg_temp.h('o1-new')) = 'verified', 'new proof');

  -- The guard: nothing but this committing operation may replace the confirmed phone.
  perform pg_temp.check(pg_temp.fails(format('update auth.users set phone = %L where id = %L', '201290000201', me)), 'verified but unclaimed write refused');
  perform pg_temp.check(public.claim_login_phone_change(me, s1, o1) ->> 'result' = 'claimed', 'claim');
  perform pg_temp.check(public.claim_login_phone_change(me, s1, o1) ->> 'result' = 'busy', 'competing claim');
  perform pg_temp.check(public.cancel_contact_change(me, o1) = 'busy', 'cannot cancel a commit in flight');
  perform pg_temp.check(pg_temp.fails(format('update auth.users set phone = %L where id = %L', '201290000299', me)), 'different replacement refused');

  -- Settling releases the claim; a delayed Auth write after that is rejected.
  perform pg_temp.check(public.settle_login_phone_change(me, o1, false) = 'retry', 'release');
  perform pg_temp.check(pg_temp.fails(format('update auth.users set phone = %L where id = %L', '201290000201', me)), 'late write after release refused');
  perform pg_temp.check((select phone from auth.users where id = me) = '201290000101', 'old number stays authoritative');

  -- Auth's write completes the operation in the same transaction and syncs the profile.
  perform pg_temp.check(public.claim_login_phone_change(me, s1, o1) ->> 'result' = 'claimed', 'reclaim');
  update auth.users set phone = '201290000201' where id = me;
  select * into op from public.account_contact_changes where operation_id = o1;
  perform pg_temp.check(op.stage = 'completed' and op.code_hash is null, 'consumed with the Auth change');
  perform pg_temp.check((select phone from public.profiles where id = me) = '201290000201', 'profile synced');
  perform pg_temp.check(public.settle_login_phone_change(me, o1, false) = 'completed', 'settle observes completion');
  perform pg_temp.check(public.claim_login_phone_change(me, s1, o1) ->> 'result' = 'used', 'no replay');
  perform pg_temp.check(public.verify_contact_change_code(me, s1, o1, 'new', pg_temp.h('o1-new')) = 'used', 'no re-verify');
  perform pg_temp.check(pg_temp.fails(format('update auth.users set phone = %L where id = %L', '201290000101', me)), 'completed operation cannot authorize another write');
  perform pg_temp.check((select level_id from public.student_profiles where user_id = me) = 'preparatory-3', 'login change keeps student setup');

  -- Send limits persist across superseded operations (switching targets).
  update public.account_contact_changes set old_sent_at = now() - interval '2 minutes' where user_id = me and purpose = 'login_phone';
  perform pg_temp.check(public.start_contact_change(me, s1, 'login_phone', o2, '201290000201', '+201290000203', pg_temp.h('o2')) ->> 'result' = 'sent', 'second operation');
  update public.account_contact_changes set old_sent_at = now() - interval '2 minutes', old_sends = 5 where user_id = me and purpose = 'login_phone';
  perform pg_temp.check(public.start_contact_change(me, s1, 'login_phone', o3, '201290000201', '+201290000204', pg_temp.h('o3')) ->> 'result' = 'rate_limited', 'hourly limit across targets');
  update public.account_contact_changes set old_sends = 1 where user_id = me and purpose = 'login_phone';
  perform pg_temp.check(public.start_contact_change(me, s1, 'login_phone', o3, '201290000201', '+201290000204', pg_temp.h('o3')) ->> 'result' = 'sent', 'supersede');
  perform pg_temp.check(public.verify_contact_change_code(me, s1, o2, 'old', pg_temp.h('o2')) = 'invalid', 'superseded proof');

  -- Expiry and attempts; a revoked session voids the operation.
  update public.account_contact_changes set expires_at = now() - interval '1 second' where operation_id = o3;
  perform pg_temp.check(public.verify_contact_change_code(me, s1, o3, 'old', pg_temp.h('o3')) = 'expired', 'expired code');
  update public.account_contact_changes set expires_at = now() + interval '5 minutes', attempts = 5 where operation_id = o3;
  perform pg_temp.check(public.verify_contact_change_code(me, s1, o3, 'old', pg_temp.h('o3')) = 'locked', 'attempt limit');
  update public.account_contact_changes set attempts = 0 where operation_id = o3;
  delete from auth.sessions where id = s1;
  perform pg_temp.check(public.verify_contact_change_code(me, s1, o3, 'old', pg_temp.h('o3')) = 'session_inactive', 'revoked session');

  -- Parent replacement: shared numbers allowed, both proofs, atomic commit keeping level.
  perform pg_temp.check(public.start_contact_change(me, s2, 'parent_phone', p1, '+201290000301', '+201290000201', pg_temp.h('p')) ->> 'result' = 'account_phone', 'parent cannot be login phone');
  result := public.start_contact_change(me, s2, 'parent_phone', p1, '+201290000301', '+201290000302', pg_temp.h('p1-old'));
  perform pg_temp.check(result ->> 'result' = 'sent' and result ->> 'recipient' = '+201290000301', 'shared parent number allowed');
  perform pg_temp.check(public.verify_contact_change_code(me, s2, p1, 'old', pg_temp.h('p1-old')) = 'next', 'parent old proof');
  perform pg_temp.check((select parent_phone from public.student_profiles where user_id = me) = '+201290000301', 'old parent kept while pending');
  perform public.resend_contact_change_code(me, s2, p1, 'new', pg_temp.h('p1-new'));
  perform pg_temp.check(public.verify_contact_change_code(me, s2, p1, 'new', pg_temp.h('wrong')) = 'invalid_code', 'parent wrong new code');
  perform pg_temp.check((select parent_phone from public.student_profiles where user_id = me) = '+201290000301', 'no partial replacement');
  perform pg_temp.check(public.verify_contact_change_code(me, s2, p1, 'new', pg_temp.h('p1-new')) = 'completed', 'parent replaced');
  perform pg_temp.check((select parent_phone = '+201290000302' and level_id = 'preparatory-3' and parent_phone_verified_at is not null
    from public.student_profiles where user_id = me), 'parent committed with setup intact');
  perform pg_temp.check((select parent_phone from public.student_profiles where user_id = other) = '+201290000302', 'other student untouched');

  -- A parent contact changed elsewhere makes a pending operation stale.
  update public.account_contact_changes set old_sent_at = now() - interval '2 minutes' where user_id = me and purpose = 'parent_phone';
  perform pg_temp.check(public.start_contact_change(me, s2, 'parent_phone', p2, '+201290000302', '+201290000303', pg_temp.h('p2')) ->> 'result' = 'sent', 'parent second');
  update public.student_profiles set parent_phone = '+201290000304' where user_id = me;
  perform pg_temp.check(public.verify_contact_change_code(me, s2, p2, 'old', pg_temp.h('p2')) = 'stale', 'stale parent');
  perform pg_temp.check((select stage from public.account_contact_changes where operation_id = p2) = 'canceled', 'stale operation ended');

  -- Accounts without a completed student profile have no parent contact to replace.
  delete from public.student_profiles where user_id = other;
  perform pg_temp.check(public.start_contact_change(other, so, 'parent_phone', p2, '+201290000302', '+201290000305', pg_temp.h('x')) ->> 'result' = 'not_student', 'not a student');
end $$;

rollback;
