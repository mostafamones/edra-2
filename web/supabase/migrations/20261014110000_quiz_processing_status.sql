-- Quiz refinement 3: list and detail report whether due work still awaits processing, without a
-- write in a STABLE read. The phase stays time-derived; processing_pending is the separate fact.

create or replace function public.list_quizzes(
  p_academy_id uuid, p_academic_year_id uuid, p_search text, p_phase text, p_audience public.quiz_audience,
  p_include_archived boolean, p_limit integer, p_offset integer
)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  at_now timestamptz := clock_timestamp();
  result jsonb;
begin
  if auth.uid() is null or p_academy_id is null or not public.is_academy_member(p_academy_id) then return null; end if;
  if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset < 0
    or (p_phase is not null and p_phase <> all (array['preparing', 'ready', 'scheduled', 'open', 'headroom', 'closed', 'archived']))
    or char_length(coalesce(p_search, '')) > 200 then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  with base as (
    select z.*, edra_private.quiz_phase(z, at_now) as phase from public.quizzes z
    where z.academy_id = p_academy_id
      and (p_academic_year_id is null or z.academic_year_id = p_academic_year_id)
      and (p_audience is null or z.audience = p_audience)
      and (coalesce(p_search, '') = '' or strpos(lower(z.title), lower(btrim(p_search))) > 0)
  ),
  filtered as (
    select b.* from base b
    where case when p_phase is not null then b.phase = p_phase else (p_include_archived or b.phase <> 'archived') end
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'academic_year_id', f.academic_year_id, 'title', f.title, 'audience', f.audience,
        'level_id', f.level_id, 'track_id', f.track_id,
        'group_ids', coalesce((select jsonb_agg(g.group_id order by g.group_id) from public.quiz_audience_groups g where g.quiz_id = f.id), '[]'::jsonb),
        'time_limit_minutes', f.time_limit_minutes, 'opens_at', f.opens_at, 'closes_at', f.closes_at, 'actual_closes_at', f.actual_closes_at,
        'max_score', f.max_score::text,
        'effective_max_score', coalesce((select sum(q.max_score) from public.quiz_questions q where q.quiz_id = f.id and q.excluded_at is null), 0)::text,
        'question_count', f.question_count, 'phase', f.phase, 'updated_at', f.updated_at,
        'submitted', (select count(*) from public.quiz_work w where w.quiz_id = f.id and w.accepted_submission_id is not null),
        'in_progress', (select count(*) from public.quiz_attempts a where a.quiz_id = f.id and a.finalized_at is null and a.superseded_at is null),
        'announced', (select count(*) from public.quiz_work w where w.quiz_id = f.id and w.published_revision > 0),
        'processing_pending', edra_private.quiz_has_due_work(f.id),
        'closure_settled_at', (select c.settled_at from public.quiz_closures c where c.quiz_id = f.id)
      ) order by f.created_at desc, f.id)
      from (select * from filtered order by created_at desc, id limit p_limit offset p_offset) f
    ), '[]'::jsonb),
    'server_now', at_now
  ) into result;
  return result;
end;
$$;

create or replace function edra_private.quiz_json(p_quiz_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select (
    select jsonb_build_object(
      'id', z.id, 'academy_id', z.academy_id, 'academic_year_id', z.academic_year_id,
      'title', z.title, 'instructions', z.instructions, 'solution_notes', z.solution_notes,
      'audience', z.audience, 'level_id', z.level_id, 'track_id', z.track_id,
      'group_ids', coalesce((select jsonb_agg(g.group_id order by g.group_id) from public.quiz_audience_groups g where g.quiz_id = z.id), '[]'::jsonb),
      'time_limit_minutes', z.time_limit_minutes,
      'opens_at', z.opens_at, 'closes_at', z.closes_at, 'actual_closes_at', z.actual_closes_at,
      'max_score', z.max_score::text,
      'effective_max_score', coalesce((select sum(q.max_score) from public.quiz_questions q where q.quiz_id = z.id and q.excluded_at is null), 0)::text,
      'question_count', z.question_count,
      'version', z.version, 'scoring_revision', z.scoring_revision,
      'work_started_at', z.work_started_at, 'structure_locked_at', z.structure_locked_at,
      'closure_settled_at', (select c.settled_at from public.quiz_closures c where c.quiz_id = z.id),
      'processing_pending', edra_private.quiz_has_due_work(z.id),
      'created_by', z.created_by, 'created_at', z.created_at, 'updated_by', z.updated_by, 'updated_at', z.updated_at,
      'archived_at', z.archived_at,
      'year_open', exists (select 1 from public.academic_years y where y.id = z.academic_year_id and y.closed_at is null),
      'ready', edra_private.quiz_ready(z.id),
      'issues', edra_private.quiz_issues(z.id),
      'phase', edra_private.quiz_phase(z, clock_timestamp()),
      'server_now', clock_timestamp(),
      'fully_automatic', edra_private.quiz_fully_automatic(z.id),
      'counts', jsonb_build_object(
        'eligible', (select count(*) from edra_private.quiz_audience_records(z.id)),
        'started', (select count(*) from public.quiz_attempts a where a.quiz_id = z.id),
        'in_progress', (select count(*) from public.quiz_attempts a where a.quiz_id = z.id and a.finalized_at is null and a.superseded_at is null),
        'submitted', (select count(*) from public.quiz_work w where w.quiz_id = z.id and w.accepted_submission_id is not null),
        'announced', (select count(*) from public.quiz_work w where w.quiz_id = z.id and w.published_revision > 0)
      ),
      'corrections', coalesce((
        select jsonb_agg(jsonb_build_object(
          'revision', k.revision, 'kind', k.kind, 'question_id', k.question_id, 'previous_choice_id', k.previous_choice_id,
          'choice_id', k.choice_id, 'created_by', k.created_by, 'created_at', k.created_at
        ) order by k.revision) from public.quiz_corrections k where k.quiz_id = z.id
      ), '[]'::jsonb),
      'parts', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', p.id, 'position', p.position, 'title', p.title, 'instructions', p.instructions, 'kind', p.kind,
          'questions', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', q.id, 'position', q.position, 'number', n.number, 'prompt', q.prompt, 'model_answer', q.model_answer,
              'max_score', q.max_score::text, 'excluded', q.excluded_at is not null, 'excluded_at', q.excluded_at,
              'choices', coalesce((
                select jsonb_agg(jsonb_build_object('id', c.id, 'position', c.position, 'label', c.label, 'is_correct', c.is_correct) order by c.position)
                from public.quiz_choices c where c.question_id = q.id
              ), '[]'::jsonb)
            ) order by q.position)
            from public.quiz_questions q
            join (
              select q2.id, row_number() over (order by p2.position, q2.position) as number
              from public.quiz_questions q2 join public.quiz_parts p2 on p2.id = q2.part_id where q2.quiz_id = z.id
            ) n on n.id = q.id
            where q.part_id = p.id
          ), '[]'::jsonb)
        ) order by p.position)
        from public.quiz_parts p where p.quiz_id = z.id
      ), '[]'::jsonb)
    )
    from public.quizzes z where z.id = p_quiz_id
  );
$$;
