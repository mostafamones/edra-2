-- Assignments: standalone staff flow without a Publish step (planning/assignments-standalone-flow.md,
-- slice A; decisions approved by the owner on 2026-10-09).
--
-- Staff create an assignment (no content and no due date required), hand physical work to students,
-- record work and marks, and announce complete results per student. Publishing the assignment is no
-- longer an operational prerequisite, and student visibility will come from released content (slice
-- B), never from an assignment state.
--
-- Rules:
--   * States are active, closed, and archived. Structure readiness (every part complete) and online
--     visibility are separate properties; readiness is exposed as `ready` on the staff document.
--   * Recipients: every save of an active assignment without activity (create, or an edit while no
--     work, mark, or result exists) snapshots the active annual records its stored audience matches
--     now: new matches are added and records that no longer match are removed. Once activity exists
--     the snapshot is frozen; enrollment and group changes never change it silently. An audience
--     with no matching students is allowed and yields no recipients.
--   * Structure: any staff member edits the whole setup of an active assignment until activity
--     starts. From then on the audience, part/question identities, order, types, choices, answer key,
--     and maxima are frozen; Owner/Admin may still edit titles, instructions, and the due date. A
--     closed assignment keeps the same text-only rule. The structure guard triggers enforce the lock
--     for every writer.
--   * Marking, recorded work, code lookup, and result announcement need an active or closed
--     assignment with a complete scoring structure (`incomplete` otherwise). A closed assignment keeps
--     accepting marks for work already received.
--   * Lifecycle actions (Owner/Admin): close (active -> closed), reopen (closed -> active), archive
--     (active without activity, or closed -> archived; terminal). Publish and unpublish are removed:
--     the command now rejects them as `validation`, so older clients can neither publish nor clear a
--     recipient snapshot.
--   * Result announcement (publish_assignment_results), corrections, immutable snapshots, outbox
--     effects, versions, quotas, and idempotency are unchanged.
--
-- Existing rows (transactional backfill, no recipient or history is removed):
--   * published -> active, keeping its recipients, marks, work, snapshots, and effects as they are.
--   * draft -> active. Drafts of open academic years get their recipient snapshot from the current
--     active records matching their audience; drafts of closed years stay without recipients.
--   * closed and archived are unchanged.
--   * published_at / published_by are kept as provenance of the retired Publish action and are no
--     longer written. They are not a visibility switch.
--
-- Rollout: the web application must be deployed with this migration. Older builds parse only the
-- retired states, and their Publish/Unpublish calls are refused by the database.
--
-- Lock order is unchanged: assignment (update for authoring/lifecycle, share for marking), then the
-- academic year (share), then audience groups (share), then recipient rows.

-- ---------------------------------------------------------------------------------------------
-- State model.

alter table public.assignments drop constraint assignments_state_shape;
alter table public.assignments alter column state drop default;

-- Draft recipient snapshots, taken while the old states are still distinguishable.
do $$
declare
  draft public.assignments%rowtype;
begin
  for draft in
    select a.* from public.assignments a
    join public.academic_years y on y.id = a.academic_year_id and y.academy_id = a.academy_id and y.closed_at is null
    where a.state = 'draft'
    order by a.id
    for update of a
  loop
    insert into public.assignment_recipients (assignment_id, annual_student_record_id, academy_id, academic_year_id)
    select draft.id, r, draft.academy_id, draft.academic_year_id
    from edra_private.assignment_audience_records(draft.academy_id, draft.academic_year_id, draft.audience, draft.level_id, draft.track_id,
      (select coalesce(array_agg(g.group_id), '{}') from public.assignment_audience_groups g where g.assignment_id = draft.id)) r
    on conflict (assignment_id, annual_student_record_id) do nothing;
    update public.assignments a
    set recipient_count = (select count(*) from public.assignment_recipients x where x.assignment_id = draft.id)
    where a.id = draft.id;
  end loop;
end;
$$;

alter type public.assignment_state rename to assignment_state_retired;
create type public.assignment_state as enum ('active', 'closed', 'archived');
alter table public.assignments alter column state type public.assignment_state using (
  case state::text when 'draft' then 'active' when 'published' then 'active' else state::text end
)::public.assignment_state;
alter table public.assignments alter column state set default 'active';
drop type public.assignment_state_retired;

alter table public.assignments add constraint assignments_state_shape check (
  (published_at is null) = (published_by is null)
  and (closed_at is null) = (closed_by is null)
  and (archived_at is null) = (archived_by is null)
  and (
    (state = 'active' and closed_at is null and archived_at is null)
    or (state = 'closed' and closed_at is not null and archived_at is null)
    or (state = 'archived' and archived_at is not null)
  )
);

comment on column public.assignments.published_at is
  'Provenance only: when the retired Publish action first published this assignment. Never written now; not a visibility switch.';
comment on column public.assignments.published_by is
  'Provenance only: who used the retired Publish action. Never written now.';
comment on column public.assignments.recipient_count is
  'Size of the recipient snapshot, refreshed on each save until activity starts.';

-- ---------------------------------------------------------------------------------------------
-- Internal helpers.

-- Refreshes the recipient snapshot of an assignment without activity to the active records its
-- stored audience matches now, and returns the new count. The caller holds the assignment lock and
-- has checked the audience (which locks named groups). Removed recipients have no history; the
-- assignment_recipients_keep_history trigger refuses the delete otherwise.
create or replace function edra_private.snapshot_assignment_recipients(p_target public.assignments)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  group_ids uuid[];
  total integer;
begin
  select coalesce(array_agg(g.group_id), '{}') into group_ids from public.assignment_audience_groups g where g.assignment_id = p_target.id;
  create temporary table if not exists pg_temp.assignment_matched_records (id uuid primary key) on commit drop;
  truncate pg_temp.assignment_matched_records;
  insert into pg_temp.assignment_matched_records
  select r from edra_private.assignment_audience_records(
    p_target.academy_id, p_target.academic_year_id, p_target.audience, p_target.level_id, p_target.track_id, group_ids) r;

  delete from public.assignment_recipients x
  where x.assignment_id = p_target.id
    and not exists (select 1 from pg_temp.assignment_matched_records m where m.id = x.annual_student_record_id);
  insert into public.assignment_recipients (assignment_id, annual_student_record_id, academy_id, academic_year_id)
  select p_target.id, m.id, p_target.academy_id, p_target.academic_year_id from pg_temp.assignment_matched_records m
  on conflict (assignment_id, annual_student_record_id) do nothing;

  select count(*) into total from public.assignment_recipients x where x.assignment_id = p_target.id;
  update public.assignments set recipient_count = total where id = p_target.id;
  return total;
end;
$$;

-- True when the assignment has at least one part and every part is complete.
create or replace function edra_private.assignment_ready(p_assignment_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.assignment_parts p where p.assignment_id = p_assignment_id)
    and not exists (
      select 1 from public.assignment_parts p
      where p.assignment_id = p_assignment_id and cardinality(edra_private.part_issues(p.id)) > 0
    );
$$;

-- Question, choice and part-type writes are possible only while the assignment is active and has no
-- activity, whatever function performs them: nothing reinterprets a scheme beneath existing work.
create or replace function edra_private.guard_assignment_structure()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  target uuid := coalesce(new.assignment_id, old.assignment_id);
  current_state public.assignment_state;
begin
  select a.state into current_state from public.assignments a where a.id = target;
  if current_state is distinct from 'active' or edra_private.assignment_has_activity(target) then
    raise exception using errcode = 'P0001', message = 'structure_locked';
  end if;
  return coalesce(new, old);
end;
$$;

-- The assignment locked for marking (share): it must exist in the academy, be active or closed, and
-- have a complete scoring structure.
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
  if target.state not in ('active', 'closed') then raise exception using errcode = 'P0001', message = 'invalid_state'; end if;
  if not edra_private.assignment_ready(target.id) then raise exception using errcode = 'P0001', message = 'incomplete'; end if;
  return target;
end;
$$;

-- The staff document gains `ready`. published_at stays as provenance.
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
    'ready', edra_private.assignment_ready(a.id),
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

-- ---------------------------------------------------------------------------------------------
-- Commands.

-- Creates an active assignment and snapshots its recipients. Creates carry no existing ids
-- (parts, questions or choices). A retried create returns the same assignment.
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
  perform edra_private.snapshot_assignment_recipients(target);
  return edra_private.assignment_json(target.id) || jsonb_build_object('replayed', false);
end;
$$;

-- Saves an edit made against p_expected_version. An active assignment without activity is replaced
-- whole by any staff member and its recipients are refreshed. Otherwise (activity, or closed) only
-- Owner/Admin may save, and only titles, instructions, and the due date; any structural difference
-- raises structure_locked.
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
  open_setup boolean;
begin
  caller_role := edra_private.require_assignment_role(p_academy_id, false);
  if p_expected_version is null then raise exception using errcode = 'P0001', message = 'validation'; end if;
  perform edra_private.parse_assignment_draft(p_draft);
  target := edra_private.lock_assignment(p_academy_id, p_assignment_id);
  if target.version <> p_expected_version then raise exception using errcode = 'P0001', message = 'assignment_conflict'; end if;
  if target.state = 'archived' then raise exception using errcode = 'P0001', message = 'invalid_state'; end if;
  -- Marking takes the assignment for share, so no activity can start while this lock is held.
  open_setup := target.state = 'active' and not edra_private.assignment_has_activity(target.id);
  if not open_setup and caller_role not in ('owner', 'admin') then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  perform edra_private.require_open_assignment_year(target.academy_id, target.academic_year_id);
  select * into draft from pg_temp.assignment_draft;

  if open_setup then
    perform edra_private.check_assignment_audience(target.academy_id, target.academic_year_id, draft.audience, draft.level_id, draft.track_id, draft.group_ids);
    update public.assignments set
      title = draft.title, instructions = draft.instructions, audience = draft.audience,
      level_id = draft.level_id, track_id = draft.track_id, due_at = draft.due_at,
      version = version + 1, updated_by = actor, updated_at = now()
    where id = target.id returning * into target;
    perform edra_private.write_assignment_structure(target);
    perform edra_private.snapshot_assignment_recipients(target);
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

-- Owner/Admin lifecycle: close (active -> closed), reopen (closed -> active), archive (active
-- without activity, or closed -> archived; terminal). Recipients never change here.
create or replace function edra_private.change_assignment_state(
  p_academy_id uuid, p_assignment_id uuid, p_expected_version integer, p_action text
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  target public.assignments%rowtype;
begin
  perform edra_private.require_assignment_role(p_academy_id, true);
  if p_expected_version is null or p_action is null or p_action <> all (array['close', 'reopen', 'archive']) then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  target := edra_private.lock_assignment(p_academy_id, p_assignment_id);
  if target.version <> p_expected_version then raise exception using errcode = 'P0001', message = 'assignment_conflict'; end if;
  perform edra_private.require_open_assignment_year(target.academy_id, target.academic_year_id);

  if p_action = 'close' then
    if target.state <> 'active' then raise exception using errcode = 'P0001', message = 'invalid_state'; end if;
    update public.assignments set state = 'closed', closed_at = now(), closed_by = actor,
      version = version + 1, updated_by = actor, updated_at = now()
    where id = target.id;
  elsif p_action = 'reopen' then
    if target.state <> 'closed' then raise exception using errcode = 'P0001', message = 'invalid_state'; end if;
    update public.assignments set state = 'active', closed_at = null, closed_by = null,
      version = version + 1, updated_by = actor, updated_at = now()
    where id = target.id;
  else
    if target.state = 'archived' or (target.state = 'active' and edra_private.assignment_has_activity(target.id)) then
      raise exception using errcode = 'P0001', message = 'invalid_state';
    end if;
    update public.assignments set state = 'archived', archived_at = now(), archived_by = actor,
      version = version + 1, updated_by = actor, updated_at = now()
    where id = target.id;
  end if;
  return edra_private.assignment_json(target.id);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants.

revoke all on function edra_private.snapshot_assignment_recipients(public.assignments) from public, anon, authenticated;
revoke all on function edra_private.assignment_ready(uuid) from public, anon, authenticated;
revoke all on function edra_private.guard_assignment_structure() from public, anon, authenticated;
revoke all on function edra_private.lock_assignment_for_marking(uuid, uuid) from public, anon, authenticated;
revoke all on function edra_private.assignment_json(uuid) from public, anon, authenticated;
revoke all on function edra_private.create_assignment(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function edra_private.update_assignment(uuid, uuid, integer, jsonb) from public, anon, authenticated;
revoke all on function edra_private.change_assignment_state(uuid, uuid, integer, text) from public, anon, authenticated;
