-- EDRA-235: finalized exam work review, released solutions and their images.
--
-- get_my_exam_review(academy, exam) is the read-only review for the exam detail page. It resolves
-- the caller's record of the academy's open year in the database (the academy id only locates),
-- applies the overview's discoverability rule (own participation; attached exams are not_found),
-- settles due work after authorization and returns normally so the settlement commits. It never
-- starts an attempt, claims or renews an editor, moves a deadline or grants a retake.
--
-- Qualification is the live edra_private.exam_solutions_available predicate: accepted online work at
-- actual closure; accepted physical work at actual closure plus an announced result, in either order.
-- Before qualification the response carries a status reason only (no parts, questions, answers, keys,
-- model answers or notes). After qualification it returns, field by field: parts and questions in
-- authored order with original numbering, prompts, choices, excluded state, the answer frozen in the
-- accepted submission (never a draft, never the losing source), the current correct choice and model
-- answer, and the exam's solution notes. Never maxima, awarded marks, feedback, scorers or revisions;
-- the official total stays in the overview (exam_official_result_json).
--
-- Answer states: choice | text | blank | paper_work. Physical Written Work is marked by hand and has
-- no transcription, so it is paper_work rather than a blank online response.
--
-- authorize_my_exam_review_images(academy, exam, ids) authorizes at most 20 image ids referenced by
-- the qualified review document (prompts, choices, model answers, solution notes) for the trusted
-- server signer; it needs no editor token and never accepts a path.
--
-- The legacy direct-RPC projection (get_my_exam, start_exam_attempt, start_my_exam) keeps its shape
-- but, once qualified, no longer returns question maxima, departure details or a losing online draft:
-- attempt answers are the accepted online submission's frozen answers, and empty when paper work won.

-- ---------------------------------------------------------------------------------------------
-- Private helpers.

-- The caller's record for a review read: ordinary authenticated student of the academy's open year,
-- exam of that academy and year, discoverable (own participation or a current opportunity).
create or replace function edra_private.my_exam_review_record(p_academy_id uuid, p_exam_id uuid)
returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  record_id uuid;
  target public.exams%rowtype;
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'forbidden'; end if;
  if p_academy_id is null or p_exam_id is null then raise exception using errcode = 'P0001', message = 'validation'; end if;
  record_id := edra_private.my_exam_record(p_academy_id);
  if record_id is null then raise exception using errcode = 'P0001', message = 'student_link_unavailable'; end if;
  select z.* into target from public.exams z join public.annual_student_records r on r.id = record_id
  where z.id = p_exam_id and z.academy_id = p_academy_id and z.academic_year_id = r.academic_year_id;
  if not found or not edra_private.my_exam_discoverable(target, edra_private.exam_phase(target, clock_timestamp()), record_id) then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  return record_id;
end;
$$;

-- The review document. Stable, so every statement reads one snapshot: qualification and material
-- always agree.
create or replace function edra_private.exam_review_json(p_exam_id uuid, p_record_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  at_now timestamptz := clock_timestamp();
  target public.exams%rowtype;
  work public.exam_work%rowtype;
  accepted public.exam_submissions%rowtype;
  base jsonb := jsonb_build_object('account_id', auth.uid(), 'server_now', at_now);
begin
  select z.* into target from public.exams z where z.id = p_exam_id;
  if not found then raise exception using errcode = 'P0001', message = 'not_found'; end if;
  select w.* into work from public.exam_work w where w.exam_id = p_exam_id and w.annual_student_record_id = p_record_id;
  if work.accepted_submission_id is null then
    return base || jsonb_build_object('status', 'unavailable', 'reason', 'not_submitted');
  end if;
  if not edra_private.exam_solutions_available(target, p_record_id, at_now) then
    return base || jsonb_build_object('status', 'unavailable', 'reason',
      case when target.actual_closes_at is null or at_now < target.actual_closes_at then 'awaiting_closure' else 'awaiting_result' end);
  end if;
  select s.* into accepted from public.exam_submissions s
  where s.id = work.accepted_submission_id and s.exam_id = p_exam_id and s.annual_student_record_id = p_record_id;
  return base || jsonb_build_object(
    'status', 'available',
    'source', accepted.source,
    'notes', target.solution_notes,
    'parts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pt.id, 'title', pt.title, 'instructions', pt.instructions, 'kind', pt.kind,
        'questions', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', q.id, 'number', n.number, 'prompt', q.prompt, 'excluded', q.excluded_at is not null,
            'choices', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'label', c.label) order by c.position)
              from public.exam_choices c where c.question_id = q.id), '[]'::jsonb),
            'answer', case
              when pt.kind = 'question_sheet' then
                case when sa.choice_id is not null then jsonb_build_object('state', 'choice', 'choice_id', sa.choice_id)
                  else jsonb_build_object('state', 'blank') end
              when accepted.source = 'physical' then jsonb_build_object('state', 'paper_work')
              when nullif(btrim(sa.text_answer), '') is not null then jsonb_build_object('state', 'text', 'text', sa.text_answer)
              else jsonb_build_object('state', 'blank')
            end,
            'correct_choice_id', (select c.id from public.exam_choices c where c.question_id = q.id and c.is_correct),
            'model_answer', q.model_answer
          ) order by q.position)
          from public.exam_questions q
          join (
            select x.id, row_number() over (order by xp.position, x.position) as number
            from public.exam_questions x join public.exam_parts xp on xp.id = x.part_id where x.exam_id = p_exam_id
          ) n on n.id = q.id
          left join public.exam_submission_answers sa on sa.submission_id = accepted.id and sa.question_id = q.id
          where q.part_id = pt.id
        ), '[]'::jsonb)
      ) order by pt.position)
      from public.exam_parts pt where pt.exam_id = p_exam_id
    ), '[]'::jsonb)
  );
end;
$$;

-- The subset of p_image_ids referenced by the qualified review document. Paths are built by the
-- trusted signer from the returned academy id.
create or replace function edra_private.authorize_my_exam_review_images_for(p_exam_id uuid, p_record_id uuid, p_image_ids uuid[])
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  target public.exams%rowtype;
begin
  if p_image_ids is null or cardinality(p_image_ids) not between 1 and 20 or array_position(p_image_ids, null) is not null then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  select z.* into target from public.exams z where z.id = p_exam_id;
  if not found then raise exception using errcode = 'P0001', message = 'not_found'; end if;
  if not edra_private.exam_solutions_available(target, p_record_id, clock_timestamp()) then
    return jsonb_build_object('status', 'unavailable');
  end if;
  return jsonb_build_object('status', 'ok', 'academy_id', target.academy_id, 'image_ids', coalesce((
    select jsonb_agg(distinct i) from unnest(p_image_ids) i
    where strpos(target.solution_notes, '{{image:' || i::text || '}}') > 0
      or exists (
        select 1 from public.exam_questions q
        where q.exam_id = target.id
          and (strpos(q.prompt, '{{image:' || i::text || '}}') > 0
            or strpos(q.model_answer, '{{image:' || i::text || '}}') > 0
            or exists (select 1 from public.exam_choices c where c.question_id = q.id and strpos(c.label, '{{image:' || i::text || '}}') > 0))
      )), '[]'::jsonb));
end;
$$;

-- Legacy direct-RPC projection. Before qualification: unchanged (no material). After qualification:
-- question maxima and departure details are dropped, and attempt answers are the accepted online
-- submission's frozen answers (empty when physical work was accepted).
create or replace function edra_private.exam_public_state(p_exam_id uuid, p_record_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when jsonb_typeof(s->'solutions') = 'object' then
      s || jsonb_build_object('parts', coalesce((
          select jsonb_agg((p - 'questions') || jsonb_build_object('questions', coalesce((
              select jsonb_agg(q - 'max_score' order by qo) from jsonb_array_elements(p->'questions') with ordinality q_list(q, qo)
            ), '[]'::jsonb)) order by po)
          from jsonb_array_elements(s->'parts') with ordinality p_list(p, po)
        ), '[]'::jsonb))
      || case when jsonb_typeof(s->'attempt') = 'object' then jsonb_build_object('attempt', (s->'attempt') || jsonb_build_object(
          'answers', case when w.accepted_source = 'online' then coalesce((
              select jsonb_agg(jsonb_build_object('question_id', sa.question_id, 'choice_id', sa.choice_id, 'text_answer', sa.text_answer)
                order by sa.question_id)
              from public.exam_submission_answers sa where sa.submission_id = w.accepted_submission_id
            ), '[]'::jsonb) else '[]'::jsonb end,
          'departures', '[]'::jsonb))
        else '{}'::jsonb end
    else s || jsonb_build_object('parts', '[]'::jsonb, 'excluded_question_ids', '[]'::jsonb)
      || case when jsonb_typeof(s->'attempt') = 'object'
        then jsonb_build_object('attempt', (s->'attempt') || jsonb_build_object('answers', '[]'::jsonb, 'departures', '[]'::jsonb))
        else '{}'::jsonb end
  end
  from (select edra_private.exam_student_state(p_exam_id, p_record_id) as s) state
  left join public.exam_work w on w.exam_id = p_exam_id and w.annual_student_record_id = p_record_id;
$$;

-- ---------------------------------------------------------------------------------------------
-- Public student entry points (cookie web boundary; authenticated only).

-- Read-only review. Authorize, settle due work, then build the document from one fresh snapshot.
create or replace function public.get_my_exam_review(p_academy_id uuid, p_exam_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  record_id uuid := edra_private.my_exam_review_record(p_academy_id, p_exam_id);
begin
  perform edra_private.settle_exam_if_due(p_exam_id);
  return edra_private.exam_review_json(p_exam_id, record_id);
end;
$$;

create or replace function public.authorize_my_exam_review_images(p_academy_id uuid, p_exam_id uuid, p_image_ids uuid[])
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  record_id uuid := edra_private.my_exam_review_record(p_academy_id, p_exam_id);
begin
  perform edra_private.charge_mutation_quota('op:exam_image');
  return edra_private.authorize_my_exam_review_images_for(p_exam_id, record_id, p_image_ids);
end;
$$;

revoke all on function edra_private.my_exam_review_record(uuid, uuid) from public, anon, authenticated;
revoke all on function edra_private.exam_review_json(uuid, uuid) from public, anon, authenticated;
revoke all on function edra_private.authorize_my_exam_review_images_for(uuid, uuid, uuid[]) from public, anon, authenticated;
revoke all on function edra_private.exam_public_state(uuid, uuid) from public, anon, authenticated;

revoke all on function public.get_my_exam_review(uuid, uuid) from public, anon;
revoke all on function public.authorize_my_exam_review_images(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.get_my_exam_review(uuid, uuid) to authenticated;
grant execute on function public.authorize_my_exam_review_images(uuid, uuid, uuid[]) to authenticated;
