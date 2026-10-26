-- Public booking and year learning start (EDRA-231): grants, staff settings authority, stale saves,
-- explicit allowlists, anonymous read/submit outcomes, retry receipts, duplicate phones (archived
-- too), capacity, guest returning-profile reuse, staff-help ambiguity, signed-in prefill/continuation,
-- booking-origin returning onboarding and existing-record connection after closure, provenance,
-- registrations projection, and the manager-controlled year start gate.
-- Run with `npm run test:db` against the disposable GitHub Actions database (see docs/engineering.md).
-- Everything runs in one transaction that is rolled back. Races live in concurrency.sh.

begin;

create function pg_temp.check(condition boolean, message text) returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'FAILED: %', message; end if;
end;
$$;

create function pg_temp.act(account uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(account::text, ''), true);
$$;

create function pg_temp.raises(statement text, expected text) returns boolean language plpgsql as $$
begin
  execute statement;
  return false;
exception when others then
  return sqlerrm = expected;
end;
$$;

-- Submits the form with defaults; only the arguments under test are passed.
create function pg_temp.book(
  p_key uuid, p_phone text, p_level text default 'preparatory-3', p_track uuid default null,
  p_group uuid default '9d111111-1111-4111-8111-111111111111', p_type text default 'in_person',
  p_name text default 'Booked Student', p_parent text default '01282999999',
  p_year uuid default '9e000030-0000-4000-8000-000000000030', p_revision integer default null
) returns jsonb language sql as $$
  select public.submit_student_booking(
    (select token from public.student_booking_links where academy_id = '9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    p_year, coalesce(p_revision, (select revision from public.student_booking_settings where academic_year_id = '9e000030-0000-4000-8000-000000000030')),
    p_key, p_name, p_phone, p_parent, p_level, p_track, p_group, p_type);
$$;

do $$ begin
  perform pg_temp.check(
    not has_table_privilege('anon', 'public.student_booking_settings', 'select')
    and not has_table_privilege('authenticated', 'public.student_booking_settings', 'select')
    and not has_table_privilege('anon', 'public.student_booking_links', 'select')
    and not has_table_privilege('authenticated', 'public.student_booking_receipts', 'select')
    and not has_table_privilege('anon', 'public.annual_student_records', 'select')
    and not has_table_privilege('anon', 'public.academy_student_profiles', 'insert')
    and has_function_privilege('anon', 'public.get_student_booking_form(text)', 'execute')
    and has_function_privilege('anon', 'public.submit_student_booking(text, uuid, integer, uuid, text, text, text, text, uuid, uuid, text)', 'execute')
    and not has_function_privilege('anon', 'public.get_student_booking_settings(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.save_student_booking_settings(uuid, uuid, integer, boolean, boolean, text, text[], uuid[], uuid[])', 'execute')
    and not has_function_privilege('anon', 'public.preview_student_booking_entry(text)', 'execute')
    and not has_function_privilege('anon', 'public.complete_student_booking_entry(text, uuid, uuid)', 'execute')
    and not has_function_privilege('anon', 'public.start_year_learning(uuid, uuid)', 'execute')
    and has_function_privilege('authenticated', 'public.start_year_learning(uuid, uuid)', 'execute')
    and not has_function_privilege('authenticated', 'edra_private.student_entry_complete(text, text, uuid, uuid)', 'execute')
    and not has_function_privilege('anon', 'edra_private.student_entry_preview(text, text)', 'execute')
    and not has_function_privilege('anon', 'edra_private.charge_booking_quota(text, integer, interval)', 'execute')
    and not has_function_privilege('authenticated', 'edra_private.student_booking_programs(public.student_booking_settings, text)', 'execute'),
    'booking grants');
end $$;

insert into auth.users (id, phone, phone_confirmed_at) values
  ('9a111111-1111-4111-8111-111111111111', '201282100001', now()),  -- owner of A
  ('9a222222-2222-4222-8222-222222222222', '201282100002', now()),  -- instructor of A
  ('9a333333-3333-4333-8333-333333333333', '201282100003', now()),  -- owner of B
  ('9b000001-0000-4000-8000-000000000001', '201282000001', now()),  -- signed-in returning
  ('9b000002-0000-4000-8000-000000000002', '201282000002', now()),  -- eligible current-year record
  ('9b000003-0000-4000-8000-000000000003', '201282000003', now()),  -- signed-in first-time
  ('9b000004-0000-4000-8000-000000000004', '201282000004', now()),  -- returning while closed
  ('9b000010-0000-4000-8000-000000000010', '201282000090', now());  -- holds the guest-returning profile link
update public.profiles set full_name = 'Account ' || right(id::text, 2) where id::text like '9b%';
update public.profiles set display_name = 'Prefill Name' where id = '9b000003-0000-4000-8000-000000000003';
insert into public.student_profiles (user_id, parent_phone, parent_phone_verified_at, level_id)
select id, '+201282999998', now(), 'preparatory-3' from auth.users where id::text like '9b00000%';

insert into public.academies (id, name, slug, icon, subject, created_by) values
  ('9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Booking Academy A', 'booking-academy-a', 'school', 'Math', '9a111111-1111-4111-8111-111111111111'),
  ('9ccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Booking Academy B', 'booking-academy-b', 'school', 'Math', '9a333333-3333-4333-8333-333333333333');
insert into public.academy_memberships (academy_id, user_id, role, created_by) values
  ('9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '9a111111-1111-4111-8111-111111111111', 'owner', '9a111111-1111-4111-8111-111111111111'),
  ('9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '9a222222-2222-4222-8222-222222222222', 'instructor', '9a111111-1111-4111-8111-111111111111'),
  ('9ccccccc-cccc-4ccc-8ccc-cccccccccccc', '9a333333-3333-4333-8333-333333333333', 'owner', '9a333333-3333-4333-8333-333333333333');
insert into public.academy_levels (academy_id, level_id, sort_order) values
  ('9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'preparatory-3', 9),
  ('9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'secondary-2', 11),
  ('9ccccccc-cccc-4ccc-8ccc-cccccccccccc', 'preparatory-3', 9);
insert into public.academy_tracks (id, academy_id, level_id, name, sort_order) values
  ('9d555555-5555-4555-8555-555555555555', '9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'secondary-2', 'Science', 1),
  ('9d666666-6666-4666-8666-666666666666', '9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'secondary-2', 'Arts', 2);

-- History: 2028 and 2029 closed; 2030 open and not started.
update public.academic_years set id = '9e000028-0000-4000-8000-000000000028', start_year = 2028
where academy_id = '9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
update public.academic_years set id = '9e100030-0000-4000-8000-000000000030', start_year = 2030
where academy_id = '9ccccccc-cccc-4ccc-8ccc-cccccccccccc';
insert into public.academy_student_profiles (id, academy_id, created_by) values
  ('9f000001-0000-4000-8000-000000000001', '9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '9a111111-1111-4111-8111-111111111111'),
  ('9f000002-0000-4000-8000-000000000002', '9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '9a111111-1111-4111-8111-111111111111'),
  ('9f000003-0000-4000-8000-000000000003', '9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '9a111111-1111-4111-8111-111111111111'),
  ('9f000004-0000-4000-8000-000000000004', '9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '9a111111-1111-4111-8111-111111111111'),
  ('9f000005-0000-4000-8000-000000000005', '9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '9a111111-1111-4111-8111-111111111111'),
  ('9f000006-0000-4000-8000-000000000006', '9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '9a111111-1111-4111-8111-111111111111');
insert into public.annual_student_records (academy_id, academic_year_id, academy_student_profile_id, full_name, student_phone, parent_phone, level_id, participation_type, created_by)
select '9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '9e000028-0000-4000-8000-000000000028', '9f000003-0000-4000-8000-000000000003',
  'Ambiguous One', '+201282000011', '+201282999999', 'preparatory-3', 'in_person', '9a111111-1111-4111-8111-111111111111';
update public.academic_years set closed_at = now() where id = '9e000028-0000-4000-8000-000000000028';
insert into public.academic_years (id, academy_id, start_year) values
  ('9e000029-0000-4000-8000-000000000029', '9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 2029);
insert into public.annual_student_records (academy_id, academic_year_id, academy_student_profile_id, full_name, student_phone, parent_phone, level_id, participation_type, created_by) values
  ('9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '9e000029-0000-4000-8000-000000000029', '9f000001-0000-4000-8000-000000000001', 'Returning Signed In', '+201282000001', '+201282999999', 'preparatory-3', 'online_only', '9a111111-1111-4111-8111-111111111111'),
  ('9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '9e000029-0000-4000-8000-000000000029', '9f000002-0000-4000-8000-000000000002', 'Returning Guest', '+201282000010', '+201282999999', 'preparatory-3', 'online_only', '9a111111-1111-4111-8111-111111111111'),
  ('9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '9e000029-0000-4000-8000-000000000029', '9f000004-0000-4000-8000-000000000004', 'Ambiguous Two', '+201282000011', '+201282999999', 'preparatory-3', 'in_person', '9a111111-1111-4111-8111-111111111111'),
  ('9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '9e000029-0000-4000-8000-000000000029', '9f000005-0000-4000-8000-000000000005', 'Other Phone', '+201282000012', '+201282999999', 'preparatory-3', 'in_person', '9a111111-1111-4111-8111-111111111111'),
  ('9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '9e000029-0000-4000-8000-000000000029', '9f000006-0000-4000-8000-000000000006', 'Returning Closed', '+201282000004', '+201282999999', 'preparatory-3', 'in_person', '9a111111-1111-4111-8111-111111111111');
update public.academic_years set closed_at = now() where id = '9e000029-0000-4000-8000-000000000029';
insert into public.academic_years (id, academy_id, start_year) values
  ('9e000030-0000-4000-8000-000000000030', '9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 2030);
update public.academy_student_profiles set user_id = '9b000010-0000-4000-8000-000000000010', linked_at = now()
where id = '9f000002-0000-4000-8000-000000000002';

insert into public.groups (id, academy_id, academic_year_id, level_id, track_id, name, capacity) values
  ('9d111111-1111-4111-8111-111111111111', '9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '9e000030-0000-4000-8000-000000000030', 'preparatory-3', null, 'Prep Small', 1),
  ('9d222222-2222-4222-8222-222222222222', '9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '9e000030-0000-4000-8000-000000000030', 'preparatory-3', null, 'Prep Hidden', null),
  ('9d333333-3333-4333-8333-333333333333', '9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '9e000030-0000-4000-8000-000000000030', 'secondary-2', null, 'Sec Level Wide', null),
  ('9d444444-4444-4444-8444-444444444444', '9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '9e000030-0000-4000-8000-000000000030', 'secondary-2', '9d555555-5555-4555-8555-555555555555', 'Science Only', null),
  ('9d777777-7777-4777-8777-777777777777', '9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '9e000030-0000-4000-8000-000000000030', 'preparatory-3', null, 'Prep Open', null),
  ('9d888888-8888-4888-8888-888888888888', '9ccccccc-cccc-4ccc-8ccc-cccccccccccc', '9e100030-0000-4000-8000-000000000030', 'preparatory-3', null, 'Foreign', null);

-- Current-year records: S2's eligible record, an archived record and profile 5 under another phone.
insert into public.annual_student_records (academy_id, academic_year_id, academy_student_profile_id, full_name, student_phone, parent_phone, level_id, participation_type, created_by)
values ('9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '9e000030-0000-4000-8000-000000000030', '9f000005-0000-4000-8000-000000000005',
  'Other Phone', '+201282000013', '+201282999999', 'preparatory-3', 'in_person', '9a111111-1111-4111-8111-111111111111');
do $$
declare archived_id uuid;
begin
  perform pg_temp.act('9a111111-1111-4111-8111-111111111111');
  perform public.create_student_record('9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '9e000030-0000-4000-8000-000000000030',
    'Staff Entered', '01282000002', '01282999999', 'secondary-2', '9d555555-5555-4555-8555-555555555555',
    '9d444444-4444-4444-8444-444444444444', 'in_person');
  select id into archived_id from public.create_student_record('9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '9e000030-0000-4000-8000-000000000030',
    'Archived Student', '01282000020', '01282999999', 'preparatory-3', null, null, 'in_person');
  perform public.set_student_records_archived('9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '9e000030-0000-4000-8000-000000000030',
    jsonb_build_array(jsonb_build_object('id', archived_id, 'version', 1)), true);
end $$;

-- Year learning state and settings authority.
do $$
declare state jsonb;
begin
  perform pg_temp.check((select student_learning_started_at is null and student_learning_start_source is null
    from public.academic_years where id = '9e000030-0000-4000-8000-000000000030'), 'a new year starts in preparation');
  perform pg_temp.act('9a222222-2222-4222-8222-222222222222');
  state := public.get_year_learning('9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  perform pg_temp.check(state->'year'->>'id' = '9e000030-0000-4000-8000-000000000030' and state->'year'->>'startedAt' is null
    and not (state->>'canManage')::boolean, 'instructor reads the year learning state');
  perform pg_temp.check(pg_temp.raises($q$select public.start_year_learning('9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '9e000030-0000-4000-8000-000000000030')$q$, 'forbidden'),
    'instructor cannot start the year');

  state := public.get_student_booking_settings('9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  perform pg_temp.check(state->>'token' is null and not (state->'settings'->>'open')::boolean
    and (state->'settings'->>'revision')::int = 0 and not (state->>'canManage')::boolean, 'booking starts closed without a link');
  perform pg_temp.check(pg_temp.raises($q$select public.save_student_booking_settings('9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '9e000030-0000-4000-8000-000000000030', 0, false, false, 'in_person', '{}', '{}', '{}')$q$, 'forbidden'), 'instructor cannot configure booking');

  perform pg_temp.act('9a333333-3333-4333-8333-333333333333');
  perform pg_temp.check(pg_temp.raises($q$select public.get_student_booking_settings('9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$q$, 'forbidden'),
    'another academy cannot read booking settings');
  perform pg_temp.check(pg_temp.raises($q$select public.list_student_booking_registrations('9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 0, 20)$q$, 'forbidden'),
    'another academy cannot list registrations');

  perform pg_temp.act('9a111111-1111-4111-8111-111111111111');
  perform pg_temp.check(pg_temp.raises($q$select public.save_student_booking_settings('9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '9e000030-0000-4000-8000-000000000030', 0, true, false, 'choice', array['preparatory-3'],
    array['9d555555-5555-4555-8555-555555555555', '9d666666-6666-4666-8666-666666666666']::uuid[], '{}')$q$, 'no_options'),
    'opening needs a registration path');
  perform pg_temp.check(pg_temp.raises($q$select public.save_student_booking_settings('9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '9e100030-0000-4000-8000-000000000030', 0, false, false, 'choice', '{}', '{}', '{}')$q$, 'year_unavailable'), 'a foreign year is refused');
  state := public.save_student_booking_settings('9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '9e000030-0000-4000-8000-000000000030', 0, false, false, 'choice',
    array['secondary-2'], array['9d666666-6666-4666-8666-666666666666']::uuid[],
    array['9d222222-2222-4222-8222-222222222222', '9d888888-8888-4888-8888-888888888888']::uuid[]);
  perform pg_temp.check(state->>'token' ~ '^[A-Za-z0-9_-]{43}$' and (state->'settings'->>'revision')::int = 1
    and state->'settings'->'excludedLevelIds' = '[]'::jsonb
    and state->'settings'->'excludedTrackIds' = '["9d666666-6666-4666-8666-666666666666"]'::jsonb
    and state->'settings'->'excludedGroupIds' = '["9d222222-2222-4222-8222-222222222222"]'::jsonb, 'settings keep only live academy exclusions');
  perform pg_temp.check(pg_temp.raises($q$select public.save_student_booking_settings('9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '9e000030-0000-4000-8000-000000000030', 0, true, false, 'choice', '{}', '{}', '{}')$q$, 'stale'), 'a stale save cannot overwrite');
  perform public.save_student_booking_settings('9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '9e000030-0000-4000-8000-000000000030', 1, true, false, 'choice',
    '{}', array['9d666666-6666-4666-8666-666666666666']::uuid[], array['9d222222-2222-4222-8222-222222222222']::uuid[]);
end $$;

-- Anonymous form read.
do $$
declare form jsonb;
begin
  perform pg_temp.act(null);
  form := public.get_student_booking_form((select token from public.student_booking_links where academy_id = '9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
  perform pg_temp.check(form->>'result' = 'open' and (form->>'revision')::int = 2 and form->>'participation' = 'choice'
    and not (form->>'groupOptional')::boolean and form->'year'->>'id' = '9e000030-0000-4000-8000-000000000030', 'open form');
  perform pg_temp.check(jsonb_array_length(form->'programs') = 2
    and form->'programs'->0->>'levelId' = 'preparatory-3' and form->'programs'->0->>'trackId' is null
    and jsonb_array_length(form->'programs'->0->'groups') = 2
    and form->'programs'->1->>'trackId' = '9d555555-5555-4555-8555-555555555555'
    and jsonb_array_length(form->'programs'->1->'groups') = 2, 'excluded programs and groups are hidden');
  insert into public.groups (id, academy_id, academic_year_id, level_id, track_id, name, capacity) values ('9d999999-9999-4999-8999-999999999999',
    '9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '9e000030-0000-4000-8000-000000000030', 'preparatory-3', null, 'Prep Later', null);
  perform pg_temp.check(public.get_student_booking_form((select token from public.student_booking_links
      where academy_id = '9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'))->'programs'->0->'groups' @> '[{"name": "Prep Later"}]',
    'a group created after saving is offered by default');
  delete from public.groups where id = '9d999999-9999-4999-8999-999999999999';
  perform pg_temp.check(form::text !~ 'token|9f00000|inviteToken' and not (form ? 'settings'), 'no internals in the public form');
  perform pg_temp.check(public.get_student_booking_form(repeat('A', 43))->>'result' = 'invalid'
    and public.get_student_booking_form('short')->>'result' = 'invalid', 'invalid booking tokens');
end $$;

-- Anonymous submissions.
do $$
declare
  initial jsonb;
  outcome jsonb;
  rec public.annual_student_records%rowtype;
  prof public.academy_student_profiles%rowtype;
  i integer;
begin
  perform pg_temp.act(null);
  initial := pg_temp.book('91000000-0000-4000-8000-000000000001', '01282000030');
  perform pg_temp.check(initial->>'result' = 'registered' and initial->'receipt'->>'id' is not null, 'guest registration');
  select * into rec from public.annual_student_records where student_phone = '+201282000030';
  select * into prof from public.academy_student_profiles where id = rec.academy_student_profile_id;
  perform pg_temp.check(rec.created_by is null and rec.created_via = 'booking' and rec.participation_type = 'in_person'
    and rec.primary_group_id = '9d111111-1111-4111-8111-111111111111' and rec.full_name = 'Booked Student'
    and prof.created_by is null and prof.created_via = 'booking' and prof.user_id is null, 'record-only provenance without an account');

  outcome := pg_temp.book('91000000-0000-4000-8000-000000000001', '01282000030');
  perform pg_temp.check(outcome->>'result' = 'registered' and outcome->'receipt'->>'id' = initial->'receipt'->>'id'
    and (select count(*) from public.annual_student_records where student_phone = '+201282000030') = 1, 'identical retry returns the receipt');
  perform pg_temp.check(pg_temp.book('91000000-0000-4000-8000-000000000001', '01282000030', p_name => 'Changed')->>'result' = 'invalid',
    'a changed payload cannot reuse the retry key');
  perform pg_temp.check(pg_temp.book(gen_random_uuid(), '01282000031')->>'result' = 'group_full', 'full group');
  perform pg_temp.check(pg_temp.book(gen_random_uuid(), '01282000031', p_group => null)->>'result' = 'invalid_choice', 'group required');
  perform pg_temp.check(pg_temp.book(gen_random_uuid(), '01282000031', p_group => '9d222222-2222-4222-8222-222222222222')->>'result' = 'invalid_choice',
    'a group not enabled for booking');
  perform pg_temp.check(pg_temp.book(gen_random_uuid(), '01282000031', 'secondary-2', '9d666666-6666-4666-8666-666666666666', '9d333333-3333-4333-8333-333333333333')->>'result' = 'invalid_choice',
    'a track not enabled for booking');
  perform pg_temp.check(pg_temp.book(gen_random_uuid(), '01282000031', 'secondary-2', null, '9d333333-3333-4333-8333-333333333333')->>'result' = 'invalid_choice',
    'a level with tracks requires an enabled track');
  perform pg_temp.check(pg_temp.book(gen_random_uuid(), '01282000031', 'preparatory-3', null, '9d888888-8888-4888-8888-888888888888')->>'result' = 'invalid_choice',
    'a foreign group');
  perform pg_temp.check(pg_temp.book(gen_random_uuid(), '+20 128 200 0030', p_group => '9d777777-7777-4777-8777-777777777777')->>'result' = 'already_registered',
    'duplicate current-year phone');
  perform pg_temp.check(pg_temp.book(gen_random_uuid(), '01282000020', p_group => '9d777777-7777-4777-8777-777777777777')->>'result' = 'already_registered',
    'archived records keep their phone');
  outcome := pg_temp.book(gen_random_uuid(), '0128200003x');
  perform pg_temp.check(outcome->>'result' = 'validation' and outcome->>'field' = 'student_phone', 'invalid student phone');
  outcome := pg_temp.book(gen_random_uuid(), '01282000032', p_name => '   ');
  perform pg_temp.check(outcome->>'result' = 'validation' and outcome->>'field' = 'full_name', 'blank name');
  outcome := pg_temp.book(gen_random_uuid(), '01282000032', p_group => '9d777777-7777-4777-8777-777777777777', p_type => null);
  perform pg_temp.check(outcome->>'result' = 'validation' and outcome->>'field' = 'participation_type', 'participation choice required');
  perform pg_temp.check(pg_temp.book(gen_random_uuid(), '01282000032', p_revision => 1)->>'result' = 'changed', 'stale revision');
  perform pg_temp.check(pg_temp.book(gen_random_uuid(), '01282000032', p_year => '9e000029-0000-4000-8000-000000000029')->>'result' = 'changed', 'stale year');

  -- Shared name and parent phone do not block registration.
  perform pg_temp.check(pg_temp.book(gen_random_uuid(), '01282000033', 'secondary-2', '9d555555-5555-4555-8555-555555555555',
    '9d333333-3333-4333-8333-333333333333', 'online_only')->>'result' = 'registered', 'shared name and parent accepted');
  perform pg_temp.check((select participation_type = 'online_only' and track_id = '9d555555-5555-4555-8555-555555555555'
    from public.annual_student_records where student_phone = '+201282000033'), 'chosen participation and level-wide group');

  -- Guest returning: the unique historical profile is reused; its link and history are preserved.
  perform pg_temp.check(pg_temp.book(gen_random_uuid(), '01282000010', p_group => '9d777777-7777-4777-8777-777777777777', p_name => 'Guest Returning')->>'result' = 'registered',
    'guest returning registration');
  select * into rec from public.annual_student_records where student_phone = '+201282000010' and academic_year_id = '9e000030-0000-4000-8000-000000000030';
  select * into prof from public.academy_student_profiles where id = '9f000002-0000-4000-8000-000000000002';
  perform pg_temp.check(rec.academy_student_profile_id = prof.id and rec.full_name = 'Guest Returning'
    and rec.participation_type = 'in_person' and prof.user_id = '9b000010-0000-4000-8000-000000000010'
    and prof.created_via = 'direct' and prof.created_by = '9a111111-1111-4111-8111-111111111111'
    and (select count(*) from public.annual_student_records where academy_student_profile_id = prof.id) = 2, 'historical profile reused unchanged');
  outcome := pg_temp.book(gen_random_uuid(), '01282000011', p_group => '9d777777-7777-4777-8777-777777777777');
  perform pg_temp.check(outcome->>'result' = 'staff_help' and outcome::text !~ '9f00000|Ambiguous', 'ambiguous history needs staff without disclosure');
  perform pg_temp.check(pg_temp.book(gen_random_uuid(), '01282000012', p_group => '9d777777-7777-4777-8777-777777777777')->>'result' = 'staff_help',
    'a profile already participating under another phone needs staff');
  perform pg_temp.check(not exists (select 1 from public.annual_student_records
    where student_phone in ('+201282000011', '+201282000012') and academic_year_id = '9e000030-0000-4000-8000-000000000030'), 'no staff-help writes');

  -- Durable per-phone quota.
  for i in 1..10 loop
    perform pg_temp.book(gen_random_uuid(), '01282000099', p_group => null);
  end loop;
  perform pg_temp.check(pg_temp.book(gen_random_uuid(), '01282000099', p_group => null)->>'result' = 'rate_limited', 'per-phone quota');
end $$;

-- Signed-in students.
do $$
declare
  state jsonb;
  token text := (select token from public.student_booking_links where academy_id = '9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  rec public.annual_student_records%rowtype;
begin
  perform pg_temp.act('9b000003-0000-4000-8000-000000000003');
  state := public.preview_student_booking_entry(token);
  perform pg_temp.check(state->>'result' = 'form' and state->'prefill'->>'fullName' = 'Prefill Name'
    and state->'prefill'->>'studentPhone' = '+201282000003' and state->'prefill'->>'levelId' = 'preparatory-3', 'first-time prefill');
  perform pg_temp.check(public.complete_student_booking_entry(token, null, null)->>'result' = 'form', 'first-time completion routes to the form');
  perform pg_temp.check(pg_temp.book(gen_random_uuid(), '01282000003', p_group => '9d777777-7777-4777-8777-777777777777')->>'result' = 'registered',
    'signed-in first-time registration');
  perform pg_temp.check((select r.created_by = '9b000003-0000-4000-8000-000000000003' and p.user_id is null
    from public.annual_student_records r join public.academy_student_profiles p on p.id = r.academy_student_profile_id
    where r.student_phone = '+201282000003'), 'signed-in booking does not link the account');
  perform pg_temp.check(public.preview_student_booking_entry(token)->>'result' = 'existing', 'the new record is later connectable');

  perform pg_temp.act('9b000001-0000-4000-8000-000000000001');
  perform pg_temp.check(pg_temp.book(gen_random_uuid(), '01282000040', p_group => '9d777777-7777-4777-8777-777777777777')->>'result' = 'continue',
    'signed-in returning students continue through onboarding');
  state := public.preview_student_booking_entry(token);
  perform pg_temp.check(state->>'result' = 'enroll' and (state->>'returning')::boolean and not (state->>'groupOptional')::boolean
    and jsonb_array_length(state->'programs') = 1 and jsonb_array_length(state->'programs'->0->'groups') = 2, 'returning onboarding uses booking choices');
  perform pg_temp.check(public.complete_student_booking_entry(token, null, null)->>'result' = 'invalid_choice', 'booking requires a group');
  perform pg_temp.check(public.complete_student_booking_entry(token, null, '9d222222-2222-4222-8222-222222222222')->>'result' = 'invalid_choice',
    'booking onboarding refuses a group not enabled');
  perform pg_temp.check(public.complete_student_booking_entry(token, null, '9d777777-7777-4777-8777-777777777777')->>'result' = 'connected', 'returning completion');
  select * into rec from public.annual_student_records
  where academy_student_profile_id = '9f000001-0000-4000-8000-000000000001' and academic_year_id = '9e000030-0000-4000-8000-000000000030';
  perform pg_temp.check(rec.participation_type = 'online_only' and rec.created_via = 'booking' and rec.level_id = 'preparatory-3'
    and (select user_id from public.academy_student_profiles where id = '9f000001-0000-4000-8000-000000000001') = '9b000001-0000-4000-8000-000000000001'
    and exists (select 1 from public.student_booking_receipts where annual_student_record_id = rec.id and entry = 'onboarding'),
    'returning onboarding keeps the profile and participation type with booking provenance');
  perform pg_temp.check(public.get_my_student_academy('booking-academy-a')->>'access' = 'not_started'
    and edra_private.student_caller_record('9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '9e000030-0000-4000-8000-000000000030') is null,
    'the academy is visible while protected learning waits for the start');

  -- Closing booking blocks new annual creation but keeps existing-record connection.
  perform pg_temp.act('9a111111-1111-4111-8111-111111111111');
  perform public.save_student_booking_settings('9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '9e000030-0000-4000-8000-000000000030',
    (select revision from public.student_booking_settings where academic_year_id = '9e000030-0000-4000-8000-000000000030'),
    false, false, 'choice', '{}', array['9d555555-5555-4555-8555-555555555555', '9d666666-6666-4666-8666-666666666666']::uuid[],
    array['9d111111-1111-4111-8111-111111111111', '9d222222-2222-4222-8222-222222222222']::uuid[]);
  perform pg_temp.act(null);
  perform pg_temp.check(public.get_student_booking_form(token)->>'result' = 'closed'
    and pg_temp.book(gen_random_uuid(), '01282000050', p_group => '9d777777-7777-4777-8777-777777777777')->>'result' = 'closed', 'closed form');
  perform pg_temp.check(pg_temp.book('91000000-0000-4000-8000-000000000001', '01282000030', p_revision => 2)->>'result' = 'registered',
    'a committed request still returns its receipt after closure');
  perform pg_temp.act('9b000004-0000-4000-8000-000000000004');
  perform pg_temp.check(public.preview_student_booking_entry(token)->>'result' = 'closed', 'returning onboarding closed with booking');
  perform pg_temp.act('9b000002-0000-4000-8000-000000000002');
  perform pg_temp.check(public.preview_student_booking_entry(token)->>'result' = 'existing', 'existing record while booking is closed');
  perform pg_temp.check(public.complete_student_booking_entry(token, null, null)->>'result' = 'connected', 'existing record connected');
  perform pg_temp.check((select r.primary_group_id = '9d444444-4444-4444-8444-444444444444' and r.full_name = 'Staff Entered' and r.created_via = 'direct'
      and not exists (select 1 from public.student_booking_receipts b where b.annual_student_record_id = r.id)
    from public.annual_student_records r where r.student_phone = '+201282000002'), 'connection preserves the record and is not a registration');

  -- The ordinary invite keeps its own contract.
  perform pg_temp.act('9a111111-1111-4111-8111-111111111111');
  perform public.set_student_invite('9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
  perform pg_temp.act('9b000004-0000-4000-8000-000000000004');
  state := public.preview_student_invite((select invite_token from public.student_enrollment_settings where academy_id = '9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
  perform pg_temp.check(state->>'result' = 'enroll' and not (state ? 'groupOptional'), 'ordinary invite stays independent of booking');
  perform pg_temp.check(public.preview_student_booking_entry((select invite_token from public.student_enrollment_settings
    where academy_id = '9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'))->>'result' = 'invalid', 'an invite token is not booking authority');
end $$;

-- Registrations projection and provenance guards.
do $$
declare list jsonb;
begin
  perform pg_temp.act('9a222222-2222-4222-8222-222222222222');
  list := public.list_student_booking_registrations('9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 0, 20);
  perform pg_temp.check((list->>'total')::int = 5 and jsonb_array_length(list->'rows') = 5
    and exists (select 1 from jsonb_array_elements(list->'rows') r where r->>'entry' = 'onboarding'), 'registrations include form and onboarding creations');
  perform pg_temp.check(pg_temp.raises($q$update public.annual_student_records set created_via = 'direct' where student_phone = '+201282000030'$q$, 'validation')
    and pg_temp.raises($q$update public.academy_student_profiles set created_by = '9a111111-1111-4111-8111-111111111111' where created_via = 'booking'$q$, 'validation')
    and pg_temp.raises($q$insert into public.academy_student_profiles (academy_id, created_by) values ('9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null)$q$,
      'new row for relation "academy_student_profiles" violates check constraint "academy_student_profiles_creator"'),
    'provenance is immutable and anonymous creation is booking-only');
end $$;

-- Starting the year.
do $$
declare initial jsonb; again jsonb;
begin
  perform pg_temp.act('9a111111-1111-4111-8111-111111111111');
  initial := public.start_year_learning('9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '9e000030-0000-4000-8000-000000000030');
  again := public.start_year_learning('9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '9e000030-0000-4000-8000-000000000030');
  perform pg_temp.check(initial->'year'->>'startedAt' is not null and initial = again
    and (select student_learning_start_source = 'manager' and student_learning_started_by = '9a111111-1111-4111-8111-111111111111'
      from public.academic_years where id = '9e000030-0000-4000-8000-000000000030'), 'idempotent manager start');
  perform pg_temp.check(pg_temp.raises($q$select public.start_year_learning('9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '9e100030-0000-4000-8000-000000000030')$q$, 'year_unavailable')
    and pg_temp.raises($q$select public.start_year_learning('9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '9e000029-0000-4000-8000-000000000029')$q$, 'year_unavailable'),
    'foreign and closed years cannot start');
  perform pg_temp.check(pg_temp.raises($q$update public.academic_years set student_learning_started_at = null, student_learning_started_by = null,
    student_learning_start_source = null where id = '9e000030-0000-4000-8000-000000000030'$q$, 'year_unavailable'), 'a start cannot be reverted');

  perform pg_temp.act('9b000001-0000-4000-8000-000000000001');
  perform pg_temp.check(public.get_my_student_academy('booking-academy-a')->>'access' = 'active'
    and edra_private.student_caller_record('9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '9e000030-0000-4000-8000-000000000030') is not null,
    'the start enables otherwise-permitted learning');
  update public.academy_student_profiles set access_suspended_at = now() where id = '9f000001-0000-4000-8000-000000000001';
  perform pg_temp.check(public.get_my_student_academy('booking-academy-a')->>'access' = 'suspended'
    and edra_private.student_caller_record('9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '9e000030-0000-4000-8000-000000000030') is null,
    'independent suspension still applies after the start');
end $$;

rollback;
