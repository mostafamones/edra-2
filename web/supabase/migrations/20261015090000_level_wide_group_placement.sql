-- Level-wide group placement. A group with a null track accepts students of its level with or
-- without a track; a track-specific group still requires the same level and track. Levels that offer
-- tracks may now have level-wide groups. A supplied track is still validated by the
-- (academy_id, level_id, track_id) foreign key. Joining a level-wide group never changes the
-- student's own track.

create or replace function public.validate_group_write()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from public.academic_years y
    where y.id = new.academic_year_id and y.academy_id = new.academy_id and y.closed_at is null
  ) then raise exception 'Group must belong to the active academic year'; end if;
  if tg_op = 'UPDATE' then
    if new.academy_id is distinct from old.academy_id
      or new.academic_year_id is distinct from old.academic_year_id
      or new.created_at is distinct from old.created_at then
      raise exception 'Group academy and year cannot be changed';
    end if;
    if old.archived_at is not null and (
      new.archived_at is not null
      or (new.name, new.level_id, new.track_id, new.capacity, new.notes)
        is distinct from (old.name, old.level_id, old.track_id, old.capacity, old.notes)
    ) then raise exception 'Archived groups cannot be edited'; end if;
    if new.archived_at is not null and new.archived_at < now() - interval '1 minute' then
      raise exception 'Invalid archive timestamp';
    end if;
  end if;
  return new;
end;
$$;

-- Record guard: only the group compatibility predicate changes; every other check is preserved.
create or replace function public.validate_student_record_write()
returns trigger language plpgsql set search_path = '' as $$
declare placed public.groups%rowtype;
begin
  -- Locking the year row keeps a concurrent year close from interleaving with this write.
  perform 1 from public.academic_years y
  where y.id = new.academic_year_id and y.academy_id = new.academy_id and y.closed_at is null
  for share;
  if not found then
    raise exception using errcode = 'P0001', message = 'year_unavailable',
      hint = 'Student records can only change in the active academic year.';
  end if;

  if tg_op = 'INSERT' then
    if new.archived_at is not null then
      raise exception using errcode = 'P0001', message = 'validation', hint = 'New student records start active.';
    end if;
    new.version := 1;
  else
    if new.academy_id is distinct from old.academy_id
      or new.academic_year_id is distinct from old.academic_year_id
      or new.academy_student_profile_id is distinct from old.academy_student_profile_id
      or new.created_at is distinct from old.created_at
      or new.created_by is distinct from old.created_by then
      raise exception using errcode = 'P0001', message = 'validation',
        hint = 'A student record''s academy, year, and identity cannot change.';
    end if;
    -- An archived record may only be restored; every other edit is rejected.
    if old.archived_at is not null and (
      new.archived_at is not null
      or (new.full_name, new.student_phone, new.parent_phone, new.level_id, new.track_id,
          new.primary_group_id, new.participation_type)
        is distinct from
         (old.full_name, old.student_phone, old.parent_phone, old.level_id, old.track_id,
          old.primary_group_id, old.participation_type)
    ) then
      raise exception using errcode = 'P0001', message = 'archived_record',
        hint = 'Restore the student record before editing it.';
    end if;
    new.version := old.version + 1;
    new.updated_at := now();
  end if;

  -- Checked only when placement changes, so archiving an older record never fails because its level
  -- gained tracks later.
  if (tg_op = 'INSERT' or (new.level_id, new.track_id) is distinct from (old.level_id, old.track_id))
    and new.track_id is null and exists (
      select 1 from public.academy_tracks t where t.academy_id = new.academy_id and t.level_id = new.level_id
    ) then
    raise exception using errcode = 'P0001', message = 'invalid_placement', hint = 'Choose a track for this level.';
  end if;

  if new.primary_group_id is not null and (
    tg_op = 'INSERT'
    or (new.primary_group_id, new.level_id, new.track_id)
      is distinct from (old.primary_group_id, old.level_id, old.track_id)
  ) then
    -- The share lock conflicts with a concurrent group archive or program change: whichever commits
    -- first wins, and the other observes it (protect_group_dependencies checks student references).
    select g.* into placed from public.groups g
    where g.id = new.primary_group_id and g.academy_id = new.academy_id
      and g.academic_year_id = new.academic_year_id
    for share of g;
    if not found or placed.archived_at is not null
      or placed.level_id <> new.level_id
      or (placed.track_id is not null and placed.track_id is distinct from new.track_id) then
      raise exception using errcode = 'P0001', message = 'invalid_placement',
        hint = 'Choose an active group in the same level that is level-wide or matches the student''s track.';
    end if;
  end if;
  return new;
end;
$$;

-- Import resolution: a level-wide group is compatible with any track of its level. Same-name
-- level-wide and track-specific candidates still resolve as ambiguous, never silently.
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
        and g.level_id = v_level_id and (g.track_id is null or g.track_id = v_track_id) and g.id::text = label;
      if coalesce(cardinality(matches), 0) = 0 then
        select pg_catalog.array_agg(g.id::text) into matches from public.groups g
        where g.academy_id = p_academy_id and g.academic_year_id = p_academic_year_id and g.archived_at is null
          and g.level_id = v_level_id and (g.track_id is null or g.track_id = v_track_id)
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
        and g.id::text = d_group and g.level_id = v_level_id and (g.track_id is null or g.track_id = v_track_id);
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

-- Bulk move: a level-wide destination accepts mixed tracks of one level; a track-specific destination
-- requires every selected record to match its track.
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
      where r.id = any(ids) and (r.level_id <> target.level_id
        or (target.track_id is not null and r.track_id is distinct from target.track_id))
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
