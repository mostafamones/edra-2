-- EDRA-232: student exam discovery, overview and the academy-scoped start/resume boundary.
--
-- Students find exams per connected academy. Discovery and the overview resolve the caller's
-- annual record of the academy's open year inside the database (ordinary-session, connected,
-- unsuspended, unarchived record; edra_private.student_caller_record). The academy id is a locator,
-- never authority, and no table grants are added for students.
--
-- Discoverable for a record:
--   * own participation: an online attempt, an accepted submission or entered physical answers
--     (an incidental empty work row does not count). History stays readable after placement moves,
--     but new work still needs current eligibility through the existing engine;
--   * or a new opportunity: unarchived, ready, scheduled or open (before the scheduled close) and
--     matching the current audience. Headroom/closed exams are never offered to new students.
--   Exams attached to a content unit (public.content_assessments) are excluded and denied on every
--   student entry path until the content integration authorizes them.
--
-- Projection tightening (owner decision, Student web exam flow — EDRA-83): question material,
-- saved answers and departure details are returned only during the student's active attempt or
-- once solutions qualify; after final submission and before qualification only status and the
-- official total remain. Official results are total-only (no items or feedback) with corrected
-- status/date derived from official revisions. Quiz behavior is unchanged.
--
-- Reads never start an attempt or move a deadline. The overview settles due work through the
-- existing settlement path and returns normally so that settlement commits.

-- ---------------------------------------------------------------------------------------------
-- Private helpers.

-- The caller's record in the academy's open year (one open year per academy), or null.
create or replace function edra_private.my_exam_record(p_academy_id uuid)
returns uuid
language sql stable security definer set search_path = '' as $$
  select edra_private.student_caller_record(y.academy_id, y.id)
  from public.academic_years y
  where y.academy_id = p_academy_id and y.closed_at is null;
$$;

create or replace function edra_private.exam_attached(p_exam_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.content_assessments l where l.kind = 'exam' and l.assessment_id = p_exam_id);
$$;

-- Actual own participation; an empty exam_work row created for locking alone is not participation.
create or replace function edra_private.exam_record_participated(p_exam_id uuid, p_record_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.exam_attempts a where a.exam_id = p_exam_id and a.annual_student_record_id = p_record_id)
    or exists (select 1 from public.exam_work w where w.exam_id = p_exam_id and w.annual_student_record_id = p_record_id
      and w.accepted_submission_id is not null)
    or exists (select 1 from public.exam_physical_answers x where x.exam_id = p_exam_id and x.annual_student_record_id = p_record_id);
$$;

-- p_phase is edra_private.exam_phase(p_exam, now), passed in to avoid recomputing readiness.
create or replace function edra_private.my_exam_discoverable(p_exam public.exams, p_phase text, p_record_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select p_record_id is not null and not edra_private.exam_attached(p_exam.id) and (
    edra_private.exam_record_participated(p_exam.id, p_record_id)
    or (p_phase in ('scheduled', 'open') and edra_private.exam_is_eligible(p_exam.id, p_record_id))
  );
$$;

-- Server-derived entry state: resume, start, submitted, not_yet_open, no_new_starts, ineligible,
-- unavailable. Browser capability and integration readiness are further client restrictions only.
-- An attempt past its cutoff but not yet settled (list snapshots) reports submitted.
create or replace function edra_private.my_exam_action(p_exam public.exams, p_phase text, p_record_id uuid, p_at timestamptz)
returns text
language sql stable security definer set search_path = '' as $$
  select case
    when a.id is not null and a.finalized_at is null and a.superseded_at is null
      and p_at < least(a.deadline_at, coalesce(p_exam.actual_closes_at, a.deadline_at)) then
      case when p_exam.archived_at is null and edra_private.exam_is_eligible(p_exam.id, p_record_id) then 'resume' else 'ineligible' end
    when a.id is not null or w.accepted_submission_id is not null then 'submitted'
    when p_phase = 'archived' then 'unavailable'
    when p_phase = 'scheduled' then case when edra_private.exam_is_eligible(p_exam.id, p_record_id) then 'not_yet_open' else 'ineligible' end
    when p_phase = 'open' then case when edra_private.exam_is_eligible(p_exam.id, p_record_id) then 'start' else 'ineligible' end
    else 'no_new_starts'
  end
  from (select 1) one
  left join public.exam_attempts a on a.exam_id = p_exam.id and a.annual_student_record_id = p_record_id
  left join public.exam_work w on w.exam_id = p_exam.id and w.annual_student_record_id = p_record_id;
$$;

-- The current official result, total only, with corrected status/date. Never items, feedback or
-- private marks. A revision above 1 is an officially announced correction.
create or replace function edra_private.exam_official_result_json(p_exam_id uuid, p_record_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'total', p.total::text, 'max_score', p.max_score::text, 'published_at', f.published_at,
    'corrected', p.revision > 1, 'corrected_at', case when p.revision > 1 then p.published_at end
  )
  from public.exam_work w
  join public.exam_result_publications p on p.exam_id = w.exam_id
    and p.annual_student_record_id = w.annual_student_record_id and p.revision = w.published_revision
  join public.exam_result_publications f on f.exam_id = w.exam_id
    and f.annual_student_record_id = w.annual_student_record_id and f.revision = 1
  where w.exam_id = p_exam_id and w.annual_student_record_id = p_record_id;
$$;

-- Allowlisted overview: no questions, answers, departure questions, items, feedback or marks.
create or replace function edra_private.my_exam_overview_json(p_exam public.exams, p_phase text, p_record_id uuid, p_at timestamptz)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'exam_id', p_exam.id, 'title', p_exam.title, 'instructions', p_exam.instructions,
    'time_limit_minutes', p_exam.time_limit_minutes,
    'opens_at', p_exam.opens_at, 'closes_at', p_exam.closes_at, 'actual_closes_at', p_exam.actual_closes_at,
    'server_now', p_at, 'phase', p_phase,
    'action', edra_private.my_exam_action(p_exam, p_phase, p_record_id, p_at),
    'attempt', (select jsonb_build_object(
        'started_at', a.started_at, 'deadline_at', a.deadline_at, 'cutoff_at', least(a.deadline_at, p_exam.actual_closes_at),
        'departure_count', a.departure_count, 'finalized_at', a.finalized_at, 'finalization_reason', a.finalization_reason,
        'superseded', a.superseded_at is not null)
      from public.exam_attempts a where a.exam_id = p_exam.id and a.annual_student_record_id = p_record_id),
    'submission', (select jsonb_build_object('source', s.source, 'reason', s.reason, 'submitted_at', s.submitted_at,
        'processed_at', s.processed_at)
      from public.exam_work w join public.exam_submissions s on s.id = w.accepted_submission_id
      where w.exam_id = p_exam.id and w.annual_student_record_id = p_record_id),
    'result', edra_private.exam_official_result_json(p_exam.id, p_record_id)
  );
$$;

-- Standalone authorization for every student entry path: attached exams are denied until the
-- content integration authorizes them.
create or replace function edra_private.exam_content_access(p_exam_id uuid, p_record_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select p_record_id is not null and exists (select 1 from public.exams z where z.id = p_exam_id)
    and not edra_private.exam_attached(p_exam_id);
$$;

-- Student projection, tightened: question material, saved answers and departure details only
-- during the active own attempt or after solution qualification. Result total-only.
create or replace function edra_private.exam_student_state(p_exam_id uuid, p_record_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  with numbered as (
    select q.id, row_number() over (order by p.position, q.position) as number
    from public.exam_questions q join public.exam_parts p on p.id = q.part_id where q.exam_id = p_exam_id
  )
  select jsonb_build_object(
    'exam_id', z.id, 'title', z.title, 'instructions', z.instructions,
    'server_now', clock_timestamp(),
    'opens_at', z.opens_at, 'closes_at', z.closes_at, 'actual_closes_at', z.actual_closes_at,
    'time_limit_minutes', z.time_limit_minutes,
    'phase', edra_private.exam_phase(z, clock_timestamp()),
    'eligible', edra_private.exam_is_eligible(z.id, p_record_id),
    'excluded_question_ids', case when reveal.questions then coalesce((select jsonb_agg(x.id order by x.id) from public.exam_questions x where x.exam_id = z.id and x.excluded_at is not null), '[]'::jsonb) else '[]'::jsonb end,
    'parts', case when reveal.questions then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pt.id, 'position', pt.position, 'title', pt.title, 'instructions', pt.instructions, 'kind', pt.kind,
        'questions', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', qq.id, 'position', qq.position, 'number', n.number, 'prompt', qq.prompt, 'max_score', qq.max_score::text,
            'excluded', qq.excluded_at is not null,
            'choices', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'position', c.position, 'label', c.label) order by c.position)
              from public.exam_choices c where c.question_id = qq.id), '[]'::jsonb)
          ) order by qq.position) from public.exam_questions qq join numbered n on n.id = qq.id where qq.part_id = pt.id
        ), '[]'::jsonb)
      ) order by pt.position) from public.exam_parts pt where pt.exam_id = z.id
    ), '[]'::jsonb) else '[]'::jsonb end,
    'attempt', (select jsonb_build_object(
        'started_at', a.started_at, 'deadline_at', a.deadline_at,
        'cutoff_at', least(a.deadline_at, z.actual_closes_at),
        'answers_version', a.answers_version, 'departure_count', a.departure_count,
        'finalized_at', a.finalized_at, 'finalization_reason', a.finalization_reason, 'superseded', a.superseded_at is not null,
        'answers', case when reveal.questions then coalesce((select jsonb_agg(jsonb_build_object('question_id', o.question_id, 'choice_id', o.choice_id, 'text_answer', o.text_answer)
          order by o.question_id) from public.exam_online_answers o where o.attempt_id = a.id), '[]'::jsonb) else '[]'::jsonb end,
        'departures', case when reveal.questions then coalesce((select jsonb_agg(edra_private.exam_departure_json(d) order by d.ordinal)
          from public.exam_departures d where d.attempt_id = a.id), '[]'::jsonb) else '[]'::jsonb end
      ) from public.exam_attempts a where a.exam_id = z.id and a.annual_student_record_id = p_record_id),
    'submission', (select jsonb_build_object('source', s.source, 'reason', s.reason, 'submitted_at', s.submitted_at,
        'processed_at', s.processed_at, 'original_deadline_at', s.original_deadline_at)
      from public.exam_work w join public.exam_submissions s on s.id = w.accepted_submission_id
      where w.exam_id = z.id and w.annual_student_record_id = p_record_id),
    'result', edra_private.exam_official_result_json(z.id, p_record_id),
    -- Solutions only once qualified: an accepted online submission at actual closure, or accepted
    -- physical work at actual closure with an announced result.
    'solutions', case when reveal.solutions then jsonb_build_object(
        'notes', z.solution_notes,
        'questions', coalesce((select jsonb_agg(jsonb_build_object(
            'question_id', qq.id, 'model_answer', qq.model_answer,
            'correct_choice_id', (select c.id from public.exam_choices c where c.question_id = qq.id and c.is_correct)
          ) order by qq.id) from public.exam_questions qq where qq.exam_id = z.id), '[]'::jsonb)
      ) end
  )
  from public.exams z
  cross join lateral (select edra_private.exam_solutions_available(z, p_record_id, clock_timestamp()) as solutions) qualified
  cross join lateral (select qualified.solutions, qualified.solutions or exists (
    select 1 from public.exam_attempts a
    where a.exam_id = z.id and a.annual_student_record_id = p_record_id
      and a.finalized_at is null and a.superseded_at is null
  ) as questions) reveal
  where z.id = p_exam_id;
$$;

-- Start or resume inside one transaction: settle due work, then the year (share) and the exam row
-- (for update) so a concurrent content attachment (which holds the exam for share) is serialized
-- with the standalone check, then the existing engine (which re-checks year, archive, readiness,
-- live placement, source and window, and returns the existing attempt on retries).
create or replace function edra_private.start_my_exam_for(p_exam_id uuid, p_record_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  year_id uuid;
begin
  perform edra_private.settle_exam_if_due(p_exam_id);
  select z.academic_year_id into year_id from public.exams z where z.id = p_exam_id;
  if not found then raise exception using errcode = 'P0001', message = 'not_found'; end if;
  perform 1 from public.academic_years y where y.id = year_id for share;
  perform 1 from public.exams z where z.id = p_exam_id for update;
  if edra_private.exam_attached(p_exam_id) then raise exception using errcode = 'P0001', message = 'content_unavailable'; end if;
  return edra_private.start_exam_attempt_for(p_exam_id, p_record_id);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Public student entry points (cookie web boundary; authenticated only).

-- One page of the caller's discoverable exams in the academy's open year: resumable and open
-- first, then upcoming, then history. Read-only snapshot (no settlement).
create or replace function public.list_my_exams(p_academy_id uuid, p_limit integer default 25, p_offset integer default 0)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  at_now timestamptz := clock_timestamp();
  record_id uuid;
  year_id uuid;
  result jsonb;
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'forbidden'; end if;
  if p_academy_id is null or p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset < 0 then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  record_id := edra_private.my_exam_record(p_academy_id);
  if record_id is null then raise exception using errcode = 'P0001', message = 'student_link_unavailable'; end if;
  select r.academic_year_id into year_id from public.annual_student_records r where r.id = record_id;
  with base as (
    select z as exam, ph.phase from public.exams z
    cross join lateral (select edra_private.exam_phase(z, at_now) as phase) ph
    where z.academy_id = p_academy_id and z.academic_year_id = year_id
  ),
  visible as (
    select b.exam, b.phase, edra_private.my_exam_action(b.exam, b.phase, record_id, at_now) as action
    from base b where edra_private.my_exam_discoverable(b.exam, b.phase, record_id)
  ),
  ranked as (
    select v.*, case v.action when 'resume' then 0 when 'start' then 1 when 'not_yet_open' then 2 else 3 end as rank
    from visible v
  )
  select jsonb_build_object(
    'total', (select count(*) from ranked),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'exam_id', (p.exam).id, 'title', (p.exam).title, 'time_limit_minutes', (p.exam).time_limit_minutes,
        'opens_at', (p.exam).opens_at, 'closes_at', (p.exam).closes_at, 'actual_closes_at', (p.exam).actual_closes_at,
        'phase', p.phase, 'action', p.action
      ) order by p.ord)
      from (
        select r.*, row_number() over (
          order by r.rank, case when r.rank < 3 then (r.exam).opens_at end asc nulls last,
            coalesce((r.exam).actual_closes_at, (r.exam).created_at) desc, (r.exam).id
        ) as ord
        from ranked r
        order by ord limit p_limit offset p_offset
      ) p
    ), '[]'::jsonb),
    'server_now', at_now
  ) into result;
  return result;
end;
$$;

-- The caller's allowlisted overview of one discoverable exam of the academy. After authorization it
-- settles due work and returns normally so the settlement commits. Wrong academy, other year or undiscoverable exams
-- are not_found (non-enumerating).
create or replace function public.get_my_exam_overview(p_academy_id uuid, p_exam_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  record_id uuid;
  target public.exams%rowtype;
  at_now timestamptz;
  phase text;
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'forbidden'; end if;
  if p_academy_id is null or p_exam_id is null then raise exception using errcode = 'P0001', message = 'validation'; end if;
  record_id := edra_private.my_exam_record(p_academy_id);
  if record_id is null then raise exception using errcode = 'P0001', message = 'student_link_unavailable'; end if;
  perform 1 from public.exams z join public.annual_student_records r on r.id = record_id
  where z.id = p_exam_id and z.academy_id = p_academy_id and z.academic_year_id = r.academic_year_id;
  if not found then raise exception using errcode = 'P0001', message = 'not_found'; end if;
  -- Authorize before settling, so a refused read never runs (or rolls back) settlement.
  select z.* into target from public.exams z where z.id = p_exam_id;
  if not edra_private.my_exam_discoverable(target, edra_private.exam_phase(target, clock_timestamp()), record_id) then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  perform edra_private.settle_exam_if_due(p_exam_id);
  select z.* into target from public.exams z where z.id = p_exam_id;
  at_now := clock_timestamp();
  phase := edra_private.exam_phase(target, at_now);
  return edra_private.my_exam_overview_json(target, phase, record_id, at_now);
end;
$$;

-- Academy-scoped start/resume. Repeated or concurrent calls return the same single attempt.
-- Returns the existing engine's student state (questions only for the active attempt).
create or replace function public.start_my_exam(p_academy_id uuid, p_exam_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  record_id uuid;
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'forbidden'; end if;
  if p_academy_id is null or p_exam_id is null then raise exception using errcode = 'P0001', message = 'validation'; end if;
  if not exists (select 1 from public.exams z where z.id = p_exam_id and z.academy_id = p_academy_id) then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  record_id := edra_private.require_exam_student(p_exam_id, true);
  perform edra_private.charge_mutation_quota('op:exam_answer');
  return edra_private.start_my_exam_for(p_exam_id, record_id);
end;
$$;

-- The existing unscoped start wrapper takes the same serialized standalone guard.
create or replace function public.start_exam_attempt(p_exam_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  record_id uuid := edra_private.require_exam_student(p_exam_id, true);
begin
  perform edra_private.charge_mutation_quota('op:exam_answer');
  return edra_private.start_my_exam_for(p_exam_id, record_id);
end;
$$;

revoke all on function edra_private.my_exam_record(uuid) from public, anon, authenticated;
revoke all on function edra_private.exam_attached(uuid) from public, anon, authenticated;
revoke all on function edra_private.exam_record_participated(uuid, uuid) from public, anon, authenticated;
revoke all on function edra_private.my_exam_discoverable(public.exams, text, uuid) from public, anon, authenticated;
revoke all on function edra_private.my_exam_action(public.exams, text, uuid, timestamptz) from public, anon, authenticated;
revoke all on function edra_private.exam_official_result_json(uuid, uuid) from public, anon, authenticated;
revoke all on function edra_private.my_exam_overview_json(public.exams, text, uuid, timestamptz) from public, anon, authenticated;
revoke all on function edra_private.exam_content_access(uuid, uuid) from public, anon, authenticated;
revoke all on function edra_private.exam_student_state(uuid, uuid) from public, anon, authenticated;
revoke all on function edra_private.start_my_exam_for(uuid, uuid) from public, anon, authenticated;

revoke all on function public.list_my_exams(uuid, integer, integer) from public, anon;
revoke all on function public.get_my_exam_overview(uuid, uuid) from public, anon;
revoke all on function public.start_my_exam(uuid, uuid) from public, anon;
revoke all on function public.start_exam_attempt(uuid) from public, anon;
grant execute on function public.list_my_exams(uuid, integer, integer) to authenticated;
grant execute on function public.get_my_exam_overview(uuid, uuid) to authenticated;
grant execute on function public.start_my_exam(uuid, uuid) to authenticated;
grant execute on function public.start_exam_attempt(uuid) to authenticated;
