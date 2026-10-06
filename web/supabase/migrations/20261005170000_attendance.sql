-- Attendance: draft inputs, positive check-ins, explicit publication with corrections, request
-- idempotency, a publication-effect outbox, realtime invalidations, and API throttling.
--
-- Owner decisions (2026-10-05):
--   * Attendance starts Unknown. Nothing marks students absent or publishes automatically; ending a
--     session publishes nothing.
--   * After a session ends (manually or by its automatic close), staff may still edit drafts, run
--     bulk changes, and publish or correct while the academic year is open. Check-ins (scans) only
--     work while the session is live. Once the year is closed, attendance is read-only.
--   * A check-in is a positive input, not a generic status write: Unknown becomes draft Present;
--     Present or Late is already recorded and left untouched; Absent or Excused needs staff review
--     and is never overwritten by a scan. Late is only ever set by staff.
--   * Check-ins accept roster students only. A student outside the roster is rejected for review;
--     adding unexpected attendees is a later slice.
--
-- Draft vs official: attendance_records.status is the draft; published_status is the latest
-- official value. Previously published values stay authoritative until a correction is republished.
-- Every draft change bumps the sheet's monotonic revision (separate from the session's
-- metadata_version); publication must name the revision the publisher reviewed.
--
-- Locking protocol (shared with sessions): every attendance workflow locks the sessions row first
-- (for no key update, which conflicts with end_session's for update), then the academic year row
-- (for share), then writes. This serializes short commits for one session.
--
-- Publication effects are recorded in attendance_effects as a transactional outbox only. No access,
-- notification, or replacement is delivered by this slice; those need their owning modules. Removing
-- an effect on correction is recorded as 'revocation_review' pending an owner-approved policy.
--
-- Clients read through RLS. Writes go through the security definer RPCs below. Errors raised for the
-- application use SQLSTATE P0001 with a stable code as the message.

create type public.attendance_status as enum ('unknown', 'present', 'late', 'absent', 'excused');
create type public.attendance_source as enum ('manual', 'bulk', 'check_in');
create type public.attendance_publication_kind as enum ('initial', 'correction');
create type public.attendance_effect_type as enum ('explanation_access', 'absence_event', 'revocation_review');

-- One per session once attendance is first touched. revision 0 means no draft change yet.
create table public.attendance_sheets (
  session_id uuid primary key,
  academy_id uuid not null,
  academic_year_id uuid not null,
  revision integer not null default 0 check (revision >= 0),
  published_revision integer,
  publication_count integer not null default 0 check (publication_count >= 0),
  last_published_at timestamptz,
  last_published_by uuid references public.profiles (id),
  last_published_by_name text,
  updated_at timestamptz not null default now(),
  foreign key (academy_id, academic_year_id, session_id)
    references public.sessions (academy_id, academic_year_id, id),
  constraint attendance_sheets_published_shape check (
    (publication_count = 0 and published_revision is null and last_published_at is null and last_published_by is null)
    or (publication_count > 0 and published_revision between 0 and revision
      and last_published_at is not null and last_published_by is not null)
  )
);

-- A roster student's attendance in one session. A missing row is Unknown at version 0.
create table public.attendance_records (
  academy_id uuid not null,
  academic_year_id uuid not null,
  session_id uuid not null,
  annual_student_record_id uuid not null,
  status public.attendance_status not null,
  version integer not null check (version >= 1),
  source public.attendance_source not null,
  updated_by uuid not null references public.profiles (id),
  updated_by_name text,
  updated_at timestamptz not null default now(),
  -- First positive check-in; repeated check-ins never move it.
  checked_in_at timestamptz,
  checked_in_by uuid references public.profiles (id),
  published_status public.attendance_status,
  published_at timestamptz,
  published_publication_id uuid,
  primary key (session_id, annual_student_record_id),
  foreign key (academy_id, academic_year_id, session_id)
    references public.sessions (academy_id, academic_year_id, id),
  foreign key (academy_id, academic_year_id, annual_student_record_id)
    references public.annual_student_records (academy_id, academic_year_id, id),
  foreign key (session_id, annual_student_record_id)
    references public.session_roster_entries (session_id, annual_student_record_id),
  constraint attendance_records_check_in_shape check ((checked_in_at is null) = (checked_in_by is null)),
  constraint attendance_records_published_shape check (
    (published_status is null and published_at is null and published_publication_id is null)
    or (published_status is not null and published_at is not null and published_publication_id is not null)
  )
);

create index attendance_records_student_idx on public.attendance_records (annual_student_record_id);

-- Exactly what was made official, when, and by whom. Immutable.
create table public.attendance_publications (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null,
  academic_year_id uuid not null,
  session_id uuid not null,
  sequence integer not null check (sequence >= 1),
  kind public.attendance_publication_kind not null,
  revision integer not null check (revision >= 0),
  item_count integer not null check (item_count >= 0),
  published_at timestamptz not null default now(),
  published_by uuid not null references public.profiles (id),
  published_by_name text,
  unique (session_id, sequence),
  unique (academy_id, academic_year_id, id),
  foreign key (academy_id, academic_year_id, session_id)
    references public.sessions (academy_id, academic_year_id, id),
  constraint attendance_publications_kind_shape check ((kind = 'initial') = (sequence = 1))
);

alter table public.attendance_records
  add constraint attendance_records_publication_fkey
  foreign key (published_publication_id) references public.attendance_publications (id);

create table public.attendance_publication_items (
  publication_id uuid not null references public.attendance_publications (id),
  session_id uuid not null,
  annual_student_record_id uuid not null,
  status public.attendance_status not null,
  -- The previous official value; null when this is the first.
  previous_status public.attendance_status,
  primary key (publication_id, annual_student_record_id),
  foreign key (session_id, annual_student_record_id)
    references public.session_roster_entries (session_id, annual_student_record_id)
);

-- Transactional outbox of official effects. Consumers (entitlements, notifications) are later
-- modules; processed_at stays null until one handles the row.
create table public.attendance_effects (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null,
  academic_year_id uuid not null,
  session_id uuid not null,
  annual_student_record_id uuid not null,
  publication_id uuid not null,
  effect_type public.attendance_effect_type not null,
  -- For revocation_review: the earlier effect a correction no longer supports.
  reverses public.attendance_effect_type,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  foreign key (academy_id, academic_year_id, publication_id)
    references public.attendance_publications (academy_id, academic_year_id, id),
  foreign key (session_id, annual_student_record_id)
    references public.session_roster_entries (session_id, annual_student_record_id),
  constraint attendance_effects_reverses_shape check (
    (effect_type = 'revocation_review' and reverses in ('explanation_access', 'absence_event'))
    or (effect_type <> 'revocation_review' and reverses is null)
  ),
  constraint attendance_effects_per_publication unique nulls not distinct
    (publication_id, annual_student_record_id, effect_type, reverses)
);

-- A stable source identity: each student gets at most one access grant and one absence event per
-- session, however many times attendance is republished.
create unique index attendance_effects_once on public.attendance_effects (session_id, annual_student_record_id, effect_type)
  where effect_type in ('explanation_access', 'absence_event');

-- Retried mutations. The stored response commits together with the write it describes.
create table public.attendance_requests (
  actor_id uuid not null references public.profiles (id),
  idempotency_key uuid not null,
  operation text not null check (operation in ('check_in', 'set', 'bulk', 'publish')),
  academy_id uuid not null,
  session_id uuid not null,
  fingerprint text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (actor_id, idempotency_key)
);

create index attendance_requests_created_idx on public.attendance_requests (created_at);

-- Fixed-window request counters for the external API, shared by every server instance.
create table public.api_rate_windows (
  actor_id uuid not null,
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null,
  primary key (actor_id, bucket, window_start)
);

-- History is never rewritten or deleted.
create or replace function public.reject_attendance_history_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = 'validation', hint = 'Published attendance history cannot change.';
end;
$$;

create trigger attendance_publications_immutable before update or delete on public.attendance_publications
for each row execute function public.reject_attendance_history_change();
create trigger attendance_publication_items_immutable before update or delete on public.attendance_publication_items
for each row execute function public.reject_attendance_history_change();
create trigger attendance_records_no_delete before delete on public.attendance_records
for each row execute function public.reject_attendance_history_change();
create trigger attendance_sheets_no_delete before delete on public.attendance_sheets
for each row execute function public.reject_attendance_history_change();
create trigger attendance_effects_no_delete before delete on public.attendance_effects
for each row execute function public.reject_attendance_history_change();

alter table public.attendance_sheets enable row level security;
alter table public.attendance_records enable row level security;
alter table public.attendance_publications enable row level security;
alter table public.attendance_publication_items enable row level security;
alter table public.attendance_effects enable row level security;
alter table public.attendance_requests enable row level security;
alter table public.api_rate_windows enable row level security;

revoke all on public.attendance_sheets, public.attendance_records, public.attendance_publications,
  public.attendance_publication_items, public.attendance_effects, public.attendance_requests,
  public.api_rate_windows from public, anon, authenticated;
grant select on public.attendance_sheets, public.attendance_records, public.attendance_publications,
  public.attendance_publication_items to authenticated;

create policy attendance_sheets_select_members on public.attendance_sheets
  for select to authenticated using (public.is_academy_member(academy_id));
create policy attendance_records_select_members on public.attendance_records
  for select to authenticated using (public.is_academy_member(academy_id));
create policy attendance_publications_select_members on public.attendance_publications
  for select to authenticated using (public.is_academy_member(academy_id));
create policy attendance_publication_items_select_members on public.attendance_publication_items
  for select to authenticated using (exists (
    select 1 from public.attendance_publications p
    where p.id = publication_id and public.is_academy_member(p.academy_id)
  ));

-- ---------------------------------------------------------------------------------------------
-- Internal helpers (security definer callers only).

-- Checks membership, locks the session row, and materializes an expired live session.
-- Raises forbidden, validation, or not_found. Callers check the lifecycle and year afterwards.
create or replace function public.lock_attendance_session(p_academy_id uuid, p_session_id uuid)
returns public.sessions
language plpgsql security definer set search_path = '' as $$
declare
  target public.sessions%rowtype;
begin
  if auth.uid() is null or p_academy_id is null or public.academy_role_for(p_academy_id) is null then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  if p_session_id is null then raise exception using errcode = 'P0001', message = 'validation'; end if;
  select s.* into target from public.sessions s
  where s.id = p_session_id and s.academy_id = p_academy_id
  for no key update;
  if not found then raise exception using errcode = 'P0001', message = 'not_found'; end if;
  if target.state = 'live' and target.auto_end_at <= now() then
    perform public.expire_sessions(target.schedule_id);
    select s.* into target from public.sessions s where s.id = p_session_id;
  end if;
  return target;
end;
$$;

create or replace function public.require_open_attendance_year(p_session public.sessions)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.academic_years y
  where y.id = p_session.academic_year_id and y.academy_id = p_session.academy_id and y.closed_at is null
  for share;
  if not found then raise exception using errcode = 'P0001', message = 'year_unavailable'; end if;
end;
$$;

-- The stored response for a retried request, or null for a new one. A key reused for a different
-- request raises idempotency_conflict.
create or replace function public.attendance_replay(p_key uuid, p_operation text, p_fingerprint text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  prior public.attendance_requests%rowtype;
begin
  if p_key is null then raise exception using errcode = 'P0001', message = 'validation'; end if;
  select * into prior from public.attendance_requests r where r.actor_id = auth.uid() and r.idempotency_key = p_key;
  if not found then return null; end if;
  if prior.operation <> p_operation or prior.fingerprint <> p_fingerprint then
    raise exception using errcode = 'P0001', message = 'idempotency_conflict';
  end if;
  return prior.response || jsonb_build_object('replayed', true);
end;
$$;

create or replace function public.remember_attendance_request(
  p_key uuid, p_operation text, p_session public.sessions, p_fingerprint text, p_response jsonb
)
returns jsonb
language sql security definer set search_path = '' as $$
  insert into public.attendance_requests (actor_id, idempotency_key, operation, academy_id, session_id, fingerprint, response)
  values (auth.uid(), p_key, p_operation, p_session.academy_id, p_session.id, p_fingerprint, p_response);
  select p_response || jsonb_build_object('replayed', false);
$$;

-- Bumps the session's attendance revision (creating the sheet) and returns the new revision.
create or replace function public.bump_attendance_revision(p_session public.sessions)
returns integer
language sql security definer set search_path = '' as $$
  insert into public.attendance_sheets as sh (session_id, academy_id, academic_year_id, revision)
  values (p_session.id, p_session.academy_id, p_session.academic_year_id, 1)
  on conflict (session_id) do update set revision = sh.revision + 1, updated_at = now()
  returning sh.revision;
$$;

create or replace function public.current_attendance_revision(p_session_id uuid)
returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce((select revision from public.attendance_sheets where session_id = p_session_id), 0);
$$;

-- One roster student's current attendance, Unknown at version 0 when nothing was recorded.
create or replace function public.attendance_entry(p_session_id uuid, p_record_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'annual_student_record_id', en.annual_student_record_id,
    'full_name', r.full_name,
    'archived', r.archived_at is not null,
    'origin', en.origin,
    'group_name', g.name,
    'status', coalesce(a.status, 'unknown'),
    'version', coalesce(a.version, 0),
    'source', a.source,
    'updated_at', a.updated_at,
    'updated_by', a.updated_by,
    'updated_by_name', a.updated_by_name,
    'checked_in_at', a.checked_in_at,
    'published_status', a.published_status,
    'published_at', a.published_at
  )
  from public.session_roster_entries en
  join public.annual_student_records r on r.id = en.annual_student_record_id
  left join public.groups g on g.id = en.primary_group_id
  left join public.attendance_records a
    on a.session_id = en.session_id and a.annual_student_record_id = en.annual_student_record_id
  where en.session_id = p_session_id and en.annual_student_record_id = p_record_id;
$$;

-- Raises not_on_roster when the student belongs to the session's academy and year but not its
-- roster, and student_not_found otherwise (no cross-academy disclosure).
create or replace function public.require_roster_student(p_session public.sessions, p_record_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_record_id is null then raise exception using errcode = 'P0001', message = 'validation'; end if;
  perform 1 from public.session_roster_entries en
  where en.session_id = p_session.id and en.annual_student_record_id = p_record_id;
  if found then return; end if;
  perform 1 from public.annual_student_records r
  where r.id = p_record_id and r.academy_id = p_session.academy_id and r.academic_year_id = p_session.academic_year_id;
  if found then raise exception using errcode = 'P0001', message = 'not_on_roster'; end if;
  raise exception using errcode = 'P0001', message = 'student_not_found';
end;
$$;

-- Writes one draft value (caller holds the session lock and has checked the version).
create or replace function public.write_attendance(
  p_session public.sessions, p_record_id uuid, p_status public.attendance_status, p_source public.attendance_source,
  p_check_in boolean
)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  actor_name text := (select nullif(btrim(p.full_name), '') from public.profiles p where p.id = actor);
begin
  insert into public.attendance_records as a (
    academy_id, academic_year_id, session_id, annual_student_record_id, status, version, source,
    updated_by, updated_by_name, checked_in_at, checked_in_by
  ) values (
    p_session.academy_id, p_session.academic_year_id, p_session.id, p_record_id, p_status, 1, p_source,
    actor, actor_name, case when p_check_in then now() end, case when p_check_in then actor end
  )
  on conflict (session_id, annual_student_record_id) do update set
    status = excluded.status,
    version = a.version + 1,
    source = excluded.source,
    updated_by = excluded.updated_by,
    updated_by_name = excluded.updated_by_name,
    updated_at = now(),
    checked_in_at = coalesce(a.checked_in_at, excluded.checked_in_at),
    checked_in_by = case when a.checked_in_at is null then excluded.checked_in_by else a.checked_in_by end;
end;
$$;

create or replace function public.attendance_pending(p_session_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select sh.publication_count > 0 from public.attendance_sheets sh where sh.session_id = p_session_id), false);
$$;

-- ---------------------------------------------------------------------------------------------
-- Commands.

-- Positive check-in for a roster student while the session is live.
-- outcome: 'recorded' (Unknown became draft Present), 'already_recorded' (Present or Late; nothing
-- changes), or 'review_required' (Absent or Excused; nothing changes, not remembered for retries).
create or replace function public.check_in_attendance(
  p_academy_id uuid, p_session_id uuid, p_annual_record_id uuid, p_key uuid
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  target public.sessions%rowtype;
  fingerprint text := md5(jsonb_build_object('session', p_session_id, 'record', p_annual_record_id)::text);
  replay jsonb;
  current_status public.attendance_status;
  outcome text;
  entry jsonb;
  revision integer;
begin
  target := public.lock_attendance_session(p_academy_id, p_session_id);
  replay := public.attendance_replay(p_key, 'check_in', fingerprint);
  if replay is not null then return replay; end if;
  if target.state <> 'live' then raise exception using errcode = 'P0001', message = 'session_ended'; end if;
  perform public.require_open_attendance_year(target);
  perform public.require_roster_student(target, p_annual_record_id);

  select a.status into current_status from public.attendance_records a
  where a.session_id = target.id and a.annual_student_record_id = p_annual_record_id;
  current_status := coalesce(current_status, 'unknown');

  if current_status in ('absent', 'excused') then
    outcome := 'review_required';
  elsif current_status in ('present', 'late') then
    outcome := 'already_recorded';
  else
    perform public.write_attendance(target, p_annual_record_id, 'present', 'check_in', true);
    perform public.bump_attendance_revision(target);
    outcome := 'recorded';
  end if;

  entry := public.attendance_entry(target.id, p_annual_record_id);
  revision := public.current_attendance_revision(target.id);
  if outcome = 'review_required' then
    return jsonb_build_object('outcome', outcome, 'entry', entry, 'revision', revision,
      'correction_pending', false, 'replayed', false);
  end if;
  return public.remember_attendance_request(p_key, 'check_in', target, fingerprint, jsonb_build_object(
    'outcome', outcome, 'entry', entry, 'revision', revision,
    'correction_pending', public.attendance_pending(target.id)
      and (entry->>'status') is distinct from coalesce(entry->>'published_status', 'unknown')
  ));
end;
$$;

-- Applies reviewed draft changes atomically. p_changes is a JSON array of
-- { annual_student_record_id, status, expected_version } (version 0 for an unrecorded student).
-- outcome: 'updated' (applied; unchanged values are skipped), or 'conflict' (nothing applied;
-- conflicts lists the current rows whose version differs).
create or replace function public.apply_attendance_changes(
  p_academy_id uuid, p_session_id uuid, p_changes jsonb, p_operation text, p_key uuid
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  target public.sessions%rowtype;
  fingerprint text;
  replay jsonb;
  change record;
  conflicts jsonb := '[]'::jsonb;
  entries jsonb := '[]'::jsonb;
  changed integer := 0;
  revision integer;
  write_source public.attendance_source := case when p_operation = 'bulk' then 'bulk' else 'manual' end;
begin
  if p_operation not in ('set', 'bulk') or p_changes is null or jsonb_typeof(p_changes) <> 'array'
    or jsonb_array_length(p_changes) < 1 or jsonb_array_length(p_changes) > 500
    or (p_operation = 'set' and jsonb_array_length(p_changes) <> 1) then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  fingerprint := md5(jsonb_build_object('session', p_session_id, 'changes', p_changes)::text);
  target := public.lock_attendance_session(p_academy_id, p_session_id);
  replay := public.attendance_replay(p_key, p_operation, fingerprint);
  if replay is not null then return replay; end if;
  perform public.require_open_attendance_year(target);

  create temporary table if not exists pg_temp.attendance_change_input (
    annual_student_record_id uuid, status public.attendance_status, expected_version integer
  ) on commit drop;
  truncate pg_temp.attendance_change_input;
  begin
    insert into pg_temp.attendance_change_input
    select (c->>'annual_student_record_id')::uuid, (c->>'status')::public.attendance_status, (c->>'expected_version')::integer
    from jsonb_array_elements(p_changes) c;
  exception when others then
    raise exception using errcode = 'P0001', message = 'validation';
  end;
  if exists (select 1 from pg_temp.attendance_change_input
      where annual_student_record_id is null or status is null or expected_version is null or expected_version < 0)
    or (select count(distinct annual_student_record_id) from pg_temp.attendance_change_input) <> jsonb_array_length(p_changes) then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  for change in select * from pg_temp.attendance_change_input loop
    perform public.require_roster_student(target, change.annual_student_record_id);
  end loop;

  select coalesce(jsonb_agg(public.attendance_entry(target.id, i.annual_student_record_id)), '[]'::jsonb) into conflicts
  from pg_temp.attendance_change_input i
  left join public.attendance_records a
    on a.session_id = target.id and a.annual_student_record_id = i.annual_student_record_id
  where coalesce(a.version, 0) <> i.expected_version;
  if jsonb_array_length(conflicts) > 0 then
    return jsonb_build_object('outcome', 'conflict', 'conflicts', conflicts,
      'revision', public.current_attendance_revision(target.id), 'replayed', false);
  end if;

  for change in
    select i.* from pg_temp.attendance_change_input i
    left join public.attendance_records a
      on a.session_id = target.id and a.annual_student_record_id = i.annual_student_record_id
    where coalesce(a.status, 'unknown') <> i.status
  loop
    perform public.write_attendance(target, change.annual_student_record_id, change.status, write_source, false);
    changed := changed + 1;
  end loop;
  if changed > 0 then perform public.bump_attendance_revision(target); end if;
  revision := public.current_attendance_revision(target.id);

  select coalesce(jsonb_agg(public.attendance_entry(target.id, i.annual_student_record_id)), '[]'::jsonb) into entries
  from pg_temp.attendance_change_input i;
  return public.remember_attendance_request(p_key, p_operation, target, fingerprint, jsonb_build_object(
    'outcome', 'updated', 'changed', changed, 'entries', entries, 'revision', revision
  ));
end;
$$;

-- Publishes the reviewed revision. Raises publication_stale when attendance changed after review.
-- outcome: 'published' (a new publication), 'unchanged' (nothing differs from the official values),
-- or 'already_published' (this revision is already official).
create or replace function public.publish_attendance(
  p_academy_id uuid, p_session_id uuid, p_expected_revision integer, p_key uuid
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  target public.sessions%rowtype;
  fingerprint text := md5(jsonb_build_object('session', p_session_id, 'revision', p_expected_revision)::text);
  replay jsonb;
  sheet public.attendance_sheets%rowtype;
  actor uuid := auth.uid();
  actor_name text := (select nullif(btrim(p.full_name), '') from public.profiles p where p.id = auth.uid());
  new_publication_id uuid;
  item_total integer;
  moment timestamptz := now();
begin
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  target := public.lock_attendance_session(p_academy_id, p_session_id);
  replay := public.attendance_replay(p_key, 'publish', fingerprint);
  if replay is not null then return replay; end if;
  perform public.require_open_attendance_year(target);

  insert into public.attendance_sheets (session_id, academy_id, academic_year_id)
  values (target.id, target.academy_id, target.academic_year_id)
  on conflict (session_id) do nothing;
  select * into sheet from public.attendance_sheets where session_id = target.id;
  if sheet.revision <> p_expected_revision then
    raise exception using errcode = 'P0001', message = 'publication_stale';
  end if;
  if sheet.publication_count > 0 and sheet.published_revision = sheet.revision then
    return public.remember_attendance_request(p_key, 'publish', target, fingerprint, jsonb_build_object(
      'outcome', 'already_published', 'publication_id', null, 'revision', sheet.revision, 'item_count', 0));
  end if;

  create temporary table if not exists pg_temp.attendance_publish_items (
    annual_student_record_id uuid, status public.attendance_status, previous_status public.attendance_status,
    origin public.session_roster_origin
  ) on commit drop;
  truncate pg_temp.attendance_publish_items;
  insert into pg_temp.attendance_publish_items
  select a.annual_student_record_id, a.status, a.published_status, en.origin
  from public.attendance_records a
  join public.session_roster_entries en
    on en.session_id = a.session_id and en.annual_student_record_id = a.annual_student_record_id
  where a.session_id = target.id and a.status is distinct from coalesce(a.published_status, 'unknown');
  select count(*) into item_total from pg_temp.attendance_publish_items;

  if item_total = 0 and sheet.publication_count > 0 then
    update public.attendance_sheets set published_revision = revision, updated_at = moment where session_id = target.id;
    return public.remember_attendance_request(p_key, 'publish', target, fingerprint, jsonb_build_object(
      'outcome', 'unchanged', 'publication_id', null, 'revision', sheet.revision, 'item_count', 0));
  end if;

  insert into public.attendance_publications (
    academy_id, academic_year_id, session_id, sequence, kind, revision, item_count, published_at, published_by, published_by_name
  ) values (
    target.academy_id, target.academic_year_id, target.id, sheet.publication_count + 1,
    case when sheet.publication_count = 0 then 'initial' else 'correction' end::public.attendance_publication_kind,
    sheet.revision, item_total, moment, actor, actor_name
  ) returning id into new_publication_id;

  insert into public.attendance_publication_items (publication_id, session_id, annual_student_record_id, status, previous_status)
  select new_publication_id, target.id, i.annual_student_record_id, i.status, i.previous_status
  from pg_temp.attendance_publish_items i;

  update public.attendance_records a set
    published_status = a.status, published_at = moment, published_publication_id = new_publication_id
  from pg_temp.attendance_publish_items i
  where a.session_id = target.id and a.annual_student_record_id = i.annual_student_record_id;

  -- Present/Late: explanation access. Mandatory Absent for an expected student: absence event.
  -- Excused and Unknown: none. Each effect is created once per student and session.
  insert into public.attendance_effects (academy_id, academic_year_id, session_id, annual_student_record_id, publication_id, effect_type)
  select target.academy_id, target.academic_year_id, target.id, i.annual_student_record_id, new_publication_id,
    case when i.status in ('present', 'late') then 'explanation_access' else 'absence_event' end::public.attendance_effect_type
  from pg_temp.attendance_publish_items i
  where i.status in ('present', 'late')
    or (i.status = 'absent' and target.mandatory and i.origin = 'expected')
  on conflict do nothing;

  -- A correction that no longer supports an earlier effect needs an owner-approved revocation policy.
  insert into public.attendance_effects (academy_id, academic_year_id, session_id, annual_student_record_id, publication_id, effect_type, reverses)
  select target.academy_id, target.academic_year_id, target.id, i.annual_student_record_id, new_publication_id,
    'revocation_review', e.effect_type
  from pg_temp.attendance_publish_items i
  join public.attendance_effects e
    on e.session_id = target.id and e.annual_student_record_id = i.annual_student_record_id
    and e.effect_type in ('explanation_access', 'absence_event')
  where (e.effect_type = 'explanation_access' and i.status not in ('present', 'late'))
    or (e.effect_type = 'absence_event' and i.status <> 'absent')
  on conflict do nothing;

  update public.attendance_sheets set
    published_revision = revision, publication_count = publication_count + 1,
    last_published_at = moment, last_published_by = actor, last_published_by_name = actor_name, updated_at = moment
  where session_id = target.id;

  return public.remember_attendance_request(p_key, 'publish', target, fingerprint, jsonb_build_object(
    'outcome', 'published', 'publication_id', new_publication_id, 'revision', sheet.revision, 'item_count', item_total));
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Reads (security invoker: RLS limits rows to the caller's academies).

-- A session's attendance sheet: lifecycle, revision, publication state, and every roster entry with
-- draft and official values. Null when the caller cannot see the session.
create or replace function public.get_attendance(p_academy_id uuid, p_session_id uuid)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'session', jsonb_build_object(
      'id', s.id, 'academy_id', s.academy_id, 'academic_year_id', s.academic_year_id,
      'schedule_title', s.schedule_title, 'group_name', s.group_name, 'mandatory', s.mandatory,
      'location', s.location, 'started_at', s.started_at, 'auto_end_at', s.auto_end_at,
      'state', case when s.state = 'live' and s.auto_end_at <= now() then 'ended' else s.state::text end,
      'ended_at', case when s.state = 'live' and s.auto_end_at <= now() then s.auto_end_at else s.ended_at end,
      'year_open', exists (select 1 from public.academic_years y where y.id = s.academic_year_id and y.closed_at is null)
    ),
    'revision', coalesce(sh.revision, 0),
    'published_revision', sh.published_revision,
    'publication_count', coalesce(sh.publication_count, 0),
    'last_published_at', sh.last_published_at,
    'last_published_by_name', sh.last_published_by_name,
    'entries', coalesce((
      select jsonb_agg(e order by lower(e->>'full_name'), e->>'annual_student_record_id')
      from (
        select jsonb_build_object(
          'annual_student_record_id', en.annual_student_record_id,
          'full_name', r.full_name,
          'archived', r.archived_at is not null,
          'origin', en.origin,
          'group_name', g.name,
          'status', coalesce(a.status, 'unknown'),
          'version', coalesce(a.version, 0),
          'source', a.source,
          'updated_at', a.updated_at,
          'updated_by', a.updated_by,
          'updated_by_name', a.updated_by_name,
          'checked_in_at', a.checked_in_at,
          'published_status', a.published_status,
          'published_at', a.published_at
        ) as e
        from public.session_roster_entries en
        join public.annual_student_records r on r.id = en.annual_student_record_id
        left join public.groups g on g.id = en.primary_group_id
        left join public.attendance_records a
          on a.session_id = en.session_id and a.annual_student_record_id = en.annual_student_record_id
        where en.session_id = s.id
      ) x
    ), '[]'::jsonb)
  )
  from public.sessions s
  left join public.attendance_sheets sh on sh.session_id = s.id
  where s.id = p_session_id and s.academy_id = p_academy_id;
$$;

-- The academy of a session the caller can see, so token clients can address sessions by id alone.
create or replace function public.session_academy(p_session_id uuid)
returns uuid
language sql stable security invoker set search_path = '' as $$
  select s.academy_id from public.sessions s where s.id = p_session_id;
$$;

-- ---------------------------------------------------------------------------------------------
-- API throttling: consumes one hit from the caller's fixed window. Returns
-- { allowed, retry_after } (seconds until the window resets).
create or replace function public.consume_api_quota(p_bucket text, p_limit integer, p_window_seconds integer)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  slot_start timestamptz;
  total integer;
begin
  if actor is null then raise exception using errcode = 'P0001', message = 'forbidden'; end if;
  if p_bucket is null or p_bucket !~ '^[a-z_:]{1,40}$' or p_limit not between 1 and 10000
    or p_window_seconds not between 1 and 3600 then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  slot_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.api_rate_windows as w (actor_id, bucket, window_start, hits)
  values (actor, p_bucket, slot_start, 1)
  on conflict (actor_id, bucket, window_start) do update set hits = w.hits + 1
  returning hits into total;
  delete from public.api_rate_windows w where w.actor_id = actor and w.window_start < now() - interval '1 hour';
  return jsonb_build_object(
    'allowed', total <= p_limit,
    'retry_after', greatest(1, ceil(extract(epoch from (slot_start + make_interval(secs => p_window_seconds) - now())))::integer)
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Realtime: commit-backed minimal invalidations on private channel attendance:<academy>:<session>.
-- Payloads carry identifiers and revisions only; clients refetch authoritative rows.

create or replace function public.broadcast_attendance_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(
    jsonb_build_object('session_id', new.session_id, 'revision', new.revision,
      'published_revision', new.published_revision, 'publication_count', new.publication_count),
    'attendance_changed',
    'attendance:' || new.academy_id || ':' || new.session_id,
    true
  );
  return null;
end;
$$;

create trigger attendance_sheets_broadcast after insert or update on public.attendance_sheets
for each row execute function public.broadcast_attendance_change();

-- A topic is joinable only when it names a session in an academy the caller belongs to.
create or replace function public.can_join_attendance_channel(p_topic text)
returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  parts text[];
begin
  parts := regexp_match(p_topic,
    '^attendance:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$');
  if parts is null then return false; end if;
  return public.is_academy_member(parts[1]::uuid) and exists (
    select 1 from public.sessions s where s.id = parts[2]::uuid and s.academy_id = parts[1]::uuid
  );
end;
$$;

-- Members receive invalidations and presence; they may only send presence (never broadcasts).
create policy attendance_channel_receive on realtime.messages
  for select to authenticated
  using (realtime.messages.extension in ('broadcast', 'presence') and public.can_join_attendance_channel(realtime.topic()));
create policy attendance_channel_presence on realtime.messages
  for insert to authenticated
  with check (realtime.messages.extension = 'presence' and public.can_join_attendance_channel(realtime.topic()));

-- ---------------------------------------------------------------------------------------------
-- Grants.

revoke all on function public.reject_attendance_history_change() from public, anon, authenticated;
revoke all on function public.lock_attendance_session(uuid, uuid) from public, anon, authenticated;
revoke all on function public.require_open_attendance_year(public.sessions) from public, anon, authenticated;
revoke all on function public.attendance_replay(uuid, text, text) from public, anon, authenticated;
revoke all on function public.remember_attendance_request(uuid, text, public.sessions, text, jsonb) from public, anon, authenticated;
revoke all on function public.bump_attendance_revision(public.sessions) from public, anon, authenticated;
revoke all on function public.current_attendance_revision(uuid) from public, anon, authenticated;
revoke all on function public.attendance_entry(uuid, uuid) from public, anon, authenticated;
revoke all on function public.require_roster_student(public.sessions, uuid) from public, anon, authenticated;
revoke all on function public.write_attendance(public.sessions, uuid, public.attendance_status, public.attendance_source, boolean) from public, anon, authenticated;
revoke all on function public.attendance_pending(uuid) from public, anon, authenticated;
revoke all on function public.broadcast_attendance_change() from public, anon, authenticated;
revoke all on function public.check_in_attendance(uuid, uuid, uuid, uuid) from public, anon;
revoke all on function public.apply_attendance_changes(uuid, uuid, jsonb, text, uuid) from public, anon;
revoke all on function public.publish_attendance(uuid, uuid, integer, uuid) from public, anon;
revoke all on function public.get_attendance(uuid, uuid) from public, anon;
revoke all on function public.session_academy(uuid) from public, anon;
revoke all on function public.consume_api_quota(text, integer, integer) from public, anon;
revoke all on function public.can_join_attendance_channel(text) from public, anon;

grant execute on function public.check_in_attendance(uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.apply_attendance_changes(uuid, uuid, jsonb, text, uuid) to authenticated;
grant execute on function public.publish_attendance(uuid, uuid, integer, uuid) to authenticated;
grant execute on function public.get_attendance(uuid, uuid) to authenticated;
grant execute on function public.session_academy(uuid) to authenticated;
grant execute on function public.consume_api_quota(text, integer, integer) to authenticated;
grant execute on function public.can_join_attendance_channel(text) to authenticated;
