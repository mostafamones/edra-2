-- Loads one registered synthetic run's domain records. create.mjs wraps this file in a transaction
-- after defining:
--   setting edra.dev_run   the run UUID (transaction-local)
--   pg_temp.fx(doc jsonb)  {lockToken, scenarioHash, academySlug, scenario}
-- Existing constraints and triggers stay active. Historical actor context is transaction-local on
-- this privileged connection only; the exam helpers are called the way the domain RPCs call them.
-- Scenario IDs are mapped to run-scoped UUIDs, so two runs never collide.

create or replace function pg_temp.rid(p_id text) returns uuid language sql stable as $$
  select md5(current_setting('edra.dev_run') || ':' || p_id)::uuid;
$$;

create or replace function pg_temp.track(p_level text, p_track text) returns uuid language sql stable as $$
  select case when p_track is null then null else pg_temp.rid('track:' || p_level || ':' || p_track) end;
$$;

create or replace function pg_temp.act(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_user)::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
end;
$$;

-- Preflight: the caller holds this run's loading lock and every account is provisioned.
do $$
declare
  d jsonb := (select doc from pg_temp.fx);
  r edra_private.dev_runs%rowtype;
begin
  select * into r from edra_private.dev_runs where id = current_setting('edra.dev_run')::uuid for update;
  if not found or r.state <> 'loading' or r.lock_token is distinct from (d->>'lockToken')::uuid
    or r.lock_expires_at <= now() then
    raise exception 'dev-academy: run is not locked for loading';
  end if;
  if r.academy_id is not null then raise exception 'dev-academy: run already has an academy'; end if;
  if r.scenario_hash <> d->>'scenarioHash' then raise exception 'dev-academy: scenario hash mismatch'; end if;
  if (select count(*) from edra_private.dev_accounts a where a.run_id = r.id and a.state = 'created') <> 26
    or exists (select 1 from edra_private.dev_accounts a where a.run_id = r.id and a.state <> 'created') then
    raise exception 'dev-academy: generated accounts are not all provisioned';
  end if;
  if not exists (select 1 from public.profiles p where p.id = r.developer_id) then
    raise exception 'dev-academy: developer profile is missing';
  end if;
  -- Registered before any domain row, so the suppression triggers see every synthetic effect.
  update edra_private.dev_runs set academy_id = pg_temp.rid(d->'scenario'->'academy'->>'id'), updated_at = now()
  where id = r.id;
end;
$$;

create temp table fx_people on commit drop as
select x->>'id' as sid, x->>'key' as key, x->>'role' as role, x->>'displayName' as name, x->>'phone' as phone,
  x->>'parentPhone' as parent_phone, a.user_id, x ? 'pattern' as is_student
from pg_temp.fx, jsonb_array_elements((fx.doc->'scenario'->'staff') || (fx.doc->'scenario'->'students')) x
join edra_private.dev_accounts a on a.run_id = current_setting('edra.dev_run')::uuid and a.logical_id = x->>'accountKey';

do $$
declare
  s jsonb := (select doc->'scenario' from pg_temp.fx);
  v_run uuid := current_setting('edra.dev_run')::uuid;
  academy uuid := pg_temp.rid(s->'academy'->>'id');
  year_start timestamptz := (s->'config'->'academicYear'->>'startsAt')::timestamptz;
  reference_at timestamptz := ((s->'config'->>'referenceDate')::date::timestamp at time zone 'Africa/Cairo');
  year_id uuid;
  owner_id uuid;
  developer uuid;
  e record;
  target public.exams%rowtype;
  content jsonb;
  snapshot jsonb;
  publication uuid;
begin
  select user_id into owner_id from fx_people where key = 'staff:owner';
  select developer_id into developer from edra_private.dev_runs where id = v_run;
  if owner_id is null or (select count(*) from fx_people) <> 26 then
    raise exception 'dev-academy: scenario people do not match the registered accounts';
  end if;

  -- Academy, its automatically initialized year, staff and the real developer as Instructor.
  insert into public.academies (id, name, created_by, slug, icon, subject, created_at, updated_at)
  values (academy, s->'academy'->>'name', owner_id, (select doc->>'academySlug' from pg_temp.fx), 'school', 'Mathematics',
    year_start, year_start);
  select y.id into year_id from public.academic_years y where y.academy_id = academy and y.closed_at is null;
  if year_id is null or (select y.start_year from public.academic_years y where y.id = year_id)
    <> extract(year from (s->'config'->'academicYear'->>'startsOn')::date) then
    raise exception 'dev-academy: the current academic year does not match the scenario reference date';
  end if;

  insert into public.academy_memberships (academy_id, user_id, role, created_by, created_at)
  select academy, p.user_id, p.role::public.academy_role, owner_id, year_start from fx_people p where not p.is_student
  union all select academy, developer, 'instructor', owner_id, year_start;

  insert into public.academy_levels (academy_id, level_id, sort_order)
  select academy, l.level_id, (row_number() over (order by l.first_pos))::smallint
  from (select g->>'levelKey' as level_id, min(i) as first_pos
        from jsonb_array_elements(s->'groups') with ordinality t(g, i) group by 1) l;

  insert into public.academy_tracks (id, academy_id, level_id, name, sort_order, created_at)
  select pg_temp.track(t.level_id, t.track), academy, t.level_id, initcap(t.track),
    (row_number() over (partition by t.level_id order by t.first_pos))::smallint, year_start
  from (select g->>'levelKey' as level_id, g->>'track' as track, min(i) as first_pos
        from jsonb_array_elements(s->'groups') with ordinality t(g, i) where g->>'track' is not null group by 1, 2) t;

  insert into public.groups (id, academy_id, academic_year_id, level_id, track_id, name, created_at, updated_at)
  select pg_temp.rid(g->>'id'), academy, year_id, g->>'levelKey', pg_temp.track(g->>'levelKey', g->>'track'), g->>'name',
    year_start, year_start
  from jsonb_array_elements(s->'groups') g;

  -- Students: linked accounts, completed onboarding, one current-year in-person record each.
  create temp table fx_students on commit drop as
  select p.sid, p.user_id, p.name, p.phone, p.parent_phone,
    pg_temp.rid(pl->>'id') as record_id, pg_temp.rid(p.sid || ':academy-profile') as profile_id,
    pg_temp.rid(pl->>'groupId') as group_id, pl->>'levelKey' as level_id,
    pg_temp.track(pl->>'levelKey', pl->>'track') as track_id, (pl->>'enrolledAt')::timestamptz as enrolled_at
  from fx_people p join jsonb_array_elements(s->'placements') pl on pl->>'studentId' = p.sid
  where p.is_student;
  if (select count(*) from fx_students) <> 20 then raise exception 'dev-academy: expected 20 placed students'; end if;

  insert into public.student_profiles (user_id, level_id, parent_phone, parent_phone_verified_at, created_at, updated_at)
  select user_id, level_id, parent_phone, enrolled_at, enrolled_at, enrolled_at from fx_students;
  insert into public.academy_student_profiles (id, academy_id, created_at, created_by, user_id, linked_at)
  select profile_id, academy, enrolled_at, owner_id, user_id, enrolled_at from fx_students;
  insert into public.annual_student_records (id, academy_id, academic_year_id, academy_student_profile_id, full_name,
    student_phone, parent_phone, level_id, track_id, primary_group_id, participation_type, created_at, updated_at, created_by)
  select record_id, academy, year_id, profile_id, name, phone, parent_phone, level_id, track_id, group_id, 'in_person',
    enrolled_at, enrolled_at, owner_id
  from fx_students;

  -- Recurring group schedules; upcoming activity is derived from these, never from future sessions.
  insert into public.schedules (id, academy_id, academic_year_id, title, kind, audience, group_id, mandatory, location,
    created_by, created_at, updated_at)
  select pg_temp.rid(sc->>'id'), academy, year_id, g->>'name', 'recurring', 'group', pg_temp.rid(g->>'id'), true,
    'Main hall', owner_id, year_start, year_start
  from jsonb_array_elements(s->'schedules') sc join jsonb_array_elements(s->'groups') g on g->>'id' = sc->>'groupId';
  insert into public.schedule_slots (id, academy_id, academic_year_id, schedule_id, weekday, starts_at, ends_at)
  select pg_temp.rid((sc->>'id') || ':slot:' || (sl->>'weekday')), academy, year_id, pg_temp.rid(sc->>'id'),
    (sl->>'weekday')::smallint, (sl->>'startTime')::time,
    (sl->>'startTime')::time + make_interval(mins => (sl->>'durationMinutes')::integer)
  from jsonb_array_elements(s->'schedules') sc, jsonb_array_elements(sc->'slots') sl;

  -- Ended historical sessions with their snapshots, expected rosters and one initial publication.
  create temp table fx_sessions on commit drop as
  select x->>'id' as sid, pg_temp.rid(x->>'id') as id, pg_temp.rid(x->>'groupId') as group_id,
    (x->>'startsAt')::timestamptz as starts_at, (x->>'endsAt')::timestamptz as ends_at, p.user_id as starter, p.name as starter_name
  from jsonb_array_elements(s->'sessions') x join fx_people p on p.sid = x->>'startedById';
  if (select count(*) from fx_sessions) <> jsonb_array_length(s->'sessions') then
    raise exception 'dev-academy: a session starter is not a generated staff account';
  end if;

  insert into public.sessions (id, academy_id, academic_year_id, schedule_id, state, started_at, started_by, started_by_name,
    start_key, ended_at, ended_by, ended_by_name, end_reason, auto_end_at, schedule_title, schedule_kind, audience,
    group_id, group_name, level_id, track_id, track_name, mandatory, location)
  select se.id, academy, year_id, sch.id, 'ended', se.starts_at, se.starter, se.starter_name,
    pg_temp.rid(se.sid || ':start-key'), se.ends_at, se.starter, se.starter_name, 'manual',
    greatest(se.ends_at, se.starts_at + interval '90 minutes'), sch.title, sch.kind, sch.audience,
    g.id, g.name, g.level_id, g.track_id, t.name, sch.mandatory, sch.location
  from fx_sessions se
  join public.schedules sch on sch.academy_id = academy and sch.group_id = se.group_id
  join public.groups g on g.id = se.group_id
  left join public.academy_tracks t on t.id = g.track_id;

  insert into public.session_roster_entries (academy_id, academic_year_id, session_id, annual_student_record_id, origin,
    level_id, track_id, primary_group_id, participation_type, created_at)
  select academy, year_id, se.id, st.record_id, 'expected', st.level_id, st.track_id, st.group_id, 'in_person', se.starts_at
  from jsonb_array_elements(s->'roster') r
  join fx_sessions se on se.sid = r->>'sessionId'
  join fx_students st on st.sid = r->>'studentId';

  create temp table fx_attendance on commit drop as
  select se.id as session_id, se.ends_at, se.starter, se.starter_name, pg_temp.rid(pb->>'id') as publication_id,
    (pb->>'publishedAt')::timestamptz as published_at, st.record_id, (it->>'status')::public.attendance_status as status
  from jsonb_array_elements(s->'attendancePublications') pb
  join fx_sessions se on se.sid = pb->>'sessionId'
  cross join jsonb_array_elements(pb->'items') it
  join fx_students st on st.sid = it->>'studentId';

  insert into public.attendance_sheets (session_id, academy_id, academic_year_id, revision, published_revision,
    publication_count, last_published_at, last_published_by, last_published_by_name, updated_at)
  select distinct on (session_id) session_id, academy, year_id, 1, 1, 1, published_at, starter, starter_name, published_at
  from fx_attendance order by session_id;
  insert into public.attendance_publications (id, academy_id, academic_year_id, session_id, sequence, kind, revision,
    item_count, published_at, published_by, published_by_name)
  select publication_id, academy, year_id, session_id, 1, 'initial', 1, count(*), published_at, starter, starter_name
  from fx_attendance group by publication_id, session_id, published_at, starter, starter_name;
  insert into public.attendance_records (academy_id, academic_year_id, session_id, annual_student_record_id, status, version,
    source, updated_by, updated_by_name, updated_at, published_status, published_at, published_publication_id)
  select academy, year_id, session_id, record_id, status, 1, 'manual', starter, starter_name, ends_at, status, published_at,
    publication_id
  from fx_attendance;
  insert into public.attendance_publication_items (publication_id, session_id, annual_student_record_id, status)
  select publication_id, session_id, record_id, status from fx_attendance;
  -- The same official effects publication creates; the registry trigger suppresses each one.
  insert into public.attendance_effects (academy_id, academic_year_id, session_id, annual_student_record_id, publication_id,
    effect_type, created_at)
  select academy, year_id, session_id, record_id, publication_id,
    case when status in ('present', 'late') then 'explanation_access' else 'absence_event' end::public.attendance_effect_type,
    published_at
  from fx_attendance where status in ('present', 'late', 'absent');

  -- Assignments: physical Written Work, structure first, then cohort/recipients, work, marks and results.
  create temp table fx_assignments on commit drop as
  select a->>'id' as sid, pg_temp.rid(a->>'id') as id, a->>'kind' as kind, (a->>'week')::integer as week,
    pg_temp.rid(a->>'groupId') as group_id, (a->>'assignedAt')::timestamptz as assigned_at,
    (a->>'dueAt')::timestamptz as due_at, a->'parts' as parts,
    (select p.user_id from fx_people p where p.role = 'instructor' order by p.key
     offset ((i - 1) % 3) limit 1) as author
  from jsonb_array_elements(s->'assignments') with ordinality t(a, i);

  insert into public.assignments (id, academy_id, academic_year_id, title, audience, due_at, state, created_by, created_at,
    updated_by, updated_at)
  select id, academy, year_id, format('Week %s homework', week), 'groups', due_at, 'active', author, assigned_at, author,
    assigned_at
  from fx_assignments;
  insert into public.assignment_audience_groups (assignment_id, academy_id, academic_year_id, group_id)
  select id, academy, year_id, group_id from fx_assignments;
  insert into public.assignment_parts (id, academy_id, assignment_id, position, title, max_score, created_at, kind)
  select pg_temp.rid(p->>'id'), academy, a.id, n::smallint, p->>'title', (p->>'maxScore')::numeric, a.assigned_at, 'file_upload'
  from fx_assignments a, jsonb_array_elements(a.parts) with ordinality t(p, n);
  insert into public.assignment_part_questions (id, academy_id, assignment_id, part_id, position, max_score)
  select pg_temp.rid((p->>'id') || ':question:1'), academy, a.id, pg_temp.rid(p->>'id'), 1, (p->>'maxScore')::numeric
  from fx_assignments a, jsonb_array_elements(a.parts) p;

  insert into public.assignment_cohorts (assignment_id, revision, audience_basis, source, captured_at, captured_by)
  select a.id, 1, edra_private.assignment_audience_basis(x), 'first_audience', a.assigned_at, a.author
  from fx_assignments a join public.assignments x on x.id = a.id;

  create temp table fx_assignment_results on commit drop as
  select r->>'id' as sid, a.id as assignment_id, a.kind, a.assigned_at, a.due_at, a.author, st.record_id, r->>'state' as state,
    (r->>'receivedAt')::timestamptz as received_at, (r->>'late')::boolean as late,
    (r->>'gradedAt')::timestamptz as graded_at, (r->>'announcedAt')::timestamptz as announced_at,
    g.user_id as grader, r->'components' as components
  from jsonb_array_elements(s->'assignmentResults') r
  join fx_assignments a on a.sid = r->>'assignmentId'
  join fx_students st on st.sid = r->>'studentId'
  left join fx_people g on g.sid = r->>'gradedById';
  if (select count(*) from fx_assignment_results) <> jsonb_array_length(s->'assignmentResults')
    or exists (select 1 from fx_assignment_results where components is not null and jsonb_typeof(components) = 'array' and grader is null) then
    raise exception 'dev-academy: assignment results do not resolve';
  end if;

  insert into public.assignment_cohort_members (assignment_id, cohort_revision, annual_student_record_id)
  select assignment_id, 1, record_id from fx_assignment_results;
  insert into public.assignment_recipients (assignment_id, annual_student_record_id, academy_id, academic_year_id, created_at,
    work_status, received_at, work_recorded_by, work_recorded_at, version, updated_at)
  select assignment_id, record_id, academy, year_id, assigned_at,
    case when received_at is null then 'expected' when late then 'late' else 'submitted' end::public.assignment_work_status,
    received_at, case when received_at is not null then coalesce(grader, author) end, received_at,
    case when received_at is null then 1 else 2 end, coalesce(received_at, assigned_at)
  from fx_assignment_results;
  update public.assignments x set cohort_revision = 1,
    recipient_count = (select count(*) from fx_assignment_results r where r.assignment_id = x.id)
  where x.id in (select id from fx_assignments);

  insert into public.assignment_marks (assignment_id, annual_student_record_id, part_id, academy_id, kind, score, updated_by,
    updated_at)
  select r.assignment_id, r.record_id, pg_temp.rid(c->>'partId'), academy, 'mark', (c->>'score')::numeric, r.grader, r.graded_at
  from fx_assignment_results r, jsonb_array_elements(r.components) c
  where jsonb_typeof(r.components) = 'array';

  -- Announced results mirror the publication RPC: ordered part snapshot and the canonical Postgres hash.
  for e in select * from fx_assignment_results where state in ('announced', 'late_announced') order by sid loop
    content := edra_private.assignment_result_content(e.assignment_id, e.record_id);
    select coalesce(jsonb_agg(jsonb_build_object(
        'part_id', p.id, 'position', p.position, 'title', p.title, 'max_score', edra_private.assignment_part_max(p.id)::text,
        'kind', coalesce(m.kind, 'mark'::public.assignment_mark_kind), 'score', coalesce(m.score, 0)::text, 'reason', m.reason,
        'scoring_revision', x.scoring_revision
      ) order by p.position), '[]'::jsonb)
    into snapshot
    from public.assignments x
    join public.assignment_parts p on p.assignment_id = x.id
    left join public.assignment_marks m on m.assignment_id = p.assignment_id and m.part_id = p.id
      and m.annual_student_record_id = e.record_id
    where x.id = e.assignment_id;
    insert into public.assignment_result_publications (id, academy_id, academic_year_id, assignment_id,
      annual_student_record_id, revision, total, max_score, work_status, marks, feedback, content_hash, published_by,
      published_at, scoring_revision)
    select pg_temp.rid(e.sid || ':publication:1'), academy, year_id, e.assignment_id, e.record_id, 1,
      (select coalesce(sum(m.score), 0) from public.assignment_marks m
       where m.assignment_id = e.assignment_id and m.annual_student_record_id = e.record_id),
      edra_private.assignment_max(e.assignment_id), x.work_status, snapshot, x.feedback, md5(content::text), e.grader,
      e.announced_at, a.scoring_revision
    from public.assignment_recipients x join public.assignments a on a.id = x.assignment_id
    where x.assignment_id = e.assignment_id and x.annual_student_record_id = e.record_id
    returning id into publication;
    insert into public.assignment_result_effects (academy_id, assignment_id, annual_student_record_id, publication_id,
      effect_type, created_at)
    values (academy, e.assignment_id, e.record_id, publication, 'result_published', e.announced_at);
    update public.assignment_recipients set published_revision = 1
    where assignment_id = e.assignment_id and annual_student_record_id = e.record_id;
  end loop;

  -- Historical assignments close after all of their work, marking and announcements.
  update public.assignments x set state = 'closed', closed_at = c.closed_at, closed_by = x.created_by,
    updated_at = c.closed_at, updated_by = x.created_by
  from (select a.id, greatest(a.due_at, max(coalesce(r.announced_at, r.graded_at, r.received_at))) + interval '1 hour' as closed_at
        from fx_assignments a join fx_assignment_results r on r.assignment_id = a.id
        where a.kind = 'historical' group by a.id, a.due_at) c
  where x.id = c.id;
  if exists (select 1 from public.assignments x where x.academy_id = academy and x.closed_at >= reference_at) then
    raise exception 'dev-academy: a historical assignment would close after the reference date';
  end if;

  -- Exams: complete authoring while unlocked; paper work through the existing acceptance/announcement helpers.
  create temp table fx_exams on commit drop as
  select x->>'id' as sid, pg_temp.rid(x->>'id') as id, x->>'kind' as kind, x->>'format' as format, (x->>'week')::integer as week,
    (x->>'opensAt')::timestamptz as opens_at, (x->>'scheduledClosesAt')::timestamptz as scheduled_closes_at,
    (x->>'closesAt')::timestamptz as closes_at, (x->>'timerMinutes')::integer as timer, x->'groupIds' as group_ids,
    x->'questions' as questions,
    (select p.user_id from fx_people p where p.role = 'instructor' order by p.key offset ((i - 1) % 3) limit 1) as author,
    greatest(year_start, least((x->>'opensAt')::timestamptz - interval '3 days', reference_at - interval '1 day')) as created_at
  from jsonb_array_elements(s->'exams') with ordinality t(x, i);

  insert into public.exams (id, academy_id, academic_year_id, title, audience, time_limit_minutes, opens_at, closes_at,
    actual_closes_at, availability_updated_by, availability_updated_at, created_by, created_at, updated_by, updated_at)
  select id, academy, year_id,
    case kind when 'historical' then format('Week %s paper exam', week)
      when 'open' then 'Preparatory practice exam' else 'Secondary practice exam' end,
    'groups', timer, opens_at, scheduled_closes_at, closes_at, author, created_at, author, created_at, author, created_at
  from fx_exams;
  insert into public.exam_audience_groups (exam_id, academy_id, academic_year_id, group_id)
  select x.id, academy, year_id, pg_temp.rid(g) from fx_exams x, jsonb_array_elements_text(x.group_ids) g;
  insert into public.exam_parts (id, academy_id, exam_id, position, title, kind)
  select pg_temp.rid(sid || ':part:1'), academy, id, 1,
    case when format = 'paper' then 'Written work' else 'Questions' end,
    case when format = 'paper' then 'written_work' else 'question_sheet' end::public.exam_part_kind
  from fx_exams;
  insert into public.exam_questions (id, academy_id, exam_id, part_id, position, prompt, max_score)
  select pg_temp.rid(q->>'id'), academy, x.id, pg_temp.rid(x.sid || ':part:1'), (q->>'position')::smallint,
    coalesce(q->>'prompt', 'Question ' || (q->>'position')), (q->>'maxScore')::numeric
  from fx_exams x, jsonb_array_elements(x.questions) q;
  insert into public.exam_choices (id, academy_id, exam_id, question_id, position, label, is_correct)
  select pg_temp.rid((q->>'id') || ':choice:' || n), academy, x.id, pg_temp.rid(q->>'id'), n::smallint, c,
    chr(64 + n::integer) = q->>'correctChoice'
  from fx_exams x, jsonb_array_elements(x.questions) q, jsonb_array_elements_text(q->'choices') with ordinality t(c, n)
  where x.format = 'mcq';

  create temp table fx_exam_results on commit drop as
  select r->>'id' as sid, x.id as exam_id, x.closes_at, st.record_id, r->>'state' as state,
    (r->>'receivedAt')::timestamptz as received_at, (r->>'gradedAt')::timestamptz as graded_at,
    (r->>'announcedAt')::timestamptz as announced_at, g.user_id as grader, r->'components' as components
  from jsonb_array_elements(s->'examResults') r
  join fx_exams x on x.sid = r->>'examId'
  join fx_students st on st.sid = r->>'studentId'
  left join fx_people g on g.sid = r->>'gradedById';
  if (select count(*) from fx_exam_results) <> jsonb_array_length(s->'examResults')
    or exists (select 1 from fx_exam_results where received_at is not null and grader is null) then
    raise exception 'dev-academy: exam results do not resolve';
  end if;

  insert into public.exam_work (exam_id, annual_student_record_id, academy_id, academic_year_id, created_at, updated_at)
  select exam_id, record_id, academy, year_id, received_at, received_at from fx_exam_results where received_at is not null;
  insert into public.exam_physical_drafts (exam_id, annual_student_record_id, academy_id, updated_by, updated_at)
  select exam_id, record_id, academy, grader, graded_at from fx_exam_results where received_at is not null;
  -- Exam components name the question in partId. Locks are set at the first historical receipt, so the activity helper keeps them instead of using now().
  update public.exams z set work_started_at = f.first_at, structure_locked_at = f.first_at
  from (select exam_id, min(received_at) as first_at from fx_exam_results where received_at is not null group by exam_id) f
  where z.id = f.exam_id;

  for e in select * from fx_exam_results where received_at is not null order by exam_id, sid loop
    perform pg_temp.act(e.grader);
    select z.* into target from public.exams z where z.id = e.exam_id;
    perform edra_private.accept_exam_submission(target, e.record_id, 'physical', 'physical', e.received_at, e.closes_at);
  end loop;
  insert into public.exam_marks (exam_id, annual_student_record_id, academy_id, question_id, score, updated_by, updated_at)
  select r.exam_id, r.record_id, academy, pg_temp.rid(c->>'partId'), (c->>'score')::numeric, r.grader, r.graded_at
  from fx_exam_results r, jsonb_array_elements(r.components) c
  where jsonb_typeof(r.components) = 'array';

  insert into public.exam_closures (exam_id, academy_id, closed_at, settled_at)
  select id, academy, closes_at, closes_at from fx_exams where kind = 'historical';

  for e in select * from fx_exam_results where state = 'announced' order by exam_id, sid loop
    perform pg_temp.act(e.grader);
    select z.* into target from public.exams z where z.id = e.exam_id;
    perform edra_private.announce_exam_result(target, e.record_id, false, e.announced_at);
  end loop;
  perform set_config('request.jwt.claims', '', true);

  update edra_private.dev_accounts a set state = 'loaded', annual_student_record_id = st.record_id, updated_at = now()
  from fx_people p left join fx_students st on st.sid = p.sid
  where a.run_id = v_run and a.user_id = p.user_id;
end;
$$;
