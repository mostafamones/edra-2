-- Live sessions: grants/RLS, starting from any schedule at any time, roster capture, retry and
-- concurrency outcomes, history preservation, ending without reopening, and tenant isolation.
-- Run with `npm run test:db` against the marked isolated test target (see docs/engineering.md).
-- Any failed assertion aborts psql with a non-zero exit status.
-- Everything runs in one transaction that is rolled back. Generated ids are kept in custom settings.

do $$ begin
  if not (select relrowsecurity from pg_class where oid = 'public.sessions'::regclass)
    or not (select relrowsecurity from pg_class where oid = 'public.session_roster_entries'::regclass)
    or has_table_privilege('anon', 'public.sessions', 'select')
    or has_table_privilege('authenticated', 'public.sessions', 'insert')
    or has_table_privilege('authenticated', 'public.sessions', 'update')
    or has_table_privilege('authenticated', 'public.sessions', 'delete')
    or has_table_privilege('authenticated', 'public.session_roster_entries', 'insert')
    or has_table_privilege('authenticated', 'public.session_roster_entries', 'update')
    or has_table_privilege('authenticated', 'public.session_roster_entries', 'delete') then
    raise exception 'Session tables lack RLS or allow direct writes';
  end if;
  if has_function_privilege('anon', 'public.start_session(uuid, uuid, uuid)', 'execute')
    or has_function_privilege('anon', 'public.end_session(uuid, uuid)', 'execute')
    or has_function_privilege('anon', 'public.list_live_sessions(uuid, timestamptz, uuid, integer)', 'execute')
    or has_function_privilege('anon', 'public.get_session(uuid, uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.protect_session_write()', 'execute')
    or not has_function_privilege('authenticated', 'public.start_session(uuid, uuid, uuid)', 'execute')
    or not has_function_privilege('authenticated', 'public.end_session(uuid, uuid)', 'execute') then
    raise exception 'Session RPC grants are wrong';
  end if;
  -- The retired deletion RPCs: nobody but their owner may execute them, directly or through PUBLIC.
  if exists (
      select 1 from pg_proc p
      cross join (values ('public'), ('anon'), ('authenticated'), ('service_role')) r(role)
      where p.oid in ('public.delete_session(uuid, uuid)'::regprocedure, 'public.force_delete_session(uuid, uuid)'::regprocedure)
        and (p.prosecdef
          or (r.role = 'public' and exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'))
          or (r.role <> 'public' and has_function_privilege(r.role, p.oid, 'execute'))))
    or exists (select 1 from pg_proc where proname = 'reject_published_attendance_delete' and pronamespace = 'public'::regnamespace)
    or has_function_privilege('authenticated', 'public.reject_session_delete()', 'execute')
    or has_function_privilege('service_role', 'public.reject_session_delete()', 'execute')
    or has_function_privilege('service_role', 'public.reject_attendance_history_change()', 'execute')
    or has_table_privilege('service_role', 'public.sessions', 'delete')
    or has_table_privilege('service_role', 'public.sessions', 'truncate')
    or has_table_privilege('service_role', 'public.session_roster_entries', 'delete')
    or has_table_privilege('service_role', 'public.session_roster_entries', 'truncate')
    or has_function_privilege('anon', 'public.academy_role_for(uuid)', 'execute')
    or has_function_privilege('anon', 'public.is_academy_member(uuid)', 'execute')
    or has_function_privilege('anon', 'public.shares_academy_with(uuid)', 'execute') then
    raise exception 'Session history or membership helper grants are wrong';
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

insert into auth.users (id) values
  ('51111111-1111-4111-8111-111111111111'),  -- owner of S
  ('53333333-3333-4333-8333-333333333333'),  -- instructor of S
  ('54444444-4444-4444-8444-444444444444'),  -- second instructor of S
  ('52222222-2222-4222-8222-222222222222'),  -- admin of S
  ('61111111-1111-4111-8111-111111111111'),  -- owner of T
  ('71111111-1111-4111-8111-111111111111');  -- no membership
update public.profiles set full_name = 'Instructor One' where id = '53333333-3333-4333-8333-333333333333';

insert into public.academies (id, name, slug, icon, subject, created_by) values
  ('55555555-5555-4555-8555-555555555555', 'Academy S', 'academy-s', 'school', 'Math', '51111111-1111-4111-8111-111111111111'),
  ('66666666-6666-4666-8666-666666666666', 'Academy T', 'academy-t', 'school', 'Math', '61111111-1111-4111-8111-111111111111');
update public.academic_years set id = '55555555-1111-4111-8111-555555555555', start_year = 2030
where academy_id = '55555555-5555-4555-8555-555555555555';
update public.academic_years set id = '66666666-1111-4111-8111-666666666666', start_year = 2030
where academy_id = '66666666-6666-4666-8666-666666666666';

insert into public.academy_memberships (academy_id, user_id, role, created_by) values
  ('55555555-5555-4555-8555-555555555555', '51111111-1111-4111-8111-111111111111', 'owner', '51111111-1111-4111-8111-111111111111'),
  ('55555555-5555-4555-8555-555555555555', '53333333-3333-4333-8333-333333333333', 'instructor', '51111111-1111-4111-8111-111111111111'),
  ('55555555-5555-4555-8555-555555555555', '54444444-4444-4444-8444-444444444444', 'instructor', '51111111-1111-4111-8111-111111111111'),
  ('55555555-5555-4555-8555-555555555555', '52222222-2222-4222-8222-222222222222', 'admin', '51111111-1111-4111-8111-111111111111'),
  ('66666666-6666-4666-8666-666666666666', '61111111-1111-4111-8111-111111111111', 'owner', '61111111-1111-4111-8111-111111111111');

insert into public.academy_levels (academy_id, level_id, sort_order) values
  ('55555555-5555-4555-8555-555555555555', 'preparatory-3', 9),
  ('55555555-5555-4555-8555-555555555555', 'secondary-2', 11),
  ('66666666-6666-4666-8666-666666666666', 'preparatory-3', 9);
insert into public.academy_tracks (id, academy_id, level_id, name, sort_order) values
  ('5a555555-5555-4555-8555-555555555555', '55555555-5555-4555-8555-555555555555', 'secondary-2', 'Science', 1),
  ('5b555555-5555-4555-8555-555555555555', '55555555-5555-4555-8555-555555555555', 'secondary-2', 'Arts', 2);
insert into public.groups (id, academy_id, academic_year_id, level_id, track_id, name) values
  ('5c555555-5555-4555-8555-555555555555', '55555555-5555-4555-8555-555555555555', '55555555-1111-4111-8111-555555555555', 'preparatory-3', null, 'Nine A'),
  ('5d555555-5555-4555-8555-555555555555', '55555555-5555-4555-8555-555555555555', '55555555-1111-4111-8111-555555555555', 'preparatory-3', null, 'Nine B');

grant usage on schema public, auth to authenticated, anon;

-- ---------------------------------------------------------------------------------------------
-- Owner of S: students and schedules.
set local role authenticated;
set local request.jwt.claim.sub = '51111111-1111-4111-8111-111111111111';

select set_config('test.a1', id::text, true) from public.create_student_record('55555555-5555-4555-8555-555555555555',
  '55555555-1111-4111-8111-555555555555', 'Amal', '01000000001', '01100000000', 'preparatory-3', null, '5c555555-5555-4555-8555-555555555555', 'in_person');
select set_config('test.a2', id::text, true) from public.create_student_record('55555555-5555-4555-8555-555555555555',
  '55555555-1111-4111-8111-555555555555', 'Basma', '01000000002', '01100000000', 'preparatory-3', null, '5c555555-5555-4555-8555-555555555555', 'online_only');
select set_config('test.b1', id::text, true) from public.create_student_record('55555555-5555-4555-8555-555555555555',
  '55555555-1111-4111-8111-555555555555', 'Bahaa', '01000000003', '01100000000', 'preparatory-3', null, '5d555555-5555-4555-8555-555555555555', 'in_person');
select set_config('test.gone', id::text, true) from public.create_student_record('55555555-5555-4555-8555-555555555555',
  '55555555-1111-4111-8111-555555555555', 'Archived', '01000000004', '01100000000', 'preparatory-3', null, '5c555555-5555-4555-8555-555555555555', 'in_person');
select set_config('test.sci', id::text, true) from public.create_student_record('55555555-5555-4555-8555-555555555555',
  '55555555-1111-4111-8111-555555555555', 'Sara', '01000000005', '01100000000', 'secondary-2', '5a555555-5555-4555-8555-555555555555', null, 'in_person');
select set_config('test.arts', id::text, true) from public.create_student_record('55555555-5555-4555-8555-555555555555',
  '55555555-1111-4111-8111-555555555555', 'Adel', '01000000006', '01100000000', 'secondary-2', '5b555555-5555-4555-8555-555555555555', null, 'in_person');
select public.set_student_records_archived('55555555-5555-4555-8555-555555555555', '55555555-1111-4111-8111-555555555555',
  jsonb_build_array(jsonb_build_object('id', current_setting('test.gone'), 'version', 1)), true);

-- A mandatory weekly group class, an optional whole-level class, a program one-off, and an archived schedule.
select set_config('test.weekly', public.create_schedule('55555555-5555-4555-8555-555555555555', '55555555-1111-4111-8111-555555555555',
  'Nine A weekly', 'recurring', 'group', '5c555555-5555-4555-8555-555555555555', null, null, true, 'Room 1',
  '[{"weekday":1,"startsAt":"17:00","endsAt":"18:30"}]', '[]')::text, true);
select set_config('test.optional', public.create_schedule('55555555-5555-4555-8555-555555555555', '55555555-1111-4111-8111-555555555555',
  'Third Preparatory revision', 'recurring', 'level', null, 'preparatory-3', null, false, null,
  '[{"weekday":3,"startsAt":"19:00","endsAt":"20:00"}]', '[]')::text, true);
select set_config('test.program', public.create_schedule('55555555-5555-4555-8555-555555555555', '55555555-1111-4111-8111-555555555555',
  'Science one-off', 'one_off', 'program', null, 'secondary-2', '5a555555-5555-4555-8555-555555555555', true, 'Lab',
  '[]', '[{"date":"2030-10-01","startsAt":"10:00","endsAt":"11:00"}]')::text, true);
select set_config('test.archived', public.create_schedule('55555555-5555-4555-8555-555555555555', '55555555-1111-4111-8111-555555555555',
  'Old class', 'recurring', 'group', '5c555555-5555-4555-8555-555555555555', null, null, true, null,
  '[{"weekday":2,"startsAt":"10:00","endsAt":"11:00"}]', '[]')::text, true);
update public.schedules set archived_at = now() where id = current_setting('test.archived')::uuid;

reset role;

-- Automatic close time: 90 minutes after the planned end of the schedule time closest to the start.
do $$ begin
  -- Monday 2030-09-30, 18:00 academy time (UTC+3) in the 17:00-18:30 slot: closes 20:00 academy time.
  if public.session_auto_end_at(current_setting('test.weekly')::uuid, '2030-09-30 15:00:00+00')
    <> '2030-09-30 17:00:00+00'::timestamptz then raise exception 'Slot auto-close time is wrong'; end if;
  -- No planned time that weekday: 90 minutes after the start.
  if public.session_auto_end_at(current_setting('test.optional')::uuid, '2030-09-30 15:00:00+00')
    <> '2030-09-30 16:30:00+00'::timestamptz then raise exception 'Fallback auto-close time is wrong'; end if;
  -- Started long after the slot ended: never sooner than 90 minutes after the start.
  if public.session_auto_end_at(current_setting('test.weekly')::uuid, '2030-09-30 19:30:00+00')
    <> '2030-09-30 21:00:00+00'::timestamptz then raise exception 'Late start auto-close time is wrong'; end if;
  -- One-off date: 11:00 academy time + 90 minutes.
  if public.session_auto_end_at(current_setting('test.program')::uuid, '2030-10-01 06:00:00+00')
    <> '2030-10-01 09:30:00+00'::timestamptz then raise exception 'One-off auto-close time is wrong'; end if;
end $$;


-- ---------------------------------------------------------------------------------------------
-- An instructor starts a recurring schedule at an arbitrary time (no weekday/time match required).
set local role authenticated;
set local request.jwt.claim.sub = '53333333-3333-4333-8333-333333333333';

select set_config('test.s1', session_id::text, true) from public.start_session(
  '55555555-5555-4555-8555-555555555555', current_setting('test.weekly')::uuid, 'aaaaaaaa-0000-4000-8000-000000000001')
where outcome = 'started';

do $$ begin
  if current_setting('test.s1', true) is null or current_setting('test.s1') = '' then
    raise exception 'Instructor could not start a recurring schedule';
  end if;
  if not exists (
    select 1 from public.sessions where id = current_setting('test.s1')::uuid and state = 'live'
      and started_by = '53333333-3333-4333-8333-333333333333' and started_by_name = 'Instructor One'
      and schedule_title = 'Nine A weekly' and audience = 'group' and group_name = 'Nine A'
      and level_id = 'preparatory-3' and mandatory and location = 'Room 1' and metadata_version = 1
  ) then raise exception 'Session snapshot is wrong'; end if;
  -- Group roster: active in-person Nine A students only (online-only Basma is excluded), expected because the schedule is mandatory.
  if (select array_agg(annual_student_record_id order by annual_student_record_id) from public.session_roster_entries
      where session_id = current_setting('test.s1')::uuid)
    <> array[current_setting('test.a1')::uuid]
    or exists (select 1 from public.session_roster_entries where session_id = current_setting('test.s1')::uuid and origin <> 'expected')
    or exists (select 1 from public.session_roster_entries where session_id = current_setting('test.s1')::uuid
      and (participation_type = 'online_only' or annual_student_record_id = current_setting('test.a2')::uuid))
    or not exists (select 1 from public.session_roster_entries where session_id = current_setting('test.s1')::uuid
      and annual_student_record_id = current_setting('test.a1')::uuid and primary_group_id = '5c555555-5555-4555-8555-555555555555') then
    raise exception 'Group roster capture is wrong';
  end if;
end $$;

-- Retrying with the same key replays; the same key for another schedule is rejected.
do $$ begin
  if (select row(session_id, outcome)::text from public.start_session('55555555-5555-4555-8555-555555555555',
      current_setting('test.weekly')::uuid, 'aaaaaaaa-0000-4000-8000-000000000001'))
    <> row(current_setting('test.s1')::uuid, 'replayed')::text then
    raise exception 'Retry did not return the same session';
  end if;
end $$;
select pg_temp.expect_error($s$ select public.start_session('55555555-5555-4555-8555-555555555555',
  current_setting('test.optional')::uuid, 'aaaaaaaa-0000-4000-8000-000000000001') $s$, 'idempotency_conflict');
select pg_temp.expect_error($s$ select public.start_session('55555555-5555-4555-8555-555555555555',
  current_setting('test.archived')::uuid, 'aaaaaaaa-0000-4000-8000-000000000002') $s$, 'schedule_unavailable');

-- The optional whole-level schedule captures every active preparatory-3 student as eligible.
select set_config('test.s2', session_id::text, true) from public.start_session(
  '55555555-5555-4555-8555-555555555555', current_setting('test.optional')::uuid, 'aaaaaaaa-0000-4000-8000-000000000003');
-- The program one-off starts on a different day than planned and captures only the Science track.
select set_config('test.s3', session_id::text, true) from public.start_session(
  '55555555-5555-4555-8555-555555555555', current_setting('test.program')::uuid, 'aaaaaaaa-0000-4000-8000-000000000004');

do $$ begin
  if (select count(*) from public.session_roster_entries where session_id = current_setting('test.s2')::uuid and origin = 'eligible') <> 2
    or exists (select 1 from public.session_roster_entries where session_id = current_setting('test.s2')::uuid
      and annual_student_record_id = current_setting('test.gone')::uuid) then
    raise exception 'Optional level roster is wrong';
  end if;
  if (select array_agg(annual_student_record_id) from public.session_roster_entries where session_id = current_setting('test.s3')::uuid)
    <> array[current_setting('test.sci')::uuid]
    or (select track_name from public.sessions where id = current_setting('test.s3')::uuid) <> 'Science' then
    raise exception 'Program roster is wrong';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------------------------
-- A second instructor starting the same schedule opens the existing live session.
set local role authenticated;
set local request.jwt.claim.sub = '54444444-4444-4444-8444-444444444444';

do $$ begin
  if (select row(session_id, outcome)::text from public.start_session('55555555-5555-4555-8555-555555555555',
      current_setting('test.weekly')::uuid, 'bbbbbbbb-0000-4000-8000-000000000001'))
    <> row(current_setting('test.s1')::uuid, 'existing')::text then
    raise exception 'Second start did not open the existing live session';
  end if;
  if (select count(*) from public.sessions where schedule_id = current_setting('test.weekly')::uuid) <> 1 then
    raise exception 'A duplicate live session was created';
  end if;
  -- Colleagues discover and open the same session.
  if not exists (select 1 from jsonb_array_elements(public.list_live_sessions('55555555-5555-4555-8555-555555555555', null, null, 50)) e
      where e ->> 'id' = current_setting('test.s1') and (e ->> 'roster_count')::int = 1)
    or public.get_session('55555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid) -> 'session' ->> 'id' <> current_setting('test.s1')
    or jsonb_array_length(public.get_session('55555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid) -> 'roster') <> 1 then
    raise exception 'Live session discovery or details failed';
  end if;
  -- Keyset pagination returns each live session once.
  if jsonb_array_length(public.list_live_sessions(null, null, null, 2)) <> 2
    or (select count(distinct e ->> 'id') from (
      select jsonb_array_elements(public.list_live_sessions(null, null, null, 2)) e
      union all
      select jsonb_array_elements(public.list_live_sessions(null,
        (public.list_live_sessions(null, null, null, 2) -> 1 ->> 'started_at')::timestamptz,
        (public.list_live_sessions(null, null, null, 2) -> 1 ->> 'id')::uuid, 2))
    ) p) <> 3 then
    raise exception 'Live session pagination is wrong';
  end if;
end $$;

-- No direct writes: snapshots and lifecycle change only through the RPCs.
select pg_temp.expect_error($s$ update public.sessions set state = 'ended' where id = current_setting('test.s1')::uuid $s$, 'permission denied%');
select pg_temp.expect_error($s$ delete from public.session_roster_entries where session_id = current_setting('test.s1')::uuid $s$, 'permission denied%');

reset role;

-- ---------------------------------------------------------------------------------------------
-- History: schedule edits and placement changes never rewrite a started session.
set local role authenticated;
set local request.jwt.claim.sub = '51111111-1111-4111-8111-111111111111';
select public.update_schedule(current_setting('test.weekly')::uuid, '55555555-5555-4555-8555-555555555555',
  'Renamed weekly', 'group', '5c555555-5555-4555-8555-555555555555', null, null, false, 'Room 9',
  '[{"weekday":5,"startsAt":"09:00","endsAt":"10:00"}]', '[]');
select public.set_student_records_group('55555555-5555-4555-8555-555555555555', '55555555-1111-4111-8111-555555555555',
  jsonb_build_array(jsonb_build_object('id', current_setting('test.a1'), 'version', 1)), '5d555555-5555-4555-8555-555555555555');
reset role;

do $$ begin
  if not exists (select 1 from public.sessions where id = current_setting('test.s1')::uuid
      and schedule_title = 'Nine A weekly' and mandatory and location = 'Room 1')
    or not exists (select 1 from public.session_roster_entries where session_id = current_setting('test.s1')::uuid
      and annual_student_record_id = current_setting('test.a1')::uuid and primary_group_id = '5c555555-5555-4555-8555-555555555555') then
    raise exception 'Schedule or placement edits rewrote session history';
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Ending: any staff member, final, idempotent; a new live session can start afterwards.
set local role authenticated;
set local request.jwt.claim.sub = '54444444-4444-4444-8444-444444444444';

do $$ begin
  if public.end_session('55555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid) <> 'ended'
    or public.end_session('55555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid) <> 'already_ended' then
    raise exception 'Ending outcomes are wrong';
  end if;
  if not exists (select 1 from public.sessions where id = current_setting('test.s1')::uuid and state = 'ended'
      and ended_by = '54444444-4444-4444-8444-444444444444' and ended_at is not null and metadata_version = 2)
    or exists (select 1 from jsonb_array_elements(public.list_live_sessions('55555555-5555-4555-8555-555555555555', null, null, 50)) e
      where e ->> 'id' = current_setting('test.s1'))
    or (select count(*) from public.session_roster_entries where session_id = current_setting('test.s1')::uuid) <> 1 then
    raise exception 'Ended session state or history is wrong';
  end if;
  if (select outcome from public.start_session('55555555-5555-4555-8555-555555555555',
      current_setting('test.weekly')::uuid, 'bbbbbbbb-0000-4000-8000-000000000002')) <> 'started' then
    raise exception 'A new session could not start after the previous one ended';
  end if;
end $$;

reset role;
-- Even a privileged writer cannot reopen an ended session or rewrite its snapshot.
select pg_temp.expect_error($s$ update public.sessions set state = 'live', ended_at = null, ended_by = null, ended_by_name = null
  where id = current_setting('test.s1')::uuid $s$, 'session_ended');
select pg_temp.expect_error($s$ update public.sessions set schedule_title = 'Changed'
  where id = current_setting('test.s2')::uuid $s$, 'validation');
select pg_temp.expect_error($s$ update public.session_roster_entries set origin = 'eligible'
  where session_id = current_setting('test.s1')::uuid $s$, 'validation');

-- ---------------------------------------------------------------------------------------------
-- Tenant isolation: other academies and non-members see nothing and cannot start or end.
set local role authenticated;
set local request.jwt.claim.sub = '61111111-1111-4111-8111-111111111111';
select pg_temp.expect_error($s$ select public.start_session('55555555-5555-4555-8555-555555555555',
  current_setting('test.optional')::uuid, 'cccccccc-0000-4000-8000-000000000001') $s$, 'forbidden');
-- A schedule id from another academy is not found under the caller's own academy.
select pg_temp.expect_error($s$ select public.start_session('66666666-6666-4666-8666-666666666666',
  current_setting('test.optional')::uuid, 'cccccccc-0000-4000-8000-000000000002') $s$, 'not_found');
select pg_temp.expect_error($s$ select public.end_session('55555555-5555-4555-8555-555555555555',
  current_setting('test.s2')::uuid) $s$, 'forbidden');
select pg_temp.expect_error($s$ select public.end_session('66666666-6666-4666-8666-666666666666',
  current_setting('test.s2')::uuid) $s$, 'not_found');
do $$ begin
  if exists (select 1 from public.sessions) or exists (select 1 from public.session_roster_entries)
    or public.list_live_sessions(null, null, null, 50) <> '[]'::jsonb
    or public.get_session('55555555-5555-4555-8555-555555555555', current_setting('test.s2')::uuid) is not null then
    raise exception 'Another academy can see sessions';
  end if;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '71111111-1111-4111-8111-111111111111';
select pg_temp.expect_error($s$ select public.start_session('55555555-5555-4555-8555-555555555555',
  current_setting('test.optional')::uuid, 'dddddddd-0000-4000-8000-000000000001') $s$, 'forbidden');
do $$ begin
  if exists (select 1 from public.sessions) or public.list_live_sessions(null, null, null, 50) <> '[]'::jsonb then
    raise exception 'A non-member can see sessions';
  end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------------------------
-- Automatic close: 90 minutes after the planned end of the schedule time closest to the start.
do $$ begin
  if (select auto_end_at - started_at from public.sessions where id = current_setting('test.s2')::uuid) < interval '90 minutes' then
    raise exception 'A session closes sooner than 90 minutes after it started';
  end if;
end $$;

-- Backdate a live session past its close time (history triggers are paused for the fixture only).
alter table public.sessions disable trigger sessions_protect_write;
update public.sessions set started_at = now() - interval '5 hours', auto_end_at = now() - interval '1 minute'
where id = current_setting('test.s2')::uuid;
alter table public.sessions enable trigger sessions_protect_write;

set local role authenticated;
set local request.jwt.claim.sub = '53333333-3333-4333-8333-333333333333';
do $$ declare fresh uuid; begin
  -- Reads treat the expired session as ended, even before anything materializes it.
  if exists (select 1 from jsonb_array_elements(public.list_live_sessions('55555555-5555-4555-8555-555555555555', null, null, 50)) e
      where e ->> 'id' = current_setting('test.s2'))
    or (public.get_session('55555555-5555-4555-8555-555555555555', current_setting('test.s2')::uuid) -> 'session' ->> 'state') <> 'ended'
    or (public.get_session('55555555-5555-4555-8555-555555555555', current_setting('test.s2')::uuid) -> 'session' ->> 'end_reason') <> 'auto' then
    raise exception 'An expired session still looks live';
  end if;
  -- Ending an expired session reports it as already ended and records an automatic close.
  if public.end_session('55555555-5555-4555-8555-555555555555', current_setting('test.s2')::uuid) <> 'already_ended' then
    raise exception 'Ending an expired session did not report already_ended';
  end if;
  if not exists (select 1 from public.sessions where id = current_setting('test.s2')::uuid and state = 'ended'
      and end_reason = 'auto' and ended_by is null and ended_at = auto_end_at) then
    raise exception 'Automatic close was not recorded';
  end if;
  -- The schedule is free to start again.
  select session_id into fresh from public.start_session('55555555-5555-4555-8555-555555555555',
    current_setting('test.optional')::uuid, 'eeeeeeee-0000-4000-8000-000000000001') where outcome = 'started';
  if fresh is null or fresh = current_setting('test.s2')::uuid then raise exception 'Could not start after an automatic close'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------------------------
-- History: ended and auto-closed sessions, searchable, never live ones, tenant scoped.
set local role authenticated;
set local request.jwt.claim.sub = '53333333-3333-4333-8333-333333333333';
do $$ declare page jsonb; begin
  page := public.list_past_sessions('55555555-5555-4555-8555-555555555555', null, null, null, null, null, 50);
  if not exists (select 1 from jsonb_array_elements(page) e where e ->> 'id' = current_setting('test.s1') and e ->> 'end_reason' = 'manual')
    or not exists (select 1 from jsonb_array_elements(page) e where e ->> 'id' = current_setting('test.s2') and e ->> 'end_reason' = 'auto')
    or exists (select 1 from jsonb_array_elements(page) e where e ->> 'id' = current_setting('test.s3')) then
    raise exception 'History does not list ended sessions only';
  end if;
  if jsonb_array_length(public.list_past_sessions('55555555-5555-4555-8555-555555555555', 'revision', null, null, null, null, 50)) <> 1
    or jsonb_array_length(public.list_past_sessions('55555555-5555-4555-8555-555555555555', 'no such class', null, null, null, null, 50)) <> 0
    or jsonb_array_length(public.list_past_sessions('55555555-5555-4555-8555-555555555555', '%', null, null, null, null, 50)) <> 0 then
    raise exception 'History search is wrong';
  end if;
  if jsonb_array_length(public.list_past_sessions('55555555-5555-4555-8555-555555555555', null, null, null, null, null, 1)) <> 1 then
    raise exception 'History page size is wrong';
  end if;
  -- Date range: a window around today keeps them, a past window excludes them.
  if jsonb_array_length(public.list_past_sessions('55555555-5555-4555-8555-555555555555', null,
      (now() at time zone 'Africa/Cairo')::date - 1, (now() at time zone 'Africa/Cairo')::date + 1, null, null, 50)) < 2
    or jsonb_array_length(public.list_past_sessions('55555555-5555-4555-8555-555555555555', null,
      '2000-01-01', '2000-01-31', null, null, 50)) <> 0 then
    raise exception 'History date range is wrong';
  end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------------------------
-- Closed years cannot start sessions; ending an existing live session still works.
update public.academic_years set closed_at = now() where id = '55555555-1111-4111-8111-555555555555';
set local role authenticated;
set local request.jwt.claim.sub = '53333333-3333-4333-8333-333333333333';
select pg_temp.expect_error($s$ select public.start_session('55555555-5555-4555-8555-555555555555',
  current_setting('test.program')::uuid, 'aaaaaaaa-0000-4000-8000-000000000009') $s$, 'year_unavailable');
do $$ begin
  if public.end_session('55555555-5555-4555-8555-555555555555', current_setting('test.s3')::uuid) <> 'ended' then
    raise exception 'A live session in a closed year could not end';
  end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------------------------
-- Sessions are history. The retired deletion RPCs are denied to every actor (Owner, Admin,
-- Instructor, signed-in non-member, another academy's Owner, anonymous) for an ended session, and
-- the session and its roster stay. Direct deletes are rejected even for a privileged role.
create function pg_temp.snapshot(p_session uuid) returns text language sql as $$
  select (select row(s.*)::text from public.sessions s where s.id = p_session)
    || (select coalesce(string_agg(row(r.*)::text, ',' order by r.annual_student_record_id), '')
        from public.session_roster_entries r where r.session_id = p_session);
$$;
select set_config('test.s1_before', pg_temp.snapshot(current_setting('test.s1')::uuid), true);
do $$ begin
  if (select state from public.sessions where id = current_setting('test.s1')::uuid) <> 'ended'
    or not exists (select 1 from public.session_roster_entries where session_id = current_setting('test.s1')::uuid) then
    raise exception 'The deletion fixture is not an ended session with a roster';
  end if;
end $$;

set local role authenticated;
do $$
declare actor text; fn text;
begin
  foreach actor in array array['51111111-1111-4111-8111-111111111111', '52222222-2222-4222-8222-222222222222',
    '53333333-3333-4333-8333-333333333333', '71111111-1111-4111-8111-111111111111', '61111111-1111-4111-8111-111111111111'] loop
    perform set_config('request.jwt.claim.sub', actor, true);
    foreach fn in array array['delete_session', 'force_delete_session'] loop
      perform pg_temp.expect_error(format('select public.%I(%L, %L)', fn,
        '55555555-5555-4555-8555-555555555555', current_setting('test.s1')), 'permission denied%');
      perform pg_temp.expect_error(format('select public.%I(%L, %L)', fn,
        '66666666-6666-4666-8666-666666666666', current_setting('test.s1')), 'permission denied%');
    end loop;
  end loop;
end $$;
reset role;
set local role anon;
select pg_temp.expect_error($s$ select public.delete_session('55555555-5555-4555-8555-555555555555',
  current_setting('test.s1')::uuid) $s$, 'permission denied%');
select pg_temp.expect_error($s$ select public.force_delete_session('55555555-5555-4555-8555-555555555555',
  current_setting('test.s1')::uuid) $s$, 'permission denied%');
reset role;

-- An accidental future grant still deletes nothing: the bodies always refuse.
grant execute on function public.delete_session(uuid, uuid), public.force_delete_session(uuid, uuid) to authenticated;
set local role authenticated;
set local request.jwt.claim.sub = '51111111-1111-4111-8111-111111111111';
select pg_temp.expect_error($s$ select public.delete_session('55555555-5555-4555-8555-555555555555',
  current_setting('test.s1')::uuid) $s$, 'forbidden');
select pg_temp.expect_error($s$ select public.force_delete_session('55555555-5555-4555-8555-555555555555',
  current_setting('test.s1')::uuid) $s$, 'forbidden');
reset role;
revoke execute on function public.delete_session(uuid, uuid), public.force_delete_session(uuid, uuid) from authenticated;

-- The former bypass setting no longer lifts the guards, even for the table owner.
select set_config('edra.force_delete_session', 'on', true);
select pg_temp.expect_error($s$ delete from public.session_roster_entries where session_id = current_setting('test.s1')::uuid $s$, 'validation');
select pg_temp.expect_error($s$ delete from public.sessions where id = current_setting('test.s1')::uuid $s$, 'validation');
select set_config('edra.force_delete_session', 'off', true);
set local role service_role;
select pg_temp.expect_error($s$ delete from public.sessions where id = current_setting('test.s1')::uuid $s$, 'permission denied%');
select pg_temp.expect_error($s$ truncate public.session_roster_entries $s$, 'permission denied%');
reset role;

do $$ begin
  if pg_temp.snapshot(current_setting('test.s1')::uuid) is distinct from current_setting('test.s1_before')
    or not exists (select 1 from public.sessions where id = current_setting('test.s2')::uuid) then
    raise exception 'A rejected deletion changed session history';
  end if;
end $$;

rollback;
