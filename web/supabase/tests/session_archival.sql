-- Session archival and restoration: manager-only and open-year-only commands, atomic end of a live
-- session, read-only archived attendance, preserved history, counting exclusion, stopped pending
-- effects, idempotent retries and stale versions, list filters, and restoration without reopening.
-- Run with `npm run test:db` against the marked isolated test target (see docs/engineering.md).
-- Everything runs in one transaction that is rolled back. Generated ids are kept in custom settings.

do $$ begin
  if has_function_privilege('anon', 'public.archive_session(uuid, uuid, integer, uuid, text)', 'execute')
    or has_function_privilege('anon', 'public.restore_session(uuid, uuid, integer, uuid)', 'execute')
    or not has_function_privilege('authenticated', 'public.archive_session(uuid, uuid, integer, uuid, text)', 'execute')
    or not has_function_privilege('authenticated', 'public.restore_session(uuid, uuid, integer, uuid)', 'execute')
    or has_function_privilege('authenticated', 'edra_private.change_session_archive(text, uuid, uuid, integer, uuid, text)', 'execute')
    or has_function_privilege('authenticated', 'edra_private.claim_attendance_effect(uuid)', 'execute')
    or has_function_privilege('authenticated', 'edra_private.attendance_effect_pending(uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.broadcast_session_change()', 'execute')
    or has_function_privilege('anon', 'public.list_past_sessions(uuid, text, date, date, timestamptz, uuid, integer, text)', 'execute')
    or has_table_privilege('anon', 'public.counted_attendance', 'select')
    or not has_table_privilege('authenticated', 'public.counted_attendance', 'select')
    or has_table_privilege('authenticated', 'public.session_archive_requests', 'select')
    or has_table_privilege('authenticated', 'public.attendance_effect_suppressions', 'select')
    or has_table_privilege('authenticated', 'public.session_archive_events', 'insert')
    or has_table_privilege('authenticated', 'public.sessions', 'update')
    or has_table_privilege('service_role', 'public.session_archive_events', 'delete')
    or has_table_privilege('service_role', 'public.attendance_effect_suppressions', 'truncate')
    or not (select relrowsecurity from pg_class where oid = 'public.session_archive_events'::regclass)
    or not (select relrowsecurity from pg_class where oid = 'public.session_archive_requests'::regclass)
    or not (select relrowsecurity from pg_class where oid = 'public.attendance_effect_suppressions'::regclass) then
    raise exception 'Session archival grants or RLS are wrong';
  end if;
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

-- Academy E shorthands.
create function pg_temp.version(session_setting text) returns integer language sql as $$
  select metadata_version from public.sessions where id = current_setting(session_setting)::uuid;
$$;
create function pg_temp.archive(session_setting text, version integer, key text, note text default null) returns jsonb language sql as $$
  select public.archive_session('e9555555-5555-4555-8555-555555555555', current_setting(session_setting)::uuid, version, key::uuid, note);
$$;
create function pg_temp.restore(session_setting text, version integer, key text) returns jsonb language sql as $$
  select public.restore_session('e9555555-5555-4555-8555-555555555555', current_setting(session_setting)::uuid, version, key::uuid);
$$;
create function pg_temp.change(session_setting text, record_setting text, status text, version integer, key text) returns jsonb language sql as $$
  select public.apply_attendance_changes('e9555555-5555-4555-8555-555555555555', current_setting(session_setting)::uuid,
    jsonb_build_array(jsonb_build_object('annual_student_record_id', current_setting(record_setting), 'status', status,
      'expected_version', version)), 'set', key::uuid);
$$;
-- Everything stored for a session's attendance history, as text, to compare before and after.
create function pg_temp.history(p_session uuid) returns text language sql as $$
  select concat_ws('|',
    (select string_agg(row(r.*)::text, ',' order by r.annual_student_record_id) from public.session_roster_entries r where r.session_id = p_session),
    (select row(h.*)::text from public.attendance_sheets h where h.session_id = p_session),
    (select string_agg(row(a.*)::text, ',' order by a.annual_student_record_id) from public.attendance_records a where a.session_id = p_session),
    (select string_agg(row(p.*)::text, ',' order by p.sequence) from public.attendance_publications p where p.session_id = p_session),
    (select string_agg(row(i.*)::text, ',' order by i.publication_id, i.annual_student_record_id)
      from public.attendance_publication_items i where i.session_id = p_session),
    (select string_agg(row(e.*)::text, ',' order by e.id) from public.attendance_effects e where e.session_id = p_session),
    (select string_agg(row(q.*)::text, ',' order by q.actor_id, q.idempotency_key) from public.attendance_requests q where q.session_id = p_session));
$$;
create function pg_temp.counted(p_session uuid) returns text language sql as $$
  select coalesce(string_agg(c.annual_student_record_id || ':' || c.status || ':' || c.publication_id, ',' order by c.annual_student_record_id), '')
  from public.counted_attendance c where c.session_id = p_session;
$$;

insert into auth.users (id) values
  ('e9111111-1111-4111-8111-111111111111'),  -- owner of E
  ('e9222222-2222-4222-8222-222222222222'),  -- admin of E
  ('e9333333-3333-4333-8333-333333333333'),  -- instructor of E
  ('e9777777-7777-4777-8777-777777777777'),  -- no membership
  ('f9111111-1111-4111-8111-111111111111');  -- owner of F
update public.profiles set full_name = 'Admin E' where id = 'e9222222-2222-4222-8222-222222222222';
update public.profiles set full_name = 'Instructor E' where id = 'e9333333-3333-4333-8333-333333333333';

insert into public.academies (id, name, slug, icon, subject, created_by) values
  ('e9555555-5555-4555-8555-555555555555', 'Academy E', 'academy-e-archival', 'school', 'Math', 'e9111111-1111-4111-8111-111111111111'),
  ('f9666666-6666-4666-8666-666666666666', 'Academy F', 'academy-f-archival', 'school', 'Math', 'f9111111-1111-4111-8111-111111111111');
update public.academic_years set id = 'e9555555-1111-4111-8111-555555555555', start_year = 2030
where academy_id = 'e9555555-5555-4555-8555-555555555555';
update public.academic_years set id = 'f9666666-1111-4111-8111-666666666666', start_year = 2030
where academy_id = 'f9666666-6666-4666-8666-666666666666';

insert into public.academy_memberships (academy_id, user_id, role, created_by) values
  ('e9555555-5555-4555-8555-555555555555', 'e9111111-1111-4111-8111-111111111111', 'owner', 'e9111111-1111-4111-8111-111111111111'),
  ('e9555555-5555-4555-8555-555555555555', 'e9222222-2222-4222-8222-222222222222', 'admin', 'e9111111-1111-4111-8111-111111111111'),
  ('e9555555-5555-4555-8555-555555555555', 'e9333333-3333-4333-8333-333333333333', 'instructor', 'e9111111-1111-4111-8111-111111111111'),
  ('f9666666-6666-4666-8666-666666666666', 'f9111111-1111-4111-8111-111111111111', 'owner', 'f9111111-1111-4111-8111-111111111111');

insert into public.academy_levels (academy_id, level_id, sort_order) values
  ('e9555555-5555-4555-8555-555555555555', 'grade-9', 9);
insert into public.groups (id, academy_id, academic_year_id, level_id, track_id, name) values
  ('e95c5555-5555-4555-8555-555555555555', 'e9555555-5555-4555-8555-555555555555', 'e9555555-1111-4111-8111-555555555555', 'grade-9', null, 'Nine E');

grant usage on schema public, auth to authenticated, anon;

-- ---------------------------------------------------------------------------------------------
-- Owner of E: four students, two mandatory schedules, and a live session S1 (start key ...0001).
set local role authenticated;
set local request.jwt.claim.sub = 'e9111111-1111-4111-8111-111111111111';
select set_config('test.a1', id::text, true) from public.create_student_record('e9555555-5555-4555-8555-555555555555',
  'e9555555-1111-4111-8111-555555555555', 'Eman', '01009000001', '01109000000', 'grade-9', null, 'e95c5555-5555-4555-8555-555555555555', 'in_person');
select set_config('test.a2', id::text, true) from public.create_student_record('e9555555-5555-4555-8555-555555555555',
  'e9555555-1111-4111-8111-555555555555', 'Ezz', '01009000002', '01109000000', 'grade-9', null, 'e95c5555-5555-4555-8555-555555555555', 'in_person');
select set_config('test.a3', id::text, true) from public.create_student_record('e9555555-5555-4555-8555-555555555555',
  'e9555555-1111-4111-8111-555555555555', 'Esraa', '01009000003', '01109000000', 'grade-9', null, 'e95c5555-5555-4555-8555-555555555555', 'in_person');
select set_config('test.a4', id::text, true) from public.create_student_record('e9555555-5555-4555-8555-555555555555',
  'e9555555-1111-4111-8111-555555555555', 'Elham', '01009000004', '01109000000', 'grade-9', null, 'e95c5555-5555-4555-8555-555555555555', 'in_person');
select set_config('test.weekly', public.create_schedule('e9555555-5555-4555-8555-555555555555', 'e9555555-1111-4111-8111-555555555555',
  'Nine E weekly', 'recurring', 'group', 'e95c5555-5555-4555-8555-555555555555', null, null, true, 'Room 1',
  '[{"weekday":1,"startsAt":"17:00","endsAt":"18:30"}]', '[]')::text, true);
select set_config('test.revision', public.create_schedule('e9555555-5555-4555-8555-555555555555', 'e9555555-1111-4111-8111-555555555555',
  'Nine E revision', 'recurring', 'group', 'e95c5555-5555-4555-8555-555555555555', null, null, true, 'Room 2',
  '[{"weekday":3,"startsAt":"17:00","endsAt":"18:30"}]', '[]')::text, true);
select set_config('test.s1', session_id::text, true) from public.start_session(
  'e9555555-5555-4555-8555-555555555555', current_setting('test.weekly')::uuid, 'e9aaaaaa-0000-4000-8000-000000000001');
reset role;

-- The instructor checks in a1 and marks a2 Absent, finalizes, then checks in a3 as a pending draft.
set local role authenticated;
set local request.jwt.claim.sub = 'e9333333-3333-4333-8333-333333333333';
select public.check_in_attendance('e9555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid,
  current_setting('test.a1')::uuid, 'e9bbbbbb-0000-4000-8000-000000000001');
select pg_temp.change('test.s1', 'test.a2', 'absent', 0, 'e9bbbbbb-0000-4000-8000-000000000002');
select public.publish_attendance('e9555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid, 2,
  'e9bbbbbb-0000-4000-8000-000000000003');
select public.check_in_attendance('e9555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid,
  current_setting('test.a3')::uuid, 'e9bbbbbb-0000-4000-8000-000000000004');
reset role;

-- One effect was already delivered (a stand-in for issued access); the absence event is pending.
update public.attendance_effects set processed_at = now()
where session_id = current_setting('test.s1')::uuid and effect_type = 'explanation_access';
select set_config('test.absence_effect', id::text, true) from public.attendance_effects
where session_id = current_setting('test.s1')::uuid and effect_type = 'absence_event';
do $$ begin
  if current_setting('test.absence_effect', true) is null or current_setting('test.absence_effect') = ''
    or (select count(*) from public.attendance_effects where session_id = current_setting('test.s1')::uuid) <> 2
    or not edra_private.attendance_effect_pending(current_setting('test.absence_effect')::uuid)
    or (select state from public.sessions where id = current_setting('test.s1')::uuid) <> 'live' then
    raise exception 'Archival fixture is wrong';
  end if;
end $$;
select set_config('test.history', pg_temp.history(current_setting('test.s1')::uuid), true);
select set_config('test.counted', pg_temp.counted(current_setting('test.s1')::uuid), true);
select set_config('test.v1', pg_temp.version('test.s1')::text, true);
do $$ begin
  if current_setting('test.counted') not like '%:present:%' or current_setting('test.counted') not like '%:absent:%'
    or (select count(*) from public.counted_attendance where session_id = current_setting('test.s1')::uuid) <> 2 then
    raise exception 'Finalized attendance does not count before archival: %', current_setting('test.counted');
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Only managers of the academy may archive: Instructor, a self-promoting Instructor, a non-member and
-- another academy's Owner are rejected and nothing changes.
set local role authenticated;
set local request.jwt.claim.sub = 'e9333333-3333-4333-8333-333333333333';
select pg_temp.expect_error($s$ select pg_temp.archive('test.s1', current_setting('test.v1')::int, 'e9cccccc-0000-4000-8000-000000000001') $s$, 'forbidden');
do $$ begin
  begin
    update public.academy_memberships set role = 'admin'
    where academy_id = 'e9555555-5555-4555-8555-555555555555' and user_id = 'e9333333-3333-4333-8333-333333333333';
  exception when others then null;
  end;
end $$;
select pg_temp.expect_error($s$ select pg_temp.archive('test.s1', current_setting('test.v1')::int, 'e9cccccc-0000-4000-8000-000000000002') $s$, 'forbidden');
set local request.jwt.claim.sub = 'e9777777-7777-4777-8777-777777777777';
select pg_temp.expect_error($s$ select pg_temp.archive('test.s1', current_setting('test.v1')::int, 'e9cccccc-0000-4000-8000-000000000003') $s$, 'forbidden');
set local request.jwt.claim.sub = 'f9111111-1111-4111-8111-111111111111';
select pg_temp.expect_error($s$ select pg_temp.archive('test.s1', current_setting('test.v1')::int, 'e9cccccc-0000-4000-8000-000000000004') $s$, 'forbidden');
select pg_temp.expect_error($s$ select public.archive_session('f9666666-6666-4666-8666-666666666666', current_setting('test.s1')::uuid,
  current_setting('test.v1')::int, 'e9cccccc-0000-4000-8000-000000000005'::uuid) $s$, 'not_found');
reset role;
set local role anon;
select pg_temp.expect_error($s$ select public.archive_session('e9555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid,
  1, 'e9cccccc-0000-4000-8000-000000000006'::uuid) $s$, 'permission denied%');
reset role;

-- A stale version is a conflict that changes nothing and is not remembered.
set local role authenticated;
set local request.jwt.claim.sub = 'e9222222-2222-4222-8222-222222222222';
do $$ declare result jsonb; begin
  result := pg_temp.archive('test.s1', current_setting('test.v1')::int + 5, 'e9cccccc-0000-4000-8000-000000000010');
  if result->>'outcome' <> 'conflict' or (result->'session'->>'metadata_version')::int <> current_setting('test.v1')::int then
    raise exception 'A stale archive was not a conflict: %', result;
  end if;
end $$;
reset role;
do $$ begin
  if (select archived_at from public.sessions where id = current_setting('test.s1')::uuid) is not null
    or (select state from public.sessions where id = current_setting('test.s1')::uuid) <> 'live'
    or exists (select 1 from public.session_archive_requests where idempotency_key = 'e9cccccc-0000-4000-8000-000000000010')
    or exists (select 1 from public.session_archive_events where session_id = current_setting('test.s1')::uuid) then
    raise exception 'A stale archive changed something';
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- The Admin archives the live session: it ends (manually, by the Admin) and archives atomically.
set local role authenticated;
set local request.jwt.claim.sub = 'e9222222-2222-4222-8222-222222222222';
select set_config('test.archived', pg_temp.archive('test.s1', current_setting('test.v1')::int,
  'e9cccccc-0000-4000-8000-000000000011', '  Started on the wrong schedule  ')::text, true);
reset role;
do $$
declare result jsonb := current_setting('test.archived')::jsonb; s public.sessions;
begin
  select * into s from public.sessions where id = current_setting('test.s1')::uuid;
  if result->>'outcome' <> 'archived' or (result->>'ended_live')::boolean is not true
    or (result->>'stopped_effects')::int <> 1 or (result->>'replayed')::boolean
    or s.state <> 'ended' or s.end_reason <> 'manual' or s.ended_by <> 'e9222222-2222-4222-8222-222222222222'
    or s.archived_at is null or s.archived_by <> 'e9222222-2222-4222-8222-222222222222' or s.archived_by_name <> 'Admin E'
    or s.archive_note <> 'Started on the wrong schedule'
    or s.metadata_version <> current_setting('test.v1')::int + 2
    or (result->'session'->>'metadata_version')::int <> s.metadata_version then
    raise exception 'Archiving a live session is wrong: % / %', result, row(s.*);
  end if;
  if (select count(*) from public.session_archive_events where session_id = s.id) <> 1
    or not exists (select 1 from public.session_archive_events where session_id = s.id and action = 'archived'
      and ended_live and actor_id = 'e9222222-2222-4222-8222-222222222222' and metadata_version = s.metadata_version)
    or (select count(*) from public.attendance_effect_suppressions where session_id = s.id) <> 1
    or not exists (select 1 from public.attendance_effect_suppressions where effect_id = current_setting('test.absence_effect')::uuid) then
    raise exception 'Archive audit or effect suppression is wrong';
  end if;
  -- Nothing marked absent, finalized or rewritten; the pending draft stays a draft.
  if pg_temp.history(s.id) is distinct from current_setting('test.history')
    or exists (select 1 from public.attendance_records where session_id = s.id and annual_student_record_id = current_setting('test.a4')::uuid)
    or (select published_status from public.attendance_records where session_id = s.id and annual_student_record_id = current_setting('test.a3')::uuid) is not null then
    raise exception 'Archiving changed attendance history';
  end if;
  -- Excluded from counted attendance, and its pending effect can no longer be claimed.
  if exists (select 1 from public.counted_attendance where session_id = s.id)
    or edra_private.attendance_effect_pending(current_setting('test.absence_effect')::uuid)
    or edra_private.claim_attendance_effect(current_setting('test.absence_effect')::uuid) is not null then
    raise exception 'An archived session still counts or delivers effects';
  end if;
end $$;

-- Retrying the same key replays the stored result; a new key is a no-op without another event.
set local role authenticated;
set local request.jwt.claim.sub = 'e9222222-2222-4222-8222-222222222222';
do $$ declare result jsonb; begin
  result := pg_temp.archive('test.s1', current_setting('test.v1')::int, 'e9cccccc-0000-4000-8000-000000000011', 'Started on the wrong schedule');
  if (result->>'replayed')::boolean is not true or result - 'replayed' <> current_setting('test.archived')::jsonb - 'replayed' then
    raise exception 'An archive retry did not replay: %', result;
  end if;
  result := pg_temp.archive('test.s1', pg_temp.version('test.s1'), 'e9cccccc-0000-4000-8000-000000000012');
  if result->>'outcome' <> 'already_archived' then raise exception 'Re-archiving was not a no-op: %', result; end if;
end $$;
-- The same key with a different request is a conflict.
select pg_temp.expect_error($s$ select pg_temp.archive('test.s1', current_setting('test.v1')::int, 'e9cccccc-0000-4000-8000-000000000011', 'Other note') $s$, 'idempotency_conflict');
select pg_temp.expect_error($s$ select pg_temp.restore('test.s1', pg_temp.version('test.s1'), 'e9cccccc-0000-4000-8000-000000000011') $s$, 'idempotency_conflict');
reset role;
do $$ begin
  if (select count(*) from public.session_archive_events where session_id = current_setting('test.s1')::uuid) <> 1 then
    raise exception 'A repeated archive added audit entries';
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Archived attendance is read-only on every path; earlier receipts still replay.
set local role authenticated;
set local request.jwt.claim.sub = 'e9333333-3333-4333-8333-333333333333';
select pg_temp.expect_error($s$ select public.check_in_attendance('e9555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid,
  current_setting('test.a4')::uuid, 'e9bbbbbb-0000-4000-8000-000000000010'::uuid) $s$, 'session_archived');
select pg_temp.expect_error($s$ select public.check_in_attendance_by_code('e9555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid,
  'E-0001', 'e9bbbbbb-0000-4000-8000-000000000011'::uuid, null) $s$, 'session_archived');
select pg_temp.expect_error($s$ select pg_temp.change('test.s1', 'test.a4', 'present', 0, 'e9bbbbbb-0000-4000-8000-000000000012') $s$, 'session_archived');
select pg_temp.expect_error($s$ select public.apply_attendance_changes('e9555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid,
  jsonb_build_array(jsonb_build_object('annual_student_record_id', current_setting('test.a4'), 'status', 'absent', 'expected_version', 0),
    jsonb_build_object('annual_student_record_id', current_setting('test.a3'), 'status', 'late', 'expected_version', 1)),
  'bulk', 'e9bbbbbb-0000-4000-8000-000000000013'::uuid) $s$, 'session_archived');
select pg_temp.expect_error($s$ select public.publish_attendance('e9555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid,
  3, 'e9bbbbbb-0000-4000-8000-000000000014'::uuid) $s$, 'session_archived');
do $$ declare result jsonb; begin
  result := public.check_in_attendance('e9555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid,
    current_setting('test.a3')::uuid, 'e9bbbbbb-0000-4000-8000-000000000004');
  if (result->>'replayed')::boolean is not true or result->>'outcome' <> 'recorded' then
    raise exception 'A stored check-in receipt did not replay: %', result;
  end if;
end $$;
-- Ending again is still harmless.
do $$ begin
  if public.end_session('e9555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid) <> 'already_ended' then
    raise exception 'Ending an archived session did something';
  end if;
end $$;
reset role;
do $$ begin
  if pg_temp.history(current_setting('test.s1')::uuid) is distinct from current_setting('test.history') then
    raise exception 'A rejected write changed archived attendance';
  end if;
end $$;

-- Direct writes cannot fake an archive transition or change ended facts, even for the table owner.
select pg_temp.expect_error($s$ update public.sessions set archive_note = 'edited' where id = current_setting('test.s1')::uuid $s$, 'session_ended');
select pg_temp.expect_error($s$ update public.sessions set ended_at = ended_at + interval '1 minute', archived_at = null, archived_by = null,
  archived_by_name = null, archive_note = null where id = current_setting('test.s1')::uuid $s$, 'session_ended');
select pg_temp.expect_error($s$ delete from public.session_archive_events where session_id = current_setting('test.s1')::uuid $s$, 'validation');
select pg_temp.expect_error($s$ delete from public.attendance_effect_suppressions where session_id = current_setting('test.s1')::uuid $s$, 'validation');
select pg_temp.expect_error($s$ delete from public.sessions where id = current_setting('test.s1')::uuid $s$, 'validation');

-- ---------------------------------------------------------------------------------------------
-- The schedule can run again: a new key starts a new live session; the old key replays the archived
-- original and never reopens it.
set local role authenticated;
set local request.jwt.claim.sub = 'e9333333-3333-4333-8333-333333333333';
do $$ declare row record; begin
  select * into row from public.start_session('e9555555-5555-4555-8555-555555555555', current_setting('test.weekly')::uuid,
    'e9aaaaaa-0000-4000-8000-000000000002');
  if row.outcome <> 'started' or row.session_id = current_setting('test.s1')::uuid then
    raise exception 'The schedule could not start after archival: %', row;
  end if;
  perform set_config('test.s2', row.session_id::text, true);
end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'e9111111-1111-4111-8111-111111111111';
do $$ declare row record; begin
  select * into row from public.start_session('e9555555-5555-4555-8555-555555555555', current_setting('test.weekly')::uuid,
    'e9aaaaaa-0000-4000-8000-000000000001');
  if row.outcome <> 'replayed' or row.session_id <> current_setting('test.s1')::uuid then
    raise exception 'An old start retry did not replay the archived session: %', row;
  end if;
end $$;
reset role;
do $$ begin
  if (select state from public.sessions where id = current_setting('test.s1')::uuid) <> 'ended'
    or (select archived_at from public.sessions where id = current_setting('test.s1')::uuid) is null then
    raise exception 'A start retry reopened or restored the archived session';
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Reads: every member sees the archived session and its trail; lists exclude it by default.
set local role authenticated;
set local request.jwt.claim.sub = 'e9333333-3333-4333-8333-333333333333';
do $$
declare detail jsonb := public.get_session('e9555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid);
  sheet jsonb := public.get_attendance('e9555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid);
  ids text;
begin
  if detail->'session'->>'archived_at' is null or detail->'session'->>'archive_note' <> 'Started on the wrong schedule'
    or (detail->'session'->>'can_manage_archive')::boolean or not (detail->'session'->>'year_open')::boolean
    or jsonb_array_length(detail->'archive_events') <> 1 or detail->'archive_events'->0->>'action' <> 'archived'
    or jsonb_array_length(detail->'roster') <> 4 then
    raise exception 'Archived session details are wrong for an instructor: %', detail;
  end if;
  if sheet->'session'->>'archived_at' is null or jsonb_array_length(sheet->'entries') <> 4 then
    raise exception 'The archived attendance sheet is wrong: %', sheet->'session';
  end if;
  if pg_temp.counted(current_setting('test.s1')::uuid) <> '' then
    raise exception 'Counted attendance shows an archived session to members';
  end if;
  select string_agg(value->>'id', ',') into ids from jsonb_array_elements(public.list_past_sessions(
    'e9555555-5555-4555-8555-555555555555', null, null, null, null, null, 50));
  if ids like '%' || current_setting('test.s1') || '%' then raise exception 'Default history lists an archived session'; end if;
  select string_agg(value->>'id', ',') into ids from jsonb_array_elements(public.list_past_sessions(
    'e9555555-5555-4555-8555-555555555555', null, null, null, null, null, 50, 'archived'));
  if ids is distinct from current_setting('test.s1') then raise exception 'The archived filter is wrong: %', ids; end if;
  select string_agg(value->>'id', ',') into ids from jsonb_array_elements(public.list_past_sessions(
    'e9555555-5555-4555-8555-555555555555', 'wrong', null, null, null, null, 50, 'all'));
  if ids is not null then raise exception 'Search does not apply to the all filter: %', ids; end if;
  select string_agg(value->>'id', ',') into ids from jsonb_array_elements(public.list_past_sessions(
    'e9555555-5555-4555-8555-555555555555', 'weekly', null, null, null, null, 50, 'all'));
  if ids is distinct from current_setting('test.s1') then raise exception 'The all filter is wrong: %', ids; end if;
  if (select (x->>'archived_at') is null from jsonb_array_elements(public.list_past_sessions(
      'e9555555-5555-4555-8555-555555555555', null, null, null, null, null, 50, 'archived')) x) then
    raise exception 'History rows lack archival state';
  end if;
  select string_agg(value->>'id', ',') into ids from jsonb_array_elements(public.list_live_sessions(
    'e9555555-5555-4555-8555-555555555555', null, null, 50));
  if ids is distinct from current_setting('test.s2') then raise exception 'Live list is wrong after archival: %', ids; end if;
end $$;
-- Another academy sees nothing.
set local request.jwt.claim.sub = 'f9111111-1111-4111-8111-111111111111';
do $$ begin
  if public.get_session('e9555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid) is not null
    or exists (select 1 from public.session_archive_events where session_id = current_setting('test.s1')::uuid)
    or jsonb_array_length(public.list_past_sessions('e9555555-5555-4555-8555-555555555555', null, null, null, null, null, 50, 'all')) <> 0 then
    raise exception 'Archived history leaked across academies';
  end if;
end $$;
set local request.jwt.claim.sub = 'e9222222-2222-4222-8222-222222222222';
do $$ begin
  if not (public.get_session('e9555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid)->'session'->>'can_manage_archive')::boolean then
    raise exception 'An admin is not offered archive management';
  end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------------------------
-- Restoration: managers only; never reopens; the same official values count again; drafts stay
-- drafts; stopped effects stay stopped; no publication or effect is created.
select set_config('test.v2', pg_temp.version('test.s1')::text, true);
select set_config('test.end_facts', (select row(ended_at, ended_by, ended_by_name, end_reason, state)::text
  from public.sessions where id = current_setting('test.s1')::uuid), true);
set local role authenticated;
set local request.jwt.claim.sub = 'e9333333-3333-4333-8333-333333333333';
select pg_temp.expect_error($s$ select pg_temp.restore('test.s1', current_setting('test.v2')::int, 'e9cccccc-0000-4000-8000-000000000020') $s$, 'forbidden');
set local request.jwt.claim.sub = 'e9111111-1111-4111-8111-111111111111';
do $$ declare result jsonb; begin
  result := pg_temp.restore('test.s1', current_setting('test.v2')::int + 1, 'e9cccccc-0000-4000-8000-000000000021');
  if result->>'outcome' <> 'conflict' then raise exception 'A stale restore was not a conflict: %', result; end if;
  result := pg_temp.restore('test.s1', current_setting('test.v2')::int, 'e9cccccc-0000-4000-8000-000000000022');
  if result->>'outcome' <> 'restored' or result->'session'->>'archived_at' is not null
    or result->'session'->>'state' <> 'ended' or (result->'session'->>'metadata_version')::int <> current_setting('test.v2')::int + 1 then
    raise exception 'Restore is wrong: %', result;
  end if;
  result := pg_temp.restore('test.s1', current_setting('test.v2')::int + 1, 'e9cccccc-0000-4000-8000-000000000023');
  if result->>'outcome' <> 'not_archived' then raise exception 'Restoring twice was not a no-op: %', result; end if;
  -- Retrying the original Archive after the Restore replays history and does not archive again.
  -- Idempotency keys are scoped to the actor who issued the original request.
  set local request.jwt.claim.sub = 'e9222222-2222-4222-8222-222222222222';
  result := pg_temp.archive('test.s1', current_setting('test.v1')::int, 'e9cccccc-0000-4000-8000-000000000011', 'Started on the wrong schedule');
  if (result->>'replayed')::boolean is not true or result->>'outcome' <> 'archived' then
    raise exception 'An old archive retry did not replay: %', result;
  end if;
end $$;
reset role;
do $$ begin
  if (select archived_at from public.sessions where id = current_setting('test.s1')::uuid) is not null
    or (select row(ended_at, ended_by, ended_by_name, end_reason, state)::text from public.sessions where id = current_setting('test.s1')::uuid)
      <> current_setting('test.end_facts')
    or pg_temp.history(current_setting('test.s1')::uuid) is distinct from current_setting('test.history')
    or pg_temp.counted(current_setting('test.s1')::uuid) <> current_setting('test.counted')
    or edra_private.attendance_effect_pending(current_setting('test.absence_effect')::uuid)
    or edra_private.claim_attendance_effect(current_setting('test.absence_effect')::uuid) is not null
    or (select count(*) from public.session_archive_events where session_id = current_setting('test.s1')::uuid) <> 2
    or (select string_agg(action, ',' order by id) from public.session_archive_events where session_id = current_setting('test.s1')::uuid) <> 'archived,restored' then
    raise exception 'Restoration changed history, counting or effects';
  end if;
end $$;

-- Ordinary ended-session review works again; check-ins stay closed.
set local role authenticated;
set local request.jwt.claim.sub = 'e9333333-3333-4333-8333-333333333333';
do $$ declare result jsonb; begin
  result := pg_temp.change('test.s1', 'test.a4', 'excused', 0, 'e9bbbbbb-0000-4000-8000-000000000020');
  if result->>'outcome' <> 'updated' then raise exception 'A restored session cannot be edited: %', result; end if;
end $$;
select pg_temp.expect_error($s$ select public.check_in_attendance('e9555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid,
  current_setting('test.a2')::uuid, 'e9bbbbbb-0000-4000-8000-000000000021'::uuid) $s$, 'session_ended');
reset role;

-- A correction finalized after restoration is ordinary: one new publication; the stopped absence
-- effect stays stopped and is not recreated.
select set_config('test.restored_revision', public.current_attendance_revision(current_setting('test.s1')::uuid)::text, true);
set local role authenticated;
set local request.jwt.claim.sub = 'e9333333-3333-4333-8333-333333333333';
do $$ declare result jsonb; begin
  result := public.publish_attendance('e9555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid,
    current_setting('test.restored_revision')::integer, 'e9bbbbbb-0000-4000-8000-000000000022');
  if result->>'outcome' <> 'published' then raise exception 'Finalizing after restoration failed: %', result; end if;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.attendance_publications where session_id = current_setting('test.s1')::uuid) <> 2
    or (select count(*) from public.attendance_effects where session_id = current_setting('test.s1')::uuid and effect_type = 'absence_event') <> 1
    or (select count(*) from public.counted_attendance where session_id = current_setting('test.s1')::uuid) <> 4 then
    raise exception 'Finalizing after restoration is wrong';
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Archiving an ended session keeps its original end facts.
set local role authenticated;
set local request.jwt.claim.sub = 'e9333333-3333-4333-8333-333333333333';
select public.end_session('e9555555-5555-4555-8555-555555555555', current_setting('test.s2')::uuid);
reset role;
select set_config('test.s2_end', (select row(ended_at, ended_by, ended_by_name, end_reason)::text
  from public.sessions where id = current_setting('test.s2')::uuid), true);
set local role authenticated;
set local request.jwt.claim.sub = 'e9111111-1111-4111-8111-111111111111';
do $$ declare result jsonb; begin
  result := pg_temp.archive('test.s2', pg_temp.version('test.s2'), 'e9cccccc-0000-4000-8000-000000000030');
  if result->>'outcome' <> 'archived' or (result->>'ended_live')::boolean or (result->>'stopped_effects')::int <> 0 then
    raise exception 'Archiving an ended session is wrong: %', result;
  end if;
end $$;
reset role;
do $$ begin
  if (select row(ended_at, ended_by, ended_by_name, end_reason)::text from public.sessions where id = current_setting('test.s2')::uuid)
    <> current_setting('test.s2_end') then
    raise exception 'Archiving changed the end facts of an ended session';
  end if;
end $$;

-- An expired live session is closed by the existing automatic-close rule, then archived. The version
-- the caller reviewed is the one before the lazy expiry is materialized.
set local role authenticated;
set local request.jwt.claim.sub = 'e9111111-1111-4111-8111-111111111111';
select set_config('test.s3', session_id::text, true) from public.start_session(
  'e9555555-5555-4555-8555-555555555555', current_setting('test.revision')::uuid, 'e9aaaaaa-0000-4000-8000-000000000003');
reset role;
alter table public.sessions disable trigger sessions_protect_write;
update public.sessions set started_at = now() - interval '5 hours', auto_end_at = now() - interval '1 minute'
where id = current_setting('test.s3')::uuid;
alter table public.sessions enable trigger sessions_protect_write;
set local role authenticated;
set local request.jwt.claim.sub = 'e9222222-2222-4222-8222-222222222222';
do $$ declare result jsonb; s public.sessions; begin
  result := pg_temp.archive('test.s3', pg_temp.version('test.s3'), 'e9cccccc-0000-4000-8000-000000000040');
  select * into s from public.sessions where id = current_setting('test.s3')::uuid;
  if result->>'outcome' <> 'archived' or (result->>'ended_live')::boolean
    or s.end_reason <> 'auto' or s.ended_at <> s.auto_end_at or s.ended_by is not null or s.archived_at is null then
    raise exception 'Archiving an expired session is wrong: % / %', result, row(s.*);
  end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------------------------
-- Closed years: archive and restore are rejected and change nothing.
update public.academic_years set closed_at = now() where id = 'e9555555-1111-4111-8111-555555555555';
set local role authenticated;
set local request.jwt.claim.sub = 'e9111111-1111-4111-8111-111111111111';
select pg_temp.expect_error($s$ select pg_temp.restore('test.s2', pg_temp.version('test.s2'), 'e9cccccc-0000-4000-8000-000000000050') $s$, 'year_unavailable');
select pg_temp.expect_error($s$ select pg_temp.archive('test.s1', pg_temp.version('test.s1'), 'e9cccccc-0000-4000-8000-000000000051') $s$, 'year_unavailable');
reset role;
do $$ begin
  if (select archived_at from public.sessions where id = current_setting('test.s2')::uuid) is null
    or (select archived_at from public.sessions where id = current_setting('test.s1')::uuid) is not null then
    raise exception 'A closed-year archive or restore changed a session';
  end if;
end $$;

rollback;
