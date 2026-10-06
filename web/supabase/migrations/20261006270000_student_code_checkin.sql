-- Student codes: permanent reservation, lifecycle retirement, and transactional code check-in.
--
-- 1. Permanent reservation. Every issued code string stays reserved forever. The release/reuse
--    behavior of 20261006190000 and 20261006200000 is withdrawn: `replace_release` and
--    `unretire_student_code` now fail with `code_release_removed`, and a retired row can no longer
--    change at all. Because historical `released` rows may already have let one string belong to
--    several students, the reservation lives in a registry keyed by (academy_id, code) that is
--    seeded from the DISTINCT historical strings (no ledger row is changed or deleted) and claimed
--    by a BEFORE INSERT trigger, so every issuance path (manual, replace, generated, bulk, direct
--    RPC) must claim a never-issued value atomically.
--
-- 2. Lifecycle retirement. A real level change retires the record's active code (`level_changed`);
--    closing an academic year retires its active codes (`year_closed`). Both run inside the owning
--    UPDATE, take no settings lock, work while codes are disabled, and release nothing. Existing
--    stale assignments are NOT backfilled here (see planning/phone-attendance-api-handoff.md for the
--    reviewable report queries); a fresh scan rejects them regardless.
--
-- 3. Code check-in. `check_in_attendance_by_code` resolves an academy-local code and records the
--    attendance in one transaction through the shared check-in engine. Lock order follows the
--    student-code protocol: settings (share) -> session -> record (share) -> year (share).
--    Errors are P0001 with a stable message: validation, forbidden, not_found, student_codes_disabled,
--    student_code_not_found, student_code_retired, student_code_ambiguous, plus the existing
--    session_ended, year_unavailable, not_on_roster, idempotency_conflict, throttled.

-- ---------------------------------------------------------------------------------------------
-- 1. Permanent reservation.

create table public.student_code_reservations (
  academy_id uuid not null references public.academies (id) on delete cascade,
  code text not null check (code = public.normalize_student_code(code)),
  reserved_at timestamptz not null default now(),
  primary key (academy_id, code)
);
alter table public.student_code_reservations enable row level security;
revoke all on public.student_code_reservations from public, anon, authenticated;

-- Backfill: one row per distinct string ever issued, whatever its historical retirement reason.
insert into public.student_code_reservations (academy_id, code)
select distinct a.academy_id, a.code from public.student_code_assignments a
on conflict do nothing;

create or replace function public.reserve_student_code()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.student_code_reservations (academy_id, code) values (new.academy_id, new.code)
  on conflict (academy_id, code) do nothing;
  -- A concurrent claimant of the same value waits on the primary key, then finds it taken.
  if not found then raise exception using errcode = 'P0001', message = 'code_taken'; end if;
  return new;
end;
$$;
revoke all on function public.reserve_student_code() from public, anon, authenticated;

-- Fires after student_code_assignments_issue (alphabetical), so invalid issues fail first.
create trigger student_code_assignments_reserve before insert on public.student_code_assignments
for each row execute function public.reserve_student_code();

-- A retired row never changes again: no release, no unretire. Only current -> retired, once.
create or replace function public.protect_student_code_assignment()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'code_history', hint = 'Issued codes cannot be deleted.';
  end if;
  if (new.id, new.academy_id, new.academic_year_id, new.academy_student_profile_id, new.annual_student_record_id,
      new.level_id, new.code, new.code_version, new.issued_at, new.issued_by)
    is distinct from
     (old.id, old.academy_id, old.academic_year_id, old.academy_student_profile_id, old.annual_student_record_id,
      old.level_id, old.code, old.code_version, old.issued_at, old.issued_by)
    or old.retired_at is not null or new.retired_at is null then
    raise exception using errcode = 'P0001', message = 'code_history',
      hint = 'An issued code can only be retired, once.';
  end if;
  new.retired_at := now();
  update public.student_code_states
  set version = version + 1, current_assignment_id = null, updated_at = now()
  where annual_student_record_id = old.annual_student_record_id and current_assignment_id = old.id;
  if not found then
    raise exception using errcode = 'P0001', message = 'code_history', hint = 'Code state is out of step.';
  end if;
  return new;
end;
$$;

-- Old clients keep the signature; the retired actions fail explicitly and change nothing.
create or replace function public.unretire_student_code(p_academy_id uuid, p_assignment_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = 'code_release_removed',
    hint = 'Issued codes are reserved permanently and cannot be reused.';
end;
$$;

-- change_student_code: identical to 20261006190000 except that replace_release is rejected and
-- every issuance claims its value in the reservation registry (via the trigger).
create or replace function public.change_student_code(
  p_academy_id uuid, p_record_id uuid, p_action text, p_code text, p_expected_version integer, p_request_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  holder public.annual_student_records%rowtype;
  current_version integer;
  current_row public.student_code_assignments%rowtype;
  stored public.student_code_requests%rowtype;
  normalized text;
  issued text;
  pattern text;
  code_prefix text;
  code_width integer;
  fingerprint_value text;
  result jsonb;
begin
  if actor is null or p_academy_id is null or public.academy_role_for(p_academy_id) is null then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  if p_action = 'replace_release' then
    raise exception using errcode = 'P0001', message = 'code_release_removed',
      hint = 'Issued codes are reserved permanently; use replace.';
  end if;
  if p_record_id is null or p_request_key is null or p_expected_version is null or p_expected_version < 0
    or p_action is null or p_action <> all (array['assign', 'replace', 'generate', 'retire']) then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  if p_action in ('assign', 'replace') then
    normalized := public.normalize_student_code(p_code);
    if normalized is null then
      raise exception using errcode = 'P0001', message = 'validation', hint = 'code';
    end if;
  elsif p_code is not null and pg_catalog.btrim(p_code) <> '' then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  fingerprint_value := p_action || ':' || p_record_id::text || ':' || p_expected_version::text || ':' || coalesce(normalized, '');

  -- Rank 1. Retirement works while codes are off, so it never touches the settings row.
  if p_action <> 'retire' then
    perform 1 from public.student_code_settings s where s.academy_id = p_academy_id for share;
  end if;

  -- Rank 3. Serializes with student edits, code check-ins, and other code changes on this record.
  select r.* into holder from public.annual_student_records r
  where r.id = p_record_id and r.academy_id = p_academy_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'not_found'; end if;

  select * into stored from public.student_code_requests q
  where q.academy_id = p_academy_id and q.request_key = p_request_key;
  if found then
    if stored.actor_id = actor and stored.fingerprint = fingerprint_value then return stored.result; end if;
    raise exception using errcode = 'P0001', message = 'idempotency_conflict';
  end if;

  if p_action <> 'retire' then
    perform 1 from public.student_code_settings s where s.academy_id = p_academy_id and s.enabled;
    if not found then raise exception using errcode = 'P0001', message = 'codes_disabled'; end if;
  end if;
  if holder.archived_at is not null then
    raise exception using errcode = 'P0001', message = 'archived_record';
  end if;

  select coalesce(max(st.version), 0) into current_version
  from public.student_code_states st where st.annual_student_record_id = p_record_id;
  if current_version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale_code';
  end if;
  select a.* into current_row from public.student_code_assignments a
  where a.annual_student_record_id = p_record_id and a.retired_at is null;

  if p_action = 'retire' then
    if current_row.id is null then raise exception using errcode = 'P0001', message = 'stale_code'; end if;
    update public.student_code_assignments
    set retired_at = now(), retired_by = actor, retirement_reason = 'manual'
    where id = current_row.id;
    issued := null;
  else
    if p_action = 'replace' and current_row.id is null then
      raise exception using errcode = 'P0001', message = 'stale_code';
    end if;
    if p_action <> 'replace' and current_row.id is not null then
      raise exception using errcode = 'P0001', message = 'code_exists';
    end if;
    if p_action in ('assign', 'replace') then
      pattern := public.student_code_effective_pattern(p_academy_id, holder.level_id);
      if pattern is null then raise exception using errcode = 'P0001', message = 'pattern_missing'; end if;
      code_prefix := public.student_code_pattern_prefix(pattern);
      code_width := public.student_code_pattern_width(pattern);
      if pg_catalog.left(normalized, pg_catalog.length(code_prefix)) <> code_prefix
        or pg_catalog.length(normalized) <> pg_catalog.length(code_prefix) + code_width
        or pg_catalog.translate(pg_catalog.substr(normalized, pg_catalog.length(code_prefix) + 1), '0123456789', '') <> '' then
        raise exception using errcode = 'P0001', message = 'invalid_format', hint = pattern;
      end if;
    end if;
    issued := case when p_action in ('assign', 'replace') then normalized
      else public.allocate_student_code(p_academy_id, holder.level_id) end;
    if p_action = 'replace' and normalized = current_row.code then
      raise exception using errcode = 'P0001', message = 'code_taken';
    end if;
    -- The old code is retired (and stays reserved) and the new one issued in this one transaction.
    if p_action = 'replace' then
      update public.student_code_assignments
      set retired_at = now(), retired_by = actor, retirement_reason = 'manual'
      where id = current_row.id;
    end if;
    begin
      insert into public.student_code_assignments (
        academy_id, academic_year_id, academy_student_profile_id, annual_student_record_id,
        level_id, code, code_version, issued_by
      ) values (
        p_academy_id, holder.academic_year_id, holder.academy_student_profile_id, holder.id,
        holder.level_id, issued, current_version + case when p_action = 'replace' then 2 else 1 end, actor
      );
    exception when unique_violation then
      raise exception using errcode = 'P0001', message = 'code_taken';
    end;
  end if;

  result := jsonb_build_object(
    'code', issued,
    'version', (select st.version from public.student_code_states st where st.annual_student_record_id = p_record_id)
  );
  insert into public.student_code_requests (academy_id, request_key, actor_id, fingerprint, result)
  values (p_academy_id, p_request_key, actor, fingerprint_value, result);
  return result;
end;
$$;

-- The next unissued value, skipping every issued string (released rows included). Reserves nothing.
create or replace function public.peek_next_student_code(p_academy_id uuid, p_record_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  holder public.annual_student_records%rowtype;
  pattern text;
  code_prefix text;
  code_width integer;
  capacity bigint;
  cursor_value bigint;
  candidate text;
begin
  if auth.uid() is null or p_academy_id is null or public.academy_role_for(p_academy_id) is null then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  select r.* into holder from public.annual_student_records r
  where r.id = p_record_id and r.academy_id = p_academy_id;
  if not found then raise exception using errcode = 'P0001', message = 'not_found'; end if;
  perform 1 from public.student_code_settings s where s.academy_id = p_academy_id and s.enabled;
  if not found then raise exception using errcode = 'P0001', message = 'codes_disabled'; end if;
  pattern := public.student_code_effective_pattern(p_academy_id, holder.level_id);
  if pattern is null then raise exception using errcode = 'P0001', message = 'pattern_missing'; end if;
  code_prefix := public.student_code_pattern_prefix(pattern);
  code_width := public.student_code_pattern_width(pattern);
  capacity := (10::numeric ^ code_width)::bigint - 1;
  select coalesce(max(c.last_value), 0) into cursor_value from public.student_code_counters c
  where c.academy_id = p_academy_id and c.prefix = code_prefix and c.width = code_width;
  loop
    cursor_value := cursor_value + 1;
    if cursor_value > capacity then
      raise exception using errcode = 'P0001', message = 'code_exhausted', hint = pattern;
    end if;
    candidate := code_prefix || pg_catalog.lpad(cursor_value::text, code_width, '0');
    exit when not exists (
      select 1 from public.student_code_reservations v where v.academy_id = p_academy_id and v.code = candidate
    );
  end loop;
  return candidate;
end;
$$;

-- Generation and allocation helpers skip strings found in the ledger; since the registry is a
-- superset of the ledger and every issue claims it, they agree. allocate_student_code and
-- student_code_next_free are left as they are.

-- The retired list now includes historically `released` rows: those strings are reserved too.
create or replace function public.list_retired_student_codes(
  p_academy_id uuid, p_search text, p_limit integer, p_offset integer
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  term text := nullif(pg_catalog.btrim(coalesce(p_search, '')), '');
  pattern text;
  result jsonb;
begin
  if auth.uid() is null or p_academy_id is null or public.academy_role_for(p_academy_id) is null then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 or p_offset is null or p_offset < 0 then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  if term is not null then
    pattern := '%' || pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(term, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  with matched as (
    select a.id, a.code, r.full_name, a.level_id, a.retirement_reason, a.retired_at
    from public.student_code_assignments a
    join public.annual_student_records r on r.id = a.annual_student_record_id and r.academy_id = a.academy_id
    where a.academy_id = p_academy_id
      and a.retired_at is not null
      and (pattern is null or a.code ilike pattern or r.full_name ilike pattern)
  )
  select jsonb_build_object(
    'total', (select count(*) from matched),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'code', m.code, 'studentName', m.full_name, 'levelId', m.level_id,
        'reason', m.retirement_reason, 'retiredAt', m.retired_at
      ) order by m.retired_at desc, m.id)
      from (select * from matched order by retired_at desc, id limit p_limit offset p_offset) m
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 2. Lifecycle retirement.

-- A real level change retires the record's active code. Runs in the same UPDATE; the record row is
-- already locked by it. No settings lock, so it works while codes are disabled.
create or replace function public.retire_student_code_on_level_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.student_code_assignments
  set retired_at = now(), retirement_reason = 'level_changed'
  where annual_student_record_id = new.id and retired_at is null;
  return null;
end;
$$;
revoke all on function public.retire_student_code_on_level_change() from public, anon, authenticated;
create trigger annual_student_records_retire_code after update of level_id on public.annual_student_records
for each row when (old.level_id is distinct from new.level_id)
execute function public.retire_student_code_on_level_change();

-- Closing a year retires its active codes; reopening never restores them and new annual records
-- receive no automatic code. Locks: year row (held by this UPDATE) then assignment/state rows.
create or replace function public.retire_student_codes_on_year_close()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.student_code_assignments a
  set retired_at = now(), retirement_reason = 'year_closed'
  where a.academic_year_id = new.id and a.academy_id = new.academy_id and a.retired_at is null;
  return null;
end;
$$;
revoke all on function public.retire_student_codes_on_year_close() from public, anon, authenticated;
create trigger academic_years_retire_codes after update of closed_at on public.academic_years
for each row when (old.closed_at is null and new.closed_at is not null)
execute function public.retire_student_codes_on_year_close();

-- ---------------------------------------------------------------------------------------------
-- 3. Code check-in.

alter table public.attendance_requests add column if not exists resolved jsonb;
comment on column public.attendance_requests.resolved is
  'Internal: the annual record and code assignment a code check-in originally resolved to.';

-- Shared check-in engine (the body of the former UUID command after replay): lifecycle, year,
-- roster, duplicate and review rules, write, revision, and the stored receipt. The caller holds the
-- session lock, has checked membership, and has handled replay.
create or replace function edra_private.apply_check_in(
  p_target public.sessions, p_record_id uuid, p_key uuid, p_fingerprint text
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  current_status public.attendance_status;
  outcome text;
  entry jsonb;
  revision integer;
begin
  if p_target.state <> 'live' then raise exception using errcode = 'P0001', message = 'session_ended'; end if;
  perform public.require_open_attendance_year(p_target);
  perform public.require_roster_student(p_target, p_record_id);

  select a.status into current_status from public.attendance_records a
  where a.session_id = p_target.id and a.annual_student_record_id = p_record_id;
  current_status := coalesce(current_status, 'unknown');

  if current_status in ('absent', 'excused') then
    outcome := 'review_required';
  elsif current_status in ('present', 'late') then
    outcome := 'already_recorded';
  else
    perform public.write_attendance(p_target, p_record_id, 'present', 'check_in', true);
    perform public.bump_attendance_revision(p_target);
    outcome := 'recorded';
  end if;

  entry := public.attendance_entry(p_target.id, p_record_id);
  revision := public.current_attendance_revision(p_target.id);
  if outcome = 'review_required' then
    return jsonb_build_object('outcome', outcome, 'entry', entry, 'revision', revision,
      'correction_pending', false, 'replayed', false);
  end if;
  return public.remember_attendance_request(p_key, 'check_in', p_target, p_fingerprint, jsonb_build_object(
    'outcome', outcome, 'entry', entry, 'revision', revision,
    'correction_pending', public.attendance_pending(p_target.id)
      and (entry->>'status') is distinct from coalesce(entry->>'published_status', 'unknown')
  ));
end;
$$;
revoke all on function edra_private.apply_check_in(public.sessions, uuid, uuid, text) from public, anon, authenticated;

-- The UUID command, unchanged in behavior and fingerprint, now on the shared engine.
create or replace function edra_private.check_in_attendance(
  p_academy_id uuid, p_session_id uuid, p_annual_record_id uuid, p_key uuid
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  target public.sessions%rowtype;
  fingerprint text := md5(jsonb_build_object('session', p_session_id, 'record', p_annual_record_id)::text);
  replay jsonb;
begin
  target := public.lock_attendance_session(p_academy_id, p_session_id);
  replay := public.attendance_replay(p_key, 'check_in', fingerprint);
  if replay is not null then return replay; end if;
  return edra_private.apply_check_in(target, p_annual_record_id, p_key, fingerprint);
end;
$$;
revoke all on function edra_private.check_in_attendance(uuid, uuid, uuid, uuid) from public, anon, authenticated;

create or replace function edra_private.check_in_attendance_by_code(
  p_academy_id uuid, p_session_id uuid, p_code text, p_key uuid, p_late_after_minutes integer
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  normalized text := public.normalize_student_code(p_code);
  late_after integer := coalesce(p_late_after_minutes, 0);
  codes_on boolean;
  target public.sessions%rowtype;
  fingerprint text;
  replay jsonb;
  holders integer;
  assignment public.student_code_assignments%rowtype;
  holder public.annual_student_records%rowtype;
  result jsonb;
begin
  if auth.uid() is null or p_academy_id is null or public.academy_role_for(p_academy_id) is null then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  if p_session_id is null or p_key is null or normalized is null or late_after < 0 or late_after > 1440 then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  -- The academy always comes from the session; a mismatch looks like a missing session.
  perform 1 from public.sessions s where s.id = p_session_id and s.academy_id = p_academy_id;
  if not found then raise exception using errcode = 'P0001', message = 'not_found'; end if;

  -- Rank 1: settings row (share), so saving/disabling waits for in-flight scans and vice versa.
  select s.enabled into codes_on from public.student_code_settings s where s.academy_id = p_academy_id for share;
  codes_on := coalesce(codes_on, false);

  -- Rank 2: the attendance session.
  target := public.lock_attendance_session(p_academy_id, p_session_id);

  fingerprint := md5(jsonb_build_object(
    'session', p_session_id, 'identifier', 'student_code', 'code', normalized, 'late_after', late_after)::text);
  replay := public.attendance_replay(p_key, 'check_in', fingerprint);
  if replay is not null then return replay; end if;

  if not codes_on then raise exception using errcode = 'P0001', message = 'student_codes_disabled'; end if;
  if target.state <> 'live' then raise exception using errcode = 'P0001', message = 'session_ended'; end if;

  -- A string issued to different students is ambiguous for an old physical card: never guess.
  select count(distinct a.academy_student_profile_id) into holders from public.student_code_assignments a
  where a.academy_id = p_academy_id and a.code = normalized;
  if holders = 0 then raise exception using errcode = 'P0001', message = 'student_code_not_found'; end if;
  if holders > 1 then raise exception using errcode = 'P0001', message = 'student_code_ambiguous'; end if;

  select a.* into assignment from public.student_code_assignments a
  where a.academy_id = p_academy_id and a.code = normalized and a.retired_at is null;
  if not found then raise exception using errcode = 'P0001', message = 'student_code_retired'; end if;

  -- Rank 3: the record, shared. Retirement, replacement, and level edits take it exclusively, so
  -- after this lock the assignment is revalidated against committed state.
  select r.* into holder from public.annual_student_records r
  where r.id = assignment.annual_student_record_id and r.academy_id = p_academy_id for share;
  select a.* into assignment from public.student_code_assignments a where a.id = assignment.id;
  if not found or assignment.retired_at is not null or holder.id is null
    or holder.archived_at is not null or holder.level_id <> assignment.level_id
    or holder.academic_year_id <> assignment.academic_year_id
    or holder.academic_year_id <> target.academic_year_id then
    raise exception using errcode = 'P0001', message = 'student_code_retired';
  end if;

  -- Rank 4 (year, share), roster, duplicate and review rules: the shared engine.
  result := edra_private.apply_check_in(target, holder.id, p_key, fingerprint);
  if result->>'outcome' <> 'review_required' then
    update public.attendance_requests
    set resolved = jsonb_build_object('annual_student_record_id', holder.id, 'assignment_id', assignment.id)
    where actor_id = auth.uid() and idempotency_key = p_key;
  end if;
  return result;
end;
$$;
revoke all on function edra_private.check_in_attendance_by_code(uuid, uuid, text, uuid, integer) from public, anon, authenticated;

-- Public wrapper: charges the check-in quota once (the private engine never charges).
create function public.check_in_attendance_by_code(
  p_academy_id uuid, p_session_id uuid, p_code text, p_key uuid, p_late_after_minutes integer default null
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform edra_private.charge_mutation_quota('op:attendance_check_in');
  return edra_private.check_in_attendance_by_code(p_academy_id, p_session_id, p_code, p_key, p_late_after_minutes);
end;
$$;
revoke all on function public.check_in_attendance_by_code(uuid, uuid, text, uuid, integer) from public, anon;
grant execute on function public.check_in_attendance_by_code(uuid, uuid, text, uuid, integer) to authenticated;
