-- EDRA-233: student exam answering. Server-owned single-editor claims, fenced answering commands,
-- receipt-safe replays, authorized question images and retirement of the unfenced student wrappers.
--
-- Editor ownership:
--   * One claim row per attempt (exam_editor_claims): the hash of an unguessable claim token, a
--     generation that only increases and a database-measured expiry. Students have no table access.
--     A token is never authority by itself: every command first resolves the caller's annual record
--     through the ordinary-session student resolver, then checks the token against that attempt.
--   * Claiming while a different live claim exists returns busy; there is no takeover. A claim whose
--     lease expired is acquired fresh with the next generation and a new token. Presenting the current
--     live token again (same-document recovery after a refresh) renews it in place. Renewal needs the
--     exact current live token, so a superseded generation can never be revived.
--   * Lease expiry never moves a deadline or finalizes work. Deadline, closure, physical confirmation
--     and the worker settle attempts without any claim.
--
-- Answering commands (enter, renew, release, read, save, submit, departure, images) take the
-- established lock order — academic year (share), exam (key share), annual record (share), the work
-- row, the attempt row — and only then the claim row. They settle due work first and return terminal
-- outcomes rather than raising, so a settlement always commits.
--
-- Receipts: new save and submit receipts store metadata only (outcome, answers version, editor
-- generation), never a question or answer document. A replay returns that metadata with a freshly
-- authorized projection: the current editor gets the brief live state, a finalized attempt gets the
-- terminal status only, and any other caller gets editor_lost without state. A replay never grants
-- writer powers and never re-exposes material after finalization.
--
-- Direct RPC: save_exam_answers, submit_exam_attempt and record_exam_departure lose authenticated
-- execution. get_my_exam, start_exam_attempt and start_my_exam keep their signatures but return
-- question material, saved answers and departures only once solutions qualify (the review path for
-- EDRA-235); during the attempt that material is available only through the fenced answering read.

create table public.exam_editor_claims (
  attempt_id uuid primary key,
  academy_id uuid not null,
  exam_id uuid not null,
  generation integer not null check (generation >= 1),
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  claimed_at timestamptz not null,
  renewed_at timestamptz not null,
  expires_at timestamptz not null,
  foreign key (exam_id, attempt_id) references public.exam_attempts (exam_id, id),
  foreign key (academy_id, exam_id) references public.exams (academy_id, id),
  constraint exam_editor_claims_lease_shape check (expires_at >= claimed_at and renewed_at >= claimed_at)
);

alter table public.exam_editor_claims enable row level security;
revoke all on public.exam_editor_claims from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Operational constants (one place). Heartbeat every 10 seconds, lease 45 seconds.

create or replace function edra_private.exam_editor_lease()
returns interval
language sql immutable set search_path = '' as $$
  select interval '45 seconds';
$$;

create or replace function edra_private.exam_editor_heartbeat_seconds()
returns integer
language sql immutable set search_path = '' as $$
  select 10;
$$;

-- Quotas: editor heartbeats/claims/reads and image authorization have their own buckets, so they never
-- consume the answer-write budget. Existing buckets are unchanged.
create or replace function edra_private.quota_limit(p_bucket text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_bucket
    when 'api:read' then 300
    when 'api:write' then 120
    when 'op:attendance_check_in' then 600
    when 'op:attendance_change' then 240
    when 'op:attendance_publish' then 60
    -- Assignment authoring and lifecycle commands.
    when 'op:assignment_author' then 120
    -- Mark saves and recorded work (fast entry).
    when 'op:assignment_mark' then 600
    -- Result publication.
    when 'op:assignment_publish' then 60
    -- Quiz preparation, availability, archive and corrections.
    when 'op:quiz_author' then 120
    -- Physical entry, confirmation and marks.
    when 'op:quiz_mark' then 600
    -- Result announcement.
    when 'op:quiz_publish' then 60
    -- Student answer saves, departures and final submissions.
    when 'op:quiz_answer' then 600
    -- Exam preparation, availability, archive and corrections.
    when 'op:exam_author' then 120
    -- Physical entry, confirmation and marks.
    when 'op:exam_mark' then 600
    -- Result announcement.
    when 'op:exam_publish' then 60
    -- Student answer saves, departures and final submissions.
    when 'op:exam_answer' then 600
    -- Student editor claims, heartbeats, releases and answering reads.
    when 'op:exam_editor' then 120
    -- Student question-image authorization.
    when 'op:exam_image' then 120
  end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Private helpers.

-- sha256 of a well-formed claim token (64 lowercase hex characters), or null.
create or replace function edra_private.exam_editor_hash(p_token text)
returns text
language sql immutable set search_path = '' as $$
  select case when p_token ~ '^[0-9a-f]{64}$' then pg_catalog.encode(extensions.digest(p_token, 'sha256'), 'hex') end;
$$;

-- current: the token's claim is live. expired: the token holds the latest generation but its lease
-- ran out. replaced: another generation (or no claim) is current. Locks the claim row; the caller
-- already holds the attempt row.
create or replace function edra_private.exam_editor_state(p_attempt_id uuid, p_token text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  claim public.exam_editor_claims%rowtype;
  presented text := edra_private.exam_editor_hash(p_token);
begin
  select c.* into claim from public.exam_editor_claims c where c.attempt_id = p_attempt_id for update;
  if not found or presented is null or claim.token_hash <> presented then return 'replaced'; end if;
  if claim.expires_at <= clock_timestamp() then return 'expired'; end if;
  return 'current';
end;
$$;

-- Extends the current claim's lease (the caller checked it is current).
create or replace function edra_private.renew_exam_editor(p_attempt_id uuid)
returns timestamptz
language sql security definer set search_path = '' as $$
  update public.exam_editor_claims set renewed_at = clock_timestamp(), expires_at = clock_timestamp() + edra_private.exam_editor_lease()
  where attempt_id = p_attempt_id
  returning expires_at;
$$;

-- Ends the current claim's lease now; the generation stays, so the next claim is a fresh one.
create or replace function edra_private.end_exam_editor(p_attempt_id uuid)
returns void
language sql security definer set search_path = '' as $$
  update public.exam_editor_claims set expires_at = greatest(claimed_at, clock_timestamp())
  where attempt_id = p_attempt_id and expires_at > clock_timestamp();
$$;

create or replace function edra_private.exam_attempt_active(p_attempt public.exam_attempts, p_target public.exams)
returns boolean
language sql stable set search_path = '' as $$
  select p_attempt.finalized_at is null and p_attempt.superseded_at is null
    and clock_timestamp() < least(p_attempt.deadline_at, p_target.actual_closes_at);
$$;

-- Attempt metadata for the answering surface: no answers, departures or question material.
create or replace function edra_private.exam_attempt_summary_json(p_attempt public.exam_attempts, p_target public.exams)
returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', p_attempt.id, 'started_at', p_attempt.started_at, 'deadline_at', p_attempt.deadline_at,
    'cutoff_at', least(p_attempt.deadline_at, p_target.actual_closes_at),
    'departure_count', p_attempt.departure_count, 'answers_version', p_attempt.answers_version,
    'finalized_at', p_attempt.finalized_at, 'finalization_reason', p_attempt.finalization_reason,
    'superseded', p_attempt.superseded_at is not null
  );
$$;

-- Live state for the current editor between full reads: server time, attempt metadata and the
-- current exclusions (staff may exclude a question mid-exam).
create or replace function edra_private.exam_answering_brief(p_exam_id uuid, p_record_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'server_now', clock_timestamp(),
    'attempt', edra_private.exam_attempt_summary_json(a, z),
    'excluded_question_ids', coalesce((select jsonb_agg(x.id order by x.id) from public.exam_questions x
      where x.exam_id = z.id and x.excluded_at is not null), '[]'::jsonb)
  )
  from public.exams z join public.exam_attempts a on a.exam_id = z.id and a.annual_student_record_id = p_record_id
  where z.id = p_exam_id;
$$;

-- Terminal state: status only (the overview reloads the official total). Never question material.
create or replace function edra_private.exam_answering_terminal(p_exam_id uuid, p_record_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'account_id', auth.uid(),
    'server_now', clock_timestamp(),
    'attempt', edra_private.exam_attempt_summary_json(a, z),
    'submission', (select jsonb_build_object('source', s.source, 'reason', s.reason, 'submitted_at', s.submitted_at)
      from public.exam_work w join public.exam_submissions s on s.id = w.accepted_submission_id
      where w.exam_id = z.id and w.annual_student_record_id = p_record_id)
  )
  from public.exams z join public.exam_attempts a on a.exam_id = z.id and a.annual_student_record_id = p_record_id
  where z.id = p_exam_id;
$$;

-- The full answering document for the current editor of an active attempt, built from the
-- tightened student projection (no keys, model answers, solution notes, marks or staff fields).
create or replace function edra_private.exam_answering_json(p_exam_id uuid, p_record_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'account_id', auth.uid(),
    'server_now', clock_timestamp(),
    'title', s->'title', 'instructions', s->'instructions',
    'attempt', edra_private.exam_attempt_summary_json(a, z),
    'editor', jsonb_build_object('generation', c.generation, 'expires_at', c.expires_at,
      'heartbeat_seconds', edra_private.exam_editor_heartbeat_seconds(),
      'lease_seconds', extract(epoch from edra_private.exam_editor_lease())::integer),
    'parts', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p->'id', 'title', p->'title', 'instructions', p->'instructions', 'kind', p->'kind',
        'questions', coalesce((select jsonb_agg(jsonb_build_object(
            'id', q->'id', 'number', q->'number', 'prompt', q->'prompt', 'excluded', q->'excluded',
            'choices', coalesce((select jsonb_agg(jsonb_build_object('id', ch->'id', 'label', ch->'label') order by co)
              from jsonb_array_elements(q->'choices') with ordinality ch_list(ch, co)), '[]'::jsonb)
          ) order by qo) from jsonb_array_elements(p->'questions') with ordinality q_list(q, qo)), '[]'::jsonb)
      ) order by po) from jsonb_array_elements(s->'parts') with ordinality p_list(p, po)), '[]'::jsonb),
    'excluded_question_ids', s->'excluded_question_ids',
    'answers', coalesce(s->'attempt'->'answers', '[]'::jsonb),
    'departures', coalesce(s->'attempt'->'departures', '[]'::jsonb)
  )
  from public.exams z
  join public.exam_attempts a on a.exam_id = z.id and a.annual_student_record_id = p_record_id
  join public.exam_editor_claims c on c.attempt_id = a.id
  cross join lateral (select edra_private.exam_student_state(z.id, p_record_id) as s) state
  where z.id = p_exam_id;
$$;

-- The legacy direct-RPC projection: question material, saved answers and departure details only
-- once solutions qualify (post-qualification review). Everything else is the tightened projection.
create or replace function edra_private.exam_public_state(p_exam_id uuid, p_record_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when jsonb_typeof(s->'solutions') = 'object' then s
    else s || jsonb_build_object('parts', '[]'::jsonb, 'excluded_question_ids', '[]'::jsonb)
      || case when jsonb_typeof(s->'attempt') = 'object'
        then jsonb_build_object('attempt', (s->'attempt') || jsonb_build_object('answers', '[]'::jsonb, 'departures', '[]'::jsonb))
        else '{}'::jsonb end
  end
  from (select edra_private.exam_student_state(p_exam_id, p_record_id) as s) state;
$$;

-- ---------------------------------------------------------------------------------------------
-- Editor domain (record-based; the public wrappers resolve the caller first).

-- Claims or recovers the editor of the record's attempt. Returns {status: claimed, token,
-- generation, expires_at, heartbeat_seconds, lease_seconds, server_now}, {status: busy,
-- retry_after} or {status: finalized}. Busy reveals nothing about the other editor.
create or replace function edra_private.claim_exam_editor_for(p_exam_id uuid, p_record_id uuid, p_token text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  target public.exams%rowtype;
  attempt public.exam_attempts%rowtype;
  claim public.exam_editor_claims%rowtype;
  presented text := edra_private.exam_editor_hash(p_token);
  token text;
  has_claim boolean;
  t_now timestamptz;
begin
  perform edra_private.settle_exam_if_due(p_exam_id);
  target := edra_private.lock_exam_by_id(p_exam_id, false);
  perform edra_private.require_open_exam_year(target.academy_id, target.academic_year_id);
  perform edra_private.lock_exam_record(target, p_record_id);
  perform edra_private.settle_exam_record(target, p_record_id);
  perform edra_private.lock_exam_work(target, p_record_id, false);
  select a.* into attempt from public.exam_attempts a
  where a.exam_id = target.id and a.annual_student_record_id = p_record_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'not_open'; end if;
  if not edra_private.exam_attempt_active(attempt, target) then
    return jsonb_build_object('status', 'finalized', 'state', edra_private.exam_answering_terminal(target.id, p_record_id));
  end if;
  perform edra_private.require_exam_placement(target, p_record_id);
  select c.* into claim from public.exam_editor_claims c where c.attempt_id = attempt.id for update;
  has_claim := found;
  t_now := clock_timestamp();
  if has_claim and claim.expires_at > t_now then
    if presented is null or claim.token_hash <> presented then
      return jsonb_build_object('status', 'busy',
        'retry_after', greatest(1, ceil(extract(epoch from claim.expires_at - t_now)))::integer);
    end if;
    -- The current live token presented again: the same document recovering after a refresh.
    token := p_token;
    update public.exam_editor_claims set renewed_at = t_now, expires_at = t_now + edra_private.exam_editor_lease()
    where attempt_id = attempt.id returning * into claim;
  else
    token := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');
    if has_claim then
      update public.exam_editor_claims set generation = generation + 1, token_hash = edra_private.exam_editor_hash(token),
        claimed_at = t_now, renewed_at = t_now, expires_at = t_now + edra_private.exam_editor_lease()
      where attempt_id = attempt.id returning * into claim;
    else
      -- The attempt row lock serializes claims, so the first insert cannot race.
      insert into public.exam_editor_claims (attempt_id, academy_id, exam_id, generation, token_hash, claimed_at, renewed_at, expires_at)
      values (attempt.id, target.academy_id, target.id, 1, edra_private.exam_editor_hash(token), t_now, t_now,
        t_now + edra_private.exam_editor_lease())
      returning * into claim;
    end if;
  end if;
  return jsonb_build_object('status', 'claimed', 'token', token, 'generation', claim.generation, 'expires_at', claim.expires_at,
    'heartbeat_seconds', edra_private.exam_editor_heartbeat_seconds(),
    'lease_seconds', extract(epoch from edra_private.exam_editor_lease())::integer,
    'server_now', clock_timestamp(),
    'attempt', edra_private.exam_attempt_summary_json(attempt, target));
end;
$$;

-- Heartbeat (renew), release, or the full answering read for the current editor.
-- p_mode: renew | release | read. Outcomes: renewed/released/state, lost {reason: expired |
-- replaced}, finalized {state: terminal}.
create or replace function edra_private.exam_editor_command_for(p_exam_id uuid, p_record_id uuid, p_token text, p_mode text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  target public.exams%rowtype;
  attempt public.exam_attempts%rowtype;
  editor text;
  expires timestamptz;
begin
  if p_mode is null or p_mode not in ('renew', 'release', 'read') then raise exception using errcode = 'P0001', message = 'validation'; end if;
  perform edra_private.settle_exam_if_due(p_exam_id);
  target := edra_private.lock_exam_by_id(p_exam_id, false);
  perform edra_private.require_open_exam_year(target.academy_id, target.academic_year_id);
  perform edra_private.lock_exam_record(target, p_record_id);
  perform edra_private.settle_exam_record(target, p_record_id);
  perform edra_private.lock_exam_work(target, p_record_id, false);
  select a.* into attempt from public.exam_attempts a
  where a.exam_id = target.id and a.annual_student_record_id = p_record_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'not_open'; end if;
  if not edra_private.exam_attempt_active(attempt, target) then
    perform edra_private.end_exam_editor(attempt.id);
    return jsonb_build_object('status', 'finalized', 'state', edra_private.exam_answering_terminal(target.id, p_record_id));
  end if;
  if p_mode <> 'release' then perform edra_private.require_exam_placement(target, p_record_id); end if;
  editor := edra_private.exam_editor_state(attempt.id, p_token);
  if editor <> 'current' then
    return jsonb_build_object('status', 'lost', 'reason', editor, 'server_now', clock_timestamp());
  end if;
  if p_mode = 'release' then
    perform edra_private.end_exam_editor(attempt.id);
    return jsonb_build_object('status', 'released');
  end if;
  expires := edra_private.renew_exam_editor(attempt.id);
  if p_mode = 'read' then
    return jsonb_build_object('status', 'state', 'state', edra_private.exam_answering_json(target.id, p_record_id));
  end if;
  return jsonb_build_object('status', 'renewed', 'expires_at', expires, 'state', edra_private.exam_answering_brief(target.id, p_record_id));
end;
$$;

-- Fenced answer save. A patch of 1..300 distinct questions against answers_version, with a required
-- command key. Outcomes: saved | conflict | finalized | editor_lost {reason}. Validation, shape and
-- excluded-question rules are the engine's (save_exam_answers_for).
create or replace function edra_private.save_my_exam_answers_for(
  p_exam_id uuid, p_record_id uuid, p_token text, p_expected_version integer, p_answers jsonb, p_key uuid, p_generation integer
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  target public.exams%rowtype;
  attempt public.exam_attempts%rowtype;
  fingerprint text := md5(jsonb_build_object('record', p_record_id, 'version', p_expected_version, 'answers', p_answers, 'generation', p_generation)::text);
  replay jsonb;
  editor text;
  result jsonb;
  claim_generation integer;
begin
  if p_generation is null or p_generation < 1 or p_key is null or p_expected_version is null or p_expected_version < 0 or p_answers is null or jsonb_typeof(p_answers) <> 'array'
    or jsonb_array_length(p_answers) not between 1 and 300 then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  -- Direct RPC callers receive the same strict scalar/nullable patch contract as the web action.
  if exists (
    select 1 from jsonb_array_elements(p_answers) e
    where case when jsonb_typeof(e) <> 'object' then true else
      jsonb_typeof(e->'question_id') is distinct from 'string'
      or (e ? 'choice_id' and e ? 'text_answer')
      or not (e ? 'choice_id' or e ? 'text_answer')
      or (e ? 'choice_id' and jsonb_typeof(e->'choice_id') not in ('string', 'null'))
      or (e ? 'text_answer' and jsonb_typeof(e->'text_answer') not in ('string', 'null'))
      or exists (select 1 from jsonb_object_keys(e) k where k not in ('question_id', 'choice_id', 'text_answer'))
    end
  ) then raise exception using errcode = 'P0001', message = 'validation'; end if;
  perform edra_private.settle_exam_if_due(p_exam_id);
  target := edra_private.lock_exam_by_id(p_exam_id, false);
  perform edra_private.require_open_exam_year(target.academy_id, target.academic_year_id);
  perform edra_private.lock_exam_record(target, p_record_id);
  perform edra_private.settle_exam_record(target, p_record_id);
  perform edra_private.lock_exam_work(target, p_record_id, false);
  select a.* into attempt from public.exam_attempts a
  where a.exam_id = target.id and a.annual_student_record_id = p_record_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'not_open'; end if;
  editor := edra_private.exam_editor_state(attempt.id, p_token);

  -- An exact retry: the accepted outcome, never accepted again, with a freshly authorized state.
  replay := edra_private.exam_replay(p_key, 'answers', target.id, fingerprint);
  if replay is not null then
    result := jsonb_build_object('outcome', replay->'outcome', 'answers_version', replay->'answers_version', 'replayed', true);
    if not edra_private.exam_attempt_active(attempt, target) then
      return result || jsonb_build_object('state', edra_private.exam_answering_terminal(target.id, p_record_id), 'finalized', true);
    end if;
    if editor <> 'current' then return result || jsonb_build_object('editor', jsonb_build_object('status', 'lost', 'reason', editor)); end if;
    perform edra_private.renew_exam_editor(attempt.id);
    return result || jsonb_build_object('state', edra_private.exam_answering_brief(target.id, p_record_id));
  end if;

  -- Returned rather than raised so the settlement above commits.
  if not edra_private.exam_attempt_active(attempt, target) then
    return jsonb_build_object('outcome', 'finalized', 'replayed', false, 'state', edra_private.exam_answering_terminal(target.id, p_record_id));
  end if;
  if (select generation from public.exam_editor_claims where attempt_id = attempt.id) is distinct from p_generation then editor := 'replaced'; end if;
  if editor <> 'current' then
    return jsonb_build_object('outcome', 'editor_lost', 'reason', editor, 'replayed', false);
  end if;

  result := edra_private.save_exam_answers_for(target.id, p_record_id, p_expected_version, p_answers, null);
  if result->>'outcome' = 'finalized' then
    return jsonb_build_object('outcome', 'finalized', 'replayed', false, 'state', edra_private.exam_answering_terminal(target.id, p_record_id));
  end if;
  perform edra_private.renew_exam_editor(attempt.id);
  select a.* into attempt from public.exam_attempts a where a.id = attempt.id;
  if result->>'outcome' = 'conflict' then
    return jsonb_build_object('outcome', 'conflict', 'answers_version', attempt.answers_version, 'replayed', false,
      'state', edra_private.exam_answering_brief(target.id, p_record_id));
  end if;
  select c.generation into claim_generation from public.exam_editor_claims c where c.attempt_id = attempt.id;
  return edra_private.remember_exam_request(p_key, 'answers', target, fingerprint,
    jsonb_build_object('outcome', 'saved', 'answers_version', attempt.answers_version, 'editor_generation', claim_generation))
    - 'editor_generation'
    || jsonb_build_object('state', edra_private.exam_answering_brief(target.id, p_record_id));
end;
$$;

-- Fenced final submission of the saved answers at the version the editor last acknowledged.
-- Outcomes: submitted | finalized | source_conflict (terminal state), conflict (brief state),
-- editor_lost. A retry with the same key replays the accepted outcome only.
create or replace function edra_private.submit_my_exam_for(p_exam_id uuid, p_record_id uuid, p_token text, p_expected_version integer, p_key uuid, p_generation integer)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  target public.exams%rowtype;
  work public.exam_work%rowtype;
  attempt public.exam_attempts%rowtype;
  fingerprint text := md5(jsonb_build_object('record', p_record_id, 'version', p_expected_version, 'generation', p_generation)::text);
  replay jsonb;
  editor text;
  result jsonb;
  claim_generation integer;
begin
  if p_generation is null or p_generation < 1 or p_key is null or p_expected_version is null or p_expected_version < 0 then raise exception using errcode = 'P0001', message = 'validation'; end if;
  perform edra_private.settle_exam_if_due(p_exam_id);
  target := edra_private.lock_exam_by_id(p_exam_id, false);
  perform edra_private.require_open_exam_year(target.academy_id, target.academic_year_id);
  perform edra_private.lock_exam_record(target, p_record_id);
  perform edra_private.settle_exam_record(target, p_record_id);
  work := edra_private.lock_exam_work(target, p_record_id, false);
  select a.* into attempt from public.exam_attempts a
  where a.exam_id = target.id and a.annual_student_record_id = p_record_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'not_open'; end if;

  replay := edra_private.exam_replay(p_key, 'submit', target.id, fingerprint);
  if replay is not null then
    return jsonb_build_object('outcome', replay->'outcome', 'replayed', true, 'state', edra_private.exam_answering_terminal(target.id, p_record_id));
  end if;
  -- Outcomes rather than errors so a settlement above commits.
  if work.accepted_source = 'physical' or attempt.superseded_at is not null then
    return jsonb_build_object('outcome', 'source_conflict', 'replayed', false, 'state', edra_private.exam_answering_terminal(target.id, p_record_id));
  end if;
  if not edra_private.exam_attempt_active(attempt, target) then
    return jsonb_build_object('outcome', 'finalized', 'replayed', false, 'state', edra_private.exam_answering_terminal(target.id, p_record_id));
  end if;
  editor := edra_private.exam_editor_state(attempt.id, p_token);
  if (select generation from public.exam_editor_claims where attempt_id = attempt.id) is distinct from p_generation then editor := 'replaced'; end if;
  if editor <> 'current' then
    return jsonb_build_object('outcome', 'editor_lost', 'reason', editor, 'replayed', false);
  end if;
  -- The editor submits what it acknowledged; anything newer must be reconciled first.
  if attempt.answers_version <> p_expected_version then
    return jsonb_build_object('outcome', 'conflict', 'answers_version', attempt.answers_version, 'replayed', false,
      'state', edra_private.exam_answering_brief(target.id, p_record_id));
  end if;
  result := edra_private.submit_exam_attempt_for(target.id, p_record_id, null);
  if result->>'outcome' <> 'submitted' then
    return jsonb_build_object('outcome', result->'outcome', 'replayed', false, 'state', edra_private.exam_answering_terminal(target.id, p_record_id));
  end if;
  select c.generation into claim_generation from public.exam_editor_claims c where c.attempt_id = attempt.id;
  perform edra_private.end_exam_editor(attempt.id);
  return edra_private.remember_exam_request(p_key, 'submit', target, fingerprint,
    jsonb_build_object('outcome', 'submitted', 'editor_generation', claim_generation))
    - 'editor_generation'
    || jsonb_build_object('state', edra_private.exam_answering_terminal(target.id, p_record_id));
end;
$$;

-- Fenced departure (EDRA-234 delivers the events). Accepted from the current editor, or from the
-- latest generation whose lease expired (a delayed refresh/close event is not dropped), never from a
-- replaced generation. The engine deduplicates by event id; a delivery never creates a claim.
create or replace function edra_private.record_my_exam_departure_for(p_exam_id uuid, p_record_id uuid, p_token text, p_event_id uuid, p_question_id uuid, p_generation integer)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  target public.exams%rowtype;
  attempt public.exam_attempts%rowtype;
  editor text := null;
  result jsonb;
begin
  if p_generation is null or p_generation < 1 or p_event_id is null or p_question_id is null then raise exception using errcode = 'P0001', message = 'validation'; end if;
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

-- The subset of p_image_ids that the current editor may read: images referenced by the prompt or a
-- choice of a non-excluded question of this exam, during the active attempt. Paths are built by the
-- trusted signer from the returned academy id; client paths are never accepted.
create or replace function edra_private.authorize_my_exam_images_for(p_exam_id uuid, p_record_id uuid, p_token text, p_image_ids uuid[])
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  target public.exams%rowtype;
  attempt public.exam_attempts%rowtype;
  claim public.exam_editor_claims%rowtype;
begin
  if p_image_ids is null or cardinality(p_image_ids) not between 1 and 20 or array_position(p_image_ids, null) is not null then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  select z.* into target from public.exams z where z.id = p_exam_id;
  if not found then raise exception using errcode = 'P0001', message = 'not_found'; end if;
  select a.* into attempt from public.exam_attempts a where a.exam_id = target.id and a.annual_student_record_id = p_record_id;
  if not found then raise exception using errcode = 'P0001', message = 'not_open'; end if;
  if not edra_private.exam_attempt_active(attempt, target) then return jsonb_build_object('status', 'finalized'); end if;
  perform edra_private.require_exam_placement(target, p_record_id);
  select c.* into claim from public.exam_editor_claims c where c.attempt_id = attempt.id;
  if not found or claim.expires_at <= clock_timestamp() or claim.token_hash is distinct from edra_private.exam_editor_hash(p_token) then
    return jsonb_build_object('status', 'lost');
  end if;
  return jsonb_build_object('status', 'ok', 'academy_id', target.academy_id, 'image_ids', coalesce((
    select jsonb_agg(distinct i) from unnest(p_image_ids) i
    where exists (
      select 1 from public.exam_questions q
      where q.exam_id = target.id and q.excluded_at is null
        and (strpos(q.prompt, '{{image:' || i::text || '}}') > 0
          or exists (select 1 from public.exam_choices c where c.question_id = q.id and strpos(c.label, '{{image:' || i::text || '}}') > 0))
    )), '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Public student entry points (cookie web boundary; authenticated only). Each resolves the caller's
-- record in the database; the academy id only locates the exam.

create or replace function edra_private.my_scoped_exam_record(p_academy_id uuid, p_exam_id uuid)
returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'forbidden'; end if;
  if p_academy_id is null or p_exam_id is null then raise exception using errcode = 'P0001', message = 'validation'; end if;
  if not exists (select 1 from public.exams z where z.id = p_exam_id and z.academy_id = p_academy_id) then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  return edra_private.require_exam_student(p_exam_id, true);
end;
$$;

-- Start or resume, then claim the editor in the same transaction. Returns {attempt, active, editor}
-- with attempt metadata only; a busy second editor receives no material and changes nothing.
create or replace function public.enter_my_exam(p_academy_id uuid, p_exam_id uuid, p_token text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  record_id uuid := edra_private.my_scoped_exam_record(p_academy_id, p_exam_id);
  target public.exams%rowtype;
  attempt public.exam_attempts%rowtype;
  editor jsonb;
  active boolean := false;
begin
  perform edra_private.charge_mutation_quota('op:exam_answer');
  perform edra_private.start_my_exam_for(p_exam_id, record_id);
  select z.* into target from public.exams z where z.id = p_exam_id;
  select a.* into attempt from public.exam_attempts a where a.exam_id = p_exam_id and a.annual_student_record_id = record_id;
  if not found then raise exception using errcode = 'P0001', message = 'not_open'; end if;
  if edra_private.exam_attempt_active(attempt, target) then
    editor := edra_private.claim_exam_editor_for(p_exam_id, record_id, p_token);
    active := editor->>'status' in ('claimed', 'busy');
    select a.* into attempt from public.exam_attempts a where a.id = attempt.id;
  end if;
  return jsonb_build_object('attempt', edra_private.exam_attempt_summary_json(attempt, target), 'active', active,
    'editor', case when active then editor - 'attempt' end);
end;
$$;

create or replace function public.claim_my_exam_editor(p_academy_id uuid, p_exam_id uuid, p_token text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  record_id uuid := edra_private.my_scoped_exam_record(p_academy_id, p_exam_id);
begin
  perform edra_private.charge_mutation_quota('op:exam_editor');
  return edra_private.claim_exam_editor_for(p_exam_id, record_id, p_token) - 'attempt';
end;
$$;

create or replace function public.renew_my_exam_editor(p_academy_id uuid, p_exam_id uuid, p_token text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  record_id uuid := edra_private.my_scoped_exam_record(p_academy_id, p_exam_id);
begin
  perform edra_private.charge_mutation_quota('op:exam_editor');
  return edra_private.exam_editor_command_for(p_exam_id, record_id, p_token, 'renew');
end;
$$;

create or replace function public.release_my_exam_editor(p_academy_id uuid, p_exam_id uuid, p_token text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  record_id uuid := edra_private.my_scoped_exam_record(p_academy_id, p_exam_id);
begin
  perform edra_private.charge_mutation_quota('op:exam_editor');
  return edra_private.exam_editor_command_for(p_exam_id, record_id, p_token, 'release');
end;
$$;

create or replace function public.get_my_exam_answering(p_academy_id uuid, p_exam_id uuid, p_token text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  record_id uuid := edra_private.my_scoped_exam_record(p_academy_id, p_exam_id);
begin
  perform edra_private.charge_mutation_quota('op:exam_editor');
  return edra_private.exam_editor_command_for(p_exam_id, record_id, p_token, 'read');
end;
$$;

create or replace function public.save_my_exam_answers(
  p_academy_id uuid, p_exam_id uuid, p_token text, p_expected_version integer, p_answers jsonb, p_key uuid, p_generation integer
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  record_id uuid := edra_private.my_scoped_exam_record(p_academy_id, p_exam_id);
begin
  perform edra_private.charge_mutation_quota('op:exam_answer');
  return edra_private.save_my_exam_answers_for(p_exam_id, record_id, p_token, p_expected_version, p_answers, p_key, p_generation);
end;
$$;

create or replace function public.submit_my_exam(p_academy_id uuid, p_exam_id uuid, p_token text, p_expected_version integer, p_key uuid, p_generation integer)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  record_id uuid := edra_private.my_scoped_exam_record(p_academy_id, p_exam_id);
begin
  perform edra_private.charge_mutation_quota('op:exam_answer');
  return edra_private.submit_my_exam_for(p_exam_id, record_id, p_token, p_expected_version, p_key, p_generation);
end;
$$;

create or replace function public.record_my_exam_departure(p_academy_id uuid, p_exam_id uuid, p_token text, p_event_id uuid, p_question_id uuid, p_generation integer)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  record_id uuid := edra_private.my_scoped_exam_record(p_academy_id, p_exam_id);
begin
  perform edra_private.charge_mutation_quota('op:exam_answer');
  return edra_private.record_my_exam_departure_for(p_exam_id, record_id, p_token, p_event_id, p_question_id, p_generation);
end;
$$;

create or replace function public.authorize_my_exam_images(p_academy_id uuid, p_exam_id uuid, p_token text, p_image_ids uuid[])
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  record_id uuid := edra_private.my_scoped_exam_record(p_academy_id, p_exam_id);
begin
  perform edra_private.charge_mutation_quota('op:exam_image');
  return edra_private.authorize_my_exam_images_for(p_exam_id, record_id, p_token, p_image_ids);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Legacy direct-RPC wrappers: same signatures, material only once solutions qualify.

create or replace function public.get_my_exam(p_exam_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  record_id uuid := edra_private.require_exam_student(p_exam_id, true);
begin
  perform edra_private.settle_exam_if_due(p_exam_id);
  return edra_private.exam_public_state(p_exam_id, record_id);
end;
$$;

create or replace function public.start_exam_attempt(p_exam_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  record_id uuid := edra_private.require_exam_student(p_exam_id, true);
begin
  perform edra_private.charge_mutation_quota('op:exam_answer');
  perform edra_private.start_my_exam_for(p_exam_id, record_id);
  return edra_private.exam_public_state(p_exam_id, record_id);
end;
$$;

create or replace function public.start_my_exam(p_academy_id uuid, p_exam_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  record_id uuid := edra_private.my_scoped_exam_record(p_academy_id, p_exam_id);
begin
  perform edra_private.charge_mutation_quota('op:exam_answer');
  perform edra_private.start_my_exam_for(p_exam_id, record_id);
  return edra_private.exam_public_state(p_exam_id, record_id);
end;
$$;

-- Unfenced student mutations: no client execution. The record-based engine functions stay private
-- for the fenced commands, staff and the worker.
revoke all on function public.save_exam_answers(uuid, integer, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.submit_exam_attempt(uuid, uuid) from public, anon, authenticated;
revoke all on function public.record_exam_departure(uuid, uuid, uuid) from public, anon, authenticated;

revoke all on function edra_private.exam_editor_lease() from public, anon, authenticated;
revoke all on function edra_private.exam_editor_heartbeat_seconds() from public, anon, authenticated;
revoke all on function edra_private.quota_limit(text) from public, anon, authenticated;
revoke all on function edra_private.exam_editor_hash(text) from public, anon, authenticated;
revoke all on function edra_private.exam_editor_state(uuid, text) from public, anon, authenticated;
revoke all on function edra_private.renew_exam_editor(uuid) from public, anon, authenticated;
revoke all on function edra_private.end_exam_editor(uuid) from public, anon, authenticated;
revoke all on function edra_private.exam_attempt_active(public.exam_attempts, public.exams) from public, anon, authenticated;
revoke all on function edra_private.exam_attempt_summary_json(public.exam_attempts, public.exams) from public, anon, authenticated;
revoke all on function edra_private.exam_answering_brief(uuid, uuid) from public, anon, authenticated;
revoke all on function edra_private.exam_answering_terminal(uuid, uuid) from public, anon, authenticated;
revoke all on function edra_private.exam_answering_json(uuid, uuid) from public, anon, authenticated;
revoke all on function edra_private.exam_public_state(uuid, uuid) from public, anon, authenticated;
revoke all on function edra_private.claim_exam_editor_for(uuid, uuid, text) from public, anon, authenticated;
revoke all on function edra_private.exam_editor_command_for(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function edra_private.save_my_exam_answers_for(uuid, uuid, text, integer, jsonb, uuid, integer) from public, anon, authenticated;
revoke all on function edra_private.submit_my_exam_for(uuid, uuid, text, integer, uuid, integer) from public, anon, authenticated;
revoke all on function edra_private.record_my_exam_departure_for(uuid, uuid, text, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function edra_private.authorize_my_exam_images_for(uuid, uuid, text, uuid[]) from public, anon, authenticated;
revoke all on function edra_private.my_scoped_exam_record(uuid, uuid) from public, anon, authenticated;

revoke all on function public.enter_my_exam(uuid, uuid, text) from public, anon;
revoke all on function public.claim_my_exam_editor(uuid, uuid, text) from public, anon;
revoke all on function public.renew_my_exam_editor(uuid, uuid, text) from public, anon;
revoke all on function public.release_my_exam_editor(uuid, uuid, text) from public, anon;
revoke all on function public.get_my_exam_answering(uuid, uuid, text) from public, anon;
revoke all on function public.save_my_exam_answers(uuid, uuid, text, integer, jsonb, uuid, integer) from public, anon;
revoke all on function public.submit_my_exam(uuid, uuid, text, integer, uuid, integer) from public, anon;
revoke all on function public.record_my_exam_departure(uuid, uuid, text, uuid, uuid, integer) from public, anon;
revoke all on function public.authorize_my_exam_images(uuid, uuid, text, uuid[]) from public, anon;
revoke all on function public.get_my_exam(uuid) from public, anon;
revoke all on function public.start_exam_attempt(uuid) from public, anon;
revoke all on function public.start_my_exam(uuid, uuid) from public, anon;
grant execute on function public.enter_my_exam(uuid, uuid, text) to authenticated;
grant execute on function public.claim_my_exam_editor(uuid, uuid, text) to authenticated;
grant execute on function public.renew_my_exam_editor(uuid, uuid, text) to authenticated;
grant execute on function public.release_my_exam_editor(uuid, uuid, text) to authenticated;
grant execute on function public.get_my_exam_answering(uuid, uuid, text) to authenticated;
grant execute on function public.save_my_exam_answers(uuid, uuid, text, integer, jsonb, uuid, integer) to authenticated;
grant execute on function public.submit_my_exam(uuid, uuid, text, integer, uuid, integer) to authenticated;
grant execute on function public.record_my_exam_departure(uuid, uuid, text, uuid, uuid, integer) to authenticated;
grant execute on function public.authorize_my_exam_images(uuid, uuid, text, uuid[]) to authenticated;
grant execute on function public.get_my_exam(uuid) to authenticated;
grant execute on function public.start_exam_attempt(uuid) to authenticated;
grant execute on function public.start_my_exam(uuid, uuid) to authenticated;
