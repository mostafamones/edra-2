-- Quizzes, slice 1: preparation, audience, availability window and the staff document.
--
-- A quiz belongs to one academy and academic year. It targets an entire level, a level and track
-- ("program") or selected groups. Eligibility is live: whoever currently matches the target may
-- start new work (there is no recipient snapshot). Work, attempts, marks and results are slice 2
-- (20261013220000_quiz_work.sql); the deadline worker is slice 3.
--
-- Rules enforced here:
--   * Preparation may be saved incomplete (no target, no parts). Readiness (valid target and every
--     part complete) is derived, not a state; availability is a separate manager configuration.
--   * Parts are Question Sheet (authored questions, choices and one correct choice) or Written Work
--     (manually marked questions). Answer Sheet parts do not exist for quizzes.
--   * Question maxima are exact: positive, at most 1000, at most two decimals. Unsupported precision is
--     rejected, never rounded. The authored maximum is maintained from the questions by a trigger.
--   * Once work begins (an attempt starts or physical work is entered) the target and timer lock.
--     Once a student saves an answer or staff enter physical answers or marks, the structure (parts,
--     questions, choices, maxima, key and wording) locks. Model answers and solution notes stay
--     editable. Opening a staff page never locks anything.
--   * Availability: Owner/Head Admin/Admin set opening and scheduled closing times. Actual closure is
--     exactly two minutes after the scheduled close. Once actual closure passes, nothing reopens.
--   * A closed academic year makes every quiz read-only.
--
-- Clients read through RLS (active academy staff only; students never read these tables). Every write
-- goes through the security definer commands below. Errors are SQLSTATE P0001 with a stable code:
--   forbidden, validation, not_found, year_unavailable, quiz_conflict, invalid_audience,
--   target_locked, structure_locked, not_ready, quiz_closed, already_open, window_locked,
--   invalid_state, throttled.
--
-- Lock order (shared with slice 2): quiz row, then academic year (share), then per-student work rows
-- in record id order, then attempt rows.

create type public.quiz_audience as enum ('level', 'program', 'groups');
create type public.quiz_part_kind as enum ('question_sheet', 'written_work');

create table public.quizzes (
  id uuid primary key,
  academy_id uuid not null,
  academic_year_id uuid not null,
  title text not null check (char_length(title) between 1 and 200 and title = btrim(title)),
  instructions text not null default '' check (char_length(instructions) <= 10000),
  -- Staff-written solution notes released with the solutions; never part of a pre-qualification projection.
  solution_notes text not null default '' check (char_length(solution_notes) <= 10000),
  -- Null while preparation has no target yet.
  audience public.quiz_audience,
  level_id text,
  track_id uuid,
  -- Optional individual timer, fixed once work begins.
  time_limit_minutes integer check (time_limit_minutes between 1 and 600),
  opens_at timestamptz,
  -- Scheduled close: no new attempts from here. Actual close is two minutes later.
  closes_at timestamptz,
  actual_closes_at timestamptz,
  availability_updated_by uuid references public.profiles (id),
  availability_updated_at timestamptz,
  -- Authored maximum and question count, maintained from the questions by trigger.
  max_score numeric(9, 2) not null default 0 check (max_score >= 0),
  question_count integer not null default 0 check (question_count >= 0),
  version integer not null default 1 check (version >= 1),
  -- Incremented by every key correction or exclusion (slice 2).
  scoring_revision integer not null default 1 check (scoring_revision >= 1),
  work_started_at timestamptz,
  structure_locked_at timestamptz,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles (id),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles (id),
  unique (academy_id, id),
  unique (academy_id, academic_year_id, id),
  foreign key (academy_id, academic_year_id) references public.academic_years (academy_id, id),
  foreign key (academy_id, level_id) references public.academy_levels (academy_id, level_id),
  foreign key (academy_id, level_id, track_id) references public.academy_tracks (academy_id, level_id, id),
  constraint quizzes_audience_shape check (
    (audience is null and level_id is null and track_id is null)
    or (audience = 'level' and level_id is not null and track_id is null)
    or (audience = 'program' and level_id is not null and track_id is not null)
    or (audience = 'groups' and level_id is null and track_id is null)
  ),
  constraint quizzes_window_shape check (
    (opens_at is null) = (closes_at is null)
    and (closes_at is null) = (actual_closes_at is null)
    and (opens_at is null or opens_at < closes_at)
    and (closes_at is null or actual_closes_at = closes_at + interval '2 minutes')
    and (availability_updated_by is null) = (availability_updated_at is null)
  ),
  constraint quizzes_lock_shape check (structure_locked_at is null or work_started_at is not null),
  constraint quizzes_archive_shape check ((archived_at is null) = (archived_by is null))
);

create index quizzes_listing_idx on public.quizzes (academy_id, academic_year_id, created_at desc);
-- Deadline worker: quizzes by actual closure.
create index quizzes_actual_close_idx on public.quizzes (actual_closes_at) where actual_closes_at is not null;

create table public.quiz_audience_groups (
  quiz_id uuid not null,
  academy_id uuid not null,
  academic_year_id uuid not null,
  group_id uuid not null,
  primary key (quiz_id, group_id),
  foreign key (academy_id, academic_year_id, quiz_id) references public.quizzes (academy_id, academic_year_id, id),
  foreign key (academy_id, academic_year_id, group_id) references public.groups (academy_id, academic_year_id, id)
);

create index quiz_audience_groups_group_idx on public.quiz_audience_groups (group_id);

create table public.quiz_parts (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null,
  quiz_id uuid not null,
  position smallint not null check (position between 1 and 20),
  title text not null check (char_length(title) between 1 and 200 and title = btrim(title)),
  instructions text not null default '' check (char_length(instructions) <= 5000),
  kind public.quiz_part_kind not null,
  unique (quiz_id, id),
  constraint quiz_parts_position_unique unique (quiz_id, position) deferrable initially deferred,
  foreign key (academy_id, quiz_id) references public.quizzes (academy_id, id)
);

create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null,
  quiz_id uuid not null,
  part_id uuid not null,
  position smallint not null check (position between 1 and 200),
  prompt text not null default '' check (char_length(prompt) <= 5000),
  -- Staff-only; released with the solutions.
  model_answer text not null default '' check (char_length(model_answer) <= 10000),
  max_score numeric(7, 2) not null check (max_score > 0 and max_score <= 1000),
  -- An exclusion (slice 2) keeps the question, its number, answers and marks but removes its weight.
  excluded_at timestamptz,
  excluded_by uuid references public.profiles (id),
  excluded_revision integer,
  unique (quiz_id, id),
  unique (part_id, id),
  constraint quiz_questions_position_unique unique (part_id, position) deferrable initially deferred,
  foreign key (quiz_id, part_id) references public.quiz_parts (quiz_id, id) on delete cascade,
  foreign key (academy_id, quiz_id) references public.quizzes (academy_id, id),
  constraint quiz_questions_exclusion_shape check (
    (excluded_at is null) = (excluded_by is null) and (excluded_at is null) = (excluded_revision is null)
  )
);

create index quiz_questions_quiz_idx on public.quiz_questions (quiz_id);

create table public.quiz_choices (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null,
  quiz_id uuid not null,
  question_id uuid not null,
  position smallint not null check (position between 1 and 10),
  label text not null default '' check (char_length(label) <= 1000),
  is_correct boolean not null default false,
  unique (question_id, id),
  constraint quiz_choices_position_unique unique (question_id, position) deferrable initially deferred,
  foreign key (quiz_id, question_id) references public.quiz_questions (quiz_id, id) on delete cascade,
  foreign key (academy_id, quiz_id) references public.quizzes (academy_id, id)
);

create unique index quiz_choices_one_correct on public.quiz_choices (question_id) where is_correct;
create index quiz_choices_quiz_idx on public.quiz_choices (quiz_id);

-- Keeps the authored maximum and question count equal to the questions.
create or replace function edra_private.sync_quiz_totals()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  target uuid := coalesce(new.quiz_id, old.quiz_id);
begin
  update public.quizzes z set
    max_score = coalesce((select sum(q.max_score) from public.quiz_questions q where q.quiz_id = target), 0),
    question_count = (select count(*) from public.quiz_questions q where q.quiz_id = target)
  where z.id = target;
  return null;
end;
$$;

create trigger quiz_questions_sync_totals after insert or update of max_score or delete on public.quiz_questions
for each row execute function edra_private.sync_quiz_totals();

-- Quizzes are archived, never deleted.
create or replace function edra_private.reject_quiz_delete()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = 'validation', hint = 'Quizzes are archived, not deleted.';
end;
$$;

create trigger quizzes_no_delete before delete on public.quizzes
for each row execute function edra_private.reject_quiz_delete();

-- Database guard for the structure lock: once locked, parts, questions and choices keep their
-- identity, order, wording, maxima and key. Only exclusions, key corrections (choice is_correct) and
-- model answers change afterwards, and only through the slice 2 correction commands.
create or replace function edra_private.guard_quiz_structure()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  locked boolean;
begin
  select z.structure_locked_at is not null into locked from public.quizzes z where z.id = coalesce(new.quiz_id, old.quiz_id);
  if not coalesce(locked, false) then return coalesce(new, old); end if;
  if tg_op <> 'UPDATE' then raise exception using errcode = 'P0001', message = 'structure_locked'; end if;
  -- Separate branches: a row type only has its own table's fields.
  if tg_table_name = 'quiz_parts' then
    if (new.position, new.title, new.instructions, new.kind) is distinct from (old.position, old.title, old.instructions, old.kind) then
      raise exception using errcode = 'P0001', message = 'structure_locked';
    end if;
  elsif tg_table_name = 'quiz_questions' then
    if (new.part_id, new.position, new.prompt, new.max_score) is distinct from (old.part_id, old.position, old.prompt, old.max_score) then
      raise exception using errcode = 'P0001', message = 'structure_locked';
    end if;
  elsif (new.question_id, new.position, new.label) is distinct from (old.question_id, old.position, old.label) then
    raise exception using errcode = 'P0001', message = 'structure_locked';
  end if;
  return new;
end;
$$;

create trigger quiz_parts_guard_structure before insert or update or delete on public.quiz_parts
for each row execute function edra_private.guard_quiz_structure();
create trigger quiz_questions_guard_structure before insert or update or delete on public.quiz_questions
for each row execute function edra_private.guard_quiz_structure();
create trigger quiz_choices_guard_structure before insert or update or delete on public.quiz_choices
for each row execute function edra_private.guard_quiz_structure();

alter table public.quizzes enable row level security;
alter table public.quiz_audience_groups enable row level security;
alter table public.quiz_parts enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_choices enable row level security;

revoke all on public.quizzes, public.quiz_audience_groups, public.quiz_parts, public.quiz_questions, public.quiz_choices
  from public, anon, authenticated;
-- Staff-only reads. Keys and model answers are here, so students never get table access.
grant select on public.quizzes, public.quiz_audience_groups, public.quiz_parts, public.quiz_questions, public.quiz_choices
  to authenticated;

create policy quizzes_select_staff on public.quizzes
  for select to authenticated using (public.is_academy_member(academy_id));
create policy quiz_audience_groups_select_staff on public.quiz_audience_groups
  for select to authenticated using (public.is_academy_member(academy_id));
create policy quiz_parts_select_staff on public.quiz_parts
  for select to authenticated using (public.is_academy_member(academy_id));
create policy quiz_questions_select_staff on public.quiz_questions
  for select to authenticated using (public.is_academy_member(academy_id));
create policy quiz_choices_select_staff on public.quiz_choices
  for select to authenticated using (public.is_academy_member(academy_id));

-- ---------------------------------------------------------------------------------------------
-- Quotas: server-owned limits per 60-second window (existing buckets unchanged).
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
  end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Internal helpers (security definer callers only).

-- The caller's live role, or forbidden. With p_managers_only, Owner/Head Admin/Admin only.
create or replace function edra_private.require_quiz_role(p_academy_id uuid, p_managers_only boolean)
returns public.academy_role
language plpgsql security definer set search_path = '' as $$
declare
  caller_role public.academy_role := public.academy_role_for(p_academy_id);
begin
  if auth.uid() is null or p_academy_id is null or caller_role is null
    or (p_managers_only and caller_role not in ('owner', 'head_admin', 'admin')) then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  return caller_role;
end;
$$;

-- The quiz, locked: p_exclusive (for update) for quiz-wide changes (preparation, availability,
-- archive, corrections, closure settlement); otherwise for key share, so per-student commands run in
-- parallel but never interleave with a quiz-wide change. A key-share holder may still set the
-- work/structure lock timestamps: that update waits for another such update, never deadlocks.
create or replace function edra_private.lock_quiz(p_academy_id uuid, p_quiz_id uuid, p_exclusive boolean)
returns public.quizzes
language plpgsql security definer set search_path = '' as $$
declare
  target public.quizzes%rowtype;
begin
  if p_quiz_id is null or p_academy_id is null then raise exception using errcode = 'P0001', message = 'validation'; end if;
  if p_exclusive then
    select z.* into target from public.quizzes z where z.id = p_quiz_id and z.academy_id = p_academy_id for update;
  else
    select z.* into target from public.quizzes z where z.id = p_quiz_id and z.academy_id = p_academy_id for key share;
  end if;
  if not found then raise exception using errcode = 'P0001', message = 'not_found'; end if;
  return target;
end;
$$;

create or replace function edra_private.require_open_quiz_year(p_academy_id uuid, p_academic_year_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.academic_years y
  where y.id = p_academic_year_id and y.academy_id = p_academy_id and y.closed_at is null
  for share;
  if not found then raise exception using errcode = 'P0001', message = 'year_unavailable'; end if;
end;
$$;

-- Raises invalid_audience unless the target names this academy's level/track or active groups of the year.
create or replace function edra_private.check_quiz_audience(
  p_academy_id uuid, p_academic_year_id uuid, p_audience public.quiz_audience, p_level_id text, p_track_id uuid, p_group_ids uuid[]
)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  group_total integer := coalesce(array_length(p_group_ids, 1), 0);
  active_total integer;
begin
  if p_audience is null then
    if p_level_id is not null or p_track_id is not null or group_total > 0 then
      raise exception using errcode = 'P0001', message = 'invalid_audience';
    end if;
    return;
  end if;
  if p_audience = 'groups' then
    if p_level_id is not null or p_track_id is not null or group_total < 1 or group_total > 100
      or (select count(distinct g) from unnest(p_group_ids) g) <> group_total or array_position(p_group_ids, null) is not null then
      raise exception using errcode = 'P0001', message = 'invalid_audience';
    end if;
    select count(*) into active_total from (
      select 1 from public.groups g
      where g.id = any (p_group_ids) and g.academy_id = p_academy_id and g.academic_year_id = p_academic_year_id
        and g.archived_at is null
      for share of g
    ) locked;
    if active_total <> group_total then raise exception using errcode = 'P0001', message = 'invalid_audience'; end if;
    return;
  end if;
  if group_total > 0 or p_level_id is null then raise exception using errcode = 'P0001', message = 'invalid_audience'; end if;
  perform 1 from public.academy_levels l where l.academy_id = p_academy_id and l.level_id = p_level_id;
  if not found then raise exception using errcode = 'P0001', message = 'invalid_audience'; end if;
  if p_audience = 'level' then
    if p_track_id is not null then raise exception using errcode = 'P0001', message = 'invalid_audience'; end if;
  else
    perform 1 from public.academy_tracks t where t.academy_id = p_academy_id and t.level_id = p_level_id and t.id = p_track_id;
    if not found then raise exception using errcode = 'P0001', message = 'invalid_audience'; end if;
  end if;
end;
$$;

-- Active annual records of the year that currently match the quiz target (live eligibility).
create or replace function edra_private.quiz_audience_records(p_quiz_id uuid)
returns setof uuid
language sql stable security definer set search_path = '' as $$
  select r.id
  from public.quizzes z
  join public.annual_student_records r on r.academy_id = z.academy_id and r.academic_year_id = z.academic_year_id
  where z.id = p_quiz_id and r.archived_at is null and z.audience is not null
    and case z.audience
      when 'level' then r.level_id = z.level_id
      when 'program' then r.level_id = z.level_id and r.track_id = z.track_id
      when 'groups' then r.primary_group_id in (select g.group_id from public.quiz_audience_groups g where g.quiz_id = z.id)
    end;
$$;

create or replace function edra_private.quiz_is_eligible(p_quiz_id uuid, p_record_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from edra_private.quiz_audience_records(p_quiz_id) r where r = p_record_id);
$$;

-- Unresolved configuration: [{scope: quiz|part|question, id, issue}]. Empty means ready.
create or replace function edra_private.quiz_issues(p_quiz_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(i.item order by i.ord, i.pos, i.qpos), '[]'::jsonb) from (
    select 0 as ord, 0 as pos, 0 as qpos, jsonb_build_object('scope', 'quiz', 'id', z.id, 'issue', 'target') as item
    from public.quizzes z where z.id = p_quiz_id and z.audience is null
    union all
    select 0, 0, 0, jsonb_build_object('scope', 'quiz', 'id', z.id, 'issue', 'parts')
    from public.quizzes z where z.id = p_quiz_id and not exists (select 1 from public.quiz_parts p where p.quiz_id = z.id)
    union all
    select 1, p.position, 0, jsonb_build_object('scope', 'part', 'id', p.id, 'issue', 'questions')
    from public.quiz_parts p where p.quiz_id = p_quiz_id and not exists (select 1 from public.quiz_questions q where q.part_id = p.id)
    union all
    select 2, p.position, q.position, jsonb_build_object('scope', 'question', 'id', q.id, 'issue', x.issue)
    from public.quiz_parts p
    join public.quiz_questions q on q.part_id = p.id
    cross join lateral (
      select 'choices' as issue where (select count(*) from public.quiz_choices c where c.question_id = q.id) < 2
      union all
      select 'correct_choice' where not exists (select 1 from public.quiz_choices c where c.question_id = q.id and c.is_correct)
      union all
      select 'choice_text' where exists (select 1 from public.quiz_choices c where c.question_id = q.id and btrim(c.label) = '')
    ) x
    where p.quiz_id = p_quiz_id and p.kind = 'question_sheet'
  ) i;
$$;

create or replace function edra_private.quiz_ready(p_quiz_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select edra_private.quiz_issues(p_quiz_id) = '[]'::jsonb;
$$;

-- Temporal phase at p_at: archived, preparing (not ready), ready (no window), scheduled, open,
-- headroom (between scheduled and actual close) or closed.
create or replace function edra_private.quiz_phase(p_quiz public.quizzes, p_at timestamptz)
returns text
language sql stable security definer set search_path = '' as $$
  select case
    when p_quiz.archived_at is not null then 'archived'
    when p_quiz.closes_at is not null and p_at >= p_quiz.actual_closes_at then 'closed'
    when not edra_private.quiz_ready(p_quiz.id) then 'preparing'
    when p_quiz.opens_at is null then 'ready'
    when p_at < p_quiz.opens_at then 'scheduled'
    when p_at < p_quiz.closes_at then 'open'
    else 'headroom'
  end;
$$;

-- The quiz's full staff document, including the key, model answers and solution notes.
-- Slice 2 replaces it to add work counts.
create or replace function edra_private.quiz_json(p_quiz_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
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
    'created_by', z.created_by, 'created_at', z.created_at, 'updated_by', z.updated_by, 'updated_at', z.updated_at,
    'archived_at', z.archived_at,
    'year_open', exists (select 1 from public.academic_years y where y.id = z.academic_year_id and y.closed_at is null),
    'ready', edra_private.quiz_ready(z.id),
    'issues', edra_private.quiz_issues(z.id),
    'phase', edra_private.quiz_phase(z, clock_timestamp()),
    'server_now', clock_timestamp(),
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
  from public.quizzes z where z.id = p_quiz_id;
$$;

-- Parses a preparation document into pg_temp tables: quiz_draft (one row), quiz_draft_parts,
-- quiz_draft_questions and quiz_draft_choices (ordered by position). Shape:
--   { title, instructions, solution_notes, audience|null, level_id, track_id, group_ids[], time_limit_minutes|null,
--     parts: [{ id?, title, instructions, kind,
--       questions: [{ id?, prompt, model_answer, max_score, choices: [{ id?, label, is_correct }] }] }] }
create or replace function edra_private.parse_quiz_draft(p_draft jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_draft is null or jsonb_typeof(p_draft) <> 'object' or jsonb_typeof(p_draft->'parts') is distinct from 'array'
    or (p_draft ? 'group_ids' and jsonb_typeof(p_draft->'group_ids') not in ('array', 'null')) then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  if jsonb_array_length(p_draft->'parts') > 20 then raise exception using errcode = 'P0001', message = 'validation', hint = 'parts'; end if;

  create temporary table if not exists pg_temp.quiz_draft (
    title text, instructions text, solution_notes text, audience public.quiz_audience, level_id text, track_id uuid,
    group_ids uuid[], time_limit_minutes integer
  ) on commit drop;
  create temporary table if not exists pg_temp.quiz_draft_parts (
    position integer, id uuid, title text, instructions text, kind public.quiz_part_kind
  ) on commit drop;
  create temporary table if not exists pg_temp.quiz_draft_questions (
    part_position integer, position integer, id uuid, prompt text, model_answer text, max_score numeric
  ) on commit drop;
  create temporary table if not exists pg_temp.quiz_draft_choices (
    part_position integer, question_position integer, position integer, id uuid, label text, is_correct boolean
  ) on commit drop;
  truncate pg_temp.quiz_draft, pg_temp.quiz_draft_parts, pg_temp.quiz_draft_questions, pg_temp.quiz_draft_choices;

  begin
    insert into pg_temp.quiz_draft
    select btrim(p_draft->>'title'), coalesce(p_draft->>'instructions', ''), coalesce(p_draft->>'solution_notes', ''),
      nullif(p_draft->>'audience', '')::public.quiz_audience, nullif(p_draft->>'level_id', ''), nullif(p_draft->>'track_id', '')::uuid,
      coalesce((select array_agg(value::uuid) from jsonb_array_elements_text(
        case when jsonb_typeof(p_draft->'group_ids') = 'array' then p_draft->'group_ids' else '[]'::jsonb end)), '{}'),
      (p_draft->>'time_limit_minutes')::integer;
    insert into pg_temp.quiz_draft_parts
    select pe.ordinality::integer, nullif(part->>'id', '')::uuid, btrim(part->>'title'), coalesce(part->>'instructions', ''),
      (part->>'kind')::public.quiz_part_kind
    from jsonb_array_elements(p_draft->'parts') with ordinality as pe(part, ordinality);
    insert into pg_temp.quiz_draft_questions
    select pe.ordinality::integer, qe.ordinality::integer, nullif(question->>'id', '')::uuid, coalesce(question->>'prompt', ''),
      coalesce(question->>'model_answer', ''), (question->>'max_score')::numeric
    from jsonb_array_elements(p_draft->'parts') with ordinality as pe(part, ordinality)
    cross join lateral jsonb_array_elements(case when jsonb_typeof(part->'questions') = 'array' then part->'questions' else '[]'::jsonb end)
      with ordinality as qe(question, ordinality);
    insert into pg_temp.quiz_draft_choices
    select pe.ordinality::integer, qe.ordinality::integer, ce.ordinality::integer, nullif(choice->>'id', '')::uuid,
      coalesce(choice->>'label', ''), coalesce((choice->>'is_correct')::boolean, false)
    from jsonb_array_elements(p_draft->'parts') with ordinality as pe(part, ordinality)
    cross join lateral jsonb_array_elements(case when jsonb_typeof(part->'questions') = 'array' then part->'questions' else '[]'::jsonb end)
      with ordinality as qe(question, ordinality)
    cross join lateral jsonb_array_elements(case when jsonb_typeof(question->'choices') = 'array' then question->'choices' else '[]'::jsonb end)
      with ordinality as ce(choice, ordinality);
  exception when others then
    raise exception using errcode = 'P0001', message = 'validation';
  end;

  if exists (select 1 from pg_temp.quiz_draft d
      where d.title is null or char_length(d.title) not between 1 and 200 or char_length(d.instructions) > 10000
        or char_length(d.solution_notes) > 10000 or (d.time_limit_minutes is not null and d.time_limit_minutes not between 1 and 600)) then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  if exists (select 1 from pg_temp.quiz_draft_parts p
      where p.title is null or char_length(p.title) not between 1 and 200 or char_length(p.instructions) > 5000 or p.kind is null) then
    raise exception using errcode = 'P0001', message = 'validation', hint = 'parts';
  end if;
  -- Exact decimals: positive, at most 1000, at most two fractional digits (NaN and Infinity exceed 1000).
  if exists (select 1 from pg_temp.quiz_draft_questions q
      where q.position > 200 or char_length(q.prompt) > 5000 or char_length(q.model_answer) > 10000
        or q.max_score is null or not (q.max_score > 0 and q.max_score <= 1000) or q.max_score <> round(q.max_score, 2))
    or (select count(*) from pg_temp.quiz_draft_questions) > 300 then
    raise exception using errcode = 'P0001', message = 'validation', hint = 'questions';
  end if;
  -- Choices only on Question Sheet questions, at most 10, one correct at most.
  if exists (select 1 from pg_temp.quiz_draft_choices c where c.position > 10 or char_length(c.label) > 1000)
    or exists (select 1 from pg_temp.quiz_draft_choices c join pg_temp.quiz_draft_parts p on p.position = c.part_position where p.kind <> 'question_sheet')
    or exists (select 1 from pg_temp.quiz_draft_choices c where c.is_correct group by c.part_position, c.question_position having count(*) > 1) then
    raise exception using errcode = 'P0001', message = 'validation', hint = 'choices';
  end if;
  if (select count(p.id) - count(distinct p.id) from pg_temp.quiz_draft_parts p) > 0
    or (select count(q.id) - count(distinct q.id) from pg_temp.quiz_draft_questions q) > 0
    or (select count(c.id) - count(distinct c.id) from pg_temp.quiz_draft_choices c) > 0 then
    raise exception using errcode = 'P0001', message = 'validation', hint = 'ids';
  end if;
end;
$$;

-- The stored structure in draft order, for comparing a locked quiz with a submitted draft.
create or replace function edra_private.quiz_structure_signature(p_quiz_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_array(p.id, p.title, p.instructions, p.kind, (
    select coalesce(jsonb_agg(jsonb_build_array(q.id, q.prompt, q.max_score, (
      select coalesce(jsonb_agg(jsonb_build_array(c.id, c.label, c.is_correct) order by c.position), '[]'::jsonb)
      from public.quiz_choices c where c.question_id = q.id
    )) order by q.position), '[]'::jsonb)
    from public.quiz_questions q where q.part_id = p.id
  )) order by p.position), '[]'::jsonb)
  from public.quiz_parts p where p.quiz_id = p_quiz_id;
$$;

create or replace function edra_private.quiz_draft_signature()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  -- plpgsql: the pg_temp tables exist only once parse_quiz_draft has run.
  return (select coalesce(jsonb_agg(jsonb_build_array(p.id, p.title, p.instructions, p.kind, (
    select coalesce(jsonb_agg(jsonb_build_array(q.id, q.prompt, q.max_score, (
      select coalesce(jsonb_agg(jsonb_build_array(c.id, c.label, c.is_correct) order by c.position), '[]'::jsonb)
      from pg_temp.quiz_draft_choices c where c.part_position = q.part_position and c.question_position = q.position
    )) order by q.position), '[]'::jsonb)
    from pg_temp.quiz_draft_questions q where q.part_position = p.position
  )) order by p.position), '[]'::jsonb)
  from pg_temp.quiz_draft_parts p);
end;
$$;

-- Replaces the audience groups and the structure from the parsed draft, keeping existing ids.
create or replace function edra_private.write_quiz_structure(p_target public.quizzes)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  draft record;
begin
  select * into draft from pg_temp.quiz_draft;
  -- Existing ids must belong to this quiz and to the same part/question as in the draft.
  if exists (select 1 from pg_temp.quiz_draft_parts d where d.id is not null and not exists (
      select 1 from public.quiz_parts p where p.id = d.id and p.quiz_id = p_target.id))
    or exists (
      select 1 from pg_temp.quiz_draft_questions dq join pg_temp.quiz_draft_parts dp on dp.position = dq.part_position
      where dq.id is not null and not exists (
        select 1 from public.quiz_questions q where q.id = dq.id and q.part_id = dp.id and q.quiz_id = p_target.id))
    or exists (
      select 1 from pg_temp.quiz_draft_choices dc
      join pg_temp.quiz_draft_questions dq on dq.part_position = dc.part_position and dq.position = dc.question_position
      where dc.id is not null and not exists (
        select 1 from public.quiz_choices c where c.id = dc.id and c.question_id = dq.id and c.quiz_id = p_target.id)) then
    raise exception using errcode = 'P0001', message = 'validation', hint = 'ids';
  end if;

  delete from public.quiz_audience_groups g where g.quiz_id = p_target.id;
  if draft.audience = 'groups' then
    insert into public.quiz_audience_groups (quiz_id, academy_id, academic_year_id, group_id)
    select p_target.id, p_target.academy_id, p_target.academic_year_id, unnest(draft.group_ids);
  end if;

  delete from public.quiz_choices c
  where c.quiz_id = p_target.id and c.id not in (select dc.id from pg_temp.quiz_draft_choices dc where dc.id is not null);
  delete from public.quiz_questions q
  where q.quiz_id = p_target.id and q.id not in (select dq.id from pg_temp.quiz_draft_questions dq where dq.id is not null);
  delete from public.quiz_parts p
  where p.quiz_id = p_target.id and p.id not in (select d.id from pg_temp.quiz_draft_parts d where d.id is not null);

  update public.quiz_parts p set position = d.position, title = d.title, instructions = d.instructions, kind = d.kind
  from pg_temp.quiz_draft_parts d where d.id = p.id and p.quiz_id = p_target.id;
  insert into public.quiz_parts (academy_id, quiz_id, position, title, instructions, kind)
  select p_target.academy_id, p_target.id, d.position, d.title, d.instructions, d.kind
  from pg_temp.quiz_draft_parts d where d.id is null;

  update public.quiz_choices c set is_correct = false where c.quiz_id = p_target.id and c.is_correct;
  update public.quiz_questions q set position = dq.position, prompt = dq.prompt, model_answer = dq.model_answer, max_score = dq.max_score
  from pg_temp.quiz_draft_questions dq where dq.id = q.id and q.quiz_id = p_target.id;
  insert into public.quiz_questions (academy_id, quiz_id, part_id, position, prompt, model_answer, max_score)
  select p_target.academy_id, p_target.id, p.id, dq.position, dq.prompt, dq.model_answer, dq.max_score
  from pg_temp.quiz_draft_questions dq
  join public.quiz_parts p on p.quiz_id = p_target.id and p.position = dq.part_position
  where dq.id is null;

  update public.quiz_choices c set position = dc.position, label = dc.label, is_correct = dc.is_correct
  from pg_temp.quiz_draft_choices dc where dc.id = c.id and c.quiz_id = p_target.id;
  insert into public.quiz_choices (academy_id, quiz_id, question_id, position, label, is_correct)
  select p_target.academy_id, p_target.id, q.id, dc.position, dc.label, dc.is_correct
  from pg_temp.quiz_draft_choices dc
  join public.quiz_parts p on p.quiz_id = p_target.id and p.position = dc.part_position
  join public.quiz_questions q on q.part_id = p.id and q.position = dc.question_position
  where dc.id is null;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Commands.

-- Creates a quiz in an open year of the academy. p_quiz_id is generated per create action and
-- reused on retry: an identical retry returns the quiz, a reused id for a different quiz conflicts.
create or replace function edra_private.create_quiz(p_academy_id uuid, p_academic_year_id uuid, p_quiz_id uuid, p_draft jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  existing public.quizzes%rowtype;
  draft record;
  target public.quizzes%rowtype;
begin
  perform edra_private.require_quiz_role(p_academy_id, false);
  if p_quiz_id is null or p_academic_year_id is null then raise exception using errcode = 'P0001', message = 'validation'; end if;
  select z.* into existing from public.quizzes z where z.id = p_quiz_id;
  if found then
    if existing.academy_id = p_academy_id and existing.created_by = actor and existing.version = 1 then
      return edra_private.quiz_json(existing.id);
    end if;
    raise exception using errcode = 'P0001', message = 'quiz_conflict';
  end if;
  perform edra_private.require_open_quiz_year(p_academy_id, p_academic_year_id);
  perform edra_private.parse_quiz_draft(p_draft);
  if exists (select 1 from pg_temp.quiz_draft_parts d where d.id is not null)
    or exists (select 1 from pg_temp.quiz_draft_questions d where d.id is not null)
    or exists (select 1 from pg_temp.quiz_draft_choices d where d.id is not null) then
    raise exception using errcode = 'P0001', message = 'validation', hint = 'ids';
  end if;
  select * into draft from pg_temp.quiz_draft;
  perform edra_private.check_quiz_audience(p_academy_id, p_academic_year_id, draft.audience, draft.level_id, draft.track_id, draft.group_ids);
  insert into public.quizzes (
    id, academy_id, academic_year_id, title, instructions, solution_notes, audience, level_id, track_id, time_limit_minutes,
    created_by, updated_by
  ) values (
    p_quiz_id, p_academy_id, p_academic_year_id, draft.title, draft.instructions, draft.solution_notes, draft.audience,
    draft.level_id, draft.track_id, draft.time_limit_minutes, actor, actor
  ) returning * into target;
  perform edra_private.write_quiz_structure(target);
  return edra_private.quiz_json(target.id);
end;
$$;

-- Saves preparation against p_expected_version. Before work begins the whole document can change.
-- Once work begins the target and timer are fixed; once the structure locks, parts/questions/choices
-- must equal the stored structure and only model answers, title, instructions and solution notes change.
create or replace function edra_private.update_quiz(p_academy_id uuid, p_quiz_id uuid, p_expected_version integer, p_draft jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  target public.quizzes%rowtype;
  draft record;
  current_groups uuid[];
begin
  perform edra_private.require_quiz_role(p_academy_id, false);
  target := edra_private.lock_quiz(p_academy_id, p_quiz_id, true);
  perform edra_private.require_open_quiz_year(target.academy_id, target.academic_year_id);
  if target.archived_at is not null then raise exception using errcode = 'P0001', message = 'invalid_state'; end if;
  if p_expected_version is null or p_expected_version <> target.version then
    raise exception using errcode = 'P0001', message = 'quiz_conflict';
  end if;
  perform edra_private.parse_quiz_draft(p_draft);
  select * into draft from pg_temp.quiz_draft;

  if target.work_started_at is not null then
    select coalesce(array_agg(g.group_id order by g.group_id), '{}') into current_groups from public.quiz_audience_groups g where g.quiz_id = target.id;
    if (draft.audience, draft.level_id, draft.track_id, draft.time_limit_minutes)
        is distinct from (target.audience, target.level_id, target.track_id, target.time_limit_minutes)
      or (select coalesce(array_agg(g order by g), '{}') from unnest(draft.group_ids) g) <> current_groups then
      raise exception using errcode = 'P0001', message = 'target_locked';
    end if;
  else
    perform edra_private.check_quiz_audience(target.academy_id, target.academic_year_id, draft.audience, draft.level_id, draft.track_id, draft.group_ids);
  end if;

  if target.structure_locked_at is not null then
    if edra_private.quiz_draft_signature() <> edra_private.quiz_structure_signature(target.id) then
      raise exception using errcode = 'P0001', message = 'structure_locked';
    end if;
    update public.quiz_questions q set model_answer = dq.model_answer
    from pg_temp.quiz_draft_questions dq where dq.id = q.id and q.quiz_id = target.id and q.model_answer <> dq.model_answer;
  else
    perform edra_private.write_quiz_structure(target);
  end if;

  update public.quizzes set title = draft.title, instructions = draft.instructions, solution_notes = draft.solution_notes,
    audience = draft.audience, level_id = draft.level_id, track_id = draft.track_id, time_limit_minutes = draft.time_limit_minutes,
    version = version + 1, updated_by = actor, updated_at = now()
  where id = target.id;
  return edra_private.quiz_json(target.id);
end;
$$;

-- Owner/Head Admin/Admin set or clear the availability window.
--   * Requires a ready quiz to schedule. After actual closure nothing changes (no reopening).
--   * The opening time cannot move once the quiz has opened. Once any attempt exists the
--     scheduled close may only move later. A new scheduled close must be in the future.
--   * Clearing is allowed only before opening with no attempts.
create or replace function edra_private.configure_quiz_availability(
  p_academy_id uuid, p_quiz_id uuid, p_expected_version integer, p_opens_at timestamptz, p_closes_at timestamptz
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  target public.quizzes%rowtype;
  started boolean;
  at timestamptz := clock_timestamp();
begin
  perform edra_private.require_quiz_role(p_academy_id, true);
  target := edra_private.lock_quiz(p_academy_id, p_quiz_id, true);
  perform edra_private.require_open_quiz_year(target.academy_id, target.academic_year_id);
  -- Time is read after the locks so a blocked request cannot act on a window that has since closed.
  at := clock_timestamp();
  if target.archived_at is not null then raise exception using errcode = 'P0001', message = 'invalid_state'; end if;
  if p_expected_version is null or p_expected_version <> target.version then
    raise exception using errcode = 'P0001', message = 'quiz_conflict';
  end if;
  if target.actual_closes_at is not null and at >= target.actual_closes_at then
    raise exception using errcode = 'P0001', message = 'quiz_closed';
  end if;
  started := target.work_started_at is not null;
  if (p_opens_at is null) <> (p_closes_at is null) then raise exception using errcode = 'P0001', message = 'validation'; end if;

  if p_opens_at is null then
    if target.opens_at is not null and (at >= target.opens_at or started) then
      raise exception using errcode = 'P0001', message = 'already_open';
    end if;
  else
    if not edra_private.quiz_ready(target.id) then raise exception using errcode = 'P0001', message = 'not_ready'; end if;
    if p_opens_at >= p_closes_at or p_closes_at <= at then raise exception using errcode = 'P0001', message = 'validation'; end if;
    if target.opens_at is not null and at >= target.opens_at and p_opens_at <> target.opens_at then
      raise exception using errcode = 'P0001', message = 'already_open';
    end if;
    if started and target.closes_at is not null and p_closes_at < target.closes_at then
      raise exception using errcode = 'P0001', message = 'window_locked';
    end if;
  end if;

  update public.quizzes set opens_at = p_opens_at, closes_at = p_closes_at,
    actual_closes_at = p_closes_at + interval '2 minutes',
    availability_updated_by = actor, availability_updated_at = at,
    version = version + 1, updated_by = actor, updated_at = at
  where id = target.id;
  return edra_private.quiz_json(target.id);
end;
$$;

-- Public wrappers charge the quota once, then run the private command.
create function public.create_quiz(p_academy_id uuid, p_academic_year_id uuid, p_quiz_id uuid, p_draft jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform edra_private.charge_mutation_quota('op:quiz_author');
  return edra_private.create_quiz(p_academy_id, p_academic_year_id, p_quiz_id, p_draft);
end;
$$;

create function public.update_quiz(p_academy_id uuid, p_quiz_id uuid, p_expected_version integer, p_draft jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform edra_private.charge_mutation_quota('op:quiz_author');
  return edra_private.update_quiz(p_academy_id, p_quiz_id, p_expected_version, p_draft);
end;
$$;

create function public.configure_quiz_availability(
  p_academy_id uuid, p_quiz_id uuid, p_expected_version integer, p_opens_at timestamptz, p_closes_at timestamptz
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform edra_private.charge_mutation_quota('op:quiz_author');
  return edra_private.configure_quiz_availability(p_academy_id, p_quiz_id, p_expected_version, p_opens_at, p_closes_at);
end;
$$;

-- Advisory count of the active students the target matches now. Eligibility stays live after saving.
create or replace function public.preview_quiz_audience(
  p_academy_id uuid, p_academic_year_id uuid, p_audience public.quiz_audience, p_level_id text, p_track_id uuid, p_group_ids uuid[]
)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  total integer;
begin
  if auth.uid() is null or p_academy_id is null or not public.is_academy_member(p_academy_id) then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  select count(*) into total from public.annual_student_records r
  where r.academy_id = p_academy_id and r.academic_year_id = p_academic_year_id and r.archived_at is null
    and case p_audience
      when 'level' then r.level_id = p_level_id
      when 'program' then r.level_id = p_level_id and r.track_id = p_track_id
      when 'groups' then r.primary_group_id = any (coalesce(p_group_ids, '{}'::uuid[]))
      else false
    end;
  return jsonb_build_object('student_count', total);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants.

revoke all on function edra_private.sync_quiz_totals() from public, anon, authenticated;
revoke all on function edra_private.reject_quiz_delete() from public, anon, authenticated;
revoke all on function edra_private.guard_quiz_structure() from public, anon, authenticated;
revoke all on function edra_private.require_quiz_role(uuid, boolean) from public, anon, authenticated;
revoke all on function edra_private.lock_quiz(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function edra_private.require_open_quiz_year(uuid, uuid) from public, anon, authenticated;
revoke all on function edra_private.check_quiz_audience(uuid, uuid, public.quiz_audience, text, uuid, uuid[]) from public, anon, authenticated;
revoke all on function edra_private.quiz_audience_records(uuid) from public, anon, authenticated;
revoke all on function edra_private.quiz_is_eligible(uuid, uuid) from public, anon, authenticated;
revoke all on function edra_private.quiz_issues(uuid) from public, anon, authenticated;
revoke all on function edra_private.quiz_ready(uuid) from public, anon, authenticated;
revoke all on function edra_private.quiz_phase(public.quizzes, timestamptz) from public, anon, authenticated;
revoke all on function edra_private.quiz_json(uuid) from public, anon, authenticated;
revoke all on function edra_private.parse_quiz_draft(jsonb) from public, anon, authenticated;
revoke all on function edra_private.quiz_structure_signature(uuid) from public, anon, authenticated;
revoke all on function edra_private.quiz_draft_signature() from public, anon, authenticated;
revoke all on function edra_private.write_quiz_structure(public.quizzes) from public, anon, authenticated;
revoke all on function edra_private.create_quiz(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function edra_private.update_quiz(uuid, uuid, integer, jsonb) from public, anon, authenticated;
revoke all on function edra_private.configure_quiz_availability(uuid, uuid, integer, timestamptz, timestamptz) from public, anon, authenticated;

revoke all on function public.create_quiz(uuid, uuid, uuid, jsonb) from public, anon;
revoke all on function public.update_quiz(uuid, uuid, integer, jsonb) from public, anon;
revoke all on function public.configure_quiz_availability(uuid, uuid, integer, timestamptz, timestamptz) from public, anon;
revoke all on function public.preview_quiz_audience(uuid, uuid, public.quiz_audience, text, uuid, uuid[]) from public, anon;
grant execute on function public.create_quiz(uuid, uuid, uuid, jsonb) to authenticated;
grant execute on function public.update_quiz(uuid, uuid, integer, jsonb) to authenticated;
grant execute on function public.configure_quiz_availability(uuid, uuid, integer, timestamptz, timestamptz) to authenticated;
grant execute on function public.preview_quiz_audience(uuid, uuid, public.quiz_audience, text, uuid, uuid[]) to authenticated;
