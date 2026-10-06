-- Optional academy student codes: configuration and the integrity foundation of the code ledger.
--
-- A student code is an extra, human-readable identifier for an annual student record. It never
-- replaces the permanent profile/record UUIDs. Codes are disabled by default; an academy without a
-- settings row is disabled. This slice stores configuration, level overrides, allocation cursors,
-- and the assignment ledger with its invariants. It issues no code: individual assignment,
-- generation, lifecycle retirement hooks, and check-ins belong to later slices.
--
-- Grammar (mirrored by src/modules/students/codes/pattern.ts):
--   * Text is outer-trimmed (ASCII space, tab, LF, VT, FF, CR), then must contain only
--     [A-Za-z0-9-] (formulas also '#'); ASCII letters are uppercased. Digits, including leading
--     zeroes, are preserved as written. Codes are strings, never numbers.
--   * Formula: a literal prefix of 0-12 [A-Z0-9-] characters followed by one trailing block of 1-8
--     '#'. '####' -> prefix '', width 4; 'ST2###' -> prefix 'ST2', width 3. Values allocate from 1
--     to 10^width - 1 and then fail (code_exhausted).
--   * Code (manual or generated): 1-20 [A-Z0-9-] characters.
--
-- Errors raised for the application use SQLSTATE P0001 with a stable code as the message.
--
-- Lock protocol (every code operation in later slices must follow it; ranks are acquired in order):
--   1. Settings row  public.student_code_settings  (one academy)
--        - settings save / disable / enable:  FOR UPDATE, and nothing after it.
--        - issuance, manual retirement, generation, code check-in:  FOR SHARE, taken first.
--   2. Attendance session row (code check-in only; FOR NO KEY UPDATE as in lock_attendance_session).
--   3. Annual student records  FOR UPDATE, in ascending id order for batches.
--   4. Academic year row  FOR SHARE (validate_student_record_write and the ledger triggers below).
--   5. Code state rows (student_code_states), touched by the ledger triggers, per record.
--   6. Allocation counters (student_code_counters), in ascending (prefix, width) order.
-- Lifecycle retirement (level change, year close) runs inside existing student/year operations
-- that already hold record or year locks. It must never take the settings lock: it works while the
-- feature is disabled and therefore never waits on settings. Settings writers take no other row
-- lock, so neither record<->settings nor session<->settings can form a cycle. The existing student
-- RPCs (record -> year -> group) are unchanged.

-- ---------------------------------------------------------------------------------------------
-- Grammar helpers (immutable, shared by constraints and RPCs).

-- Outer-trims ASCII whitespace and uppercases ASCII letters; NULL when any other character remains.
create or replace function public.normalize_student_code_text(value text, allow_hash boolean)
returns text language plpgsql immutable set search_path = '' as $$
declare
  blank constant text := chr(32) || chr(9) || chr(10) || chr(11) || chr(12) || chr(13);
  trimmed text;
begin
  if value is null then return null; end if;
  trimmed := pg_catalog.btrim(value, blank);
  if allow_hash then
    if trimmed !~ '^[A-Za-z0-9#-]+$' then return null; end if;
  elsif trimmed !~ '^[A-Za-z0-9-]+$' then
    return null;
  end if;
  return pg_catalog.translate(trimmed, 'abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
end;
$$;

-- Canonical code, or NULL when the value is not an acceptable code.
create or replace function public.normalize_student_code(value text)
returns text language sql immutable set search_path = '' as $$
  select case when char_length(c) between 1 and 20 then c end
  from (select public.normalize_student_code_text(value, false) as c) n;
$$;

-- Canonical formula, or NULL when the value is not an acceptable formula.
create or replace function public.normalize_student_code_pattern(value text)
returns text language sql immutable set search_path = '' as $$
  select case when p ~ '^[A-Z0-9-]{0,12}#{1,8}$' then p end
  from (select public.normalize_student_code_text(value, true) as p) n;
$$;

create or replace function public.student_code_pattern_prefix(pattern text)
returns text language sql immutable set search_path = '' as $$
  select pg_catalog.rtrim(pattern, '#');
$$;

create or replace function public.student_code_pattern_width(pattern text)
returns integer language sql immutable set search_path = '' as $$
  select char_length(pattern) - char_length(pg_catalog.rtrim(pattern, '#'));
$$;

-- ---------------------------------------------------------------------------------------------
-- Configuration.

create table public.student_code_settings (
  academy_id uuid primary key references public.academies (id) on delete cascade,
  enabled boolean not null default false,
  -- Draft formula; may be empty only while disabled.
  default_pattern text check (default_pattern is null or default_pattern = public.normalize_student_code_pattern(default_pattern)),
  -- Monotonic configuration version. A missing row is version 0.
  version integer not null default 1 check (version >= 1),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles (id),
  constraint student_code_settings_enabled_pattern check (not enabled or default_pattern is not null)
);

create table public.student_code_level_patterns (
  academy_id uuid not null references public.student_code_settings (academy_id) on delete cascade,
  level_id text not null,
  pattern text not null check (pattern = public.normalize_student_code_pattern(pattern)),
  primary key (academy_id, level_id),
  foreign key (academy_id, level_id) references public.academy_levels (academy_id, level_id)
);

-- Highest value handed out per academy formula. Never reset: disabling or editing formulas leaves
-- every cursor in place, and returning to a formula resumes after its previous highest value.
create table public.student_code_counters (
  academy_id uuid not null references public.academies (id) on delete cascade,
  prefix text not null check (prefix ~ '^[A-Z0-9-]{0,12}$'),
  width smallint not null check (width between 1 and 8),
  last_value bigint not null default 0 check (last_value >= 0 and last_value < 10::numeric ^ width),
  primary key (academy_id, prefix, width)
);

-- ---------------------------------------------------------------------------------------------
-- Ledger.

create type public.student_code_retirement_reason as enum ('manual', 'level_changed', 'year_closed');

alter table public.annual_student_records
  add constraint annual_student_records_identity_unique unique (id, academy_id, academic_year_id, academy_student_profile_id);

-- Every code ever issued. Rows are never deleted or retargeted; the only permitted change is the
-- one-way retirement of a current code.
create table public.student_code_assignments (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null,
  academic_year_id uuid not null,
  academy_student_profile_id uuid not null,
  annual_student_record_id uuid not null,
  -- The record's level when the code was issued.
  level_id text not null,
  code text not null check (code = public.normalize_student_code(code)),
  -- The record's code-state version this issuance produced.
  code_version integer not null check (code_version >= 1),
  issued_at timestamptz not null default now(),
  issued_by uuid not null references public.profiles (id),
  retired_at timestamptz,
  retired_by uuid references public.profiles (id),
  retirement_reason public.student_code_retirement_reason,
  -- Issued values stay reserved forever, including retired ones.
  constraint student_code_assignments_code_unique unique (academy_id, code),
  constraint student_code_assignments_record_version_unique unique (annual_student_record_id, code_version),
  unique (id, annual_student_record_id),
  constraint student_code_assignments_retirement check (
    (retired_at is null) = (retirement_reason is null)
    and (retired_at is not null or retired_by is null)
    and (retirement_reason is distinct from 'manual' or retired_by is not null)
  ),
  foreign key (annual_student_record_id, academy_id, academic_year_id, academy_student_profile_id)
    references public.annual_student_records (id, academy_id, academic_year_id, academy_student_profile_id),
  foreign key (academy_id, academy_student_profile_id)
    references public.academy_student_profiles (academy_id, id),
  foreign key (academy_id, level_id) references public.academy_levels (academy_id, level_id)
);

create unique index student_code_assignments_one_current
  on public.student_code_assignments (annual_student_record_id) where retired_at is null;
create index student_code_assignments_profile_idx
  on public.student_code_assignments (academy_student_profile_id);

-- Current pointer and monotonic code-state version per annual record. A record without a row has
-- never held a code (version 0). Every issuance and retirement increments the version, so a form
-- loaded before a retirement can never pass a version check after a later issuance.
-- Maintained only by the ledger triggers.
create table public.student_code_states (
  annual_student_record_id uuid primary key references public.annual_student_records (id),
  academy_id uuid not null references public.academies (id),
  version integer not null check (version >= 1),
  current_assignment_id uuid,
  updated_at timestamptz not null default now(),
  unique (current_assignment_id),
  foreign key (current_assignment_id, annual_student_record_id)
    references public.student_code_assignments (id, annual_student_record_id)
);

-- Issuance invariants: the feature is enabled, the record is active in the open year and at the
-- stated level, and the record's code state advances to the version stored on the assignment.
create or replace function public.validate_student_code_issue()
returns trigger language plpgsql set search_path = '' as $$
declare
  holder public.annual_student_records%rowtype;
  next_version integer;
begin
  if new.retired_at is not null or new.retired_by is not null or new.retirement_reason is not null then
    raise exception using errcode = 'P0001', message = 'validation', hint = 'New codes start current.';
  end if;
  -- Rank 1. Callers normally hold this already; a share lock never conflicts with another issuer.
  perform 1 from public.student_code_settings s
  where s.academy_id = new.academy_id and s.enabled
  for share;
  if not found then raise exception using errcode = 'P0001', message = 'codes_disabled'; end if;

  -- Rank 3 (callers that need to serialize with student edits lock the record FOR UPDATE first).
  select r.* into holder from public.annual_student_records r
  where r.id = new.annual_student_record_id and r.academy_id = new.academy_id
  for share;
  if not found then raise exception using errcode = 'P0001', message = 'not_found'; end if;
  if holder.archived_at is not null then
    raise exception using errcode = 'P0001', message = 'archived_record';
  end if;
  if holder.level_id <> new.level_id then
    raise exception using errcode = 'P0001', message = 'level_mismatch';
  end if;

  -- Rank 4. Closed or foreign years never receive codes.
  perform 1 from public.academic_years y
  where y.id = holder.academic_year_id and y.academy_id = new.academy_id and y.closed_at is null
  for share;
  if not found or holder.academic_year_id <> new.academic_year_id then
    raise exception using errcode = 'P0001', message = 'year_unavailable';
  end if;

  if exists (
    select 1 from public.student_code_assignments a
    where a.annual_student_record_id = new.annual_student_record_id and a.retired_at is null
  ) then
    raise exception using errcode = 'P0001', message = 'code_exists', hint = 'Retire the current code first.';
  end if;

  -- Rank 5.
  insert into public.student_code_states as st (annual_student_record_id, academy_id, version)
  values (new.annual_student_record_id, new.academy_id, 1)
  on conflict (annual_student_record_id) do update set version = st.version + 1, updated_at = now()
  returning st.version into next_version;
  if new.code_version is distinct from next_version then
    raise exception using errcode = 'P0001', message = 'stale_code',
      hint = 'The assignment must carry the next code-state version.';
  end if;
  new.issued_at := now();
  return new;
end;
$$;

create or replace function public.link_student_code_issue()
returns trigger language plpgsql set search_path = '' as $$
begin
  update public.student_code_states set current_assignment_id = new.id
  where annual_student_record_id = new.annual_student_record_id;
  return null;
end;
$$;

-- History is append-only: only current -> retired is allowed, once, and it advances the state.
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

create trigger student_code_assignments_issue before insert on public.student_code_assignments
for each row execute function public.validate_student_code_issue();
create trigger student_code_assignments_link after insert on public.student_code_assignments
for each row execute function public.link_student_code_issue();
create trigger student_code_assignments_protect before update or delete on public.student_code_assignments
for each row execute function public.protect_student_code_assignment();

-- The state row follows the ledger: its version never decreases and its pointer only names that
-- record's current assignment.
create or replace function public.protect_student_code_state()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'code_history', hint = 'Code state cannot be deleted.';
  end if;
  if new.annual_student_record_id <> old.annual_student_record_id or new.academy_id <> old.academy_id
    or new.version < old.version then
    raise exception using errcode = 'P0001', message = 'code_history', hint = 'Code state is monotonic.';
  end if;
  if new.current_assignment_id is not null and not exists (
    select 1 from public.student_code_assignments a
    where a.id = new.current_assignment_id and a.retired_at is null and a.code_version = new.version
  ) then
    raise exception using errcode = 'P0001', message = 'code_history', hint = 'The current code must be the latest issue.';
  end if;
  return new;
end;
$$;

create trigger student_code_states_protect before update or delete on public.student_code_states
for each row execute function public.protect_student_code_state();

-- ---------------------------------------------------------------------------------------------
-- Access. Staff read through RLS; nobody writes directly. Settings change only through
-- save_student_code_settings; ledger writes arrive with the issuance slices.

alter table public.student_code_settings enable row level security;
alter table public.student_code_level_patterns enable row level security;
alter table public.student_code_counters enable row level security;
alter table public.student_code_assignments enable row level security;
alter table public.student_code_states enable row level security;

revoke all on public.student_code_settings, public.student_code_level_patterns, public.student_code_counters,
  public.student_code_assignments, public.student_code_states from public, anon, authenticated;
grant select on public.student_code_settings, public.student_code_level_patterns,
  public.student_code_assignments, public.student_code_states to authenticated;

create policy student_code_settings_select_staff on public.student_code_settings
  for select to authenticated using (public.academy_role_for(academy_id) is not null);
create policy student_code_level_patterns_select_staff on public.student_code_level_patterns
  for select to authenticated using (public.academy_role_for(academy_id) is not null);
create policy student_code_assignments_select_staff on public.student_code_assignments
  for select to authenticated using (public.academy_role_for(academy_id) is not null);
create policy student_code_states_select_staff on public.student_code_states
  for select to authenticated using (public.academy_role_for(academy_id) is not null);

-- ---------------------------------------------------------------------------------------------
-- Reads (caller authority; RLS applies).

-- The academy's configuration: { enabled, defaultPattern, version, levels: [{ levelId, pattern }] }.
-- A missing row reads as disabled at version 0.
create or replace function public.get_student_code_settings(p_academy_id uuid)
returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  s public.student_code_settings%rowtype;
begin
  if auth.uid() is null or p_academy_id is null or public.academy_role_for(p_academy_id) is null then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  select * into s from public.student_code_settings where academy_id = p_academy_id;
  return jsonb_build_object(
    'enabled', coalesce(s.enabled, false),
    'defaultPattern', s.default_pattern,
    'version', coalesce(s.version, 0),
    'levels', coalesce((
      select jsonb_agg(jsonb_build_object('levelId', p.level_id, 'pattern', p.pattern) order by al.sort_order)
      from public.student_code_level_patterns p
      join public.academy_levels al on al.academy_id = p.academy_id and al.level_id = p.level_id
      where p.academy_id = p_academy_id
    ), '[]'::jsonb)
  );
end;
$$;

-- The formula that applies to a level: its override, otherwise the academy default. NULL when
-- neither exists. Does not check enablement.
create or replace function public.student_code_effective_pattern(p_academy_id uuid, p_level_id text)
returns text
language sql stable security invoker set search_path = '' as $$
  select coalesce(
    (select p.pattern from public.student_code_level_patterns p
     where p.academy_id = p_academy_id and p.level_id = p_level_id),
    (select s.default_pattern from public.student_code_settings s where s.academy_id = p_academy_id)
  );
$$;

-- A record's current code (or null) and code-state version (0 when it never held a code).
create or replace function public.get_student_code_state(p_academy_id uuid, p_record_id uuid)
returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  result jsonb;
begin
  if auth.uid() is null or p_academy_id is null or public.academy_role_for(p_academy_id) is null then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  if not exists (
    select 1 from public.annual_student_records r where r.id = p_record_id and r.academy_id = p_academy_id
  ) then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  select jsonb_build_object('code', a.code, 'version', st.version) into result
  from public.student_code_states st
  left join public.student_code_assignments a on a.id = st.current_assignment_id
  where st.annual_student_record_id = p_record_id and st.academy_id = p_academy_id;
  return coalesce(result, jsonb_build_object('code', null, 'version', 0));
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Prospective allocation (internal; for the generation slice's definer RPCs only).
-- Returns the next unissued code for the level's effective formula and advances that formula's
-- cursor. The caller must hold the settings row FOR SHARE (rank 1) and insert the assignment in the
-- same transaction; a rollback releases the value. Values already taken by any issued code (for
-- example through an overlapping formula or a manual code) are skipped.
create or replace function public.allocate_student_code(p_academy_id uuid, p_level_id text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  pattern text;
  code_prefix text;
  code_width integer;
  capacity bigint;
  cursor_value bigint;
  candidate text;
begin
  perform 1 from public.student_code_settings s where s.academy_id = p_academy_id and s.enabled for share;
  if not found then raise exception using errcode = 'P0001', message = 'codes_disabled'; end if;
  pattern := public.student_code_effective_pattern(p_academy_id, p_level_id);
  if pattern is null then raise exception using errcode = 'P0001', message = 'pattern_missing'; end if;
  code_prefix := public.student_code_pattern_prefix(pattern);
  code_width := public.student_code_pattern_width(pattern);
  capacity := (10::numeric ^ code_width)::bigint - 1;

  insert into public.student_code_counters (academy_id, prefix, width)
  values (p_academy_id, code_prefix, code_width)
  on conflict do nothing;
  select c.last_value into cursor_value from public.student_code_counters c
  where c.academy_id = p_academy_id and c.prefix = code_prefix and c.width = code_width
  for update;

  loop
    cursor_value := cursor_value + 1;
    if cursor_value > capacity then
      raise exception using errcode = 'P0001', message = 'code_exhausted', hint = pattern;
    end if;
    candidate := code_prefix || pg_catalog.lpad(cursor_value::text, code_width, '0');
    exit when not exists (
      select 1 from public.student_code_assignments a where a.academy_id = p_academy_id and a.code = candidate
    );
  end loop;

  update public.student_code_counters set last_value = cursor_value
  where academy_id = p_academy_id and prefix = code_prefix and width = code_width;
  return candidate;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Settings write.

-- Replaces the academy's configuration atomically when p_expected_version is still current (0 for
-- an academy without settings). p_levels is [{ "levelId": text, "pattern": text }, ...] and
-- replaces every override. Owner/Admin only. Keeps assignments, counters, and history untouched,
-- including on disable. Returns { version }.
-- Definer because it validates and replaces several rows under one lock; authenticated users have
-- no direct write privilege on these tables.
create or replace function public.save_student_code_settings(
  p_academy_id uuid, p_expected_version integer, p_enabled boolean, p_default_pattern text, p_levels jsonb
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
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
    or coalesce(public.academy_role_for(p_academy_id)::text, '') not in ('owner', 'admin') then
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
  if p_enabled and pattern_value is null then
    raise exception using errcode = 'P0001', message = 'validation', hint = 'default_pattern';
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
$$;

-- ---------------------------------------------------------------------------------------------
-- Function privileges.

revoke all on function public.normalize_student_code_text(text, boolean) from public, anon;
revoke all on function public.normalize_student_code(text) from public, anon;
revoke all on function public.normalize_student_code_pattern(text) from public, anon;
revoke all on function public.student_code_pattern_prefix(text) from public, anon;
revoke all on function public.student_code_pattern_width(text) from public, anon;
revoke all on function public.validate_student_code_issue() from public, anon, authenticated;
revoke all on function public.link_student_code_issue() from public, anon, authenticated;
revoke all on function public.protect_student_code_assignment() from public, anon, authenticated;
revoke all on function public.protect_student_code_state() from public, anon, authenticated;
revoke all on function public.get_student_code_settings(uuid) from public, anon;
revoke all on function public.student_code_effective_pattern(uuid, text) from public, anon;
revoke all on function public.get_student_code_state(uuid, uuid) from public, anon;
revoke all on function public.allocate_student_code(uuid, text) from public, anon, authenticated;
revoke all on function public.save_student_code_settings(uuid, integer, boolean, text, jsonb) from public, anon;

grant execute on function public.normalize_student_code_text(text, boolean) to authenticated;
grant execute on function public.normalize_student_code(text) to authenticated;
grant execute on function public.normalize_student_code_pattern(text) to authenticated;
grant execute on function public.student_code_pattern_prefix(text) to authenticated;
grant execute on function public.student_code_pattern_width(text) to authenticated;
grant execute on function public.get_student_code_settings(uuid) to authenticated;
grant execute on function public.student_code_effective_pattern(uuid, text) to authenticated;
grant execute on function public.get_student_code_state(uuid, uuid) to authenticated;
grant execute on function public.save_student_code_settings(uuid, integer, boolean, text, jsonb) to authenticated;
