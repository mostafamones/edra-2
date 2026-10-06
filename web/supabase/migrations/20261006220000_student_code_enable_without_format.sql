-- Student codes: codes can be turned on before any format is saved.
--
-- The on/off switch saves by itself and the format editor is only available while codes are on, so
-- enabling can no longer require a format. Until a format exists, a level without an effective
-- format fails at assignment and allocation with `pattern_missing`. The function's signature,
-- privileges, and return value are unchanged.

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

revoke all on function public.save_student_code_settings(uuid, integer, boolean, text, jsonb) from public, anon;
grant execute on function public.save_student_code_settings(uuid, integer, boolean, text, jsonb) to authenticated;
