-- Assignments, checkpoint 1: grants, roles, tenant isolation, exact part maxima, stale edits,
-- audience validation, save-time recipient snapshots, activity locking, lifecycle, and closed years.
-- Run with `npm run test:db` against the marked isolated test target (see docs/engineering.md).
-- Everything runs in one transaction that is rolled back.

do $$ begin
  if not has_function_privilege('authenticated', 'public.create_assignment(uuid, uuid, uuid, jsonb)', 'execute')
    or not has_function_privilege('authenticated', 'public.update_assignment(uuid, uuid, integer, jsonb)', 'execute')
    or not has_function_privilege('authenticated', 'public.change_assignment_state(uuid, uuid, integer, text)', 'execute')
    or has_function_privilege('anon', 'public.create_assignment(uuid, uuid, uuid, jsonb)', 'execute')
    or has_function_privilege('anon', 'public.update_assignment(uuid, uuid, integer, jsonb)', 'execute')
    or has_function_privilege('anon', 'public.change_assignment_state(uuid, uuid, integer, text)', 'execute')
    or has_function_privilege('anon', 'public.get_assignment(uuid, uuid)', 'execute')
    or has_function_privilege('anon', 'public.list_assignment_recipients(uuid, uuid)', 'execute')
    or has_function_privilege('anon', 'public.preview_assignment_audience(uuid, uuid, public.assignment_audience, text, uuid, uuid[])', 'execute')
    or has_function_privilege('authenticated', 'edra_private.change_assignment_state(uuid, uuid, integer, text)', 'execute')
    or has_function_privilege('authenticated', 'edra_private.create_assignment(uuid, uuid, uuid, jsonb)', 'execute')
    or has_table_privilege('authenticated', 'public.assignments', 'insert')
    or has_table_privilege('authenticated', 'public.assignments', 'update')
    or has_table_privilege('authenticated', 'public.assignment_parts', 'insert')
    or has_table_privilege('authenticated', 'public.assignment_recipients', 'delete')
    or has_table_privilege('anon', 'public.assignments', 'select')
    or has_table_privilege('anon', 'public.assignment_recipients', 'select') then
    raise exception 'Assignment grants are wrong';
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

-- A two-part (10 + 15) draft for an audience given as JSON fields.
create function pg_temp.draft(audience jsonb, parts jsonb default '[{"title":"A","kind":"file_upload","questions":[{"max_score":"10"}]},{"title":"B","kind":"file_upload","questions":[{"max_score":"15"}]}]') returns jsonb
language sql as $$
  select jsonb_build_object('title', 'Unit 3 homework', 'instructions', '', 'due_at', null, 'parts', parts) || audience;
$$;

-- A file-upload part whose single entry carries the whole mark. Ids are null for a new part or entry.
create function pg_temp.fp(pid text, title text, max text, qid text default null) returns jsonb language sql as $$
  select jsonb_strip_nulls(jsonb_build_object('id', pid, 'title', title, 'kind', 'file_upload',
    'questions', jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('id', qid, 'prompt', '', 'max_score', max)))));
$$;

insert into auth.users (id) values
  ('a1111111-1111-4111-8111-111111111111'),  -- owner of S
  ('a2222222-2222-4222-8222-222222222222'),  -- admin of S
  ('a3333333-3333-4333-8333-333333333333'),  -- instructor of S
  ('b1111111-1111-4111-8111-111111111111'),  -- owner of T
  ('c1111111-1111-4111-8111-111111111111');  -- no membership
insert into public.academies (id, name, slug, icon, subject, created_by) values
  ('a5555555-5555-4555-8555-555555555555', 'Assign S', 'assign-s', 'school', 'Math', 'a1111111-1111-4111-8111-111111111111'),
  ('b6666666-6666-4666-8666-666666666666', 'Assign T', 'assign-t', 'school', 'Math', 'b1111111-1111-4111-8111-111111111111');
update public.academic_years set id = 'a5555555-1111-4111-8111-555555555555', start_year = 2030 where academy_id = 'a5555555-5555-4555-8555-555555555555';
update public.academic_years set id = 'b6666666-1111-4111-8111-666666666666', start_year = 2030 where academy_id = 'b6666666-6666-4666-8666-666666666666';
insert into public.academy_memberships (academy_id, user_id, role, created_by) values
  ('a5555555-5555-4555-8555-555555555555', 'a1111111-1111-4111-8111-111111111111', 'owner', 'a1111111-1111-4111-8111-111111111111'),
  ('a5555555-5555-4555-8555-555555555555', 'a2222222-2222-4222-8222-222222222222', 'admin', 'a1111111-1111-4111-8111-111111111111'),
  ('a5555555-5555-4555-8555-555555555555', 'a3333333-3333-4333-8333-333333333333', 'instructor', 'a1111111-1111-4111-8111-111111111111'),
  ('b6666666-6666-4666-8666-666666666666', 'b1111111-1111-4111-8111-111111111111', 'owner', 'b1111111-1111-4111-8111-111111111111');
insert into public.academy_levels (academy_id, level_id, sort_order) values
  ('a5555555-5555-4555-8555-555555555555', 'grade-9', 9),
  ('a5555555-5555-4555-8555-555555555555', 'grade-10', 10),
  ('b6666666-6666-4666-8666-666666666666', 'grade-9', 9);
insert into public.academy_tracks (id, academy_id, level_id, name) values
  ('a7777777-7777-4777-8777-777777777777', 'a5555555-5555-4555-8555-555555555555', 'grade-10', 'Science');
insert into public.groups (id, academy_id, academic_year_id, level_id, track_id, name) values
  ('a8888888-0000-4000-8000-000000000001', 'a5555555-5555-4555-8555-555555555555', 'a5555555-1111-4111-8111-555555555555', 'grade-9', null, 'Nine A'),
  ('a8888888-0000-4000-8000-000000000002', 'a5555555-5555-4555-8555-555555555555', 'a5555555-1111-4111-8111-555555555555', 'grade-9', null, 'Nine B'),
  ('a8888888-0000-4000-8000-000000000003', 'a5555555-5555-4555-8555-555555555555', 'a5555555-1111-4111-8111-555555555555', 'grade-9', null, 'Nine Empty'),
  ('b8888888-0000-4000-8000-000000000001', 'b6666666-6666-4666-8666-666666666666', 'b6666666-1111-4111-8111-666666666666', 'grade-9', null, 'T Nine');
grant usage on schema public, auth to authenticated, anon;

-- Setup as the owner of S: four grade-9 students (one archived later), one grade-10 Science student.
set local role authenticated;
set local request.jwt.claim.sub = 'a1111111-1111-4111-8111-111111111111';
select set_config('test.s' || n, id::text, true) from (
  select n, (public.create_student_record('a5555555-5555-4555-8555-555555555555', 'a5555555-1111-4111-8111-555555555555', name,
    '0100000010' || n, '01100000000', 'grade-9', null, grp::uuid, 'in_person')).id
  from (values (1, 'Amal', 'a8888888-0000-4000-8000-000000000001'), (2, 'Aya', 'a8888888-0000-4000-8000-000000000001'),
    (3, 'Adam', 'a8888888-0000-4000-8000-000000000002'), (4, 'Alia', 'a8888888-0000-4000-8000-000000000001')) as v (n, name, grp)
) made;
select set_config('test.sci', (public.create_student_record('a5555555-5555-4555-8555-555555555555', 'a5555555-1111-4111-8111-555555555555',
  'Sami', '01000000199', '01100000000', 'grade-10', 'a7777777-7777-4777-8777-777777777777', null, 'online_only')).id::text, true);
select public.set_student_records_archived('a5555555-5555-4555-8555-555555555555', 'a5555555-1111-4111-8111-555555555555',
  jsonb_build_array(jsonb_build_object('id', current_setting('test.s4'), 'version', 1)), true);
-- One coded student; the rest have no code and must still be recipients.
select public.save_student_code_settings('a5555555-5555-4555-8555-555555555555', 0, true, '####', '[]');
select public.change_student_code('a5555555-5555-4555-8555-555555555555', current_setting('test.s1')::uuid, 'assign', '0001', 0, gen_random_uuid());

-- Outsiders cannot create in S, read S, or use S's year from T.
set local request.jwt.claim.sub = 'c1111111-1111-4111-8111-111111111111';
select pg_temp.expect_error($s$ select public.create_assignment('a5555555-5555-4555-8555-555555555555', 'a5555555-1111-4111-8111-555555555555', gen_random_uuid(), pg_temp.draft('{"audience":"level","level_id":"grade-9"}')) $s$, 'forbidden');
set local request.jwt.claim.sub = 'b1111111-1111-4111-8111-111111111111';
select pg_temp.expect_error($s$ select public.create_assignment('a5555555-5555-4555-8555-555555555555', 'a5555555-1111-4111-8111-555555555555', gen_random_uuid(), pg_temp.draft('{"audience":"level","level_id":"grade-9"}')) $s$, 'forbidden');
select pg_temp.expect_error($s$ select public.create_assignment('b6666666-6666-4666-8666-666666666666', 'a5555555-1111-4111-8111-555555555555', gen_random_uuid(), pg_temp.draft('{"audience":"level","level_id":"grade-9"}')) $s$, 'year_unavailable');
-- T cannot target S's groups, and S cannot target T's.
select pg_temp.expect_error($s$ select public.create_assignment('b6666666-6666-4666-8666-666666666666', 'b6666666-1111-4111-8111-666666666666', gen_random_uuid(), pg_temp.draft('{"audience":"groups","group_ids":["a8888888-0000-4000-8000-000000000001"]}')) $s$, 'invalid_audience');

-- The instructor prepares a two-part draft; the maximum is derived from the parts.
set local request.jwt.claim.sub = 'a3333333-3333-4333-8333-333333333333';
select pg_temp.expect_error($s$ select public.create_assignment('a5555555-5555-4555-8555-555555555555', 'a5555555-1111-4111-8111-555555555555', gen_random_uuid(), pg_temp.draft('{"audience":"groups","group_ids":["b8888888-0000-4000-8000-000000000001"]}')) $s$, 'invalid_audience');
select pg_temp.expect_error($s$ select public.create_assignment('a5555555-5555-4555-8555-555555555555', 'a5555555-1111-4111-8111-555555555555', gen_random_uuid(), pg_temp.draft('{"audience":"level","level_id":"grade-12"}')) $s$, 'invalid_audience');
select pg_temp.expect_error($s$ select public.create_assignment('a5555555-5555-4555-8555-555555555555', 'a5555555-1111-4111-8111-555555555555', gen_random_uuid(), pg_temp.draft('{"audience":"program","level_id":"grade-9","track_id":"a7777777-7777-4777-8777-777777777777"}')) $s$, 'invalid_audience');
select pg_temp.expect_error($s$ select public.create_assignment('a5555555-5555-4555-8555-555555555555', 'a5555555-1111-4111-8111-555555555555', gen_random_uuid(), pg_temp.draft('{"audience":"level","level_id":"grade-9","group_ids":["a8888888-0000-4000-8000-000000000001"]}')) $s$, 'invalid_audience');
-- Exact decimals: unsupported precision, zero, over 1000, NaN, and empty parts are rejected, not rounded.
select pg_temp.expect_error($s$ select public.create_assignment('a5555555-5555-4555-8555-555555555555', 'a5555555-1111-4111-8111-555555555555', gen_random_uuid(), pg_temp.draft('{"audience":"level","level_id":"grade-9"}', '[{"title":"A","kind":"file_upload","questions":[{"max_score":"2.555"}]}]')) $s$, 'validation');
select pg_temp.expect_error($s$ select public.create_assignment('a5555555-5555-4555-8555-555555555555', 'a5555555-1111-4111-8111-555555555555', gen_random_uuid(), pg_temp.draft('{"audience":"level","level_id":"grade-9"}', '[{"title":"A","kind":"file_upload","questions":[{"max_score":"0"}]}]')) $s$, 'validation');
select pg_temp.expect_error($s$ select public.create_assignment('a5555555-5555-4555-8555-555555555555', 'a5555555-1111-4111-8111-555555555555', gen_random_uuid(), pg_temp.draft('{"audience":"level","level_id":"grade-9"}', '[{"title":"A","kind":"file_upload","questions":[{"max_score":"1000.01"}]}]')) $s$, 'validation');
select pg_temp.expect_error($s$ select public.create_assignment('a5555555-5555-4555-8555-555555555555', 'a5555555-1111-4111-8111-555555555555', gen_random_uuid(), pg_temp.draft('{"audience":"level","level_id":"grade-9"}', '[{"title":"A","kind":"file_upload","questions":[{"max_score":"NaN"}]}]')) $s$, 'validation');
select pg_temp.expect_error($s$ select public.create_assignment('a5555555-5555-4555-8555-555555555555', 'a5555555-1111-4111-8111-555555555555', gen_random_uuid(), pg_temp.draft('{"audience":"level","level_id":"grade-9"}', '[]')) $s$, 'validation');
select pg_temp.expect_error($s$ select public.create_assignment('a5555555-5555-4555-8555-555555555555', 'a5555555-1111-4111-8111-555555555555', gen_random_uuid(), pg_temp.draft('{"audience":"level","level_id":"grade-9","title":"  "}')) $s$, 'validation');

do $$ declare made jsonb; again jsonb; begin
  made := public.create_assignment('a5555555-5555-4555-8555-555555555555', 'a5555555-1111-4111-8111-555555555555',
    'a9999999-0000-4000-8000-000000000001', pg_temp.draft('{"audience":"level","level_id":"grade-9"}'));
  if made->>'state' <> 'active' or made->>'max_score' <> '25.00' or (made->>'part_count')::int <> 2 or (made->>'version')::int <> 1
    or (made->>'recipient_count')::int <> 3 or not (made->>'ready')::boolean or (made->>'replayed')::boolean or made->'parts'->0->>'title' <> 'A' then
    raise exception 'New assignment is wrong: %', made;
  end if;
  -- A retried create returns the same draft and creates nothing.
  again := public.create_assignment('a5555555-5555-4555-8555-555555555555', 'a5555555-1111-4111-8111-555555555555',
    'a9999999-0000-4000-8000-000000000001', pg_temp.draft('{"audience":"level","level_id":"grade-9"}'));
  if not (again->>'replayed')::boolean or (select count(*) from public.assignments where academy_id = 'a5555555-5555-4555-8555-555555555555') <> 1 then
    raise exception 'Create retry duplicated: %', again;
  end if;
  perform set_config('test.part_a', made->'parts'->0->>'id', true);
  perform set_config('test.part_b', made->'parts'->1->>'id', true);
  perform set_config('test.q_a', made->'parts'->0->'questions'->0->>'id', true);
  perform set_config('test.q_b', made->'parts'->1->'questions'->0->>'id', true);
  if made->'parts'->0->>'kind' <> 'file_upload' or made->'parts'->0->>'max_score' <> '10.00' or made->'parts'->1->>'max_score' <> '15.00'
    or jsonb_array_length(made->'parts'->0->'issues') <> 0 then
    raise exception 'Typed parts are wrong: %', made;
  end if;
end $$;

-- Another user reusing the id conflicts.
set local request.jwt.claim.sub = 'a2222222-2222-4222-8222-222222222222';
select pg_temp.expect_error($s$ select public.create_assignment('a5555555-5555-4555-8555-555555555555', 'a5555555-1111-4111-8111-555555555555', 'a9999999-0000-4000-8000-000000000001', pg_temp.draft('{"audience":"level","level_id":"grade-9"}')) $s$, 'idempotency_conflict');

-- Instructors cannot use manager-only lifecycle actions, even by calling the RPC directly.
set local request.jwt.claim.sub = 'a3333333-3333-4333-8333-333333333333';
select pg_temp.expect_error($s$ select public.change_assignment_state('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', 1, 'publish') $s$, 'forbidden');
select pg_temp.expect_error($s$ select public.change_assignment_state('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', 1, 'archive') $s$, 'forbidden');

-- Edits replace the draft against the expected version; a stale second editor writes nothing.
do $$ declare saved jsonb; begin
  saved := public.update_assignment('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', 1,
    pg_temp.draft('{"audience":"level","level_id":"grade-9","title":"Unit 3 v2"}',
      jsonb_build_array(
        pg_temp.fp(current_setting('test.part_b'), 'B first', '15', current_setting('test.q_b')),
        pg_temp.fp(current_setting('test.part_a'), 'A second', '10.5', current_setting('test.q_a')))));
  if (saved->>'version')::int <> 2 or saved->>'max_score' <> '25.50' or saved->'parts'->0->>'id' <> current_setting('test.part_b')
    or (saved->'parts'->0->>'position')::int <> 1 then
    raise exception 'Draft edit is wrong: %', saved;
  end if;
end $$;
set local request.jwt.claim.sub = 'a2222222-2222-4222-8222-222222222222';
select pg_temp.expect_error($s$ select public.update_assignment('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', 1, pg_temp.draft('{"audience":"level","level_id":"grade-9","title":"Stale"}')) $s$, 'assignment_conflict');
do $$ begin
  if (select title from public.assignments where id = 'a9999999-0000-4000-8000-000000000001') <> 'Unit 3 v2' then raise exception 'Stale edit wrote'; end if;
end $$;
-- A part id from another assignment cannot be attached.
select public.create_assignment('a5555555-5555-4555-8555-555555555555', 'a5555555-1111-4111-8111-555555555555',
  'a9999999-0000-4000-8000-000000000002', pg_temp.draft('{"audience":"groups","group_ids":["a8888888-0000-4000-8000-000000000003"]}'));
select pg_temp.expect_error(format($s$ select public.update_assignment('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000002', 1, pg_temp.draft('{"audience":"groups","group_ids":["a8888888-0000-4000-8000-000000000003"]}', '[{"id":"%s","title":"X","max_score":"5"}]')) $s$, current_setting('test.part_a')), 'validation');

-- Preview counts active matching records only, including uncoded ones.
do $$ declare preview jsonb; begin
  preview := public.preview_assignment_audience('a5555555-5555-4555-8555-555555555555', 'a5555555-1111-4111-8111-555555555555', 'level', 'grade-9', null, null);
  if (preview->>'recipient_count')::int <> 3 or (preview->>'uncoded_count')::int <> 2 then raise exception 'Preview is wrong: %', preview; end if;
end $$;

-- Empty audiences are allowed; the retired Publish action is rejected without changes.
select pg_temp.expect_error($s$ select public.change_assignment_state('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000002', 1, 'publish') $s$, 'validation');
do $$ begin
  if (select state from public.assignments where id = 'a9999999-0000-4000-8000-000000000002') <> 'active'
    or exists (select 1 from public.assignment_recipients where assignment_id = 'a9999999-0000-4000-8000-000000000002') then
    raise exception 'Empty assignment or rejected lifecycle action left unexpected recipients';
  end if;
end $$;

-- Saving refreshes the snapshot from active matching records, including uncoded students.
do $$ declare saved jsonb; begin
  saved := public.update_assignment('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', 2,
    pg_temp.draft('{"audience":"level","level_id":"grade-9","title":"Unit 3 v2"}', jsonb_build_array(
      pg_temp.fp(current_setting('test.part_b'), 'B first', '15', current_setting('test.q_b')),
      pg_temp.fp(current_setting('test.part_a'), 'A second', '10.5', current_setting('test.q_a')))));
  if saved->>'state' <> 'active' or (saved->>'recipient_count')::int <> 3 or (saved->>'version')::int <> 3
    or saved->>'published_at' is not null or (saved->>'has_activity')::boolean then
    raise exception 'Save-time snapshot is wrong: %', saved;
  end if;
  if (select array_agg(annual_student_record_id order by annual_student_record_id) from public.assignment_recipients
      where assignment_id = 'a9999999-0000-4000-8000-000000000001')
     <> (select array_agg(id order by id) from unnest(array[current_setting('test.s1'), current_setting('test.s2'), current_setting('test.s3')]::uuid[]) id) then
    raise exception 'Recipient snapshot is wrong';
  end if;
  if jsonb_array_length(public.list_assignment_recipients('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001')) <> 3 then
    raise exception 'Recipient list is wrong';
  end if;
end $$;
select pg_temp.expect_error($s$ select public.change_assignment_state('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', 3, 'publish') $s$, 'validation');

-- Receiving work starts activity and freezes the structure and recipients.
select public.record_assignment_work('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001',
  current_setting('test.s1')::uuid, 1, 'submitted', now(), '');

-- A student enrolled after activity starts is not added.
select public.create_assignment('a5555555-5555-4555-8555-555555555555', 'a5555555-1111-4111-8111-555555555555',
  'a9999999-0000-4000-8000-000000000003', pg_temp.draft('{"audience":"level","level_id":"grade-9"}'));
set local request.jwt.claim.sub = 'a1111111-1111-4111-8111-111111111111';
select public.create_student_record('a5555555-5555-4555-8555-555555555555', 'a5555555-1111-4111-8111-555555555555',
  'Late Joiner', '01000000188', '01100000000', 'grade-9', null, 'a8888888-0000-4000-8000-000000000001', 'in_person');
do $$ begin
  if (select count(*) from public.assignment_recipients where assignment_id = 'a9999999-0000-4000-8000-000000000001') <> 3 then
    raise exception 'Recipients changed after activity';
  end if;
end $$;

-- The same enrollment is picked up by the next save while an assignment has no activity.
do $$ declare saved jsonb; begin
  saved := public.update_assignment('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000003', 1,
    pg_temp.draft('{"audience":"level","level_id":"grade-9"}'));
  if (saved->>'recipient_count')::int <> 4 or (saved->>'has_activity')::boolean then
    raise exception 'Pre-activity save did not refresh recipients: %', saved;
  end if;
end $$;

-- After activity: the instructor cannot edit; structure is locked; text details stay editable by Owner/Admin.
set local request.jwt.claim.sub = 'a3333333-3333-4333-8333-333333333333';
select pg_temp.expect_error(format($s$ select public.update_assignment('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', 3, pg_temp.draft('{"audience":"level","level_id":"grade-9","title":"Typo fix"}', '[{"id":"%s","title":"B","kind":"file_upload","questions":[{"id":"%s","prompt":"","max_score":"15"}]},{"id":"%s","title":"A","kind":"file_upload","questions":[{"id":"%s","prompt":"","max_score":"10.5"}]}]')) $s$, current_setting('test.part_b'), current_setting('test.q_b'), current_setting('test.part_a'), current_setting('test.q_a')), 'forbidden');
set local request.jwt.claim.sub = 'a1111111-1111-4111-8111-111111111111';
select pg_temp.expect_error(format($s$ select public.update_assignment('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', 3, pg_temp.draft('{"audience":"level","level_id":"grade-9"}', '[{"id":"%s","title":"B","kind":"file_upload","questions":[{"id":"%s","prompt":"","max_score":"16"}]},{"id":"%s","title":"A","kind":"file_upload","questions":[{"id":"%s","prompt":"","max_score":"10.5"}]}]')) $s$, current_setting('test.part_b'), current_setting('test.q_b'), current_setting('test.part_a'), current_setting('test.q_a')), 'structure_locked');
select pg_temp.expect_error(format($s$ select public.update_assignment('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', 3, pg_temp.draft('{"audience":"level","level_id":"grade-9"}', '[{"id":"%s","title":"A","kind":"file_upload","questions":[{"id":"%s","prompt":"","max_score":"10.5"}]},{"id":"%s","title":"B","kind":"file_upload","questions":[{"id":"%s","prompt":"","max_score":"15"}]}]')) $s$, current_setting('test.part_a'), current_setting('test.q_a'), current_setting('test.part_b'), current_setting('test.q_b')), 'structure_locked');
select pg_temp.expect_error(format($s$ select public.update_assignment('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', 3, pg_temp.draft('{"audience":"groups","group_ids":["a8888888-0000-4000-8000-000000000001"]}', '[{"id":"%s","title":"B","kind":"file_upload","questions":[{"id":"%s","prompt":"","max_score":"15"}]},{"id":"%s","title":"A","kind":"file_upload","questions":[{"id":"%s","prompt":"","max_score":"10.5"}]}]')) $s$, current_setting('test.part_b'), current_setting('test.q_b'), current_setting('test.part_a'), current_setting('test.q_a')), 'structure_locked');
select pg_temp.expect_error(format($s$ select public.update_assignment('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', 3, pg_temp.draft('{"audience":"level","level_id":"grade-9"}', '[{"id":"%s","title":"B","kind":"file_upload","questions":[{"id":"%s","prompt":"","max_score":"15"}]},{"id":"%s","title":"A","kind":"file_upload","questions":[{"id":"%s","prompt":"","max_score":"10.5"}]},{"title":"C","kind":"file_upload","questions":[{"max_score":"1"}]}]')) $s$, current_setting('test.part_b'), current_setting('test.q_b'), current_setting('test.part_a'), current_setting('test.q_a')), 'structure_locked');
do $$ declare saved jsonb; begin
  saved := public.update_assignment('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', 3,
    pg_temp.draft('{"audience":"level","level_id":"grade-9","title":"Unit 3 (corrected)","due_at":"2030-10-20T21:59:00Z"}',
      jsonb_build_array(
        pg_temp.fp(current_setting('test.part_b'), 'Sheet B', '15.00', current_setting('test.q_b')),
        pg_temp.fp(current_setting('test.part_a'), 'Sheet A', '10.50', current_setting('test.q_a')))));
  if saved->>'title' <> 'Unit 3 (corrected)' or saved->'parts'->0->>'title' <> 'Sheet B' or (saved->>'version')::int <> 4
    or saved->>'max_score' <> '25.50' or saved->>'due_at' is null then
    raise exception 'Post-activity text edit is wrong: %', saved;
  end if;
end $$;

-- Close/reopen preserve the frozen snapshot; a repeated close is rejected.
do $$ declare result jsonb; begin
  result := public.change_assignment_state('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', 4, 'close');
  if result->>'state' <> 'closed' or (result->>'recipient_count')::int <> 3 then raise exception 'Close is wrong: %', result; end if;
  result := public.change_assignment_state('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', 5, 'reopen');
  if result->>'state' <> 'active' or (result->>'recipient_count')::int <> 3 then raise exception 'Reopen changed the snapshot: %', result; end if;
  result := public.change_assignment_state('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', 6, 'close');
  if result->>'state' <> 'closed' then raise exception 'Close is wrong: %', result; end if;
end $$;
select pg_temp.expect_error($s$ select public.change_assignment_state('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', 7, 'unpublish') $s$, 'validation');
select pg_temp.expect_error($s$ select public.change_assignment_state('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', 7, 'close') $s$, 'invalid_state');
select pg_temp.expect_error($s$ select public.change_assignment_state('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', 7, 'bogus') $s$, 'validation');
do $$ declare result jsonb; begin
  result := public.change_assignment_state('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', 7, 'reopen');
  if result->>'state' <> 'active' or (result->>'recipient_count')::int <> 3 then raise exception 'Reopen is wrong: %', result; end if;
end $$;
select pg_temp.expect_error($s$ select public.change_assignment_state('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', 8, 'archive') $s$, 'invalid_state');
select public.change_assignment_state('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000002', 1, 'archive');
select pg_temp.expect_error($s$ select public.update_assignment('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000002', 2, pg_temp.draft('{"audience":"level","level_id":"grade-9"}')) $s$, 'invalid_state');

-- Tenant isolation for reads: T's owner sees nothing of S, by RLS or by RPC.
set local request.jwt.claim.sub = 'b1111111-1111-4111-8111-111111111111';
do $$ begin
  if exists (select 1 from public.assignments where academy_id = 'a5555555-5555-4555-8555-555555555555')
    or exists (select 1 from public.assignment_parts where academy_id = 'a5555555-5555-4555-8555-555555555555')
    or exists (select 1 from public.assignment_recipients where academy_id = 'a5555555-5555-4555-8555-555555555555')
    or public.get_assignment('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001') is not null
    or public.get_assignment('b6666666-6666-4666-8666-666666666666', 'a9999999-0000-4000-8000-000000000001') is not null
    or public.list_assignment_recipients('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001') is not null then
    raise exception 'Cross-academy read leaked';
  end if;
end $$;
select pg_temp.expect_error($s$ select public.preview_assignment_audience('a5555555-5555-4555-8555-555555555555', 'a5555555-1111-4111-8111-555555555555', 'level', 'grade-9', null, null) $s$, 'forbidden');
select pg_temp.expect_error($s$ select public.change_assignment_state('b6666666-6666-4666-8666-666666666666', 'a9999999-0000-4000-8000-000000000001', 8, 'close') $s$, 'not_found');
-- Direct writes are not possible for members.
set local request.jwt.claim.sub = 'a1111111-1111-4111-8111-111111111111';
select pg_temp.expect_error($s$ update public.assignments set max_score = 1 where id = 'a9999999-0000-4000-8000-000000000001' $s$, 'permission denied%');
select pg_temp.expect_error($s$ insert into public.assignment_recipients (assignment_id, annual_student_record_id, academy_id, academic_year_id) values ('a9999999-0000-4000-8000-000000000001', gen_random_uuid(), 'a5555555-5555-4555-8555-555555555555', 'a5555555-1111-4111-8111-555555555555') $s$, 'permission denied%');

-- Typed parts (marks per question): maxima are derived, answer keys stay private, readiness needs
-- complete parts, and activity locks a scheme.
do $$ declare made jsonb; begin
  made := public.create_assignment('a5555555-5555-4555-8555-555555555555', 'a5555555-1111-4111-8111-555555555555',
    'a9999999-0000-4000-8000-0000000000a1', pg_temp.draft('{"audience":"level","level_id":"grade-9","title":"Mixed"}', $p$[
      {"title":"Quiz","kind":"online_questions","questions":[
        {"prompt":"2+2?","max_score":"2","choices":[{"label":"3"},{"label":"4","is_correct":true},{"label":"5"}]},
        {"prompt":"Capital of France?","max_score":"3","choices":[{"label":"Paris","is_correct":true},{"label":"Rome"}]}]},
      {"title":"Sheet","kind":"answer_sheet","questions":[
        {"max_score":"1","choices":[{"label":""},{"label":"","is_correct":true}]},
        {"max_score":"1","choices":[{"label":"","is_correct":true},{"label":""}]},
        {"max_score":"1","choices":[{"label":""},{"label":"","is_correct":true}]}]},
      {"title":"Upload","kind":"file_upload","questions":[{"max_score":"4"}]}]$p$::jsonb));
  if made->>'max_score' <> '12.00' or made->'parts'->0->>'max_score' <> '5.00' or made->'parts'->1->>'max_score' <> '3.00'
    or made->'parts'->2->>'max_score' <> '4.00' or jsonb_array_length(made->'parts'->0->'questions') <> 2
    or (made->'parts'->0->'questions'->0->'choices'->1->>'is_correct')::boolean is not true then
    raise exception 'Mixed typed draft is wrong: %', made;
  end if;
  perform set_config('test.mixed_part', made->'parts'->0->>'id', true);
  perform set_config('test.mixed_q', made->'parts'->0->'questions'->0->>'id', true);
  perform set_config('test.mixed_c', made->'parts'->0->'questions'->0->'choices'->0->>'id', true);
  -- Questions and choices are renumbered and re-summed when edited by id.
  made := public.update_assignment('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-0000000000a1', 1,
    pg_temp.draft('{"audience":"level","level_id":"grade-9","title":"Mixed"}', jsonb_build_array(
      jsonb_build_object('id', current_setting('test.mixed_part'), 'title', 'Quiz', 'kind', 'online_questions', 'questions', jsonb_build_array(
        jsonb_build_object('id', current_setting('test.mixed_q'), 'prompt', '2+2?', 'max_score', '2.5', 'choices', jsonb_build_array(
          jsonb_build_object('id', current_setting('test.mixed_c'), 'label', '3', 'is_correct', true),
          jsonb_build_object('label', '4'))))))));
  if made->>'max_score' <> '2.50' or made->>'part_count' <> '1' then raise exception 'Typed edit is wrong: %', made; end if;
end $$;

-- Bad questions, marks, and foreign ids are rejected; a draft part without questions is accepted.
select pg_temp.expect_error($s$ select public.update_assignment('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-0000000000a1', 2, pg_temp.draft('{"audience":"level","level_id":"grade-9"}', '[{"title":"Q","kind":"answer_sheet","questions":[{"max_score":"0","choices":[]}]}]')) $s$, 'validation');
select pg_temp.expect_error($s$ select public.update_assignment('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-0000000000a1', 2, pg_temp.draft('{"audience":"level","level_id":"grade-9"}', '[{"title":"Q","kind":"answer_sheet","questions":[{"max_score":"1.005","choices":[]}]}]')) $s$, 'validation');
select pg_temp.expect_error($s$ select public.update_assignment('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-0000000000a1', 2, pg_temp.draft('{"audience":"level","level_id":"grade-9"}', '[{"title":"Q","kind":"answer_sheet","questions":[{"max_score":"1","choices":[{"is_correct":true},{"is_correct":true}]}]}]')) $s$, 'validation');
select pg_temp.expect_error($s$ select public.update_assignment('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-0000000000a1', 2, pg_temp.draft('{"audience":"level","level_id":"grade-9"}', '[{"title":"Q","kind":"file_upload","questions":[{"max_score":"1","choices":[{"label":"a"}]}]}]')) $s$, 'validation');
select pg_temp.expect_error($s$ select public.update_assignment('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-0000000000a1', 2, pg_temp.draft('{"audience":"level","level_id":"grade-9"}', '[{"title":"Q","kind":"file_upload","questions":[{"id":"a0000000-0000-4000-8000-00000000dead","max_score":"1"}]}]')) $s$, 'validation');
select pg_temp.expect_error(format($s$ select public.update_assignment('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-0000000000a1', 2, pg_temp.draft('{"audience":"level","level_id":"grade-9"}', '[{"title":"Q","kind":"online_questions","questions":[{"prompt":"x","max_score":"1","choices":[{"id":"%s","label":"stolen"}]}]}]')) $s$, current_setting('test.mixed_c')), 'validation');
-- A new legacy (maximum-only) part cannot be created.
select pg_temp.expect_error($s$ select public.create_assignment('a5555555-5555-4555-8555-555555555555', 'a5555555-1111-4111-8111-555555555555', gen_random_uuid(), pg_temp.draft('{"audience":"level","level_id":"grade-9"}', '[{"title":"Legacy-like","max_score":"10"}]')) $s$, 'validation');

-- An unfinished assignment saves as active but is not ready for work.
do $$ declare saved jsonb; begin
  saved := public.update_assignment('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-0000000000a1', 2,
    pg_temp.draft('{"audience":"level","level_id":"grade-9"}', jsonb_build_array(
      jsonb_build_object('id', current_setting('test.mixed_part'), 'title', 'Quiz', 'kind', 'online_questions', 'questions', jsonb_build_array(
        jsonb_build_object('id', current_setting('test.mixed_q'), 'prompt', '2+2?', 'max_score', '2.5', 'choices', jsonb_build_array(
          jsonb_build_object('id', current_setting('test.mixed_c'), 'label', '3'),
          jsonb_build_object('label', '4'))))),
      jsonb_build_object('title', 'Empty', 'kind', 'file_upload', 'questions', '[]'::jsonb))));
  if saved->'parts'->0->'issues' <> '["correct_choice"]'::jsonb or saved->'parts'->1->'issues' <> '["questions"]'::jsonb
    or saved->'parts'->1->>'max_score' <> '0.00' then
    raise exception 'Unfinished draft is wrong: %', saved;
  end if;
end $$;
do $$ begin
  if (public.get_assignment('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-0000000000a1')->>'ready')::boolean then
    raise exception 'An unfinished assignment must not be ready';
  end if;
end $$;
select pg_temp.expect_error($s$ select public.record_assignment_work('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-0000000000a1', current_setting('test.s1')::uuid, 1, 'submitted', now(), '') $s$, 'incomplete');

-- Answer keys are private: no table grants, no private function access, none in the student projection.
reset role;
do $$ begin
  if has_table_privilege('authenticated', 'public.assignment_part_questions', 'select')
    or has_table_privilege('authenticated', 'public.assignment_question_choices', 'select')
    or has_table_privilege('anon', 'public.assignment_question_choices', 'select')
    or has_function_privilege('authenticated', 'edra_private.assignment_student_json(uuid)', 'execute')
    or has_function_privilege('authenticated', 'edra_private.part_issues(uuid)', 'execute') then
    raise exception 'Answer key tables or functions are exposed';
  end if;
end $$;
set local role authenticated;
select pg_temp.expect_error($s$ select * from public.assignment_question_choices $s$, 'permission denied%');
select pg_temp.expect_error($s$ update public.assignment_part_questions set max_score = 99 $s$, 'permission denied%');
reset role;
do $$ declare projection jsonb; begin
  projection := edra_private.assignment_student_json('a9999999-0000-4000-8000-0000000000a1');
  if projection::text like '%is_correct%' or jsonb_array_length(projection->'parts'->0->'questions'->0->'choices') <> 2
    or projection->'parts'->0->'questions'->0->'choices'->0 ? 'is_correct' then
    raise exception 'Student projection leaks the key: %', projection;
  end if;
  -- Even a privileged writer cannot change a scheme with activity (trigger-level lock): checked below.
end $$;
set local role authenticated;
set local request.jwt.claim.sub = 'a1111111-1111-4111-8111-111111111111';

-- A complete scheme becomes ready; receiving work locks kinds, questions, choices, and marks.
do $$ declare saved jsonb; begin
  saved := public.update_assignment('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-0000000000a1', 3,
    pg_temp.draft('{"audience":"level","level_id":"grade-9"}', jsonb_build_array(
      jsonb_build_object('id', current_setting('test.mixed_part'), 'title', 'Quiz', 'kind', 'online_questions', 'questions', jsonb_build_array(
        jsonb_build_object('id', current_setting('test.mixed_q'), 'prompt', '2+2?', 'max_score', '2.5', 'choices', jsonb_build_array(
          jsonb_build_object('id', current_setting('test.mixed_c'), 'label', '3', 'is_correct', true),
          jsonb_build_object('label', '4'))))))));
  if jsonb_array_length(saved->'parts'->0->'issues') <> 0 then raise exception 'Complete scheme still has issues: %', saved; end if;
  if not (saved->>'ready')::boolean then raise exception 'Complete scheme must be ready'; end if;
  perform public.record_assignment_work('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-0000000000a1',
    current_setting('test.s1')::uuid, 1, 'submitted', now(), '');
end $$;
select pg_temp.expect_error(format($s$ select public.update_assignment('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-0000000000a1', 4, pg_temp.draft('{"audience":"level","level_id":"grade-9"}', '[{"id":"%s","title":"Quiz","kind":"online_questions","questions":[{"id":"%s","prompt":"Changed?","max_score":"2.5","choices":[{"id":"%s","label":"3","is_correct":true},{"label":"4"}]}]}]')) $s$,
  current_setting('test.mixed_part'), current_setting('test.mixed_q'), current_setting('test.mixed_c')), 'structure_locked');
reset role;
select pg_temp.expect_error(format($s$ update public.assignment_part_questions set max_score = 9 where id = '%s' $s$, current_setting('test.mixed_q')), 'structure_locked');
-- A legacy maximum-only part stays readable and physically markable but is never online-ready, and cannot be created or reverted to.
insert into public.assignments (id, academy_id, academic_year_id, title, audience, level_id, created_by, updated_by)
values ('a9999999-0000-4000-8000-0000000000b1', 'a5555555-5555-4555-8555-555555555555', 'a5555555-1111-4111-8111-555555555555', 'Legacy', 'level', 'grade-9',
  'a1111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111');
insert into public.assignment_parts (id, academy_id, assignment_id, position, title, max_score)
values ('a0000000-0000-4000-8000-0000000000b2', 'a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-0000000000b1', 1, 'Old part', 7);
set local role authenticated;
set local request.jwt.claim.sub = 'a1111111-1111-4111-8111-111111111111';
do $$ declare legacy jsonb; begin
  legacy := public.get_assignment('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-0000000000b1');
  if legacy->'parts'->0->'kind' <> 'null'::jsonb or legacy->>'max_score' <> '7.00' or jsonb_array_length(legacy->'parts'->0->'issues') <> 0 then
    raise exception 'Legacy part is wrong: %', legacy;
  end if;
end $$;
select pg_temp.expect_error($s$ select public.update_assignment('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-0000000000b1', 1, pg_temp.draft('{"audience":"level","level_id":"grade-9"}', '[{"id":"a0000000-0000-4000-8000-0000000000b2","title":"Old part","max_score":"0"}]')) $s$, 'validation');
select pg_temp.expect_error($s$ select public.update_assignment('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-0000000000b1', 1, pg_temp.draft('{"audience":"level","level_id":"grade-9"}', '[{"id":"a0000000-0000-4000-8000-0000000000b2","title":"Old part","max_score":"7"},{"title":"New legacy","max_score":"3"}]')) $s$, 'validation');
do $$ declare saved jsonb; begin
  -- An unused draft legacy part converts only through an explicit typed scheme; its maximum becomes the question sum.
  saved := public.update_assignment('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-0000000000b1', 1,
    pg_temp.draft('{"audience":"level","level_id":"grade-9"}', '[{"id":"a0000000-0000-4000-8000-0000000000b2","title":"Old part","kind":"file_upload","questions":[{"max_score":"2"}]}]'));
  if saved->'parts'->0->>'kind' <> 'file_upload' or saved->>'max_score' <> '2.00' then raise exception 'Conversion is wrong: %', saved; end if;
end $$;

-- Assignments are never deleted, even by the owner role.
reset role;
select pg_temp.expect_error($s$ delete from public.assignments where id = 'a9999999-0000-4000-8000-000000000001' $s$, 'validation');

-- A closed year makes everything read-only.
update public.academic_years set closed_at = now() where id = 'a5555555-1111-4111-8111-555555555555';
set local role authenticated;
set local request.jwt.claim.sub = 'a1111111-1111-4111-8111-111111111111';
select pg_temp.expect_error($s$ select public.change_assignment_state('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001', 8, 'close') $s$, 'year_unavailable');
select pg_temp.expect_error($s$ select public.create_assignment('a5555555-5555-4555-8555-555555555555', 'a5555555-1111-4111-8111-555555555555', gen_random_uuid(), pg_temp.draft('{"audience":"level","level_id":"grade-9"}')) $s$, 'year_unavailable');
do $$ begin
  if (public.get_assignment('a5555555-5555-4555-8555-555555555555', 'a9999999-0000-4000-8000-000000000001')->>'year_open')::boolean then
    raise exception 'Closed year must be reported';
  end if;
end $$;

rollback;
select 'assignment checks passed';
