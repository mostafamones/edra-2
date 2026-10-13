-- Staff suspension and Head Admin domain authority.
--
-- Suspension is academy-scoped: the membership row, its role and every attribution stay in place,
-- but a suspended member has no authority in that academy. It is not an Auth ban or sign-out; the
-- person's account, own profile and other academies are unaffected. Restoration clears the state
-- and reinstates the retained role. Only the staff-management functions (next migration) write it.
--
-- Every existing membership stays active with an unchanged role; nobody is promoted or suspended.
--
-- Central authority (academy_role_for, is_academy_member, shares_academy_with) now requires an
-- active membership, so every RLS policy, Storage policy, Realtime channel policy and RPC guard
-- built on them denies a suspended caller on the next request, without waiting for token expiry.
-- Active staff still see suspended coworkers in their academy (the target is not filtered out).
--
-- Ordinary manager authority (formerly Owner/Admin) now includes Head Admin: academy settings,
-- groups, recurring schedules and slots, student administration/imports/codes and assignment
-- lifecycle. Instructor-specific one-off schedule rules, year closure, versions and history guards
-- are unchanged.

alter table public.academy_memberships
  add column suspended_at timestamptz,
  add column suspended_by uuid references public.profiles(id) on delete set null,
  -- suspended_by may later become null if that account is deleted; suspended_at alone is the state.
  add constraint academy_memberships_suspension_attribution
    check (suspended_at is not null or suspended_by is null),
  -- The Owner cannot be suspended through any write path.
  add constraint academy_memberships_owner_not_suspended
    check (role <> 'owner' or suspended_at is null);

-- Managers see whether a coworker is suspended; who suspended them stays in the restricted audit.
grant select (suspended_at) on public.academy_memberships to authenticated;

-- Restricted history of completed access changes. Not a reason/appeal workflow.
create table edra_private.staff_access_events (
  id bigint generated always as identity primary key,
  academy_id uuid not null references public.academies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  action text not null check (action in ('suspended', 'restored', 'role_changed')),
  from_role public.academy_role not null,
  to_role public.academy_role not null,
  actor_id uuid references public.profiles(id) on delete set null,
  occurred_at timestamptz not null default pg_catalog.clock_timestamp()
);
create index staff_access_events_member_idx on edra_private.staff_access_events (academy_id, user_id, occurred_at desc);
alter table edra_private.staff_access_events enable row level security;
revoke all on edra_private.staff_access_events from public, anon, authenticated;

create or replace function public.academy_role_for(target_academy_id uuid)
returns public.academy_role
language sql stable security definer set search_path = '' as $$
  select role
  from public.academy_memberships
  where academy_id = target_academy_id
    and user_id = auth.uid()
    and suspended_at is null
    and edra_auth.session_allowed();
$$;

create or replace function public.is_academy_member(target_academy_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select edra_auth.session_allowed() and exists (
    select 1
    from public.academy_memberships
    where academy_id = target_academy_id
      and user_id = auth.uid()
      and suspended_at is null
  );
$$;

-- The caller's own membership must be active; the coworker's may be suspended so managers can
-- still identify suspended members.
create or replace function public.shares_academy_with(target_user_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select edra_auth.session_allowed() and (target_user_id = auth.uid() or exists (
    select 1
    from public.academy_memberships mine
    join public.academy_memberships theirs
      on theirs.academy_id = mine.academy_id
    where mine.user_id = auth.uid()
      and mine.suspended_at is null
      and theirs.user_id = target_user_id
  ));
$$;

-- Ordinary academy management: Owner, Head Admin and Admin with an active membership.
create function public.is_academy_manager(target_academy_id uuid)
returns boolean
language sql stable set search_path = '' as $$
  select coalesce(public.academy_role_for(target_academy_id) in ('owner', 'head_admin', 'admin'), false);
$$;
revoke all on function public.is_academy_manager(uuid) from public, anon;
grant execute on function public.is_academy_manager(uuid) to authenticated, service_role;

alter policy academies_update_owner_or_admin on public.academies
  using (public.is_academy_manager(id))
  with check (public.is_academy_manager(id));

alter policy groups_insert_managers on public.groups
  with check (public.is_academy_manager(academy_id) and archived_at is null);
alter policy groups_update_managers on public.groups
  using (public.is_academy_manager(academy_id))
  with check (public.is_academy_manager(academy_id));

alter policy sessions_delete_staff on public.schedule_sessions
  using (public.academy_role_for(academy_id) is not null);
alter policy sessions_insert_staff on public.schedule_sessions
  with check (public.academy_role_for(academy_id) is not null);
alter policy sessions_update_staff on public.schedule_sessions
  using (public.academy_role_for(academy_id) is not null)
  with check (public.academy_role_for(academy_id) is not null);

alter policy slots_delete_managers on public.schedule_slots
  using (public.is_academy_manager(academy_id));
alter policy slots_insert_managers on public.schedule_slots
  with check (public.is_academy_manager(academy_id));
alter policy slots_update_managers on public.schedule_slots
  using (public.is_academy_manager(academy_id))
  with check (public.is_academy_manager(academy_id));

alter policy schedules_insert_staff on public.schedules
  with check (created_by = auth.uid() and (public.is_academy_manager(academy_id)
    or (public.academy_role_for(academy_id) = 'instructor' and kind = 'one_off')));
alter policy schedules_update_staff on public.schedules
  using (archived_at is null and (public.is_academy_manager(academy_id)
    or (public.academy_role_for(academy_id) = 'instructor' and kind = 'one_off')))
  with check (public.is_academy_manager(academy_id)
    or (public.academy_role_for(academy_id) = 'instructor' and kind = 'one_off'
      and (archived_at is null or created_by = (select auth.uid()))));

alter policy student_import_rows_select_managers on public.student_import_rows
  using (public.is_academy_manager(academy_id));
alter policy student_import_sessions_select_managers on public.student_import_sessions
  using (public.is_academy_manager(academy_id));

-- The remaining definitions are unchanged except that Head Admin joins the Owner/Admin guard.

CREATE OR REPLACE FUNCTION edra_private.require_assignment_role(p_academy_id uuid, p_managers_only boolean)
 RETURNS academy_role
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_role public.academy_role := public.academy_role_for(p_academy_id);
begin
  if auth.uid() is null or p_academy_id is null or caller_role is null
    or (p_managers_only and caller_role not in ('owner', 'head_admin', 'admin')) then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  return caller_role;
end;
$function$;


CREATE OR REPLACE FUNCTION edra_private.update_assignment(p_academy_id uuid, p_assignment_id uuid, p_expected_version integer, p_draft jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if not open_setup and caller_role not in ('owner', 'head_admin', 'admin') then
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
$function$;


CREATE OR REPLACE FUNCTION public.lock_student_import_session(p_session_id uuid)
 RETURNS student_import_sessions
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare s public.student_import_sessions%rowtype;
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'forbidden'; end if;
  select * into s from public.student_import_sessions where id = p_session_id for update;
  if not found or s.created_by <> auth.uid() then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  if coalesce(public.academy_role_for(s.academy_id)::text, '') not in ('owner', 'head_admin', 'admin') then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  return s;
end;
$function$;


CREATE OR REPLACE FUNCTION public.save_student_code_settings(p_academy_id uuid, p_expected_version integer, p_enabled boolean, p_default_pattern text, p_levels jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  current_row public.student_code_settings%rowtype;
  pattern_value text;
  entry record;
  level_ids text[] := '{}';
  patterns text[] := '{}';
  next_version integer;
begin
  if actor is null or p_academy_id is null
    or coalesce(public.academy_role_for(p_academy_id)::text, '') not in ('owner', 'head_admin', 'admin') then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  if p_expected_version is null or p_expected_version < 0 or p_enabled is null
    or jsonb_typeof(p_levels) is distinct from 'array' then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  if jsonb_array_length(p_levels) > 50 then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;

  pattern_value := nullif(pg_catalog.btrim(coalesce(p_default_pattern, ''), chr(32) || chr(9) || chr(10) || chr(11) || chr(12) || chr(13)), '');
  if pattern_value is not null then
    pattern_value := public.normalize_student_code_pattern(pattern_value);
    if pattern_value is null then
      raise exception using errcode = 'P0001', message = 'validation', hint = 'default_pattern';
    end if;
  end if;

  for entry in select e.value from jsonb_array_elements(p_levels) as e loop
    if jsonb_typeof(entry.value) is distinct from 'object'
      or jsonb_typeof(entry.value -> 'levelId') is distinct from 'string'
      or jsonb_typeof(entry.value -> 'pattern') is distinct from 'string' then
      raise exception using errcode = 'P0001', message = 'validation';
    end if;
    if (entry.value ->> 'levelId') = any(level_ids) then
      raise exception using errcode = 'P0001', message = 'validation', hint = 'level:' || (entry.value ->> 'levelId');
    end if;
    if public.normalize_student_code_pattern(entry.value ->> 'pattern') is null then
      raise exception using errcode = 'P0001', message = 'validation', hint = 'level:' || (entry.value ->> 'levelId');
    end if;
    level_ids := level_ids || (entry.value ->> 'levelId');
    patterns := patterns || public.normalize_student_code_pattern(entry.value ->> 'pattern');
  end loop;
  -- Only the academy's own levels; never trust supplied ids.
  if exists (
    select 1 from unnest(level_ids) l (id)
    where not exists (select 1 from public.academy_levels al where al.academy_id = p_academy_id and al.level_id = l.id)
  ) then
    raise exception using errcode = 'P0001', message = 'invalid_level';
  end if;

  -- Rank 1, exclusive. Waits for in-flight issuers and check-ins holding the share lock.
  select * into current_row from public.student_code_settings s where s.academy_id = p_academy_id for update;
  if not found then
    if p_expected_version <> 0 then raise exception using errcode = 'P0001', message = 'stale_settings'; end if;
    insert into public.student_code_settings (academy_id, enabled, default_pattern, version, updated_by)
    values (p_academy_id, p_enabled, pattern_value, 1, actor)
    on conflict (academy_id) do nothing;
    -- A concurrent first save won.
    if not found then raise exception using errcode = 'P0001', message = 'stale_settings'; end if;
    next_version := 1;
  else
    if current_row.version <> p_expected_version then
      raise exception using errcode = 'P0001', message = 'stale_settings';
    end if;
    next_version := current_row.version + 1;
    update public.student_code_settings
    set enabled = p_enabled, default_pattern = pattern_value,
      version = next_version, updated_at = now(), updated_by = actor
    where academy_id = p_academy_id;
  end if;

  delete from public.student_code_level_patterns p
  where p.academy_id = p_academy_id and not (p.level_id = any(level_ids));
  insert into public.student_code_level_patterns as p (academy_id, level_id, pattern)
  select p_academy_id, l.id, l.pattern from unnest(level_ids, patterns) as l (id, pattern)
  on conflict (academy_id, level_id) do update set pattern = excluded.pattern
  where p.pattern is distinct from excluded.pattern;

  return jsonb_build_object('version', next_version);
end;
$function$;


CREATE OR REPLACE FUNCTION public.set_student_records_archived(p_academy_id uuid, p_academic_year_id uuid, p_records jsonb, p_archived boolean)
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  ids uuid[];
  versions integer[];
  locked_count integer;
  stale boolean;
begin
  if auth.uid() is null or coalesce(public.academy_role_for(p_academy_id)::text, '') not in ('owner', 'head_admin', 'admin') then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  if p_archived is null or p_records is null or jsonb_typeof(p_records) <> 'array'
    or jsonb_array_length(p_records) not between 1 and 500 then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  begin
    select array_agg(e.id order by e.id), array_agg(e.version order by e.id) into ids, versions
    from jsonb_to_recordset(p_records) as e (id uuid, version integer);
  exception when others then
    raise exception using errcode = 'P0001', message = 'validation';
  end;
  if array_position(ids, null) is not null or array_position(versions, null) is not null
    or (select count(distinct t) from unnest(ids) t) <> cardinality(ids) then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;

  if not exists (
    select 1 from public.academic_years y
    where y.id = p_academic_year_id and y.academy_id = p_academy_id and y.closed_at is null
  ) then
    raise exception using errcode = 'P0001', message = 'year_unavailable';
  end if;

  -- Lock in id order so overlapping batches cannot deadlock.
  select count(*), coalesce(bool_or(r.version <> t.version), false) into locked_count, stale
  from (
    select r.id, r.version from public.annual_student_records r
    where r.academy_id = p_academy_id and r.academic_year_id = p_academic_year_id and r.id = any(ids)
    order by r.id
    for update
  ) r
  join unnest(ids, versions) as t (id, version) on t.id = r.id;
  if locked_count <> cardinality(ids) then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  if stale then
    raise exception using errcode = 'P0001', message = 'stale_record';
  end if;

  return query
    update public.annual_student_records r
    set archived_at = case when p_archived then now() end
    where r.id = any(ids) and (r.archived_at is null) = p_archived
    returning r.id;
end;
$function$;


CREATE OR REPLACE FUNCTION public.set_student_records_group(p_academy_id uuid, p_academic_year_id uuid, p_records jsonb, p_primary_group_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  ids uuid[];
  versions integer[];
  locked_count integer;
  stale boolean;
  archived boolean;
  target public.groups%rowtype;
  changed jsonb;
  unchanged jsonb;
begin
  if auth.uid() is null or coalesce(public.academy_role_for(p_academy_id)::text, '') not in ('owner', 'head_admin', 'admin') then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  if p_records is null or jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) not between 1 and 500 then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  begin
    select array_agg(e.id order by e.id), array_agg(e.version order by e.id) into ids, versions
    from jsonb_to_recordset(p_records) as e (id uuid, version integer);
  exception when others then
    raise exception using errcode = 'P0001', message = 'validation';
  end;
  if array_position(ids, null) is not null or array_position(versions, null) is not null
    or (select count(distinct t) from unnest(ids) t) <> cardinality(ids) then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;

  perform 1 from public.academic_years y
  where y.id = p_academic_year_id and y.academy_id = p_academy_id and y.closed_at is null
  for share;
  if not found then raise exception using errcode = 'P0001', message = 'year_unavailable'; end if;

  -- Lock in id order so overlapping batches cannot deadlock.
  select count(*), coalesce(bool_or(r.version <> t.version), false), coalesce(bool_or(r.archived_at is not null), false)
  into locked_count, stale, archived
  from (
    select r.id, r.version, r.archived_at from public.annual_student_records r
    where r.academy_id = p_academy_id and r.academic_year_id = p_academic_year_id and r.id = any(ids)
    order by r.id
    for update
  ) r
  join unnest(ids, versions) as t (id, version) on t.id = r.id;
  if locked_count <> cardinality(ids) then raise exception using errcode = 'P0001', message = 'not_found'; end if;
  if stale then raise exception using errcode = 'P0001', message = 'stale_record'; end if;
  if archived then raise exception using errcode = 'P0001', message = 'archived_record'; end if;

  if p_primary_group_id is not null then
    -- The share lock conflicts with a concurrent archive or program change of the destination.
    select g.* into target from public.groups g
    where g.id = p_primary_group_id and g.academy_id = p_academy_id and g.academic_year_id = p_academic_year_id
    for share of g;
    if not found or target.archived_at is not null then
      raise exception using errcode = 'P0001', message = 'invalid_placement';
    end if;
    if exists (
      select 1 from public.annual_student_records r
      where r.id = any(ids) and (r.level_id <> target.level_id or r.track_id is distinct from target.track_id)
    ) then
      raise exception using errcode = 'P0001', message = 'incompatible_selection';
    end if;
  end if;

  with updated as (
    update public.annual_student_records r set primary_group_id = p_primary_group_id
    where r.id = any(ids) and r.primary_group_id is distinct from p_primary_group_id
    returning r.id, r.version
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'version', u.version) order by u.id), '[]'::jsonb)
  into changed from updated u;
  select coalesce(jsonb_agg(t.id order by t.id), '[]'::jsonb) into unchanged
  from unnest(ids) as t (id)
  where not changed @> jsonb_build_array(jsonb_build_object('id', t.id));
  return jsonb_build_object('changed', changed, 'unchanged', unchanged);
end;
$function$;


CREATE OR REPLACE FUNCTION public.start_student_import(p_academy_id uuid, p_academic_year_id uuid, p_file_name text, p_format student_import_format, p_worksheet text, p_expected_rows integer, p_defaults jsonb, p_replaces uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  session_id uuid;
  d jsonb := coalesce(p_defaults, '{}'::jsonb);
begin
  if actor is null or coalesce(public.academy_role_for(p_academy_id)::text, '') not in ('owner', 'head_admin', 'admin') then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  if p_format is null or p_expected_rows is null or p_expected_rows not between 1 and 5000
    or p_file_name is null or char_length(p_file_name) not between 1 and 255
    or (p_worksheet is not null and char_length(p_worksheet) not between 1 and 255)
    or jsonb_typeof(d) <> 'object'
    or exists (select 1 from jsonb_each(d) e where e.key not in ('level_id', 'track_id', 'primary_group_id', 'participation_type')
      or jsonb_typeof(e.value) not in ('string', 'null')) then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  if not exists (
    select 1 from public.academic_years y
    where y.id = p_academic_year_id and y.academy_id = p_academy_id and y.closed_at is null
  ) then
    raise exception using errcode = 'P0001', message = 'year_unavailable';
  end if;
  -- Defaults must name this academy's structure; compatibility with each row is decided per row.
  if (d ->> 'level_id' is not null and not exists (
        select 1 from public.academy_levels al where al.academy_id = p_academy_id and al.level_id = d ->> 'level_id'))
    or (d ->> 'track_id' is not null and not exists (
        select 1 from public.academy_tracks t where t.academy_id = p_academy_id and t.id::text = d ->> 'track_id'))
    or (d ->> 'primary_group_id' is not null and not exists (
        select 1 from public.groups g where g.academy_id = p_academy_id and g.academic_year_id = p_academic_year_id
          and g.archived_at is null and g.id::text = d ->> 'primary_group_id'))
    or (d ->> 'participation_type' is not null and d ->> 'participation_type' not in ('in_person', 'online_only')) then
    raise exception using errcode = 'P0001', message = 'validation', hint = 'defaults';
  end if;

  if p_replaces is not null then
    update public.student_import_sessions s set state = 'cancelled', updated_at = now()
    where s.id = p_replaces and s.academy_id = p_academy_id and s.created_by = actor
      and s.state in ('staging', 'reviewing');
  end if;

  insert into public.student_import_sessions (
    academy_id, academic_year_id, created_by, file_name, format, worksheet, expected_rows, defaults
  ) values (
    p_academy_id, p_academic_year_id, actor, p_file_name, p_format, p_worksheet, p_expected_rows, jsonb_strip_nulls(d)
  ) returning id into session_id;
  return session_id;
end;
$function$;

