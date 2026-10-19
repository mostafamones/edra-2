-- Controlled assignment scoring corrections. Authored maxima and official snapshots are retained.
-- Lock graph remains assignment -> year -> recipients, matching marking/publication commands.
-- Existing publications have NULL scoring_revision; their original hashes/snapshots are not rewritten.
alter table public.assignments add column scoring_revision integer not null default 1 check (scoring_revision >= 1);
alter table public.assignment_part_questions add column excluded boolean not null default false;
alter table public.assignment_marks drop constraint assignment_marks_score_check;
alter table public.assignment_marks add constraint assignment_marks_score_check check (score >= 0 and score <= 10000);
alter table public.assignment_marks add column requires_remark boolean not null default false;
alter table public.assignment_result_publications add column scoring_revision integer check (scoring_revision >= 1);
alter table public.assignment_result_publications drop constraint assignment_result_publications_max_score_check;
alter table public.assignment_result_publications add constraint assignment_result_publications_max_score_check check (max_score >= 0);
alter table public.assignment_requests drop constraint assignment_requests_operation_check;
alter table public.assignment_requests add constraint assignment_requests_operation_check check (operation in ('marks', 'publish', 'correct'));

create table public.assignment_corrections (
  assignment_id uuid not null, academy_id uuid not null, revision integer not null check (revision > 1),
  question_id uuid not null, part_id uuid not null,
  operation text not null check (operation in ('key', 'exclusion')),
  previous_choice_id uuid, choice_id uuid,
  previous_max_score numeric(9,2) not null, max_score numeric(9,2) not null,
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default clock_timestamp(),
  primary key (assignment_id, revision),
  foreign key (academy_id, assignment_id) references public.assignments(academy_id, id),
  foreign key (assignment_id, part_id) references public.assignment_parts(assignment_id, id),
  foreign key (part_id, question_id) references public.assignment_part_questions(part_id, id),
  foreign key (question_id, previous_choice_id) references public.assignment_question_choices(question_id, id),
  foreign key (question_id, choice_id) references public.assignment_question_choices(question_id, id),
  check ((operation = 'key' and previous_choice_id is not null and choice_id is not null and previous_choice_id <> choice_id)
    or (operation = 'exclusion' and previous_choice_id is null and choice_id is null))
);
create index assignment_corrections_question_idx on public.assignment_corrections(question_id, revision);
create table public.assignment_mark_basis_history (
  assignment_id uuid not null, revision integer not null, annual_student_record_id uuid not null,
  part_id uuid not null, mark jsonb not null, answers jsonb not null,
  primary key (assignment_id, revision, annual_student_record_id, part_id),
  foreign key (assignment_id, revision) references public.assignment_corrections(assignment_id, revision),
  foreign key (assignment_id, annual_student_record_id) references public.assignment_recipients(assignment_id, annual_student_record_id),
  foreign key (assignment_id, part_id) references public.assignment_parts(assignment_id, id)
);
alter table public.assignment_corrections enable row level security;
alter table public.assignment_mark_basis_history enable row level security;
revoke all on public.assignment_corrections, public.assignment_mark_basis_history from public, anon, authenticated;
create trigger assignment_corrections_immutable before update or delete on public.assignment_corrections
  for each row execute function edra_private.reject_assignment_history_change();
create trigger assignment_mark_basis_history_immutable before update or delete on public.assignment_mark_basis_history
  for each row execute function edra_private.reject_assignment_history_change();

create function edra_private.assignment_part_max(p_part_id uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select case when p.kind is null then p.max_score else coalesce((select sum(q.max_score)
    from public.assignment_part_questions q where q.part_id = p.id and not q.excluded), 0) end
  from public.assignment_parts p where p.id = p_part_id;
$$;
create function edra_private.assignment_max(p_assignment_id uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(edra_private.assignment_part_max(p.id)), 0) from public.assignment_parts p where p.assignment_id = p_assignment_id;
$$;

-- A partial question entry cannot satisfy a part's completeness. Excluded questions need no entry.
create function edra_private.assignment_part_complete(p_assignment_id uuid, p_record_id uuid, p_part_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when m.requires_remark then false
    when m.part_id is not null and not m.from_answers then true
    when p.kind is not null then not exists (select 1 from public.assignment_part_questions q where q.part_id = p.id and not q.excluded
      and not exists (select 1 from public.assignment_question_answers a where a.assignment_id = p_assignment_id
        and a.annual_student_record_id = p_record_id and a.question_id = q.id))
    else false end
  from public.assignment_parts p left join public.assignment_marks m
    on m.assignment_id = p.assignment_id and m.part_id = p.id and m.annual_student_record_id = p_record_id
  where p.assignment_id = p_assignment_id and p.id = p_part_id;
$$;

-- Only the exact operation recorded by the current immutable correction may pass the structure guard.
create or replace function edra_private.guard_assignment_structure()
returns trigger language plpgsql security definer set search_path = '' as $$
declare target uuid := coalesce(new.assignment_id, old.assignment_id); correction public.assignment_corrections%rowtype;
begin
  if tg_op = 'UPDATE' and tg_table_name in ('assignment_part_questions', 'assignment_question_choices') then
    select c.* into correction from public.assignment_corrections c join public.assignments a on a.id = c.assignment_id
      where c.assignment_id = target and c.revision = a.scoring_revision;
    if found then
      if tg_table_name = 'assignment_part_questions' then
        if correction.operation = 'exclusion'
        and new.id = correction.question_id and not old.excluded and new.excluded
        and (to_jsonb(new) - 'excluded') = (to_jsonb(old) - 'excluded') then return new; end if;
      elsif tg_table_name = 'assignment_question_choices' then
        if correction.operation = 'key'
        and new.question_id = correction.question_id and new.is_correct = (new.id = correction.choice_id)
        and (to_jsonb(new) - 'is_correct') = (to_jsonb(old) - 'is_correct') then return new; end if;
      end if;
    end if;
  end if;
  if not exists (select 1 from public.assignments a where a.id = target and a.state = 'active')
    or edra_private.assignment_has_activity(target) then raise exception using errcode = 'P0001', message = 'structure_locked'; end if;
  return coalesce(new, old);
end;
$$;

alter function edra_private.assignment_result_content(uuid, uuid) rename to assignment_result_content_legacy;
create function edra_private.assignment_result_content(p_assignment_id uuid, p_record_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select edra_private.assignment_result_content_legacy(p_assignment_id, p_record_id) || jsonb_build_object(
    'scoring_revision', a.scoring_revision, 'max_score', edra_private.assignment_max(a.id)::text,
    'basis', (select coalesce(jsonb_agg(jsonb_build_object('part_id', p.id, 'max_score', edra_private.assignment_part_max(p.id)::text,
      'requires_remark', coalesce(m.requires_remark, false), 'from_answers', coalesce(m.from_answers, false),
      'questions', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'max_score', q.max_score::text, 'excluded', q.excluded,
        'correct_choice', (select c.id from public.assignment_question_choices c where c.question_id = q.id and c.is_correct)) order by q.position), '[]'::jsonb)
        from public.assignment_part_questions q where q.part_id = p.id)) order by p.position), '[]'::jsonb)
      from public.assignment_parts p left join public.assignment_marks m on m.assignment_id = p.assignment_id
        and m.part_id = p.id and m.annual_student_record_id = p_record_id where p.assignment_id = a.id))
  from public.assignments a where a.id = p_assignment_id;
$$;
create function edra_private.assignment_publication_matches(p_publication public.assignment_result_publications) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_publication.content_hash = md5(edra_private.assignment_result_content(p_publication.assignment_id, p_publication.annual_student_record_id)::text)
    or (p_publication.scoring_revision is null and (select a.scoring_revision from public.assignments a where a.id = p_publication.assignment_id) = 1
      and p_publication.content_hash = md5(edra_private.assignment_result_content_legacy(p_publication.assignment_id, p_publication.annual_student_record_id)::text));
$$;

-- Projection extensions compose with cohort/eligibility additions; they never redefine required membership.
alter function edra_private.assignment_json(uuid) rename to assignment_json_before_scoring;
create function edra_private.assignment_json(p_assignment_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select edra_private.assignment_json_before_scoring(a.id) || jsonb_build_object(
    'scoring_revision', a.scoring_revision, 'authored_max_score', a.max_score::text, 'max_score', edra_private.assignment_max(a.id)::text,
    'corrections', (select coalesce(jsonb_agg(to_jsonb(c) || jsonb_build_object('previous_max_score', c.previous_max_score::text, 'max_score', c.max_score::text) order by c.revision), '[]'::jsonb) from public.assignment_corrections c where c.assignment_id = a.id),
    'parts', (select coalesce(jsonb_agg(p.value || jsonb_build_object('authored_max_score', p.value->>'max_score',
      'max_score', edra_private.assignment_part_max((p.value->>'id')::uuid)::text,
      'questions', (select coalesce(jsonb_agg(q.value || jsonb_build_object('excluded', s.excluded) order by q.ordinality), '[]'::jsonb)
        from jsonb_array_elements(p.value->'questions') with ordinality q(value, ordinality)
        join public.assignment_part_questions s on s.id = (q.value->>'id')::uuid)) order by p.ordinality), '[]'::jsonb)
      from jsonb_array_elements(edra_private.assignment_json_before_scoring(a.id)->'parts') with ordinality p(value, ordinality)))
  from public.assignments a where a.id = p_assignment_id;
$$;

alter function edra_private.assignment_recipient_rows(uuid, uuid) rename to assignment_recipient_rows_before_scoring;
create function edra_private.assignment_recipient_rows(p_assignment_id uuid, p_record_id uuid)
returns table(record_id uuid, sort_name text, item jsonb)
language sql stable security definer set search_path = '' as $$
  select b.record_id, b.sort_name, b.item || jsonb_build_object(
    'scoring_revision', a.scoring_revision,
    'marks', (select coalesce(jsonb_agg(v.value || jsonb_build_object('requires_remark', m.requires_remark) order by v.ordinality), '[]'::jsonb)
      from jsonb_array_elements(b.item->'marks') with ordinality v(value, ordinality)
      join public.assignment_marks m on m.assignment_id = a.id and m.annual_student_record_id = b.record_id and m.part_id = (v.value->>'part_id')::uuid),
    'marked_parts', s.marked, 'total', s.total,
    'marking', case when s.marked = a.part_count then 'complete' when s.marked = 0 then 'unmarked' else 'partial' end,
    'publication', case when pub.id is null then null else (b.item->'publication') || jsonb_build_object('max_score', pub.max_score::text, 'scoring_revision', coalesce(pub.scoring_revision, 1)) end,
    'publication_state', case when pub.id is null then 'unpublished' when edra_private.assignment_publication_matches(pub) then 'published' else 'pending_correction' end,
    'mark_history', (select coalesce(jsonb_agg(to_jsonb(h) order by h.revision, h.part_id), '[]'::jsonb) from public.assignment_mark_basis_history h where h.assignment_id = a.id and h.annual_student_record_id = b.record_id),
    'publications', (select coalesce(jsonb_agg(jsonb_build_object('revision', r.revision, 'scoring_revision', coalesce(r.scoring_revision, 1),
      'total', r.total::text, 'max_score', r.max_score::text, 'marks', r.marks, 'feedback', r.feedback, 'published_at', r.published_at) order by r.revision), '[]'::jsonb)
      from public.assignment_result_publications r where r.assignment_id = a.id and r.annual_student_record_id = b.record_id))
  from edra_private.assignment_recipient_rows_before_scoring(p_assignment_id, p_record_id) b
  join public.assignments a on a.id = p_assignment_id
  join public.assignment_recipients x on x.assignment_id = a.id and x.annual_student_record_id = b.record_id
  left join public.assignment_result_publications pub on pub.assignment_id = a.id and pub.annual_student_record_id = b.record_id and pub.revision = x.published_revision
  cross join lateral (select count(*) filter (where edra_private.assignment_part_complete(a.id, b.record_id, pt.id))::integer as marked,
    case when count(m.part_id) filter (where not m.requires_remark) > 0 then sum(case when m.requires_remark then null else m.score end)::text
      when edra_private.assignment_max(a.id) = 0 and not coalesce(bool_or(m.requires_remark), false) then '0' else null end as total
    from public.assignment_parts pt left join public.assignment_marks m on m.assignment_id = pt.assignment_id and m.part_id = pt.id and m.annual_student_record_id = b.record_id
    where pt.assignment_id = a.id) s;
$$;

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
  if exists (select 1 from pg_temp.assignment_answer_changes c join public.assignment_part_questions q on q.id = c.question_id where q.excluded) then
    raise exception using errcode = 'P0001', message = 'question_excluded';
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
      where not c.clear and c.score > edra_private.assignment_part_max(p.id))
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
  where a.assignment_id = target.id and a.annual_student_record_id = record_id and a.part_id = c.part_id
    and not exists (select 1 from public.assignment_part_questions q where q.id = a.question_id and q.excluded);
  delete from public.assignment_marks m using pg_temp.assignment_mark_changes c
  where c.clear and m.assignment_id = target.id and m.annual_student_record_id = record_id and m.part_id = c.part_id;
  insert into public.assignment_marks (assignment_id, annual_student_record_id, part_id, academy_id, kind, score, reason, updated_by, from_answers)
  select target.id, record_id, c.part_id, target.academy_id, c.kind, c.score, case when c.kind = 'excused' then c.reason end, actor, false
  from pg_temp.assignment_mark_changes c where not c.clear
  on conflict (assignment_id, annual_student_record_id, part_id) do update
    set kind = excluded.kind, score = excluded.score, reason = excluded.reason, from_answers = false,
      requires_remark = false, updated_by = excluded.updated_by, updated_at = now()
    where assignment_marks.requires_remark or (assignment_marks.kind, assignment_marks.score, assignment_marks.reason, assignment_marks.from_answers)
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
  select target.id, record_id, a.part_id, target.academy_id, 'mark', sum(case when q.excluded then 0 else a.score end), null, actor, true
  from public.assignment_question_answers a join public.assignment_part_questions q on q.id = a.question_id
  where a.assignment_id = target.id and a.annual_student_record_id = record_id
    and a.part_id in (select c.part_id from pg_temp.assignment_answer_changes c)
  group by a.part_id
  on conflict (assignment_id, annual_student_record_id, part_id) do update
    set kind = 'mark', score = excluded.score, reason = null, from_answers = true, requires_remark = false, updated_by = excluded.updated_by, updated_at = now()
    where assignment_marks.requires_remark or (assignment_marks.kind, assignment_marks.score, assignment_marks.from_answers) is distinct from ('mark', excluded.score, true);
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


create or replace function edra_private.publish_assignment_results(p_academy_id uuid, p_assignment_id uuid, p_items jsonb, p_key uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  target public.assignments%rowtype;
  fingerprint text;
  replay jsonb;
  failures jsonb;
  results jsonb := '[]'::jsonb;
  item record;
  content jsonb;
  content_hash text;
  latest public.assignment_result_publications%rowtype;
  snapshot jsonb;
  publication uuid;
  next_revision integer;
begin
  perform edra_private.require_assignment_role(p_academy_id, false);
  if p_key is null or p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  if jsonb_array_length(p_items) not between 1 and 500 then raise exception using errcode = 'P0001', message = 'validation'; end if;
  create temporary table if not exists pg_temp.assignment_publish_items (record_id uuid, expected_version integer) on commit drop;
  truncate pg_temp.assignment_publish_items;
  begin
    insert into pg_temp.assignment_publish_items
    select (entry->>'annual_student_record_id')::uuid, (entry->>'expected_version')::integer
    from jsonb_array_elements(p_items) entry
    where jsonb_typeof(entry) = 'object'
      and not exists (select 1 from jsonb_object_keys(entry) k where k not in ('annual_student_record_id', 'expected_version'));
  exception when others then
    raise exception using errcode = 'P0001', message = 'validation';
  end;
  if (select count(*) from pg_temp.assignment_publish_items) <> jsonb_array_length(p_items)
    or exists (select 1 from pg_temp.assignment_publish_items i where i.record_id is null or i.expected_version is null)
    or (select count(distinct i.record_id) from pg_temp.assignment_publish_items i) <> jsonb_array_length(p_items) then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;

  target := edra_private.lock_assignment_for_marking(p_academy_id, p_assignment_id);
  select md5(jsonb_build_object('assignment', target.id, 'items', jsonb_agg(jsonb_build_array(i.record_id, i.expected_version) order by i.record_id))::text)
  into fingerprint from pg_temp.assignment_publish_items i;
  replay := edra_private.assignment_replay(p_key, 'publish', target.id, fingerprint);
  if replay is not null then return replay; end if;
  perform edra_private.require_open_assignment_year(target.academy_id, target.academic_year_id);

  perform 1 from public.assignment_recipients x
  where x.assignment_id = target.id and x.annual_student_record_id in (select i.record_id from pg_temp.assignment_publish_items i)
  order by x.annual_student_record_id
  for update;

  select jsonb_agg(jsonb_build_object('annual_student_record_id', f.record_id, 'reason', f.reason) order by f.record_id)
  into failures
  from (
    select i.record_id, case
      when x.annual_student_record_id is null then 'not_recipient'
      when x.version <> i.expected_version then 'stale'
      when exists (select 1 from public.assignment_parts p where p.assignment_id = target.id and not edra_private.assignment_part_complete(target.id, i.record_id, p.id)) then 'incomplete'
    end as reason
    from pg_temp.assignment_publish_items i
    left join public.assignment_recipients x on x.assignment_id = target.id and x.annual_student_record_id = i.record_id
  ) f
  where f.reason is not null;
  if failures is not null then
    return jsonb_build_object('outcome', 'rejected', 'failures', failures, 'replayed', false);
  end if;

  for item in select i.record_id from pg_temp.assignment_publish_items i order by i.record_id loop
    content := edra_private.assignment_result_content(target.id, item.record_id);
    content_hash := md5(content::text);
    select p.* into latest from public.assignment_result_publications p
    where p.assignment_id = target.id and p.annual_student_record_id = item.record_id
    order by p.revision desc limit 1;
    if latest.id is not null and edra_private.assignment_publication_matches(latest) then
      results := results || jsonb_build_object('annual_student_record_id', item.record_id, 'outcome', 'unchanged', 'revision', latest.revision);
      continue;
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
        'part_id', p.id, 'position', p.position, 'title', p.title, 'max_score', edra_private.assignment_part_max(p.id)::text,
        'kind', coalesce(m.kind, 'mark'::public.assignment_mark_kind), 'score', coalesce(m.score, 0)::text, 'reason', m.reason, 'scoring_revision', target.scoring_revision
      ) order by p.position), '[]'::jsonb)
    into snapshot
    from public.assignment_parts p
    left join public.assignment_marks m on m.assignment_id = p.assignment_id and m.part_id = p.id and m.annual_student_record_id = item.record_id
    where p.assignment_id = target.id;
    next_revision := coalesce(latest.revision, 0) + 1;
    insert into public.assignment_result_publications (
      academy_id, academic_year_id, assignment_id, annual_student_record_id, revision, total, max_score, work_status, marks,
      feedback, content_hash, previous_total, previous_work_status, previous_marks, published_by, scoring_revision
    )
    select target.academy_id, target.academic_year_id, target.id, item.record_id, next_revision,
      (select coalesce(sum(m.score), 0) from public.assignment_marks m where m.assignment_id = target.id and m.annual_student_record_id = item.record_id),
      edra_private.assignment_max(target.id), x.work_status, snapshot, x.feedback, content_hash, latest.total, latest.work_status, latest.marks, actor, target.scoring_revision
    from public.assignment_recipients x
    where x.assignment_id = target.id and x.annual_student_record_id = item.record_id
    returning id into publication;
    insert into public.assignment_result_effects (academy_id, assignment_id, annual_student_record_id, publication_id, effect_type)
    values (target.academy_id, target.id, item.record_id, publication,
      case when next_revision = 1 then 'result_published' else 'result_corrected' end::public.assignment_result_effect_type);
    update public.assignment_recipients set published_revision = next_revision
    where assignment_id = target.id and annual_student_record_id = item.record_id;
    results := results || jsonb_build_object('annual_student_record_id', item.record_id,
      'outcome', case when next_revision = 1 then 'published' else 'corrected' end, 'revision', next_revision);
  end loop;

  return edra_private.remember_assignment_request(p_key, 'publish', target, fingerprint,
    jsonb_build_object('outcome', 'published', 'results', results));
end;
$$;

create function edra_private.correct_assignment_scoring(
  p_academy_id uuid, p_assignment_id uuid, p_question_id uuid, p_choice_id uuid,
  p_expected_scoring_revision integer, p_operation text, p_key uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  target public.assignments%rowtype;
  question public.assignment_part_questions%rowtype;
  previous uuid;
  fingerprint text;
  replay jsonb;
  previous_max numeric;
  next_max numeric;
begin
  perform edra_private.require_assignment_role(p_academy_id, true);
  if p_key is null or p_question_id is null or p_expected_scoring_revision is null or p_expected_scoring_revision < 1
    or p_operation is null or p_operation not in ('key', 'exclusion')
    or (p_operation = 'key') <> (p_choice_id is not null) then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  target := edra_private.lock_assignment(p_academy_id, p_assignment_id);
  fingerprint := md5(jsonb_build_object('academy', p_academy_id, 'assignment', p_assignment_id, 'question', p_question_id,
    'choice', p_choice_id, 'revision', p_expected_scoring_revision, 'operation', p_operation)::text);
  replay := edra_private.assignment_replay(p_key, 'correct', target.id, fingerprint);
  if replay is not null then return replay; end if;
  perform edra_private.require_open_assignment_year(target.academy_id, target.academic_year_id);
  if target.state not in ('active', 'closed') then raise exception using errcode = 'P0001', message = 'invalid_state'; end if;
  if not edra_private.assignment_has_activity(target.id) then raise exception using errcode = 'P0001', message = 'invalid_state'; end if;
  if target.scoring_revision <> p_expected_scoring_revision then raise exception using errcode = 'P0001', message = 'stale_basis'; end if;
  select q.* into question from public.assignment_part_questions q where q.assignment_id = target.id and q.id = p_question_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'unknown_part'; end if;
  if question.excluded then raise exception using errcode = 'P0001', message = 'question_excluded'; end if;
  if p_operation = 'key' then
    if not exists (select 1 from public.assignment_parts p where p.id = question.part_id and p.kind in ('online_questions', 'answer_sheet'))
      or not exists (select 1 from public.assignment_question_choices c where c.question_id = question.id and c.id = p_choice_id) then
      raise exception using errcode = 'P0001', message = 'unknown_part';
    end if;
    select c.id into previous from public.assignment_question_choices c where c.question_id = question.id and c.is_correct;
    if previous is null or previous = p_choice_id then raise exception using errcode = 'P0001', message = 'validation'; end if;
  end if;
  perform 1 from public.assignment_recipients r where r.assignment_id = target.id order by r.annual_student_record_id for update;
  previous_max := edra_private.assignment_part_max(question.part_id);
  next_max := previous_max - case when p_operation = 'exclusion' then question.max_score else 0 end;
  insert into public.assignment_corrections(assignment_id, academy_id, revision, question_id, part_id, operation,
    previous_choice_id, choice_id, previous_max_score, max_score, created_by)
  values(target.id, target.academy_id, target.scoring_revision + 1, question.id, question.part_id, p_operation,
    previous, p_choice_id, previous_max, next_max, auth.uid());
  insert into public.assignment_mark_basis_history(assignment_id, revision, annual_student_record_id, part_id, mark, answers)
  select target.id, target.scoring_revision + 1, m.annual_student_record_id, m.part_id,
    jsonb_build_object('score', m.score::text, 'max_score', previous_max::text, 'kind', m.kind, 'reason', m.reason,
      'from_answers', m.from_answers, 'requires_remark', m.requires_remark, 'scoring_revision', target.scoring_revision),
    (select coalesce(jsonb_agg(to_jsonb(a) order by a.question_id), '[]'::jsonb) from public.assignment_question_answers a
      where a.assignment_id = target.id and a.annual_student_record_id = m.annual_student_record_id and a.part_id = m.part_id)
  from public.assignment_marks m where m.assignment_id = target.id and m.part_id = question.part_id;
  update public.assignments set scoring_revision = scoring_revision + 1, version = version + 1, updated_by = auth.uid(), updated_at = clock_timestamp()
    where id = target.id;
  if p_operation = 'key' then
    update public.assignment_question_choices set is_correct = false where question_id = question.id and is_correct;
    update public.assignment_question_choices set is_correct = true where question_id = question.id and id = p_choice_id;
    update public.assignment_question_answers a set score = case when a.choice_id = p_choice_id then question.max_score else 0 end,
      updated_by = auth.uid(), updated_at = clock_timestamp() where a.assignment_id = target.id and a.question_id = question.id;
  else
    update public.assignment_part_questions set excluded = true where id = question.id;
    -- No inferred per-question scores, proration or clamping of a direct total (including excused).
    update public.assignment_marks set requires_remark = true where assignment_id = target.id and part_id = question.part_id and not from_answers;
  end if;
  update public.assignment_marks m set score = (select coalesce(sum(case when q.excluded then 0 else a.score end), 0)
      from public.assignment_question_answers a join public.assignment_part_questions q on q.id = a.question_id
      where a.assignment_id = m.assignment_id and a.annual_student_record_id = m.annual_student_record_id and a.part_id = m.part_id),
    updated_by = auth.uid(), updated_at = clock_timestamp()
    where m.assignment_id = target.id and m.part_id = question.part_id and m.from_answers;
  -- Every in-flight mark/announcement based on the earlier scheme must fail its version check.
  update public.assignment_recipients set version = version + 1, updated_at = clock_timestamp() where assignment_id = target.id;
  return edra_private.remember_assignment_request(p_key, 'correct', target, fingerprint,
    jsonb_build_object('outcome', case when p_operation = 'key' then 'corrected' else 'excluded' end,
      'assignment', edra_private.assignment_json(target.id)));
end;
$$;

create function public.correct_assignment_key(p_academy_id uuid, p_assignment_id uuid, p_question_id uuid,
  p_choice_id uuid, p_expected_scoring_revision integer, p_key uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  return edra_private.correct_assignment_scoring(p_academy_id, p_assignment_id, p_question_id, p_choice_id, p_expected_scoring_revision, 'key', p_key);
end;
$$;
create function public.exclude_assignment_question(p_academy_id uuid, p_assignment_id uuid, p_question_id uuid,
  p_expected_scoring_revision integer, p_key uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  return edra_private.correct_assignment_scoring(p_academy_id, p_assignment_id, p_question_id, null, p_expected_scoring_revision, 'exclusion', p_key);
end;
$$;
-- Public commands are definer wrappers, like existing assignment APIs. Private helpers have no API grants.
revoke all on function public.correct_assignment_key(uuid, uuid, uuid, uuid, integer, uuid),
  public.exclude_assignment_question(uuid, uuid, uuid, integer, uuid) from public, anon;
grant execute on function public.correct_assignment_key(uuid, uuid, uuid, uuid, integer, uuid),
  public.exclude_assignment_question(uuid, uuid, uuid, integer, uuid) to authenticated;
revoke all on function edra_private.assignment_part_max(uuid), edra_private.assignment_max(uuid),
  edra_private.assignment_part_complete(uuid, uuid, uuid), edra_private.assignment_result_content(uuid, uuid),
  edra_private.assignment_publication_matches(public.assignment_result_publications),
  edra_private.assignment_json(uuid), edra_private.assignment_recipient_rows(uuid, uuid),
  edra_private.correct_assignment_scoring(uuid, uuid, uuid, uuid, integer, text, uuid) from public, anon, authenticated;
