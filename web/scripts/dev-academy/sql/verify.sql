-- Read-only verification of one registered run. verify.mjs runs this inside `begin read only` after
-- setting edra.dev_run. The final statement returns {academy_id, counts, failures, baseline_failures,
-- projections}. `failures` are integrity violations in any state; `baseline_failures` hold only for the
-- untouched initial dataset (legitimate preview edits may change them).

-- Existing read projections, called with transaction-local actor context like their API callers.
select set_config('request.jwt.claims', (
  select jsonb_build_object('sub', a.user_id)::text from edra_private.dev_accounts a
  where a.run_id = current_setting('edra.dev_run')::uuid and a.logical_id = 'account:staff:owner'), true);
select set_config('edra.verify_staff', jsonb_build_object(
  'past_sessions', (select jsonb_array_length(public.list_past_sessions(r.academy_id, null, null, null, null, null, 100, 'all'))
    from edra_private.dev_runs r where r.id = current_setting('edra.dev_run')::uuid),
  'assignment_marks', (select to_jsonb(public.list_assignment_marks(x.academy_id, x.id, 'all', 100, 0, null))
    from public.assignments x join edra_private.dev_runs r on r.academy_id = x.academy_id
    where r.id = current_setting('edra.dev_run')::uuid and x.state = 'closed' order by x.created_at, x.id limit 1)
)::text, true);
select set_config('request.jwt.claims', (
  select jsonb_build_object('sub', a.user_id)::text from edra_private.dev_accounts a
  where a.run_id = current_setting('edra.dev_run')::uuid and a.logical_id = 'account:student:01'), true);
select set_config('edra.verify_student', jsonb_build_object(
  'my_exams', (select to_jsonb(public.list_my_exams(r.academy_id, 50, 0))
    from edra_private.dev_runs r where r.id = current_setting('edra.dev_run')::uuid)
)::text, true);
select set_config('request.jwt.claims', '', true);

with run as (
  select r.* from edra_private.dev_runs r where r.id = current_setting('edra.dev_run')::uuid
), acc as (
  select a.* from edra_private.dev_accounts a where a.run_id = (select id from run)
), counts as (
  select jsonb_build_object(
    'accounts', (select count(*) from acc),
    'accounts_loaded', (select count(*) from acc where state = 'loaded'),
    'auth_users', (select count(*) from auth.users u join acc on acc.user_id = u.id),
    'open_years', (select count(*) from public.academic_years y, run where y.academy_id = run.academy_id and y.closed_at is null),
    'years', (select count(*) from public.academic_years y, run where y.academy_id = run.academy_id),
    'memberships', (select count(*) from public.academy_memberships m, run where m.academy_id = run.academy_id),
    'groups', (select count(*) from public.groups g, run where g.academy_id = run.academy_id),
    'schedules', (select count(*) from public.schedules x, run where x.academy_id = run.academy_id),
    'schedule_slots', (select count(*) from public.schedule_slots x, run where x.academy_id = run.academy_id),
    'student_records', (select count(*) from public.annual_student_records x, run where x.academy_id = run.academy_id),
    'linked_records', (select count(*) from public.annual_student_records x
      join public.academy_student_profiles p on p.id = x.academy_student_profile_id
      join acc on acc.user_id = p.user_id and acc.kind = 'student', run where x.academy_id = run.academy_id),
    'sessions_ended', (select count(*) from public.sessions x, run where x.academy_id = run.academy_id and x.state = 'ended'),
    'sessions_live', (select count(*) from public.sessions x, run where x.academy_id = run.academy_id and x.state = 'live'),
    'roster_entries', (select count(*) from public.session_roster_entries x, run where x.academy_id = run.academy_id),
    'attendance_sheets', (select count(*) from public.attendance_sheets x, run where x.academy_id = run.academy_id),
    'attendance_publications', (select count(*) from public.attendance_publications x, run where x.academy_id = run.academy_id),
    'attendance_publication_items', (select count(*) from public.attendance_publication_items i
      join public.attendance_publications x on x.id = i.publication_id, run where x.academy_id = run.academy_id),
    'attendance_records', (select count(*) from public.attendance_records x, run where x.academy_id = run.academy_id),
    'attendance_effects', (select count(*) from public.attendance_effects x, run where x.academy_id = run.academy_id),
    'assignments', (select count(*) from public.assignments x, run where x.academy_id = run.academy_id),
    'assignments_closed', (select count(*) from public.assignments x, run where x.academy_id = run.academy_id and x.state = 'closed'),
    'assignment_parts', (select count(*) from public.assignment_parts x, run where x.academy_id = run.academy_id),
    'assignment_questions', (select count(*) from public.assignment_part_questions x, run where x.academy_id = run.academy_id),
    'assignment_max_total', (select coalesce(sum(x.max_score), 0) from public.assignments x, run where x.academy_id = run.academy_id),
    'assignment_recipients', (select count(*) from public.assignment_recipients x, run where x.academy_id = run.academy_id),
    'assignment_marks', (select count(*) from public.assignment_marks x, run where x.academy_id = run.academy_id),
    'assignment_publications', (select count(*) from public.assignment_result_publications x, run where x.academy_id = run.academy_id),
    'exams', (select count(*) from public.exams x, run where x.academy_id = run.academy_id),
    'exam_parts', (select count(*) from public.exam_parts x, run where x.academy_id = run.academy_id),
    'exam_questions', (select count(*) from public.exam_questions x, run where x.academy_id = run.academy_id),
    'exam_choices', (select count(*) from public.exam_choices x, run where x.academy_id = run.academy_id),
    'exam_max_total', (select coalesce(sum(x.max_score), 0) from public.exams x, run where x.academy_id = run.academy_id),
    'exam_closures', (select count(*) from public.exam_closures x, run where x.academy_id = run.academy_id),
    'exam_work', (select count(*) from public.exam_work x, run where x.academy_id = run.academy_id),
    'exam_submissions', (select count(*) from public.exam_submissions x, run where x.academy_id = run.academy_id),
    'exam_marks', (select count(*) from public.exam_marks x, run where x.academy_id = run.academy_id),
    'exam_publications', (select count(*) from public.exam_result_publications x, run where x.academy_id = run.academy_id),
    'effects', (select count(*) from (
      select x.id from public.attendance_effects x, run where x.academy_id = run.academy_id
      union all select x.id from public.assignment_result_effects x, run where x.academy_id = run.academy_id
      union all select x.id from public.exam_result_effects x, run where x.academy_id = run.academy_id) e),
    'effects_suppressed', (select count(*) from edra_private.dev_effect_suppressions d, run where d.run_id = run.id)
  ) as value
), failures as (
  select array_remove(array[
    case when (select count(*) from run) <> 1 then 'run is not registered' end,
    case when (select academy_id from run) is null
      or not exists (select 1 from public.academies a, run where a.id = run.academy_id) then 'run academy is missing' end,
    case when (select count(*) from public.academic_years y, run where y.academy_id = run.academy_id and y.closed_at is null) <> 1
      then 'academy does not have exactly one open year' end,
    case when exists (select 1 from acc left join auth.users u on u.id = acc.user_id
      where u.id is null or ltrim(coalesce(u.phone, ''), '+') <> ltrim(acc.phone, '+')) then 'a generated account is missing or its phone differs' end,
    case when exists (select 1 from public.academy_memberships m join acc on acc.user_id = m.user_id, run
      where m.academy_id <> run.academy_id) then 'a generated account has a membership outside the synthetic academy' end,
    case when exists (select 1 from public.academy_student_profiles p join acc on acc.user_id = p.user_id, run
      where p.academy_id <> run.academy_id) then 'a generated account is linked to a student outside the synthetic academy' end,
    case when exists (select 1 from public.academy_student_profiles p, run
      where p.academy_id = run.academy_id and p.user_id is not null
        and p.user_id not in (select user_id from acc where kind = 'student')) then 'a synthetic student is linked to a non-generated account' end,
    case when exists (select 1 from edra_private.dev_contacts c join auth.users u on ltrim(u.phone, '+') = ltrim(c.phone, '+'), run
      where c.run_id = run.id and u.id not in (select user_id from acc)) then 'a reserved synthetic contact belongs to another Auth user' end,
    case when exists (select 1 from public.attendance_records x
      join public.attendance_publications p on p.id = x.published_publication_id, run
      where x.academy_id = run.academy_id and p.session_id <> x.session_id) then 'an official attendance value references another session' end,
    case when exists (select 1 from public.attendance_records x, run
      where x.academy_id = run.academy_id and x.published_publication_id is not null
        and x.published_status is distinct from (
          select i.status from public.attendance_publication_items i join public.attendance_publications p on p.id = i.publication_id
          where i.session_id = x.session_id and i.annual_student_record_id = x.annual_student_record_id
          order by p.sequence desc limit 1)) then 'an official attendance value differs from its latest publication' end,
    case when exists (select 1 from public.attendance_sheets x, run
      where x.academy_id = run.academy_id and x.publication_count <> (
        select count(*) from public.attendance_publications p where p.session_id = x.session_id)) then 'an attendance sheet publication count is wrong' end,
    case when exists (select 1 from public.assignment_result_publications p, run
      where p.academy_id = run.academy_id and p.total <> (select coalesce(sum((m->>'score')::numeric), 0) from jsonb_array_elements(p.marks) m))
      then 'an assignment result total differs from its marks' end,
    case when exists (select 1 from public.assignment_recipients x, run
      where x.academy_id = run.academy_id and x.published_revision <> coalesce((select max(p.revision) from public.assignment_result_publications p
        where p.assignment_id = x.assignment_id and p.annual_student_record_id = x.annual_student_record_id), 0))
      then 'an assignment recipient published revision differs from its publications' end,
    case when exists (select 1 from public.exam_result_publications p
      join public.exam_work w on w.exam_id = p.exam_id and w.annual_student_record_id = p.annual_student_record_id, run
      where p.academy_id = run.academy_id and w.accepted_submission_id is null) then 'an exam result exists without accepted work' end,
    case when exists (select 1 from public.exam_work w, run
      where w.academy_id = run.academy_id and w.published_revision <> coalesce((select max(p.revision) from public.exam_result_publications p
        where p.exam_id = w.exam_id and p.annual_student_record_id = w.annual_student_record_id), 0))
      then 'an exam published revision differs from its publications' end,
    case when exists (select 1 from (
        select 'attendance_effects' t, x.id, x.processed_at from public.attendance_effects x, run where x.academy_id = run.academy_id
        union all select 'assignment_result_effects', x.id, x.processed_at from public.assignment_result_effects x, run where x.academy_id = run.academy_id
        union all select 'exam_result_effects', x.id, x.processed_at from public.exam_result_effects x, run where x.academy_id = run.academy_id) e
      where e.processed_at is not null or not exists (
        select 1 from edra_private.dev_effect_suppressions d where d.source_table = e.t and d.effect_id = e.id))
      then 'a synthetic outbox effect is unsuppressed or marked processed' end
  ], null) as value
), baseline as (
  select array_remove(array[
    case when exists (select 1 from acc join public.profiles p on p.id = acc.user_id where p.full_name is distinct from acc.display_name)
      then 'a generated profile name differs from the registry' end,
    case when exists (select 1 from acc left join public.academy_memberships m on m.user_id = acc.user_id
        and m.academy_id = (select academy_id from run)
      where acc.kind <> 'student' and (m.role is null or m.role::text <> acc.kind)) then 'a generated staff membership role differs' end,
    case when not exists (select 1 from public.academy_memberships m, run
      where m.academy_id = run.academy_id and m.user_id = run.developer_id and m.role = 'instructor') then 'the developer is not an Instructor of the academy' end,
    case when exists (select 1 from public.student_profiles sp join acc on acc.user_id = sp.user_id
      where sp.level_id is null or sp.parent_phone is null or sp.parent_phone_verified_at is null)
      or (select count(*) from public.student_profiles sp join acc on acc.user_id = sp.user_id) <> (select count(*) from acc where kind = 'student')
      then 'a generated student has not completed onboarding' end,
    case when exists (select 1 from public.attendance_records x, run
      where x.academy_id = run.academy_id and x.status is distinct from x.published_status) then 'an attendance draft differs from its official value' end,
    case when exists (select 1 from public.attendance_publications x, run where x.academy_id = run.academy_id and x.sequence <> 1)
      then 'an attendance correction exists' end,
    case when exists (select 1 from public.assignment_result_publications p, run
      where p.academy_id = run.academy_id and p.content_hash <> md5(edra_private.assignment_result_content(p.assignment_id, p.annual_student_record_id)::text))
      then 'an assignment result hash differs from its canonical content' end,
    case when exists (select 1 from public.assignment_result_publications p
      join public.assignment_recipients x on x.assignment_id = p.assignment_id and x.annual_student_record_id = p.annual_student_record_id, run
      where p.academy_id = run.academy_id and x.work_status not in ('submitted', 'late')) then 'an assignment result exists without received work' end,
    case when exists (select 1 from public.exam_result_publications p, run
      where p.academy_id = run.academy_id
        and p.content_hash <> edra_private.exam_result_hash(edra_private.exam_result_content(p.exam_id, p.annual_student_record_id)))
      then 'an exam result hash differs from its canonical content' end,
    case when exists (select 1 from public.exam_work w join public.exams z on z.id = w.exam_id, run
      where w.academy_id = run.academy_id and not exists (select 1 from public.exam_closures c where c.exam_id = z.id))
      then 'current exams already have work' end,
    case when exists (select 1 from public.exams z, run where z.academy_id = run.academy_id
        and not exists (select 1 from public.exam_closures c where c.exam_id = z.id) and edra_private.exam_issues(z.id) <> '[]'::jsonb)
      then 'a current exam is not ready to start' end
  ], null) as value
)
select jsonb_build_object(
  'run_state', (select state from run),
  'academy_id', (select academy_id from run),
  'counts', (select value from counts),
  'failures', to_jsonb((select value from failures)),
  'baseline_failures', to_jsonb((select value from baseline)),
  'projections', jsonb_build_object(
    'staff', current_setting('edra.verify_staff', true)::jsonb,
    'student', current_setting('edra.verify_student', true)::jsonb)
) as result;
