-- Quiz refinement 2: one lock order for every quiz entry point, year row first.
--
-- A direct UPDATE of academic_years.closed_at holds the year row (FOR NO KEY UPDATE) before its
-- BEFORE trigger settles the year's quizzes, which take the quiz row. Quiz commands and the worker
-- used to lock quiz then year, the inverse order. Every quiz entry point now share-locks the year
-- first, then the quiz, so the closer waits for in-flight commands (and they for it) without a cycle.

create or replace function edra_private.lock_quiz(p_academy_id uuid, p_quiz_id uuid, p_exclusive boolean)
returns public.quizzes
language plpgsql security definer set search_path = '' as $$
declare
  target public.quizzes%rowtype;
  year_id uuid;
begin
  if p_quiz_id is null or p_academy_id is null then raise exception using errcode = 'P0001', message = 'validation'; end if;
  select z.academic_year_id into year_id from public.quizzes z where z.id = p_quiz_id and z.academy_id = p_academy_id;
  if not found then raise exception using errcode = 'P0001', message = 'not_found'; end if;
  perform 1 from public.academic_years y where y.id = year_id for share;
  if p_exclusive then
    select z.* into target from public.quizzes z where z.id = p_quiz_id and z.academy_id = p_academy_id for update;
  else
    select z.* into target from public.quizzes z where z.id = p_quiz_id and z.academy_id = p_academy_id for key share;
  end if;
  if not found then raise exception using errcode = 'P0001', message = 'not_found'; end if;
  return target;
end;
$$;


-- Year share lock, then the quiz row (exclusive or key share). For trusted per-quiz entry points
-- that are not scoped by an academy argument.
create or replace function edra_private.lock_quiz_by_id(p_quiz_id uuid, p_exclusive boolean)
returns public.quizzes
language plpgsql security definer set search_path = '' as $$
declare
  target public.quizzes%rowtype;
  year_id uuid;
begin
  select z.academic_year_id into year_id from public.quizzes z where z.id = p_quiz_id;
  if not found then raise exception using errcode = 'P0001', message = 'not_found'; end if;
  perform 1 from public.academic_years y where y.id = year_id for share;
  if p_exclusive then
    select z.* into target from public.quizzes z where z.id = p_quiz_id for update;
  else
    select z.* into target from public.quizzes z where z.id = p_quiz_id for key share;
  end if;
  if not found then raise exception using errcode = 'P0001', message = 'not_found'; end if;
  return target;
end;
$$;
revoke all on function edra_private.lock_quiz_by_id(uuid, boolean) from public, anon, authenticated;

create or replace function edra_private.settle_quiz_closure(p_quiz_id uuid)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  target public.quizzes%rowtype;
  settled integer;
  t_now timestamptz;
  qualifying record;
begin
  -- Year share lock first (the lock order shared with year closure), then the exclusive quiz lock.
  select z.* into target from public.quizzes z where z.id = p_quiz_id;
  if not found or target.actual_closes_at is null then return 0; end if;
  perform 1 from public.academic_years y where y.id = target.academic_year_id for share;
  select z.* into target from public.quizzes z where z.id = p_quiz_id for update;
  if not found then return 0; end if;
  perform 1 from public.academic_years y where y.id = target.academic_year_id and y.closed_at is null;
  if not found then return 0; end if;
  settled := edra_private.settle_quiz_attempts(target);
  t_now := clock_timestamp();
  if t_now < target.actual_closes_at then return settled; end if;
  insert into public.quiz_closures (quiz_id, academy_id, closed_at, settled_at)
  values (target.id, target.academy_id, target.actual_closes_at, t_now)
  on conflict do nothing;
  for qualifying in
    select w.annual_student_record_id from public.quiz_work w
    where w.quiz_id = target.id and w.solutions_qualified_at is null
      and (w.accepted_source = 'online' or (w.accepted_source = 'physical' and w.published_revision > 0))
    order by w.annual_student_record_id
  loop
    perform 1 from public.quiz_work w where w.quiz_id = target.id and w.annual_student_record_id = qualifying.annual_student_record_id for update;
    perform edra_private.qualify_quiz_solutions(target, qualifying.annual_student_record_id, t_now);
  end loop;
  return settled;
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
  target := edra_private.lock_quiz_by_id(p_quiz_id, false);
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
  target := edra_private.lock_quiz_by_id(p_quiz_id, false);
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
  target := edra_private.lock_quiz_by_id(p_quiz_id, false);
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
  target := edra_private.lock_quiz_by_id(p_quiz_id, false);
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
