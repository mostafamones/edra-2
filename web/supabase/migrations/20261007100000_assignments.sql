-- Assignments, checkpoint 1: structure, audience, authoring, and the published recipient snapshot.
--
-- Scope (planning/assignments/implementation.md, checkpoint 1). Assignments only: no quiz, exam,
-- question, rubric, attempt, or submission tables. Submissions, marks, and results are later slices
-- that add their own tables and extend edra_private.assignment_has_activity.
--
-- Rules:
--   * An assignment belongs to one academy and one academic year. Its audience is exactly one of an
--     entire level, a level and track ("program"), or selected groups of that year.
--   * Mode is Online or In-person, never both.
--   * Ordered parts each carry a positive maximum with at most two decimals (0 < max <= 1000);
--     unsupported precision is rejected, never rounded. The assignment maximum and part count are
--     maintained from the parts by a trigger and are never caller-authoritative.
--   * The due date is advisory only. Nothing here rejects, closes, or marks work because of it.
--   * Any staff member creates and edits drafts. Only Owner/Admin publishes, unpublishes (before
--     activity), closes, reopens, archives, or edits the text details of a published assignment.
--   * Publishing snapshots the matching active annual student records as recipients, once. Later
--     enrollment or group moves do not add or remove recipients. Unpublishing deletes the snapshot,
--     which is only allowed while no recipient has activity.
--   * After publication the structure (mode, audience, part ids, order, maxima) is locked; title,
--     instructions, due date, and part titles/instructions remain editable by Owner/Admin.
--   * A closed academic year makes every assignment read-only.
--
-- Clients read through RLS (academy members). Every write goes through the security definer commands
-- below, which check identity and live role (academy_role_for also refuses revoked and recovery
-- sessions). Errors are SQLSTATE P0001 with a stable code as the message:
--   forbidden, validation, not_found, year_unavailable, assignment_conflict (stale version),
--   invalid_audience, empty_audience, invalid_state, structure_locked, has_activity,
--   idempotency_conflict, throttled.
--
-- Lock order: assignment row (for update), then academic year (for share).

create type public.assignment_state as enum ('draft', 'published', 'closed', 'archived');
create type public.assignment_mode as enum ('online', 'in_person');
create type public.assignment_audience as enum ('level', 'program', 'groups');

create table public.assignments (
  id uuid primary key,
  academy_id uuid not null,
  academic_year_id uuid not null,
  title text not null check (char_length(title) between 1 and 200 and title = btrim(title)),
  instructions text not null default '' check (char_length(instructions) <= 10000),
  mode public.assignment_mode not null,
  audience public.assignment_audience not null,
  level_id text,
  track_id uuid,
  -- Advisory only.
  due_at timestamptz,
  state public.assignment_state not null default 'draft',
  -- Maintained from assignment_parts by trigger.
  max_score numeric(9, 2) not null default 0 check (max_score >= 0),
  part_count integer not null default 0 check (part_count >= 0),
  -- Set when the recipient snapshot is taken; 0 while draft.
  recipient_count integer not null default 0 check (recipient_count >= 0),
  version integer not null default 1 check (version >= 1),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles (id),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  published_by uuid references public.profiles (id),
  closed_at timestamptz,
  closed_by uuid references public.profiles (id),
  archived_at timestamptz,
  archived_by uuid references public.profiles (id),
  unique (academy_id, id),
  unique (academy_id, academic_year_id, id),
  foreign key (academy_id, academic_year_id) references public.academic_years (academy_id, id),
  foreign key (academy_id, level_id) references public.academy_levels (academy_id, level_id),
  foreign key (academy_id, level_id, track_id) references public.academy_tracks (academy_id, level_id, id),
  constraint assignments_audience_shape check (
    (audience = 'level' and level_id is not null and track_id is null)
    or (audience = 'program' and level_id is not null and track_id is not null)
    or (audience = 'groups' and level_id is null and track_id is null)
  ),
  constraint assignments_state_shape check (
    (published_at is null) = (published_by is null)
    and (closed_at is null) = (closed_by is null)
    and (archived_at is null) = (archived_by is null)
    and (
      (state = 'draft' and published_at is null and closed_at is null and archived_at is null and recipient_count = 0)
      or (state = 'published' and published_at is not null and closed_at is null and archived_at is null)
      or (state = 'closed' and published_at is not null and closed_at is not null and archived_at is null)
      or (state = 'archived' and archived_at is not null)
    )
  )
);

create index assignments_listing_idx on public.assignments (academy_id, academic_year_id, state, created_at desc);

-- The selected groups of a groups audience. Same academy and year enforced by the foreign keys.
create table public.assignment_audience_groups (
  assignment_id uuid not null,
  academy_id uuid not null,
  academic_year_id uuid not null,
  group_id uuid not null,
  primary key (assignment_id, group_id),
  foreign key (academy_id, academic_year_id, assignment_id) references public.assignments (academy_id, academic_year_id, id),
  foreign key (academy_id, academic_year_id, group_id) references public.groups (academy_id, academic_year_id, id)
);

create index assignment_audience_groups_group_idx on public.assignment_audience_groups (group_id);

-- Ordered parts. Ids are permanent: later submissions and marks reference (assignment_id, id).
create table public.assignment_parts (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null,
  assignment_id uuid not null,
  position smallint not null check (position between 1 and 50),
  title text not null check (char_length(title) between 1 and 200 and title = btrim(title)),
  instructions text not null default '' check (char_length(instructions) <= 5000),
  max_score numeric(7, 2) not null check (max_score > 0 and max_score <= 1000),
  created_at timestamptz not null default now(),
  unique (assignment_id, id),
  constraint assignment_parts_position_unique unique (assignment_id, position) deferrable initially deferred,
  foreign key (academy_id, assignment_id) references public.assignments (academy_id, id)
);

-- The students expected to complete a published assignment, snapshotted at publication.
create table public.assignment_recipients (
  assignment_id uuid not null,
  annual_student_record_id uuid not null,
  academy_id uuid not null,
  academic_year_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (assignment_id, annual_student_record_id),
  foreign key (academy_id, academic_year_id, assignment_id) references public.assignments (academy_id, academic_year_id, id),
  foreign key (academy_id, academic_year_id, annual_student_record_id)
    references public.annual_student_records (academy_id, academic_year_id, id)
);

create index assignment_recipients_student_idx on public.assignment_recipients (annual_student_record_id);

-- Keeps the assignment maximum and part count equal to its parts.
create or replace function edra_private.sync_assignment_totals()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  target uuid := coalesce(new.assignment_id, old.assignment_id);
begin
  update public.assignments a set
    max_score = coalesce((select sum(p.max_score) from public.assignment_parts p where p.assignment_id = target), 0),
    part_count = (select count(*) from public.assignment_parts p where p.assignment_id = target)
  where a.id = target;
  return null;
end;
$$;

create trigger assignment_parts_sync_totals after insert or update of max_score or delete on public.assignment_parts
for each row execute function edra_private.sync_assignment_totals();

-- Assignments are archived, never deleted.
create or replace function edra_private.reject_assignment_delete()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = 'validation', hint = 'Assignments are archived, not deleted.';
end;
$$;

create trigger assignments_no_delete before delete on public.assignments
for each row execute function edra_private.reject_assignment_delete();

alter table public.assignments enable row level security;
alter table public.assignment_audience_groups enable row level security;
alter table public.assignment_parts enable row level security;
alter table public.assignment_recipients enable row level security;

revoke all on public.assignments, public.assignment_audience_groups, public.assignment_parts, public.assignment_recipients
  from public, anon, authenticated;
grant select on public.assignments, public.assignment_audience_groups, public.assignment_parts, public.assignment_recipients
  to authenticated;

create policy assignments_select_members on public.assignments
  for select to authenticated using (public.is_academy_member(academy_id));
create policy assignment_audience_groups_select_members on public.assignment_audience_groups
  for select to authenticated using (public.is_academy_member(academy_id));
create policy assignment_parts_select_members on public.assignment_parts
  for select to authenticated using (public.is_academy_member(academy_id));
create policy assignment_recipients_select_members on public.assignment_recipients
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
  end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Internal helpers (security definer callers only).

-- The caller's role, or forbidden. With p_managers_only, Owner/Admin only.
create or replace function edra_private.require_assignment_role(p_academy_id uuid, p_managers_only boolean)
returns public.academy_role
language plpgsql security definer set search_path = '' as $$
declare
  caller_role public.academy_role := public.academy_role_for(p_academy_id);
begin
  if auth.uid() is null or p_academy_id is null or caller_role is null
    or (p_managers_only and caller_role not in ('owner', 'admin')) then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  return caller_role;
end;
$$;

create or replace function edra_private.lock_assignment(p_academy_id uuid, p_assignment_id uuid)
returns public.assignments
language plpgsql security definer set search_path = '' as $$
declare
  target public.assignments%rowtype;
begin
  if p_assignment_id is null then raise exception using errcode = 'P0001', message = 'validation'; end if;
  select a.* into target from public.assignments a
  where a.id = p_assignment_id and a.academy_id = p_academy_id
  for update;
  if not found then raise exception using errcode = 'P0001', message = 'not_found'; end if;
  return target;
end;
$$;

create or replace function edra_private.require_open_assignment_year(p_academy_id uuid, p_academic_year_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.academic_years y
  where y.id = p_academic_year_id and y.academy_id = p_academy_id and y.closed_at is null
  for share;
  if not found then raise exception using errcode = 'P0001', message = 'year_unavailable'; end if;
end;
$$;

-- True once any recipient has activity that the structure must keep meaning for. Nothing records
-- activity yet; the submission and marking slices replace this function.
create or replace function edra_private.assignment_has_activity(p_assignment_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select false;
$$;

-- Active annual records of the year matching an audience.
create or replace function edra_private.assignment_audience_records(
  p_academy_id uuid, p_academic_year_id uuid, p_audience public.assignment_audience, p_level_id text, p_track_id uuid,
  p_group_ids uuid[]
)
returns setof uuid
language sql stable security definer set search_path = '' as $$
  select r.id from public.annual_student_records r
  where r.academy_id = p_academy_id and r.academic_year_id = p_academic_year_id and r.archived_at is null
    and case p_audience
      when 'level' then r.level_id = p_level_id
      when 'program' then r.level_id = p_level_id and r.track_id = p_track_id
      when 'groups' then r.primary_group_id = any (coalesce(p_group_ids, '{}'::uuid[]))
    end;
$$;

-- Raises invalid_audience unless the audience names this academy's level/track or active groups of
-- the year. Locks named groups (share) so a concurrent archive cannot interleave with publication.
create or replace function edra_private.check_assignment_audience(
  p_academy_id uuid, p_academic_year_id uuid, p_audience public.assignment_audience, p_level_id text, p_track_id uuid,
  p_group_ids uuid[]
)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  group_total integer := coalesce(array_length(p_group_ids, 1), 0);
  active_total integer;
begin
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

-- An assignment's full staff view: fields, ordered parts, and audience groups.
create or replace function edra_private.assignment_json(p_assignment_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', a.id, 'academy_id', a.academy_id, 'academic_year_id', a.academic_year_id,
    'title', a.title, 'instructions', a.instructions, 'mode', a.mode,
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

-- Parses and validates a draft document. Rows land in pg_temp tables for the caller:
--   assignment_draft (one row) and assignment_draft_parts (ordered).
-- Draft shape: { title, instructions, mode, audience, level_id, track_id, group_ids[], due_at,
--   parts: [{ id?, title, instructions, max_score }] } with max_score as a decimal string.
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
    title text, instructions text, mode public.assignment_mode, audience public.assignment_audience,
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
      (p_draft->>'mode')::public.assignment_mode, (p_draft->>'audience')::public.assignment_audience,
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
        or d.mode is null or d.audience is null) then
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

-- Replaces a draft's audience groups and parts from the parsed draft (caller holds the lock).
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
  delete from public.assignment_audience_groups g where g.assignment_id = p_target.id;
  if draft.audience = 'groups' then
    insert into public.assignment_audience_groups (assignment_id, academy_id, academic_year_id, group_id)
    select p_target.id, p_target.academy_id, p_target.academic_year_id, unnest(draft.group_ids);
  end if;
  delete from public.assignment_parts p
  where p.assignment_id = p_target.id and p.id not in (select d.id from pg_temp.assignment_draft_parts d where d.id is not null);
  update public.assignment_parts p set position = d.position, title = d.title, instructions = d.instructions, max_score = d.max_score
  from pg_temp.assignment_draft_parts d
  where d.id = p.id and p.assignment_id = p_target.id;
  insert into public.assignment_parts (academy_id, assignment_id, position, title, instructions, max_score)
  select p_target.academy_id, p_target.id, d.position, d.title, d.instructions, d.max_score
  from pg_temp.assignment_draft_parts d where d.id is null;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Commands.

-- Creates a draft in an open year of the academy. p_assignment_id is generated by the client per
-- create action, so a retried create returns the same draft instead of creating a second one.
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
    id, academy_id, academic_year_id, title, instructions, mode, audience, level_id, track_id, due_at,
    created_by, updated_by
  ) values (
    p_assignment_id, p_academy_id, p_academic_year_id, draft.title, draft.instructions, draft.mode, draft.audience,
    draft.level_id, draft.track_id, draft.due_at, actor, actor
  ) returning * into target;
  perform edra_private.write_assignment_structure(target);
  return edra_private.assignment_json(target.id) || jsonb_build_object('replayed', false);
end;
$$;

-- Saves an edit made against p_expected_version. A draft is fully replaced (any staff member).
-- A published or closed assignment accepts only title, instructions, due date, and part
-- titles/instructions (Owner/Admin); any structural difference raises structure_locked.
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
      title = draft.title, instructions = draft.instructions, mode = draft.mode, audience = draft.audience,
      level_id = draft.level_id, track_id = draft.track_id, due_at = draft.due_at,
      version = version + 1, updated_by = actor, updated_at = now()
    where id = target.id returning * into target;
    perform edra_private.write_assignment_structure(target);
  else
    select coalesce(array_agg(g.group_id order by g.group_id), '{}') into current_groups
    from public.assignment_audience_groups g where g.assignment_id = target.id;
    if (draft.mode, draft.audience, draft.level_id, draft.track_id) is distinct from (target.mode, target.audience, target.level_id, target.track_id)
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

-- Owner/Admin lifecycle: publish (draft -> published, snapshots recipients), unpublish (published ->
-- draft before activity, deletes the snapshot), close (published -> closed), reopen (closed ->
-- published), archive (draft or closed -> archived; terminal).
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

-- Public wrappers charge the authoring quota once, then run the private command.
create function public.create_assignment(p_academy_id uuid, p_academic_year_id uuid, p_assignment_id uuid, p_draft jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform edra_private.charge_mutation_quota('op:assignment_author');
  return edra_private.create_assignment(p_academy_id, p_academic_year_id, p_assignment_id, p_draft);
end;
$$;

create function public.update_assignment(p_academy_id uuid, p_assignment_id uuid, p_expected_version integer, p_draft jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform edra_private.charge_mutation_quota('op:assignment_author');
  return edra_private.update_assignment(p_academy_id, p_assignment_id, p_expected_version, p_draft);
end;
$$;

create function public.change_assignment_state(p_academy_id uuid, p_assignment_id uuid, p_expected_version integer, p_action text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform edra_private.charge_mutation_quota('op:assignment_author');
  return edra_private.change_assignment_state(p_academy_id, p_assignment_id, p_expected_version, p_action);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Reads.

-- One assignment's staff view, or null when the caller is not a member or it does not exist.
create or replace function public.get_assignment(p_academy_id uuid, p_assignment_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_academy_id is null or not public.is_academy_member(p_academy_id) then return null; end if;
  if not exists (select 1 from public.assignments a where a.id = p_assignment_id and a.academy_id = p_academy_id) then return null; end if;
  return edra_private.assignment_json(p_assignment_id);
end;
$$;

-- Advisory recipient preview for an audience in an academy year: how many active records match now
-- and how many of them have no active student code. Publication recomputes against current data.
create or replace function public.preview_assignment_audience(
  p_academy_id uuid, p_academic_year_id uuid, p_audience public.assignment_audience, p_level_id text, p_track_id uuid,
  p_group_ids uuid[]
)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  result jsonb;
begin
  perform edra_private.require_assignment_role(p_academy_id, false);
  perform 1 from public.academic_years y where y.id = p_academic_year_id and y.academy_id = p_academy_id;
  if not found then raise exception using errcode = 'P0001', message = 'not_found'; end if;
  select jsonb_build_object(
    'recipient_count', count(*),
    'uncoded_count', count(*) filter (where not exists (
      select 1 from public.student_code_assignments c where c.annual_student_record_id = m.id and c.retired_at is null))
  ) into result
  from edra_private.assignment_audience_records(p_academy_id, p_academic_year_id, p_audience, p_level_id, p_track_id, p_group_ids) m(id);
  return result;
end;
$$;

-- The recipient snapshot with each student's current name, group, and active code (codes are
-- current optional identifiers, never ownership). Null when the caller is not a member.
create or replace function public.list_assignment_recipients(p_academy_id uuid, p_assignment_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_academy_id is null or not public.is_academy_member(p_academy_id) then return null; end if;
  if not exists (select 1 from public.assignments a where a.id = p_assignment_id and a.academy_id = p_academy_id) then return null; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'annual_student_record_id', r.id, 'full_name', r.full_name, 'archived', r.archived_at is not null,
      'level_id', r.level_id, 'track_id', r.track_id, 'group_name', g.name, 'student_code', c.code
    ) order by lower(r.full_name), r.id)
    from public.assignment_recipients x
    join public.annual_student_records r on r.id = x.annual_student_record_id and r.academy_id = x.academy_id
    left join public.groups g on g.id = r.primary_group_id
    left join public.student_code_assignments c on c.annual_student_record_id = r.id and c.retired_at is null
    where x.assignment_id = p_assignment_id and x.academy_id = p_academy_id
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants.

revoke all on function edra_private.sync_assignment_totals() from public, anon, authenticated;
revoke all on function edra_private.reject_assignment_delete() from public, anon, authenticated;
revoke all on function edra_private.require_assignment_role(uuid, boolean) from public, anon, authenticated;
revoke all on function edra_private.lock_assignment(uuid, uuid) from public, anon, authenticated;
revoke all on function edra_private.require_open_assignment_year(uuid, uuid) from public, anon, authenticated;
revoke all on function edra_private.assignment_has_activity(uuid) from public, anon, authenticated;
revoke all on function edra_private.assignment_audience_records(uuid, uuid, public.assignment_audience, text, uuid, uuid[]) from public, anon, authenticated;
revoke all on function edra_private.check_assignment_audience(uuid, uuid, public.assignment_audience, text, uuid, uuid[]) from public, anon, authenticated;
revoke all on function edra_private.assignment_json(uuid) from public, anon, authenticated;
revoke all on function edra_private.parse_assignment_draft(jsonb) from public, anon, authenticated;
revoke all on function edra_private.write_assignment_structure(public.assignments) from public, anon, authenticated;
revoke all on function edra_private.create_assignment(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function edra_private.update_assignment(uuid, uuid, integer, jsonb) from public, anon, authenticated;
revoke all on function edra_private.change_assignment_state(uuid, uuid, integer, text) from public, anon, authenticated;

revoke all on function public.create_assignment(uuid, uuid, uuid, jsonb) from public, anon;
revoke all on function public.update_assignment(uuid, uuid, integer, jsonb) from public, anon;
revoke all on function public.change_assignment_state(uuid, uuid, integer, text) from public, anon;
revoke all on function public.get_assignment(uuid, uuid) from public, anon;
revoke all on function public.preview_assignment_audience(uuid, uuid, public.assignment_audience, text, uuid, uuid[]) from public, anon;
grant execute on function public.create_assignment(uuid, uuid, uuid, jsonb) to authenticated;
grant execute on function public.update_assignment(uuid, uuid, integer, jsonb) to authenticated;
grant execute on function public.change_assignment_state(uuid, uuid, integer, text) to authenticated;
grant execute on function public.get_assignment(uuid, uuid) to authenticated;
revoke all on function public.list_assignment_recipients(uuid, uuid) from public, anon;
grant execute on function public.list_assignment_recipients(uuid, uuid) to authenticated;
grant execute on function public.preview_assignment_audience(uuid, uuid, public.assignment_audience, text, uuid, uuid[]) to authenticated;
