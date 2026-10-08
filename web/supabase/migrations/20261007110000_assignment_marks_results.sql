-- Assignments, checkpoints 2-4 (staff side): recorded work, part marks with fast code entry, and
-- explicit per-student result publication with corrections and a transactional outbox.
--
-- Scope (planning/assignments/implementation.md). Staff-side only:
--   * Student submissions (online essays), student endpoints, and private Storage attachments are
--     NOT in this migration: there is no student account <-> annual record link or suspension state
--     yet. An assignment has no submission mode: staff record work received on paper (or any other
--     way) as submitted, late, missing, or excused, with the actor and the received time, and the
--     student side adds online submissions to the same recipient row later.
--   * The first ordinary mark saved for a student whose work is not yet recorded as received records
--     it as submitted, atomically with the mark.
--
-- Rules:
--   * One result per recipient: one row per (recipient, part) in assignment_marks. No row means
--     unmarked; 0 is a confirmed mark. A row is either an ordinary mark or an excused adjustment with a
--     reason, never both, so a part is never counted twice. Scores are exact decimals with at most two
--     fractional digits, 0 <= score <= the part maximum; unsupported precision is rejected.
--   * Work status is separate from marking: missing or excused awards nothing and does not complete
--     marking. Nothing is marked missing because a due date passed.
--   * A result is complete when every part has a row. Publishing is explicit and per student (also in
--     bulk), allowed for every staff role, validates completeness and the expected per-student version
--     for the whole batch, and writes nothing when any selected student fails.
--   * Each publication is an immutable snapshot (assignment_result_publications) with the previous
--     official values on corrections. Draft marks are never official: after a change the student is
--     pending_correction and reads stay on the last snapshot until republished. Republishing an
--     unchanged result creates no new snapshot and no effect.
--   * Publication writes notification intents to assignment_result_effects (outbox). Nothing consumes
--     or delivers them yet.
--   * Codes are request identifiers only. Marks reference permanent recipient and part ids.
--
-- Lock order (all commands): student code settings (share, code path only) -> assignment (share) ->
-- annual record (share, code path only) -> academic year (share) -> recipient rows (update, by id).
-- Assignment lifecycle commands take the assignment row for update, so close/archive serialize with
-- marking and publication.
--
-- Errors are SQLSTATE P0001 with a stable message: validation, forbidden, not_found, invalid_state,
-- year_unavailable, not_recipient, invalid_score, unknown_part,
-- assignment_closed, has_marks, student_codes_disabled, student_code_not_found, student_code_retired,
-- student_code_ambiguous, idempotency_conflict, throttled.

-- ---------------------------------------------------------------------------------------------
-- One assignment accepts both physical and online work, so there is no submission mode. Online
-- (essay) submissions arrive with the student side; staff record physical work here.

alter table public.assignments drop column mode;
drop type public.assignment_mode;

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
        'id', p.id, 'position', p.position, 'title', p.title, 'instructions', p.instructions, 'max_score', p.max_score::text
      ) order by p.position)
      from public.assignment_parts p where p.assignment_id = a.id
    ), '[]'::jsonb)
  )
  from public.assignments a where a.id = p_assignment_id;
$$;

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
  create temporary table if not exists pg_temp.assignment_draft_parts (
    position integer, id uuid, title text, instructions text, max_score numeric
  ) on commit drop;
  truncate pg_temp.assignment_draft;
  truncate pg_temp.assignment_draft_parts;

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
      (part->>'max_score')::numeric
    from jsonb_array_elements(p_draft->'parts') with ordinality as entries(part, ordinality);
  exception when others then
    raise exception using errcode = 'P0001', message = 'validation';
  end;

  if exists (select 1 from pg_temp.assignment_draft d
      where d.title is null or char_length(d.title) not between 1 and 200 or char_length(d.instructions) > 10000
        or d.audience is null) then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  -- Exact decimals: positive, at most 1000, at most two fractional digits (NaN and Infinity exceed 1000).
  if exists (select 1 from pg_temp.assignment_draft_parts p
      where p.title is null or char_length(p.title) not between 1 and 200 or char_length(p.instructions) > 5000
        or p.max_score is null or not (p.max_score > 0 and p.max_score <= 1000) or p.max_score <> round(p.max_score, 2)) then
    raise exception using errcode = 'P0001', message = 'validation', hint = 'parts';
  end if;
  if (select count(distinct p.id) from pg_temp.assignment_draft_parts p where p.id is not null)
    <> (select count(*) from pg_temp.assignment_draft_parts p where p.id is not null) then
    raise exception using errcode = 'P0001', message = 'validation', hint = 'parts';
  end if;
end;
$$;

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
  if exists (select 1 from pg_temp.assignment_draft_parts d where d.id is not null) then
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
        where p.id is null or p.position <> d.position or p.max_score <> d.max_score
      ) then
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

-- ---------------------------------------------------------------------------------------------
-- Types and tables.

create type public.assignment_work_status as enum ('expected', 'submitted', 'late', 'missing', 'excused');
create type public.assignment_mark_kind as enum ('mark', 'excused');
create type public.assignment_result_effect_type as enum ('result_published', 'result_corrected');

alter table public.assignment_recipients
  add column work_status public.assignment_work_status not null default 'expected',
  -- When physical work was received (staff-supplied or the recording time).
  add column received_at timestamptz,
  add column work_note text not null default '' check (char_length(work_note) <= 500),
  add column work_recorded_by uuid references public.profiles (id),
  add column work_recorded_at timestamptz,
  add column feedback text not null default '' check (char_length(feedback) <= 5000),
  -- Per-student version for marks, feedback, and work status (optimistic concurrency).
  add column version integer not null default 1 check (version >= 1),
  add column updated_at timestamptz not null default now(),
  -- The revision of the current official snapshot; 0 while unpublished.
  add column published_revision integer not null default 0 check (published_revision >= 0),
  add constraint assignment_recipients_work_shape check (
    (work_recorded_by is null) = (work_recorded_at is null)
    and (received_at is null or work_status in ('submitted', 'late'))
    and (work_status not in ('submitted', 'late') or received_at is not null)
  );

-- One row per marked part. Absent = unmarked.
create table public.assignment_marks (
  assignment_id uuid not null,
  annual_student_record_id uuid not null,
  part_id uuid not null,
  academy_id uuid not null,
  kind public.assignment_mark_kind not null,
  score numeric(7, 2) not null check (score >= 0 and score <= 1000),
  -- Required for excused adjustments, absent for ordinary marks.
  reason text check (reason is null or (char_length(reason) between 1 and 500 and reason = btrim(reason))),
  updated_by uuid not null references public.profiles (id),
  updated_at timestamptz not null default now(),
  primary key (assignment_id, annual_student_record_id, part_id),
  foreign key (assignment_id, annual_student_record_id)
    references public.assignment_recipients (assignment_id, annual_student_record_id),
  foreign key (assignment_id, part_id) references public.assignment_parts (assignment_id, id),
  foreign key (academy_id, assignment_id) references public.assignments (academy_id, id),
  constraint assignment_marks_reason_shape check ((kind = 'excused') = (reason is not null))
);

create index assignment_marks_part_idx on public.assignment_marks (assignment_id, part_id);

-- Immutable official snapshots, one per published revision of a student's result.
create table public.assignment_result_publications (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null,
  academic_year_id uuid not null,
  assignment_id uuid not null,
  annual_student_record_id uuid not null,
  revision integer not null check (revision >= 1),
  total numeric(9, 2) not null check (total >= 0),
  max_score numeric(9, 2) not null check (max_score > 0),
  work_status public.assignment_work_status not null,
  -- [{part_id, position, title, max_score, kind, score, reason}] ordered by position.
  marks jsonb not null check (jsonb_typeof(marks) = 'array'),
  feedback text not null,
  -- md5 of edra_private.assignment_result_content at publication; detects pending corrections.
  content_hash text not null,
  -- The official values this revision replaced; null on the first publication.
  previous_total numeric(9, 2),
  previous_work_status public.assignment_work_status,
  previous_marks jsonb,
  published_by uuid not null references public.profiles (id),
  published_at timestamptz not null default now(),
  unique (assignment_id, annual_student_record_id, revision),
  unique (academy_id, id),
  foreign key (assignment_id, annual_student_record_id)
    references public.assignment_recipients (assignment_id, annual_student_record_id),
  foreign key (academy_id, academic_year_id, assignment_id) references public.assignments (academy_id, academic_year_id, id),
  constraint assignment_result_publications_previous_shape check (
    (revision = 1) = (previous_total is null)
    and (previous_total is null) = (previous_work_status is null)
    and (previous_total is null) = (previous_marks is null)
  )
);

create index assignment_result_publications_recipient_idx
  on public.assignment_result_publications (assignment_id, annual_student_record_id, revision desc);

-- Transactional outbox of result notifications. Consumers (student/parent notifications) are later
-- modules; processed_at stays null until one handles the row.
create table public.assignment_result_effects (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null,
  assignment_id uuid not null,
  annual_student_record_id uuid not null,
  publication_id uuid not null,
  effect_type public.assignment_result_effect_type not null,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  foreign key (academy_id, publication_id) references public.assignment_result_publications (academy_id, id),
  unique (publication_id, effect_type)
);

create index assignment_result_effects_pending_idx on public.assignment_result_effects (created_at) where processed_at is null;

-- Retried mark saves and publications. The stored response commits with the write it describes.
create table public.assignment_requests (
  actor_id uuid not null references public.profiles (id),
  idempotency_key uuid not null,
  operation text not null check (operation in ('marks', 'publish')),
  academy_id uuid not null,
  assignment_id uuid not null,
  fingerprint text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (actor_id, idempotency_key)
);

create index assignment_requests_created_idx on public.assignment_requests (created_at);

-- Official history is never deleted.
create or replace function edra_private.reject_assignment_history_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = 'validation', hint = 'Published results are immutable.';
end;
$$;

create trigger assignment_result_publications_immutable before update or delete on public.assignment_result_publications
for each row execute function edra_private.reject_assignment_history_change();

create or replace function edra_private.reject_recipient_delete_with_history()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.work_status <> 'expected' or old.published_revision > 0 then
    raise exception using errcode = 'P0001', message = 'has_activity';
  end if;
  return old;
end;
$$;

create trigger assignment_recipients_keep_history before delete on public.assignment_recipients
for each row execute function edra_private.reject_recipient_delete_with_history();

alter table public.assignment_marks enable row level security;
alter table public.assignment_result_publications enable row level security;
alter table public.assignment_result_effects enable row level security;
alter table public.assignment_requests enable row level security;

revoke all on public.assignment_marks, public.assignment_result_publications, public.assignment_result_effects,
  public.assignment_requests from public, anon, authenticated;
grant select on public.assignment_marks, public.assignment_result_publications to authenticated;

create policy assignment_marks_select_members on public.assignment_marks
  for select to authenticated using (public.is_academy_member(academy_id));
create policy assignment_result_publications_select_members on public.assignment_result_publications
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
  end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Internal helpers.

-- Activity that the structure must keep meaning for: recorded work, any mark, or a publication.
create or replace function edra_private.assignment_has_activity(p_assignment_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.assignment_recipients r
    where r.assignment_id = p_assignment_id and (r.work_status <> 'expected' or r.published_revision > 0)
  ) or exists (select 1 from public.assignment_marks m where m.assignment_id = p_assignment_id);
$$;

-- The assignment locked for marking (share): it must exist in the academy and be published or closed.
create or replace function edra_private.lock_assignment_for_marking(p_academy_id uuid, p_assignment_id uuid)
returns public.assignments
language plpgsql security definer set search_path = '' as $$
declare
  target public.assignments%rowtype;
begin
  if p_assignment_id is null then raise exception using errcode = 'P0001', message = 'validation'; end if;
  select a.* into target from public.assignments a
  where a.id = p_assignment_id and a.academy_id = p_academy_id
  for share;
  if not found then raise exception using errcode = 'P0001', message = 'not_found'; end if;
  if target.state not in ('published', 'closed') then raise exception using errcode = 'P0001', message = 'invalid_state'; end if;
  return target;
end;
$$;

-- A stored response for this caller and key, or null. A key reused for a different request conflicts.
create or replace function edra_private.assignment_replay(p_key uuid, p_operation text, p_assignment_id uuid, p_fingerprint text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  stored public.assignment_requests%rowtype;
begin
  select q.* into stored from public.assignment_requests q where q.actor_id = auth.uid() and q.idempotency_key = p_key;
  if not found then return null; end if;
  if stored.operation <> p_operation or stored.assignment_id <> p_assignment_id or stored.fingerprint <> p_fingerprint then
    raise exception using errcode = 'P0001', message = 'idempotency_conflict';
  end if;
  return stored.response || jsonb_build_object('replayed', true);
end;
$$;

create or replace function edra_private.remember_assignment_request(
  p_key uuid, p_operation text, p_target public.assignments, p_fingerprint text, p_response jsonb
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.assignment_requests (actor_id, idempotency_key, operation, academy_id, assignment_id, fingerprint, response)
  values (auth.uid(), p_key, p_operation, p_target.academy_id, p_target.id, p_fingerprint, p_response);
  return p_response || jsonb_build_object('replayed', false);
end;
$$;

-- The publishable content of a student's result: what a publication freezes and compares.
create or replace function edra_private.assignment_result_content(p_assignment_id uuid, p_record_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'work_status', x.work_status,
    'feedback', x.feedback,
    'marks', coalesce((
      select jsonb_agg(jsonb_build_object('part_id', m.part_id, 'kind', m.kind, 'score', m.score::text, 'reason', m.reason) order by p.position)
      from public.assignment_marks m
      join public.assignment_parts p on p.assignment_id = m.assignment_id and p.id = m.part_id
      where m.assignment_id = x.assignment_id and m.annual_student_record_id = x.annual_student_record_id
    ), '[]'::jsonb)
  )
  from public.assignment_recipients x
  where x.assignment_id = p_assignment_id and x.annual_student_record_id = p_record_id;
$$;

-- Staff rows for an assignment's recipients (all of them, or one): identity, current code, work
-- status, marks, derived marking and publication state. Draft marks are staff-only.
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
        'part_id', k.part_id, 'kind', k.kind, 'score', k.score::text, 'reason', k.reason, 'updated_at', k.updated_at
      ) order by pt.position), '[]'::jsonb) as marks,
      count(k.part_id)::integer as marked,
      sum(k.score)::text as total
    from public.assignment_marks k
    join public.assignment_parts pt on pt.assignment_id = k.assignment_id and pt.id = k.part_id
    where k.assignment_id = x.assignment_id and k.annual_student_record_id = x.annual_student_record_id
  ) m
  left join public.assignment_result_publications p
    on p.assignment_id = x.assignment_id and p.annual_student_record_id = x.annual_student_record_id and p.revision = x.published_revision
  where x.assignment_id = p_assignment_id and (p_record_id is null or x.annual_student_record_id = p_record_id);
$$;

create or replace function edra_private.assignment_recipient_json(p_assignment_id uuid, p_record_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select item from edra_private.assignment_recipient_rows(p_assignment_id, p_record_id);
$$;

-- Resolves an academy-local student code to its holder for an assignment, following the student-code
-- protocol (exact normalized match, never a substring; ambiguous and retired codes refused). The
-- caller holds the settings share lock (rank 1) and the assignment lock (rank 2); this takes the
-- record share lock (rank 3) and revalidates the code against committed state.
create or replace function edra_private.resolve_assignment_code(p_target public.assignments, p_code text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  normalized text := public.normalize_student_code(p_code);
  codes_on boolean;
  holders integer;
  code_row public.student_code_assignments%rowtype;
  holder public.annual_student_records%rowtype;
begin
  if normalized is null then raise exception using errcode = 'P0001', message = 'validation'; end if;
  select s.enabled into codes_on from public.student_code_settings s where s.academy_id = p_target.academy_id;
  if not coalesce(codes_on, false) then raise exception using errcode = 'P0001', message = 'student_codes_disabled'; end if;

  select count(distinct a.academy_student_profile_id) into holders from public.student_code_assignments a
  where a.academy_id = p_target.academy_id and a.code = normalized;
  if holders = 0 then raise exception using errcode = 'P0001', message = 'student_code_not_found'; end if;
  if holders > 1 then raise exception using errcode = 'P0001', message = 'student_code_ambiguous'; end if;

  select a.* into code_row from public.student_code_assignments a
  where a.academy_id = p_target.academy_id and a.code = normalized and a.retired_at is null;
  if not found then raise exception using errcode = 'P0001', message = 'student_code_retired'; end if;

  select r.* into holder from public.annual_student_records r
  where r.id = code_row.annual_student_record_id and r.academy_id = p_target.academy_id for share;
  select a.* into code_row from public.student_code_assignments a where a.id = code_row.id;
  if not found or code_row.retired_at is not null or holder.id is null
    or holder.archived_at is not null or holder.level_id <> code_row.level_id
    or holder.academic_year_id <> code_row.academic_year_id then
    raise exception using errcode = 'P0001', message = 'student_code_retired';
  end if;
  if holder.academic_year_id <> p_target.academic_year_id
    or not exists (select 1 from public.assignment_recipients x where x.assignment_id = p_target.id and x.annual_student_record_id = holder.id) then
    raise exception using errcode = 'P0001', message = 'not_recipient';
  end if;
  return holder.id;
end;
$$;

-- Exact decimal score from a JSON string: 0-9999 with at most two fractional digits.
create or replace function edra_private.parse_assignment_score(p_value jsonb)
returns numeric
language plpgsql immutable set search_path = '' as $$
begin
  if p_value is null or jsonb_typeof(p_value) <> 'string' or (p_value #>> '{}') !~ '^[0-9]{1,4}(\.[0-9]{1,2})?$' then
    raise exception using errcode = 'P0001', message = 'invalid_score';
  end if;
  return (p_value #>> '{}')::numeric;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Commands.

-- Saves one student's part marks and/or feedback against p_expected_version. Exactly one of
-- p_record_id (permanent) or p_code (academy-local student code, resolved in this transaction).
-- p_changes: { "marks": [{ "part_id": uuid, "score": "12.5" | null, "excused_reason"?: text }],
--              "feedback"?: text }
--   score null clears the part; excused_reason makes the row an excused adjustment.
-- Returns { outcome: saved | unchanged | conflict, recipient, work_recorded, replayed }. A stale
-- version writes nothing and returns the current row (conflict) for review.
create or replace function edra_private.save_assignment_marks(
  p_academy_id uuid, p_assignment_id uuid, p_record_id uuid, p_code text, p_expected_version integer, p_changes jsonb, p_key uuid
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
begin
  perform edra_private.require_assignment_role(p_academy_id, false);
  -- Checked in steps: SQL does not short-circuit OR, and JSON accessors raise on the wrong shape.
  if p_key is null or p_expected_version is null or (p_record_id is null) = (p_code is null)
    or p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  if exists (select 1 from jsonb_object_keys(p_changes) k where k not in ('marks', 'feedback'))
    or coalesce(jsonb_typeof(p_changes->'marks'), 'array') <> 'array'
    or coalesce(jsonb_typeof(p_changes->'feedback'), 'string') <> 'string' then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  change_count := coalesce(jsonb_array_length(p_changes->'marks'), 0);
  if (change_count = 0 and not p_changes ? 'feedback') or change_count > 50
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
    'expected_version', p_expected_version, 'changes', p_changes)::text);
  replay := edra_private.assignment_replay(p_key, 'marks', target.id, fingerprint);
  if replay is not null then return replay; end if;

  -- Rank 3: the record (code path).
  record_id := coalesce(p_record_id, edra_private.resolve_assignment_code(target, p_code));
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
  if exists (select 1 from pg_temp.assignment_mark_changes c
      where not exists (select 1 from public.assignment_parts p where p.assignment_id = target.id and p.id = c.part_id)) then
    raise exception using errcode = 'P0001', message = 'unknown_part';
  end if;
  if exists (select 1 from pg_temp.assignment_mark_changes c
      join public.assignment_parts p on p.assignment_id = target.id and p.id = c.part_id
      where not c.clear and c.score > p.max_score) then
    raise exception using errcode = 'P0001', message = 'invalid_score';
  end if;

  ordinary_marks := exists (select 1 from pg_temp.assignment_mark_changes c where not c.clear and c.kind = 'mark');
  -- A closed assignment accepts no newly received work; already received work stays markable.
  if ordinary_marks and target.state = 'closed' and recipient.work_status not in ('submitted', 'late') then
    raise exception using errcode = 'P0001', message = 'assignment_closed';
  end if;

  before_content := edra_private.assignment_result_content(target.id, record_id);

  delete from public.assignment_marks m using pg_temp.assignment_mark_changes c
  where c.clear and m.assignment_id = target.id and m.annual_student_record_id = record_id and m.part_id = c.part_id;
  insert into public.assignment_marks (assignment_id, annual_student_record_id, part_id, academy_id, kind, score, reason, updated_by)
  select target.id, record_id, c.part_id, target.academy_id, c.kind, c.score, case when c.kind = 'excused' then c.reason end, actor
  from pg_temp.assignment_mark_changes c where not c.clear
  on conflict (assignment_id, annual_student_record_id, part_id) do update
    set kind = excluded.kind, score = excluded.score, reason = excluded.reason, updated_by = excluded.updated_by, updated_at = now()
    where (assignment_marks.kind, assignment_marks.score, assignment_marks.reason)
      is distinct from (excluded.kind, excluded.score, excluded.reason);

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

  after_content := edra_private.assignment_result_content(target.id, record_id);
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

-- Records a student's work status against p_expected_version (any staff role):
--   submitted / late: work received, at p_received_at or now. A closed
--     assignment accepts no newly received work.
--   missing / excused: explicit staff decisions; they award no marks.
--   expected: clears an earlier decision.
-- Missing, excused, and expected are refused while ordinary marks exist (has_marks).
-- Returns { outcome: saved | unchanged | conflict, recipient }.
create or replace function edra_private.record_assignment_work(
  p_academy_id uuid, p_assignment_id uuid, p_record_id uuid, p_expected_version integer,
  p_status public.assignment_work_status, p_received_at timestamptz, p_note text
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  target public.assignments%rowtype;
  recipient public.assignment_recipients%rowtype;
  note text := btrim(coalesce(p_note, ''));
  received timestamptz;
begin
  perform edra_private.require_assignment_role(p_academy_id, false);
  if p_record_id is null or p_expected_version is null or p_status is null or char_length(note) > 500
    or (p_received_at is not null and (p_status not in ('submitted', 'late') or p_received_at > now() + interval '5 minutes')) then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  target := edra_private.lock_assignment_for_marking(p_academy_id, p_assignment_id);
  perform edra_private.require_open_assignment_year(target.academy_id, target.academic_year_id);
  select x.* into recipient from public.assignment_recipients x
  where x.assignment_id = target.id and x.annual_student_record_id = p_record_id
  for update;
  if not found then raise exception using errcode = 'P0001', message = 'not_recipient'; end if;
  if recipient.version <> p_expected_version then
    return jsonb_build_object('outcome', 'conflict', 'recipient', edra_private.assignment_recipient_json(target.id, p_record_id));
  end if;

  if p_status in ('submitted', 'late') then
    if target.state = 'closed' and recipient.work_status not in ('submitted', 'late') then
      raise exception using errcode = 'P0001', message = 'assignment_closed';
    end if;
    received := coalesce(p_received_at, case when recipient.work_status in ('submitted', 'late') then recipient.received_at end, now());
  elsif exists (select 1 from public.assignment_marks m
      where m.assignment_id = target.id and m.annual_student_record_id = p_record_id and m.kind = 'mark') then
    raise exception using errcode = 'P0001', message = 'has_marks';
  end if;

  if (recipient.work_status, recipient.received_at, recipient.work_note) is not distinct from (p_status, received, note) then
    return jsonb_build_object('outcome', 'unchanged', 'recipient', edra_private.assignment_recipient_json(target.id, p_record_id));
  end if;
  update public.assignment_recipients set work_status = p_status, received_at = received, work_note = note,
    work_recorded_by = actor, work_recorded_at = now(), version = version + 1, updated_at = now()
  where assignment_id = target.id and annual_student_record_id = p_record_id;
  return jsonb_build_object('outcome', 'saved', 'recipient', edra_private.assignment_recipient_json(target.id, p_record_id));
end;
$$;

-- Publishes the selected students' complete results (any staff role). p_items:
-- [{ "annual_student_record_id": uuid, "expected_version": integer }], 1-500 distinct students.
-- The batch is validated first; any failing student rejects the whole batch with
-- { outcome: rejected, failures: [{ annual_student_record_id, reason }] } and writes nothing.
-- Reasons: not_recipient, stale, incomplete. Otherwise each student is published (first revision),
-- corrected (new revision with the previous official values), or unchanged (no new revision or effect):
-- { outcome: published, results: [{ annual_student_record_id, outcome, revision }], replayed }.
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
      when (select count(*) from public.assignment_marks m
            where m.assignment_id = target.id and m.annual_student_record_id = i.record_id) < target.part_count then 'incomplete'
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
    if latest.id is not null and latest.content_hash = content_hash then
      results := results || jsonb_build_object('annual_student_record_id', item.record_id, 'outcome', 'unchanged', 'revision', latest.revision);
      continue;
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
        'part_id', p.id, 'position', p.position, 'title', p.title, 'max_score', p.max_score::text,
        'kind', m.kind, 'score', m.score::text, 'reason', m.reason
      ) order by p.position), '[]'::jsonb)
    into snapshot
    from public.assignment_parts p
    join public.assignment_marks m on m.assignment_id = p.assignment_id and m.part_id = p.id and m.annual_student_record_id = item.record_id
    where p.assignment_id = target.id;
    next_revision := coalesce(latest.revision, 0) + 1;
    insert into public.assignment_result_publications (
      academy_id, academic_year_id, assignment_id, annual_student_record_id, revision, total, max_score, work_status, marks,
      feedback, content_hash, previous_total, previous_work_status, previous_marks, published_by
    )
    select target.academy_id, target.academic_year_id, target.id, item.record_id, next_revision,
      (select coalesce(sum(m.score), 0) from public.assignment_marks m where m.assignment_id = target.id and m.annual_student_record_id = item.record_id),
      target.max_score, x.work_status, snapshot, x.feedback, content_hash, latest.total, latest.work_status, latest.marks, actor
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

-- Public wrappers charge the quota once, then run the private command.
create function public.save_assignment_marks(
  p_academy_id uuid, p_assignment_id uuid, p_record_id uuid, p_code text, p_expected_version integer, p_changes jsonb, p_key uuid
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform edra_private.charge_mutation_quota('op:assignment_mark');
  return edra_private.save_assignment_marks(p_academy_id, p_assignment_id, p_record_id, p_code, p_expected_version, p_changes, p_key);
end;
$$;

create function public.record_assignment_work(
  p_academy_id uuid, p_assignment_id uuid, p_record_id uuid, p_expected_version integer,
  p_status public.assignment_work_status, p_received_at timestamptz, p_note text
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform edra_private.charge_mutation_quota('op:assignment_mark');
  return edra_private.record_assignment_work(p_academy_id, p_assignment_id, p_record_id, p_expected_version, p_status, p_received_at, p_note);
end;
$$;

create function public.publish_assignment_results(p_academy_id uuid, p_assignment_id uuid, p_items jsonb, p_key uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform edra_private.charge_mutation_quota('op:assignment_publish');
  return edra_private.publish_assignment_results(p_academy_id, p_assignment_id, p_items, p_key);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Reads (academy members; null when the caller is not a member or the assignment is elsewhere).

-- Recipients with work, marks, and publication state, ordered by name. p_filter:
--   all | not_received (expected or missing) | needs_marking (received, not complete) |
--   marked (complete) | unpublished (complete, not officially current).
-- Returns { total, items }.
create or replace function public.list_assignment_marks(
  p_academy_id uuid, p_assignment_id uuid, p_filter text default 'all', p_limit integer default 1000, p_offset integer default 0
)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  result jsonb;
begin
  if auth.uid() is null or p_academy_id is null or not public.is_academy_member(p_academy_id) then return null; end if;
  if not exists (select 1 from public.assignments a where a.id = p_assignment_id and a.academy_id = p_academy_id) then return null; end if;
  if p_filter is null or p_filter <> all (array['all', 'not_received', 'needs_marking', 'marked', 'unpublished'])
    or p_limit is null or p_limit not between 1 and 1000 or p_offset is null or p_offset < 0 then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  with filtered as (
    select r.record_id, r.sort_name, r.item from edra_private.assignment_recipient_rows(p_assignment_id, null) r
    where case p_filter
      when 'all' then true
      when 'not_received' then r.item->>'work_status' in ('expected', 'missing')
      when 'needs_marking' then r.item->>'work_status' in ('submitted', 'late') and r.item->>'marking' <> 'complete'
      when 'marked' then r.item->>'marking' = 'complete'
      when 'unpublished' then r.item->>'marking' = 'complete' and r.item->>'publication_state' <> 'published'
    end
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'items', coalesce((
      select jsonb_agg(page.item order by page.sort_name, page.record_id)
      from (select f.* from filtered f order by f.sort_name, f.record_id limit p_limit offset p_offset) page
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

-- Read-only exact code resolution within an assignment's recipients (fast entry). Returns the
-- student's current row, including existing marks, so corrections start from the current value.
create or replace function public.resolve_assignment_student(p_academy_id uuid, p_assignment_id uuid, p_code text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  target public.assignments%rowtype;
begin
  perform edra_private.require_assignment_role(p_academy_id, false);
  if p_code is null then raise exception using errcode = 'P0001', message = 'validation'; end if;
  perform 1 from public.student_code_settings s where s.academy_id = p_academy_id for share;
  target := edra_private.lock_assignment_for_marking(p_academy_id, p_assignment_id);
  return edra_private.assignment_recipient_json(target.id, edra_private.resolve_assignment_code(target, p_code));
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants.

revoke all on function edra_private.reject_assignment_history_change() from public, anon, authenticated;
revoke all on function edra_private.reject_recipient_delete_with_history() from public, anon, authenticated;
revoke all on function edra_private.assignment_has_activity(uuid) from public, anon, authenticated;
revoke all on function edra_private.lock_assignment_for_marking(uuid, uuid) from public, anon, authenticated;
revoke all on function edra_private.assignment_replay(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function edra_private.remember_assignment_request(uuid, text, public.assignments, text, jsonb) from public, anon, authenticated;
revoke all on function edra_private.assignment_result_content(uuid, uuid) from public, anon, authenticated;
revoke all on function edra_private.assignment_recipient_rows(uuid, uuid) from public, anon, authenticated;
revoke all on function edra_private.assignment_recipient_json(uuid, uuid) from public, anon, authenticated;
revoke all on function edra_private.resolve_assignment_code(public.assignments, text) from public, anon, authenticated;
revoke all on function edra_private.parse_assignment_score(jsonb) from public, anon, authenticated;
revoke all on function edra_private.save_assignment_marks(uuid, uuid, uuid, text, integer, jsonb, uuid) from public, anon, authenticated;
revoke all on function edra_private.record_assignment_work(uuid, uuid, uuid, integer, public.assignment_work_status, timestamptz, text) from public, anon, authenticated;
revoke all on function edra_private.publish_assignment_results(uuid, uuid, jsonb, uuid) from public, anon, authenticated;

revoke all on function public.save_assignment_marks(uuid, uuid, uuid, text, integer, jsonb, uuid) from public, anon;
revoke all on function public.record_assignment_work(uuid, uuid, uuid, integer, public.assignment_work_status, timestamptz, text) from public, anon;
revoke all on function public.publish_assignment_results(uuid, uuid, jsonb, uuid) from public, anon;
revoke all on function public.list_assignment_marks(uuid, uuid, text, integer, integer) from public, anon;
revoke all on function public.resolve_assignment_student(uuid, uuid, text) from public, anon;
grant execute on function public.save_assignment_marks(uuid, uuid, uuid, text, integer, jsonb, uuid) to authenticated;
grant execute on function public.record_assignment_work(uuid, uuid, uuid, integer, public.assignment_work_status, timestamptz, text) to authenticated;
grant execute on function public.publish_assignment_results(uuid, uuid, jsonb, uuid) to authenticated;
grant execute on function public.list_assignment_marks(uuid, uuid, text, integer, integer) to authenticated;
grant execute on function public.resolve_assignment_student(uuid, uuid, text) to authenticated;
