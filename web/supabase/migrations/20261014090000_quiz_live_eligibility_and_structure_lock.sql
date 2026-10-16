-- Quiz refinement 1 (EDRA-77 follow-up): live eligibility for every new-work write, and a structure
-- lock at final acceptance.
--
-- Lock order for per-student commands: quiz row -> academic year share -> annual record share ->
-- quiz_work -> attempt. The record share lock makes the placement check and the acceptance atomic
-- with a concurrent placement move (moves take FOR NO KEY UPDATE on the record).

create or replace function edra_private.lock_quiz_record(p_target public.quizzes, p_record_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_record_id is null then return; end if;
  perform 1 from public.annual_student_records r
  where r.id = p_record_id and r.academy_id = p_target.academy_id and r.academic_year_id = p_target.academic_year_id
  for share;
end;
$$;

-- Raises not_eligible unless the record is in the quiz's current audience. Locks the record first so a
-- concurrent move cannot slip between this check and the write that follows.
create or replace function edra_private.require_quiz_placement(p_target public.quizzes, p_record_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform edra_private.lock_quiz_record(p_target, p_record_id);
  if not edra_private.quiz_is_eligible(p_target.id, p_record_id) then
    raise exception using errcode = 'P0001', message = 'not_eligible';
  end if;
end;
$$;

revoke all on function edra_private.lock_quiz_record(public.quizzes, uuid) from public, anon, authenticated;
revoke all on function edra_private.require_quiz_placement(public.quizzes, uuid) from public, anon, authenticated;

create or replace function edra_private.accept_quiz_submission(
  p_target public.quizzes, p_record_id uuid, p_source public.quiz_source, p_reason public.quiz_finalization_reason,
  p_submitted_at timestamptz, p_at timestamptz
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  attempt public.quiz_attempts%rowtype;
  submission uuid;
  current_revision integer;
begin
  -- Accepted work can never exist under an unlocked scoring structure: lock before any result is computed.
  perform edra_private.mark_quiz_activity(p_target, true);
  select z.scoring_revision into current_revision from public.quizzes z where z.id = p_target.id;
  if p_source = 'online' then
    select a.* into attempt from public.quiz_attempts a
    where a.quiz_id = p_target.id and a.annual_student_record_id = p_record_id for update;
    insert into public.quiz_submissions (
      academy_id, academic_year_id, quiz_id, annual_student_record_id, source, reason, attempt_id, submitted_at, processed_at,
      original_deadline_at, scoring_revision
    ) values (
      p_target.academy_id, p_target.academic_year_id, p_target.id, p_record_id, 'online', p_reason, attempt.id, p_submitted_at, p_at,
      attempt.deadline_at, current_revision
    ) returning id into submission;
    insert into public.quiz_submission_answers (submission_id, academy_id, quiz_id, question_id, choice_id, text_answer)
    select submission, p_target.academy_id, p_target.id, o.question_id, o.choice_id, o.text_answer
    from public.quiz_online_answers o where o.attempt_id = attempt.id;
    update public.quiz_attempts set finalized_at = p_submitted_at, finalization_reason = p_reason where id = attempt.id;
  else
    insert into public.quiz_submissions (
      academy_id, academic_year_id, quiz_id, annual_student_record_id, source, reason, submitted_at, processed_at,
      scoring_revision, confirmed_by
    ) values (
      p_target.academy_id, p_target.academic_year_id, p_target.id, p_record_id, 'physical', 'physical', p_submitted_at, p_at,
      current_revision, auth.uid()
    ) returning id into submission;
    insert into public.quiz_submission_answers (submission_id, academy_id, quiz_id, question_id, choice_id)
    select submission, p_target.academy_id, p_target.id, a.question_id, a.choice_id
    from public.quiz_physical_answers a where a.quiz_id = p_target.id and a.annual_student_record_id = p_record_id;
    -- The online draft stays as history and can no longer finalize.
    update public.quiz_attempts set superseded_at = p_at
    where quiz_id = p_target.id and annual_student_record_id = p_record_id and finalized_at is null and superseded_at is null;
  end if;
  update public.quiz_work set accepted_source = p_source, accepted_submission_id = submission, version = version + 1, updated_at = p_at
  where quiz_id = p_target.id and annual_student_record_id = p_record_id;
  if p_source = 'online' and edra_private.quiz_fully_automatic(p_target.id) then
    perform edra_private.announce_quiz_result(p_target, p_record_id, true, p_at);
  end if;
  perform edra_private.refresh_quiz_qualification(p_target, p_record_id, p_at);
  return submission;
end;
$$;

create or replace function edra_private.start_quiz_attempt_for(p_quiz_id uuid, p_record_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  target public.quizzes%rowtype;
  work public.quiz_work%rowtype;
  existing public.quiz_attempts%rowtype;
  t_now timestamptz;
begin
  perform edra_private.settle_quiz_if_due(p_quiz_id);
  select z.* into target from public.quizzes z where z.id = p_quiz_id for key share;
  if not found then raise exception using errcode = 'P0001', message = 'not_found'; end if;
  perform edra_private.require_open_quiz_year(target.academy_id, target.academic_year_id);
  perform edra_private.lock_quiz_record(target, p_record_id);
  select a.* into existing from public.quiz_attempts a where a.quiz_id = target.id and a.annual_student_record_id = p_record_id;
  if found then
    perform edra_private.settle_quiz_record(target, p_record_id);
    return edra_private.quiz_student_state(target.id, p_record_id);
  end if;
  if target.archived_at is not null or not edra_private.quiz_ready(target.id) then
    raise exception using errcode = 'P0001', message = 'not_open';
  end if;
  perform edra_private.require_quiz_placement(target, p_record_id);
  work := edra_private.lock_quiz_work(target, p_record_id, true);
  if work.accepted_submission_id is not null then raise exception using errcode = 'P0001', message = 'source_conflict'; end if;
  t_now := clock_timestamp();
  if target.opens_at is null or t_now < target.opens_at or t_now >= target.closes_at then
    raise exception using errcode = 'P0001', message = 'not_open';
  end if;
  insert into public.quiz_attempts (academy_id, quiz_id, annual_student_record_id, started_at, deadline_at)
  values (target.academy_id, target.id, p_record_id, t_now,
    case when target.time_limit_minutes is null then null else t_now + make_interval(mins => target.time_limit_minutes) end)
  on conflict do nothing;
  perform edra_private.mark_quiz_activity(target, false);
  return edra_private.quiz_student_state(target.id, p_record_id);
end;
$$;

create or replace function edra_private.save_quiz_answers_for(
  p_quiz_id uuid, p_record_id uuid, p_expected_version integer, p_answers jsonb, p_key uuid
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  target public.quizzes%rowtype;
  attempt public.quiz_attempts%rowtype;
  fingerprint text := md5(jsonb_build_object('record', p_record_id, 'version', p_expected_version, 'answers', p_answers)::text);
  replay jsonb;
  t_now timestamptz;
begin
  if p_expected_version is null or p_answers is null or jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) not between 1 and 300 then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  perform edra_private.settle_quiz_if_due(p_quiz_id);
  select z.* into target from public.quizzes z where z.id = p_quiz_id for key share;
  if not found then raise exception using errcode = 'P0001', message = 'not_found'; end if;
  replay := edra_private.quiz_replay(p_key, 'answers', target.id, fingerprint);
  if replay is not null then return replay; end if;
  perform edra_private.require_open_quiz_year(target.academy_id, target.academic_year_id);
  perform edra_private.lock_quiz_record(target, p_record_id);
  perform edra_private.settle_quiz_record(target, p_record_id);
  perform edra_private.lock_quiz_work(target, p_record_id, false);
  select a.* into attempt from public.quiz_attempts a
  where a.quiz_id = target.id and a.annual_student_record_id = p_record_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'not_open'; end if;
  t_now := clock_timestamp();
  -- Returned rather than raised so the settlement above commits.
  if attempt.finalized_at is not null or attempt.superseded_at is not null
    or t_now >= least(attempt.deadline_at, target.actual_closes_at) then
    return jsonb_build_object('outcome', 'finalized', 'state', edra_private.quiz_student_state(target.id, p_record_id), 'replayed', false);
  end if;
  -- Saving new answers needs current eligibility; settlement of already saved work does not.
  perform edra_private.require_quiz_placement(target, p_record_id);
  if attempt.answers_version <> p_expected_version then
    return jsonb_build_object('outcome', 'conflict', 'state', edra_private.quiz_student_state(target.id, p_record_id), 'replayed', false);
  end if;

  create temporary table if not exists pg_temp.quiz_answer_input (question_id uuid, choice_id uuid, text_answer text, has_text boolean) on commit drop;
  truncate pg_temp.quiz_answer_input;
  begin
    insert into pg_temp.quiz_answer_input
    select (e->>'question_id')::uuid, nullif(e->>'choice_id', '')::uuid, e->>'text_answer', e ? 'text_answer'
    from jsonb_array_elements(p_answers) e
    where jsonb_typeof(e) = 'object'
      and not exists (select 1 from jsonb_object_keys(e) k where k not in ('question_id', 'choice_id', 'text_answer'));
  exception when others then
    raise exception using errcode = 'P0001', message = 'validation';
  end;
  if (select count(*) from pg_temp.quiz_answer_input) <> jsonb_array_length(p_answers)
    or (select count(distinct i.question_id) from pg_temp.quiz_answer_input i) <> jsonb_array_length(p_answers)
    or exists (select 1 from pg_temp.quiz_answer_input i where i.question_id is null or char_length(coalesce(i.text_answer, '')) > 10000) then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  -- The answer shape must match the question kind; choices must belong to the question.
  if exists (
    select 1 from pg_temp.quiz_answer_input i
    left join public.quiz_questions q on q.id = i.question_id and q.quiz_id = target.id
    left join public.quiz_parts p on p.id = q.part_id
    where q.id is null
      or (p.kind = 'question_sheet' and (i.has_text or (i.choice_id is not null and not exists (
        select 1 from public.quiz_choices c where c.question_id = q.id and c.id = i.choice_id))))
      or (p.kind = 'written_work' and i.choice_id is not null)
  ) then
    raise exception using errcode = 'P0001', message = 'unknown_question';
  end if;
  -- Excluded questions are skipped: a changed answer is rejected, an unchanged one is ignored.
  if exists (
    select 1 from pg_temp.quiz_answer_input i
    join public.quiz_questions q on q.id = i.question_id and q.excluded_at is not null
    left join public.quiz_online_answers o on o.attempt_id = attempt.id and o.question_id = i.question_id
    where (o.choice_id, o.text_answer) is distinct from (i.choice_id, nullif(i.text_answer, ''))
  ) then
    raise exception using errcode = 'P0001', message = 'question_excluded';
  end if;
  insert into public.quiz_online_answers (attempt_id, academy_id, quiz_id, question_id, choice_id, text_answer, saved_at)
  select attempt.id, target.academy_id, target.id, i.question_id, i.choice_id, nullif(i.text_answer, ''), t_now
  from pg_temp.quiz_answer_input i
  join public.quiz_questions q on q.id = i.question_id and q.excluded_at is null
  on conflict (attempt_id, question_id) do update set choice_id = excluded.choice_id, text_answer = excluded.text_answer, saved_at = excluded.saved_at;
  update public.quiz_attempts set answers_version = answers_version + 1, last_saved_at = t_now where id = attempt.id;
  perform edra_private.mark_quiz_activity(target, true);
  return edra_private.remember_quiz_request(p_key, 'answers', target, fingerprint,
    jsonb_build_object('outcome', 'saved', 'state', edra_private.quiz_student_state(target.id, p_record_id)));
end;
$$;

create or replace function edra_private.submit_quiz_attempt_for(p_quiz_id uuid, p_record_id uuid, p_key uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  target public.quizzes%rowtype;
  work public.quiz_work%rowtype;
  attempt public.quiz_attempts%rowtype;
  fingerprint text := md5(jsonb_build_object('record', p_record_id)::text);
  replay jsonb;
  t_now timestamptz;
begin
  perform edra_private.settle_quiz_if_due(p_quiz_id);
  select z.* into target from public.quizzes z where z.id = p_quiz_id for key share;
  if not found then raise exception using errcode = 'P0001', message = 'not_found'; end if;
  replay := edra_private.quiz_replay(p_key, 'submit', target.id, fingerprint);
  if replay is not null then return replay; end if;
  perform edra_private.require_open_quiz_year(target.academy_id, target.academic_year_id);
  perform edra_private.lock_quiz_record(target, p_record_id);
  perform edra_private.settle_quiz_record(target, p_record_id);
  work := edra_private.lock_quiz_work(target, p_record_id, false);
  select a.* into attempt from public.quiz_attempts a
  where a.quiz_id = target.id and a.annual_student_record_id = p_record_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'not_open'; end if;
  -- Outcomes rather than errors so a settlement above commits.
  if work.accepted_source = 'physical' or attempt.superseded_at is not null then
    return jsonb_build_object('outcome', 'source_conflict', 'state', edra_private.quiz_student_state(target.id, p_record_id), 'replayed', false);
  end if;
  if attempt.finalized_at is not null then
    return jsonb_build_object('outcome', 'finalized', 'state', edra_private.quiz_student_state(target.id, p_record_id), 'replayed', false);
  end if;
  -- An explicit final submission is new work: it needs current eligibility.
  perform edra_private.require_quiz_placement(target, p_record_id);
  t_now := clock_timestamp();
  perform edra_private.accept_quiz_submission(target, p_record_id, 'online', 'submitted', t_now, t_now);
  return edra_private.remember_quiz_request(p_key, 'submit', target, fingerprint,
    jsonb_build_object('outcome', 'submitted', 'state', edra_private.quiz_student_state(target.id, p_record_id)));
end;
$$;

create or replace function edra_private.record_quiz_departure_for(p_quiz_id uuid, p_record_id uuid, p_event_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  target public.quizzes%rowtype;
  work public.quiz_work%rowtype;
  attempt public.quiz_attempts%rowtype;
  t_now timestamptz;
  inserted integer;
begin
  if p_event_id is null then raise exception using errcode = 'P0001', message = 'validation'; end if;
  perform edra_private.settle_quiz_if_due(p_quiz_id);
  select z.* into target from public.quizzes z where z.id = p_quiz_id for key share;
  if not found then raise exception using errcode = 'P0001', message = 'not_found'; end if;
  perform edra_private.require_open_quiz_year(target.academy_id, target.academic_year_id);
  perform edra_private.lock_quiz_record(target, p_record_id);
  perform edra_private.settle_quiz_record(target, p_record_id);
  work := edra_private.lock_quiz_work(target, p_record_id, false);
  select a.* into attempt from public.quiz_attempts a
  where a.quiz_id = target.id and a.annual_student_record_id = p_record_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'not_open'; end if;
  if attempt.finalized_at is not null or attempt.superseded_at is not null then
    return jsonb_build_object('outcome', 'finalized', 'state', edra_private.quiz_student_state(target.id, p_record_id));
  end if;
  t_now := clock_timestamp();
  insert into public.quiz_departures (attempt_id, event_id, recorded_at) values (attempt.id, p_event_id, t_now) on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then
    return jsonb_build_object('outcome', 'duplicate', 'state', edra_private.quiz_student_state(target.id, p_record_id));
  end if;
  update public.quiz_attempts set departure_count = departure_count + 1 where id = attempt.id returning * into attempt;
  if attempt.departure_count >= 2 and work.accepted_submission_id is null then
    perform edra_private.accept_quiz_submission(target, p_record_id, 'online', 'departure', t_now, t_now);
    return jsonb_build_object('outcome', 'submitted', 'state', edra_private.quiz_student_state(target.id, p_record_id));
  end if;
  return jsonb_build_object('outcome', 'warned', 'state', edra_private.quiz_student_state(target.id, p_record_id));
end;
$$;

create or replace function edra_private.save_quiz_physical_draft(
  p_academy_id uuid, p_quiz_id uuid, p_record_id uuid, p_expected_version integer, p_answers jsonb, p_key uuid
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  target public.quizzes%rowtype;
  work public.quiz_work%rowtype;
  draft public.quiz_physical_drafts%rowtype;
  fingerprint text := md5(jsonb_build_object('record', p_record_id, 'version', p_expected_version, 'answers', p_answers)::text);
  replay jsonb;
  t_now timestamptz;
begin
  perform edra_private.require_quiz_role(p_academy_id, false);
  if p_record_id is null or p_expected_version is null or p_expected_version < 0 or p_answers is null
    or jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) > 300 then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  perform edra_private.settle_staff_quiz(p_academy_id, p_quiz_id);
  target := edra_private.lock_quiz(p_academy_id, p_quiz_id, false);
  replay := edra_private.quiz_replay(p_key, 'physical_draft', target.id, fingerprint);
  if replay is not null then return replay; end if;
  perform edra_private.require_open_quiz_year(target.academy_id, target.academic_year_id);
  if target.archived_at is not null then raise exception using errcode = 'P0001', message = 'invalid_state'; end if;
  if not edra_private.quiz_ready(target.id) then raise exception using errcode = 'P0001', message = 'not_ready'; end if;
  perform edra_private.lock_quiz_record(target, p_record_id);
  perform edra_private.settle_quiz_record(target, p_record_id);
  work := edra_private.lock_quiz_work(target, p_record_id, true);
  t_now := clock_timestamp();
  -- The accepted source is reported, not raised, so a settlement above commits.
  if work.accepted_submission_id is not null then
    return jsonb_build_object('outcome', 'source_conflict', 'student', edra_private.quiz_student_row(target.id, p_record_id),
      'answers', edra_private.quiz_physical_answers_json(target.id, p_record_id), 'replayed', false);
  end if;
  -- New physical entries need current eligibility even when a draft exists; accepted work is reported above.
  perform edra_private.require_quiz_placement(target, p_record_id);
  if target.actual_closes_at is not null and t_now >= target.actual_closes_at then raise exception using errcode = 'P0001', message = 'quiz_closed'; end if;
  select d.* into draft from public.quiz_physical_drafts d where d.quiz_id = target.id and d.annual_student_record_id = p_record_id for update;
  if coalesce(draft.version, 0) <> p_expected_version then
    return jsonb_build_object('outcome', 'conflict', 'student', edra_private.quiz_student_row(target.id, p_record_id),
      'answers', edra_private.quiz_physical_answers_json(target.id, p_record_id), 'replayed', false);
  end if;

  create temporary table if not exists pg_temp.quiz_physical_input (question_id uuid, choice_id uuid) on commit drop;
  truncate pg_temp.quiz_physical_input;
  begin
    insert into pg_temp.quiz_physical_input
    select (e->>'question_id')::uuid, nullif(e->>'choice_id', '')::uuid
    from jsonb_array_elements(p_answers) e
    where jsonb_typeof(e) = 'object' and not exists (select 1 from jsonb_object_keys(e) k where k not in ('question_id', 'choice_id'));
  exception when others then
    raise exception using errcode = 'P0001', message = 'validation';
  end;
  if (select count(*) from pg_temp.quiz_physical_input) <> jsonb_array_length(p_answers)
    or (select count(distinct i.question_id) from pg_temp.quiz_physical_input i) <> jsonb_array_length(p_answers)
    or exists (select 1 from pg_temp.quiz_physical_input i where i.question_id is null) then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  if exists (
    select 1 from pg_temp.quiz_physical_input i
    left join public.quiz_questions q on q.id = i.question_id and q.quiz_id = target.id
    left join public.quiz_parts p on p.id = q.part_id
    where q.id is null or p.kind <> 'question_sheet'
      or (i.choice_id is not null and not exists (select 1 from public.quiz_choices c where c.question_id = q.id and c.id = i.choice_id))
  ) then
    raise exception using errcode = 'P0001', message = 'unknown_question';
  end if;

  if draft.quiz_id is null then
    insert into public.quiz_physical_drafts (quiz_id, annual_student_record_id, academy_id, version, updated_by, updated_at)
    values (target.id, p_record_id, target.academy_id, 1, actor, t_now);
  else
    update public.quiz_physical_drafts set version = version + 1, updated_by = actor, updated_at = t_now
    where quiz_id = target.id and annual_student_record_id = p_record_id;
  end if;
  delete from public.quiz_physical_answers a where a.quiz_id = target.id and a.annual_student_record_id = p_record_id
    and a.question_id not in (select i.question_id from pg_temp.quiz_physical_input i);
  insert into public.quiz_physical_answers (quiz_id, annual_student_record_id, academy_id, question_id, choice_id)
  select target.id, p_record_id, target.academy_id, i.question_id, i.choice_id from pg_temp.quiz_physical_input i
  on conflict (quiz_id, annual_student_record_id, question_id) do update set choice_id = excluded.choice_id;
  if jsonb_array_length(p_answers) > 0 then perform edra_private.mark_quiz_activity(target, true);
  else perform edra_private.mark_quiz_activity(target, false); end if;
  return edra_private.remember_quiz_request(p_key, 'physical_draft', target, fingerprint,
    jsonb_build_object('outcome', 'saved', 'student', edra_private.quiz_student_row(target.id, p_record_id),
      'answers', edra_private.quiz_physical_answers_json(target.id, p_record_id)));
end;
$$;

create or replace function edra_private.confirm_quiz_physical(
  p_academy_id uuid, p_quiz_id uuid, p_record_id uuid, p_expected_version integer, p_key uuid
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  target public.quizzes%rowtype;
  work public.quiz_work%rowtype;
  draft public.quiz_physical_drafts%rowtype;
  fingerprint text := md5(jsonb_build_object('record', p_record_id, 'version', p_expected_version)::text);
  replay jsonb;
  t_now timestamptz;
begin
  perform edra_private.require_quiz_role(p_academy_id, false);
  if p_record_id is null or p_expected_version is null or p_expected_version < 0 or p_key is null then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  perform edra_private.settle_staff_quiz(p_academy_id, p_quiz_id);
  target := edra_private.lock_quiz(p_academy_id, p_quiz_id, false);
  replay := edra_private.quiz_replay(p_key, 'confirm', target.id, fingerprint);
  if replay is not null then return replay; end if;
  perform edra_private.require_open_quiz_year(target.academy_id, target.academic_year_id);
  if target.archived_at is not null then raise exception using errcode = 'P0001', message = 'invalid_state'; end if;
  if not edra_private.quiz_ready(target.id) then raise exception using errcode = 'P0001', message = 'not_ready'; end if;
  -- An online attempt already past its cutoff is finalized first, so it wins over a late confirmation.
  perform edra_private.lock_quiz_record(target, p_record_id);
  perform edra_private.settle_quiz_record(target, p_record_id);
  work := edra_private.lock_quiz_work(target, p_record_id, true);
  t_now := clock_timestamp();
  -- The accepted source is reported, not raised, so a settlement above commits.
  if work.accepted_submission_id is not null then
    return jsonb_build_object('outcome', 'source_conflict', 'student', edra_private.quiz_student_row(target.id, p_record_id), 'replayed', false);
  end if;
  -- New physical entries need current eligibility even when a draft exists; accepted work is reported above.
  perform edra_private.require_quiz_placement(target, p_record_id);
  if target.actual_closes_at is not null and t_now >= target.actual_closes_at then raise exception using errcode = 'P0001', message = 'quiz_closed'; end if;
  select d.* into draft from public.quiz_physical_drafts d where d.quiz_id = target.id and d.annual_student_record_id = p_record_id for update;
  if coalesce(draft.version, 0) <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'quiz_conflict';
  end if;
  if draft.quiz_id is null then
    insert into public.quiz_physical_drafts (quiz_id, annual_student_record_id, academy_id, version, updated_by, updated_at)
    values (target.id, p_record_id, target.academy_id, 1, actor, t_now);
  end if;
  perform edra_private.accept_quiz_submission(target, p_record_id, 'physical', 'physical', t_now, t_now);
  perform edra_private.mark_quiz_activity(target, false);
  return edra_private.remember_quiz_request(p_key, 'confirm', target, fingerprint,
    jsonb_build_object('outcome', 'confirmed', 'student', edra_private.quiz_student_row(target.id, p_record_id)));
end;
$$;


-- Backfill: quizzes that already hold accepted work are locked at the time of the first acceptance.
update public.quizzes z
set structure_locked_at = s.first_at,
    work_started_at = coalesce(z.work_started_at, s.first_at)
from (select quiz_id, min(processed_at) as first_at from public.quiz_submissions group by quiz_id) s
where s.quiz_id = z.id and z.structure_locked_at is null;
