-- Staff access: Head Admin authority, four-role staff management, suspension and restoration.
-- Run with `npm run test:db` against the disposable GitHub Actions database (see docs/engineering.md).
-- Everything runs in one transaction that is rolled back. Any failed assertion aborts with an error.
-- Separate-session races (acceptance vs suspension, opposing management) are in concurrency.sh.

do $$ begin
  if has_function_privilege('anon', 'public.suspend_staff_member(uuid, uuid)', 'execute')
    or has_function_privilege('anon', 'public.restore_staff_member(uuid, uuid)', 'execute')
    or has_function_privilege('anon', 'public.own_suspended_staff_academies()', 'execute')
    or not has_function_privilege('authenticated', 'public.suspend_staff_member(uuid, uuid)', 'execute')
    or not has_function_privilege('authenticated', 'public.restore_staff_member(uuid, uuid)', 'execute')
    or has_function_privilege('authenticated', 'edra_private.lock_staff_memberships(uuid, uuid, uuid)', 'execute')
    or has_table_privilege('authenticated', 'edra_private.staff_access_events', 'select')
    or has_column_privilege('authenticated', 'public.academy_memberships', 'suspended_by', 'select')
    or has_column_privilege('authenticated', 'public.academy_memberships', 'suspended_at', 'update') then
    raise exception 'Staff access grants are wrong';
  end if;
end $$;

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

create function pg_temp.result(value jsonb) returns text language sql as $$ select value->>'result' $$;

insert into auth.users (id, phone, phone_confirmed_at) values
  ('9b111111-1111-4111-8111-111111111111', '201099000001', now()),  -- owner of X
  ('9b222222-2222-4222-8222-222222222222', '201099000002', now()),  -- head admin of X
  ('9b333333-3333-4333-8333-333333333333', '201099000003', now()),  -- second head admin of X
  ('9b444444-4444-4444-8444-444444444444', '201099000004', now()),  -- admin of X
  ('9b555555-5555-4555-8555-555555555555', '201099000005', now()),  -- second admin of X
  ('9b666666-6666-4666-8666-666666666666', '201099000006', now()),  -- instructor of X and Y
  ('9b777777-7777-4777-8777-777777777777', '201099000007', now()),  -- second instructor of X
  ('9c111111-1111-4111-8111-111111111111', '201099000011', now()),  -- owner of Y
  ('9d111111-1111-4111-8111-111111111111', '201099000021', now()),  -- recipient 1
  ('9d222222-2222-4222-8222-222222222222', '201099000022', now());  -- recipient 2

insert into public.academies (id, name, slug, icon, subject, created_by) values
  ('9a9a9a9a-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Access Academy X', 'access-academy-x', 'school', 'Math', '9b111111-1111-4111-8111-111111111111'),
  ('9a9a9a9a-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Access Academy Y', 'access-academy-y', 'school', 'Math', '9c111111-1111-4111-8111-111111111111');

insert into public.academy_memberships (academy_id, user_id, role, created_by) values
  ('9a9a9a9a-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '9b111111-1111-4111-8111-111111111111', 'owner', '9b111111-1111-4111-8111-111111111111'),
  ('9a9a9a9a-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '9b222222-2222-4222-8222-222222222222', 'head_admin', '9b111111-1111-4111-8111-111111111111'),
  ('9a9a9a9a-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '9b333333-3333-4333-8333-333333333333', 'head_admin', '9b111111-1111-4111-8111-111111111111'),
  ('9a9a9a9a-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '9b444444-4444-4444-8444-444444444444', 'admin', '9b111111-1111-4111-8111-111111111111'),
  ('9a9a9a9a-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '9b555555-5555-4555-8555-555555555555', 'admin', '9b111111-1111-4111-8111-111111111111'),
  ('9a9a9a9a-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '9b666666-6666-4666-8666-666666666666', 'instructor', '9b111111-1111-4111-8111-111111111111'),
  ('9a9a9a9a-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '9b777777-7777-4777-8777-777777777777', 'instructor', '9b111111-1111-4111-8111-111111111111'),
  ('9a9a9a9a-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '9c111111-1111-4111-8111-111111111111', 'owner', '9c111111-1111-4111-8111-111111111111'),
  ('9a9a9a9a-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '9b666666-6666-4666-8666-666666666666', 'instructor', '9c111111-1111-4111-8111-111111111111');

insert into public.academy_levels (academy_id, level_id, sort_order) values
  ('9a9a9a9a-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'secondary-1', 10);

-- Schema invariants: the Owner cannot be suspended, and attribution needs a suspension.
do $$ begin
  begin
    update public.academy_memberships set suspended_at = now()
      where academy_id = '9a9a9a9a-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and user_id = '9b111111-1111-4111-8111-111111111111';
    raise exception 'FAILED: owner suspended';
  exception when check_violation then null;
  end;
  begin
    update public.academy_memberships set suspended_by = '9b111111-1111-4111-8111-111111111111'
      where academy_id = '9a9a9a9a-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and user_id = '9b444444-4444-4444-8444-444444444444';
    raise exception 'FAILED: attribution without suspension';
  exception when check_violation then null;
  end;
  begin
    insert into public.staff_invitations (academy_id, phone, role, token_hash, token_ciphertext, created_by, expires_at)
      values ('9a9a9a9a-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '+201099000099', 'owner', repeat('0', 64), 'x',
        '9b111111-1111-4111-8111-111111111111', now() + interval '7 days');
    raise exception 'FAILED: owner invitation stored';
  exception when check_violation then null;
  end;
end $$;

grant usage on schema public, auth to authenticated;
set local role authenticated;

-- Head Admin has ordinary manager authority over academy data.
do $$
declare
  x constant uuid := '9a9a9a9a-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  year_id uuid;
begin
  perform pg_temp.act('9b222222-2222-4222-8222-222222222222');
  perform pg_temp.check(public.academy_role_for(x) = 'head_admin', 'head admin role');
  perform pg_temp.check(public.is_academy_member(x), 'head admin is a member');
  perform pg_temp.check(public.is_academy_manager(x), 'head admin is a manager');
  update public.academies set name = 'Access Academy X+' where id = x;
  perform pg_temp.check((select name from public.academies where id = x) = 'Access Academy X+', 'head admin edits academy settings');
  select id into year_id from public.academic_years where academy_id = x and closed_at is null;
  insert into public.groups (academy_id, academic_year_id, level_id, name)
    values (x, year_id, 'secondary-1', 'Head admin group');
  perform pg_temp.check(exists (select 1 from public.groups where academy_id = x and name = 'Head admin group'), 'head admin creates groups');
  insert into public.schedules (academy_id, academic_year_id, title, kind, audience, level_id, created_by)
    values (x, year_id, 'Head admin recurring', 'recurring', 'level', 'secondary-1', '9b222222-2222-4222-8222-222222222222');
  perform pg_temp.check(exists (select 1 from public.schedules where academy_id = x and title = 'Head admin recurring'), 'head admin creates recurring schedules');

  -- Academy profile edits are Owner/Head Admin only (EDRA-128); Admin keeps other manager authority.
  perform pg_temp.act('9b444444-4444-4444-8444-444444444444');
  perform pg_temp.check(public.is_academy_manager(x), 'admin is still a manager');
  update public.academies set name = 'Admin rename' where id = x;
  perform pg_temp.check((select name from public.academies where id = x) = 'Access Academy X+', 'admin cannot edit academy settings');
  perform pg_temp.act('9b222222-2222-4222-8222-222222222222');

  perform pg_temp.act('9b666666-6666-4666-8666-666666666666');
  perform pg_temp.check(public.academy_role_for(x) = 'instructor' and not public.is_academy_manager(x), 'instructor is not a manager');
  begin
    insert into public.schedules (academy_id, academic_year_id, title, kind, audience, level_id, created_by)
      values (x, year_id, 'Instructor recurring', 'recurring', 'level', 'secondary-1', '9b666666-6666-4666-8666-666666666666');
    raise exception 'FAILED: instructor created a recurring schedule';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
do $$
begin
  perform pg_temp.act('9b222222-2222-4222-8222-222222222222');
  perform pg_temp.check(edra_private.require_assignment_role('9a9a9a9a-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true) = 'head_admin', 'head admin passes the assignment manager guard');
  perform pg_temp.act('9b666666-6666-4666-8666-666666666666');
  begin
    perform edra_private.require_assignment_role('9a9a9a9a-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
    raise exception 'FAILED: instructor passed the assignment manager guard';
  exception when others then if sqlerrm <> 'forbidden' then raise; end if;
  end;
end $$;
set local role authenticated;

-- Invitations: who may appoint which role, and who may manage which invitation.
do $$
declare
  x constant uuid := '9a9a9a9a-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  res jsonb;
begin
  perform pg_temp.act('9b111111-1111-4111-8111-111111111111');
  perform pg_temp.check(pg_temp.result(public.create_staff_invitation(x, '01099000021', 'head_admin', repeat('h', 43), 'cipher-head')) = 'created', 'owner invites a head admin');
  perform pg_temp.check(pg_temp.result(public.create_staff_invitation(x, '01099000031', 'owner', repeat('o', 43), 'o')) = 'forbidden', 'nobody invites an owner');

  perform pg_temp.act('9b222222-2222-4222-8222-222222222222');
  perform pg_temp.check(pg_temp.result(public.create_staff_invitation(x, '01099000032', 'head_admin', repeat('y', 43), 'y')) = 'forbidden', 'head admin cannot appoint head admin');
  perform pg_temp.check(pg_temp.result(public.create_staff_invitation(x, '01099000022', 'admin', repeat('a', 43), 'cipher-ha-admin')) = 'created', 'head admin invites admin');
  res := public.list_staff_invitations(x, 'pending', 0, 20);
  perform pg_temp.check((res->>'total')::int = 2, 'head admin lists invitations');
  perform pg_temp.check((select bool_and((r->>'canManage')::boolean = (r->>'role' <> 'head_admin')) from jsonb_array_elements(res->'rows') r),
    'head admin manages admin invitations but not head admin invitations: ' || res::text);

  perform pg_temp.act('9b444444-4444-4444-8444-444444444444');
  perform pg_temp.check(pg_temp.result(public.create_staff_invitation(x, '01099000033', 'admin', repeat('z', 43), 'z')) = 'forbidden', 'admin cannot appoint admin');
  res := public.list_staff_invitations(x, 'pending', 0, 20);
  perform pg_temp.check((select count(*) from jsonb_array_elements(res->'rows') r where (r->>'canManage')::boolean) = 0, 'admin cannot manage head admin/admin invitations');
end $$;

reset role;
do $$
declare
  head_invite uuid;
begin
  select id into head_invite from public.staff_invitations where token_ciphertext = 'cipher-head';
  perform set_config('test.head_invite', head_invite::text, true);
end $$;
set local role authenticated;

do $$
declare
  x constant uuid := '9a9a9a9a-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  head_invite uuid := current_setting('test.head_invite')::uuid;
begin
  perform pg_temp.act('9b222222-2222-4222-8222-222222222222');
  perform pg_temp.check(pg_temp.result(public.staff_invitation_link_ciphertext(x, head_invite)) = 'forbidden', 'head admin cannot copy a head admin invitation link');
  perform pg_temp.check(pg_temp.result(public.revoke_staff_invitation(x, head_invite)) = 'forbidden', 'head admin cannot revoke a head admin invitation');
  perform pg_temp.act('9b111111-1111-4111-8111-111111111111');
  perform pg_temp.check(public.staff_invitation_link_ciphertext(x, head_invite)->>'ciphertext' = 'cipher-head', 'owner copies head admin invitation');

  -- An accepted head admin invitation creates a head admin; the owner is unchanged.
  perform pg_temp.act('9d111111-1111-4111-8111-111111111111');
  perform pg_temp.check(pg_temp.result(public.accept_staff_invitation(repeat('h', 43))) = 'joined', 'recipient joins as head admin');
  perform pg_temp.check(public.academy_role_for(x) = 'head_admin', 'invited head admin role');
end $$;

-- Role changes: both the current and the proposed role must be within authority.
do $$
declare
  x constant uuid := '9a9a9a9a-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  owner_id constant uuid := '9b111111-1111-4111-8111-111111111111';
  head1 constant uuid := '9b222222-2222-4222-8222-222222222222';
  head2 constant uuid := '9b333333-3333-4333-8333-333333333333';
  admin1 constant uuid := '9b444444-4444-4444-8444-444444444444';
  admin2 constant uuid := '9b555555-5555-4555-8555-555555555555';
  inst1 constant uuid := '9b666666-6666-4666-8666-666666666666';
  inst2 constant uuid := '9b777777-7777-4777-8777-777777777777';
begin
  perform pg_temp.act(head1);
  perform pg_temp.check(pg_temp.result(public.change_staff_member_role(x, inst2, 'admin')) = 'role_changed', 'head admin promotes instructor to admin');
  perform pg_temp.check(pg_temp.result(public.change_staff_member_role(x, inst2, 'admin')) = 'unchanged', 'repeated role change is unchanged');
  perform pg_temp.check(pg_temp.result(public.change_staff_member_role(x, inst2, 'instructor')) = 'role_changed', 'head admin demotes admin to instructor');
  perform pg_temp.check(pg_temp.result(public.change_staff_member_role(x, admin2, 'head_admin')) = 'forbidden', 'head admin cannot appoint head admin');
  perform pg_temp.check(pg_temp.result(public.change_staff_member_role(x, head2, 'admin')) = 'forbidden', 'head admin cannot demote a peer');
  perform pg_temp.check(pg_temp.result(public.change_staff_member_role(x, head1, 'admin')) = 'forbidden', 'head admin cannot change own role');
  perform pg_temp.check(pg_temp.result(public.change_staff_member_role(x, owner_id, 'admin')) = 'forbidden', 'head admin cannot demote owner');

  perform pg_temp.act(admin1);
  perform pg_temp.check(pg_temp.result(public.change_staff_member_role(x, inst1, 'admin')) = 'forbidden', 'admin cannot promote instructor');
  perform pg_temp.check(pg_temp.result(public.change_staff_member_role(x, admin2, 'instructor')) = 'forbidden', 'admin cannot demote admin');

  perform pg_temp.act(inst1);
  perform pg_temp.check(pg_temp.result(public.change_staff_member_role(x, inst2, 'admin')) = 'forbidden', 'instructor cannot change roles');

  perform pg_temp.act(owner_id);
  perform pg_temp.check(pg_temp.result(public.change_staff_member_role(x, admin2, 'head_admin')) = 'role_changed', 'owner appoints a second head admin by role change');
  perform pg_temp.check(pg_temp.result(public.change_staff_member_role(x, admin2, 'admin')) = 'role_changed', 'owner demotes a head admin');
  perform pg_temp.check(pg_temp.result(public.change_staff_member_role(x, admin2, 'owner')) = 'forbidden', 'no second owner');
  perform pg_temp.check(pg_temp.result(public.change_staff_member_role(x, owner_id, 'admin')) = 'forbidden', 'owner cannot change own role');
  perform pg_temp.check(pg_temp.result(public.change_staff_member_role(x, '9c111111-1111-4111-8111-111111111111', 'admin')) = 'not_found', 'other academy member is not found');

  perform pg_temp.act('9c111111-1111-4111-8111-111111111111');
  perform pg_temp.check(pg_temp.result(public.change_staff_member_role(x, inst2, 'admin')) = 'forbidden', 'cross-academy owner cannot change roles');
end $$;

reset role;
do $$ begin
  perform pg_temp.check((select count(*) from public.academy_memberships where academy_id = '9a9a9a9a-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and role = 'owner') = 1, 'exactly one owner');
  perform pg_temp.check((select count(*) from edra_private.staff_access_events where academy_id = '9a9a9a9a-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and action = 'role_changed') = 4, 'role changes audited once each');
end $$;
set local role authenticated;

-- Suspension and restoration authority.
do $$
declare
  x constant uuid := '9a9a9a9a-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  owner_id constant uuid := '9b111111-1111-4111-8111-111111111111';
  head1 constant uuid := '9b222222-2222-4222-8222-222222222222';
  head2 constant uuid := '9b333333-3333-4333-8333-333333333333';
  admin1 constant uuid := '9b444444-4444-4444-8444-444444444444';
  admin2 constant uuid := '9b555555-5555-4555-8555-555555555555';
  inst1 constant uuid := '9b666666-6666-4666-8666-666666666666';
  inst2 constant uuid := '9b777777-7777-4777-8777-777777777777';
begin
  perform pg_temp.act(head1);
  perform pg_temp.check(pg_temp.result(public.suspend_staff_member(x, head2)) = 'forbidden', 'head admin cannot suspend a peer');
  perform pg_temp.check(pg_temp.result(public.suspend_staff_member(x, owner_id)) = 'forbidden', 'head admin cannot suspend owner');
  perform pg_temp.check(pg_temp.result(public.suspend_staff_member(x, head1)) = 'forbidden', 'no self-suspension');
  perform pg_temp.check(pg_temp.result(public.remove_staff_member(x, head2)) = 'forbidden', 'head admin cannot remove a peer');

  perform pg_temp.act(admin1);
  perform pg_temp.check(pg_temp.result(public.suspend_staff_member(x, admin2)) = 'forbidden', 'admin cannot suspend admin');
  perform pg_temp.check(pg_temp.result(public.suspend_staff_member(x, inst2)) = 'suspended', 'admin suspends instructor');
  perform pg_temp.check(pg_temp.result(public.suspend_staff_member(x, inst2)) = 'unchanged', 'repeated suspend is unchanged');
  perform pg_temp.check(pg_temp.result(public.restore_staff_member(x, inst2)) = 'restored', 'admin restores instructor');
  perform pg_temp.check(pg_temp.result(public.restore_staff_member(x, inst2)) = 'unchanged', 'repeated restore is unchanged');

  perform pg_temp.act(inst1);
  perform pg_temp.check(pg_temp.result(public.suspend_staff_member(x, inst2)) = 'forbidden', 'instructor cannot suspend');

  perform pg_temp.act(owner_id);
  perform pg_temp.check(pg_temp.result(public.suspend_staff_member(x, head2)) = 'suspended', 'owner suspends a head admin');
  perform pg_temp.check(pg_temp.result(public.restore_staff_member(x, head2)) = 'restored', 'owner restores a head admin');
  perform pg_temp.check(pg_temp.result(public.suspend_staff_member(x, owner_id)) = 'forbidden', 'owner cannot suspend self');

  perform pg_temp.act(head1);
  perform pg_temp.check(pg_temp.result(public.suspend_staff_member(x, admin2)) = 'suspended', 'head admin suspends admin');
end $$;

-- A suspended member keeps membership, role and attribution but has no academy authority.
reset role;
do $$ begin
  perform pg_temp.check(exists (select 1 from public.academy_memberships where academy_id = '9a9a9a9a-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    and user_id = '9b555555-5555-4555-8555-555555555555' and role = 'admin' and suspended_at is not null
    and suspended_by = '9b222222-2222-4222-8222-222222222222'), 'suspension keeps membership and role');
  perform pg_temp.check((select count(*) from edra_private.staff_access_events
    where academy_id = '9a9a9a9a-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and action in ('suspended', 'restored')) = 5, 'suspensions and restorations audited once each');
end $$;
set local role authenticated;

do $$
declare
  x constant uuid := '9a9a9a9a-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  admin2 constant uuid := '9b555555-5555-4555-8555-555555555555';
  year_id uuid;
begin
  perform pg_temp.act(admin2);
  perform pg_temp.check(public.academy_role_for(x) is null, 'suspended: no role');
  perform pg_temp.check(not public.is_academy_member(x), 'suspended: not a member');
  perform pg_temp.check(not public.is_academy_manager(x), 'suspended: not a manager');
  perform pg_temp.check(not exists (select 1 from public.academies where id = x), 'suspended: academy hidden');
  perform pg_temp.check(not exists (select 1 from public.academy_memberships where academy_id = x), 'suspended: memberships hidden, including own');
  perform pg_temp.check(not exists (select 1 from public.academic_years where academy_id = x), 'suspended: academy data hidden');
  perform pg_temp.check(not exists (select 1 from public.profiles where id = '9b111111-1111-4111-8111-111111111111'), 'suspended: coworker profiles hidden');
  perform pg_temp.check(exists (select 1 from public.profiles where id = admin2), 'suspended: own profile visible');
  perform pg_temp.check(not public.is_assignment_image_staff(x::text || '/' || gen_random_uuid()::text), 'suspended: no assignment images');
  perform pg_temp.check(not public.shares_academy_with('9b111111-1111-4111-8111-111111111111'), 'suspended: shares no academy');
  perform pg_temp.check((select array_agg(slug) from public.own_suspended_staff_academies()) = array['access-academy-x'], 'own suspension is disclosed to self');
  update public.academies set name = 'Hijacked' where id = x;
  begin
    perform public.list_staff_invitations(x, null, 0, 20);
    raise exception 'FAILED: suspended admin listed invitations';
  exception when others then if sqlerrm <> 'forbidden' then raise; end if;
  end;
  perform pg_temp.check(pg_temp.result(public.create_staff_invitation(x, '01099000034', 'instructor', repeat('s', 43), 's')) = 'forbidden', 'suspended admin cannot invite');
  perform pg_temp.check(pg_temp.result(public.suspend_staff_member(x, '9b666666-6666-4666-8666-666666666666')) = 'forbidden', 'suspended admin cannot suspend');
  perform pg_temp.check(pg_temp.result(public.restore_staff_member(x, admin2)) = 'forbidden', 'no self-restore');

  -- Another academy and the account are unaffected.
  perform pg_temp.act('9b666666-6666-4666-8666-666666666666');
  perform pg_temp.check(public.is_academy_member('9a9a9a9a-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 'other academy membership is unaffected');

  -- Active staff still see the suspended member and their profile.
  perform pg_temp.act('9b111111-1111-4111-8111-111111111111');
  perform pg_temp.check(exists (select 1 from public.academy_memberships where academy_id = x and user_id = admin2 and suspended_at is not null), 'manager sees suspended member');
  perform pg_temp.check(exists (select 1 from public.profiles where id = admin2), 'manager sees suspended member profile');
  perform pg_temp.check(not exists (select 1 from public.own_suspended_staff_academies()), 'own suspension list is per account');
end $$;

reset role;
do $$ begin
  perform pg_temp.check((select name from public.academies where id = '9a9a9a9a-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 'Access Academy X+', 'suspended update had no effect');
end $$;
set local role authenticated;

-- Changing a suspended member's role does not restore access; removal ends the membership and
-- restoration cannot recreate it.
do $$
declare
  x constant uuid := '9a9a9a9a-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  admin2 constant uuid := '9b555555-5555-4555-8555-555555555555';
begin
  perform pg_temp.act('9b222222-2222-4222-8222-222222222222');
  perform pg_temp.check(pg_temp.result(public.change_staff_member_role(x, admin2, 'instructor')) = 'role_changed', 'role change while suspended');
  perform pg_temp.act(admin2);
  perform pg_temp.check(public.academy_role_for(x) is null, 'role change did not restore access');

  perform pg_temp.act('9b222222-2222-4222-8222-222222222222');
  perform pg_temp.check(pg_temp.result(public.restore_staff_member(x, admin2)) = 'restored', 'restore reinstates the retained role');
  perform pg_temp.act(admin2);
  perform pg_temp.check(public.academy_role_for(x) = 'instructor', 'restored with retained role');

  perform pg_temp.act('9b222222-2222-4222-8222-222222222222');
  perform pg_temp.check(pg_temp.result(public.remove_staff_member(x, admin2)) = 'removed', 'head admin removes an instructor');
  perform pg_temp.check(pg_temp.result(public.restore_staff_member(x, admin2)) = 'not_found', 'restore does not recreate a removed membership');
  perform pg_temp.act(admin2);
  perform pg_temp.check(public.academy_role_for(x) is null, 'removed member has no access');
end $$;

-- Invitations and suspension: acceptance never restores access or changes a role, and a suspended
-- creator cannot appoint until restored.
do $$
declare
  x constant uuid := '9a9a9a9a-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  head1 constant uuid := '9b222222-2222-4222-8222-222222222222';
  inst1 constant uuid := '9b666666-6666-4666-8666-666666666666';
begin
  -- The admin invitation created by head1 above, for recipient 2.
  perform pg_temp.act('9b111111-1111-4111-8111-111111111111');
  perform pg_temp.check(pg_temp.result(public.suspend_staff_member(x, head1)) = 'suspended', 'owner suspends the creator');
  perform pg_temp.act('9d222222-2222-4222-8222-222222222222');
  perform pg_temp.check(pg_temp.result(public.accept_staff_invitation(repeat('a', 43))) = 'inviter_unavailable', 'suspended creator invitation cannot be accepted');
  perform pg_temp.check(public.academy_role_for(x) is null, 'no membership from a suspended creator');
  perform pg_temp.act('9b111111-1111-4111-8111-111111111111');
  perform pg_temp.check(pg_temp.result(public.restore_staff_member(x, head1)) = 'restored', 'owner restores the creator');
  perform pg_temp.act('9d222222-2222-4222-8222-222222222222');
  perform pg_temp.check(pg_temp.result(public.accept_staff_invitation(repeat('a', 43))) = 'joined', 'still-valid invitation is accepted after restoration');
  perform pg_temp.check(public.academy_role_for(x) = 'admin', 'joined as admin');

  -- A suspended member's own new invitation reports membership without changing anything.
  perform pg_temp.act('9b111111-1111-4111-8111-111111111111');
  perform pg_temp.check(pg_temp.result(public.suspend_staff_member(x, '9d222222-2222-4222-8222-222222222222')) = 'suspended', 'suspend recipient');
  perform pg_temp.check(pg_temp.result(public.create_staff_invitation(x, '01099000022', 'head_admin', repeat('r', 43), 'r')) = 'already_member', 'suspended member cannot be re-invited');
  perform pg_temp.act('9d222222-2222-4222-8222-222222222222');
  perform pg_temp.check(pg_temp.result(public.accept_staff_invitation(repeat('a', 43))) = 'accepted', 'accepted replay is history only');
  perform pg_temp.check(public.academy_role_for(x) is null, 'replay does not restore access');
  perform pg_temp.act(inst1);
  perform pg_temp.check(public.academy_role_for(x) = 'instructor', 'unrelated instructor unaffected');
end $$;

reset role;
do $$ begin
  perform pg_temp.check(exists (select 1 from public.academy_memberships where academy_id = '9a9a9a9a-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    and user_id = '9d222222-2222-4222-8222-222222222222' and role = 'admin' and suspended_at is not null), 'replay left the suspended membership unchanged');
end $$;

rollback;
