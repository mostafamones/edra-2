-- Development tooling: the synthetic-academy registry and developer preview controls
-- (docs/product/domains/development-tools.md). Generated accounts gain application authority only
-- through a live control's current session; ordinary users are unaffected; browser roles reach no
-- registry table or adapter; synthetic delivery and effects fail closed.
-- Run with `npm run test:db -- development_tooling` against the marked isolated test target.
-- Everything runs in one transaction that is rolled back. Fixture UUIDs use the d0e1 prefix.

do $$
declare t text; f text;
begin
  foreach t in array array['edra_private.dev_developers', 'edra_private.dev_runs', 'edra_private.dev_contacts',
    'edra_private.dev_accounts', 'edra_private.dev_effect_suppressions', 'edra_private.dev_controls',
    'edra_private.dev_commands'] loop
    if has_table_privilege('anon', t, 'select') or has_table_privilege('anon', t, 'insert')
      or has_table_privilege('authenticated', t, 'select') or has_table_privilege('authenticated', t, 'insert') then
      raise exception 'Development tooling table % is readable or writable by a browser role', t;
    end if;
  end loop;
  foreach f in array array['public.dev_delivery_blocked(uuid,text)', 'public.dev_preview_context(uuid)',
    'public.dev_run_targets(uuid)', 'public.dev_account(uuid,text)',
    'public.dev_control_open(uuid,text,uuid,uuid,uuid,text,text)', 'public.dev_control_state(text)',
    'public.dev_control_original(uuid)', 'public.dev_command_begin(uuid,uuid,integer,text,text,uuid)',
    'public.dev_command_complete(uuid,uuid,uuid,uuid,text,boolean,text,text,text)',
    'public.dev_control_end(uuid,text)', 'public.dev_control_sessions(uuid,uuid[])',
    'public.dev_session_revoked(uuid,uuid)'] loop
    if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute') then
      raise exception 'Development tooling function % is executable by a browser role', f;
    end if;
    if not has_function_privilege('service_role', f, 'execute') then
      raise exception 'Development tooling function % is not executable by service_role', f;
    end if;
  end loop;
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

create function pg_temp.assert_eq(label text, actual text, expected text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception '%: expected % but got %', label, expected, actual;
  end if;
end;
$$;

-- Acts as a JWT with the given session and user (password method); clears the per-request caches.
create function pg_temp.act(p_session text, p_user text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_user, 'role', 'authenticated', 'session_id', p_session,
    'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', 1)))::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('edra.verified_session', '', true);
end;
$$;

-- Whether edra_auth.session_allowed() admits the given session and user right now.
create function pg_temp.allowed(p_session text, p_user text) returns text language plpgsql as $$
begin
  perform pg_temp.act(p_session, p_user);
  return edra_auth.session_allowed()::text;
end;
$$;

-- Fixtures. Phones: login contacts 201099000001-03, parent 201099000004, unregistered 201099000005.
insert into auth.users (id, phone, raw_user_meta_data) values
  ('d0e10000-0000-4000-8000-000000000001', null, '{}'),
  ('d0e10000-0000-4000-8000-000000000002', '201099000001', '{}'),
  ('d0e10000-0000-4000-8000-000000000003', '201099000002', '{}'),
  ('d0e10000-0000-4000-8000-000000000004', '201099000003', '{}'),
  ('d0e10000-0000-4000-8000-000000000005', '201099000005', '{}');
insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('d0e10000-0000-4000-8000-0000000000a0', 'd0e10000-0000-4000-8000-000000000001', now(), now()),
  ('d0e10000-0000-4000-8000-0000000000a1', 'd0e10000-0000-4000-8000-000000000002', now(), now()),
  ('d0e10000-0000-4000-8000-0000000000a2', 'd0e10000-0000-4000-8000-000000000002', now(), now()),
  ('d0e10000-0000-4000-8000-0000000000a3', 'd0e10000-0000-4000-8000-000000000003', now(), now()),
  ('d0e10000-0000-4000-8000-0000000000a4', 'd0e10000-0000-4000-8000-000000000004', now(), now()),
  ('d0e10000-0000-4000-8000-0000000000a5', 'd0e10000-0000-4000-8000-000000000005', now(), now());
insert into edra_private.dev_developers (user_id) values ('d0e10000-0000-4000-8000-000000000001');
insert into edra_private.dev_runs (id, project_ref, recipe_version, seed, reference_date, student_count, scenario_hash,
  developer_id, academy_id, state, ready_at) values
  ('d0e10000-0000-4000-8000-0000000000e1', 'msnjxvnblgkdeigctbhk', 'edra-dev-v1', 't', '2026-10-21', 20, repeat('a', 64),
    'd0e10000-0000-4000-8000-000000000001', 'd0e10000-0000-4000-8000-0000000000f1', 'ready', now()),
  ('d0e10000-0000-4000-8000-0000000000e2', 'msnjxvnblgkdeigctbhk', 'edra-dev-v1', 't2', '2026-10-21', 20, repeat('a', 64),
    'd0e10000-0000-4000-8000-000000000001', null, 'failed', null);
insert into edra_private.dev_contacts (phone, run_id, logical_id, purpose) values
  ('+201099000001', 'd0e10000-0000-4000-8000-0000000000e1', 'account:staff:owner', 'login'),
  ('+201099000002', 'd0e10000-0000-4000-8000-0000000000e1', 'account:staff:instructor-1', 'login'),
  ('+201099000003', 'd0e10000-0000-4000-8000-0000000000e1', 'account:student:01', 'login'),
  ('+201099000004', 'd0e10000-0000-4000-8000-0000000000e1', 'account:student:01', 'parent');
insert into edra_private.dev_accounts (run_id, logical_id, kind, display_name, phone, user_id, annual_student_record_id,
  credential_ciphertext, state) values
  ('d0e10000-0000-4000-8000-0000000000e1', 'account:staff:owner', 'owner', 'Owner', '+201099000001',
    'd0e10000-0000-4000-8000-000000000002', null, 'v1.a.b.c', 'loaded'),
  ('d0e10000-0000-4000-8000-0000000000e1', 'account:staff:instructor-1', 'instructor', 'Instructor 1', '+201099000002',
    'd0e10000-0000-4000-8000-000000000003', null, 'v1.a.b.c', 'loaded'),
  ('d0e10000-0000-4000-8000-0000000000e1', 'account:student:01', 'student', 'Student 01', '+201099000003',
    'd0e10000-0000-4000-8000-000000000004', 'd0e10000-0000-4000-8000-0000000000d1', 'v1.a.b.c', 'loaded');

-- D1b: registry-free user metadata cannot make a user synthetic or allowlisted.
update auth.users set raw_user_meta_data = '{"synthetic":true,"developer":true}'
  where id = 'd0e10000-0000-4000-8000-000000000005';
do $$ begin
  if public.dev_delivery_blocked('d0e10000-0000-4000-8000-000000000005',
      '+20' || substr((select phone from auth.users where id = 'd0e10000-0000-4000-8000-000000000005'), 3)) then
    raise exception 'D1b: user metadata made an ordinary user delivery-blocked';
  end if;
  if (public.dev_preview_context('d0e10000-0000-4000-8000-000000000005')->>'allowlisted') <> 'false' then
    raise exception 'D1b: user metadata made an ordinary user allowlisted';
  end if;
end $$;

-- D2: delivery registry.
do $$ begin
  if not public.dev_delivery_blocked(null, '+201099000001') then raise exception 'D2: generated login phone not blocked'; end if;
  if not public.dev_delivery_blocked(null, '201099000001') then raise exception 'D2: phone without + not blocked'; end if;
  if not public.dev_delivery_blocked('d0e10000-0000-4000-8000-000000000004', null) then
    raise exception 'D2: generated student user id not blocked';
  end if;
  if not public.dev_delivery_blocked(null, '+201099000004') then raise exception 'D2: reserved parent phone not blocked'; end if;
  if public.dev_delivery_blocked(null, '+201099000010') then raise exception 'D2: unrelated phone blocked'; end if;
  if public.dev_delivery_blocked('d0e10000-0000-4000-8000-000000000005', null) then
    raise exception 'D2: ordinary user blocked';
  end if;
end $$;
update edra_private.dev_contacts set released_at = now() where phone = '+201099000004';
do $$ begin
  if public.dev_delivery_blocked(null, '+201099000004') then raise exception 'D2: released parent phone still blocked'; end if;
end $$;

-- A3: before any control, generated accounts have no application authority; others are unchanged.
select pg_temp.assert_eq('A3 generated account without control',
  pg_temp.allowed('d0e10000-0000-4000-8000-0000000000a1', 'd0e10000-0000-4000-8000-000000000002'), 'false');
select pg_temp.assert_eq('A3 ordinary user',
  pg_temp.allowed('d0e10000-0000-4000-8000-0000000000a5', 'd0e10000-0000-4000-8000-000000000005'), 'true');
select pg_temp.assert_eq('A3 developer original session',
  pg_temp.allowed('d0e10000-0000-4000-8000-0000000000a0', 'd0e10000-0000-4000-8000-000000000001'), 'true');

-- Opening a control: only an allowlisted developer, a ready run, a live original session, one per session.
select pg_temp.assert_eq('A3 open for ordinary user',
  public.dev_control_open('d0e10000-0000-4000-8000-0000000000c3', repeat('c', 64),
    'd0e10000-0000-4000-8000-0000000000e1', 'd0e10000-0000-4000-8000-000000000005',
    'd0e10000-0000-4000-8000-0000000000a5', 'v1.x.y.z', '/'), 'not_allowed');
select pg_temp.assert_eq('A3 open for unready run',
  public.dev_control_open('d0e10000-0000-4000-8000-0000000000c4', repeat('c', 64),
    'd0e10000-0000-4000-8000-0000000000e2', 'd0e10000-0000-4000-8000-000000000001',
    'd0e10000-0000-4000-8000-0000000000a0', 'v1.x.y.z', '/'), 'run_unavailable');
select pg_temp.assert_eq('A3 open with unknown session',
  public.dev_control_open('d0e10000-0000-4000-8000-0000000000c5', repeat('c', 64),
    'd0e10000-0000-4000-8000-0000000000e1', 'd0e10000-0000-4000-8000-000000000001',
    'd0e10000-0000-4000-8000-0000000000ff', 'v1.x.y.z', '/'), 'session_inactive');
select pg_temp.assert_eq('A3 open control',
  public.dev_control_open('d0e10000-0000-4000-8000-0000000000c1', repeat('b', 64),
    'd0e10000-0000-4000-8000-0000000000e1', 'd0e10000-0000-4000-8000-000000000001',
    'd0e10000-0000-4000-8000-0000000000a0', 'v1.x.y.z', '/'), 'opened');
select pg_temp.assert_eq('A3 second open on same session',
  public.dev_control_open('d0e10000-0000-4000-8000-0000000000c2', repeat('c', 64),
    'd0e10000-0000-4000-8000-0000000000e1', 'd0e10000-0000-4000-8000-000000000001',
    'd0e10000-0000-4000-8000-0000000000a0', 'v1.x.y.z', '/'), 'nested');

-- Enter the owner account. The first command is the only one on revision 0.
do $$ declare j jsonb; begin
  j := public.dev_command_begin('d0e10000-0000-4000-8000-0000000000c1', 'd0e10000-0000-4000-8000-0000000000b1', 0,
    'enter', 'account:staff:owner', 'd0e10000-0000-4000-8000-0000000000a0');
  if j->>'result' <> 'begun' or j->>'revision' <> '1' then raise exception 'A3 enter begin returned %', j; end if;
end $$;
select pg_temp.assert_eq('A3 concurrent begin is busy',
  public.dev_command_begin('d0e10000-0000-4000-8000-0000000000c1', 'd0e10000-0000-4000-8000-0000000000b2', 0,
    'enter', 'account:staff:owner', 'd0e10000-0000-4000-8000-0000000000a0')->>'result', 'busy');
select pg_temp.assert_eq('A3 enter complete',
  public.dev_command_complete('d0e10000-0000-4000-8000-0000000000c1', 'd0e10000-0000-4000-8000-0000000000b1',
    'd0e10000-0000-4000-8000-0000000000a1', 'd0e10000-0000-4000-8000-000000000002', 'v1.r.e.c', true, null, null, null),
  'completed');
select pg_temp.assert_eq('A3 owner current session', pg_temp.allowed('d0e10000-0000-4000-8000-0000000000a1',
  'd0e10000-0000-4000-8000-000000000002'), 'true');
select pg_temp.assert_eq('A3 owner other session', pg_temp.allowed('d0e10000-0000-4000-8000-0000000000a2',
  'd0e10000-0000-4000-8000-000000000002'), 'false');

-- Replay of the completed command: its stored receipt for the same or the replayed previous session.
do $$ declare j jsonb; begin
  j := public.dev_command_begin('d0e10000-0000-4000-8000-0000000000c1', 'd0e10000-0000-4000-8000-0000000000b1', 0,
    'enter', 'account:staff:owner', 'd0e10000-0000-4000-8000-0000000000a0');
  if j->>'result' <> 'replay' or j->>'session_id' <> 'd0e10000-0000-4000-8000-0000000000a1' then
    raise exception 'A3 replay with original session returned %', j;
  end if;
  j := public.dev_command_begin('d0e10000-0000-4000-8000-0000000000c1', 'd0e10000-0000-4000-8000-0000000000b1', 0,
    'enter', 'account:staff:owner', 'd0e10000-0000-4000-8000-0000000000a1');
  if j->>'result' <> 'replay' then raise exception 'A3 replay with issued session returned %', j; end if;
  j := public.dev_command_begin('d0e10000-0000-4000-8000-0000000000c1', 'd0e10000-0000-4000-8000-0000000000b1', 0,
    'enter', 'account:staff:owner', 'd0e10000-0000-4000-8000-0000000000a5');
  if j->>'result' <> 'stale' then raise exception 'A3 replay from an unrelated session returned %', j; end if;
end $$;

-- Conflicts, session mismatch and invalid targets.
select pg_temp.assert_eq('A3 stale revision',
  public.dev_command_begin('d0e10000-0000-4000-8000-0000000000c1', 'd0e10000-0000-4000-8000-0000000000b3', 0,
    'switch', 'account:staff:instructor-1', 'd0e10000-0000-4000-8000-0000000000a1')->>'result', 'conflict');
select pg_temp.assert_eq('A3 session mismatch',
  public.dev_command_begin('d0e10000-0000-4000-8000-0000000000c1', 'd0e10000-0000-4000-8000-0000000000b3', 1,
    'switch', 'account:staff:instructor-1', 'd0e10000-0000-4000-8000-0000000000a2')->>'result', 'session_mismatch');
select pg_temp.assert_eq('A3 unknown target',
  public.dev_command_begin('d0e10000-0000-4000-8000-0000000000c1', 'd0e10000-0000-4000-8000-0000000000b3', 1,
    'switch', 'account:staff:nobody', 'd0e10000-0000-4000-8000-0000000000a1')->>'result', 'invalid_target');
select pg_temp.assert_eq('A3 switch without target',
  public.dev_command_begin('d0e10000-0000-4000-8000-0000000000c1', 'd0e10000-0000-4000-8000-0000000000b3', 1,
    'switch', null, 'd0e10000-0000-4000-8000-0000000000a1')->>'result', 'invalid_target');

-- Switch to the instructor; the owner's session and its replay lose authority.
do $$ declare j jsonb; begin
  j := public.dev_command_begin('d0e10000-0000-4000-8000-0000000000c1', 'd0e10000-0000-4000-8000-0000000000b4', 1,
    'switch', 'account:staff:instructor-1', 'd0e10000-0000-4000-8000-0000000000a1');
  if j->>'result' <> 'begun' or j->>'revision' <> '2' then raise exception 'A3 switch begin returned %', j; end if;
end $$;
select pg_temp.assert_eq('A3 switch complete',
  public.dev_command_complete('d0e10000-0000-4000-8000-0000000000c1', 'd0e10000-0000-4000-8000-0000000000b4',
    'd0e10000-0000-4000-8000-0000000000a3', 'd0e10000-0000-4000-8000-000000000003', 'v1.r.e.c', false, null, null, null),
  'completed');
select pg_temp.assert_eq('A3 instructor current', pg_temp.allowed('d0e10000-0000-4000-8000-0000000000a3',
  'd0e10000-0000-4000-8000-000000000003'), 'true');
select pg_temp.assert_eq('A3 owner after switch', pg_temp.allowed('d0e10000-0000-4000-8000-0000000000a1',
  'd0e10000-0000-4000-8000-000000000002'), 'false');
select pg_temp.assert_eq('A3 old command is stale',
  public.dev_command_begin('d0e10000-0000-4000-8000-0000000000c1', 'd0e10000-0000-4000-8000-0000000000b1', 0,
    'enter', 'account:staff:owner', 'd0e10000-0000-4000-8000-0000000000a0')->>'result', 'stale');

-- Lease loss: a command whose lease expired completes as lost and changes nothing.
do $$ declare j jsonb; begin
  j := public.dev_command_begin('d0e10000-0000-4000-8000-0000000000c1', 'd0e10000-0000-4000-8000-0000000000b5', 2,
    'switch', 'account:student:01', 'd0e10000-0000-4000-8000-0000000000a3');
  if j->>'result' <> 'begun' then raise exception 'A3 lease-loss begin returned %', j; end if;
end $$;
update edra_private.dev_controls set lease_expires_at = now() - interval '1 second'
  where id = 'd0e10000-0000-4000-8000-0000000000c1';
select pg_temp.assert_eq('A3 expired lease completes as lost',
  public.dev_command_complete('d0e10000-0000-4000-8000-0000000000c1', 'd0e10000-0000-4000-8000-0000000000b5',
    'd0e10000-0000-4000-8000-0000000000a4', 'd0e10000-0000-4000-8000-000000000004', 'v1.r.e.c', false, null, null, null),
  'lost');
select pg_temp.assert_eq('A3 lost keeps instructor', pg_temp.allowed('d0e10000-0000-4000-8000-0000000000a3',
  'd0e10000-0000-4000-8000-000000000003'), 'true');
select pg_temp.assert_eq('A3 lost student session', pg_temp.allowed('d0e10000-0000-4000-8000-0000000000a4',
  'd0e10000-0000-4000-8000-000000000004'), 'false');

-- Target mismatch: the completed session's user must be the registered target account.
update edra_private.dev_controls set lease_expires_at = now() - interval '1 second'
  where id = 'd0e10000-0000-4000-8000-0000000000c1';
do $$ declare j jsonb; begin
  j := public.dev_command_begin('d0e10000-0000-4000-8000-0000000000c1', 'd0e10000-0000-4000-8000-0000000000b6', 2,
    'switch', 'account:student:01', 'd0e10000-0000-4000-8000-0000000000a3');
  if j->>'result' <> 'begun' then raise exception 'A3 mismatch begin returned %', j; end if;
end $$;
select pg_temp.expect_error($s$ select public.dev_command_complete('d0e10000-0000-4000-8000-0000000000c1',
  'd0e10000-0000-4000-8000-0000000000b6', 'd0e10000-0000-4000-8000-0000000000a4',
  'd0e10000-0000-4000-8000-000000000002', 'v1.r.e.c', false, null, null, null) $s$, '%dev_target_mismatch%');

-- Return to the real developer: the original tokens are replaced, no generated session is current.
update edra_private.dev_controls set lease_expires_at = now() - interval '1 second'
  where id = 'd0e10000-0000-4000-8000-0000000000c1';
do $$ declare j jsonb; begin
  j := public.dev_command_begin('d0e10000-0000-4000-8000-0000000000c1', 'd0e10000-0000-4000-8000-0000000000b7', 2,
    'return', null, 'd0e10000-0000-4000-8000-0000000000a3');
  if j->>'result' <> 'begun' or j->>'revision' <> '3' then raise exception 'A3 return begin returned %', j; end if;
end $$;
select pg_temp.assert_eq('A3 return complete',
  public.dev_command_complete('d0e10000-0000-4000-8000-0000000000c1', 'd0e10000-0000-4000-8000-0000000000b7',
    null, null, null, false, null, null, 'v1.n.e.w'), 'completed');
do $$ begin
  if (select current_logical_id from edra_private.dev_controls where id = 'd0e10000-0000-4000-8000-0000000000c1') is not null then
    raise exception 'A3 return kept a current generated identity';
  end if;
  if public.dev_control_original('d0e10000-0000-4000-8000-0000000000c1') <> 'v1.n.e.w' then
    raise exception 'A3 return did not replace the original tokens';
  end if;
end $$;
select pg_temp.assert_eq('A3 returned instructor session', pg_temp.allowed('d0e10000-0000-4000-8000-0000000000a3',
  'd0e10000-0000-4000-8000-000000000003'), 'false');

-- Issued-session listing and revocation.
do $$ declare s jsonb; begin
  s := public.dev_control_sessions('d0e10000-0000-4000-8000-0000000000c1', array[]::uuid[]);
  if not (s @> jsonb_build_array(jsonb_build_object('session_id', 'd0e10000-0000-4000-8000-0000000000a1'))
    and s @> jsonb_build_array(jsonb_build_object('session_id', 'd0e10000-0000-4000-8000-0000000000a3'))) then
    raise exception 'A3 session listing misses an issued session: %', s;
  end if;
end $$;
select public.dev_session_revoked('d0e10000-0000-4000-8000-0000000000c1', 'd0e10000-0000-4000-8000-0000000000a1');
do $$ declare s jsonb; begin
  s := public.dev_control_sessions('d0e10000-0000-4000-8000-0000000000c1', array[]::uuid[]);
  if s @> jsonb_build_array(jsonb_build_object('session_id', 'd0e10000-0000-4000-8000-0000000000a1')) then
    raise exception 'A3 revoked session is still listed: %', s;
  end if;
end $$;

-- Expiry and revocation end generated authority. Switch to the instructor again with a new session.
insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('d0e10000-0000-4000-8000-0000000000a6', 'd0e10000-0000-4000-8000-000000000003', now(), now());
do $$ declare j jsonb; begin
  j := public.dev_command_begin('d0e10000-0000-4000-8000-0000000000c1', 'd0e10000-0000-4000-8000-0000000000b8', 3,
    'switch', 'account:staff:instructor-1', 'd0e10000-0000-4000-8000-0000000000a0');
  if j->>'result' <> 'begun' then raise exception 'A3 final switch begin returned %', j; end if;
end $$;
select pg_temp.assert_eq('A3 final switch complete',
  public.dev_command_complete('d0e10000-0000-4000-8000-0000000000c1', 'd0e10000-0000-4000-8000-0000000000b8',
    'd0e10000-0000-4000-8000-0000000000a6', 'd0e10000-0000-4000-8000-000000000003', 'v1.r.e.c', false, null, null, null),
  'completed');
select pg_temp.assert_eq('A3 final instructor session', pg_temp.allowed('d0e10000-0000-4000-8000-0000000000a6',
  'd0e10000-0000-4000-8000-000000000003'), 'true');

update edra_private.dev_controls set expires_at = now() - interval '1 second'
  where id = 'd0e10000-0000-4000-8000-0000000000c1';
select pg_temp.assert_eq('A3 expired control', pg_temp.allowed('d0e10000-0000-4000-8000-0000000000a6',
  'd0e10000-0000-4000-8000-000000000003'), 'false');
update edra_private.dev_controls set expires_at = now() + interval '1 hour'
  where id = 'd0e10000-0000-4000-8000-0000000000c1';
select pg_temp.assert_eq('A3 restored control', pg_temp.allowed('d0e10000-0000-4000-8000-0000000000a6',
  'd0e10000-0000-4000-8000-000000000003'), 'true');

delete from edra_private.dev_developers where user_id = 'd0e10000-0000-4000-8000-000000000001';
select pg_temp.assert_eq('A3 developer removed from allowlist', pg_temp.allowed('d0e10000-0000-4000-8000-0000000000a6',
  'd0e10000-0000-4000-8000-000000000003'), 'false');
insert into edra_private.dev_developers (user_id) values ('d0e10000-0000-4000-8000-000000000001');
select pg_temp.assert_eq('A3 developer restored', pg_temp.allowed('d0e10000-0000-4000-8000-0000000000a6',
  'd0e10000-0000-4000-8000-000000000003'), 'true');

update edra_private.dev_runs set state = 'failed' where id = 'd0e10000-0000-4000-8000-0000000000e1';
select pg_temp.assert_eq('A3 run not ready', pg_temp.allowed('d0e10000-0000-4000-8000-0000000000a6',
  'd0e10000-0000-4000-8000-000000000003'), 'false');
update edra_private.dev_runs set state = 'ready' where id = 'd0e10000-0000-4000-8000-0000000000e1';
select pg_temp.assert_eq('A3 run restored', pg_temp.allowed('d0e10000-0000-4000-8000-0000000000a6',
  'd0e10000-0000-4000-8000-000000000003'), 'true');

delete from auth.sessions where id = 'd0e10000-0000-4000-8000-0000000000a0';
select pg_temp.assert_eq('A3 original session revoked', pg_temp.allowed('d0e10000-0000-4000-8000-0000000000a6',
  'd0e10000-0000-4000-8000-000000000003'), 'false');

select pg_temp.assert_eq('A3 control end', public.dev_control_end('d0e10000-0000-4000-8000-0000000000c1', 'exit'), 'exit');
select pg_temp.assert_eq('A3 ended control not live',
  public.dev_control_state(repeat('b', 64))->>'live', 'false');

-- Run targets come from the registry only.
do $$ begin
  if jsonb_array_length(public.dev_run_targets('d0e10000-0000-4000-8000-0000000000e1')->'staff') <> 2
    or jsonb_array_length(public.dev_run_targets('d0e10000-0000-4000-8000-0000000000e1')->'students') <> 1 then
    raise exception 'A3 run targets have the wrong staff or student counts';
  end if;
  if public.dev_account('d0e10000-0000-4000-8000-0000000000e1', 'account:student:01')->>'user_id'
    <> 'd0e10000-0000-4000-8000-000000000004' then
    raise exception 'A3 dev_account does not return the generated student';
  end if;
end $$;

-- D3: outbox effect consumers exclude synthetic effects, and the suppression triggers exist.
do $$ begin
  if to_regprocedure('edra_private.attendance_effect_pending(uuid)') is null then
    raise exception 'D3: edra_private.attendance_effect_pending(uuid) is missing';
  end if;
  if pg_get_functiondef('edra_private.attendance_effect_pending(uuid)'::regprocedure) not like '%dev_effect_suppressions%' then
    raise exception 'D3: attendance_effect_pending does not exclude dev_effect_suppressions';
  end if;
  if not exists (select 1 from pg_trigger t where t.tgrelid = 'public.attendance_effects'::regclass::oid
    and t.tgname = 'dev_synthetic_effect_suppression' and not t.tgisinternal) then
    raise exception 'D3: dev_synthetic_effect_suppression is missing on attendance_effects';
  end if;
  if not exists (select 1 from pg_trigger t where t.tgrelid = 'public.assignment_result_effects'::regclass::oid
    and t.tgname = 'dev_synthetic_effect_suppression' and not t.tgisinternal) then
    raise exception 'D3: dev_synthetic_effect_suppression is missing on assignment_result_effects';
  end if;
  if not exists (select 1 from pg_trigger t where t.tgrelid = 'public.exam_result_effects'::regclass::oid
    and t.tgname = 'dev_synthetic_effect_suppression' and not t.tgisinternal) then
    raise exception 'D3: dev_synthetic_effect_suppression is missing on exam_result_effects';
  end if;
end $$;

rollback;
