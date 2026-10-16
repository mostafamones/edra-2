-- Exams (EDRA-78), slice 2: online attempts, physical entry, source acceptance, deadlines,
-- question-aware departures, private marks, official results, corrections, solution qualification
-- and the trusted student contract.
--
-- Work and acceptance:
--   * One aggregate per exam and annual student record (exam_work). Exactly one online attempt per
--     student; it keeps its original start, its individual timer deadline (always set: every online
--     exam is timed) and its departure count for life. Recovery resumes it; nothing creates a retake.
--   * An online draft (attempt answers) and a physical draft (staff transcription) may coexist.
--     Saving a draft never chooses the source. The first online final submission or physical
--     confirmation creates the student's single accepted submission and stops the other route. The
--     losing draft stays as history and is never merged into the result.
--   * New online attempts need opens_at <= now < closes_at. A started attempt continues until the
--     earlier of its timer deadline and actual closure (closes_at + 2 minutes). At that cutoff the
--     saved answers are finally submitted: reason timer when the timer deadline is at or before
--     actual closure (a tie included), otherwise window_closed. Never-started students get no
--     submission. Physical drafts and confirmation work once the exam is ready (also before opening
--     or without a window) and stop at actual closure.
--   * Departures: each logical event (stable event uuid per attempt) is stored once with the
--     question the student was on, its original number, the ordinal and the outcome. The first two
--     warn and return the next non-excluded question (none after the last one); the third submits
--     the saved answers with reason kicked. A duplicate event returns its original outcome. A due
--     timer or closure is settled first, so a late or retried event never reclassifies work. Kicked
--     is an explanatory flag: the work is graded normally.
--   * Database time is read after the locks, and every command first settles anything already due,
--     so a late save or confirmation never crosses a cutoff while waiting for the worker.
--
-- Results:
--   * Question Sheet questions score automatically against the current key (unanswered = 0).
--     Written Work questions need a staff mark; blank is unmarked, zero is marked. A result is
--     complete when every non-excluded Written Work question is marked.
--   * A fully automatic accepted online submission is announced in its acceptance transaction
--     (including timer, kicked and window_closed). Everything else is announced by staff, per
--     student or for selected students (all-or-nothing validation per batch). Each announcement
--     snapshots an immutable revision; an unchanged result creates nothing. Changes after an
--     announcement stay private (pending correction) until announced.
--   * Owner/Head Admin/Admin correct a Question Sheet key or exclude a question after the structure
--     locks. Both create a scoring revision and recalculate privately; official revisions stay.
--     Exclusion keeps the question, its number, answers and marks; the last scored question cannot
--     be excluded; nothing is reinstated.
--   * Solutions qualify for an accepted online submission at actual closure, and for accepted
--     physical work at actual closure plus an announced result, in either order. Qualification and
--     result announcements record deduplicated effects (exam_result_effects); recording one is not
--     parent delivery, content release or playback authorization.
--
-- Student identity is an integration dependency. The public student wrappers resolve the caller's
-- annual record through edra_private.exam_caller_record, which resolves nobody until an
-- authoritative account-to-record link exists (student_link_unavailable). Exams have no content
-- attachment yet, so edra_private.exam_content_access treats every exam as standalone: no release is
-- needed, but identity, audience, window and timer rules still apply. The record-based edra_private
-- functions are the tested trusted domain those wrappers call.
--
-- Lock order (as slice 1): academic year (share), exam (for update, or for key share for per-student
-- commands), annual record (share, for the placement check), exam_work rows in record id order,
-- attempt rows. Additional error codes: not_eligible, not_open, attempt_finalized, source_conflict,
-- not_submitted, incomplete, invalid_score, question_excluded, unknown_question, stale_basis,
-- invalid_exclusion, exam_work_pending, student_link_unavailable, content_unavailable,
-- idempotency_conflict.

create type public.exam_source as enum ('online', 'physical');
create type public.exam_finalization_reason as enum ('submitted', 'timer', 'kicked', 'window_closed', 'physical');
create type public.exam_effect_type as enum ('result_published', 'result_corrected', 'solutions_qualified');
create type public.exam_correction_kind as enum ('key', 'exclusion');

-- One row per student with any work. Created when an attempt starts or physical work is entered.
create table public.exam_work (
  exam_id uuid not null,
  annual_student_record_id uuid not null,
  academy_id uuid not null,
  academic_year_id uuid not null,
  accepted_source public.exam_source,
  accepted_submission_id uuid,
  feedback text not null default '' check (char_length(feedback) <= 5000),
  -- Marks, feedback, acceptance and scoring basis version (optimistic concurrency for staff).
  version integer not null default 1 check (version >= 1),
  -- Revision of the current official result; 0 while unannounced.
  published_revision integer not null default 0 check (published_revision >= 0),
  solutions_qualified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (exam_id, annual_student_record_id),
  foreign key (academy_id, academic_year_id, exam_id) references public.exams (academy_id, academic_year_id, id),
  foreign key (academy_id, academic_year_id, annual_student_record_id)
    references public.annual_student_records (academy_id, academic_year_id, id),
  constraint exam_work_acceptance_shape check ((accepted_source is null) = (accepted_submission_id is null)),
  constraint exam_work_result_shape check (published_revision = 0 or accepted_source is not null),
  constraint exam_work_solutions_shape check (solutions_qualified_at is null or accepted_source is not null)
);

create index exam_work_record_idx on public.exam_work (annual_student_record_id);

-- Single online attempt per student and exam. started_at and deadline_at never change.
create table public.exam_attempts (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null,
  exam_id uuid not null,
  annual_student_record_id uuid not null,
  started_at timestamptz not null,
  -- Original individual timer deadline (started_at + the exam's timer); never reset or extended.
  deadline_at timestamptz not null,
  -- Distinct departures recorded; the third ends the attempt (kicked).
  departure_count integer not null default 0 check (departure_count between 0 and 3),
  answers_version integer not null default 0 check (answers_version >= 0),
  last_saved_at timestamptz,
  finalized_at timestamptz,
  finalization_reason public.exam_finalization_reason,
  -- Set when physical work was accepted first; the attempt stays as history.
  superseded_at timestamptz,
  unique (exam_id, annual_student_record_id),
  unique (exam_id, id),
  foreign key (exam_id, annual_student_record_id) references public.exam_work (exam_id, annual_student_record_id),
  foreign key (academy_id, exam_id) references public.exams (academy_id, id),
  constraint exam_attempts_deadline_shape check (deadline_at > started_at),
  constraint exam_attempts_final_shape check (
    (finalized_at is null) = (finalization_reason is null)
    and (finalization_reason is null or finalization_reason <> 'physical')
    and (finalized_at is null or superseded_at is null)
  )
);

create index exam_attempts_open_idx on public.exam_attempts (exam_id, deadline_at) where finalized_at is null and superseded_at is null;

-- The attempt's durably saved answers (online draft).
create table public.exam_online_answers (
  attempt_id uuid not null,
  academy_id uuid not null,
  exam_id uuid not null,
  question_id uuid not null,
  choice_id uuid,
  text_answer text check (text_answer is null or char_length(text_answer) <= 10000),
  saved_at timestamptz not null,
  primary key (attempt_id, question_id),
  foreign key (exam_id, attempt_id) references public.exam_attempts (exam_id, id),
  foreign key (exam_id, question_id) references public.exam_questions (exam_id, id),
  foreign key (question_id, choice_id) references public.exam_choices (question_id, id),
  constraint exam_online_answers_shape check (choice_id is null or text_answer is null)
);

-- Departure events reported by the student client, stored once per logical event. Browser signals
-- are client evidence, not proof of proctoring. Immutable.
create table public.exam_departures (
  attempt_id uuid not null,
  event_id uuid not null,
  academy_id uuid not null,
  exam_id uuid not null,
  ordinal integer not null check (ordinal between 1 and 3),
  -- The question the student was on and its original exam-wide number.
  question_id uuid not null,
  question_number integer not null check (question_number >= 1),
  outcome text not null check (outcome in ('warned', 'kicked')),
  -- Where a warned student continues: the next non-excluded question, null after the last one.
  next_question_id uuid,
  recorded_at timestamptz not null,
  primary key (attempt_id, event_id),
  unique (attempt_id, ordinal),
  foreign key (exam_id, attempt_id) references public.exam_attempts (exam_id, id),
  foreign key (exam_id, question_id) references public.exam_questions (exam_id, id),
  foreign key (exam_id, next_question_id) references public.exam_questions (exam_id, id),
  foreign key (academy_id, exam_id) references public.exams (academy_id, id),
  constraint exam_departures_outcome_shape check (
    (outcome = 'kicked') = (ordinal = 3) and (outcome = 'warned' or next_question_id is null)
  )
);

-- Staff transcription of physical Question Sheet answers, independent of the online draft.
create table public.exam_physical_drafts (
  exam_id uuid not null,
  annual_student_record_id uuid not null,
  academy_id uuid not null,
  version integer not null default 1 check (version >= 1),
  updated_by uuid not null references public.profiles (id),
  updated_at timestamptz not null,
  primary key (exam_id, annual_student_record_id),
  foreign key (exam_id, annual_student_record_id) references public.exam_work (exam_id, annual_student_record_id),
  foreign key (academy_id, exam_id) references public.exams (academy_id, id)
);

create table public.exam_physical_answers (
  exam_id uuid not null,
  annual_student_record_id uuid not null,
  academy_id uuid not null,
  question_id uuid not null,
  -- Null: entered as left blank.
  choice_id uuid,
  primary key (exam_id, annual_student_record_id, question_id),
  foreign key (exam_id, annual_student_record_id) references public.exam_physical_drafts (exam_id, annual_student_record_id),
  foreign key (exam_id, question_id) references public.exam_questions (exam_id, id),
  foreign key (question_id, choice_id) references public.exam_choices (question_id, id)
);

-- The single accepted final submission. Immutable.
create table public.exam_submissions (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null,
  academic_year_id uuid not null,
  exam_id uuid not null,
  annual_student_record_id uuid not null,
  source public.exam_source not null,
  reason public.exam_finalization_reason not null,
  attempt_id uuid,
  -- Effective submission time (the cutoff for deadline finalization), and when it was processed.
  submitted_at timestamptz not null,
  processed_at timestamptz not null,
  original_deadline_at timestamptz,
  scoring_revision integer not null,
  confirmed_by uuid references public.profiles (id),
  unique (exam_id, annual_student_record_id),
  unique (exam_id, id),
  foreign key (exam_id, annual_student_record_id) references public.exam_work (exam_id, annual_student_record_id),
  foreign key (exam_id, attempt_id) references public.exam_attempts (exam_id, id),
  foreign key (academy_id, academic_year_id, exam_id) references public.exams (academy_id, academic_year_id, id),
  constraint exam_submissions_source_shape check (
    (source = 'online' and attempt_id is not null and reason <> 'physical' and confirmed_by is null)
    or (source = 'physical' and attempt_id is null and reason = 'physical' and confirmed_by is not null)
  )
);

alter table public.exam_work add constraint exam_work_submission_fk
  foreign key (exam_id, accepted_submission_id) references public.exam_submissions (exam_id, id);

-- The answers frozen at acceptance. Immutable.
create table public.exam_submission_answers (
  submission_id uuid not null references public.exam_submissions (id),
  academy_id uuid not null,
  exam_id uuid not null,
  question_id uuid not null,
  choice_id uuid,
  text_answer text,
  primary key (submission_id, question_id),
  foreign key (exam_id, question_id) references public.exam_questions (exam_id, id),
  foreign key (question_id, choice_id) references public.exam_choices (question_id, id)
);

-- Private per-question staff marks on Written Work questions of the accepted submission.
create table public.exam_marks (
  exam_id uuid not null,
  annual_student_record_id uuid not null,
  academy_id uuid not null,
  question_id uuid not null,
  score numeric(7, 2) not null check (score >= 0 and score <= 1000),
  updated_by uuid not null references public.profiles (id),
  updated_at timestamptz not null,
  primary key (exam_id, annual_student_record_id, question_id),
  foreign key (exam_id, annual_student_record_id) references public.exam_work (exam_id, annual_student_record_id),
  foreign key (exam_id, question_id) references public.exam_questions (exam_id, id)
);

-- Immutable key corrections and exclusions; revision is the exam scoring revision it created.
create table public.exam_corrections (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null,
  exam_id uuid not null,
  revision integer not null check (revision >= 2),
  kind public.exam_correction_kind not null,
  question_id uuid not null,
  previous_choice_id uuid,
  choice_id uuid,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (exam_id, revision),
  foreign key (exam_id, question_id) references public.exam_questions (exam_id, id),
  foreign key (academy_id, exam_id) references public.exams (academy_id, id),
  constraint exam_corrections_shape check ((kind = 'key') = (choice_id is not null))
);

-- Immutable official revisions of a student's result.
create table public.exam_result_publications (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null,
  academic_year_id uuid not null,
  exam_id uuid not null,
  annual_student_record_id uuid not null,
  revision integer not null check (revision >= 1),
  total numeric(9, 2) not null check (total >= 0),
  max_score numeric(9, 2) not null check (max_score > 0),
  scoring_revision integer not null,
  -- [{question_id, number, kind, max_score, excluded, score}] in question order.
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  feedback text not null,
  content_hash text not null,
  previous_publication_id uuid references public.exam_result_publications (id),
  -- Fully automatic online results are announced by the acceptance transaction, not a person.
  automatic boolean not null,
  published_by uuid references public.profiles (id),
  published_at timestamptz not null default now(),
  unique (exam_id, annual_student_record_id, revision),
  unique (academy_id, id),
  foreign key (exam_id, annual_student_record_id) references public.exam_work (exam_id, annual_student_record_id),
  foreign key (academy_id, academic_year_id, exam_id) references public.exams (academy_id, academic_year_id, id),
  constraint exam_result_publications_actor_shape check (automatic = (published_by is null)),
  constraint exam_result_publications_previous_shape check ((revision = 1) = (previous_publication_id is null))
);

create index exam_result_publications_student_idx on public.exam_result_publications (exam_id, annual_student_record_id, revision desc);

-- Transactional outbox for result and solution effects; consumers are separate modules.
create table public.exam_result_effects (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null,
  exam_id uuid not null,
  annual_student_record_id uuid not null,
  publication_id uuid,
  effect_type public.exam_effect_type not null,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  foreign key (academy_id, publication_id) references public.exam_result_publications (academy_id, id),
  foreign key (exam_id, annual_student_record_id) references public.exam_work (exam_id, annual_student_record_id),
  constraint exam_result_effects_shape check ((effect_type = 'solutions_qualified') = (publication_id is null)),
  unique (publication_id, effect_type)
);

create unique index exam_result_effects_solutions_once on public.exam_result_effects (exam_id, annual_student_record_id)
  where effect_type = 'solutions_qualified';
create index exam_result_effects_pending_idx on public.exam_result_effects (created_at) where processed_at is null;

-- Actual closure settlement: unfinished attempts finalized and online solutions qualified.
create table public.exam_closures (
  exam_id uuid primary key references public.exams (id),
  academy_id uuid not null,
  closed_at timestamptz not null,
  settled_at timestamptz not null
);

-- Retried commands. The stored response commits with the write it describes.
create table public.exam_requests (
  actor_id uuid not null references public.profiles (id),
  idempotency_key uuid not null,
  operation text not null check (operation in ('answers', 'submit', 'physical_draft', 'confirm', 'marks', 'announce', 'correct')),
  academy_id uuid not null,
  exam_id uuid not null,
  fingerprint text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (actor_id, idempotency_key)
);

create index exam_requests_created_idx on public.exam_requests (created_at);

-- History guards.
create or replace function edra_private.reject_exam_history_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = 'validation', hint = 'Exam submissions, departures, corrections and official results are immutable.';
end;
$$;

create trigger exam_submissions_immutable before update or delete on public.exam_submissions
for each row execute function edra_private.reject_exam_history_change();
create trigger exam_submission_answers_immutable before update or delete on public.exam_submission_answers
for each row execute function edra_private.reject_exam_history_change();
create trigger exam_corrections_immutable before update or delete on public.exam_corrections
for each row execute function edra_private.reject_exam_history_change();
create trigger exam_result_publications_immutable before update or delete on public.exam_result_publications
for each row execute function edra_private.reject_exam_history_change();
create trigger exam_work_no_delete before delete on public.exam_work
for each row execute function edra_private.reject_exam_history_change();
create trigger exam_attempts_no_delete before delete on public.exam_attempts
for each row execute function edra_private.reject_exam_history_change();
create trigger exam_departures_immutable before update or delete on public.exam_departures
for each row execute function edra_private.reject_exam_history_change();

-- An attempt's start and original deadline never change, and a finished attempt never reopens.
create or replace function edra_private.guard_exam_attempt()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.exam_id, new.annual_student_record_id, new.started_at, new.deadline_at)
      is distinct from (old.exam_id, old.annual_student_record_id, old.started_at, old.deadline_at)
    or new.departure_count < old.departure_count
    or (old.finalized_at is not null and (new.finalized_at, new.finalization_reason) is distinct from (old.finalized_at, old.finalization_reason))
    or (old.superseded_at is not null and new.superseded_at is distinct from old.superseded_at) then
    raise exception using errcode = 'P0001', message = 'attempt_finalized';
  end if;
  return new;
end;
$$;

create trigger exam_attempts_guard before update on public.exam_attempts
for each row execute function edra_private.guard_exam_attempt();

-- The accepted source never changes once set.
create or replace function edra_private.guard_exam_work()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.accepted_submission_id is not null
    and (new.accepted_submission_id, new.accepted_source) is distinct from (old.accepted_submission_id, old.accepted_source) then
    raise exception using errcode = 'P0001', message = 'source_conflict';
  end if;
  return new;
end;
$$;

create trigger exam_work_guard before update on public.exam_work
for each row execute function edra_private.guard_exam_work();

alter table public.exam_work enable row level security;
alter table public.exam_attempts enable row level security;
alter table public.exam_online_answers enable row level security;
alter table public.exam_departures enable row level security;
alter table public.exam_physical_drafts enable row level security;
alter table public.exam_physical_answers enable row level security;
alter table public.exam_submissions enable row level security;
alter table public.exam_submission_answers enable row level security;
alter table public.exam_marks enable row level security;
alter table public.exam_corrections enable row level security;
alter table public.exam_result_publications enable row level security;
alter table public.exam_result_effects enable row level security;
alter table public.exam_closures enable row level security;
alter table public.exam_requests enable row level security;

revoke all on public.exam_work, public.exam_attempts, public.exam_online_answers, public.exam_departures,
  public.exam_physical_drafts, public.exam_physical_answers, public.exam_submissions, public.exam_submission_answers,
  public.exam_marks, public.exam_corrections, public.exam_result_publications, public.exam_result_effects,
  public.exam_closures, public.exam_requests
  from public, anon, authenticated;
-- Staff reads (active members of the academy). Effects and request replays stay server-only.
grant select on public.exam_work, public.exam_attempts, public.exam_submissions, public.exam_corrections,
  public.exam_result_publications to authenticated;

create policy exam_work_select_staff on public.exam_work
  for select to authenticated using (public.is_academy_member(academy_id));
create policy exam_attempts_select_staff on public.exam_attempts
  for select to authenticated using (public.is_academy_member(academy_id));
create policy exam_submissions_select_staff on public.exam_submissions
  for select to authenticated using (public.is_academy_member(academy_id));
create policy exam_corrections_select_staff on public.exam_corrections
  for select to authenticated using (public.is_academy_member(academy_id));
create policy exam_result_publications_select_staff on public.exam_result_publications
  for select to authenticated using (public.is_academy_member(academy_id));

-- ---------------------------------------------------------------------------------------------
-- Scoring.

-- The student's current private result on their accepted submission:
--   { complete, total, max_score, marked, required, feedback, scoring_revision, items: [...] }
-- or null without an accepted submission. Items are in original question order and keep excluded
-- questions (score retained, weight removed).
create or replace function edra_private.exam_result_content(p_exam_id uuid, p_record_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  with work as (
    select w.* from public.exam_work w
    where w.exam_id = p_exam_id and w.annual_student_record_id = p_record_id and w.accepted_submission_id is not null
  ),
  items as (
    select row_number() over (order by p.position, q.position) as number, q.id as question_id, p.kind, q.max_score,
      q.excluded_at is not null as excluded, sa.choice_id,
      case p.kind
        when 'question_sheet' then case when c.id is not null then q.max_score else 0 end
        else m.score
      end as score
    from work w
    join public.exam_questions q on q.exam_id = w.exam_id
    join public.exam_parts p on p.id = q.part_id
    left join public.exam_submission_answers sa on sa.submission_id = w.accepted_submission_id and sa.question_id = q.id
    left join public.exam_choices c on c.question_id = q.id and c.id = sa.choice_id and c.is_correct
    left join public.exam_marks m on m.exam_id = w.exam_id and m.annual_student_record_id = w.annual_student_record_id and m.question_id = q.id
  )
  select jsonb_build_object(
    'complete', not exists (select 1 from items i where not i.excluded and i.score is null),
    'total', coalesce((select sum(i.score) from items i where not i.excluded), 0)::text,
    'max_score', coalesce((select sum(i.max_score) from items i where not i.excluded), 0)::text,
    'marked', (select count(*) from items i where not i.excluded and i.kind = 'written_work' and i.score is not null),
    'required', (select count(*) from items i where not i.excluded and i.kind = 'written_work'),
    'feedback', w.feedback,
    'scoring_revision', (select z.scoring_revision from public.exams z where z.id = p_exam_id),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'question_id', i.question_id, 'number', i.number, 'kind', i.kind, 'max_score', i.max_score::text,
        'excluded', i.excluded, 'score', i.score::text
      ) order by i.number) from items i), '[]'::jsonb)
  )
  from work w;
$$;

-- The comparable part of a result: what an announcement freezes. The scoring revision is excluded
-- so a correction that does not change this student's result needs no new revision.
create or replace function edra_private.exam_result_hash(p_content jsonb)
returns text
language sql immutable set search_path = '' as $$
  select md5(jsonb_build_object('total', p_content->'total', 'max_score', p_content->'max_score',
    'feedback', p_content->'feedback', 'items', p_content->'items')::text);
$$;

-- True when no non-excluded Written Work question exists: results are announced automatically.
create or replace function edra_private.exam_fully_automatic(p_exam_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1 from public.exam_questions q join public.exam_parts p on p.id = q.part_id
    where q.exam_id = p_exam_id and q.excluded_at is null and p.kind = 'written_work'
  );
$$;

-- ---------------------------------------------------------------------------------------------
-- Internal helpers.

create or replace function edra_private.exam_replay(p_key uuid, p_operation text, p_exam_id uuid, p_fingerprint text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  stored public.exam_requests%rowtype;
begin
  if p_key is null or auth.uid() is null then return null; end if;
  select q.* into stored from public.exam_requests q where q.actor_id = auth.uid() and q.idempotency_key = p_key;
  if not found then return null; end if;
  if stored.operation <> p_operation or stored.exam_id <> p_exam_id or stored.fingerprint <> p_fingerprint then
    raise exception using errcode = 'P0001', message = 'idempotency_conflict';
  end if;
  return stored.response || jsonb_build_object('replayed', true);
end;
$$;

create or replace function edra_private.remember_exam_request(
  p_key uuid, p_operation text, p_target public.exams, p_fingerprint text, p_response jsonb
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if p_key is not null and auth.uid() is not null then
    insert into public.exam_requests (actor_id, idempotency_key, operation, academy_id, exam_id, fingerprint, response)
    values (auth.uid(), p_key, p_operation, p_target.academy_id, p_target.id, p_fingerprint, p_response);
  end if;
  return p_response || jsonb_build_object('replayed', false);
end;
$$;

-- Year share lock, then the exam row (exclusive or key share). For trusted per-exam entry points
-- that are not scoped by an academy argument (the student domain).
create or replace function edra_private.lock_exam_by_id(p_exam_id uuid, p_exclusive boolean)
returns public.exams
language plpgsql security definer set search_path = '' as $$
declare
  target public.exams%rowtype;
  year_id uuid;
begin
  select z.academic_year_id into year_id from public.exams z where z.id = p_exam_id;
  if not found then raise exception using errcode = 'P0001', message = 'not_found'; end if;
  perform 1 from public.academic_years y where y.id = year_id for share;
  if p_exclusive then
    select z.* into target from public.exams z where z.id = p_exam_id for update;
  else
    select z.* into target from public.exams z where z.id = p_exam_id for key share;
  end if;
  if not found then raise exception using errcode = 'P0001', message = 'not_found'; end if;
  return target;
end;
$$;

-- Share-locks the student's annual record of the exam's academy and year, so a placement check and
-- the write that follows are atomic with a concurrent placement move (moves lock the record).
create or replace function edra_private.lock_exam_record(p_target public.exams, p_record_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_record_id is null then return; end if;
  perform 1 from public.annual_student_records r
  where r.id = p_record_id and r.academy_id = p_target.academy_id and r.academic_year_id = p_target.academic_year_id
  for share;
end;
$$;

-- Raises not_eligible unless the record is in the exam's current audience (live eligibility).
create or replace function edra_private.require_exam_placement(p_target public.exams, p_record_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform edra_private.lock_exam_record(p_target, p_record_id);
  if not edra_private.exam_is_eligible(p_target.id, p_record_id) then
    raise exception using errcode = 'P0001', message = 'not_eligible';
  end if;
end;
$$;

-- The student's work row, created if absent, locked for update.
create or replace function edra_private.lock_exam_work(p_target public.exams, p_record_id uuid, p_create boolean)
returns public.exam_work
language plpgsql security definer set search_path = '' as $$
declare
  work public.exam_work%rowtype;
begin
  if p_record_id is null then raise exception using errcode = 'P0001', message = 'validation'; end if;
  if p_create then
    perform 1 from public.annual_student_records r
    where r.id = p_record_id and r.academy_id = p_target.academy_id and r.academic_year_id = p_target.academic_year_id;
    if not found then raise exception using errcode = 'P0001', message = 'not_eligible'; end if;
    insert into public.exam_work (exam_id, annual_student_record_id, academy_id, academic_year_id)
    values (p_target.id, p_record_id, p_target.academy_id, p_target.academic_year_id)
    on conflict do nothing;
  end if;
  select w.* into work from public.exam_work w
  where w.exam_id = p_target.id and w.annual_student_record_id = p_record_id
  for update;
  return work;
end;
$$;

-- Records that work began (target/timer lock) and optionally that the structure locked. Only the
-- first writer updates the exam row; the others re-check and skip.
create or replace function edra_private.mark_exam_activity(p_target public.exams, p_structure boolean)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_target.work_started_at is null then
    update public.exams set work_started_at = clock_timestamp() where id = p_target.id and work_started_at is null;
  end if;
  if p_structure and p_target.structure_locked_at is null then
    update public.exams set structure_locked_at = clock_timestamp(),
      work_started_at = coalesce(work_started_at, clock_timestamp())
    where id = p_target.id and structure_locked_at is null;
  end if;
end;
$$;

-- Records the solutions qualification and its effect once.
create or replace function edra_private.qualify_exam_solutions(p_target public.exams, p_record_id uuid, p_at timestamptz)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.exam_work set solutions_qualified_at = p_at
  where exam_id = p_target.id and annual_student_record_id = p_record_id and solutions_qualified_at is null;
  if found then
    insert into public.exam_result_effects (academy_id, exam_id, annual_student_record_id, effect_type)
    values (p_target.academy_id, p_target.id, p_record_id, 'solutions_qualified')
    on conflict do nothing;
  end if;
end;
$$;

-- Qualifies the student when the rule holds at p_at (caller holds the work row lock).
create or replace function edra_private.refresh_exam_qualification(p_target public.exams, p_record_id uuid, p_at timestamptz)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  work public.exam_work%rowtype;
begin
  if p_target.actual_closes_at is null or p_at < p_target.actual_closes_at then return; end if;
  select w.* into work from public.exam_work w where w.exam_id = p_target.id and w.annual_student_record_id = p_record_id;
  if work.accepted_source = 'online' or (work.accepted_source = 'physical' and work.published_revision > 0) then
    perform edra_private.qualify_exam_solutions(p_target, p_record_id, p_at);
  end if;
end;
$$;

-- Announces the student's current complete result (caller holds the work row lock). Returns
-- {annual_student_record_id, outcome: published|corrected|unchanged, revision}.
create or replace function edra_private.announce_exam_result(p_target public.exams, p_record_id uuid, p_automatic boolean, p_at timestamptz)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  content jsonb := edra_private.exam_result_content(p_target.id, p_record_id);
  content_hash text;
  latest public.exam_result_publications%rowtype;
  publication uuid;
  next_revision integer;
begin
  if content is null then raise exception using errcode = 'P0001', message = 'not_submitted'; end if;
  if not (content->>'complete')::boolean then raise exception using errcode = 'P0001', message = 'incomplete'; end if;
  if (content->>'max_score')::numeric <= 0 then raise exception using errcode = 'P0001', message = 'incomplete'; end if;
  content_hash := edra_private.exam_result_hash(content);
  select p.* into latest from public.exam_result_publications p
  where p.exam_id = p_target.id and p.annual_student_record_id = p_record_id
  order by p.revision desc limit 1;
  if latest.id is not null and latest.content_hash = content_hash then
    return jsonb_build_object('annual_student_record_id', p_record_id, 'outcome', 'unchanged', 'revision', latest.revision);
  end if;
  next_revision := coalesce(latest.revision, 0) + 1;
  insert into public.exam_result_publications (
    academy_id, academic_year_id, exam_id, annual_student_record_id, revision, total, max_score, scoring_revision, items,
    feedback, content_hash, previous_publication_id, automatic, published_by, published_at
  ) values (
    p_target.academy_id, p_target.academic_year_id, p_target.id, p_record_id, next_revision, (content->>'total')::numeric,
    (content->>'max_score')::numeric, (content->>'scoring_revision')::integer, content->'items', content->>'feedback',
    content_hash, latest.id, p_automatic, case when p_automatic then null else auth.uid() end, p_at
  ) returning id into publication;
  insert into public.exam_result_effects (academy_id, exam_id, annual_student_record_id, publication_id, effect_type)
  values (p_target.academy_id, p_target.id, p_record_id, publication,
    case when next_revision = 1 then 'result_published' else 'result_corrected' end::public.exam_effect_type);
  update public.exam_work set published_revision = next_revision, updated_at = p_at
  where exam_id = p_target.id and annual_student_record_id = p_record_id;
  perform edra_private.refresh_exam_qualification(p_target, p_record_id, p_at);
  return jsonb_build_object('annual_student_record_id', p_record_id,
    'outcome', case when next_revision = 1 then 'published' else 'corrected' end, 'revision', next_revision);
end;
$$;

-- Accepts the student's single final submission (caller holds the exam and work row locks and has
-- checked that nothing was accepted yet). Freezes only durably saved answers of the winning source.
create or replace function edra_private.accept_exam_submission(
  p_target public.exams, p_record_id uuid, p_source public.exam_source, p_reason public.exam_finalization_reason,
  p_submitted_at timestamptz, p_at timestamptz
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  attempt public.exam_attempts%rowtype;
  submission uuid;
  current_revision integer;
begin
  -- Accepted work can never exist under an unlocked scoring structure: lock before any result is computed.
  perform edra_private.mark_exam_activity(p_target, true);
  select z.scoring_revision into current_revision from public.exams z where z.id = p_target.id;
  if p_source = 'online' then
    select a.* into attempt from public.exam_attempts a
    where a.exam_id = p_target.id and a.annual_student_record_id = p_record_id for update;
    insert into public.exam_submissions (
      academy_id, academic_year_id, exam_id, annual_student_record_id, source, reason, attempt_id, submitted_at, processed_at,
      original_deadline_at, scoring_revision
    ) values (
      p_target.academy_id, p_target.academic_year_id, p_target.id, p_record_id, 'online', p_reason, attempt.id, p_submitted_at, p_at,
      attempt.deadline_at, current_revision
    ) returning id into submission;
    insert into public.exam_submission_answers (submission_id, academy_id, exam_id, question_id, choice_id, text_answer)
    select submission, p_target.academy_id, p_target.id, o.question_id, o.choice_id, o.text_answer
    from public.exam_online_answers o where o.attempt_id = attempt.id;
    update public.exam_attempts set finalized_at = p_submitted_at, finalization_reason = p_reason where id = attempt.id;
  else
    insert into public.exam_submissions (
      academy_id, academic_year_id, exam_id, annual_student_record_id, source, reason, submitted_at, processed_at,
      scoring_revision, confirmed_by
    ) values (
      p_target.academy_id, p_target.academic_year_id, p_target.id, p_record_id, 'physical', 'physical', p_submitted_at, p_at,
      current_revision, auth.uid()
    ) returning id into submission;
    insert into public.exam_submission_answers (submission_id, academy_id, exam_id, question_id, choice_id)
    select submission, p_target.academy_id, p_target.id, a.question_id, a.choice_id
    from public.exam_physical_answers a where a.exam_id = p_target.id and a.annual_student_record_id = p_record_id;
    -- The online draft stays as history and can no longer finalize.
    update public.exam_attempts set superseded_at = p_at
    where exam_id = p_target.id and annual_student_record_id = p_record_id and finalized_at is null and superseded_at is null;
  end if;
  update public.exam_work set accepted_source = p_source, accepted_submission_id = submission, version = version + 1, updated_at = p_at
  where exam_id = p_target.id and annual_student_record_id = p_record_id;
  if p_source = 'online' and edra_private.exam_fully_automatic(p_target.id) then
    perform edra_private.announce_exam_result(p_target, p_record_id, true, p_at);
  end if;
  perform edra_private.refresh_exam_qualification(p_target, p_record_id, p_at);
  return submission;
end;
$$;

-- Finalizes the student's attempt if its cutoff has passed (caller holds the exam lock).
-- The timer reason wins when the original deadline is at or before actual closure.
create or replace function edra_private.settle_exam_record(p_target public.exams, p_record_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  attempt public.exam_attempts%rowtype;
  work public.exam_work%rowtype;
  cutoff timestamptz;
  t_now timestamptz;
begin
  select a.* into attempt from public.exam_attempts a
  where a.exam_id = p_target.id and a.annual_student_record_id = p_record_id;
  if not found or attempt.finalized_at is not null or attempt.superseded_at is not null then return; end if;
  work := edra_private.lock_exam_work(p_target, p_record_id, false);
  select a.* into attempt from public.exam_attempts a where a.id = attempt.id for update;
  t_now := clock_timestamp();
  cutoff := least(attempt.deadline_at, p_target.actual_closes_at);
  if attempt.finalized_at is not null or attempt.superseded_at is not null or cutoff is null or t_now < cutoff then return; end if;
  if work.accepted_submission_id is not null then
    update public.exam_attempts set superseded_at = t_now where id = attempt.id;
    return;
  end if;
  perform edra_private.accept_exam_submission(p_target, p_record_id, 'online',
    case when p_target.actual_closes_at is null or attempt.deadline_at <= p_target.actual_closes_at
      then 'timer' else 'window_closed' end::public.exam_finalization_reason,
    cutoff, t_now);
end;
$$;

-- Settles every due attempt of an exam (caller holds an exam lock), in record order.
create or replace function edra_private.settle_exam_attempts(p_target public.exams)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  due record;
  settled integer := 0;
begin
  for due in
    select a.annual_student_record_id from public.exam_attempts a
    where a.exam_id = p_target.id and a.finalized_at is null and a.superseded_at is null
      and least(a.deadline_at, p_target.actual_closes_at) <= clock_timestamp()
    order by a.annual_student_record_id
  loop
    perform edra_private.settle_exam_record(p_target, due.annual_student_record_id);
    settled := settled + 1;
  end loop;
  return settled;
end;
$$;

-- Settles actual closure: every due attempt, the closure record and solution qualification for all
-- qualifying students. Takes the exclusive exam lock, so it never interleaves with per-student
-- commands; call it before taking any other lock on the exam. Returns the number of attempts settled.
create or replace function edra_private.settle_exam_closure(p_exam_id uuid)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  target public.exams%rowtype;
  settled integer;
  t_now timestamptz;
  qualifying record;
begin
  -- Year share lock first (the lock order shared with year closure), then the exclusive exam lock.
  select z.* into target from public.exams z where z.id = p_exam_id;
  if not found or target.actual_closes_at is null then return 0; end if;
  perform 1 from public.academic_years y where y.id = target.academic_year_id for share;
  select z.* into target from public.exams z where z.id = p_exam_id for update;
  if not found then return 0; end if;
  perform 1 from public.academic_years y where y.id = target.academic_year_id and y.closed_at is null;
  if not found then return 0; end if;
  settled := edra_private.settle_exam_attempts(target);
  t_now := clock_timestamp();
  if t_now < target.actual_closes_at then return settled; end if;
  insert into public.exam_closures (exam_id, academy_id, closed_at, settled_at)
  values (target.id, target.academy_id, target.actual_closes_at, t_now)
  on conflict do nothing;
  for qualifying in
    select w.annual_student_record_id from public.exam_work w
    where w.exam_id = target.id and w.solutions_qualified_at is null
      and (w.accepted_source = 'online' or (w.accepted_source = 'physical' and w.published_revision > 0))
    order by w.annual_student_record_id
  loop
    perform 1 from public.exam_work w where w.exam_id = target.id and w.annual_student_record_id = qualifying.annual_student_record_id for update;
    perform edra_private.qualify_exam_solutions(target, qualifying.annual_student_record_id, t_now);
  end loop;
  return settled;
end;
$$;

-- True when anything is due: an attempt past its cutoff, or an unsettled actual closure.
create or replace function edra_private.exam_has_due_work(p_exam_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.exam_attempts a join public.exams z on z.id = a.exam_id
    where a.exam_id = p_exam_id and a.finalized_at is null and a.superseded_at is null
      and least(a.deadline_at, z.actual_closes_at) <= clock_timestamp()
  ) or exists (
    select 1 from public.exams z
    where z.id = p_exam_id and z.actual_closes_at <= clock_timestamp()
      and not exists (select 1 from public.exam_closures c where c.exam_id = z.id)
  );
$$;

-- Reads settle due work first (its own transaction step, before other locks).
create or replace function edra_private.settle_exam_if_due(p_exam_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if edra_private.exam_has_due_work(p_exam_id) then perform edra_private.settle_exam_closure(p_exam_id); end if;
end;
$$;

-- Staff commands settle only an exam of the caller's academy (not_found otherwise).
create or replace function edra_private.settle_staff_exam(p_academy_id uuid, p_exam_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.exams z where z.id = p_exam_id and z.academy_id = p_academy_id) then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  perform edra_private.settle_exam_if_due(p_exam_id);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Student projection.

-- One recorded departure, as returned to the student and shown to staff.
create or replace function edra_private.exam_departure_json(p_departure public.exam_departures)
returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'event_id', p_departure.event_id, 'ordinal', p_departure.ordinal, 'question_id', p_departure.question_id,
    'question_number', p_departure.question_number, 'outcome', p_departure.outcome,
    'next_question_id', p_departure.next_question_id, 'recorded_at', p_departure.recorded_at
  );
$$;

-- Student projection (safe, built field by field; never derived from the staff document): authored
-- questions and choices with original numbering and excluded state, the window, timer and server
-- time, the caller's own attempt (answers, original deadline, departures), the accepted submission,
-- the latest official result and, once qualified, the solutions. No keys, model answers or solution
-- notes before qualification; no private marks or partial scores ever.
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
    'excluded_question_ids', coalesce((select jsonb_agg(x.id order by x.id) from public.exam_questions x where x.exam_id = z.id and x.excluded_at is not null), '[]'::jsonb),
    'parts', coalesce((
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
    ), '[]'::jsonb),
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
    'solutions', case when exists (
        select 1 from public.exam_work w
        where w.exam_id = z.id and w.annual_student_record_id = p_record_id and (
          w.solutions_qualified_at is not null or (
            clock_timestamp() >= z.actual_closes_at
            and (w.accepted_source = 'online' or (w.accepted_source = 'physical' and w.published_revision > 0))))
      ) then jsonb_build_object(
        'notes', z.solution_notes,
        'questions', coalesce((select jsonb_agg(jsonb_build_object(
            'question_id', qq.id, 'model_answer', qq.model_answer,
            'correct_choice_id', (select c.id from public.exam_choices c where c.question_id = qq.id and c.is_correct)
          ) order by qq.id) from public.exam_questions qq where qq.exam_id = z.id), '[]'::jsonb)
      ) end
  )
  from public.exams z where z.id = p_exam_id;
$$;

-- ---------------------------------------------------------------------------------------------
-- Student domain (record-based; called by the public wrappers once identity is established).

-- Starts the single attempt, or returns the existing one (resume never resets the start, deadline,
-- answers or departure count, and never creates a retake).
create or replace function edra_private.start_exam_attempt_for(p_exam_id uuid, p_record_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  target public.exams%rowtype;
  work public.exam_work%rowtype;
  existing public.exam_attempts%rowtype;
  t_now timestamptz;
begin
  perform edra_private.settle_exam_if_due(p_exam_id);
  target := edra_private.lock_exam_by_id(p_exam_id, false);
  perform edra_private.require_open_exam_year(target.academy_id, target.academic_year_id);
  perform edra_private.lock_exam_record(target, p_record_id);
  select a.* into existing from public.exam_attempts a where a.exam_id = target.id and a.annual_student_record_id = p_record_id;
  if found then
    perform edra_private.settle_exam_record(target, p_record_id);
    return edra_private.exam_student_state(target.id, p_record_id);
  end if;
  -- Readiness includes the timer: there is no untimed online exam.
  if target.archived_at is not null or not edra_private.exam_ready(target.id) or target.time_limit_minutes is null then
    raise exception using errcode = 'P0001', message = 'not_open';
  end if;
  perform edra_private.require_exam_placement(target, p_record_id);
  work := edra_private.lock_exam_work(target, p_record_id, true);
  if work.accepted_submission_id is not null then raise exception using errcode = 'P0001', message = 'source_conflict'; end if;
  t_now := clock_timestamp();
  if target.opens_at is null or t_now < target.opens_at or t_now >= target.closes_at then
    raise exception using errcode = 'P0001', message = 'not_open';
  end if;
  insert into public.exam_attempts (academy_id, exam_id, annual_student_record_id, started_at, deadline_at)
  values (target.academy_id, target.id, p_record_id, t_now, t_now + make_interval(mins => target.time_limit_minutes))
  on conflict do nothing;
  perform edra_private.mark_exam_activity(target, false);
  return edra_private.exam_student_state(target.id, p_record_id);
end;
$$;

-- Saves answers durably against answers_version. A stale version writes nothing and returns the
-- current state (outcome conflict); an attempt past its cutoff is finalized and reported (outcome
-- finalized), never extended. Answers to excluded questions keep their saved value only.
-- p_answers: [{question_id, choice_id?: uuid|null, text_answer?: string|null}]
create or replace function edra_private.save_exam_answers_for(
  p_exam_id uuid, p_record_id uuid, p_expected_version integer, p_answers jsonb, p_key uuid
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  target public.exams%rowtype;
  attempt public.exam_attempts%rowtype;
  fingerprint text := md5(jsonb_build_object('record', p_record_id, 'version', p_expected_version, 'answers', p_answers)::text);
  replay jsonb;
  t_now timestamptz;
begin
  if p_expected_version is null or p_answers is null or jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) not between 1 and 300 then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  perform edra_private.settle_exam_if_due(p_exam_id);
  target := edra_private.lock_exam_by_id(p_exam_id, false);
  replay := edra_private.exam_replay(p_key, 'answers', target.id, fingerprint);
  if replay is not null then return replay; end if;
  perform edra_private.require_open_exam_year(target.academy_id, target.academic_year_id);
  perform edra_private.lock_exam_record(target, p_record_id);
  perform edra_private.settle_exam_record(target, p_record_id);
  perform edra_private.lock_exam_work(target, p_record_id, false);
  select a.* into attempt from public.exam_attempts a
  where a.exam_id = target.id and a.annual_student_record_id = p_record_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'not_open'; end if;
  t_now := clock_timestamp();
  -- Returned rather than raised so the settlement above commits.
  if attempt.finalized_at is not null or attempt.superseded_at is not null
    or t_now >= least(attempt.deadline_at, target.actual_closes_at) then
    return jsonb_build_object('outcome', 'finalized', 'state', edra_private.exam_student_state(target.id, p_record_id), 'replayed', false);
  end if;
  -- Saving new answers needs current eligibility; settlement of already saved work does not.
  perform edra_private.require_exam_placement(target, p_record_id);
  if attempt.answers_version <> p_expected_version then
    return jsonb_build_object('outcome', 'conflict', 'state', edra_private.exam_student_state(target.id, p_record_id), 'replayed', false);
  end if;

  create temporary table if not exists pg_temp.exam_answer_input (question_id uuid, choice_id uuid, text_answer text, has_text boolean) on commit drop;
  truncate pg_temp.exam_answer_input;
  begin
    insert into pg_temp.exam_answer_input
    select (e->>'question_id')::uuid, nullif(e->>'choice_id', '')::uuid, e->>'text_answer', e ? 'text_answer'
    from jsonb_array_elements(p_answers) e
    where jsonb_typeof(e) = 'object'
      and not exists (select 1 from jsonb_object_keys(e) k where k not in ('question_id', 'choice_id', 'text_answer'));
  exception when others then
    raise exception using errcode = 'P0001', message = 'validation';
  end;
  if (select count(*) from pg_temp.exam_answer_input) <> jsonb_array_length(p_answers)
    or (select count(distinct i.question_id) from pg_temp.exam_answer_input i) <> jsonb_array_length(p_answers)
    or exists (select 1 from pg_temp.exam_answer_input i where i.question_id is null or char_length(coalesce(i.text_answer, '')) > 10000) then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  -- The answer shape must match the question kind; choices must belong to the question.
  if exists (
    select 1 from pg_temp.exam_answer_input i
    left join public.exam_questions q on q.id = i.question_id and q.exam_id = target.id
    left join public.exam_parts p on p.id = q.part_id
    where q.id is null
      or (p.kind = 'question_sheet' and (i.has_text or (i.choice_id is not null and not exists (
        select 1 from public.exam_choices c where c.question_id = q.id and c.id = i.choice_id))))
      or (p.kind = 'written_work' and i.choice_id is not null)
  ) then
    raise exception using errcode = 'P0001', message = 'unknown_question';
  end if;
  -- Excluded questions are skipped: a changed answer is rejected, an unchanged one is ignored.
  if exists (
    select 1 from pg_temp.exam_answer_input i
    join public.exam_questions q on q.id = i.question_id and q.excluded_at is not null
    left join public.exam_online_answers o on o.attempt_id = attempt.id and o.question_id = i.question_id
    where (o.choice_id, o.text_answer) is distinct from (i.choice_id, nullif(i.text_answer, ''))
  ) then
    raise exception using errcode = 'P0001', message = 'question_excluded';
  end if;
  insert into public.exam_online_answers (attempt_id, academy_id, exam_id, question_id, choice_id, text_answer, saved_at)
  select attempt.id, target.academy_id, target.id, i.question_id, i.choice_id, nullif(i.text_answer, ''), t_now
  from pg_temp.exam_answer_input i
  join public.exam_questions q on q.id = i.question_id and q.excluded_at is null
  on conflict (attempt_id, question_id) do update set choice_id = excluded.choice_id, text_answer = excluded.text_answer, saved_at = excluded.saved_at;
  update public.exam_attempts set answers_version = answers_version + 1, last_saved_at = t_now where id = attempt.id;
  perform edra_private.mark_exam_activity(target, true);
  return edra_private.remember_exam_request(p_key, 'answers', target, fingerprint,
    jsonb_build_object('outcome', 'saved', 'state', edra_private.exam_student_state(target.id, p_record_id)));
end;
$$;

-- Final submission by the student: accepts the saved answers. A retry with the same key returns the
-- same response; outcome source_conflict when physical work was confirmed first, finalized when the
-- attempt already ended (for example by its timer).
create or replace function edra_private.submit_exam_attempt_for(p_exam_id uuid, p_record_id uuid, p_key uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  target public.exams%rowtype;
  work public.exam_work%rowtype;
  attempt public.exam_attempts%rowtype;
  fingerprint text := md5(jsonb_build_object('record', p_record_id)::text);
  replay jsonb;
  t_now timestamptz;
begin
  perform edra_private.settle_exam_if_due(p_exam_id);
  target := edra_private.lock_exam_by_id(p_exam_id, false);
  replay := edra_private.exam_replay(p_key, 'submit', target.id, fingerprint);
  if replay is not null then return replay; end if;
  perform edra_private.require_open_exam_year(target.academy_id, target.academic_year_id);
  perform edra_private.lock_exam_record(target, p_record_id);
  perform edra_private.settle_exam_record(target, p_record_id);
  work := edra_private.lock_exam_work(target, p_record_id, false);
  select a.* into attempt from public.exam_attempts a
  where a.exam_id = target.id and a.annual_student_record_id = p_record_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'not_open'; end if;
  -- Outcomes rather than errors so a settlement above commits.
  if work.accepted_source = 'physical' or attempt.superseded_at is not null then
    return jsonb_build_object('outcome', 'source_conflict', 'state', edra_private.exam_student_state(target.id, p_record_id), 'replayed', false);
  end if;
  if attempt.finalized_at is not null then
    return jsonb_build_object('outcome', 'finalized', 'state', edra_private.exam_student_state(target.id, p_record_id), 'replayed', false);
  end if;
  -- An explicit final submission is new work: it needs current eligibility.
  perform edra_private.require_exam_placement(target, p_record_id);
  t_now := clock_timestamp();
  perform edra_private.accept_exam_submission(target, p_record_id, 'online', 'submitted', t_now, t_now);
  return edra_private.remember_exam_request(p_key, 'submit', target, fingerprint,
    jsonb_build_object('outcome', 'submitted', 'state', edra_private.exam_student_state(target.id, p_record_id)));
end;
$$;

-- Records a departure once per logical event. p_question_id is the question the student was on.
-- Outcomes: warned (first and second distinct departures; departure.next_question_id is where the
-- student continues, null after the last non-excluded question), kicked (third: the saved answers are
-- submitted with reason kicked and graded normally), duplicate (the same event again: its original
-- departure, nothing counted or advanced twice), finalized (the attempt had already ended, for example
-- by its timer, which is settled first and takes precedence). A departure records a question of the
-- structure, so it locks the structure like an answer save.
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
  if p_event_id is null or p_question_id is null then raise exception using errcode = 'P0001', message = 'validation'; end if;
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
  -- The question must belong to this exam.
  select n.number into current_number from (
    select q.id, row_number() over (order by p.position, q.position) as number
    from public.exam_questions q join public.exam_parts p on p.id = q.part_id where q.exam_id = target.id
  ) n where n.id = p_question_id;
  if current_number is null then raise exception using errcode = 'P0001', message = 'unknown_question'; end if;
  -- A retried event returns its original outcome; reusing an event id for another question conflicts.
  select d.* into existing from public.exam_departures d where d.attempt_id = attempt.id and d.event_id = p_event_id;
  if found then
    if existing.question_id <> p_question_id then raise exception using errcode = 'P0001', message = 'idempotency_conflict'; end if;
    return jsonb_build_object('outcome', 'duplicate', 'departure', edra_private.exam_departure_json(existing),
      'state', edra_private.exam_student_state(target.id, p_record_id));
  end if;
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
    ) n where n.number > current_number and n.excluded_at is null
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

-- ---------------------------------------------------------------------------------------------
-- Student integration adapters. Never trust a caller's annual record id or phone number as
-- ownership.

-- The caller's authoritative annual record for the exam's academy and year, after the applicable
-- online-access suspension check. There is no authoritative student-account link yet, so nobody
-- resolves and the wrappers fail with student_link_unavailable.
create or replace function edra_private.exam_caller_record(p_exam_id uuid)
returns uuid
language sql stable security definer set search_path = '' as $$
  select null::uuid where p_exam_id is not null;
$$;

-- Released-content authorization for online access. Exams have no content attachment yet (content
-- releases do not exist), so every exam is standalone and needs no release; identity, audience,
-- window and timer rules still apply. Once attachments exist, an attached exam must be authorized
-- here against its authoritative same-academy/year release and audience.
create or replace function edra_private.exam_content_access(p_exam_id uuid, p_record_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select p_record_id is not null and exists (select 1 from public.exams z where z.id = p_exam_id);
$$;

create or replace function edra_private.require_exam_student(p_exam_id uuid, p_check_content boolean)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  record_id uuid;
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'forbidden'; end if;
  record_id := edra_private.exam_caller_record(p_exam_id);
  if record_id is null then raise exception using errcode = 'P0001', message = 'student_link_unavailable'; end if;
  if p_check_content and not coalesce(edra_private.exam_content_access(p_exam_id, record_id), false) then
    raise exception using errcode = 'P0001', message = 'content_unavailable';
  end if;
  return record_id;
end;
$$;

create function public.get_my_exam(p_exam_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  record_id uuid := edra_private.require_exam_student(p_exam_id, true);
begin
  perform edra_private.settle_exam_if_due(p_exam_id);
  return edra_private.exam_student_state(p_exam_id, record_id);
end;
$$;

create function public.start_exam_attempt(p_exam_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  record_id uuid := edra_private.require_exam_student(p_exam_id, true);
begin
  perform edra_private.charge_mutation_quota('op:exam_answer');
  return edra_private.start_exam_attempt_for(p_exam_id, record_id);
end;
$$;

create function public.save_exam_answers(p_exam_id uuid, p_expected_version integer, p_answers jsonb, p_key uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  record_id uuid := edra_private.require_exam_student(p_exam_id, false);
begin
  perform edra_private.charge_mutation_quota('op:exam_answer');
  return edra_private.save_exam_answers_for(p_exam_id, record_id, p_expected_version, p_answers, p_key);
end;
$$;

create function public.submit_exam_attempt(p_exam_id uuid, p_key uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  record_id uuid := edra_private.require_exam_student(p_exam_id, false);
begin
  perform edra_private.charge_mutation_quota('op:exam_answer');
  return edra_private.submit_exam_attempt_for(p_exam_id, record_id, p_key);
end;
$$;

create function public.record_exam_departure(p_exam_id uuid, p_event_id uuid, p_question_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  record_id uuid := edra_private.require_exam_student(p_exam_id, false);
begin
  perform edra_private.charge_mutation_quota('op:exam_answer');
  return edra_private.record_exam_departure_for(p_exam_id, record_id, p_event_id, p_question_id);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Staff: physical entry, confirmation, marks, announcement.

-- One student's staff row: roster, attempt, drafts, accepted work, private and official result.
create or replace function edra_private.exam_student_row(p_exam_id uuid, p_record_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'annual_student_record_id', r.id,
    'full_name', r.full_name,
    'archived', r.archived_at is not null,
    'group_name', g.name,
    'student_code', c.code,
    'eligible', edra_private.exam_is_eligible(p_exam_id, r.id),
    'version', coalesce(w.version, 0),
    'attempt', case when a.id is null then null else jsonb_build_object(
      'started_at', a.started_at, 'deadline_at', a.deadline_at, 'departure_count', a.departure_count,
      'answers_version', a.answers_version, 'last_saved_at', a.last_saved_at,
      'finalized_at', a.finalized_at, 'finalization_reason', a.finalization_reason, 'superseded', a.superseded_at is not null
    ) end,
    'physical_draft', case when d.exam_id is null then null else jsonb_build_object(
      'version', d.version, 'updated_at', d.updated_at,
      'answered', (select count(*) from public.exam_physical_answers x where x.exam_id = d.exam_id and x.annual_student_record_id = d.annual_student_record_id)
    ) end,
    'submission', case when s.id is null then null else jsonb_build_object(
      'id', s.id, 'source', s.source, 'reason', s.reason, 'submitted_at', s.submitted_at, 'processed_at', s.processed_at,
      'original_deadline_at', s.original_deadline_at, 'scoring_revision', s.scoring_revision
    ) end,
    'result', case when s.id is null then null else (
      select jsonb_build_object('complete', x->'complete', 'total', x->'total', 'max_score', x->'max_score',
        'marked', x->'marked', 'required', x->'required', 'hash', edra_private.exam_result_hash(x))
      from (select edra_private.exam_result_content(p_exam_id, r.id) as x) content
    ) end,
    'feedback', coalesce(w.feedback, ''),
    'publication', case when p.id is null then null else jsonb_build_object(
      'revision', p.revision, 'total', p.total::text, 'max_score', p.max_score::text, 'scoring_revision', p.scoring_revision,
      'automatic', p.automatic, 'published_at', p.published_at
    ) end,
    'publication_state', case
      when p.id is null then 'unpublished'
      when p.content_hash = edra_private.exam_result_hash(edra_private.exam_result_content(p_exam_id, r.id)) then 'published'
      else 'pending_correction'
    end,
    'solutions_qualified', w.solutions_qualified_at is not null,
    'updated_at', w.updated_at
  )
  from public.annual_student_records r
  join public.exams z on z.id = p_exam_id and z.academy_id = r.academy_id and z.academic_year_id = r.academic_year_id
  left join public.groups g on g.id = r.primary_group_id
  left join public.student_code_assignments c on c.annual_student_record_id = r.id and c.retired_at is null
  left join public.exam_work w on w.exam_id = p_exam_id and w.annual_student_record_id = r.id
  left join public.exam_attempts a on a.exam_id = p_exam_id and a.annual_student_record_id = r.id
  left join public.exam_physical_drafts d on d.exam_id = p_exam_id and d.annual_student_record_id = r.id
  left join public.exam_submissions s on s.id = w.accepted_submission_id
  left join public.exam_result_publications p on p.exam_id = p_exam_id and p.annual_student_record_id = r.id and p.revision = w.published_revision
  where r.id = p_record_id;
$$;

-- Saves the physical draft (the whole set of transcribed Question Sheet answers) against its
-- version (0 when none exists). Never chooses a source and never announces.
-- p_answers: [{question_id, choice_id: uuid|null}]
create or replace function edra_private.save_exam_physical_draft(
  p_academy_id uuid, p_exam_id uuid, p_record_id uuid, p_expected_version integer, p_answers jsonb, p_key uuid
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  target public.exams%rowtype;
  work public.exam_work%rowtype;
  draft public.exam_physical_drafts%rowtype;
  fingerprint text := md5(jsonb_build_object('record', p_record_id, 'version', p_expected_version, 'answers', p_answers)::text);
  replay jsonb;
  t_now timestamptz;
begin
  perform edra_private.require_exam_role(p_academy_id, false);
  if p_record_id is null or p_expected_version is null or p_expected_version < 0 or p_answers is null
    or jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) > 300 then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  perform edra_private.settle_staff_exam(p_academy_id, p_exam_id);
  target := edra_private.lock_exam(p_academy_id, p_exam_id, false);
  replay := edra_private.exam_replay(p_key, 'physical_draft', target.id, fingerprint);
  if replay is not null then return replay; end if;
  perform edra_private.require_open_exam_year(target.academy_id, target.academic_year_id);
  if target.archived_at is not null then raise exception using errcode = 'P0001', message = 'invalid_state'; end if;
  if not edra_private.exam_ready(target.id) then raise exception using errcode = 'P0001', message = 'not_ready'; end if;
  perform edra_private.lock_exam_record(target, p_record_id);
  perform edra_private.settle_exam_record(target, p_record_id);
  work := edra_private.lock_exam_work(target, p_record_id, true);
  t_now := clock_timestamp();
  -- The accepted source is reported, not raised, so a settlement above commits.
  if work.accepted_submission_id is not null then
    return jsonb_build_object('outcome', 'source_conflict', 'student', edra_private.exam_student_row(target.id, p_record_id),
      'answers', edra_private.exam_physical_answers_json(target.id, p_record_id), 'replayed', false);
  end if;
  -- New physical entries need current eligibility even when a draft exists; accepted work is reported above.
  perform edra_private.require_exam_placement(target, p_record_id);
  if target.actual_closes_at is not null and t_now >= target.actual_closes_at then raise exception using errcode = 'P0001', message = 'exam_closed'; end if;
  select d.* into draft from public.exam_physical_drafts d where d.exam_id = target.id and d.annual_student_record_id = p_record_id for update;
  if coalesce(draft.version, 0) <> p_expected_version then
    return jsonb_build_object('outcome', 'conflict', 'student', edra_private.exam_student_row(target.id, p_record_id),
      'answers', edra_private.exam_physical_answers_json(target.id, p_record_id), 'replayed', false);
  end if;

  create temporary table if not exists pg_temp.exam_physical_input (question_id uuid, choice_id uuid) on commit drop;
  truncate pg_temp.exam_physical_input;
  begin
    insert into pg_temp.exam_physical_input
    select (e->>'question_id')::uuid, nullif(e->>'choice_id', '')::uuid
    from jsonb_array_elements(p_answers) e
    where jsonb_typeof(e) = 'object' and not exists (select 1 from jsonb_object_keys(e) k where k not in ('question_id', 'choice_id'));
  exception when others then
    raise exception using errcode = 'P0001', message = 'validation';
  end;
  if (select count(*) from pg_temp.exam_physical_input) <> jsonb_array_length(p_answers)
    or (select count(distinct i.question_id) from pg_temp.exam_physical_input i) <> jsonb_array_length(p_answers)
    or exists (select 1 from pg_temp.exam_physical_input i where i.question_id is null) then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  if exists (
    select 1 from pg_temp.exam_physical_input i
    left join public.exam_questions q on q.id = i.question_id and q.exam_id = target.id
    left join public.exam_parts p on p.id = q.part_id
    where q.id is null or p.kind <> 'question_sheet'
      or (i.choice_id is not null and not exists (select 1 from public.exam_choices c where c.question_id = q.id and c.id = i.choice_id))
  ) then
    raise exception using errcode = 'P0001', message = 'unknown_question';
  end if;

  if draft.exam_id is null then
    insert into public.exam_physical_drafts (exam_id, annual_student_record_id, academy_id, version, updated_by, updated_at)
    values (target.id, p_record_id, target.academy_id, 1, actor, t_now);
  else
    update public.exam_physical_drafts set version = version + 1, updated_by = actor, updated_at = t_now
    where exam_id = target.id and annual_student_record_id = p_record_id;
  end if;
  delete from public.exam_physical_answers a where a.exam_id = target.id and a.annual_student_record_id = p_record_id
    and a.question_id not in (select i.question_id from pg_temp.exam_physical_input i);
  insert into public.exam_physical_answers (exam_id, annual_student_record_id, academy_id, question_id, choice_id)
  select target.id, p_record_id, target.academy_id, i.question_id, i.choice_id from pg_temp.exam_physical_input i
  on conflict (exam_id, annual_student_record_id, question_id) do update set choice_id = excluded.choice_id;
  if jsonb_array_length(p_answers) > 0 then perform edra_private.mark_exam_activity(target, true);
  else perform edra_private.mark_exam_activity(target, false); end if;
  return edra_private.remember_exam_request(p_key, 'physical_draft', target, fingerprint,
    jsonb_build_object('outcome', 'saved', 'student', edra_private.exam_student_row(target.id, p_record_id),
      'answers', edra_private.exam_physical_answers_json(target.id, p_record_id)));
end;
$$;

create or replace function edra_private.exam_physical_answers_json(p_exam_id uuid, p_record_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('question_id', a.question_id, 'choice_id', a.choice_id) order by a.question_id), '[]'::jsonb)
  from public.exam_physical_answers a where a.exam_id = p_exam_id and a.annual_student_record_id = p_record_id;
$$;

-- Confirms received physical work: accepts the physical draft (created empty if none, e.g. a written
-- only exam) as the student's final submission, unless online work was accepted first. Never
-- announces. A retry with the same key returns the earlier response.
create or replace function edra_private.confirm_exam_physical(
  p_academy_id uuid, p_exam_id uuid, p_record_id uuid, p_expected_version integer, p_key uuid
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  target public.exams%rowtype;
  work public.exam_work%rowtype;
  draft public.exam_physical_drafts%rowtype;
  fingerprint text := md5(jsonb_build_object('record', p_record_id, 'version', p_expected_version)::text);
  replay jsonb;
  t_now timestamptz;
begin
  perform edra_private.require_exam_role(p_academy_id, false);
  if p_record_id is null or p_expected_version is null or p_expected_version < 0 or p_key is null then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  perform edra_private.settle_staff_exam(p_academy_id, p_exam_id);
  target := edra_private.lock_exam(p_academy_id, p_exam_id, false);
  replay := edra_private.exam_replay(p_key, 'confirm', target.id, fingerprint);
  if replay is not null then return replay; end if;
  perform edra_private.require_open_exam_year(target.academy_id, target.academic_year_id);
  if target.archived_at is not null then raise exception using errcode = 'P0001', message = 'invalid_state'; end if;
  if not edra_private.exam_ready(target.id) then raise exception using errcode = 'P0001', message = 'not_ready'; end if;
  -- An online attempt already past its cutoff is finalized first, so it wins over a late confirmation.
  perform edra_private.lock_exam_record(target, p_record_id);
  perform edra_private.settle_exam_record(target, p_record_id);
  work := edra_private.lock_exam_work(target, p_record_id, true);
  t_now := clock_timestamp();
  -- The accepted source is reported, not raised, so a settlement above commits.
  if work.accepted_submission_id is not null then
    return jsonb_build_object('outcome', 'source_conflict', 'student', edra_private.exam_student_row(target.id, p_record_id), 'replayed', false);
  end if;
  -- New physical entries need current eligibility even when a draft exists; accepted work is reported above.
  perform edra_private.require_exam_placement(target, p_record_id);
  if target.actual_closes_at is not null and t_now >= target.actual_closes_at then raise exception using errcode = 'P0001', message = 'exam_closed'; end if;
  select d.* into draft from public.exam_physical_drafts d where d.exam_id = target.id and d.annual_student_record_id = p_record_id for update;
  if coalesce(draft.version, 0) <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'exam_conflict';
  end if;
  if draft.exam_id is null then
    insert into public.exam_physical_drafts (exam_id, annual_student_record_id, academy_id, version, updated_by, updated_at)
    values (target.id, p_record_id, target.academy_id, 1, actor, t_now);
  end if;
  perform edra_private.accept_exam_submission(target, p_record_id, 'physical', 'physical', t_now, t_now);
  perform edra_private.mark_exam_activity(target, false);
  return edra_private.remember_exam_request(p_key, 'confirm', target, fingerprint,
    jsonb_build_object('outcome', 'confirmed', 'student', edra_private.exam_student_row(target.id, p_record_id)));
end;
$$;

-- Saves private Written Work marks and/or feedback on the accepted submission against the work
-- version. A stale version writes nothing (outcome conflict). Blank clears a mark; zero is a mark.
-- p_changes: { marks?: [{question_id, score: "decimal"|null}], feedback?: text }
create or replace function edra_private.save_exam_marks(
  p_academy_id uuid, p_exam_id uuid, p_record_id uuid, p_expected_version integer, p_changes jsonb, p_key uuid
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  target public.exams%rowtype;
  work public.exam_work%rowtype;
  fingerprint text := md5(jsonb_build_object('record', p_record_id, 'version', p_expected_version, 'changes', p_changes)::text);
  replay jsonb;
  t_now timestamptz;
  mark_count integer;
begin
  perform edra_private.require_exam_role(p_academy_id, false);
  if p_record_id is null or p_expected_version is null or p_changes is null or jsonb_typeof(p_changes) <> 'object'
    or exists (select 1 from jsonb_object_keys(p_changes) k where k not in ('marks', 'feedback'))
    or (p_changes ? 'marks' and jsonb_typeof(p_changes->'marks') <> 'array')
    or (p_changes ? 'feedback' and (jsonb_typeof(p_changes->'feedback') <> 'string' or char_length(p_changes->>'feedback') > 5000))
    or not (p_changes ? 'marks' or p_changes ? 'feedback') then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  mark_count := coalesce(jsonb_array_length(p_changes->'marks'), 0);
  if mark_count > 300 then raise exception using errcode = 'P0001', message = 'validation'; end if;
  perform edra_private.settle_staff_exam(p_academy_id, p_exam_id);
  target := edra_private.lock_exam(p_academy_id, p_exam_id, false);
  replay := edra_private.exam_replay(p_key, 'marks', target.id, fingerprint);
  if replay is not null then return replay; end if;
  perform edra_private.require_open_exam_year(target.academy_id, target.academic_year_id);
  if target.archived_at is not null then raise exception using errcode = 'P0001', message = 'invalid_state'; end if;
  perform edra_private.settle_exam_record(target, p_record_id);
  work := edra_private.lock_exam_work(target, p_record_id, false);
  if work.accepted_submission_id is null then raise exception using errcode = 'P0001', message = 'not_submitted'; end if;
  if work.version <> p_expected_version then
    return jsonb_build_object('outcome', 'conflict', 'student', edra_private.exam_student_row(target.id, p_record_id),
      'detail', edra_private.exam_student_detail(target.id, p_record_id), 'replayed', false);
  end if;
  t_now := clock_timestamp();

  create temporary table if not exists pg_temp.exam_mark_input (question_id uuid, score numeric, clear boolean) on commit drop;
  truncate pg_temp.exam_mark_input;
  if mark_count > 0 then
    begin
      insert into pg_temp.exam_mark_input
      select (e->>'question_id')::uuid, (e->>'score')::numeric, jsonb_typeof(e->'score') = 'null'
      from jsonb_array_elements(p_changes->'marks') e
      where jsonb_typeof(e) = 'object' and e ? 'score' and jsonb_typeof(e->'score') in ('string', 'null')
        and not exists (select 1 from jsonb_object_keys(e) k where k not in ('question_id', 'score'));
    exception when others then
      raise exception using errcode = 'P0001', message = 'invalid_score';
    end;
    if (select count(*) from pg_temp.exam_mark_input) <> mark_count
      or (select count(distinct i.question_id) from pg_temp.exam_mark_input i) <> mark_count
      or exists (select 1 from pg_temp.exam_mark_input i where i.question_id is null) then
      raise exception using errcode = 'P0001', message = 'validation';
    end if;
    if exists (
      select 1 from pg_temp.exam_mark_input i
      left join public.exam_questions q on q.id = i.question_id and q.exam_id = target.id
      left join public.exam_parts p on p.id = q.part_id
      where q.id is null or p.kind <> 'written_work'
    ) then
      raise exception using errcode = 'P0001', message = 'unknown_question';
    end if;
    if exists (
      select 1 from pg_temp.exam_mark_input i
      join public.exam_questions q on q.id = i.question_id and q.excluded_at is not null
    ) then
      raise exception using errcode = 'P0001', message = 'question_excluded';
    end if;
    if exists (
      select 1 from pg_temp.exam_mark_input i join public.exam_questions q on q.id = i.question_id
      where not i.clear and (i.score is null or not (i.score >= 0 and i.score <= q.max_score) or i.score <> round(i.score, 2))
    ) then
      raise exception using errcode = 'P0001', message = 'invalid_score';
    end if;
    delete from public.exam_marks m using pg_temp.exam_mark_input i
    where m.exam_id = target.id and m.annual_student_record_id = p_record_id and m.question_id = i.question_id and i.clear;
    insert into public.exam_marks (exam_id, annual_student_record_id, academy_id, question_id, score, updated_by, updated_at)
    select target.id, p_record_id, target.academy_id, i.question_id, i.score, actor, t_now from pg_temp.exam_mark_input i where not i.clear
    on conflict (exam_id, annual_student_record_id, question_id) do update
      set score = excluded.score, updated_by = excluded.updated_by, updated_at = excluded.updated_at
      where public.exam_marks.score is distinct from excluded.score;
  end if;
  update public.exam_work set feedback = coalesce(p_changes->>'feedback', feedback), version = version + 1, updated_at = t_now
  where exam_id = target.id and annual_student_record_id = p_record_id;
  if mark_count > 0 then perform edra_private.mark_exam_activity(target, true); end if;
  return edra_private.remember_exam_request(p_key, 'marks', target, fingerprint,
    jsonb_build_object('outcome', 'saved', 'student', edra_private.exam_student_row(target.id, p_record_id),
      'detail', edra_private.exam_student_detail(target.id, p_record_id)));
end;
$$;

-- Announces the selected students' complete results against their versions and the expected
-- scoring revision. Validation is all-or-nothing: any stale, unsubmitted or incomplete student
-- writes nothing and returns {outcome: rejected, failures}.
create or replace function edra_private.announce_exam_results(
  p_academy_id uuid, p_exam_id uuid, p_expected_scoring_revision integer, p_items jsonb, p_key uuid
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  target public.exams%rowtype;
  fingerprint text;
  replay jsonb;
  failures jsonb;
  results jsonb := '[]'::jsonb;
  item record;
  t_now timestamptz;
begin
  perform edra_private.require_exam_role(p_academy_id, false);
  if p_key is null or p_expected_scoring_revision is null or p_items is null or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) not between 1 and 500 then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  create temporary table if not exists pg_temp.exam_announce_items (record_id uuid, expected_version integer) on commit drop;
  truncate pg_temp.exam_announce_items;
  begin
    insert into pg_temp.exam_announce_items
    select (e->>'annual_student_record_id')::uuid, (e->>'expected_version')::integer
    from jsonb_array_elements(p_items) e
    where jsonb_typeof(e) = 'object'
      and not exists (select 1 from jsonb_object_keys(e) k where k not in ('annual_student_record_id', 'expected_version'));
  exception when others then
    raise exception using errcode = 'P0001', message = 'validation';
  end;
  if (select count(*) from pg_temp.exam_announce_items) <> jsonb_array_length(p_items)
    or exists (select 1 from pg_temp.exam_announce_items i where i.record_id is null or i.expected_version is null)
    or (select count(distinct i.record_id) from pg_temp.exam_announce_items i) <> jsonb_array_length(p_items) then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;

  perform edra_private.settle_staff_exam(p_academy_id, p_exam_id);
  target := edra_private.lock_exam(p_academy_id, p_exam_id, false);
  select md5(jsonb_build_object('exam', target.id, 'revision', p_expected_scoring_revision,
      'items', jsonb_agg(jsonb_build_array(i.record_id, i.expected_version) order by i.record_id))::text)
  into fingerprint from pg_temp.exam_announce_items i;
  replay := edra_private.exam_replay(p_key, 'announce', target.id, fingerprint);
  if replay is not null then return replay; end if;
  perform edra_private.require_open_exam_year(target.academy_id, target.academic_year_id);
  if target.archived_at is not null then raise exception using errcode = 'P0001', message = 'invalid_state'; end if;
  if target.scoring_revision <> p_expected_scoring_revision then raise exception using errcode = 'P0001', message = 'stale_basis'; end if;

  for item in select i.record_id from pg_temp.exam_announce_items i order by i.record_id loop
    perform edra_private.settle_exam_record(target, item.record_id);
  end loop;
  perform 1 from public.exam_work w
  where w.exam_id = target.id and w.annual_student_record_id in (select i.record_id from pg_temp.exam_announce_items i)
  order by w.annual_student_record_id
  for update;

  select jsonb_agg(jsonb_build_object('annual_student_record_id', f.record_id, 'reason', f.reason) order by f.record_id)
  into failures
  from (
    select i.record_id, case
      when w.accepted_submission_id is null then 'not_submitted'
      when w.version <> i.expected_version then 'stale'
      when not (edra_private.exam_result_content(target.id, i.record_id)->>'complete')::boolean then 'incomplete'
    end as reason
    from pg_temp.exam_announce_items i
    left join public.exam_work w on w.exam_id = target.id and w.annual_student_record_id = i.record_id
  ) f
  where f.reason is not null;
  if failures is not null then
    return jsonb_build_object('outcome', 'rejected', 'failures', failures, 'replayed', false);
  end if;

  t_now := clock_timestamp();
  for item in select i.record_id from pg_temp.exam_announce_items i order by i.record_id loop
    results := results || edra_private.announce_exam_result(target, item.record_id, false, t_now);
  end loop;
  return edra_private.remember_exam_request(p_key, 'announce', target, fingerprint,
    jsonb_build_object('outcome', 'published', 'results', results));
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Manager commands: archive and corrections.

-- Archives an exam once no unfinished attempt remains (after settling anything due). Archive is not a
-- reset: work, attempts, results, closure and solution rules stay; new work stops.
create or replace function edra_private.archive_exam(p_academy_id uuid, p_exam_id uuid, p_expected_version integer)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  target public.exams%rowtype;
begin
  perform edra_private.require_exam_role(p_academy_id, true);
  perform edra_private.settle_staff_exam(p_academy_id, p_exam_id);
  target := edra_private.lock_exam(p_academy_id, p_exam_id, true);
  perform edra_private.require_open_exam_year(target.academy_id, target.academic_year_id);
  if target.archived_at is not null then raise exception using errcode = 'P0001', message = 'invalid_state'; end if;
  if p_expected_version is null or p_expected_version <> target.version then raise exception using errcode = 'P0001', message = 'exam_conflict'; end if;
  perform edra_private.settle_exam_attempts(target);
  if exists (select 1 from public.exam_attempts a where a.exam_id = target.id and a.finalized_at is null and a.superseded_at is null) then
    raise exception using errcode = 'P0001', message = 'exam_work_pending';
  end if;
  update public.exams set archived_at = clock_timestamp(), archived_by = actor, version = version + 1, updated_by = actor, updated_at = clock_timestamp()
  where id = target.id;
  return edra_private.exam_json(target.id);
end;
$$;

-- Shared correction steps (exclusive exam lock held): a new scoring revision, every accepted
-- student's version bumped so stale announcements fail, official results untouched.
create or replace function edra_private.begin_exam_correction(
  p_academy_id uuid, p_exam_id uuid, p_question_id uuid, p_expected_scoring_revision integer
)
returns public.exams
language plpgsql security definer set search_path = '' as $$
declare
  target public.exams%rowtype;
begin
  perform edra_private.require_exam_role(p_academy_id, true);
  if p_question_id is null or p_expected_scoring_revision is null then raise exception using errcode = 'P0001', message = 'validation'; end if;
  perform edra_private.settle_staff_exam(p_academy_id, p_exam_id);
  target := edra_private.lock_exam(p_academy_id, p_exam_id, true);
  perform edra_private.require_open_exam_year(target.academy_id, target.academic_year_id);
  if target.archived_at is not null or target.structure_locked_at is null then raise exception using errcode = 'P0001', message = 'invalid_state'; end if;
  if target.scoring_revision <> p_expected_scoring_revision then raise exception using errcode = 'P0001', message = 'stale_basis'; end if;
  perform 1 from public.exam_questions q where q.id = p_question_id and q.exam_id = target.id for update;
  if not found then raise exception using errcode = 'P0001', message = 'unknown_question'; end if;
  return target;
end;
$$;

create or replace function edra_private.finish_exam_correction(
  p_target public.exams, p_kind public.exam_correction_kind, p_question_id uuid, p_previous_choice uuid, p_choice uuid
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  next_revision integer := p_target.scoring_revision + 1;
begin
  insert into public.exam_corrections (academy_id, exam_id, revision, kind, question_id, previous_choice_id, choice_id, created_by)
  values (p_target.academy_id, p_target.id, next_revision, p_kind, p_question_id, p_previous_choice, p_choice, actor);
  update public.exams set scoring_revision = next_revision, version = version + 1, updated_by = actor, updated_at = clock_timestamp()
  where id = p_target.id;
  update public.exam_work set version = version + 1, updated_at = clock_timestamp()
  where exam_id = p_target.id and accepted_submission_id is not null;
  return edra_private.exam_json(p_target.id);
end;
$$;

-- Changes the correct choice of a Question Sheet question. Prompts, choices and saved answers stay.
create or replace function edra_private.correct_exam_key(
  p_academy_id uuid, p_exam_id uuid, p_question_id uuid, p_choice_id uuid, p_expected_scoring_revision integer, p_key uuid
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  target public.exams%rowtype;
  previous uuid;
  fingerprint text := md5(jsonb_build_object('kind', 'key', 'question', p_question_id, 'choice', p_choice_id, 'revision', p_expected_scoring_revision)::text);
  replay jsonb;
begin
  perform edra_private.require_exam_role(p_academy_id, true);
  replay := edra_private.exam_replay(p_key, 'correct', p_exam_id, fingerprint);
  if replay is not null then return replay; end if;
  target := edra_private.begin_exam_correction(p_academy_id, p_exam_id, p_question_id, p_expected_scoring_revision);
  if p_choice_id is null or not exists (
    select 1 from public.exam_questions q join public.exam_parts p on p.id = q.part_id join public.exam_choices c on c.question_id = q.id
    where q.id = p_question_id and p.kind = 'question_sheet' and c.id = p_choice_id
  ) then
    raise exception using errcode = 'P0001', message = 'unknown_question';
  end if;
  if exists (select 1 from public.exam_questions q where q.id = p_question_id and q.excluded_at is not null) then
    raise exception using errcode = 'P0001', message = 'question_excluded';
  end if;
  select c.id into previous from public.exam_choices c where c.question_id = p_question_id and c.is_correct;
  if previous = p_choice_id then raise exception using errcode = 'P0001', message = 'validation', hint = 'unchanged'; end if;
  update public.exam_choices set is_correct = false where question_id = p_question_id and is_correct;
  update public.exam_choices set is_correct = true where question_id = p_question_id and id = p_choice_id;
  return edra_private.remember_exam_request(p_key, 'correct', target, fingerprint,
    jsonb_build_object('outcome', 'corrected', 'exam', edra_private.finish_exam_correction(target, 'key', p_question_id, previous, p_choice_id)));
end;
$$;

-- Excludes a question: numbering, answers and marks stay; its weight and completeness requirement go.
-- The last scored question cannot be excluded and nothing is reinstated.
create or replace function edra_private.exclude_exam_question(
  p_academy_id uuid, p_exam_id uuid, p_question_id uuid, p_expected_scoring_revision integer, p_key uuid
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  target public.exams%rowtype;
  fingerprint text := md5(jsonb_build_object('kind', 'exclusion', 'question', p_question_id, 'revision', p_expected_scoring_revision)::text);
  replay jsonb;
begin
  perform edra_private.require_exam_role(p_academy_id, true);
  replay := edra_private.exam_replay(p_key, 'correct', p_exam_id, fingerprint);
  if replay is not null then return replay; end if;
  target := edra_private.begin_exam_correction(p_academy_id, p_exam_id, p_question_id, p_expected_scoring_revision);
  if exists (select 1 from public.exam_questions q where q.id = p_question_id and q.excluded_at is not null) then
    raise exception using errcode = 'P0001', message = 'question_excluded';
  end if;
  if not exists (select 1 from public.exam_questions q where q.exam_id = target.id and q.id <> p_question_id and q.excluded_at is null) then
    raise exception using errcode = 'P0001', message = 'invalid_exclusion';
  end if;
  update public.exam_questions set excluded_at = clock_timestamp(), excluded_by = auth.uid(), excluded_revision = target.scoring_revision + 1
  where id = p_question_id;
  return edra_private.remember_exam_request(p_key, 'correct', target, fingerprint,
    jsonb_build_object('outcome', 'excluded', 'exam', edra_private.finish_exam_correction(target, 'exclusion', p_question_id, null, null)));
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Staff reads (settle due work first; null for non-members and exams elsewhere).

-- The staff document: slice 1 fields plus work counts and the correction history.
create or replace function edra_private.exam_json(p_exam_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select (
    select jsonb_build_object(
      'id', z.id, 'academy_id', z.academy_id, 'academic_year_id', z.academic_year_id,
      'title', z.title, 'instructions', z.instructions, 'solution_notes', z.solution_notes,
      'audience', z.audience, 'level_id', z.level_id, 'track_id', z.track_id,
      'group_ids', coalesce((select jsonb_agg(g.group_id order by g.group_id) from public.exam_audience_groups g where g.exam_id = z.id), '[]'::jsonb),
      'time_limit_minutes', z.time_limit_minutes,
      'opens_at', z.opens_at, 'closes_at', z.closes_at, 'actual_closes_at', z.actual_closes_at,
      'max_score', z.max_score::text,
      'effective_max_score', coalesce((select sum(q.max_score) from public.exam_questions q where q.exam_id = z.id and q.excluded_at is null), 0)::text,
      'question_count', z.question_count,
      'version', z.version, 'scoring_revision', z.scoring_revision,
      'work_started_at', z.work_started_at, 'structure_locked_at', z.structure_locked_at,
      'closure_settled_at', (select c.settled_at from public.exam_closures c where c.exam_id = z.id),
      'processing_pending', edra_private.exam_has_due_work(z.id),
      'created_by', z.created_by, 'created_at', z.created_at, 'updated_by', z.updated_by, 'updated_at', z.updated_at,
      'archived_at', z.archived_at,
      'year_open', exists (select 1 from public.academic_years y where y.id = z.academic_year_id and y.closed_at is null),
      'ready', edra_private.exam_ready(z.id),
      'issues', edra_private.exam_issues(z.id),
      'phase', edra_private.exam_phase(z, clock_timestamp()),
      'server_now', clock_timestamp(),
      'fully_automatic', edra_private.exam_fully_automatic(z.id),
      'counts', jsonb_build_object(
        'eligible', (select count(*) from edra_private.exam_audience_records(z.id)),
        'started', (select count(*) from public.exam_attempts a where a.exam_id = z.id),
        'in_progress', (select count(*) from public.exam_attempts a where a.exam_id = z.id and a.finalized_at is null and a.superseded_at is null),
        'submitted', (select count(*) from public.exam_work w where w.exam_id = z.id and w.accepted_submission_id is not null),
        'announced', (select count(*) from public.exam_work w where w.exam_id = z.id and w.published_revision > 0)
      ),
      'corrections', coalesce((
        select jsonb_agg(jsonb_build_object(
          'revision', k.revision, 'kind', k.kind, 'question_id', k.question_id, 'previous_choice_id', k.previous_choice_id,
          'choice_id', k.choice_id, 'created_by', k.created_by, 'created_at', k.created_at
        ) order by k.revision) from public.exam_corrections k where k.exam_id = z.id
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
                from public.exam_choices c where c.question_id = q.id
              ), '[]'::jsonb)
            ) order by q.position)
            from public.exam_questions q
            join (
              select q2.id, row_number() over (order by p2.position, q2.position) as number
              from public.exam_questions q2 join public.exam_parts p2 on p2.id = q2.part_id where q2.exam_id = z.id
            ) n on n.id = q.id
            where q.part_id = p.id
          ), '[]'::jsonb)
        ) order by p.position)
        from public.exam_parts p where p.exam_id = z.id
      ), '[]'::jsonb)
    )
    from public.exams z where z.id = p_exam_id
  );
$$;

-- Per-question detail of one student's work for staff review.
create or replace function edra_private.exam_student_detail(p_exam_id uuid, p_record_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'question_id', q.id, 'number', n.number, 'kind', p.kind, 'max_score', q.max_score::text, 'excluded', q.excluded_at is not null,
        'online_answer', (select jsonb_build_object('choice_id', o.choice_id, 'text_answer', o.text_answer, 'saved_at', o.saved_at)
          from public.exam_attempts a join public.exam_online_answers o on o.attempt_id = a.id and o.question_id = q.id
          where a.exam_id = p_exam_id and a.annual_student_record_id = p_record_id),
        'physical_answer', (select jsonb_build_object('choice_id', x.choice_id) from public.exam_physical_answers x
          where x.exam_id = p_exam_id and x.annual_student_record_id = p_record_id and x.question_id = q.id),
        'submitted_answer', (select jsonb_build_object('choice_id', sa.choice_id, 'text_answer', sa.text_answer)
          from public.exam_work w join public.exam_submission_answers sa on sa.submission_id = w.accepted_submission_id and sa.question_id = q.id
          where w.exam_id = p_exam_id and w.annual_student_record_id = p_record_id),
        'mark', (select m.score::text from public.exam_marks m where m.exam_id = p_exam_id and m.annual_student_record_id = p_record_id and m.question_id = q.id),
        'score', (select i->>'score' from jsonb_array_elements(edra_private.exam_result_content(p_exam_id, p_record_id)->'items') i
          where (i->>'question_id')::uuid = q.id)
      ) order by n.number)
      from public.exam_questions q
      join public.exam_parts p on p.id = q.part_id
      join (
        select q2.id, row_number() over (order by p2.position, q2.position) as number
        from public.exam_questions q2 join public.exam_parts p2 on p2.id = q2.part_id where q2.exam_id = p_exam_id
      ) n on n.id = q.id
      where q.exam_id = p_exam_id
    ), '[]'::jsonb),
    'departures', coalesce((
      select jsonb_agg(edra_private.exam_departure_json(d) order by d.ordinal)
      from public.exam_attempts a join public.exam_departures d on d.attempt_id = a.id
      where a.exam_id = p_exam_id and a.annual_student_record_id = p_record_id
    ), '[]'::jsonb),
    'publications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'revision', p.revision, 'total', p.total::text, 'max_score', p.max_score::text, 'scoring_revision', p.scoring_revision,
        'items', p.items, 'feedback', p.feedback, 'automatic', p.automatic, 'published_by', p.published_by, 'published_at', p.published_at
      ) order by p.revision desc)
      from public.exam_result_publications p where p.exam_id = p_exam_id and p.annual_student_record_id = p_record_id
    ), '[]'::jsonb)
  );
$$;

create or replace function public.get_exam(p_academy_id uuid, p_exam_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_academy_id is null or not public.is_academy_member(p_academy_id) then return null; end if;
  if not exists (select 1 from public.exams z where z.id = p_exam_id and z.academy_id = p_academy_id) then return null; end if;
  perform edra_private.settle_exam_if_due(p_exam_id);
  return edra_private.exam_json(p_exam_id);
end;
$$;

-- One page of the academy's exams, newest first, with derived phase and work counts.
-- p_phase filters by derived phase (preparing, ready, scheduled, open, headroom, closed, archived);
-- archived exams are hidden unless p_phase is 'archived' or p_include_archived.
create or replace function public.list_exams(
  p_academy_id uuid, p_academic_year_id uuid, p_search text, p_phase text, p_audience public.exam_audience,
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
    select z.*, edra_private.exam_phase(z, at_now) as phase from public.exams z
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
        'group_ids', coalesce((select jsonb_agg(g.group_id order by g.group_id) from public.exam_audience_groups g where g.exam_id = f.id), '[]'::jsonb),
        'time_limit_minutes', f.time_limit_minutes, 'opens_at', f.opens_at, 'closes_at', f.closes_at, 'actual_closes_at', f.actual_closes_at,
        'max_score', f.max_score::text,
        'effective_max_score', coalesce((select sum(q.max_score) from public.exam_questions q where q.exam_id = f.id and q.excluded_at is null), 0)::text,
        'question_count', f.question_count, 'phase', f.phase, 'updated_at', f.updated_at,
        'submitted', (select count(*) from public.exam_work w where w.exam_id = f.id and w.accepted_submission_id is not null),
        'in_progress', (select count(*) from public.exam_attempts a where a.exam_id = f.id and a.finalized_at is null and a.superseded_at is null),
        'announced', (select count(*) from public.exam_work w where w.exam_id = f.id and w.published_revision > 0),
        'processing_pending', edra_private.exam_has_due_work(f.id),
        'closure_settled_at', (select c.settled_at from public.exam_closures c where c.exam_id = f.id)
      ) order by f.created_at desc, f.id)
      from (select * from filtered order by created_at desc, id limit p_limit offset p_offset) f
    ), '[]'::jsonb),
    'server_now', at_now
  ) into result;
  return result;
end;
$$;

-- Current eligible roster plus every historical participant, ordered by name.
-- Returns { total, items } (items: exam_student_row).
create or replace function public.list_exam_students(p_academy_id uuid, p_exam_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_academy_id is null or not public.is_academy_member(p_academy_id) then return null; end if;
  if not exists (select 1 from public.exams z where z.id = p_exam_id and z.academy_id = p_academy_id) then return null; end if;
  perform edra_private.settle_exam_if_due(p_exam_id);
  return (
    with roster as (
      select r as record_id from edra_private.exam_audience_records(p_exam_id) r
      union
      select w.annual_student_record_id from public.exam_work w where w.exam_id = p_exam_id
    )
    select jsonb_build_object(
      'total', count(*),
      'items', coalesce(jsonb_agg(edra_private.exam_student_row(p_exam_id, roster.record_id) order by lower(r.full_name), r.id), '[]'::jsonb)
    )
    from roster join public.annual_student_records r on r.id = roster.record_id
  );
end;
$$;

-- One student's row and per-question detail, including physical draft answers and history.
create or replace function public.get_exam_student(p_academy_id uuid, p_exam_id uuid, p_record_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  student jsonb;
begin
  if auth.uid() is null or p_academy_id is null or not public.is_academy_member(p_academy_id) then return null; end if;
  if not exists (select 1 from public.exams z where z.id = p_exam_id and z.academy_id = p_academy_id) then return null; end if;
  perform edra_private.settle_exam_if_due(p_exam_id);
  student := edra_private.exam_student_row(p_exam_id, p_record_id);
  if student is null then return null; end if;
  return jsonb_build_object('student', student, 'detail', edra_private.exam_student_detail(p_exam_id, p_record_id));
end;
$$;

-- Public command wrappers charge the quota once, then run the private command.
create function public.save_exam_physical_draft(
  p_academy_id uuid, p_exam_id uuid, p_record_id uuid, p_expected_version integer, p_answers jsonb, p_key uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform edra_private.charge_mutation_quota('op:exam_mark');
  return edra_private.save_exam_physical_draft(p_academy_id, p_exam_id, p_record_id, p_expected_version, p_answers, p_key);
end;
$$;

create function public.confirm_exam_physical(p_academy_id uuid, p_exam_id uuid, p_record_id uuid, p_expected_version integer, p_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform edra_private.charge_mutation_quota('op:exam_mark');
  return edra_private.confirm_exam_physical(p_academy_id, p_exam_id, p_record_id, p_expected_version, p_key);
end;
$$;

create function public.save_exam_marks(
  p_academy_id uuid, p_exam_id uuid, p_record_id uuid, p_expected_version integer, p_changes jsonb, p_key uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform edra_private.charge_mutation_quota('op:exam_mark');
  return edra_private.save_exam_marks(p_academy_id, p_exam_id, p_record_id, p_expected_version, p_changes, p_key);
end;
$$;

create function public.announce_exam_results(
  p_academy_id uuid, p_exam_id uuid, p_expected_scoring_revision integer, p_items jsonb, p_key uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform edra_private.charge_mutation_quota('op:exam_publish');
  return edra_private.announce_exam_results(p_academy_id, p_exam_id, p_expected_scoring_revision, p_items, p_key);
end;
$$;

create function public.archive_exam(p_academy_id uuid, p_exam_id uuid, p_expected_version integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform edra_private.charge_mutation_quota('op:exam_author');
  return edra_private.archive_exam(p_academy_id, p_exam_id, p_expected_version);
end;
$$;

create function public.correct_exam_key(
  p_academy_id uuid, p_exam_id uuid, p_question_id uuid, p_choice_id uuid, p_expected_scoring_revision integer, p_key uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform edra_private.charge_mutation_quota('op:exam_author');
  return edra_private.correct_exam_key(p_academy_id, p_exam_id, p_question_id, p_choice_id, p_expected_scoring_revision, p_key);
end;
$$;

create function public.exclude_exam_question(
  p_academy_id uuid, p_exam_id uuid, p_question_id uuid, p_expected_scoring_revision integer, p_key uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform edra_private.charge_mutation_quota('op:exam_author');
  return edra_private.exclude_exam_question(p_academy_id, p_exam_id, p_question_id, p_expected_scoring_revision, p_key);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Academic year closure: settle due exam work first; refuse while an attempt is still running so a
-- worker never has to write into a closed year.
create or replace function edra_private.settle_exams_before_year_close()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  exam record;
begin
  if old.closed_at is not null or new.closed_at is null then return new; end if;
  for exam in
    select z.id from public.exams z where z.academic_year_id = new.id and edra_private.exam_has_due_work(z.id) order by z.id
  loop
    perform edra_private.settle_exam_closure(exam.id);
  end loop;
  if exists (
    select 1 from public.exam_attempts a join public.exams z on z.id = a.exam_id
    where z.academic_year_id = new.id and a.finalized_at is null and a.superseded_at is null
  ) then
    raise exception using errcode = 'P0001', message = 'exam_work_pending';
  end if;
  return new;
end;
$$;

create trigger academic_years_settle_exams before update of closed_at on public.academic_years
for each row execute function edra_private.settle_exams_before_year_close();

-- ---------------------------------------------------------------------------------------------
-- Grants.

revoke all on function edra_private.reject_exam_history_change() from public, anon, authenticated;
revoke all on function edra_private.guard_exam_attempt() from public, anon, authenticated;
revoke all on function edra_private.guard_exam_work() from public, anon, authenticated;
revoke all on function edra_private.exam_result_content(uuid, uuid) from public, anon, authenticated;
revoke all on function edra_private.exam_result_hash(jsonb) from public, anon, authenticated;
revoke all on function edra_private.exam_fully_automatic(uuid) from public, anon, authenticated;
revoke all on function edra_private.exam_replay(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function edra_private.remember_exam_request(uuid, text, public.exams, text, jsonb) from public, anon, authenticated;
revoke all on function edra_private.lock_exam_work(public.exams, uuid, boolean) from public, anon, authenticated;
revoke all on function edra_private.mark_exam_activity(public.exams, boolean) from public, anon, authenticated;
revoke all on function edra_private.qualify_exam_solutions(public.exams, uuid, timestamptz) from public, anon, authenticated;
revoke all on function edra_private.refresh_exam_qualification(public.exams, uuid, timestamptz) from public, anon, authenticated;
revoke all on function edra_private.announce_exam_result(public.exams, uuid, boolean, timestamptz) from public, anon, authenticated;
revoke all on function edra_private.accept_exam_submission(public.exams, uuid, public.exam_source, public.exam_finalization_reason, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function edra_private.settle_exam_record(public.exams, uuid) from public, anon, authenticated;
revoke all on function edra_private.settle_exam_attempts(public.exams) from public, anon, authenticated;
revoke all on function edra_private.settle_exam_closure(uuid) from public, anon, authenticated;
revoke all on function edra_private.exam_has_due_work(uuid) from public, anon, authenticated;
revoke all on function edra_private.settle_exam_if_due(uuid) from public, anon, authenticated;
revoke all on function edra_private.settle_staff_exam(uuid, uuid) from public, anon, authenticated;
revoke all on function edra_private.exam_student_state(uuid, uuid) from public, anon, authenticated;
revoke all on function edra_private.start_exam_attempt_for(uuid, uuid) from public, anon, authenticated;
revoke all on function edra_private.save_exam_answers_for(uuid, uuid, integer, jsonb, uuid) from public, anon, authenticated;
revoke all on function edra_private.submit_exam_attempt_for(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function edra_private.record_exam_departure_for(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function edra_private.exam_departure_json(public.exam_departures) from public, anon, authenticated;
revoke all on function edra_private.lock_exam_by_id(uuid, boolean) from public, anon, authenticated;
revoke all on function edra_private.lock_exam_record(public.exams, uuid) from public, anon, authenticated;
revoke all on function edra_private.require_exam_placement(public.exams, uuid) from public, anon, authenticated;
revoke all on function edra_private.exam_caller_record(uuid) from public, anon, authenticated;
revoke all on function edra_private.exam_content_access(uuid, uuid) from public, anon, authenticated;
revoke all on function edra_private.require_exam_student(uuid, boolean) from public, anon, authenticated;
revoke all on function edra_private.exam_student_row(uuid, uuid) from public, anon, authenticated;
revoke all on function edra_private.exam_physical_answers_json(uuid, uuid) from public, anon, authenticated;
revoke all on function edra_private.save_exam_physical_draft(uuid, uuid, uuid, integer, jsonb, uuid) from public, anon, authenticated;
revoke all on function edra_private.confirm_exam_physical(uuid, uuid, uuid, integer, uuid) from public, anon, authenticated;
revoke all on function edra_private.save_exam_marks(uuid, uuid, uuid, integer, jsonb, uuid) from public, anon, authenticated;
revoke all on function edra_private.announce_exam_results(uuid, uuid, integer, jsonb, uuid) from public, anon, authenticated;
revoke all on function edra_private.archive_exam(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function edra_private.begin_exam_correction(uuid, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function edra_private.finish_exam_correction(public.exams, public.exam_correction_kind, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function edra_private.correct_exam_key(uuid, uuid, uuid, uuid, integer, uuid) from public, anon, authenticated;
revoke all on function edra_private.exclude_exam_question(uuid, uuid, uuid, integer, uuid) from public, anon, authenticated;
revoke all on function edra_private.exam_json(uuid) from public, anon, authenticated;
revoke all on function edra_private.exam_student_detail(uuid, uuid) from public, anon, authenticated;
revoke all on function edra_private.settle_exams_before_year_close() from public, anon, authenticated;

revoke all on function public.get_my_exam(uuid) from public, anon;
revoke all on function public.start_exam_attempt(uuid) from public, anon;
revoke all on function public.save_exam_answers(uuid, integer, jsonb, uuid) from public, anon;
revoke all on function public.submit_exam_attempt(uuid, uuid) from public, anon;
revoke all on function public.record_exam_departure(uuid, uuid, uuid) from public, anon;
revoke all on function public.get_exam(uuid, uuid) from public, anon;
revoke all on function public.list_exams(uuid, uuid, text, text, public.exam_audience, boolean, integer, integer) from public, anon;
revoke all on function public.list_exam_students(uuid, uuid) from public, anon;
revoke all on function public.get_exam_student(uuid, uuid, uuid) from public, anon;
revoke all on function public.save_exam_physical_draft(uuid, uuid, uuid, integer, jsonb, uuid) from public, anon;
revoke all on function public.confirm_exam_physical(uuid, uuid, uuid, integer, uuid) from public, anon;
revoke all on function public.save_exam_marks(uuid, uuid, uuid, integer, jsonb, uuid) from public, anon;
revoke all on function public.announce_exam_results(uuid, uuid, integer, jsonb, uuid) from public, anon;
revoke all on function public.archive_exam(uuid, uuid, integer) from public, anon;
revoke all on function public.correct_exam_key(uuid, uuid, uuid, uuid, integer, uuid) from public, anon;
revoke all on function public.exclude_exam_question(uuid, uuid, uuid, integer, uuid) from public, anon;
grant execute on function public.get_my_exam(uuid) to authenticated;
grant execute on function public.start_exam_attempt(uuid) to authenticated;
grant execute on function public.save_exam_answers(uuid, integer, jsonb, uuid) to authenticated;
grant execute on function public.submit_exam_attempt(uuid, uuid) to authenticated;
grant execute on function public.record_exam_departure(uuid, uuid, uuid) to authenticated;
grant execute on function public.get_exam(uuid, uuid) to authenticated;
grant execute on function public.list_exams(uuid, uuid, text, text, public.exam_audience, boolean, integer, integer) to authenticated;
grant execute on function public.list_exam_students(uuid, uuid) to authenticated;
grant execute on function public.get_exam_student(uuid, uuid, uuid) to authenticated;
grant execute on function public.save_exam_physical_draft(uuid, uuid, uuid, integer, jsonb, uuid) to authenticated;
grant execute on function public.confirm_exam_physical(uuid, uuid, uuid, integer, uuid) to authenticated;
grant execute on function public.save_exam_marks(uuid, uuid, uuid, integer, jsonb, uuid) to authenticated;
grant execute on function public.announce_exam_results(uuid, uuid, integer, jsonb, uuid) to authenticated;
grant execute on function public.archive_exam(uuid, uuid, integer) to authenticated;
grant execute on function public.correct_exam_key(uuid, uuid, uuid, uuid, integer, uuid) to authenticated;
grant execute on function public.exclude_exam_question(uuid, uuid, uuid, integer, uuid) to authenticated;
