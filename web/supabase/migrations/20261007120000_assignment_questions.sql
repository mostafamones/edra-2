-- Assignments: typed parts with a question marking scheme (marks per question).
--
-- Scope (EDRA-76 checkpoint 1). Staff authoring only:
--   * A part has a submission type (online_questions, answer_sheet, file_upload) and ordered
--     questions/entries. A question's maximum is a positive exact decimal; the part maximum is the
--     sum of its question maxima and the assignment maximum is the sum of its part maxima, both
--     maintained by triggers, never by the browser.
--   * Online questions and answer sheets are multiple choice with exactly one correct choice per
--     question (choice letters are derived from the position). A file-upload part lists numbered
--     entries with marks and no choices. Initial online questions are multiple choice only; the
--     schema (kind + question rows) leaves room for later kinds.
--   * Drafts may be incomplete. Publishing requires every part to be complete (part_issues).
--   * Legacy parts (kind is null) keep their id, maximum, marks and snapshots. They stay readable and
--     physically markable, are never online-ready, and cannot be created or reverted to by new drafts.
--     An unused draft part can be converted by giving it a kind and questions; a part with activity
--     keeps its structure locked.
--   * Answer keys (is_correct) are private: the question tables have no grants for API roles and are
--     read only through staff security-definer functions. The student-safe projection
--     edra_private.assignment_student_json never carries correctness.
--
-- NOT in this migration: file/model-answer storage metadata, student responses, grading, blocking,
-- review state and the in-person online-submission academy setting (later checkpoints / EDRA-80, 81).
--
-- Errors keep the existing contract (SQLSTATE P0001): validation (hint parts/questions), incomplete,
-- structure_locked.

create type public.assignment_part_kind as enum ('online_questions', 'answer_sheet', 'file_upload');

-- A draft part may be unconfigured (maximum 0). The cap rises because a part is now a sum of questions.
alter table public.assignment_parts drop constraint if exists assignment_parts_max_score_check;
alter table public.assignment_parts
  add column kind public.assignment_part_kind,
  add constraint assignment_parts_max_score_range check (max_score >= 0 and max_score <= 10000),
  add constraint assignment_parts_legacy_maximum check (kind is not null or max_score > 0);

create table public.assignment_part_questions (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null,
  assignment_id uuid not null,
  part_id uuid not null,
  -- Display number: 1-based position within the part.
  position smallint not null check (position between 1 and 100),
  -- Required for online questions once complete; empty for answer-sheet and file-upload entries.
  prompt text not null default '' check (char_length(prompt) <= 2000 and prompt = btrim(prompt)),
  max_score numeric(6, 2) not null check (max_score > 0 and max_score <= 1000),
  unique (part_id, id),
  constraint assignment_part_questions_position_unique unique (part_id, position) deferrable initially deferred,
  foreign key (assignment_id, part_id) references public.assignment_parts (assignment_id, id) on delete cascade,
  foreign key (academy_id, assignment_id) references public.assignments (academy_id, id)
);

create table public.assignment_question_choices (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null,
  assignment_id uuid not null,
  part_id uuid not null,
  question_id uuid not null,
  -- Letter A..J is derived from the position.
  position smallint not null check (position between 1 and 10),
  label text not null default '' check (char_length(label) <= 500 and label = btrim(label)),
  is_correct boolean not null default false,
  unique (question_id, id),
  constraint assignment_question_choices_position_unique unique (question_id, position) deferrable initially deferred,
  foreign key (part_id, question_id) references public.assignment_part_questions (part_id, id) on delete cascade,
  foreign key (academy_id, assignment_id) references public.assignments (academy_id, id)
);

create unique index assignment_question_choices_one_correct on public.assignment_question_choices (question_id) where is_correct;

-- No grants and no policies: only security-definer staff functions read the answer key.
alter table public.assignment_part_questions enable row level security;
alter table public.assignment_question_choices enable row level security;
revoke all on public.assignment_part_questions, public.assignment_question_choices from public, anon, authenticated;

-- The part maximum is the sum of its questions (typed parts only; legacy maxima are untouched).
create or replace function edra_private.sync_part_total()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  target uuid := coalesce(new.part_id, old.part_id);
begin
  update public.assignment_parts p set
    max_score = coalesce((select sum(q.max_score) from public.assignment_part_questions q where q.part_id = target), 0)
  where p.id = target and p.kind is not null;
  return null;
end;
$$;

create trigger assignment_part_questions_sync_total after insert or update of max_score or delete on public.assignment_part_questions
for each row execute function edra_private.sync_part_total();

-- Question, choice and part-type writes are possible only while the assignment is an unused draft,
-- whatever function performs them: nothing reinterprets a scheme beneath existing work.
create or replace function edra_private.guard_assignment_structure()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  target uuid := coalesce(new.assignment_id, old.assignment_id);
  current_state public.assignment_state;
begin
  select a.state into current_state from public.assignments a where a.id = target;
  if current_state is distinct from 'draft' or edra_private.assignment_has_activity(target) then
    raise exception using errcode = 'P0001', message = 'structure_locked';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger assignment_part_questions_guard after insert or update or delete on public.assignment_part_questions
for each row execute function edra_private.guard_assignment_structure();
create trigger assignment_question_choices_guard after insert or update or delete on public.assignment_question_choices
for each row execute function edra_private.guard_assignment_structure();
create trigger assignment_parts_kind_guard before update of kind on public.assignment_parts
for each row when (old.kind is distinct from new.kind) execute function edra_private.guard_assignment_structure();

-- Unresolved configuration of a part, as stable codes; empty means the part is complete.
create or replace function edra_private.part_issues(p_part_id uuid)
returns text[]
language plpgsql stable security definer set search_path = '' as $$
declare
  target public.assignment_parts%rowtype;
  issues text[] := '{}';
begin
  select * into target from public.assignment_parts p where p.id = p_part_id;
  if not found then return issues; end if;
  if target.kind is null then
    if target.max_score <= 0 then issues := issues || 'maximum'; end if;
    return issues;
  end if;
  if not exists (select 1 from public.assignment_part_questions q where q.part_id = target.id) then
    return issues || 'questions';
  end if;
  if target.kind in ('online_questions', 'answer_sheet') then
    if exists (
      select 1 from public.assignment_part_questions q
      where q.part_id = target.id
        and (select count(*) from public.assignment_question_choices c where c.question_id = q.id) < 2
    ) then issues := issues || 'choices'; end if;
    if exists (
      select 1 from public.assignment_part_questions q
      where q.part_id = target.id
        and not exists (select 1 from public.assignment_question_choices c where c.question_id = q.id and c.is_correct)
    ) then issues := issues || 'correct_choice'; end if;
  end if;
  if target.kind = 'online_questions' then
    if exists (select 1 from public.assignment_part_questions q where q.part_id = target.id and q.prompt = '') then
      issues := issues || 'prompt';
    end if;
    if exists (select 1 from public.assignment_question_choices c where c.part_id = target.id and c.label = '') then
      issues := issues || 'choice_text';
    end if;
  end if;
  return issues;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Staff document (includes the answer key) and the student-safe projection (never does).

create or replace function edra_private.part_questions_json(p_part_id uuid, p_with_key boolean)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', q.id, 'position', q.position, 'prompt', q.prompt, 'max_score', q.max_score::text,
    'choices', coalesce((
      select jsonb_agg(
        case when p_with_key
          then jsonb_build_object('id', c.id, 'position', c.position, 'label', c.label, 'is_correct', c.is_correct)
          else jsonb_build_object('id', c.id, 'position', c.position, 'label', c.label) end
        order by c.position)
      from public.assignment_question_choices c where c.question_id = q.id
    ), '[]'::jsonb)
  ) order by q.position), '[]'::jsonb)
  from public.assignment_part_questions q where q.part_id = p_part_id;
$$;

create or replace function edra_private.assignment_json(p_assignment_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', a.id, 'academy_id', a.academy_id, 'academic_year_id', a.academic_year_id,
    'title', a.title, 'instructions', a.instructions,
    'audience', a.audience, 'level_id', a.level_id, 'track_id', a.track_id,
    'group_ids', coalesce((
      select jsonb_agg(g.group_id order by g.group_id) from public.assignment_audience_groups g where g.assignment_id = a.id
    ), '[]'::jsonb),
    'due_at', a.due_at, 'state', a.state, 'max_score', a.max_score::text, 'part_count', a.part_count,
    'recipient_count', a.recipient_count, 'version', a.version,
    'created_by', a.created_by, 'created_at', a.created_at, 'updated_by', a.updated_by, 'updated_at', a.updated_at,
    'published_at', a.published_at, 'closed_at', a.closed_at, 'archived_at', a.archived_at,
    'year_open', exists (select 1 from public.academic_years y where y.id = a.academic_year_id and y.closed_at is null),
    'has_activity', edra_private.assignment_has_activity(a.id),
    'parts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'position', p.position, 'title', p.title, 'instructions', p.instructions, 'max_score', p.max_score::text,
        'kind', p.kind, 'issues', to_jsonb(edra_private.part_issues(p.id)),
        'questions', edra_private.part_questions_json(p.id, true)
      ) order by p.position)
      from public.assignment_parts p where p.assignment_id = a.id
    ), '[]'::jsonb)
  )
  from public.assignments a where a.id = p_assignment_id;
$$;

-- Internal contract for the future student reads (EDRA-81): instructions, questions, choices and
-- response requirements only. No correctness flags, other students, draft marks or storage keys.
create or replace function edra_private.assignment_student_json(p_assignment_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', a.id, 'title', a.title, 'instructions', a.instructions, 'due_at', a.due_at, 'max_score', a.max_score::text,
    'parts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'position', p.position, 'title', p.title, 'instructions', p.instructions,
        'max_score', p.max_score::text, 'kind', p.kind,
        'questions', edra_private.part_questions_json(p.id, false)
      ) order by p.position)
      from public.assignment_parts p where p.assignment_id = a.id
    ), '[]'::jsonb)
  )
  from public.assignments a where a.id = p_assignment_id;
$$;

revoke all on function edra_private.assignment_student_json(uuid), edra_private.part_issues(uuid),
  edra_private.part_questions_json(uuid, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Draft parsing: parts carry a kind and questions with choices.

create or replace function edra_private.parse_assignment_draft(p_draft jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  part_total integer;
begin
  if p_draft is null or jsonb_typeof(p_draft) <> 'object'
    or jsonb_typeof(p_draft->'parts') is distinct from 'array'
    or (p_draft ? 'group_ids' and jsonb_typeof(p_draft->'group_ids') not in ('array', 'null')) then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  part_total := jsonb_array_length(p_draft->'parts');
  if part_total < 1 or part_total > 50 then raise exception using errcode = 'P0001', message = 'validation', hint = 'parts'; end if;

  create temporary table if not exists pg_temp.assignment_draft (
    title text, instructions text, audience public.assignment_audience,
    level_id text, track_id uuid, group_ids uuid[], due_at timestamptz
  ) on commit drop;
  drop table if exists pg_temp.assignment_draft_parts;
  drop table if exists pg_temp.assignment_draft_questions;
  drop table if exists pg_temp.assignment_draft_choices;
  create temporary table pg_temp.assignment_draft_parts (
    position integer, id uuid, title text, instructions text, kind public.assignment_part_kind, max_score numeric
  ) on commit drop;
  create temporary table pg_temp.assignment_draft_questions (
    part_position integer, position integer, id uuid, prompt text, max_score numeric
  ) on commit drop;
  create temporary table pg_temp.assignment_draft_choices (
    part_position integer, question_position integer, position integer, id uuid, label text, is_correct boolean
  ) on commit drop;
  truncate pg_temp.assignment_draft;

  begin
    insert into pg_temp.assignment_draft
    select btrim(p_draft->>'title'), coalesce(p_draft->>'instructions', ''),
      (p_draft->>'audience')::public.assignment_audience,
      nullif(p_draft->>'level_id', ''), nullif(p_draft->>'track_id', '')::uuid,
      coalesce((select array_agg(value::uuid) from jsonb_array_elements_text(
        case when jsonb_typeof(p_draft->'group_ids') = 'array' then p_draft->'group_ids' else '[]'::jsonb end)), '{}'),
      nullif(p_draft->>'due_at', '')::timestamptz;
    insert into pg_temp.assignment_draft_parts
    select ordinality::integer, nullif(part->>'id', '')::uuid, btrim(part->>'title'), coalesce(part->>'instructions', ''),
      nullif(part->>'kind', '')::public.assignment_part_kind, (part->>'max_score')::numeric
    from jsonb_array_elements(p_draft->'parts') with ordinality as entries(part, ordinality);
    insert into pg_temp.assignment_draft_questions
    select part_entry.ordinality::integer, question_entry.ordinality::integer, nullif(question_entry.question->>'id', '')::uuid,
      btrim(coalesce(question_entry.question->>'prompt', '')), (question_entry.question->>'max_score')::numeric
    from jsonb_array_elements(p_draft->'parts') with ordinality as part_entry(part, ordinality)
    cross join lateral jsonb_array_elements(coalesce(nullif(part_entry.part->'questions', 'null'::jsonb), '[]'::jsonb))
      with ordinality as question_entry(question, ordinality);
    insert into pg_temp.assignment_draft_choices
    select part_entry.ordinality::integer, question_entry.ordinality::integer, choice_entry.ordinality::integer,
      nullif(choice_entry.choice->>'id', '')::uuid, btrim(coalesce(choice_entry.choice->>'label', '')),
      coalesce((choice_entry.choice->>'is_correct')::boolean, false)
    from jsonb_array_elements(p_draft->'parts') with ordinality as part_entry(part, ordinality)
    cross join lateral jsonb_array_elements(coalesce(nullif(part_entry.part->'questions', 'null'::jsonb), '[]'::jsonb))
      with ordinality as question_entry(question, ordinality)
    cross join lateral jsonb_array_elements(coalesce(nullif(question_entry.question->'choices', 'null'::jsonb), '[]'::jsonb))
      with ordinality as choice_entry(choice, ordinality);
  exception when others then
    raise exception using errcode = 'P0001', message = 'validation';
  end;

  if exists (select 1 from pg_temp.assignment_draft d
      where d.title is null or char_length(d.title) not between 1 and 200 or char_length(d.instructions) > 10000
        or d.audience is null) then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  if exists (select 1 from pg_temp.assignment_draft_parts p
      where p.title is null or char_length(p.title) not between 1 and 200 or char_length(p.instructions) > 5000) then
    raise exception using errcode = 'P0001', message = 'validation', hint = 'parts';
  end if;
  -- Legacy (untyped) parts carry their own maximum and no questions. Typed parts derive it.
  if exists (select 1 from pg_temp.assignment_draft_parts p
      where p.kind is null and (p.max_score is null or not (p.max_score > 0 and p.max_score <= 10000) or p.max_score <> round(p.max_score, 2)
        or exists (select 1 from pg_temp.assignment_draft_questions q where q.part_position = p.position))) then
    raise exception using errcode = 'P0001', message = 'validation', hint = 'parts';
  end if;
  if (select count(distinct p.id) from pg_temp.assignment_draft_parts p where p.id is not null)
    <> (select count(*) from pg_temp.assignment_draft_parts p where p.id is not null) then
    raise exception using errcode = 'P0001', message = 'validation', hint = 'parts';
  end if;

  -- Exact decimals: positive, at most 1000, at most two fractional digits (NaN and Infinity exceed 1000).
  if exists (select 1 from pg_temp.assignment_draft_questions q
      where q.max_score is null or not (q.max_score > 0 and q.max_score <= 1000) or q.max_score <> round(q.max_score, 2)
        or char_length(q.prompt) > 2000)
    or exists (select 1 from pg_temp.assignment_draft_questions q group by q.part_position having count(*) > 100)
    or (select count(distinct q.id) from pg_temp.assignment_draft_questions q where q.id is not null)
      <> (select count(*) from pg_temp.assignment_draft_questions q where q.id is not null) then
    raise exception using errcode = 'P0001', message = 'validation', hint = 'questions';
  end if;
  if exists (select 1 from pg_temp.assignment_draft_choices c
      where char_length(c.label) > 500 or c.position > 10)
    or exists (select 1 from pg_temp.assignment_draft_choices c where c.is_correct group by c.part_position, c.question_position having count(*) > 1)
    or (select count(distinct c.id) from pg_temp.assignment_draft_choices c where c.id is not null)
      <> (select count(*) from pg_temp.assignment_draft_choices c where c.id is not null)
    -- File-upload entries have no choices.
    or exists (select 1 from pg_temp.assignment_draft_choices c join pg_temp.assignment_draft_parts p on p.position = c.part_position
      where p.kind = 'file_upload') then
    raise exception using errcode = 'P0001', message = 'validation', hint = 'questions';
  end if;

  -- The part maximum is the question sum, whatever the browser sent.
  update pg_temp.assignment_draft_parts p set max_score = coalesce((
    select sum(q.max_score) from pg_temp.assignment_draft_questions q where q.part_position = p.position), 0)
  where p.kind is not null;
  if exists (select 1 from pg_temp.assignment_draft_parts p where p.max_score > 10000) then
    raise exception using errcode = 'P0001', message = 'validation', hint = 'questions';
  end if;
end;
$$;

-- A comparable form of the draft's questions and of the stored ones, for the locked-structure check.
create or replace function edra_private.draft_questions_signature()
returns jsonb
language plpgsql stable set search_path = '' as $$
begin
  return (select coalesce(jsonb_agg(jsonb_build_object(
    'p', q.part_position, 'q', q.position, 'id', q.id, 'prompt', q.prompt, 'max', q.max_score,
    'c', coalesce((
      select jsonb_agg(jsonb_build_object('pos', c.position, 'id', c.id, 'label', c.label, 'ok', c.is_correct) order by c.position)
      from pg_temp.assignment_draft_choices c where c.part_position = q.part_position and c.question_position = q.position
    ), '[]'::jsonb)
  ) order by q.part_position, q.position), '[]'::jsonb)
  from pg_temp.assignment_draft_questions q);
end;
$$;

create or replace function edra_private.stored_questions_signature(p_assignment_id uuid)
returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'p', p.position, 'q', q.position, 'id', q.id, 'prompt', q.prompt, 'max', q.max_score,
    'c', coalesce((
      select jsonb_agg(jsonb_build_object('pos', c.position, 'id', c.id, 'label', c.label, 'ok', c.is_correct) order by c.position)
      from public.assignment_question_choices c where c.question_id = q.id
    ), '[]'::jsonb)
  ) order by p.position, q.position), '[]'::jsonb)
  from public.assignment_part_questions q
  join public.assignment_parts p on p.id = q.part_id
  where q.assignment_id = p_assignment_id;
$$;

revoke all on function edra_private.draft_questions_signature(), edra_private.stored_questions_signature(uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Structure writes: parts, questions and choices in one atomic command.

create or replace function edra_private.write_assignment_structure(p_target public.assignments)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  draft record;
begin
  select * into draft from pg_temp.assignment_draft;
  -- Existing part ids must belong to this assignment; new parts carry no id.
  if exists (select 1 from pg_temp.assignment_draft_parts d where d.id is not null and not exists (
      select 1 from public.assignment_parts p where p.id = d.id and p.assignment_id = p_target.id)) then
    raise exception using errcode = 'P0001', message = 'validation', hint = 'parts';
  end if;
  -- An untyped (legacy) part exists only as it was stored: it is never new and a typed part never reverts.
  if exists (select 1 from pg_temp.assignment_draft_parts d where d.kind is null and not exists (
      select 1 from public.assignment_parts p where p.id = d.id and p.kind is null)) then
    raise exception using errcode = 'P0001', message = 'validation', hint = 'parts';
  end if;
  -- Existing question and choice ids must belong to the same part and question as in the draft.
  if exists (
    select 1 from pg_temp.assignment_draft_questions dq
    join pg_temp.assignment_draft_parts dp on dp.position = dq.part_position
    where dq.id is not null and not exists (
      select 1 from public.assignment_part_questions q where q.id = dq.id and q.part_id = dp.id and q.assignment_id = p_target.id)
  ) or exists (
    select 1 from pg_temp.assignment_draft_choices dc
    join pg_temp.assignment_draft_questions dq on dq.part_position = dc.part_position and dq.position = dc.question_position
    where dc.id is not null and not exists (
      select 1 from public.assignment_question_choices c where c.id = dc.id and c.question_id = dq.id and c.assignment_id = p_target.id)
  ) then
    raise exception using errcode = 'P0001', message = 'validation', hint = 'questions';
  end if;

  delete from public.assignment_audience_groups g where g.assignment_id = p_target.id;
  if draft.audience = 'groups' then
    insert into public.assignment_audience_groups (assignment_id, academy_id, academic_year_id, group_id)
    select p_target.id, p_target.academy_id, p_target.academic_year_id, unnest(draft.group_ids);
  end if;

  -- Removed questions go first (their choices cascade), then removed parts (their questions cascade).
  delete from public.assignment_part_questions q
  where q.assignment_id = p_target.id and q.id not in (select dq.id from pg_temp.assignment_draft_questions dq where dq.id is not null);
  delete from public.assignment_question_choices c
  where c.assignment_id = p_target.id and c.id not in (select dc.id from pg_temp.assignment_draft_choices dc where dc.id is not null);
  delete from public.assignment_parts p
  where p.assignment_id = p_target.id and p.id not in (select d.id from pg_temp.assignment_draft_parts d where d.id is not null);
  update public.assignment_parts p set position = d.position, title = d.title, instructions = d.instructions,
    kind = d.kind, max_score = d.max_score
  from pg_temp.assignment_draft_parts d
  where d.id = p.id and p.assignment_id = p_target.id;
  insert into public.assignment_parts (academy_id, assignment_id, position, title, instructions, kind, max_score)
  select p_target.academy_id, p_target.id, d.position, d.title, d.instructions, d.kind, d.max_score
  from pg_temp.assignment_draft_parts d where d.id is null;

  -- Questions, then choices. One correct choice per question is a unique index, so clear flags first.
  update public.assignment_question_choices c set is_correct = false where c.assignment_id = p_target.id and c.is_correct;
  update public.assignment_part_questions q set position = dq.position, prompt = dq.prompt, max_score = dq.max_score
  from pg_temp.assignment_draft_questions dq where dq.id = q.id;
  insert into public.assignment_part_questions (academy_id, assignment_id, part_id, position, prompt, max_score)
  select p_target.academy_id, p_target.id, p.id, dq.position, dq.prompt, dq.max_score
  from pg_temp.assignment_draft_questions dq
  join public.assignment_parts p on p.assignment_id = p_target.id and p.position = dq.part_position
  where dq.id is null;
  update public.assignment_question_choices c set position = dc.position, label = dc.label, is_correct = dc.is_correct
  from pg_temp.assignment_draft_choices dc where dc.id = c.id;
  insert into public.assignment_question_choices (academy_id, assignment_id, part_id, question_id, position, label, is_correct)
  select p_target.academy_id, p_target.id, q.part_id, q.id, dc.position, dc.label, dc.is_correct
  from pg_temp.assignment_draft_choices dc
  join public.assignment_parts p on p.assignment_id = p_target.id and p.position = dc.part_position
  join public.assignment_part_questions q on q.part_id = p.id and q.position = dc.question_position
  where dc.id is null;
end;
$$;

-- Creates must carry no existing ids at all (parts, questions or choices).
create or replace function edra_private.create_assignment(
  p_academy_id uuid, p_academic_year_id uuid, p_assignment_id uuid, p_draft jsonb
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  existing public.assignments%rowtype;
  target public.assignments%rowtype;
  draft record;
begin
  perform edra_private.require_assignment_role(p_academy_id, false);
  if p_assignment_id is null or p_academic_year_id is null then raise exception using errcode = 'P0001', message = 'validation'; end if;
  select a.* into existing from public.assignments a where a.id = p_assignment_id;
  if found then
    if existing.academy_id = p_academy_id and existing.created_by = actor then
      return edra_private.assignment_json(existing.id) || jsonb_build_object('replayed', true);
    end if;
    raise exception using errcode = 'P0001', message = 'idempotency_conflict';
  end if;
  perform edra_private.parse_assignment_draft(p_draft);
  if exists (select 1 from pg_temp.assignment_draft_parts d where d.id is not null)
    or exists (select 1 from pg_temp.assignment_draft_questions q where q.id is not null)
    or exists (select 1 from pg_temp.assignment_draft_choices c where c.id is not null)
    or exists (select 1 from pg_temp.assignment_draft_parts d where d.kind is null) then
    raise exception using errcode = 'P0001', message = 'validation', hint = 'parts';
  end if;
  perform edra_private.require_open_assignment_year(p_academy_id, p_academic_year_id);
  select * into draft from pg_temp.assignment_draft;
  perform edra_private.check_assignment_audience(p_academy_id, p_academic_year_id, draft.audience, draft.level_id, draft.track_id, draft.group_ids);
  insert into public.assignments (
    id, academy_id, academic_year_id, title, instructions, audience, level_id, track_id, due_at,
    created_by, updated_by
  ) values (
    p_assignment_id, p_academy_id, p_academic_year_id, draft.title, draft.instructions, draft.audience,
    draft.level_id, draft.track_id, draft.due_at, actor, actor
  ) returning * into target;
  perform edra_private.write_assignment_structure(target);
  return edra_private.assignment_json(target.id) || jsonb_build_object('replayed', false);
end;
$$;

-- A published or closed assignment keeps its structure: kinds, questions, choices and maxima must
-- match what is stored; only titles and instructions change.
create or replace function edra_private.update_assignment(
  p_academy_id uuid, p_assignment_id uuid, p_expected_version integer, p_draft jsonb
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  caller_role public.academy_role;
  target public.assignments%rowtype;
  draft record;
  current_groups uuid[];
begin
  caller_role := edra_private.require_assignment_role(p_academy_id, false);
  if p_expected_version is null then raise exception using errcode = 'P0001', message = 'validation'; end if;
  perform edra_private.parse_assignment_draft(p_draft);
  target := edra_private.lock_assignment(p_academy_id, p_assignment_id);
  if target.version <> p_expected_version then raise exception using errcode = 'P0001', message = 'assignment_conflict'; end if;
  if target.state = 'archived' then raise exception using errcode = 'P0001', message = 'invalid_state'; end if;
  if target.state <> 'draft' and caller_role not in ('owner', 'admin') then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  perform edra_private.require_open_assignment_year(target.academy_id, target.academic_year_id);
  select * into draft from pg_temp.assignment_draft;

  if target.state = 'draft' then
    if edra_private.assignment_has_activity(target.id) then raise exception using errcode = 'P0001', message = 'structure_locked'; end if;
    perform edra_private.check_assignment_audience(target.academy_id, target.academic_year_id, draft.audience, draft.level_id, draft.track_id, draft.group_ids);
    update public.assignments set
      title = draft.title, instructions = draft.instructions, audience = draft.audience,
      level_id = draft.level_id, track_id = draft.track_id, due_at = draft.due_at,
      version = version + 1, updated_by = actor, updated_at = now()
    where id = target.id returning * into target;
    perform edra_private.write_assignment_structure(target);
  else
    select coalesce(array_agg(g.group_id order by g.group_id), '{}') into current_groups
    from public.assignment_audience_groups g where g.assignment_id = target.id;
    if (draft.audience, draft.level_id, draft.track_id) is distinct from (target.audience, target.level_id, target.track_id)
      or current_groups is distinct from (select coalesce(array_agg(distinct g order by g), '{}') from unnest(draft.group_ids) g)
      or (select count(*) from pg_temp.assignment_draft_parts) <> target.part_count
      or exists (
        select 1 from pg_temp.assignment_draft_parts d
        left join public.assignment_parts p on p.id = d.id and p.assignment_id = target.id
        where p.id is null or p.position <> d.position or p.max_score <> d.max_score or p.kind is distinct from d.kind
      )
      or edra_private.draft_questions_signature() is distinct from edra_private.stored_questions_signature(target.id) then
      raise exception using errcode = 'P0001', message = 'structure_locked';
    end if;
    update public.assignments set
      title = draft.title, instructions = draft.instructions, due_at = draft.due_at,
      version = version + 1, updated_by = actor, updated_at = now()
    where id = target.id;
    update public.assignment_parts p set title = d.title, instructions = d.instructions
    from pg_temp.assignment_draft_parts d where d.id = p.id and p.assignment_id = target.id;
  end if;
  return edra_private.assignment_json(target.id);
end;
$$;

-- Publishing requires every part complete: positive maximum and a finished question scheme.
create or replace function edra_private.change_assignment_state(
  p_academy_id uuid, p_assignment_id uuid, p_expected_version integer, p_action text
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  target public.assignments%rowtype;
  group_ids uuid[];
  recipients integer;
begin
  perform edra_private.require_assignment_role(p_academy_id, true);
  if p_expected_version is null or p_action is null
    or p_action <> all (array['publish', 'unpublish', 'close', 'reopen', 'archive']) then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  target := edra_private.lock_assignment(p_academy_id, p_assignment_id);
  if target.version <> p_expected_version then raise exception using errcode = 'P0001', message = 'assignment_conflict'; end if;
  perform edra_private.require_open_assignment_year(target.academy_id, target.academic_year_id);

  if p_action = 'publish' then
    if target.state <> 'draft' then raise exception using errcode = 'P0001', message = 'invalid_state'; end if;
    if target.part_count < 1 then raise exception using errcode = 'P0001', message = 'validation', hint = 'parts'; end if;
    if exists (select 1 from public.assignment_parts p where p.assignment_id = target.id and cardinality(edra_private.part_issues(p.id)) > 0) then
      raise exception using errcode = 'P0001', message = 'incomplete';
    end if;
    select coalesce(array_agg(g.group_id), '{}') into group_ids from public.assignment_audience_groups g where g.assignment_id = target.id;
    perform edra_private.check_assignment_audience(target.academy_id, target.academic_year_id, target.audience, target.level_id, target.track_id, group_ids);
    insert into public.assignment_recipients (assignment_id, annual_student_record_id, academy_id, academic_year_id)
    select target.id, r, target.academy_id, target.academic_year_id
    from edra_private.assignment_audience_records(target.academy_id, target.academic_year_id, target.audience, target.level_id, target.track_id, group_ids) r;
    get diagnostics recipients = row_count;
    if recipients = 0 then raise exception using errcode = 'P0001', message = 'empty_audience'; end if;
    update public.assignments set state = 'published', published_at = now(), published_by = actor, recipient_count = recipients,
      version = version + 1, updated_by = actor, updated_at = now()
    where id = target.id;
  elsif p_action = 'unpublish' then
    if target.state <> 'published' then raise exception using errcode = 'P0001', message = 'invalid_state'; end if;
    if edra_private.assignment_has_activity(target.id) then raise exception using errcode = 'P0001', message = 'has_activity'; end if;
    delete from public.assignment_recipients r where r.assignment_id = target.id;
    update public.assignments set state = 'draft', published_at = null, published_by = null, recipient_count = 0,
      version = version + 1, updated_by = actor, updated_at = now()
    where id = target.id;
  elsif p_action = 'close' then
    if target.state <> 'published' then raise exception using errcode = 'P0001', message = 'invalid_state'; end if;
    update public.assignments set state = 'closed', closed_at = now(), closed_by = actor,
      version = version + 1, updated_by = actor, updated_at = now()
    where id = target.id;
  elsif p_action = 'reopen' then
    if target.state <> 'closed' then raise exception using errcode = 'P0001', message = 'invalid_state'; end if;
    update public.assignments set state = 'published', closed_at = null, closed_by = null,
      version = version + 1, updated_by = actor, updated_at = now()
    where id = target.id;
  else
    if target.state not in ('draft', 'closed') then raise exception using errcode = 'P0001', message = 'invalid_state'; end if;
    update public.assignments set state = 'archived', archived_at = now(), archived_by = actor,
      version = version + 1, updated_by = actor, updated_at = now()
    where id = target.id;
  end if;
  return edra_private.assignment_json(target.id);
end;
$$;
