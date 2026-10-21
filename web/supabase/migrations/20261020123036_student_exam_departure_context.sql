-- Loading may have no displayed question. Historical question context remains immutable.
alter table public.exam_departures alter column question_id drop not null;
alter table public.exam_departures alter column question_number drop not null;
alter table public.exam_departures add constraint exam_departures_context_pair
  check ((question_id is null) = (question_number is null));

create or replace function edra_private.record_exam_departure_for(p_exam_id uuid, p_record_id uuid, p_event_id uuid, p_question_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  target public.exams%rowtype;
  work public.exam_work%rowtype;
  attempt public.exam_attempts%rowtype;
  existing public.exam_departures%rowtype;
  recorded public.exam_departures%rowtype;
  current_number integer;
  next_question uuid;
  next_ordinal integer;
  t_now timestamptz;
begin
  if p_event_id is null then raise exception using errcode = 'P0001', message = 'validation'; end if;
  perform edra_private.settle_exam_if_due(p_exam_id);
  target := edra_private.lock_exam_by_id(p_exam_id, false);
  perform edra_private.require_open_exam_year(target.academy_id, target.academic_year_id);
  perform edra_private.lock_exam_record(target, p_record_id);
  -- A due timer or closure wins over the departure.
  perform edra_private.settle_exam_record(target, p_record_id);
  work := edra_private.lock_exam_work(target, p_record_id, false);
  select a.* into attempt from public.exam_attempts a
  where a.exam_id = target.id and a.annual_student_record_id = p_record_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'not_open'; end if;
  -- A retried event returns its original outcome; reusing an event id for another question conflicts.
  select d.* into existing from public.exam_departures d where d.attempt_id = attempt.id and d.event_id = p_event_id;
  if found then
    if existing.question_id is distinct from p_question_id then raise exception using errcode = 'P0001', message = 'idempotency_conflict'; end if;
    return jsonb_build_object('outcome', 'duplicate', 'departure', edra_private.exam_departure_json(existing),
      'state', edra_private.exam_student_state(target.id, p_record_id));
  end if;
  -- The question must belong to this exam.
  select n.number into current_number from (
    select q.id, row_number() over (order by p.position, q.position) as number
    from public.exam_questions q join public.exam_parts p on p.id = q.part_id where q.exam_id = target.id
  ) n where n.id = p_question_id;
  if p_question_id is not null and current_number is null then raise exception using errcode = 'P0001', message = 'unknown_question'; end if;
  -- Returned rather than raised so a settlement above commits.
  if attempt.finalized_at is not null or attempt.superseded_at is not null then
    return jsonb_build_object('outcome', 'finalized', 'departure', null, 'state', edra_private.exam_student_state(target.id, p_record_id));
  end if;
  t_now := clock_timestamp();
  if t_now >= least(attempt.deadline_at, target.actual_closes_at) then
    perform edra_private.settle_exam_record(target, p_record_id);
    return jsonb_build_object('outcome', 'finalized', 'departure', null, 'state', edra_private.exam_student_state(target.id, p_record_id));
  end if;
  next_ordinal := attempt.departure_count + 1;
  if next_ordinal < 3 then
    select n.id into next_question from (
      select q.id, q.excluded_at, row_number() over (order by p.position, q.position) as number
      from public.exam_questions q join public.exam_parts p on p.id = q.part_id where q.exam_id = target.id
    ) n where n.number > coalesce(current_number, 0) and n.excluded_at is null
    order by n.number limit 1;
  end if;
  insert into public.exam_departures (
    attempt_id, event_id, academy_id, exam_id, ordinal, question_id, question_number, outcome, next_question_id, recorded_at
  ) values (
    attempt.id, p_event_id, target.academy_id, target.id, next_ordinal, p_question_id, current_number,
    case when next_ordinal >= 3 then 'kicked' else 'warned' end, next_question, t_now
  ) returning * into recorded;
  update public.exam_attempts set departure_count = next_ordinal where id = attempt.id;
  perform edra_private.mark_exam_activity(target, true);
  if next_ordinal >= 3 then
    if work.accepted_submission_id is null then
      perform edra_private.accept_exam_submission(target, p_record_id, 'online', 'kicked', t_now, t_now);
    end if;
    return jsonb_build_object('outcome', 'kicked', 'departure', edra_private.exam_departure_json(recorded),
      'state', edra_private.exam_student_state(target.id, p_record_id));
  end if;
  return jsonb_build_object('outcome', 'warned', 'departure', edra_private.exam_departure_json(recorded),
    'state', edra_private.exam_student_state(target.id, p_record_id));
end;
$$;

create or replace function edra_private.record_my_exam_departure_for(p_exam_id uuid, p_record_id uuid, p_token text, p_event_id uuid, p_question_id uuid, p_generation integer)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  target public.exams%rowtype;
  attempt public.exam_attempts%rowtype;
  editor text := null;
  result jsonb;
begin
  if p_generation is null or p_generation < 1 or p_event_id is null then raise exception using errcode = 'P0001', message = 'validation'; end if;
  perform edra_private.settle_exam_if_due(p_exam_id);
  target := edra_private.lock_exam_by_id(p_exam_id, false);
  perform edra_private.require_open_exam_year(target.academy_id, target.academic_year_id);
  perform edra_private.lock_exam_record(target, p_record_id);
  perform edra_private.settle_exam_record(target, p_record_id);
  perform edra_private.lock_exam_work(target, p_record_id, false);
  select a.* into attempt from public.exam_attempts a
  where a.exam_id = target.id and a.annual_student_record_id = p_record_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'not_open'; end if;
  if edra_private.exam_attempt_active(attempt, target) then
    editor := edra_private.exam_editor_state(attempt.id, p_token);
    if (select generation from public.exam_editor_claims where attempt_id = attempt.id) is distinct from p_generation then editor := 'replaced'; end if;
    if editor = 'replaced' then
      return jsonb_build_object('outcome', 'editor_lost', 'reason', editor, 'departure', null);
    end if;
  end if;
  result := edra_private.record_exam_departure_for(target.id, p_record_id, p_event_id, p_question_id);
  select a.* into attempt from public.exam_attempts a where a.id = attempt.id;
  if not edra_private.exam_attempt_active(attempt, target) then
    perform edra_private.end_exam_editor(attempt.id);
    return jsonb_build_object('outcome', result->'outcome', 'departure', result->'departure',
      'state', edra_private.exam_answering_terminal(target.id, p_record_id));
  end if;
  if editor = 'current' then perform edra_private.renew_exam_editor(attempt.id); end if;
  return jsonb_build_object('outcome', result->'outcome', 'departure', result->'departure',
    'state', edra_private.exam_answering_brief(target.id, p_record_id));
end;
$$;

-- Replacements preserve the original private authority and public fenced wrapper.
revoke all on function edra_private.record_exam_departure_for(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function edra_private.record_my_exam_departure_for(uuid, uuid, text, uuid, uuid, integer) from public, anon, authenticated;
