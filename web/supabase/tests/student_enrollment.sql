-- Student enrollment and account linking: grants, invite management, onboarding paths (existing,
-- new, returning, archived, conflicts), closed enrollment, revoked/replaced links, one-to-one
-- links, group capacity, cross-academy independence, archival/independent suspension, and the
-- connected-record resolver used by quizzes and exams.
-- Run with `npm run test:db` against the disposable GitHub Actions database (see docs/engineering.md).
-- Everything runs in one transaction that is rolled back. Separate-session races are not covered.

begin;

-- Fixture years start student learning when created; preparation is covered by student_booking.sql.
create function public.edra_test_start_fixture_year() returns trigger language plpgsql as $fixture$
begin
  new.student_learning_started_at := coalesce(new.student_learning_started_at, now());
  new.student_learning_start_source := coalesce(new.student_learning_start_source, 'legacy');
  return new;
end $fixture$;
create trigger edra_test_fixture_year_started before insert on public.academic_years
for each row execute function public.edra_test_start_fixture_year();

create function pg_temp.check(condition boolean, message text) returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'FAILED: %', message; end if;
end;
$$;

create function pg_temp.act(account uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', account::text, true);
$$;

create function pg_temp.result(value jsonb) returns text language sql as $$ select value ->> 'result' $$;

do $$ begin
  perform pg_temp.check(
    not has_table_privilege('authenticated', 'public.student_enrollment_settings', 'select')
    and not has_table_privilege('anon', 'public.student_enrollment_settings', 'select')
    and not has_function_privilege('anon', 'public.preview_student_invite(text)', 'execute')
    and not has_function_privilege('anon', 'public.complete_student_invite(text, uuid, uuid)', 'execute')
    and has_function_privilege('authenticated', 'public.complete_student_invite(text, uuid, uuid)', 'execute')
    and not has_function_privilege('authenticated', 'edra_private.student_caller_record(uuid, uuid)', 'execute')
    and not has_function_privilege('authenticated', 'edra_private.student_enrollment_match(uuid, uuid, uuid, text)', 'execute')
    and not has_table_privilege('authenticated', 'public.academy_student_profiles', 'update'),
    'enrollment grants');
end $$;

insert into auth.users (id, phone, phone_confirmed_at) values
  ('8a111111-1111-4111-8111-111111111111', '201280000001', now()),  -- owner of N
  ('8a222222-2222-4222-8222-222222222222', '201280000002', now()),  -- instructor of N
  ('8a333333-3333-4333-8333-333333333333', '201280000003', now()),  -- owner of M
  ('8b000001-0000-4000-8000-000000000001', '201281000001', now()),  -- existing current record
  ('8b000002-0000-4000-8000-000000000002', '201281000002', now()),  -- archived current record
  ('8b000003-0000-4000-8000-000000000003', '201281000003', now()),  -- returning, two annual records
  ('8b000004-0000-4000-8000-000000000004', '201281000004', now()),  -- matches two profiles
  ('8b000005-0000-4000-8000-000000000005', '201281000005', now()),  -- genuinely new
  ('8b000006-0000-4000-8000-000000000006', '201281000006', null),   -- unverified phone
  ('8b000007-0000-4000-8000-000000000007', '201281000007', now()),  -- global setup unfinished
  ('8b000008-0000-4000-8000-000000000008', '201281000008', now()),  -- new while closed
  ('8b000009-0000-4000-8000-000000000009', '201281000009', now()),  -- existing while closed
  ('8b000010-0000-4000-8000-000000000010', '201281000010', now()),  -- record already linked to another account
  ('8b000011-0000-4000-8000-000000000011', '201281000011', now()),  -- the other account
  ('8b000012-0000-4000-8000-000000000012', '201281000012', now()),  -- shares parent phone and name
  ('8b000013-0000-4000-8000-000000000013', '201281000013', now()),  -- Second Secondary (academy has a track)
  ('8b000014-0000-4000-8000-000000000014', '201281000014', now());  -- First Secondary (not offered)

update public.profiles set full_name = 'Account Name ' || right(id::text, 2) where id::text like '8b%';
-- Display names: a genuinely new record uses it; existing and returning records keep their names.
update public.profiles set display_name = 'Ignored Display' where id in ('8b000001-0000-4000-8000-000000000001', '8b000003-0000-4000-8000-000000000003');
update public.profiles set display_name = 'مريم أحمد' where id = '8b000005-0000-4000-8000-000000000005';
insert into public.student_profiles (user_id, parent_phone, parent_phone_verified_at, level_id)
select id, '+201289999999', now(), 'preparatory-3' from auth.users
where id::text like '8b%' and id <> '8b000007-0000-4000-8000-000000000007';

update public.student_profiles set level_id = 'secondary-2' where user_id = '8b000013-0000-4000-8000-000000000013';
update public.student_profiles set level_id = 'secondary-1' where user_id = '8b000014-0000-4000-8000-000000000014';

insert into public.academies (id, name, slug, icon, subject, created_by) values
  ('8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Enroll Academy N', 'enroll-academy-n', 'school', 'Math', '8a111111-1111-4111-8111-111111111111'),
  ('8ccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Enroll Academy M', 'enroll-academy-m', 'school', 'Math', '8a333333-3333-4333-8333-333333333333');
insert into public.academy_memberships (academy_id, user_id, role, created_by) values
  ('8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '8a111111-1111-4111-8111-111111111111', 'owner', '8a111111-1111-4111-8111-111111111111'),
  ('8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '8a222222-2222-4222-8222-222222222222', 'instructor', '8a111111-1111-4111-8111-111111111111'),
  ('8ccccccc-cccc-4ccc-8ccc-cccccccccccc', '8a333333-3333-4333-8333-333333333333', 'owner', '8a333333-3333-4333-8333-333333333333');
insert into public.academy_levels (academy_id, level_id, sort_order) values
  ('8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'preparatory-3', 9),
  ('8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'secondary-2', 11),
  ('8ccccccc-cccc-4ccc-8ccc-cccccccccccc', 'preparatory-3', 9);
insert into public.academy_tracks (id, academy_id, level_id, name, sort_order) values
  ('8d555555-5555-4555-8555-555555555555', '8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'secondary-2', 'Science', 1);

-- History: 2028 and 2029 are closed; 2030 is the active year.
update public.academic_years set id = '8e000028-0000-4000-8000-000000000028', start_year = 2028
where academy_id = '8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
update public.academic_years set id = '8e100030-0000-4000-8000-000000000030', start_year = 2030
where academy_id = '8ccccccc-cccc-4ccc-8ccc-cccccccccccc';
insert into public.academy_student_profiles (id, academy_id, created_by) values
  ('8f000003-0000-4000-8000-000000000003', '8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '8a111111-1111-4111-8111-111111111111'),
  ('8f000004-0000-4000-8000-000000000004', '8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '8a111111-1111-4111-8111-111111111111'),
  ('8f000044-0000-4000-8000-000000000044', '8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '8a111111-1111-4111-8111-111111111111');
insert into public.annual_student_records (academy_id, academic_year_id, academy_student_profile_id, full_name, student_phone, parent_phone, level_id, participation_type, created_by) values
  ('8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '8e000028-0000-4000-8000-000000000028', '8f000003-0000-4000-8000-000000000003', 'Returning Student', '+201281000003', '+201289999999', 'preparatory-3', 'online_only', '8a111111-1111-4111-8111-111111111111'),
  ('8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '8e000028-0000-4000-8000-000000000028', '8f000004-0000-4000-8000-000000000004', 'Ambiguous One', '+201281000004', '+201289999999', 'preparatory-3', 'in_person', '8a111111-1111-4111-8111-111111111111');
update public.academic_years set closed_at = now() where id = '8e000028-0000-4000-8000-000000000028';
insert into public.academic_years (id, academy_id, start_year) values
  ('8e000029-0000-4000-8000-000000000029', '8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 2029);
insert into public.annual_student_records (academy_id, academic_year_id, academy_student_profile_id, full_name, student_phone, parent_phone, level_id, participation_type, created_by) values
  ('8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '8e000029-0000-4000-8000-000000000029', '8f000003-0000-4000-8000-000000000003', 'Returning Student', '+201281000003', '+201289999999', 'preparatory-3', 'online_only', '8a111111-1111-4111-8111-111111111111'),
  ('8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '8e000029-0000-4000-8000-000000000029', '8f000044-0000-4000-8000-000000000044', 'Ambiguous Two', '+201281000004', '+201289999999', 'preparatory-3', 'in_person', '8a111111-1111-4111-8111-111111111111');
update public.academic_years set closed_at = now() where id = '8e000029-0000-4000-8000-000000000029';
insert into public.academic_years (id, academy_id, start_year) values
  ('8e000030-0000-4000-8000-000000000030', '8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 2030);

insert into public.groups (id, academy_id, academic_year_id, level_id, track_id, name, capacity) values
  ('8d111111-1111-4111-8111-111111111111', '8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '8e000030-0000-4000-8000-000000000030', 'preparatory-3', null, 'Prep One', 1),
  ('8d222222-2222-4222-8222-222222222222', '8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '8e000030-0000-4000-8000-000000000030', 'secondary-2', '8d555555-5555-4555-8555-555555555555', 'Science A', null);

-- Staff-created current-year records.
do $$
declare
  archived_id uuid;
begin
  perform pg_temp.act('8a111111-1111-4111-8111-111111111111');
  perform public.create_student_record('8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '8e000030-0000-4000-8000-000000000030',
    'Staff Entered Name', '01281000001', '01280000099', 'secondary-2', '8d555555-5555-4555-8555-555555555555',
    '8d222222-2222-4222-8222-222222222222', 'online_only');
  select id into archived_id from public.create_student_record('8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '8e000030-0000-4000-8000-000000000030',
    'Archived Student', '01281000002', '01289999999', 'preparatory-3', null, null, 'in_person');
  perform public.set_student_records_archived('8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '8e000030-0000-4000-8000-000000000030',
    jsonb_build_array(jsonb_build_object('id', archived_id, 'version', 1)), true);
  perform public.create_student_record('8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '8e000030-0000-4000-8000-000000000030',
    'Closed Existing', '01281000009', '01289999999', 'preparatory-3', null, null, 'in_person');
  perform public.create_student_record('8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '8e000030-0000-4000-8000-000000000030',
    'Account Name 12', '01281000010', '01289999999', 'preparatory-3', null, null, 'in_person');
  -- Academy M has its own record for the same phone as the existing student in N.
  perform pg_temp.act('8a333333-3333-4333-8333-333333333333');
  perform public.create_student_record('8ccccccc-cccc-4ccc-8ccc-cccccccccccc', '8e100030-0000-4000-8000-000000000030',
    'Same Student In M', '01281000001', '01289999999', 'preparatory-3', null, null, 'in_person');
end $$;

-- Record 10 is already connected to account 11.
update public.academy_student_profiles p set user_id = '8b000011-0000-4000-8000-000000000011', linked_at = now()
from public.annual_student_records r
where r.academy_student_profile_id = p.id and r.student_phone = '+201281000010';

-- Invite management.
do $$
declare
  settings jsonb;
  token text;
begin
  perform pg_temp.act('8a222222-2222-4222-8222-222222222222');
  settings := public.get_student_enrollment_settings('8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  perform pg_temp.check(settings ->> 'inviteToken' is null and (settings ->> 'canManage')::boolean = false
    and (settings ->> 'enrollmentOpen')::boolean, 'defaults visible to instructors');
  begin
    perform public.set_student_invite('8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
    raise exception 'FAILED: instructor issued an invite';
  exception when sqlstate 'P0001' then
    perform pg_temp.check(sqlerrm = 'forbidden', 'instructor invite forbidden');
  end;
  begin
    perform public.update_student_enrollment_settings('8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
    raise exception 'FAILED: instructor changed enrollment';
  exception when sqlstate 'P0001' then
    perform pg_temp.check(sqlerrm = 'forbidden', 'instructor settings forbidden');
  end;
  perform pg_temp.act('8a333333-3333-4333-8333-333333333333');
  begin
    perform public.get_student_enrollment_settings('8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    raise exception 'FAILED: cross-academy read';
  exception when sqlstate 'P0001' then
    perform pg_temp.check(sqlerrm = 'forbidden', 'cross-academy read forbidden');
  end;
  perform pg_temp.check(public.get_student_enrollment_settings('8ccccccc-cccc-4ccc-8ccc-cccccccccccc') ->> 'inviteToken' is null, 'M has no link');
  perform set_config('test.token_m', public.set_student_invite('8ccccccc-cccc-4ccc-8ccc-cccccccccccc', true) ->> 'inviteToken', true);

  perform pg_temp.act('8a111111-1111-4111-8111-111111111111');
  token := public.set_student_invite('8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true) ->> 'inviteToken';
  perform pg_temp.check(token ~ '^[A-Za-z0-9_-]{43}$', 'token shape');
  perform pg_temp.act('8a222222-2222-4222-8222-222222222222');
  perform pg_temp.check(public.get_student_enrollment_settings('8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') ->> 'inviteToken' = token, 'instructor can share');
  perform set_config('test.token', token, true);
end $$;

-- Preview states.
do $$
declare
  token text := current_setting('test.token');
  preview jsonb;
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform pg_temp.check(pg_temp.result(public.preview_student_invite(token)) = 'unauthenticated', 'signed out');
  perform pg_temp.act('8b000006-0000-4000-8000-000000000006');
  perform pg_temp.check(pg_temp.result(public.preview_student_invite(token)) = 'unverified', 'unverified');
  perform pg_temp.act('8b000007-0000-4000-8000-000000000007');
  perform pg_temp.check(pg_temp.result(public.preview_student_invite(token)) = 'setup_required', 'setup first');
  perform pg_temp.act('8b000001-0000-4000-8000-000000000001');
  -- Always change the token, including when the generated token already starts with x.
  perform pg_temp.check(pg_temp.result(public.preview_student_invite(
    (case when left(token, 1) = 'x' then 'y' else 'x' end) || substr(token, 2))) = 'invalid', 'unknown token');

  preview := public.preview_student_invite(token);
  perform pg_temp.check(pg_temp.result(preview) = 'existing' and preview #>> '{student,fullName}' = 'Staff Entered Name'
    and preview #>> '{student,trackName}' = 'Science' and preview #>> '{academy,slug}' = 'enroll-academy-n', 'existing preview');
  perform pg_temp.act('8b000002-0000-4000-8000-000000000002');
  preview := public.preview_student_invite(token);
  perform pg_temp.check(pg_temp.result(preview) = 'staff_help' and preview ->> 'reason' = 'archived', 'archived preview');
  perform pg_temp.act('8b000003-0000-4000-8000-000000000003');
  preview := public.preview_student_invite(token);
  perform pg_temp.check(pg_temp.result(preview) = 'enroll' and (preview ->> 'returning')::boolean
    and jsonb_array_length(preview -> 'programs') = 1, 'returning preview');
  perform pg_temp.act('8b000004-0000-4000-8000-000000000004');
  perform pg_temp.check(public.preview_student_invite(token) ->> 'reason' = 'conflict', 'two profiles need staff');
  perform pg_temp.act('8b000010-0000-4000-8000-000000000010');
  perform pg_temp.check(public.preview_student_invite(token) ->> 'reason' = 'conflict', 'already linked record needs staff');
  -- Shared parent phone and matching name are not identity evidence.
  perform pg_temp.act('8b000012-0000-4000-8000-000000000012');
  preview := public.preview_student_invite(token);
  perform pg_temp.check(pg_temp.result(preview) = 'enroll' and not (preview ->> 'returning')::boolean, 'parent/name ignored');
  -- Previewing never links.
  perform pg_temp.check(not exists (
    select 1 from public.academy_student_profiles where user_id = '8b000001-0000-4000-8000-000000000001'), 'preview is read-only');
end $$;

-- Existing record: links without changing academy-entered details; retry returns the same link.
do $$
declare
  token text := current_setting('test.token');
  before_row public.annual_student_records%rowtype;
  after_row public.annual_student_records%rowtype;
begin
  select * into before_row from public.annual_student_records where student_phone = '+201281000001'
    and academy_id = '8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  perform pg_temp.act('8b000001-0000-4000-8000-000000000001');
  perform pg_temp.check(pg_temp.result(public.complete_student_invite(token, null, null)) = 'connected', 'existing links');
  perform pg_temp.check(pg_temp.result(public.complete_student_invite(token, null, null)) = 'connected', 'retry idempotent');
  perform pg_temp.check(pg_temp.result(public.preview_student_invite(token)) = 'connected', 'preview connected');
  select * into after_row from public.annual_student_records where id = before_row.id;
  perform pg_temp.check(after_row = before_row, 'record unchanged by linking');
  perform pg_temp.check((select user_id from public.academy_student_profiles where id = before_row.academy_student_profile_id)
    = '8b000001-0000-4000-8000-000000000001', 'profile linked');
  perform pg_temp.check(edra_private.student_caller_record('8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '8e000030-0000-4000-8000-000000000030')
    = before_row.id, 'resolver finds the record');
  perform pg_temp.check(edra_private.student_caller_record('8ccccccc-cccc-4ccc-8ccc-cccccccccccc', '8e100030-0000-4000-8000-000000000030')
    is null, 'other academy not connected');
  perform pg_temp.check(public.get_my_student_academy('enroll-academy-m') is null, 'no view of an unconnected academy');
  perform pg_temp.check(public.get_my_student_academy('enroll-academy-n') ->> 'access' = 'active', 'active access');

  -- The same account connects independently in another academy.
  perform pg_temp.check(pg_temp.result(public.complete_student_invite(current_setting('test.token_m'), null, null)) = 'connected', 'second academy');
  perform pg_temp.check(jsonb_array_length(public.list_my_student_academies()) = 2, 'two academies listed');

  begin
    update public.academy_student_profiles set user_id = '8b000005-0000-4000-8000-000000000005'
    where id = before_row.academy_student_profile_id;
    raise exception 'FAILED: link reassigned';
  exception when sqlstate 'P0001' then
    perform pg_temp.check(sqlerrm = 'account_link_conflict', 'link is permanent');
  end;
  begin
    insert into public.academy_student_profiles (academy_id, created_by, user_id, linked_at)
    values ('8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '8a111111-1111-4111-8111-111111111111', '8b000001-0000-4000-8000-000000000001', now());
    raise exception 'FAILED: second profile for one account';
  exception when unique_violation then null;
  end;
end $$;

-- Returning and new enrollment, with program/group checks and capacity.
do $$
declare
  token text := current_setting('test.token');
  created public.annual_student_records%rowtype;
  preview jsonb;
begin
  perform pg_temp.act('8b000003-0000-4000-8000-000000000003');
  perform pg_temp.check(pg_temp.result(public.complete_student_invite(token, null, '8d111111-1111-4111-8111-111111111111')) = 'connected', 'returning enrolls');
  select * into created from public.annual_student_records
  where academy_student_profile_id = '8f000003-0000-4000-8000-000000000003' and academic_year_id = '8e000030-0000-4000-8000-000000000030';
  perform pg_temp.check(created.participation_type = 'online_only' and created.primary_group_id = '8d111111-1111-4111-8111-111111111111'
    and created.full_name = 'Account Name 03' and created.parent_phone = '+201289999999', 'returning record under the existing profile');
  perform pg_temp.check((select count(*) from public.academy_student_profiles where user_id = '8b000003-0000-4000-8000-000000000003') = 1, 'no replacement profile');
  perform pg_temp.check(pg_temp.result(public.complete_student_invite(token, null, null)) = 'connected', 'retry after success');

  perform pg_temp.act('8b000005-0000-4000-8000-000000000005');
  perform pg_temp.check(pg_temp.result(public.complete_student_invite(token, null, '8d111111-1111-4111-8111-111111111111')) = 'group_full', 'full group');
  perform pg_temp.check(pg_temp.result(public.complete_student_invite(token, null, '8d222222-2222-4222-8222-222222222222')) = 'invalid_choice', 'incompatible group');
  perform pg_temp.check(pg_temp.result(public.complete_student_invite(token, null, null)) = 'connected', 'new without group');
  select r.* into created from public.annual_student_records r where r.student_phone = '+201281000005';
  perform pg_temp.check(created.participation_type = 'online_only' and created.primary_group_id is null
    and created.level_id = 'preparatory-3' and created.track_id is null and created.full_name = 'مريم أحمد',
    'new record uses the account level and display name');
  perform pg_temp.check((select user_id from public.academy_student_profiles where id = created.academy_student_profile_id)
    = '8b000005-0000-4000-8000-000000000005', 'new profile linked');

  -- A level with tracks needs one; the level itself is never chosen.
  perform pg_temp.act('8b000013-0000-4000-8000-000000000013');
  preview := public.preview_student_invite(token);
  perform pg_temp.check(jsonb_array_length(preview -> 'programs') = 1 and preview #>> '{programs,0,trackName}' = 'Science'
    and preview #>> '{programs,0,levelId}' = 'secondary-2', 'only the account level is offered');
  perform pg_temp.check(pg_temp.result(public.complete_student_invite(token, null, null)) = 'invalid_choice', 'track required');
  perform pg_temp.check(pg_temp.result(public.complete_student_invite(token, '8d555555-5555-4555-8555-555555555555', '8d111111-1111-4111-8111-111111111111')) = 'invalid_choice', 'wrong-level group');
  perform pg_temp.check(pg_temp.result(public.complete_student_invite(token, '8d555555-5555-4555-8555-555555555555', '8d222222-2222-4222-8222-222222222222')) = 'connected', 'track and group');

  -- An academy that does not offer the account's level blocks enrollment.
  perform pg_temp.act('8b000014-0000-4000-8000-000000000014');
  perform pg_temp.check(pg_temp.result(public.preview_student_invite(token)) = 'level_unavailable', 'level not offered preview');
  perform pg_temp.check(pg_temp.result(public.complete_student_invite(token, null, null)) = 'level_unavailable', 'level not offered');
  perform pg_temp.check(not exists (select 1 from public.academy_student_profiles where user_id = '8b000014-0000-4000-8000-000000000014'), 'nothing created');
end $$;

-- Closed enrollment still links existing current-year records but refuses annual creation.
do $$
declare
  token text := current_setting('test.token');
begin
  perform pg_temp.act('8a111111-1111-4111-8111-111111111111');
  perform pg_temp.check(not (public.update_student_enrollment_settings('8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false) ->> 'enrollmentOpen')::boolean, 'closed');
  perform pg_temp.act('8b000008-0000-4000-8000-000000000008');
  perform pg_temp.check(pg_temp.result(public.preview_student_invite(token)) = 'closed', 'closed preview');
  perform pg_temp.check(pg_temp.result(public.complete_student_invite(token, null, null)) = 'closed', 'closed refuses');
  perform pg_temp.act('8b000009-0000-4000-8000-000000000009');
  perform pg_temp.check(pg_temp.result(public.complete_student_invite(token, null, null)) = 'connected', 'closed still links');
end $$;

-- Replacing or revoking the link stops new entry but keeps connections.
do $$
declare
  old_token text := current_setting('test.token');
  new_token text;
begin
  perform pg_temp.act('8a111111-1111-4111-8111-111111111111');
  perform public.update_student_enrollment_settings('8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
  new_token := public.set_student_invite('8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true) ->> 'inviteToken';
  perform pg_temp.check(new_token <> old_token, 'replaced');
  perform pg_temp.act('8b000008-0000-4000-8000-000000000008');
  perform pg_temp.check(pg_temp.result(public.complete_student_invite(old_token, null, null)) = 'invalid', 'old link dead');
  perform pg_temp.check(pg_temp.result(public.preview_student_invite(new_token)) = 'enroll', 'new link works');
  perform pg_temp.act('8a111111-1111-4111-8111-111111111111');
  perform pg_temp.check(public.set_student_invite('8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false) ->> 'inviteToken' is null, 'revoked');
  perform pg_temp.act('8b000008-0000-4000-8000-000000000008');
  perform pg_temp.check(pg_temp.result(public.preview_student_invite(new_token)) = 'invalid', 'revoked link dead');
  perform pg_temp.check(exists (select 1 from public.academy_student_profiles where user_id = '8b000001-0000-4000-8000-000000000001'
    and academy_id = '8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'connections kept');
end $$;

-- Archival and independent suspension are separate causes.
do $$
declare
  rec public.annual_student_records%rowtype;
  year_id uuid := '8e000030-0000-4000-8000-000000000030';
  academy uuid := '8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
begin
  select * into rec from public.annual_student_records where student_phone = '+201281000001' and academy_id = academy;
  perform pg_temp.act('8a111111-1111-4111-8111-111111111111');
  perform public.set_student_records_archived(academy, year_id, jsonb_build_array(jsonb_build_object('id', rec.id, 'version', rec.version)), true);
  perform pg_temp.act('8b000001-0000-4000-8000-000000000001');
  perform pg_temp.check(public.get_my_student_academy('enroll-academy-n') ->> 'access' = 'suspended', 'archive suspends');
  perform pg_temp.check(edra_private.student_caller_record(academy, year_id) is null, 'archived record not resolved');

  -- Independent suspension applied during archival survives restoration.
  update public.academy_student_profiles set access_suspended_at = now() where id = rec.academy_student_profile_id;
  perform pg_temp.act('8a111111-1111-4111-8111-111111111111');
  perform public.set_student_records_archived(academy, year_id, jsonb_build_array(jsonb_build_object('id', rec.id, 'version', rec.version + 1)), false);
  perform pg_temp.act('8b000001-0000-4000-8000-000000000001');
  perform pg_temp.check(public.get_my_student_academy('enroll-academy-n') ->> 'access' = 'suspended', 'independent suspension survives restore');
  perform pg_temp.check((select user_id from public.academy_student_profiles where id = rec.academy_student_profile_id)
    = '8b000001-0000-4000-8000-000000000001', 'link survives archival');

  -- Clearing the independent suspension while archived leaves it effectively suspended.
  perform pg_temp.act('8a111111-1111-4111-8111-111111111111');
  perform public.set_student_records_archived(academy, year_id, jsonb_build_array(jsonb_build_object('id', rec.id, 'version', rec.version + 2)), true);
  update public.academy_student_profiles set access_suspended_at = null where id = rec.academy_student_profile_id;
  perform pg_temp.act('8b000001-0000-4000-8000-000000000001');
  perform pg_temp.check(public.get_my_student_academy('enroll-academy-n') ->> 'access' = 'suspended', 'archival still suspends');
  perform pg_temp.check(pg_temp.result(public.preview_student_invite(current_setting('test.token_m'))) = 'connected', 'other academy unaffected');
  perform pg_temp.act('8a111111-1111-4111-8111-111111111111');
  perform public.set_student_records_archived(academy, year_id, jsonb_build_array(jsonb_build_object('id', rec.id, 'version', rec.version + 3)), false);
  perform pg_temp.act('8b000001-0000-4000-8000-000000000001');
  perform pg_temp.check(public.get_my_student_academy('enroll-academy-n') ->> 'access' = 'active', 'both causes cleared');
  perform pg_temp.check(edra_private.exam_caller_record('8f999999-9999-4999-8999-999999999999') is null, 'unknown exam resolves nobody');
end $$;

-- Privileged student boundaries deny recovery/revoked sessions even without the REST pre-hook.
do $$
declare
  account uuid := '8b000001-0000-4000-8000-000000000001';
  session_id uuid := gen_random_uuid();
  academy uuid := '8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  year_id uuid := '8e000030-0000-4000-8000-000000000030';
begin
  insert into auth.sessions(id,user_id,created_at,updated_at) values(session_id,account,now(),now());
  perform set_config('edra.verified_session','',true);
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',account,'session_id',session_id,
    'amr',jsonb_build_array(jsonb_build_object('method','password')))::text,true);
  perform pg_temp.check(edra_private.student_caller_record(academy,year_id) is not null, 'live password session resolves');
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',account,'session_id',session_id,
    'amr',jsonb_build_array(jsonb_build_object('method','recovery')))::text,true);
  perform pg_temp.check(edra_private.student_caller_record(academy,year_id) is null
    and public.list_my_student_academies()='[]'::jsonb
    and public.get_my_student_academy('enroll-academy-n') is null,'recovery cannot use established connection');
  perform pg_temp.check(public.preview_student_invite(current_setting('test.token_m'))->>'result'='unauthenticated'
    and public.complete_student_invite(current_setting('test.token_m'),null,null)->>'result'='unauthenticated',
    'recovery cannot preview or complete enrollment');
  delete from auth.sessions where id=session_id;
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',account,'session_id',session_id,
    'amr',jsonb_build_array(jsonb_build_object('method','password')))::text,true);
  perform pg_temp.check(edra_private.student_caller_record(academy,year_id) is null,'revoked session cannot resolve');
  perform set_config('request.jwt.claims','',true);
end $$;

rollback;
