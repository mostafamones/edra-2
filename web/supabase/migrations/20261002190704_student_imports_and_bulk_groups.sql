-- Student importing and bulk group changes.
--
-- An import session stages one parsed file's mapped rows, resolves and validates them against the
-- academy's structure and existing records, lets staff correct or exclude rows, and then creates the
-- Ready rows in immutable batches of 100 through create_student_record. Importing only creates
-- records: an existing student phone (active or archived) is skipped, never updated or restored.
--
-- Only owners and admins import or change groups in bulk. Clients read sessions and rows through
-- RLS; every write goes through the RPCs below, which check the caller's role and the open year.
-- Validation statuses and counts are always computed here, never accepted from the client.
-- Errors raised for the application use SQLSTATE P0001 with a stable code as the message.

create type public.student_import_format as enum ('csv', 'json', 'xlsx');
create type public.student_import_state as enum ('staging', 'reviewing', 'importing', 'completed', 'cancelled', 'blocked');

create table public.student_import_sessions (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null,
  academic_year_id uuid not null,
  created_by uuid not null references public.profiles (id),
  file_name text not null check (char_length(file_name) between 1 and 255),
  format public.student_import_format not null,
  worksheet text check (worksheet is null or char_length(worksheet) between 1 and 255),
  expected_rows integer not null check (expected_rows between 1 and 5000),
  -- Level, track, group, and student type applied where a row leaves them blank. Fixed per session:
  -- changing them starts a replacement session.
  defaults jsonb not null default '{}'::jsonb check (jsonb_typeof(defaults) = 'object'),
  state public.student_import_state not null default 'staging',
  -- Bumped by every change to the reviewed outcome; corrections and confirmation must name it.
  revision integer not null default 1 check (revision >= 1),
  staged_rows integer not null default 0 check (staged_rows >= 0),
  batch_count integer check (batch_count >= 0),
  created_count integer not null default 0 check (created_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  blocked_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  completed_at timestamptz,
  unique (academy_id, id),
  foreign key (academy_id, academic_year_id) references public.academic_years (academy_id, id)
);

create index student_import_sessions_owner_idx
  on public.student_import_sessions (academy_id, created_by, created_at desc);

create table public.student_import_rows (
  session_id uuid not null,
  academy_id uuid not null,
  ordinal integer not null check (ordinal between 1 and 5000),
  -- Where the row came from: the CSV record number, JSON array position, or worksheet row number.
  source_row integer not null check (source_row >= 0),
  -- Mapped source values by canonical field: a string, JSON null (an explicit empty value), or
  -- {"problem": kind} for a cell that cannot be imported. Absent keys were blank.
  source jsonb not null check (jsonb_typeof(source) = 'object'),
  -- Staff corrections, in resolved form; replaces `source` for validation when present.
  corrected jsonb check (corrected is null or jsonb_typeof(corrected) = 'object'),
  -- The resolved, normalized create_student_record input and the field issues that block it.
  input jsonb,
  student_phone text,
  issues jsonb not null default '[]'::jsonb check (jsonb_typeof(issues) = 'array'),
  excluded boolean not null default false,
  status text not null default 'invalid'
    check (status in ('ready', 'invalid', 'duplicate_existing', 'duplicate_file', 'excluded')),
  existing_record_id uuid,
  existing_archived boolean,
  -- Other included source rows sharing this row's student phone.
  duplicate_rows integer[],
  batch_index integer check (batch_index >= 0),
  outcome text check (outcome in ('pending', 'created', 'skipped', 'failed')),
  outcome_code text,
  record_id uuid references public.annual_student_records (id),
  primary key (session_id, ordinal),
  foreign key (academy_id, session_id) references public.student_import_sessions (academy_id, id) on delete cascade
);

create index student_import_rows_batch_idx on public.student_import_rows (session_id, batch_index) where batch_index is not null;
create index student_import_rows_phone_idx on public.student_import_rows (session_id, student_phone);

alter table public.student_import_sessions enable row level security;
alter table public.student_import_rows enable row level security;
revoke all on public.student_import_sessions, public.student_import_rows from public, anon, authenticated;
grant select on public.student_import_sessions, public.student_import_rows to authenticated;

create policy student_import_sessions_select_managers on public.student_import_sessions
  for select to authenticated using (coalesce(public.academy_role_for(academy_id)::text, '') in ('owner', 'admin'));
create policy student_import_rows_select_managers on public.student_import_rows
  for select to authenticated using (coalesce(public.academy_role_for(academy_id)::text, '') in ('owner', 'admin'));

-- Reference-name normalization: trims, applies Unicode NFKC, case-folds, and collapses spaces.
create or replace function public.normalize_import_label(value text)
returns text language sql immutable set search_path = '' as $$
  select nullif(pg_catalog.lower(pg_catalog.regexp_replace(
    pg_catalog.btrim(pg_catalog.normalize(value, 'NFKC')), '\s+', ' ', 'g')), '');
$$;

-- A mapped cell's trimmed text, or NULL when it is blank, JSON null, or not a string.
create or replace function public.student_import_cell(cells jsonb, field text)
returns text language sql immutable set search_path = '' as $$
  select case when pg_catalog.jsonb_typeof(cells -> field) = 'string'
    then nullif(pg_catalog.btrim(cells ->> field), '') end;
$$;

-- Resolves one staged row against the academy's levels, tracks, active groups, and the session
-- defaults. Explicit values win; defaults fill blanks only where compatible. Corrections carry
-- resolved ids and use no defaults. Returns the create_student_record input (null fields where
-- unresolved), the normalized student phone (kept even when other fields fail, for duplicate
-- detection), and the field issues.
create or replace function public.resolve_student_import_row(
  p_academy_id uuid, p_academic_year_id uuid, p_defaults jsonb, p_source jsonb, p_corrected jsonb,
  out input jsonb, out normalized_phone text, out issues jsonb
) language plpgsql stable set search_path = '' as $$
declare
  use_defaults boolean := p_corrected is null;
  cells jsonb;
  problems text[] := '{}';
  item record;
  raw text;
  label text;
  v_full_name text;
  v_parent_phone text;
  v_level_id text;
  v_track_id uuid;
  v_group_id uuid;
  v_type text;
  has_tracks boolean := false;
  matches text[];
  d_level text := nullif(p_defaults ->> 'level_id', '');
  d_track text := nullif(p_defaults ->> 'track_id', '');
  d_group text := nullif(p_defaults ->> 'primary_group_id', '');
  d_type text := nullif(p_defaults ->> 'participation_type', '');
begin
  issues := '[]'::jsonb;
  if use_defaults then
    cells := coalesce(p_source, '{}'::jsonb);
  else
    cells := pg_catalog.jsonb_build_object(
      'full_name', p_corrected -> 'full_name',
      'student_phone', p_corrected -> 'student_phone',
      'parent_phone', p_corrected -> 'parent_phone',
      'level', p_corrected -> 'level_id',
      'group', coalesce(p_corrected -> 'primary_group_id', 'null'::jsonb),
      'student_type', p_corrected -> 'participation_type')
      || case when p_corrected ->> 'track_id' is not null
        then pg_catalog.jsonb_build_object('track', p_corrected -> 'track_id') else '{}'::jsonb end;
  end if;

  -- Cells the parser could not read as plain values (formulas, dates, nested values, …).
  for item in select e.key, e.value from pg_catalog.jsonb_each(cells) e
    where pg_catalog.jsonb_typeof(e.value) not in ('string', 'null') loop
    problems := problems || item.key;
    issues := issues || pg_catalog.jsonb_build_object('field', item.key, 'code', 'unsupported',
      'detail', coalesce(item.value ->> 'problem', 'unsupported'));
  end loop;

  -- Name and phones are always required from the row.
  v_full_name := public.student_import_cell(cells, 'full_name');
  if v_full_name is null then
    if not 'full_name' = any(problems) then
      issues := issues || '{"field": "full_name", "code": "required"}'::jsonb;
    end if;
  elsif char_length(v_full_name) > 200 then
    issues := issues || '{"field": "full_name", "code": "too_long"}'::jsonb;
  end if;

  raw := public.student_import_cell(cells, 'student_phone');
  normalized_phone := public.normalize_egyptian_phone(raw);
  if raw is null and not 'student_phone' = any(problems) then
    issues := issues || '{"field": "student_phone", "code": "required"}'::jsonb;
  elsif raw is not null and normalized_phone is null then
    issues := issues || '{"field": "student_phone", "code": "invalid_phone"}'::jsonb;
  end if;

  raw := public.student_import_cell(cells, 'parent_phone');
  v_parent_phone := public.normalize_egyptian_phone(raw);
  if raw is null and not 'parent_phone' = any(problems) then
    issues := issues || '{"field": "parent_phone", "code": "required"}'::jsonb;
  elsif raw is not null and v_parent_phone is null then
    issues := issues || '{"field": "parent_phone", "code": "invalid_phone"}'::jsonb;
  end if;

  -- Level: the academy's level code, else its exact normalized display name; else the default.
  raw := public.student_import_cell(cells, 'level');
  if raw is not null then
    label := public.normalize_import_label(raw);
    select pg_catalog.array_agg(al.level_id) into matches from public.academy_levels al
    where al.academy_id = p_academy_id and public.normalize_import_label(al.level_id) = label;
    if coalesce(cardinality(matches), 0) = 0 then
      select pg_catalog.array_agg(al.level_id) into matches from public.academy_levels al
      join public.global_levels gl on gl.id = al.level_id
      where al.academy_id = p_academy_id and public.normalize_import_label(gl.name) = label;
    end if;
    if cardinality(matches) = 1 then v_level_id := matches[1];
    else
      issues := issues || pg_catalog.jsonb_build_object('field', 'level',
        'code', case when cardinality(matches) > 1 then 'ambiguous' else 'unknown' end);
    end if;
  elsif not 'level' = any(problems) then
    if use_defaults and d_level is not null
      and exists (select 1 from public.academy_levels al where al.academy_id = p_academy_id and al.level_id = d_level) then
      v_level_id := d_level;
    else
      issues := issues || '{"field": "level", "code": "required"}'::jsonb;
    end if;
  end if;

  -- Track: only within the resolved level. Required exactly when the level has tracks.
  if v_level_id is not null then
    has_tracks := exists (select 1 from public.academy_tracks t where t.academy_id = p_academy_id and t.level_id = v_level_id);
    raw := public.student_import_cell(cells, 'track');
    if raw is not null then
      if not has_tracks then
        issues := issues || '{"field": "track", "code": "not_offered"}'::jsonb;
      else
        label := public.normalize_import_label(raw);
        select pg_catalog.array_agg(t.id::text) into matches from public.academy_tracks t
        where t.academy_id = p_academy_id and t.level_id = v_level_id and t.id::text = label;
        if coalesce(cardinality(matches), 0) = 0 then
          select pg_catalog.array_agg(t.id::text) into matches from public.academy_tracks t
          where t.academy_id = p_academy_id and t.level_id = v_level_id and public.normalize_import_label(t.name) = label;
        end if;
        if cardinality(matches) = 1 then v_track_id := matches[1]::uuid;
        else
          issues := issues || pg_catalog.jsonb_build_object('field', 'track',
            'code', case when cardinality(matches) > 1 then 'ambiguous' else 'unknown' end);
        end if;
      end if;
    elsif has_tracks and not 'track' = any(problems) then
      if use_defaults and d_track is not null and exists (
        select 1 from public.academy_tracks t
        where t.academy_id = p_academy_id and t.level_id = v_level_id and t.id::text = d_track
      ) then
        v_track_id := d_track::uuid;
      else
        issues := issues || '{"field": "track", "code": "required"}'::jsonb;
      end if;
    end if;
  end if;

  -- Group: optional. JSON null and "Unassigned"/"none" are an explicit empty assignment; a blank
  -- cell takes the default group only when it matches the row's placement.
  if v_level_id is not null and (not has_tracks or v_track_id is not null) and not 'group' = any(problems) then
    raw := public.student_import_cell(cells, 'group');
    label := public.normalize_import_label(raw);
    if pg_catalog.jsonb_typeof(cells -> 'group') = 'null'
      or label in ('unassigned', 'none', 'no group', '-', '—', 'بدون', 'بدون مجموعة', 'لا يوجد', 'غير محدد') then
      v_group_id := null;
    elsif raw is not null then
      select pg_catalog.array_agg(g.id::text) into matches from public.groups g
      where g.academy_id = p_academy_id and g.academic_year_id = p_academic_year_id and g.archived_at is null
        and g.level_id = v_level_id and g.track_id is not distinct from v_track_id and g.id::text = label;
      if coalesce(cardinality(matches), 0) = 0 then
        select pg_catalog.array_agg(g.id::text) into matches from public.groups g
        where g.academy_id = p_academy_id and g.academic_year_id = p_academic_year_id and g.archived_at is null
          and g.level_id = v_level_id and g.track_id is not distinct from v_track_id
          and public.normalize_import_label(g.name) = label;
      end if;
      if cardinality(matches) = 1 then v_group_id := matches[1]::uuid;
      elsif cardinality(matches) > 1 then
        issues := issues || '{"field": "group", "code": "ambiguous"}'::jsonb;
      elsif exists (
        select 1 from public.groups g
        where g.academy_id = p_academy_id and g.academic_year_id = p_academic_year_id and g.archived_at is null
          and (g.id::text = label or public.normalize_import_label(g.name) = label)
      ) then
        issues := issues || '{"field": "group", "code": "incompatible"}'::jsonb;
      else
        issues := issues || '{"field": "group", "code": "unknown"}'::jsonb;
      end if;
    elsif use_defaults and d_group is not null then
      select g.id into v_group_id from public.groups g
      where g.academy_id = p_academy_id and g.academic_year_id = p_academic_year_id and g.archived_at is null
        and g.id::text = d_group and g.level_id = v_level_id and g.track_id is not distinct from v_track_id;
    end if;
  end if;

  -- Student type: the enum value or its displayed label; else the default.
  raw := public.student_import_cell(cells, 'student_type');
  if raw is not null then
    label := public.normalize_import_label(raw);
    v_type := case
      when label in ('in_person', 'in person') then 'in_person'
      when label in ('online_only', 'online only') then 'online_only'
    end;
    if v_type is null then issues := issues || '{"field": "student_type", "code": "unknown"}'::jsonb; end if;
  elsif not 'student_type' = any(problems) then
    if use_defaults and d_type in ('in_person', 'online_only') then v_type := d_type;
    else issues := issues || '{"field": "student_type", "code": "required"}'::jsonb;
    end if;
  end if;

  input := pg_catalog.jsonb_build_object(
    'full_name', v_full_name, 'student_phone', normalized_phone, 'parent_phone', v_parent_phone,
    'level_id', v_level_id, 'track_id', v_track_id, 'primary_group_id', v_group_id, 'participation_type', v_type);
end;
$$;

-- A digest of every row's status and resolved input, to detect when revalidation changed the outcome.
create or replace function public.student_import_fingerprint(p_session_id uuid)
returns text language sql stable set search_path = '' as $$
  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    r.ordinal::text || ':' || r.status || ':' || coalesce(r.input::text, ''), ',' order by r.ordinal), ''))
  from public.student_import_rows r where r.session_id = p_session_id;
$$;

-- Re-resolves the session's rows (or one row) and recomputes every row's status, including
-- duplicates against existing records (active or archived) and among the included rows.
-- Returns the new fingerprint.
create or replace function public.refresh_student_import(p_session_id uuid, p_ordinal integer)
returns text language plpgsql set search_path = '' as $$
declare s public.student_import_sessions%rowtype;
begin
  select * into s from public.student_import_sessions where id = p_session_id;
  update public.student_import_rows r set (input, student_phone, issues) = (
    select x.input, x.normalized_phone, x.issues
    from public.resolve_student_import_row(s.academy_id, s.academic_year_id, s.defaults, r.source, r.corrected) x
  )
  where r.session_id = p_session_id and (p_ordinal is null or r.ordinal = p_ordinal);

  update public.student_import_rows r set
    status = x.status, existing_record_id = x.existing_id, existing_archived = x.existing_archived,
    duplicate_rows = x.duplicate_rows
  from (
    select q.ordinal,
      case
        when q.excluded then 'excluded'
        when e.id is not null then 'duplicate_existing'
        when q.peers > 1 then 'duplicate_file'
        when pg_catalog.jsonb_array_length(q.issues) > 0 then 'invalid'
        else 'ready'
      end as status,
      e.id as existing_id,
      case when e.id is not null then e.archived_at is not null end as existing_archived,
      case when q.peers > 1 then pg_catalog.array_remove(q.peer_rows, q.source_row) end as duplicate_rows
    from (
      select r2.ordinal, r2.excluded, r2.issues, r2.student_phone, r2.source_row,
        case when r2.student_phone is null or r2.excluded then 0 else
          count(*) filter (where not r2.excluded) over (partition by r2.student_phone) end as peers,
        pg_catalog.array_agg(r2.source_row) filter (where not r2.excluded) over (partition by r2.student_phone) as peer_rows
      from public.student_import_rows r2 where r2.session_id = p_session_id
    ) q
    left join public.annual_student_records e
      on e.academy_id = s.academy_id and e.academic_year_id = s.academic_year_id and e.student_phone = q.student_phone
  ) x
  where r.session_id = p_session_id and r.ordinal = x.ordinal;

  return public.student_import_fingerprint(p_session_id);
end;
$$;

-- Locks a session for a mutation by its creator, who must still be an owner or admin. Any other
-- caller sees not_found, so session ids reveal nothing across users or academies.
create or replace function public.lock_student_import_session(p_session_id uuid)
returns public.student_import_sessions language plpgsql set search_path = '' as $$
declare s public.student_import_sessions%rowtype;
begin
  if auth.uid() is null then raise exception using errcode = 'P0001', message = 'forbidden'; end if;
  select * into s from public.student_import_sessions where id = p_session_id for update;
  if not found or s.created_by <> auth.uid() then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  if coalesce(public.academy_role_for(s.academy_id)::text, '') not in ('owner', 'admin') then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  return s;
end;
$$;

-- Raises year_unavailable unless the session's academic year is still the open year. The share lock
-- keeps the year from closing until the caller's transaction ends.
create or replace function public.require_student_import_year(s public.student_import_sessions)
returns void language plpgsql set search_path = '' as $$
begin
  perform 1 from public.academic_years y
  where y.id = s.academic_year_id and y.academy_id = s.academy_id and y.closed_at is null
  for share;
  if not found then raise exception using errcode = 'P0001', message = 'year_unavailable'; end if;
end;
$$;

create or replace function public.require_student_import_state(s public.student_import_sessions, expected public.student_import_state)
returns void language plpgsql immutable set search_path = '' as $$
begin
  if s.state <> expected then raise exception using errcode = 'P0001', message = 'import_state'; end if;
end;
$$;

-- Starts a staging session for one file. Optionally cancels the caller's unconfirmed session it
-- replaces (after a mapping or default change).
create or replace function public.start_student_import(
  p_academy_id uuid, p_academic_year_id uuid, p_file_name text, p_format public.student_import_format,
  p_worksheet text, p_expected_rows integer, p_defaults jsonb, p_replaces uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  session_id uuid;
  d jsonb := coalesce(p_defaults, '{}'::jsonb);
begin
  if actor is null or coalesce(public.academy_role_for(p_academy_id)::text, '') not in ('owner', 'admin') then
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
$$;

-- Stages up to 100 mapped rows: [{ "ordinal": int, "source_row": int, "values": { field: value } }].
-- Retries are idempotent: an ordinal staged again with identical values succeeds; different values
-- for an already staged ordinal are rejected with stage_conflict.
create or replace function public.stage_student_import_rows(p_session_id uuid, p_rows jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  s public.student_import_sessions%rowtype;
  item jsonb;
  v_ordinal integer;
  v_source_row integer;
  v_values jsonb;
  existing record;
  staged integer;
begin
  s := public.lock_student_import_session(p_session_id);
  perform public.require_student_import_state(s, 'staging');
  perform public.require_student_import_year(s);
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) not between 1 and 100 then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;

  for item in select value from jsonb_array_elements(p_rows) loop
    begin
      v_ordinal := (item ->> 'ordinal')::integer;
      v_source_row := (item ->> 'source_row')::integer;
    exception when others then
      raise exception using errcode = 'P0001', message = 'validation';
    end;
    v_values := item -> 'values';
    if v_ordinal is null or v_ordinal not between 1 and s.expected_rows or v_source_row is null or v_source_row < 0
      or v_values is null or jsonb_typeof(v_values) <> 'object'
      or exists (
        select 1 from jsonb_each(v_values) e
        where e.key not in ('full_name', 'student_phone', 'parent_phone', 'level', 'track', 'group', 'student_type')
          or not (
            jsonb_typeof(e.value) = 'null'
            or (jsonb_typeof(e.value) = 'string' and char_length(e.value #>> '{}') <= 2000)
            or (jsonb_typeof(e.value) = 'object' and e.value - 'problem' = '{}'::jsonb
              and e.value ->> 'problem' in ('formula', 'date', 'error', 'nested', 'unsupported'))
          )
      ) then
      raise exception using errcode = 'P0001', message = 'validation';
    end if;

    insert into public.student_import_rows (session_id, academy_id, ordinal, source_row, source)
    values (s.id, s.academy_id, v_ordinal, v_source_row, v_values)
    on conflict (session_id, ordinal) do nothing;
    if not found then
      select r.source_row, r.source into existing from public.student_import_rows r
      where r.session_id = s.id and r.ordinal = v_ordinal;
      if existing.source_row <> v_source_row or existing.source <> v_values then
        raise exception using errcode = 'P0001', message = 'stage_conflict';
      end if;
    end if;
  end loop;

  select count(*) into staged from public.student_import_rows r where r.session_id = s.id;
  update public.student_import_sessions set staged_rows = staged, updated_at = now() where id = s.id;
  return staged;
end;
$$;

-- Validates every staged row once all expected rows have arrived and opens the review.
create or replace function public.finalize_student_import(p_session_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare s public.student_import_sessions%rowtype;
begin
  s := public.lock_student_import_session(p_session_id);
  perform public.require_student_import_state(s, 'staging');
  perform public.require_student_import_year(s);
  if (select count(*) from public.student_import_rows r where r.session_id = s.id) <> s.expected_rows then
    raise exception using errcode = 'P0001', message = 'incomplete_staging';
  end if;
  perform public.refresh_student_import(s.id, null);
  update public.student_import_sessions set state = 'reviewing', revision = revision + 1, updated_at = now()
  where id = s.id returning revision into s.revision;
  return s.revision;
end;
$$;

-- Replaces one staged row's values with a correction in resolved form:
-- { full_name, student_phone, parent_phone, level_id, track_id, primary_group_id, participation_type }.
-- Only the staged row changes; no student record is written. Returns the new revision.
create or replace function public.correct_student_import_row(
  p_session_id uuid, p_expected_revision integer, p_ordinal integer, p_input jsonb
)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  s public.student_import_sessions%rowtype;
  v_corrected jsonb;
begin
  s := public.lock_student_import_session(p_session_id);
  perform public.require_student_import_state(s, 'reviewing');
  if p_expected_revision is distinct from s.revision then
    raise exception using errcode = 'P0001', message = 'stale_revision';
  end if;
  perform public.require_student_import_year(s);
  if p_input is null or jsonb_typeof(p_input) <> 'object'
    or exists (select 1 from jsonb_each(p_input) e where e.key not in (
      'full_name', 'student_phone', 'parent_phone', 'level_id', 'track_id', 'primary_group_id', 'participation_type')
      or jsonb_typeof(e.value) not in ('string', 'null'))
    or char_length(coalesce(p_input ->> 'full_name', '')) > 200
    or char_length(coalesce(p_input ->> 'student_phone', '')) > 40
    or char_length(coalesce(p_input ->> 'parent_phone', '')) > 40
    or char_length(coalesce(p_input ->> 'level_id', '')) > 40
    or (p_input ->> 'participation_type' is not null and p_input ->> 'participation_type' not in ('in_person', 'online_only')) then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  begin
    v_corrected := jsonb_build_object(
      'full_name', p_input -> 'full_name', 'student_phone', p_input -> 'student_phone',
      'parent_phone', p_input -> 'parent_phone', 'level_id', p_input -> 'level_id',
      'track_id', to_jsonb((p_input ->> 'track_id')::uuid),
      'primary_group_id', to_jsonb((p_input ->> 'primary_group_id')::uuid),
      'participation_type', p_input -> 'participation_type');
  exception when invalid_text_representation then
    raise exception using errcode = 'P0001', message = 'validation';
  end;

  update public.student_import_rows r set corrected = v_corrected
  where r.session_id = s.id and r.ordinal = p_ordinal;
  if not found then raise exception using errcode = 'P0001', message = 'not_found'; end if;
  perform public.refresh_student_import(s.id, p_ordinal);
  update public.student_import_sessions set revision = revision + 1, updated_at = now()
  where id = s.id returning revision into s.revision;
  return s.revision;
end;
$$;

-- Excludes a row from the import, or includes it again, then revalidates duplicates. Returns the new revision.
create or replace function public.set_student_import_row_excluded(
  p_session_id uuid, p_expected_revision integer, p_ordinal integer, p_excluded boolean
)
returns integer language plpgsql security definer set search_path = '' as $$
declare s public.student_import_sessions%rowtype;
begin
  s := public.lock_student_import_session(p_session_id);
  perform public.require_student_import_state(s, 'reviewing');
  if p_expected_revision is distinct from s.revision then
    raise exception using errcode = 'P0001', message = 'stale_revision';
  end if;
  perform public.require_student_import_year(s);
  if p_excluded is null then raise exception using errcode = 'P0001', message = 'validation'; end if;
  update public.student_import_rows r set excluded = p_excluded where r.session_id = s.id and r.ordinal = p_ordinal;
  if not found then raise exception using errcode = 'P0001', message = 'not_found'; end if;
  perform public.refresh_student_import(s.id, p_ordinal);
  update public.student_import_sessions set revision = revision + 1, updated_at = now()
  where id = s.id returning revision into s.revision;
  return s.revision;
end;
$$;

-- Revalidates the reviewed rows against current records and structure. If anything changed, the
-- refreshed review is saved under a new revision and { "confirmed": false } is returned so staff
-- review again. Otherwise the inputs freeze: Ready rows get immutable batches of 100 in source order
-- and every other row is recorded as skipped with its reason.
create or replace function public.confirm_student_import(p_session_id uuid, p_expected_revision integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.student_import_sessions%rowtype;
  v_before text;
  v_ready integer;
  v_skipped integer;
begin
  s := public.lock_student_import_session(p_session_id);
  perform public.require_student_import_state(s, 'reviewing');
  if p_expected_revision is distinct from s.revision then
    raise exception using errcode = 'P0001', message = 'stale_revision';
  end if;
  perform public.require_student_import_year(s);

  v_before := public.student_import_fingerprint(s.id);
  if public.refresh_student_import(s.id, null) <> v_before then
    update public.student_import_sessions set revision = revision + 1, updated_at = now()
    where id = s.id returning revision into s.revision;
    return jsonb_build_object('confirmed', false, 'revision', s.revision);
  end if;

  select count(*) filter (where r.status = 'ready'), count(*) filter (where r.status <> 'ready')
  into v_ready, v_skipped from public.student_import_rows r where r.session_id = s.id;
  if v_ready = 0 then raise exception using errcode = 'P0001', message = 'validation', hint = 'nothing_ready'; end if;

  update public.student_import_rows r set batch_index = (x.seq - 1) / 100, outcome = 'pending'
  from (
    select r2.ordinal, row_number() over (order by r2.ordinal) as seq
    from public.student_import_rows r2 where r2.session_id = s.id and r2.status = 'ready'
  ) x
  where r.session_id = s.id and r.ordinal = x.ordinal;
  update public.student_import_rows r set outcome = 'skipped', outcome_code = r.status
  where r.session_id = s.id and r.status <> 'ready';

  update public.student_import_sessions set
    state = 'importing', revision = revision + 1, batch_count = (v_ready + 99) / 100,
    skipped_count = v_skipped, confirmed_at = now(), updated_at = now()
  where id = s.id returning revision into s.revision;
  return jsonb_build_object('confirmed', true, 'revision', s.revision, 'batch_count', (v_ready + 99) / 100);
end;
$$;

-- Creates one confirmed batch. Overlapping calls serialize on the session lock; a batch that already
-- ran returns its stored outcomes without creating anything again. Each row's identity and annual
-- record are created atomically: a duplicate phone becomes skipped and a placement or validation
-- failure becomes failed, while other rows continue. Any unexpected error rolls back the whole batch,
-- which stays retryable. A closed year blocks the session without undoing earlier batches.
create or replace function public.process_student_import_batch(p_session_id uuid, p_batch_index integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.student_import_sessions%rowtype;
  item record;
  created_id uuid;
  err text;
  outcomes jsonb;
begin
  s := public.lock_student_import_session(p_session_id);
  if s.state not in ('importing', 'completed', 'blocked') then
    raise exception using errcode = 'P0001', message = 'import_state';
  end if;
  if p_batch_index is null or p_batch_index < 0 or p_batch_index >= coalesce(s.batch_count, 0) then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;

  if s.state = 'importing' and exists (
    select 1 from public.student_import_rows r
    where r.session_id = s.id and r.batch_index = p_batch_index and r.outcome = 'pending'
  ) then
    perform 1 from public.academic_years y
    where y.id = s.academic_year_id and y.academy_id = s.academy_id and y.closed_at is null
    for share;
    if not found then
      update public.student_import_sessions set state = 'blocked', blocked_reason = 'year_unavailable', updated_at = now()
      where id = s.id returning * into s;
    else
      for item in
        select r.ordinal, r.input from public.student_import_rows r
        where r.session_id = s.id and r.batch_index = p_batch_index and r.outcome = 'pending'
        order by r.ordinal
      loop
        begin
          select c.id into created_id from public.create_student_record(
            s.academy_id, s.academic_year_id, item.input ->> 'full_name', item.input ->> 'student_phone',
            item.input ->> 'parent_phone', item.input ->> 'level_id', (item.input ->> 'track_id')::uuid,
            (item.input ->> 'primary_group_id')::uuid,
            (item.input ->> 'participation_type')::public.student_participation_type) c;
          update public.student_import_rows r set outcome = 'created', outcome_code = null, record_id = created_id
          where r.session_id = s.id and r.ordinal = item.ordinal;
        exception when sqlstate 'P0001' then
          get stacked diagnostics err = message_text;
          if err = 'duplicate_student_phone' then
            update public.student_import_rows r set outcome = 'skipped', outcome_code = 'duplicate_existing'
            where r.session_id = s.id and r.ordinal = item.ordinal;
          elsif err in ('invalid_placement', 'validation') then
            update public.student_import_rows r set outcome = 'failed', outcome_code = err
            where r.session_id = s.id and r.ordinal = item.ordinal;
          else
            raise;
          end if;
        end;
      end loop;

      update public.student_import_sessions set
        created_count = x.created, skipped_count = x.skipped, failed_count = x.failed,
        state = case when x.pending = 0 then 'completed'::public.student_import_state else state end,
        completed_at = case when x.pending = 0 then now() else completed_at end,
        updated_at = now()
      from (
        select count(*) filter (where r.outcome = 'created') as created,
          count(*) filter (where r.outcome = 'skipped') as skipped,
          count(*) filter (where r.outcome = 'failed') as failed,
          count(*) filter (where r.outcome = 'pending') as pending
        from public.student_import_rows r where r.session_id = s.id
      ) x
      where id = s.id returning student_import_sessions.* into s;
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('ordinal', r.ordinal, 'outcome', r.outcome, 'code', r.outcome_code,
      'record_id', r.record_id) order by r.ordinal), '[]'::jsonb)
  into outcomes from public.student_import_rows r where r.session_id = s.id and r.batch_index = p_batch_index;
  return jsonb_build_object(
    'state', s.state, 'blocked_reason', s.blocked_reason, 'created', s.created_count,
    'skipped', s.skipped_count, 'failed', s.failed_count,
    'pending', (select count(*) from public.student_import_rows r where r.session_id = s.id and r.outcome = 'pending'),
    'next_batch', (select min(r.batch_index) from public.student_import_rows r where r.session_id = s.id and r.outcome = 'pending'),
    'rows', outcomes);
end;
$$;

-- Cancels an unconfirmed session. Nothing was created, so its rows simply stop counting.
create or replace function public.cancel_student_import(p_session_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.student_import_sessions%rowtype;
begin
  s := public.lock_student_import_session(p_session_id);
  if s.state not in ('staging', 'reviewing') then
    raise exception using errcode = 'P0001', message = 'import_state';
  end if;
  update public.student_import_sessions set state = 'cancelled', updated_at = now() where id = s.id;
end;
$$;

-- The session with its review and execution counts. Runs as the caller, so RLS applies.
create or replace function public.student_import_summary(p_session_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select to_jsonb(s) || jsonb_build_object('counts', (
    select jsonb_build_object(
      'ready', count(*) filter (where r.status = 'ready'),
      'invalid', count(*) filter (where r.status = 'invalid'),
      'duplicate_existing', count(*) filter (where r.status = 'duplicate_existing'),
      'duplicate_file', count(*) filter (where r.status = 'duplicate_file'),
      'excluded', count(*) filter (where r.status = 'excluded'),
      'pending', count(*) filter (where r.outcome = 'pending'),
      'created', count(*) filter (where r.outcome = 'created'),
      'skipped', count(*) filter (where r.outcome = 'skipped'),
      'failed', count(*) filter (where r.outcome = 'failed'),
      -- Skipped rows by reason: their review status, or duplicate_existing for a concurrent duplicate.
      'skipped_by_code', coalesce((
        select jsonb_object_agg(c.code, c.n) from (
          select r2.outcome_code as code, count(*) as n from public.student_import_rows r2
          where r2.session_id = s.id and r2.outcome = 'skipped' group by r2.outcome_code
        ) c), '{}'::jsonb),
      'batched', count(*) filter (where r.batch_index is not null),
      'next_batch', min(r.batch_index) filter (where r.outcome = 'pending'))
    from public.student_import_rows r where r.session_id = s.id))
  from public.student_import_sessions s where s.id = p_session_id;
$$;

-- One page of a session's rows with resolved placement labels and the total match count. Runs as the
-- caller, so RLS limits it to managers of the session's academy. `p_status` filters by review status
-- (ready, invalid, duplicate_existing, duplicate_file, excluded) or execution outcome
-- (pending, created, skipped, failed); search matches names, phones, and source row numbers.
create or replace function public.list_student_import_rows(
  p_session_id uuid, p_status text, p_search text, p_page_index integer, p_page_size integer
)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  term text := nullif(pg_catalog.btrim(coalesce(p_search, '')), '');
  pattern text;
  digits text;
  total bigint;
  page jsonb;
begin
  if p_page_size is null or p_page_size not in (10, 20, 50, 100) or p_page_index is null or p_page_index < 0
    or (p_status is not null and p_status not in ('ready', 'invalid', 'duplicate_existing', 'duplicate_file',
      'excluded', 'pending', 'created', 'skipped', 'failed')) then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  if term is not null then
    term := left(term, 100);
    pattern := '%' || replace(replace(replace(term, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    if term ~ '^[+0-9[:space:]().-]+$' then
      digits := nullif(pg_catalog.regexp_replace(term, '[^0-9]', '', 'g'), '');
      if digits like '00%' then digits := substr(digits, 3); elsif digits like '0%' then digits := substr(digits, 2); end if;
      digits := nullif(digits, '');
    end if;
  end if;

  select count(*) into total from public.student_import_rows r
  where r.session_id = p_session_id
    and (p_status is null or r.status = p_status or r.outcome = p_status)
    and (pattern is null or r.source ->> 'full_name' ilike pattern or r.input ->> 'full_name' ilike pattern
      or r.source ->> 'student_phone' ilike pattern or r.source ->> 'parent_phone' ilike pattern
      or r.source_row::text = term
      or (digits is not null and (r.student_phone like '%' || digits || '%' or r.input ->> 'parent_phone' like '%' || digits || '%')));

  select coalesce(jsonb_agg(to_jsonb(x) order by x.ordinal), '[]'::jsonb) into page from (
    select r.ordinal, r.source_row, r.source, r.corrected is not null as corrected, r.input, r.issues, r.excluded,
      r.status, r.existing_archived, r.duplicate_rows, r.batch_index, r.outcome, r.outcome_code, r.record_id,
      gl.name as level_name, t.name as track_name, g.name as group_name
    from public.student_import_rows r
    left join public.global_levels gl on gl.id = r.input ->> 'level_id'
    left join public.academy_tracks t on t.id = (r.input ->> 'track_id')::uuid
    left join public.groups g on g.id = (r.input ->> 'primary_group_id')::uuid
    where r.session_id = p_session_id
      and (p_status is null or r.status = p_status or r.outcome = p_status)
      and (pattern is null or r.source ->> 'full_name' ilike pattern or r.input ->> 'full_name' ilike pattern
        or r.source ->> 'student_phone' ilike pattern or r.source ->> 'parent_phone' ilike pattern
        or r.source_row::text = term
        or (digits is not null and (r.student_phone like '%' || digits || '%' or r.input ->> 'parent_phone' like '%' || digits || '%')))
    order by r.ordinal
    limit p_page_size offset p_page_index * p_page_size
  ) x;
  return jsonb_build_object('rows', page, 'total', total);
end;
$$;

-- Assigns explicitly selected active records to one group, or removes their group when
-- p_primary_group_id is NULL. p_records is [{ "id": uuid, "version": int }, ...] (1–500).
-- Every record must be current, active, and in the academy/year; assigning a group also requires
-- every record to share the group's level and track. Any failure leaves the whole selection
-- untouched. Only primary_group_id changes; records already in the target are left alone.
-- Returns { "changed": [{ "id", "version" }], "unchanged": [id, ...] }.
create or replace function public.set_student_records_group(
  p_academy_id uuid, p_academic_year_id uuid, p_records jsonb, p_primary_group_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
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
  if auth.uid() is null or coalesce(public.academy_role_for(p_academy_id)::text, '') not in ('owner', 'admin') then
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
$$;

revoke all on function public.normalize_import_label(text) from public, anon, authenticated;
revoke all on function public.student_import_cell(jsonb, text) from public, anon, authenticated;
revoke all on function public.resolve_student_import_row(uuid, uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.student_import_fingerprint(uuid) from public, anon, authenticated;
revoke all on function public.refresh_student_import(uuid, integer) from public, anon, authenticated;
revoke all on function public.lock_student_import_session(uuid) from public, anon, authenticated;
revoke all on function public.require_student_import_year(public.student_import_sessions) from public, anon, authenticated;
revoke all on function public.require_student_import_state(public.student_import_sessions, public.student_import_state) from public, anon, authenticated;
revoke all on function public.start_student_import(uuid, uuid, text, public.student_import_format, text, integer, jsonb, uuid) from public, anon;
revoke all on function public.stage_student_import_rows(uuid, jsonb) from public, anon;
revoke all on function public.finalize_student_import(uuid) from public, anon;
revoke all on function public.correct_student_import_row(uuid, integer, integer, jsonb) from public, anon;
revoke all on function public.set_student_import_row_excluded(uuid, integer, integer, boolean) from public, anon;
revoke all on function public.confirm_student_import(uuid, integer) from public, anon;
revoke all on function public.process_student_import_batch(uuid, integer) from public, anon;
revoke all on function public.cancel_student_import(uuid) from public, anon;
revoke all on function public.student_import_summary(uuid) from public, anon;
revoke all on function public.list_student_import_rows(uuid, text, text, integer, integer) from public, anon;
revoke all on function public.set_student_records_group(uuid, uuid, jsonb, uuid) from public, anon;

grant execute on function public.start_student_import(uuid, uuid, text, public.student_import_format, text, integer, jsonb, uuid) to authenticated;
grant execute on function public.stage_student_import_rows(uuid, jsonb) to authenticated;
grant execute on function public.finalize_student_import(uuid) to authenticated;
grant execute on function public.correct_student_import_row(uuid, integer, integer, jsonb) to authenticated;
grant execute on function public.set_student_import_row_excluded(uuid, integer, integer, boolean) to authenticated;
grant execute on function public.confirm_student_import(uuid, integer) to authenticated;
grant execute on function public.process_student_import_batch(uuid, integer) to authenticated;
grant execute on function public.cancel_student_import(uuid) to authenticated;
grant execute on function public.student_import_summary(uuid) to authenticated;
grant execute on function public.list_student_import_rows(uuid, text, text, integer, integer) to authenticated;
grant execute on function public.set_student_records_group(uuid, uuid, jsonb, uuid) to authenticated;
