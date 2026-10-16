-- Run with `npm run test:db` against the marked isolated test target (see docs/engineering.md).
-- Everything runs in one transaction that is rolled back. Any failed assertion aborts psql with a
-- non-zero exit status.
-- Fixtures pin the academic year to 2030 so results do not depend on the wall clock.
do $$ begin
  if not (select relrowsecurity from pg_class where oid = 'public.groups'::regclass)
    or not (select relrowsecurity from pg_class where oid = 'public.schedules'::regclass)
    or not (select relrowsecurity from pg_class where oid = 'public.schedule_slots'::regclass)
    or not (select relrowsecurity from pg_class where oid = 'public.schedule_sessions'::regclass)
    or has_table_privilege('anon', 'public.groups', 'select')
    or has_table_privilege('anon', 'public.schedules', 'select') then
    raise exception 'Tenant tables lack RLS or expose anonymous access';
  end if;
  -- Recurring schedules span their academic year: no schedule-level date range remains.
  if exists (select 1 from information_schema.columns where table_schema = 'public'
    and table_name = 'schedules' and column_name in ('starts_on', 'ends_on')) then
    raise exception 'Obsolete schedule date columns remain';
  end if;
  if to_regprocedure('public.create_schedule(uuid, uuid, text, public.schedule_kind, public.schedule_audience, uuid, text, uuid, boolean, text, date, date, date, time, time, jsonb)') is not null
    or to_regprocedure('public.update_schedule(uuid, uuid, text, public.schedule_audience, uuid, text, uuid, boolean, text, date, date, date, time, time, jsonb)') is not null
    or to_regprocedure('public.create_schedule(uuid, uuid, text, public.schedule_kind, public.schedule_audience, uuid, text, uuid, boolean, text, date, time, time, jsonb)') is not null
    or to_regprocedure('public.update_schedule(uuid, uuid, text, public.schedule_audience, uuid, text, uuid, boolean, text, date, time, time, jsonb)') is not null then
    raise exception 'Obsolete schedule RPC signatures remain';
  end if;
  if not has_function_privilege('authenticated', 'public.create_schedule(uuid, uuid, text, public.schedule_kind, public.schedule_audience, uuid, text, uuid, boolean, text, jsonb, jsonb)', 'execute')
    or not has_function_privilege('authenticated', 'public.update_schedule(uuid, uuid, text, public.schedule_audience, uuid, text, uuid, boolean, text, jsonb, jsonb)', 'execute')
    or has_function_privilege('anon', 'public.create_schedule(uuid, uuid, text, public.schedule_kind, public.schedule_audience, uuid, text, uuid, boolean, text, jsonb, jsonb)', 'execute')
    or has_function_privilege('anon', 'public.update_schedule(uuid, uuid, text, public.schedule_audience, uuid, text, uuid, boolean, text, jsonb, jsonb)', 'execute') then
    raise exception 'Schedule RPC grants are wrong';
  end if;
end $$;
begin;

insert into auth.users (id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222'),
  ('33333333-3333-4333-8333-333333333333'),
  ('44444444-4444-4444-8444-444444444444');

insert into public.academies (id, name, slug, icon, subject, created_by) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Academy A', 'academy-a', 'school', 'Math', '11111111-1111-4111-8111-111111111111'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Academy B', 'academy-b', 'school', 'Math', '44444444-4444-4444-8444-444444444444');

do $$ begin
  -- The academy trigger must create exactly one active year starting on the Cairo academic-year boundary.
  if (select count(*) from public.academic_years where closed_at is null
        and academy_id in ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')) <> 2 then
    raise exception 'New academies did not receive an active academic year';
  end if;
end $$;
update public.academic_years set id = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', start_year = 2030
where academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
update public.academic_years set id = 'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb', start_year = 2030
where academy_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

insert into public.academy_memberships (academy_id, user_id, role, created_by) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'owner', '11111111-1111-4111-8111-111111111111'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'admin', '11111111-1111-4111-8111-111111111111'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'instructor', '11111111-1111-4111-8111-111111111111'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '44444444-4444-4444-8444-444444444444', 'owner', '44444444-4444-4444-8444-444444444444');

insert into public.academy_levels (academy_id, level_id, sort_order) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'secondary-1', 10),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'secondary-2', 11),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'secondary-1', 10);

insert into public.academy_tracks (id, academy_id, level_id, name) values
  ('55555555-5555-4555-8555-555555555555', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'secondary-1', 'Science'),
  ('77777777-7777-4777-8777-777777777777', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'secondary-1', 'Science');

do $$
declare a_year uuid; level_wide_group uuid;
begin
  select id into a_year from public.academic_years where academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  if a_year is null then raise exception 'New academy year missing'; end if;
  if not exists (select 1 from public.academic_years where id = a_year and start_year = 2030 and starts_on = '2030-08-16' and ends_on = '2031-08-15') then
    raise exception 'Incorrect academic year dates';
  end if;
  begin
    insert into public.academic_years (academy_id, start_year)
      values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 2031);
    raise exception 'active year uniqueness failed';
  exception when unique_violation then null; end;
  begin
    insert into public.groups (academy_id, academic_year_id, level_id, track_id, name, capacity)
      values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', a_year, 'secondary-1', '55555555-5555-4555-8555-555555555555', 'Bad capacity', 0);
    raise exception 'capacity constraint failed';
  exception when check_violation then null; end;
  begin
    insert into public.groups (academy_id, academic_year_id, level_id, track_id, name)
      values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', a_year, 'secondary-1', '77777777-7777-4777-8777-777777777777', 'Cross academy');
    raise exception 'cross-academy track constraint failed';
  exception when foreign_key_violation then null; end;
  -- Levels that offer tracks may also have a level-wide group with no track.
  insert into public.groups (academy_id, academic_year_id, level_id, name)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', a_year, 'secondary-1', 'Level-wide group')
    returning id into level_wide_group;
  if not exists (select 1 from public.groups where id = level_wide_group
    and academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and academic_year_id = a_year
    and level_id = 'secondary-1' and track_id is null) then
    raise exception 'level-wide group was not saved correctly';
  end if;
end;
$$;

grant usage on schema public, auth to authenticated;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

insert into public.groups (id, academy_id, academic_year_id, level_id, track_id, name)
select '66666666-6666-4666-8666-666666666666', academy_id, id, 'secondary-1',
  '55555555-5555-4555-8555-555555555555', 'Group A'
from public.academic_years where academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

do $$
declare a_year uuid;
begin
  select id into a_year from public.academic_years where academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  begin
    insert into public.schedules (academy_id, academic_year_id, title, kind, audience, group_id, location)
      values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', a_year, 'Bad group', 'one_off', 'group', '99999999-9999-4999-8999-999999999999', 'Room');
    raise exception 'group FK failed';
  exception when raise_exception then
    if sqlerrm = 'group FK failed' then raise; end if;
  end;
end;
$$;

select public.create_schedule(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', id, 'Group recurring', 'recurring', 'group',
  '66666666-6666-4666-8666-666666666666', null, null, true, 'Room 1',
  '[{"weekday":1,"startsAt":"16:00","endsAt":"17:00"},{"weekday":3,"startsAt":"16:00","endsAt":"17:00"}]'::jsonb, '[]'::jsonb
) from public.academic_years where academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

select public.create_schedule(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', id, 'Level one-off', 'one_off', 'level',
  null, 'secondary-2', null, false, 'Hall', '[]'::jsonb, '[{"date":"2030-10-01","startsAt":"10:00","endsAt":"11:00"}]'::jsonb
) from public.academic_years where academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

select public.create_schedule(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', id, 'Program one-off', 'one_off', 'program',
  null, 'secondary-1', '55555555-5555-4555-8555-555555555555', true, 'Hall',
  '[]'::jsonb, '[{"date":"2030-10-02","startsAt":"10:00","endsAt":"11:00"}]'::jsonb
) from public.academic_years where academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

do $$ begin
  if (select count(*) from public.schedules where academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 3 then raise exception 'schedule audience coverage failed'; end if;
  if (select count(*) from public.schedule_slots) <> 2 then raise exception 'weekly slots missing'; end if;
  begin
    update public.groups set archived_at = now() where id = '66666666-6666-4666-8666-666666666666';
    raise exception 'dependent group archived';
  exception when raise_exception then
    if sqlerrm = 'dependent group archived' then raise; end if;
  end;
end $$;

do $$
declare target_schedule_id uuid;
begin
  select id into target_schedule_id from public.schedules where title = 'Group recurring';
  if not public.update_schedule(
    target_schedule_id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Group recurring revised',
    'group', '66666666-6666-4666-8666-666666666666', null, null,
    true, 'Room 2', '[{"weekday":5,"startsAt":"15:00","endsAt":"16:00"}]'::jsonb, '[]'::jsonb
  ) then raise exception 'schedule update failed'; end if;
  if (select count(*) from public.schedule_slots where schedule_id = target_schedule_id) <> 1 then
    raise exception 'schedule slot replacement failed';
  end if;
end $$;

set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
update public.groups set name = 'Group A updated' where id = '66666666-6666-4666-8666-666666666666';
insert into public.groups (id, academy_id, academic_year_id, level_id, name)
select '88888888-8888-4888-8888-888888888888', academy_id, id, 'secondary-2', 'Unused group'
from public.academic_years where academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
update public.groups set archived_at = now() where id = '88888888-8888-4888-8888-888888888888';
do $$ begin
  if not exists (select 1 from public.groups where id = '66666666-6666-4666-8666-666666666666' and name = 'Group A updated') then
    raise exception 'Admin could not edit group';
  end if;
  if not exists (select 1 from public.groups where id = '88888888-8888-4888-8888-888888888888' and archived_at is not null) then
    raise exception 'Admin could not archive unused group';
  end if;
  begin
    update public.groups set name = 'Edited while archived' where id = '88888888-8888-4888-8888-888888888888';
    raise exception 'archived group edited';
  exception when others then
    if sqlerrm = 'archived group edited' then raise; end if;
  end;
  -- A restore that would duplicate an active group's name is rejected by the active-name index.
  insert into public.groups (academy_id, academic_year_id, level_id, name)
  select academy_id, id, 'secondary-2', 'Unused group'
  from public.academic_years where academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  begin
    update public.groups set archived_at = null where id = '88888888-8888-4888-8888-888888888888';
    raise exception 'duplicate-name restore accepted';
  exception when unique_violation then null;
  end;
  update public.groups set archived_at = now() where name = 'Unused group' and archived_at is null;
  update public.groups set archived_at = null where id = '88888888-8888-4888-8888-888888888888';
  if not exists (select 1 from public.groups where id = '88888888-8888-4888-8888-888888888888' and archived_at is null) then
    raise exception 'Admin could not restore archived group';
  end if;
  update public.groups set archived_at = now() where id = '88888888-8888-4888-8888-888888888888';
end $$;

set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
do $$
declare a_year uuid;
begin
  select id into a_year from public.academic_years where academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  begin
    insert into public.groups (academy_id, academic_year_id, level_id, name)
      values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', a_year, 'secondary-2', 'Instructor group');
    raise exception 'instructor created group';
  exception when insufficient_privilege then null; end;
  if not exists (select 1 from public.groups where id = '66666666-6666-4666-8666-666666666666') then
    raise exception 'Instructor cannot read groups';
  end if;
  update public.groups set archived_at = null where id = '88888888-8888-4888-8888-888888888888';
  if exists (select 1 from public.groups where id = '88888888-8888-4888-8888-888888888888' and archived_at is null) then
    raise exception 'Instructor restored archived group';
  end if;
  update public.schedules set title = 'Unauthorized edit' where title = 'Group recurring revised';
  if exists (select 1 from public.schedules where title = 'Unauthorized edit') then
    raise exception 'Instructor edited recurring schedule';
  end if;
  begin
    perform public.create_schedule('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', a_year,
      'Instructor recurring', 'recurring', 'level', null, 'secondary-2', null, true,
      'Room', '[{"weekday":1,"startsAt":"16:00","endsAt":"17:00"}]'::jsonb, '[]'::jsonb);
    raise exception 'instructor created recurring schedule';
  exception when insufficient_privilege then null; end;
  perform public.create_schedule('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', a_year,
    'Instructor one-off', 'one_off', 'level', null, 'secondary-2', null, false,
    'Room', '[]'::jsonb, '[{"date":"2030-10-03","startsAt":"16:00","endsAt":"17:00"}]'::jsonb);
end $$;

-- Instructors edit any academy one-off, but archive only their own.
do $$
declare
  other_id uuid;
  own_id uuid;
begin
  select id into other_id from public.schedules where title = 'Level one-off';
  select id into own_id from public.schedules where title = 'Instructor one-off';
  if not public.update_schedule(other_id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Level one-off revised',
    'program', null, 'secondary-1', '55555555-5555-4555-8555-555555555555', true, 'Lab',
    '[]'::jsonb, '[{"date":"2030-10-05","startsAt":"12:00","endsAt":"13:00"}]'::jsonb) then
    raise exception 'instructor could not edit another creator''s one-off';
  end if;
  if not exists (select 1 from public.schedules where id = other_id and title = 'Level one-off revised'
    and audience = 'program' and track_id = '55555555-5555-4555-8555-555555555555' and mandatory
    and location = 'Lab'
    and (select count(*) from public.schedule_sessions ss where ss.schedule_id = other_id) = 1
    and exists (select 1 from public.schedule_sessions ss where ss.schedule_id = other_id
      and occurs_on = '2030-10-05' and starts_at = '12:00' and ends_at = '13:00')
    and created_by = '11111111-1111-4111-8111-111111111111') then
    raise exception 'instructor one-off edit not applied or creator changed';
  end if;
  begin
    update public.schedules set archived_at = now() where id = other_id;
    raise exception 'instructor archived another creator''s one-off';
  exception when insufficient_privilege then null; end;
  begin
    update public.schedules set created_by = '33333333-3333-4333-8333-333333333333', archived_at = now()
      where id = other_id;
    raise exception 'instructor claimed another creator''s one-off';
  exception when others then
    if sqlerrm = 'instructor claimed another creator''s one-off' then raise; end if;
  end;
  begin
    update public.schedules set kind = 'recurring'
      where id = other_id;
    raise exception 'instructor changed schedule type';
  exception when others then
    if sqlerrm = 'instructor changed schedule type' then raise; end if;
  end;
  begin
    perform public.update_schedule(other_id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Out of year', 'level', null, 'secondary-2', null,
      true, null, '[]'::jsonb, '[{"date":"2032-01-01","startsAt":"12:00","endsAt":"13:00"}]'::jsonb);
    raise exception 'out-of-year one-off accepted';
  exception when raise_exception then
    if sqlerrm = 'out-of-year one-off accepted' then raise; end if;
  end;
  if exists (select 1 from public.schedules where id = other_id and archived_at is not null) then
    raise exception 'another creator''s one-off ended up archived';
  end if;
  update public.schedules set archived_at = now() where id = own_id;
  if not exists (select 1 from public.schedules where id = own_id and archived_at is not null) then
    raise exception 'instructor could not archive own one-off';
  end if;
  update public.schedules set title = 'Edited while archived' where id = own_id;
  if public.update_schedule(own_id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Edited while archived', 'level', null, 'secondary-2', null,
    true, null, '[]'::jsonb, '[{"date":"2030-10-03","startsAt":"16:00","endsAt":"17:00"}]'::jsonb) then
    raise exception 'archived one-off edited through RPC';
  end if;
  if exists (select 1 from public.schedules where title = 'Edited while archived') then
    raise exception 'archived one-off edited';
  end if;
end $$;

set local request.jwt.claim.sub = '44444444-4444-4444-8444-444444444444';
do $$
begin
  if exists (select 1 from public.groups where academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') then raise exception 'cross-academy read visible'; end if;
  if exists (select 1 from public.schedules where academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') then raise exception 'cross-academy schedule visible'; end if;
  begin
    insert into public.groups (academy_id, academic_year_id, level_id, name)
      values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'secondary-2', 'Cross academy group');
    raise exception 'cross-academy write succeeded';
  exception when raise_exception then
    if sqlerrm = 'cross-academy write succeeded' then raise; end if;
  when insufficient_privilege then null; end;
  update public.schedules set title = 'Cross academy edit', archived_at = now()
    where academy_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
end $$;

-- Slot integrity (as admin). Deferred constraints are forced at explicit verification points.
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $$
declare
  a_year constant uuid := 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
  sched uuid;
  other uuid;
  slot_id uuid;
begin
  -- Empty recurring schedule is rejected at the verification point.
  begin
    insert into public.schedules (academy_id, academic_year_id, title, kind, audience, level_id)
      values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', a_year, 'Empty recurring', 'recurring', 'level', 'secondary-2');
    set constraints all immediate;
    raise exception 'empty recurring schedule accepted';
  exception when raise_exception then
    if sqlerrm = 'empty recurring schedule accepted' then raise; end if;
  end;

  sched := public.create_schedule('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', a_year, 'One slot', 'recurring', 'level',
    null, 'secondary-2', null, true, null, '[{"weekday":2,"startsAt":"09:00","endsAt":"10:00"}]'::jsonb, '[]'::jsonb);
  other := public.create_schedule('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', a_year, 'Other slot', 'recurring', 'level',
    null, 'secondary-2', null, true, null, '[{"weekday":4,"startsAt":"09:00","endsAt":"10:00"}]'::jsonb, '[]'::jsonb);
  set constraints all immediate;
  set constraints all deferred;
  select id into slot_id from public.schedule_slots where schedule_id = sched;

  -- Deleting the final slot is rejected.
  begin
    delete from public.schedule_slots where id = slot_id;
    set constraints all immediate;
    raise exception 'final slot deletion accepted';
  exception when raise_exception then
    if sqlerrm = 'final slot deletion accepted' then raise; end if;
  end;

  -- Moving the final slot to another schedule is rejected (parent identity is immutable).
  begin
    update public.schedule_slots set schedule_id = other where id = slot_id;
    set constraints all immediate;
    raise exception 'slot reassignment accepted';
  exception when raise_exception then
    if sqlerrm = 'slot reassignment accepted' then raise; end if;
  end;

  -- Atomic replacement keeps the schedule nonempty and passes the verification point.
  if not public.update_schedule(sched, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'One slot', 'level',
    null, 'secondary-2', null, true, null, '[{"weekday":6,"startsAt":"09:00","endsAt":"10:00"}]'::jsonb, '[]'::jsonb) then raise exception 'atomic replacement failed'; end if;
  set constraints all immediate;
  set constraints all deferred;

  -- Archived parent: every slot write is rejected.
  update public.schedules set archived_at = now() where id = sched;
  select id into slot_id from public.schedule_slots where schedule_id = sched;
  if slot_id is null then raise exception 'archived schedule slot is not visible to admin'; end if;
  begin
    insert into public.schedule_slots (academy_id, academic_year_id, schedule_id, weekday, starts_at, ends_at)
      values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', a_year, sched, 1, '08:00', '09:00');
    raise exception 'archived slot insert accepted';
  exception when raise_exception then
    if sqlerrm = 'archived slot insert accepted' then raise; end if;
  end;
  begin
    update public.schedule_slots set weekday = 7 where id = slot_id;
    raise exception 'archived slot update accepted';
  exception when raise_exception then
    if sqlerrm = 'archived slot update accepted' then raise; end if;
  end;
  begin
    delete from public.schedule_slots where id = slot_id;
    raise exception 'archived slot delete accepted';
  exception when raise_exception then
    if sqlerrm = 'archived slot delete accepted' then raise; end if;
  end;
  if not exists (select 1 from public.schedule_slots where id = slot_id) then
    raise exception 'archived slot was removed';
  end if;
end $$;

-- Timing shape and slot limits (as admin).
do $$
declare a_year constant uuid := 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
begin
  begin
    perform public.create_schedule('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', a_year, 'Duplicate slot', 'recurring', 'level',
      null, 'secondary-2', null, true, null, '[{"weekday":1,"startsAt":"09:00","endsAt":"10:00"},{"weekday":1,"startsAt":"09:00","endsAt":"11:00"}]'::jsonb, '[]'::jsonb);
    raise exception 'duplicate weekday/start accepted';
  exception when unique_violation then null; end;
  begin
    perform public.create_schedule('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', a_year, 'Too many slots', 'recurring', 'level',
      null, 'secondary-2', null, true, null,
      (select jsonb_agg(jsonb_build_object('weekday', 1, 'startsAt', make_time(8, i, 0)::text,
        'endsAt', make_time(9, i, 0)::text)) from generate_series(1, 21) i), '[]'::jsonb);
    raise exception '21 slots accepted';
  exception when raise_exception then
    if sqlerrm = '21 slots accepted' then raise; end if;
  end;
  begin
    perform public.create_schedule('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', a_year, 'Dated recurring', 'recurring', 'level',
      null, 'secondary-2', null, true, null,
      '[{"weekday":1,"startsAt":"09:00","endsAt":"10:00"}]'::jsonb,
      '[{"date":"2030-10-01","startsAt":"10:00","endsAt":"11:00"}]'::jsonb);
    raise exception 'recurring schedule with dated sessions accepted';
  exception when raise_exception then
    if sqlerrm = 'recurring schedule with dated sessions accepted' then raise; end if;
  end;
  begin
    perform public.create_schedule('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', a_year, 'Undated one-off', 'one_off', 'level',
      null, 'secondary-2', null, true, null, '[]'::jsonb, '[]'::jsonb);
    raise exception 'one-off without sessions accepted';
  exception when raise_exception then
    if sqlerrm = 'one-off without sessions accepted' then raise; end if;
  end;
  begin
    perform public.create_schedule('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', a_year, 'Slotted one-off', 'one_off', 'level',
      null, 'secondary-2', null, true, null,
      '[{"weekday":1,"startsAt":"09:00","endsAt":"10:00"}]'::jsonb,
      '[{"date":"2030-10-01","startsAt":"10:00","endsAt":"11:00"}]'::jsonb);
    raise exception 'one-off with weekly slots accepted';
  exception when raise_exception then
    if sqlerrm = 'one-off with weekly slots accepted' then raise; end if;
  end;
  begin
    perform public.create_schedule('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', a_year, 'Duplicate session', 'one_off', 'level',
      null, 'secondary-2', null, true, null, '[]'::jsonb,
      '[{"date":"2030-10-01","startsAt":"10:00","endsAt":"11:00"},{"date":"2030-10-01","startsAt":"10:00","endsAt":"12:00"}]'::jsonb);
    raise exception 'duplicate session accepted';
  exception when unique_violation then null; end;
  begin
    perform public.create_schedule('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', a_year, 'Too many sessions', 'one_off', 'level',
      null, 'secondary-2', null, true, null, '[]'::jsonb,
      (select jsonb_agg(jsonb_build_object('date', '2030-10-01', 'startsAt', make_time(8, i, 0)::text,
        'endsAt', make_time(9, i, 0)::text)) from generate_series(1, 51) i));
    raise exception '51 sessions accepted';
  exception when raise_exception then
    if sqlerrm = '51 sessions accepted' then raise; end if;
  end;
  -- A one-off may meet on several dates, and an edit replaces them atomically.
  declare multi uuid;
  begin
    multi := public.create_schedule('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', a_year, 'Multi-date one-off', 'one_off', 'level',
      null, 'secondary-2', null, true, null, '[]'::jsonb,
      '[{"date":"2030-10-01","startsAt":"10:00","endsAt":"11:00"},{"date":"2030-10-08","startsAt":"10:00","endsAt":"11:00"}]'::jsonb);
    if (select count(*) from public.schedule_sessions where schedule_id = multi) <> 2 then
      raise exception 'multi-date one-off sessions missing';
    end if;
    if not public.update_schedule(multi, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Multi-date one-off', 'level',
      null, 'secondary-2', null, true, null, '[]'::jsonb,
      '[{"date":"2030-10-15","startsAt":"09:00","endsAt":"10:00"}]'::jsonb) then
      raise exception 'multi-date one-off update failed';
    end if;
    if (select count(*) from public.schedule_sessions where schedule_id = multi) <> 1 then
      raise exception 'one-off session replacement failed';
    end if;
    begin
      delete from public.schedule_sessions where schedule_id = multi;
      set constraints all immediate;
      raise exception 'final session deletion accepted';
    exception when raise_exception then
      if sqlerrm = 'final session deletion accepted' then raise; end if;
    end;
    set constraints all deferred;
  end;
  begin
    perform public.create_schedule('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', a_year, 'Backwards one-off', 'one_off', 'level',
      null, 'secondary-2', null, true, null, '[]'::jsonb, '[{"date":"2030-10-01","startsAt":"11:00","endsAt":"10:00"}]'::jsonb);
    raise exception 'backwards one-off accepted';
  exception when check_violation then null; end;
  begin
    perform public.create_schedule('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', a_year, 'Before year', 'one_off', 'level',
      null, 'secondary-2', null, true, null, '[]'::jsonb, '[{"date":"2030-08-15","startsAt":"10:00","endsAt":"11:00"}]'::jsonb);
    raise exception 'one-off before the academic year accepted';
  exception when raise_exception then
    if sqlerrm = 'one-off before the academic year accepted' then raise; end if;
  end;
  -- Blank locations are stored as null.
  if (select location from public.schedules where id = public.create_schedule('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', a_year, 'Blank location',
    'one_off', 'level', null, 'secondary-2', null, false, '  ', '[]'::jsonb, '[{"date":"2031-08-15","startsAt":"10:00","endsAt":"11:00"}]'::jsonb)) is not null then
    raise exception 'blank location was not stored as null';
  end if;
end $$;

-- Instructors and other academies cannot write or delete slots.
set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
do $$
begin
  begin
    insert into public.schedule_slots (academy_id, academic_year_id, schedule_id, weekday, starts_at, ends_at)
      select academy_id, academic_year_id, id, 1, '08:00', '09:00' from public.schedules where title = 'Other slot';
    raise exception 'instructor inserted slot';
  exception when insufficient_privilege then null;
  when raise_exception then
    -- BEFORE INSERT validates the parent before the slot's INSERT policy is checked.
    -- The instructor cannot lock a recurring parent through its UPDATE policy.
    if sqlerrm <> 'Slots require an active recurring schedule' then raise; end if;
  end;
  delete from public.schedule_slots;
end $$;
set local request.jwt.claim.sub = '44444444-4444-4444-8444-444444444444';
do $$ begin
  delete from public.schedule_slots;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.schedule_slots where schedule_id in
    (select id from public.schedules where academy_id in ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') and title = 'Other slot')) <> 1 then
    raise exception 'unauthorized slot deletion succeeded';
  end if;
  if exists (select 1 from public.schedules where academy_id in ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') and title = 'Cross academy edit')
    or exists (select 1 from public.schedules where academy_id in ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') and title = 'Group recurring revised' and archived_at is not null) then
    raise exception 'cross-academy schedule write succeeded';
  end if;
end $$;

-- Closed academic year: slot writes are rejected even for a manager and an active parent.
update public.academic_years set closed_at = now() where id = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $$
declare slot_id uuid;
begin
  select sl.id into slot_id from public.schedule_slots sl join public.schedules s on s.id = sl.schedule_id
    where s.title = 'Other slot';
  begin
    delete from public.schedule_slots where id = slot_id;
    raise exception 'closed-year slot delete accepted';
  exception when raise_exception then
    if sqlerrm = 'closed-year slot delete accepted' then raise; end if;
  end;
  begin
    update public.schedule_slots set weekday = 7 where id = slot_id;
    raise exception 'closed-year slot update accepted';
  exception when raise_exception then
    if sqlerrm = 'closed-year slot update accepted' then raise; end if;
  end;
  begin
    perform public.update_schedule((select id from public.schedules where title = 'Program one-off'),
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Closed year edit', 'level', null, 'secondary-2', null, true, null,
      '[]'::jsonb, '[{"date":"2030-10-02","startsAt":"10:00","endsAt":"11:00"}]'::jsonb);
    raise exception 'closed-year schedule edit accepted';
  exception when raise_exception then
    if sqlerrm = 'closed-year schedule edit accepted' then raise; end if;
  end;
end $$;

rollback;
