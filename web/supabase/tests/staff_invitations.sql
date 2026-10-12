-- Staff invitations: grants, creation rules, list visibility, revocation, preview, acceptance, expiry,
-- inviter authority, existing membership, cross-academy access, and lookup rate limiting.
-- Run with `npm run test:db` against the marked isolated test target (see docs/engineering.md).
-- Everything runs in one transaction that is rolled back. Any failed assertion aborts with an error.
-- Separate-session races (double accept, accept vs revoke) are not covered here.

begin;

create function pg_temp.check(condition boolean, message text) returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'FAILED: %', message; end if;
end;
$$;

-- Acts as the given account for the rest of the transaction (role stays `authenticated`).
create function pg_temp.act(account uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', account::text, true);
$$;

insert into auth.users (id, phone, phone_confirmed_at) values
  ('a1111111-1111-4111-8111-111111111111', '201000000001', now()),  -- owner of A
  ('a2222222-2222-4222-8222-222222222222', '201000000002', now()),  -- admin of A
  ('a3333333-3333-4333-8333-333333333333', '201000000003', now()),  -- second admin of A
  ('a4444444-4444-4444-8444-444444444444', '201000000004', now()),  -- instructor of A
  ('b1111111-1111-4111-8111-111111111111', '201000000011', now()),  -- owner of B
  ('c1111111-1111-4111-8111-111111111111', '201011111111', now()),  -- recipient 1
  ('c2222222-2222-4222-8222-222222222222', '201022222222', now()),  -- recipient 2
  ('c3333333-3333-4333-8333-333333333333', '201033333333', now()),  -- recipient 3
  ('c4444444-4444-4444-8444-444444444444', '201044444444', now()),  -- recipient 4
  ('c5555555-5555-4555-8555-555555555555', '201055555555', now()),  -- recipient 5
  ('c9999999-9999-4999-8999-999999999999', '201077777777', null);   -- unverified account

insert into public.academies (id, name, slug, icon, subject, created_by) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Invite Academy A', 'invite-academy-a', 'school', 'Math', 'a1111111-1111-4111-8111-111111111111'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Invite Academy B', 'invite-academy-b', 'school', 'Math', 'b1111111-1111-4111-8111-111111111111');

insert into public.academy_memberships (academy_id, user_id, role, created_by) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a1111111-1111-4111-8111-111111111111', 'owner', 'a1111111-1111-4111-8111-111111111111'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a2222222-2222-4222-8222-222222222222', 'admin', 'a1111111-1111-4111-8111-111111111111'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a3333333-3333-4333-8333-333333333333', 'admin', 'a1111111-1111-4111-8111-111111111111'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a4444444-4444-4444-8444-444444444444', 'instructor', 'a1111111-1111-4111-8111-111111111111'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b1111111-1111-4111-8111-111111111111', 'owner', 'b1111111-1111-4111-8111-111111111111');

-- Grants: no direct table access, no anonymous execution, helpers are not callable.
do $$ begin
  perform pg_temp.check((select relrowsecurity from pg_class where oid = 'public.staff_invitations'::regclass), 'RLS enabled');
  perform pg_temp.check(not has_table_privilege('authenticated', 'public.staff_invitations', 'select'), 'no select grant');
  perform pg_temp.check(not has_table_privilege('authenticated', 'public.staff_invitations', 'insert'), 'no insert grant');
  perform pg_temp.check(not has_table_privilege('authenticated', 'public.staff_invitations', 'update'), 'no update grant');
  perform pg_temp.check(not has_table_privilege('anon', 'public.staff_invitations', 'select'), 'no anon select');
  perform pg_temp.check(not has_table_privilege('authenticated', 'public.academy_memberships', 'insert'), 'no membership insert');
  perform pg_temp.check(not has_table_privilege('authenticated', 'public.academy_memberships', 'update'), 'no membership update');
  perform pg_temp.check(not has_function_privilege('anon', 'public.create_staff_invitation(uuid, text, public.academy_role, text, text)', 'execute'), 'anon create');
  perform pg_temp.check(not has_function_privilege('anon', 'public.accept_staff_invitation(text)', 'execute'), 'anon accept');
  perform pg_temp.check(not has_function_privilege('authenticated', 'public.staff_invitation_state(public.staff_invitations, uuid)', 'execute'), 'state helper');
  perform pg_temp.check(not has_function_privilege('authenticated', 'public.verified_account_phone(uuid)', 'execute'), 'phone helper');
  perform pg_temp.check(not has_function_privilege('authenticated', 'public.note_staff_invitation_lookup_failure(uuid)', 'execute'), 'limit helper');
end $$;

grant usage on schema public, auth to authenticated;
set local role authenticated;

-- Creation rules.
do $$
declare
  a constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  res jsonb;
begin
  perform pg_temp.act('a1111111-1111-4111-8111-111111111111');
  res := public.create_staff_invitation(a, '010 1111 1111', 'admin', repeat('a', 43), 'cipher-a');
  perform pg_temp.check(res->>'result' = 'created', 'owner invites admin: ' || res::text);
  perform pg_temp.check(res->'invitation'->>'phone' = '+201011111111', 'phone normalized');
  perform pg_temp.check(not (res->'invitation' ? 'token_hash') and not (res::text like '%cipher%'), 'no secrets returned');
  perform pg_temp.check(public.create_staff_invitation(a, '01022222222', 'instructor', repeat('b', 43), 'cipher-b')->>'result' = 'created', 'owner invites instructor');
  perform pg_temp.check(public.create_staff_invitation(a, '+201011111111', 'instructor', repeat('x', 43), 'x')->>'result' = 'pending_exists', 'one pending per phone');
  perform pg_temp.check(public.create_staff_invitation(a, '01000000004', 'instructor', repeat('y', 43), 'y')->>'result' = 'already_member', 'existing member');
  perform pg_temp.check(public.create_staff_invitation(a, '12345', 'instructor', repeat('y', 43), 'y')->>'result' = 'invalid_phone', 'invalid phone');
  perform pg_temp.check(public.create_staff_invitation(a, '01066666666', 'owner', repeat('y', 43), 'y')->>'result' = 'forbidden', 'no owner invitations');

  perform pg_temp.act('a2222222-2222-4222-8222-222222222222');
  perform pg_temp.check(public.create_staff_invitation(a, '01066666666', 'admin', repeat('y', 43), 'y')->>'result' = 'forbidden', 'admin cannot invite admin');
  perform pg_temp.check(public.create_staff_invitation(a, '01033333333', 'instructor', repeat('c', 43), 'cipher-c')->>'result' = 'created', 'admin invites instructor');

  perform pg_temp.act('a4444444-4444-4444-8444-444444444444');
  perform pg_temp.check(public.create_staff_invitation(a, '01066666666', 'instructor', repeat('y', 43), 'y')->>'result' = 'forbidden', 'instructor cannot invite');

  perform pg_temp.act('b1111111-1111-4111-8111-111111111111');
  perform pg_temp.check(public.create_staff_invitation(a, '01066666666', 'instructor', repeat('y', 43), 'y')->>'result' = 'forbidden', 'cross-academy owner');

  perform pg_temp.act('c1111111-1111-4111-8111-111111111111');
  perform pg_temp.check(public.create_staff_invitation(a, '01066666666', 'instructor', repeat('y', 43), 'y')->>'result' = 'forbidden', 'non-member');
end $$;

select pg_temp.act('a1111111-1111-4111-8111-111111111111');
do $$ begin
  begin
    perform public.create_staff_invitation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '01066666666', 'instructor', 'short', 'y');
    raise exception 'FAILED: weak token accepted';
  exception when others then
    if sqlerrm <> 'invalid_token' then raise; end if;
  end;
  begin
    perform 1 from public.staff_invitations;
    raise exception 'FAILED: direct select allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.academy_memberships (academy_id, user_id, role, created_by)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'c5555555-5555-4555-8555-555555555555', 'admin', 'c5555555-5555-4555-8555-555555555555');
    raise exception 'FAILED: direct membership insert allowed';
  exception when insufficient_privilege then null;
  end;
end $$;

-- List visibility and manage flags.
do $$
declare
  a constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  res jsonb;
begin
  perform pg_temp.act('a1111111-1111-4111-8111-111111111111');
  res := public.list_staff_invitations(a, 'pending', 0, 20);
  perform pg_temp.check((res->>'total')::int = 3, 'owner sees all pending: ' || res::text);
  perform pg_temp.check(not exists (select 1 from jsonb_array_elements(res->'rows') r where (r->>'canManage')::boolean is not true), 'owner manages all');
  perform pg_temp.check(res::text not like '%cipher%' and res::text not like '%token%', 'list has no secrets');
  perform pg_temp.check((public.list_staff_invitations(a, 'accepted', 0, 20)->>'total')::int = 0, 'status filter');

  perform pg_temp.act('a2222222-2222-4222-8222-222222222222');
  res := public.list_staff_invitations(a, null, 0, 20);
  perform pg_temp.check((res->>'total')::int = 3, 'admin sees all, including admin invitations');
  perform pg_temp.check((select count(*) from jsonb_array_elements(res->'rows') r where (r->>'canManage')::boolean) = 1, 'admin manages only own instructor invitation');

  perform pg_temp.act('a4444444-4444-4444-8444-444444444444');
  begin
    perform public.list_staff_invitations(a, null, 0, 20);
    raise exception 'FAILED: instructor listed invitations';
  exception when others then if sqlerrm <> 'forbidden' then raise; end if;
  end;

  perform pg_temp.act('b1111111-1111-4111-8111-111111111111');
  begin
    perform public.list_staff_invitations(a, null, 0, 20);
    raise exception 'FAILED: cross-academy list';
  exception when others then if sqlerrm <> 'forbidden' then raise; end if;
  end;
end $$;

-- Copying and revoking.
do $$
declare
  a constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  admin_invite uuid;
  owner_instructor_invite uuid;
  own_invite uuid;
begin
  reset role;
  select id into admin_invite from public.staff_invitations where academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and token_ciphertext = 'cipher-a';
  select id into owner_instructor_invite from public.staff_invitations where academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and token_ciphertext = 'cipher-b';
  select id into own_invite from public.staff_invitations where academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and token_ciphertext = 'cipher-c';
  perform set_config('test.admin_invite', admin_invite::text, true);
  perform set_config('test.owner_instructor_invite', owner_instructor_invite::text, true);
  set local role authenticated;

  perform pg_temp.act('a2222222-2222-4222-8222-222222222222');
  perform pg_temp.check(public.staff_invitation_link_ciphertext(a, own_invite)->>'ciphertext' = 'cipher-c', 'admin copies own link');
  perform pg_temp.check(public.staff_invitation_link_ciphertext(a, admin_invite)->>'result' = 'forbidden', 'admin cannot copy admin invitation');
  perform pg_temp.check(public.staff_invitation_link_ciphertext(a, owner_instructor_invite)->>'result' = 'forbidden', 'admin cannot copy another creator''s link');
  perform pg_temp.check(public.revoke_staff_invitation(a, owner_instructor_invite)->>'result' = 'forbidden', 'admin cannot revoke another creator''s invitation');
  perform pg_temp.check(public.revoke_staff_invitation(a, admin_invite)->>'result' = 'forbidden', 'admin cannot revoke admin invitation');

  perform pg_temp.act('a3333333-3333-4333-8333-333333333333');
  perform pg_temp.check(public.revoke_staff_invitation(a, own_invite)->>'result' = 'forbidden', 'second admin cannot revoke first admin''s invitation');

  perform pg_temp.act('a4444444-4444-4444-8444-444444444444');
  perform pg_temp.check(public.revoke_staff_invitation(a, own_invite)->>'result' = 'forbidden', 'instructor cannot revoke');

  perform pg_temp.act('b1111111-1111-4111-8111-111111111111');
  perform pg_temp.check(public.revoke_staff_invitation('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', own_invite)->>'result' = 'not_found', 'cross-academy id is not found');
  perform pg_temp.check(public.revoke_staff_invitation(a, own_invite)->>'result' = 'forbidden', 'cross-academy owner cannot revoke');
  perform pg_temp.check(public.staff_invitation_link_ciphertext(a, own_invite)->>'result' = 'forbidden', 'cross-academy owner cannot copy');

  perform pg_temp.act('a1111111-1111-4111-8111-111111111111');
  perform pg_temp.check(public.revoke_staff_invitation(a, owner_instructor_invite)->>'result' = 'revoked', 'owner revokes');
  perform pg_temp.check(public.revoke_staff_invitation(a, owner_instructor_invite)->>'result' = 'revoked', 'repeat revocation is safe');
  perform pg_temp.check(public.staff_invitation_link_ciphertext(a, owner_instructor_invite)->>'result' = 'not_pending', 'revoked link cannot be copied');
end $$;

-- Preview and acceptance.
do $$
declare
  a constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  res jsonb;
begin
  perform pg_temp.act('c9999999-9999-4999-8999-999999999999');
  res := public.preview_staff_invitation(repeat('a', 43));
  perform pg_temp.check(res = '{"result": "unverified"}'::jsonb, 'unverified account sees nothing: ' || res::text);

  perform pg_temp.act('c2222222-2222-4222-8222-222222222222');
  res := public.preview_staff_invitation(repeat('a', 43));
  perform pg_temp.check(res = '{"result": "wrong_account"}'::jsonb, 'wrong phone sees nothing: ' || res::text);
  perform pg_temp.check(public.accept_staff_invitation(repeat('a', 43)) = '{"result": "wrong_account"}'::jsonb, 'wrong phone cannot accept');
  perform pg_temp.check(public.accept_staff_invitation(repeat('b', 43))->>'result' = 'revoked', 'revoked invitation cannot be accepted');

  perform pg_temp.act('c1111111-1111-4111-8111-111111111111');
  res := public.preview_staff_invitation(repeat('a', 43));
  perform pg_temp.check(res->>'result' = 'valid' and res->'academy'->>'name' = 'Invite Academy A' and res->>'role' = 'admin', 'recipient preview: ' || res::text);
  perform pg_temp.check(public.preview_staff_invitation(repeat('a', 43))->>'result' = 'valid', 'preview does not consume');
  res := public.accept_staff_invitation(repeat('a', 43));
  perform pg_temp.check(res->>'result' = 'joined' and res->'academy'->>'id' = a::text and res->>'role' = 'admin', 'accept: ' || res::text);
  res := public.accept_staff_invitation(repeat('a', 43));
  perform pg_temp.check(res->>'result' = 'accepted' and res->'academy'->>'id' = a::text, 'retry returns original outcome: ' || res::text);
  perform pg_temp.check(public.preview_staff_invitation(repeat('a', 43))->>'result' = 'accepted', 'preview after acceptance');

  perform pg_temp.act('c2222222-2222-4222-8222-222222222222');
  perform pg_temp.check(public.preview_staff_invitation(repeat('a', 43)) = '{"result": "unavailable"}'::jsonb, 'used invitation is generic for others');
end $$;

reset role;
do $$ begin
  perform pg_temp.check((select count(*) from public.academy_memberships where user_id = 'c1111111-1111-4111-8111-111111111111') = 1, 'exactly one membership');
  perform pg_temp.check((select role from public.academy_memberships where user_id = 'c1111111-1111-4111-8111-111111111111') = 'admin', 'invited role');
  perform pg_temp.check((select created_by from public.academy_memberships where user_id = 'c1111111-1111-4111-8111-111111111111') = 'a1111111-1111-4111-8111-111111111111', 'membership created by inviter');
  perform pg_temp.check((select status from public.staff_invitations where academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and token_ciphertext = 'cipher-a') = 'accepted', 'invitation accepted');
  perform pg_temp.check((select count(*) from public.academy_memberships where user_id = 'c2222222-2222-4222-8222-222222222222') = 0, 'no membership after revoked or wrong-phone attempts');
  perform pg_temp.check((select status from public.staff_invitations where academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and token_ciphertext = 'cipher-b') = 'revoked', 'revocation recorded');
end $$;

-- Revoking an accepted invitation does not remove the membership.
set local role authenticated;
select pg_temp.act('a1111111-1111-4111-8111-111111111111');
do $$ begin
  perform pg_temp.check(public.revoke_staff_invitation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.admin_invite')::uuid)->>'result' = 'already_accepted', 'accepted cannot be revoked');
  -- Expiry fixtures: one for recipient 4, one for recipient 5.
  perform pg_temp.check(public.create_staff_invitation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '01044444444', 'instructor', repeat('d', 43), 'cipher-d')->>'result' = 'created', 'expiry fixture');
  perform pg_temp.check(public.create_staff_invitation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '01055555555', 'instructor', repeat('e', 43), 'cipher-e')->>'result' = 'created', 'membership fixture');
end $$;

reset role;
update public.staff_invitations
set created_at = now() - interval '8 days', expires_at = now() - interval '1 day'
where academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and token_ciphertext = 'cipher-d';
-- Recipient 5 becomes a member some other way before accepting.
insert into public.academy_memberships (academy_id, user_id, role, created_by)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'c5555555-5555-4555-8555-555555555555', 'admin', 'a1111111-1111-4111-8111-111111111111');
-- The admin who invited recipient 3 is demoted before acceptance.
update public.academy_memberships set role = 'instructor'
where academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and user_id = 'a2222222-2222-4222-8222-222222222222';

set local role authenticated;
do $$
declare res jsonb;
begin
  perform pg_temp.act('c4444444-4444-4444-8444-444444444444');
  res := public.accept_staff_invitation(repeat('d', 43));
  perform pg_temp.check(res->>'result' = 'expired' and res->'academy' is not null, 'expired: ' || res::text);

  perform pg_temp.act('c5555555-5555-4555-8555-555555555555');
  res := public.accept_staff_invitation(repeat('e', 43));
  perform pg_temp.check(res->>'result' = 'already_member', 'already member: ' || res::text);

  perform pg_temp.act('c3333333-3333-4333-8333-333333333333');
  res := public.accept_staff_invitation(repeat('c', 43));
  perform pg_temp.check(res->>'result' = 'inviter_unavailable', 'inviter lost authority: ' || res::text);

  perform pg_temp.act('a1111111-1111-4111-8111-111111111111');
  perform pg_temp.check(public.create_staff_invitation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '01044444444', 'instructor', repeat('f', 43), 'cipher-f')->>'result' = 'created', 'expired invitation is retired and can be replaced');
end $$;

reset role;
do $$ begin
  perform pg_temp.check((select status from public.staff_invitations where academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and token_ciphertext = 'cipher-d') = 'expired', 'expiry recorded');
  perform pg_temp.check((select role from public.academy_memberships where user_id = 'c5555555-5555-4555-8555-555555555555') = 'admin', 'existing role unchanged');
  perform pg_temp.check((select status from public.staff_invitations where academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and token_ciphertext = 'cipher-e') = 'pending', 'existing member does not consume invitation');
  perform pg_temp.check((select count(*) from public.academy_memberships where user_id in ('c3333333-3333-4333-8333-333333333333', 'c4444444-4444-4444-8444-444444444444')) = 0, 'no membership from expired or unauthorized invitations');
  perform pg_temp.check((select expires_at - created_at from public.staff_invitations where academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and token_ciphertext = 'cipher-f') = interval '7 days', 'seven-day lifetime');
end $$;

-- Failed lookups are rate limited per account.
set local role authenticated;
select pg_temp.act('c2222222-2222-4222-8222-222222222222');
do $$ begin
  for i in 1..20 loop
    perform pg_temp.check(public.preview_staff_invitation(repeat('z', 42) || chr(65 + (i % 26)))->>'result' = 'unavailable', 'unknown token');
  end loop;
  perform pg_temp.check(public.preview_staff_invitation(repeat('a', 43))->>'result' = 'rate_limited', 'lookups limited');
  perform pg_temp.check(public.accept_staff_invitation(repeat('a', 43))->>'result' = 'rate_limited', 'accept limited');
end $$;

-- A revoked invitation can be replaced, and revoking that historical row never revokes its replacement.
select pg_temp.act('a1111111-1111-4111-8111-111111111111');
do $$
declare
  a constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  original_id uuid;
  replacement_id uuid;
  res jsonb;
begin
  res := public.create_staff_invitation(a, '01088888888', 'instructor', repeat('r', 43), 'reinvite-original');
  perform pg_temp.check(res->>'result' = 'created', 'reinvite original created');
  original_id := (res->'invitation'->>'id')::uuid;
  perform pg_temp.check(public.revoke_staff_invitation(a, original_id)->>'result' = 'revoked', 'reinvite original revoked');

  res := public.create_staff_invitation(a, '01088888888', 'instructor', repeat('s', 43), 'reinvite-replacement');
  perform pg_temp.check(res->>'result' = 'created', 'revoked phone can be invited again: ' || res::text);
  replacement_id := (res->'invitation'->>'id')::uuid;
  perform pg_temp.check(replacement_id <> original_id, 'replacement has its own id');
  perform pg_temp.check(public.staff_invitation_link_ciphertext(a, original_id)->>'result' = 'not_pending', 'old revoked link stays unusable');
  perform pg_temp.check(public.staff_invitation_link_ciphertext(a, replacement_id)->>'ciphertext' = 'reinvite-replacement', 'replacement has a usable link');

  perform pg_temp.check(public.revoke_staff_invitation(a, original_id)->>'result' = 'revoked', 'historical revocation is idempotent');
  perform pg_temp.check(public.create_staff_invitation(a, '01088888888', 'instructor', repeat('t', 43), 'reinvite-duplicate')->>'result' = 'pending_exists', 'historical revocation cannot bypass a live replacement');

  res := public.list_staff_invitations(a, 'pending', 0, 100);
  perform pg_temp.check(exists(select 1 from jsonb_array_elements(res->'rows') r where r->>'id' = replacement_id::text), 'pending filter includes replacement');
  perform pg_temp.check(not exists(select 1 from jsonb_array_elements(res->'rows') r where r->>'status' <> 'pending'), 'pending filter excludes revoked history');
  res := public.list_staff_invitations(a, 'revoked', 0, 100);
  perform pg_temp.check(exists(select 1 from jsonb_array_elements(res->'rows') r where r->>'id' = original_id::text), 'revoked filter includes original');
  perform pg_temp.check(not exists(select 1 from jsonb_array_elements(res->'rows') r where r->>'status' <> 'revoked'), 'revoked filter excludes live replacement');
  res := public.list_staff_invitations(a, null, 0, 100);
  perform pg_temp.check((select count(*) from jsonb_array_elements(res->'rows') r where r->>'phone' = '+201088888888') = 2, 'all filter keeps original and replacement');

  perform pg_temp.check(public.revoke_staff_invitation(a, replacement_id)->>'result' = 'revoked', 'replacement revoked');
  perform pg_temp.check(public.create_staff_invitation(a, '01088888888', 'admin', repeat('v', 43), 'reinvite-third')->>'result' = 'created', 'phone can be invited again after replacement revocation');
end $$;

reset role;
select 'staff_invitations: all assertions passed' as result;
rollback;
