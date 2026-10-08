-- Assignments: per-question answers and marks.
--
-- Staff can enter a student's work question by question: the letter chosen for each Edra-questions or
-- answer-key question (scored from the answer key: the question's full marks when correct, 0 when wrong
-- or left blank), or a mark for each manual-marking question. The part mark is then derived as the
-- sum of the part's answers, in the same transaction, and flagged from_answers.
--
-- A part mark typed directly ("fast marking") stays available for every part. It replaces any answers
-- the student had for that part and is stored with from_answers = false, so analytics can leave it out.
-- Excused adjustments also replace the part's answers. Existing marks are all direct marks.
--
-- Published results are unchanged: they snapshot part marks, never answers.

alter table public.assignment_marks
  add column from_answers boolean not null default false,
  add constraint assignment_marks_answers_are_marks check (not from_answers or kind = 'mark');

create table public.assignment_question_answers (
  assignment_id uuid not null,
  annual_student_record_id uuid not null,
  part_id uuid not null,
  question_id uuid not null,
  academy_id uuid not null,
  -- Choice parts: the chosen choice, or null when the student left it blank. Manual parts: always null.
  choice_id uuid,
  -- Choice parts: derived from the answer key when saved. Manual parts: the mark entered.
  score numeric(7, 2) not null check (score >= 0 and score <= 1000),
  updated_by uuid not null references public.profiles (id),
  updated_at timestamptz not null default now(),
  primary key (assignment_id, annual_student_record_id, question_id),
  foreign key (assignment_id, annual_student_record_id)
    references public.assignment_recipients (assignment_id, annual_student_record_id),
  foreign key (assignment_id, part_id) references public.assignment_parts (assignment_id, id),
  foreign key (part_id, question_id) references public.assignment_part_questions (part_id, id),
  foreign key (question_id, choice_id) references public.assignment_question_choices (question_id, id),
  foreign key (academy_id, assignment_id) references public.assignments (academy_id, id)
);

create index assignment_question_answers_question_idx on public.assignment_question_answers (assignment_id, question_id);

-- Read only through staff security-definer functions, like the answer key.
alter table public.assignment_question_answers enable row level security;
revoke all on public.assignment_question_answers from public, anon, authenticated;

-- Staff rows gain each mark's origin and the student's answers.
create or replace function edra_private.assignment_recipient_rows(p_assignment_id uuid, p_record_id uuid)
returns table (record_id uuid, sort_name text, item jsonb)
language sql stable security definer set search_path = '' as $$
  select x.annual_student_record_id, lower(r.full_name), jsonb_build_object(
    'annual_student_record_id', x.annual_student_record_id,
    'full_name', r.full_name,
    'archived', r.archived_at is not null,
    'group_name', g.name,
    'student_code', c.code,
    'work_status', x.work_status,
    'received_at', x.received_at,
    'work_note', x.work_note,
    'work_recorded_at', x.work_recorded_at,
    'feedback', x.feedback,
    'version', x.version,
    'updated_at', x.updated_at,
    'marks', m.marks,
    'answers', ans.answers,
    'marked_parts', m.marked,
    'total', m.total,
    'marking', case when m.marked = 0 then 'unmarked' when m.marked < a.part_count then 'partial' else 'complete' end,
    'publication', case when p.id is null then null else jsonb_build_object(
      'revision', p.revision, 'total', p.total::text, 'work_status', p.work_status, 'published_at', p.published_at
    ) end,
    'publication_state', case
      when p.id is null then 'unpublished'
      when p.content_hash = md5(edra_private.assignment_result_content(x.assignment_id, x.annual_student_record_id)::text) then 'published'
      else 'pending_correction'
    end
  )
  from public.assignment_recipients x
  join public.assignments a on a.id = x.assignment_id
  join public.annual_student_records r on r.id = x.annual_student_record_id and r.academy_id = x.academy_id
  left join public.groups g on g.id = r.primary_group_id
  left join public.student_code_assignments c on c.annual_student_record_id = r.id and c.retired_at is null
  cross join lateral (
    select coalesce(jsonb_agg(jsonb_build_object(
        'part_id', k.part_id, 'kind', k.kind, 'score', k.score::text, 'reason', k.reason, 'updated_at', k.updated_at,
        'from_answers', k.from_answers
      ) order by pt.position), '[]'::jsonb) as marks,
      count(k.part_id)::integer as marked,
      sum(k.score)::text as total
    from public.assignment_marks k
    join public.assignment_parts pt on pt.assignment_id = k.assignment_id and pt.id = k.part_id
    where k.assignment_id = x.assignment_id and k.annual_student_record_id = x.annual_student_record_id
  ) m
  cross join lateral (
    select coalesce(jsonb_agg(jsonb_build_object(
        'question_id', q.question_id, 'part_id', q.part_id, 'choice_id', q.choice_id, 'score', q.score::text
      ) order by q.part_id, q.question_id), '[]'::jsonb) as answers
    from public.assignment_question_answers q
    where q.assignment_id = x.assignment_id and q.annual_student_record_id = x.annual_student_record_id
  ) ans
  left join public.assignment_result_publications p
    on p.assignment_id = x.assignment_id and p.annual_student_record_id = x.annual_student_record_id and p.revision = x.published_revision
  where x.assignment_id = p_assignment_id and (p_record_id is null or x.annual_student_record_id = p_record_id);
$$;

-- The student's answers, for change detection (answers are not part of the published result).
create or replace function edra_private.assignment_answers_content(p_assignment_id uuid, p_record_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('q', q.question_id, 'c', q.choice_id, 's', q.score::text) order by q.question_id), '[]'::jsonb)
  from public.assignment_question_answers q
  where q.assignment_id = p_assignment_id and q.annual_student_record_id = p_record_id;
$$;

revoke all on function edra_private.assignment_answers_content(uuid, uuid) from public, anon, authenticated;

-- save_assignment_marks gains p_changes.answers: [{question_id, choice_id}] for choice parts (choice_id
-- null = left blank), [{question_id, score}] for manual parts, or [{question_id, clear: true}] to remove
-- an answer. Part marks (p_changes.marks) are direct "fast" marks. One save may not touch the same part
-- both ways. Same signature, locks, idempotency, and outcomes as before.
create or replace function edra_private.save_assignment_marks(
  p_academy_id uuid, p_assignment_id uuid, p_record_id uuid, p_code text, p_expected_version integer, p_changes jsonb, p_key uuid,
  p_expected_record_id uuid default null
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  target public.assignments%rowtype;
  recipient public.assignment_recipients%rowtype;
  record_id uuid;
  fingerprint text;
  replay jsonb;
  before_content jsonb;
  after_content jsonb;
  new_feedback text;
  ordinary_marks boolean;
  work_recorded boolean := false;
  change_count integer;
  answer_count integer;
begin
  perform edra_private.require_assignment_role(p_academy_id, false);
  -- Checked in steps: SQL does not short-circuit OR, and JSON accessors raise on the wrong shape.
  if p_key is null or p_expected_version is null or (p_record_id is null) = (p_code is null)
    or p_changes is null or jsonb_typeof(p_changes) <> 'object'
    or (p_expected_record_id is not null and p_record_id is not null and p_expected_record_id <> p_record_id) then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  if exists (select 1 from jsonb_object_keys(p_changes) k where k not in ('marks', 'answers', 'feedback'))
    or coalesce(jsonb_typeof(p_changes->'marks'), 'array') <> 'array'
    or coalesce(jsonb_typeof(p_changes->'answers'), 'array') <> 'array'
    or coalesce(jsonb_typeof(p_changes->'feedback'), 'string') <> 'string' then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  change_count := coalesce(jsonb_array_length(p_changes->'marks'), 0);
  answer_count := coalesce(jsonb_array_length(p_changes->'answers'), 0);
  if (change_count = 0 and answer_count = 0 and not p_changes ? 'feedback') or change_count > 50 or answer_count > 5000
    or char_length(coalesce(p_changes->>'feedback', '')) > 5000 then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  new_feedback := btrim(p_changes->>'feedback');

  -- Rank 1: code settings (share) so a code save serializes with disabling codes.
  if p_code is not null then
    perform 1 from public.student_code_settings s where s.academy_id = p_academy_id for share;
  end if;
  -- Rank 2: the assignment.
  target := edra_private.lock_assignment_for_marking(p_academy_id, p_assignment_id);

  fingerprint := md5(jsonb_build_object(
    'assignment', target.id, 'record', p_record_id, 'code', public.normalize_student_code(p_code),
    'expected_version', p_expected_version, 'expected_record', p_expected_record_id, 'changes', p_changes)::text);
  replay := edra_private.assignment_replay(p_key, 'marks', target.id, fingerprint);
  if replay is not null then return replay; end if;

  -- Rank 3: the record (code path).
  record_id := coalesce(p_record_id, edra_private.resolve_assignment_code(target, p_code));
  -- The preview named a student. If the code now resolves to someone else, nothing is saved: the
  -- resolution above holds the record share lock, so this check and the write see the same holder.
  if p_expected_record_id is not null and record_id <> p_expected_record_id then
    raise exception using errcode = 'P0001', message = 'student_changed';
  end if;
  -- Rank 4: the year.
  perform edra_private.require_open_assignment_year(target.academy_id, target.academic_year_id);
  -- Rank 5: the recipient.
  select x.* into recipient from public.assignment_recipients x
  where x.assignment_id = target.id and x.annual_student_record_id = record_id
  for update;
  if not found then raise exception using errcode = 'P0001', message = 'not_recipient'; end if;
  if recipient.version <> p_expected_version then
    return jsonb_build_object('outcome', 'conflict', 'recipient', edra_private.assignment_recipient_json(target.id, record_id),
      'work_recorded', false, 'replayed', false);
  end if;

  create temporary table if not exists pg_temp.assignment_mark_changes (
    part_id uuid, clear boolean, kind public.assignment_mark_kind, score numeric, reason text
  ) on commit drop;
  truncate pg_temp.assignment_mark_changes;
  create temporary table if not exists pg_temp.assignment_answer_changes (
    question_id uuid, clear boolean, has_choice boolean, choice_id uuid, score numeric, part_id uuid
  ) on commit drop;
  truncate pg_temp.assignment_answer_changes;
  begin
    insert into pg_temp.assignment_mark_changes
    select (entry->>'part_id')::uuid,
      jsonb_typeof(entry->'score') = 'null',
      case when entry ? 'excused_reason' then 'excused'::public.assignment_mark_kind else 'mark'::public.assignment_mark_kind end,
      case when jsonb_typeof(entry->'score') = 'null' then null else edra_private.parse_assignment_score(entry->'score') end,
      case when entry ? 'excused_reason' then btrim(entry->>'excused_reason') end
    from jsonb_array_elements(coalesce(p_changes->'marks', '[]'::jsonb)) entry
    where jsonb_typeof(entry) = 'object'
      and not exists (select 1 from jsonb_object_keys(entry) k where k not in ('part_id', 'score', 'excused_reason'))
      and entry ? 'score';
    -- Exactly one of choice_id, score, or clear (true) per answer.
    insert into pg_temp.assignment_answer_changes (question_id, clear, has_choice, choice_id, score)
    select (entry->>'question_id')::uuid,
      entry ? 'clear',
      entry ? 'choice_id',
      case when entry ? 'choice_id' and jsonb_typeof(entry->'choice_id') <> 'null' then (entry->>'choice_id')::uuid end,
      case when entry ? 'score' then edra_private.parse_assignment_score(entry->'score') end
    from jsonb_array_elements(coalesce(p_changes->'answers', '[]'::jsonb)) entry
    where jsonb_typeof(entry) = 'object'
      and not exists (select 1 from jsonb_object_keys(entry) k where k not in ('question_id', 'choice_id', 'score', 'clear'))
      and (entry ? 'choice_id')::integer + (entry ? 'score')::integer + (entry ? 'clear')::integer = 1
      and (not entry ? 'clear' or entry->'clear' = 'true'::jsonb)
      and (not entry ? 'choice_id' or jsonb_typeof(entry->'choice_id') in ('string', 'null'))
      and (not entry ? 'score' or jsonb_typeof(entry->'score') <> 'null');
  exception
    when raise_exception then raise;
    when others then raise exception using errcode = 'P0001', message = 'validation';
  end;
  if (select count(*) from pg_temp.assignment_mark_changes) <> change_count
    or exists (select 1 from pg_temp.assignment_mark_changes c where c.part_id is null)
    or (select count(distinct c.part_id) from pg_temp.assignment_mark_changes c) <> (select count(*) from pg_temp.assignment_mark_changes)
    or exists (select 1 from pg_temp.assignment_mark_changes c where c.clear and c.reason is not null)
    or exists (select 1 from pg_temp.assignment_mark_changes c
      where c.kind = 'excused' and not c.clear and (c.reason is null or char_length(c.reason) not between 1 and 500)) then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  if (select count(*) from pg_temp.assignment_answer_changes) <> answer_count
    or exists (select 1 from pg_temp.assignment_answer_changes c where c.question_id is null)
    or (select count(distinct c.question_id) from pg_temp.assignment_answer_changes c) <> answer_count then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  if exists (select 1 from pg_temp.assignment_mark_changes c
      where not exists (select 1 from public.assignment_parts p where p.assignment_id = target.id and p.id = c.part_id)) then
    raise exception using errcode = 'P0001', message = 'unknown_part';
  end if;
  update pg_temp.assignment_answer_changes c set part_id = q.part_id
  from public.assignment_part_questions q where q.id = c.question_id and q.assignment_id = target.id;
  if exists (select 1 from pg_temp.assignment_answer_changes c where c.part_id is null) then
    raise exception using errcode = 'P0001', message = 'unknown_part';
  end if;
  -- The answer must fit the part type: a letter of this question for choice parts, a mark for manual parts.
  if exists (select 1 from pg_temp.assignment_answer_changes c
      join public.assignment_parts p on p.assignment_id = target.id and p.id = c.part_id
      where not c.clear and (
        (p.kind in ('online_questions', 'answer_sheet') and not c.has_choice)
        or (p.kind = 'file_upload' and c.score is null)
        or (c.choice_id is not null and not exists (
          select 1 from public.assignment_question_choices ch where ch.question_id = c.question_id and ch.id = c.choice_id))))
    or exists (select 1 from pg_temp.assignment_answer_changes c join pg_temp.assignment_mark_changes m on m.part_id = c.part_id) then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  if exists (select 1 from pg_temp.assignment_mark_changes c
      join public.assignment_parts p on p.assignment_id = target.id and p.id = c.part_id
      where not c.clear and c.score > p.max_score)
    or exists (select 1 from pg_temp.assignment_answer_changes c
      join public.assignment_part_questions q on q.id = c.question_id
      where c.score is not null and c.score > q.max_score) then
    raise exception using errcode = 'P0001', message = 'invalid_score';
  end if;
  -- Choice answers are scored from the answer key.
  update pg_temp.assignment_answer_changes c
  set score = case when exists (
      select 1 from public.assignment_question_choices ch where ch.question_id = c.question_id and ch.id = c.choice_id and ch.is_correct
    ) then q.max_score else 0 end
  from public.assignment_part_questions q
  where q.id = c.question_id and c.has_choice;

  ordinary_marks := exists (select 1 from pg_temp.assignment_mark_changes c where not c.clear and c.kind = 'mark')
    or exists (select 1 from pg_temp.assignment_answer_changes c where not c.clear);
  -- A closed assignment accepts no newly received work; already received work stays markable.
  if ordinary_marks and target.state = 'closed' and recipient.work_status not in ('submitted', 'late') then
    raise exception using errcode = 'P0001', message = 'assignment_closed';
  end if;

  before_content := edra_private.assignment_result_content(target.id, record_id)
    || jsonb_build_object('answers', edra_private.assignment_answers_content(target.id, record_id));

  -- Direct part marks: a set mark (fast or excused) replaces the part's answers; clearing removes both.
  delete from public.assignment_question_answers a using pg_temp.assignment_mark_changes c
  where a.assignment_id = target.id and a.annual_student_record_id = record_id and a.part_id = c.part_id;
  delete from public.assignment_marks m using pg_temp.assignment_mark_changes c
  where c.clear and m.assignment_id = target.id and m.annual_student_record_id = record_id and m.part_id = c.part_id;
  insert into public.assignment_marks (assignment_id, annual_student_record_id, part_id, academy_id, kind, score, reason, updated_by, from_answers)
  select target.id, record_id, c.part_id, target.academy_id, c.kind, c.score, case when c.kind = 'excused' then c.reason end, actor, false
  from pg_temp.assignment_mark_changes c where not c.clear
  on conflict (assignment_id, annual_student_record_id, part_id) do update
    set kind = excluded.kind, score = excluded.score, reason = excluded.reason, from_answers = false,
      updated_by = excluded.updated_by, updated_at = now()
    where (assignment_marks.kind, assignment_marks.score, assignment_marks.reason, assignment_marks.from_answers)
      is distinct from (excluded.kind, excluded.score, excluded.reason, false);

  -- Answers, then the derived mark of every part they touched.
  delete from public.assignment_question_answers a using pg_temp.assignment_answer_changes c
  where c.clear and a.assignment_id = target.id and a.annual_student_record_id = record_id and a.question_id = c.question_id;
  insert into public.assignment_question_answers (assignment_id, annual_student_record_id, part_id, question_id, academy_id, choice_id, score, updated_by)
  select target.id, record_id, c.part_id, c.question_id, target.academy_id, c.choice_id, c.score, actor
  from pg_temp.assignment_answer_changes c where not c.clear
  on conflict (assignment_id, annual_student_record_id, question_id) do update
    set choice_id = excluded.choice_id, score = excluded.score, updated_by = excluded.updated_by, updated_at = now()
    where (assignment_question_answers.choice_id, assignment_question_answers.score)
      is distinct from (excluded.choice_id, excluded.score);

  insert into public.assignment_marks (assignment_id, annual_student_record_id, part_id, academy_id, kind, score, reason, updated_by, from_answers)
  select target.id, record_id, a.part_id, target.academy_id, 'mark', sum(a.score), null, actor, true
  from public.assignment_question_answers a
  where a.assignment_id = target.id and a.annual_student_record_id = record_id
    and a.part_id in (select c.part_id from pg_temp.assignment_answer_changes c)
  group by a.part_id
  on conflict (assignment_id, annual_student_record_id, part_id) do update
    set kind = 'mark', score = excluded.score, reason = null, from_answers = true, updated_by = excluded.updated_by, updated_at = now()
    where (assignment_marks.kind, assignment_marks.score, assignment_marks.from_answers) is distinct from ('mark', excluded.score, true);
  -- A part whose last answer was removed loses its derived mark; a fast or excused mark is never touched here.
  delete from public.assignment_marks m
  where m.assignment_id = target.id and m.annual_student_record_id = record_id and m.from_answers
    and m.part_id in (select c.part_id from pg_temp.assignment_answer_changes c)
    and not exists (select 1 from public.assignment_question_answers a
      where a.assignment_id = target.id and a.annual_student_record_id = record_id and a.part_id = m.part_id);

  -- The first ordinary mark records the work as received, in the same transaction.
  if ordinary_marks and recipient.work_status not in ('submitted', 'late') then
    update public.assignment_recipients set work_status = 'submitted', received_at = now(),
      work_recorded_by = actor, work_recorded_at = now()
    where assignment_id = target.id and annual_student_record_id = record_id;
    work_recorded := true;
  end if;
  if new_feedback is not null then
    update public.assignment_recipients set feedback = new_feedback
    where assignment_id = target.id and annual_student_record_id = record_id and feedback <> new_feedback;
  end if;

  after_content := edra_private.assignment_result_content(target.id, record_id)
    || jsonb_build_object('answers', edra_private.assignment_answers_content(target.id, record_id));
  if after_content = before_content then
    return edra_private.remember_assignment_request(p_key, 'marks', target, fingerprint, jsonb_build_object(
      'outcome', 'unchanged', 'recipient', edra_private.assignment_recipient_json(target.id, record_id), 'work_recorded', false));
  end if;
  update public.assignment_recipients set version = version + 1, updated_at = now()
  where assignment_id = target.id and annual_student_record_id = record_id;
  return edra_private.remember_assignment_request(p_key, 'marks', target, fingerprint, jsonb_build_object(
    'outcome', 'saved', 'recipient', edra_private.assignment_recipient_json(target.id, record_id), 'work_recorded', work_recorded));
end;
$$;

revoke all on function edra_private.save_assignment_marks(uuid, uuid, uuid, text, integer, jsonb, uuid, uuid) from public, anon, authenticated;
