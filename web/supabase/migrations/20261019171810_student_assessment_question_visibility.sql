-- Task 4 / R01: one qualification predicate drives solution effects and both material projections.
-- Public wrappers continue to resolve the caller through student_caller_record. These record-based
-- functions remain private. A read never starts an attempt, resets its deadline or grants a retake.

create or replace function edra_private.quiz_solutions_available(
  p_target public.quizzes, p_record_id uuid, p_at timestamptz
)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_target.actual_closes_at is not null and p_at >= p_target.actual_closes_at and exists (
    select 1 from public.quiz_work w
    where w.quiz_id = p_target.id and w.annual_student_record_id = p_record_id
      and w.accepted_submission_id is not null
      and (w.accepted_source = 'online' or (w.accepted_source = 'physical' and w.published_revision > 0))
  );
$$;

create or replace function edra_private.refresh_quiz_qualification(p_target public.quizzes, p_record_id uuid, p_at timestamptz)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if edra_private.quiz_solutions_available(p_target, p_record_id, p_at) then
    perform edra_private.qualify_quiz_solutions(p_target, p_record_id, p_at);
  end if;
end;
$$;

create or replace function edra_private.quiz_student_state(p_quiz_id uuid, p_record_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'quiz_id', z.id, 'title', z.title, 'instructions', z.instructions,
    'server_now', clock_timestamp(),
    'opens_at', z.opens_at, 'closes_at', z.closes_at, 'actual_closes_at', z.actual_closes_at,
    'time_limit_minutes', z.time_limit_minutes,
    'phase', edra_private.quiz_phase(z, clock_timestamp()),
    'eligible', edra_private.quiz_is_eligible(z.id, p_record_id),
    'excluded_question_ids', case when reveal.questions then coalesce((select jsonb_agg(x.id order by x.id) from public.quiz_questions x where x.quiz_id = z.id and x.excluded_at is not null), '[]'::jsonb) else '[]'::jsonb end,
    'parts', case when reveal.questions then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pt.id, 'position', pt.position, 'title', pt.title, 'instructions', pt.instructions, 'kind', pt.kind,
        'questions', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', qq.id, 'position', qq.position, 'prompt', qq.prompt, 'max_score', qq.max_score::text,
            'excluded', qq.excluded_at is not null,
            'choices', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'position', c.position, 'label', c.label) order by c.position)
              from public.quiz_choices c where c.question_id = qq.id), '[]'::jsonb)
          ) order by qq.position) from public.quiz_questions qq where qq.part_id = pt.id
        ), '[]'::jsonb)
      ) order by pt.position) from public.quiz_parts pt where pt.quiz_id = z.id
    ), '[]'::jsonb) else '[]'::jsonb end,
    'attempt', (select jsonb_build_object(
        'started_at', a.started_at, 'deadline_at', a.deadline_at,
        'cutoff_at', least(a.deadline_at, z.actual_closes_at),
        'answers_version', a.answers_version, 'departure_count', a.departure_count,
        'finalized_at', a.finalized_at, 'finalization_reason', a.finalization_reason, 'superseded', a.superseded_at is not null,
        'answers', coalesce((select jsonb_agg(jsonb_build_object('question_id', o.question_id, 'choice_id', o.choice_id, 'text_answer', o.text_answer)
          order by o.question_id) from public.quiz_online_answers o where o.attempt_id = a.id), '[]'::jsonb)
      ) from public.quiz_attempts a where a.quiz_id = z.id and a.annual_student_record_id = p_record_id),
    'submission', (select jsonb_build_object('source', s.source, 'reason', s.reason, 'submitted_at', s.submitted_at,
        'original_deadline_at', s.original_deadline_at)
      from public.quiz_work w join public.quiz_submissions s on s.id = w.accepted_submission_id
      where w.quiz_id = z.id and w.annual_student_record_id = p_record_id),
    -- Only the latest official revision; private marks and draft scores are never included.
    'result', (select jsonb_build_object('revision', p.revision, 'total', p.total::text, 'max_score', p.max_score::text,
        'feedback', p.feedback, 'items', p.items, 'published_at', p.published_at)
      from public.quiz_work w join public.quiz_result_publications p on p.quiz_id = w.quiz_id
        and p.annual_student_record_id = w.annual_student_record_id and p.revision = w.published_revision
      where w.quiz_id = z.id and w.annual_student_record_id = p_record_id),
    -- Solutions only once qualified: an accepted online submission at actual closure, or accepted
    -- physical work at actual closure with an announced result.
    'solutions', case when reveal.solutions then jsonb_build_object(
        'notes', z.solution_notes,
        'questions', coalesce((select jsonb_agg(jsonb_build_object(
            'question_id', qq.id, 'model_answer', qq.model_answer,
            'correct_choice_id', (select c.id from public.quiz_choices c where c.question_id = qq.id and c.is_correct)
          ) order by qq.id) from public.quiz_questions qq where qq.quiz_id = z.id), '[]'::jsonb)
      ) end
  )
  from public.quizzes z
  cross join lateral (select edra_private.quiz_solutions_available(z, p_record_id, clock_timestamp()) as solutions) qualified
  cross join lateral (select qualified.solutions, qualified.solutions or exists (
    select 1 from public.quiz_attempts a
    where a.quiz_id = z.id and a.annual_student_record_id = p_record_id and a.started_at is not null
  ) as questions) reveal
  where z.id = p_quiz_id;
$$;

revoke all on function edra_private.quiz_solutions_available(public.quizzes, uuid, timestamptz) from public, anon, authenticated;
revoke all on function edra_private.quiz_student_state(uuid, uuid) from public, anon, authenticated;
revoke all on function edra_private.refresh_quiz_qualification(public.quizzes, uuid, timestamptz) from public, anon, authenticated;

create or replace function edra_private.exam_solutions_available(
  p_target public.exams, p_record_id uuid, p_at timestamptz
)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_target.actual_closes_at is not null and p_at >= p_target.actual_closes_at and exists (
    select 1 from public.exam_work w
    where w.exam_id = p_target.id and w.annual_student_record_id = p_record_id
      and w.accepted_submission_id is not null
      and (w.accepted_source = 'online' or (w.accepted_source = 'physical' and w.published_revision > 0))
  );
$$;

create or replace function edra_private.refresh_exam_qualification(p_target public.exams, p_record_id uuid, p_at timestamptz)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if edra_private.exam_solutions_available(p_target, p_record_id, p_at) then
    perform edra_private.qualify_exam_solutions(p_target, p_record_id, p_at);
  end if;
end;
$$;

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
        'answers', coalesce((select jsonb_agg(jsonb_build_object('question_id', o.question_id, 'choice_id', o.choice_id, 'text_answer', o.text_answer)
          order by o.question_id) from public.exam_online_answers o where o.attempt_id = a.id), '[]'::jsonb),
        'departures', coalesce((select jsonb_agg(edra_private.exam_departure_json(d) order by d.ordinal)
          from public.exam_departures d where d.attempt_id = a.id), '[]'::jsonb)
      ) from public.exam_attempts a where a.exam_id = z.id and a.annual_student_record_id = p_record_id),
    'submission', (select jsonb_build_object('source', s.source, 'reason', s.reason, 'submitted_at', s.submitted_at,
        'processed_at', s.processed_at, 'original_deadline_at', s.original_deadline_at)
      from public.exam_work w join public.exam_submissions s on s.id = w.accepted_submission_id
      where w.exam_id = z.id and w.annual_student_record_id = p_record_id),
    -- Only the latest official revision; private marks and draft scores are never included.
    'result', (select jsonb_build_object('revision', p.revision, 'total', p.total::text, 'max_score', p.max_score::text,
        'feedback', p.feedback, 'items', p.items, 'published_at', p.published_at)
      from public.exam_work w join public.exam_result_publications p on p.exam_id = w.exam_id
        and p.annual_student_record_id = w.annual_student_record_id and p.revision = w.published_revision
      where w.exam_id = z.id and w.annual_student_record_id = p_record_id),
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
    where a.exam_id = z.id and a.annual_student_record_id = p_record_id and a.started_at is not null
  ) as questions) reveal
  where z.id = p_exam_id;
$$;

revoke all on function edra_private.exam_solutions_available(public.exams, uuid, timestamptz) from public, anon, authenticated;
revoke all on function edra_private.exam_student_state(uuid, uuid) from public, anon, authenticated;
revoke all on function edra_private.refresh_exam_qualification(public.exams, uuid, timestamptz) from public, anon, authenticated;

