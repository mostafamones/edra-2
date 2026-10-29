-- Staff Assessments list: the `program` audience filter is program-wide, covering whole-level and
-- level-and-track audiences. Read-only; signature, authority, counts and order are unchanged.

create or replace function public.list_assessments(
  p_academy_id uuid, p_academic_year_id uuid, p_types text[], p_search text, p_audience text,
  p_include_archived boolean, p_sort text, p_limit integer, p_offset integer
)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  at_now timestamptz := clock_timestamp();
  needle text := lower(btrim(coalesce(p_search, '')));
  result jsonb;
begin
  if auth.uid() is null or p_academy_id is null or not public.is_academy_member(p_academy_id) then return null; end if;
  if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset < 0
    or p_types is null or cardinality(p_types) = 0 or not (p_types <@ array['assignment', 'quiz', 'exam'])
    or (p_audience is not null and p_audience <> all (array['level', 'program', 'groups']))
    or p_sort is null or p_sort <> all (array['newest', 'title'])
    or p_include_archived is null
    or char_length(coalesce(p_search, '')) > 200 then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  with items as (
    select 'assignment'::text as type, a.id, a.title, a.academic_year_id, a.audience::text as audience, a.level_id, a.track_id,
      a.state::text as status, a.due_at, null::timestamptz as opens_at, null::timestamptz as closes_at, a.created_at
    from public.assignments a
    where 'assignment' = any(p_types) and a.academy_id = p_academy_id
      and (p_academic_year_id is null or a.academic_year_id = p_academic_year_id)
      and (p_audience is null or a.audience::text = p_audience or (p_audience = 'program' and a.audience::text = 'level'))
      and (needle = '' or strpos(lower(a.title), needle) > 0)
    union all
    select 'quiz', z.id, z.title, z.academic_year_id, z.audience::text, z.level_id, z.track_id,
      edra_private.quiz_phase(z, at_now), null, z.opens_at, z.closes_at, z.created_at
    from public.quizzes z
    where 'quiz' = any(p_types) and z.academy_id = p_academy_id
      and (p_academic_year_id is null or z.academic_year_id = p_academic_year_id)
      and (p_audience is null or z.audience::text = p_audience or (p_audience = 'program' and z.audience::text = 'level'))
      and (needle = '' or strpos(lower(z.title), needle) > 0)
    union all
    select 'exam', x.id, x.title, x.academic_year_id, x.audience::text, x.level_id, x.track_id,
      edra_private.exam_phase(x, at_now), null, x.opens_at, x.closes_at, x.created_at
    from public.exams x
    where 'exam' = any(p_types) and x.academy_id = p_academy_id
      and (p_academic_year_id is null or x.academic_year_id = p_academic_year_id)
      and (p_audience is null or x.audience::text = p_audience or (p_audience = 'program' and x.audience::text = 'level'))
      and (needle = '' or strpos(lower(x.title), needle) > 0)
  ),
  filtered as (
    select i.* from items i where p_include_archived or i.status <> 'archived'
  ),
  page as (
    select f.*, row_number() over (order by
      case when p_sort = 'title' then lower(f.title) end, case when p_sort = 'title' then f.title end,
      f.created_at desc, f.type, f.id) as position
    from filtered f
    order by position
    limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'type', p.type, 'id', p.id, 'title', p.title, 'academic_year_id', p.academic_year_id, 'audience', p.audience,
        'level_id', p.level_id, 'track_id', p.track_id,
        'group_ids', coalesce(case p.type
          when 'assignment' then (select jsonb_agg(g.group_id order by g.group_id) from public.assignment_audience_groups g where g.assignment_id = p.id)
          when 'quiz' then (select jsonb_agg(g.group_id order by g.group_id) from public.quiz_audience_groups g where g.quiz_id = p.id)
          else (select jsonb_agg(g.group_id order by g.group_id) from public.exam_audience_groups g where g.exam_id = p.id)
        end, '[]'::jsonb),
        'status', p.status, 'due_at', p.due_at, 'opens_at', p.opens_at, 'closes_at', p.closes_at, 'created_at', p.created_at,
        -- The same maxima the per-type lists show: assignment max_score, quiz/exam total of non-excluded questions.
        'max_score', (case p.type
          when 'assignment' then (select a.max_score from public.assignments a where a.id = p.id)
          when 'quiz' then coalesce((select sum(q.max_score) from public.quiz_questions q where q.quiz_id = p.id and q.excluded_at is null), 0)
          else coalesce((select sum(q.max_score) from public.exam_questions q where q.exam_id = p.id and q.excluded_at is null), 0)
        end)::text,
        -- The workspace counts: students with every part/question marked, of the assessment's audience
        -- (assignments: active required cohort plus optional eligible; quizzes/exams: current eligible students).
        'marked_count', case p.type
          when 'assignment' then (select count(*) from public.assignment_recipients x where x.assignment_id = p.id
            and not exists (select 1 from public.assignment_parts pt where pt.assignment_id = p.id
              and not edra_private.assignment_part_complete(p.id, x.annual_student_record_id, pt.id)))
          when 'quiz' then (select count(*) from public.quiz_work w where w.quiz_id = p.id and w.accepted_submission_id is not null
            and (edra_private.quiz_result_content(p.id, w.annual_student_record_id)->>'complete')::boolean)
          else (select count(*) from public.exam_work w where w.exam_id = p.id and w.accepted_submission_id is not null
            and (edra_private.exam_result_content(p.id, w.annual_student_record_id)->>'complete')::boolean)
        end,
        'audience_count', case p.type
          when 'assignment' then (select (c->>'current_required_count')::integer + (c->>'optional_eligible_count')::integer
            from edra_private.assignment_cohort_context(p.id) c)
          when 'quiz' then (select count(*) from edra_private.quiz_audience_records(p.id))
          else (select count(*) from edra_private.exam_audience_records(p.id))
        end,
        'processing_pending', case p.type
          when 'quiz' then edra_private.quiz_has_due_work(p.id)
          when 'exam' then edra_private.exam_has_due_work(p.id)
          else false
        end
      ) order by p.position)
      from page p
    ), '[]'::jsonb),
    'server_now', at_now
  ) into result;
  return result;
end;
$$;

revoke all on function public.list_assessments(uuid, uuid, text[], text, text, boolean, text, integer, integer) from public, anon;
grant execute on function public.list_assessments(uuid, uuid, text[], text, text, boolean, text, integer, integer) to authenticated;
