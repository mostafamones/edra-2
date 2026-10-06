-- Student codes: numbering options for bulk generation (corrective to 20261006240000).
--
-- A run may now choose where numbering starts, the increment between codes, and odd-only or
-- even-only numbers. Defaults reproduce the previous behavior (continue after the format's counter,
-- step 1, any parity). The options select the arithmetic progression
--   first, first + e, first + 2e, ...   (e = step, or 2 * step when step is odd and a parity is chosen)
-- where `first` is the start (or the counter's next value) moved up by one if its parity is wrong.
-- Codes already issued anywhere in the academy are skipped within the progression, exactly as before,
-- and capacity counts only progression members that are still free. A start below the counter may
-- reuse unissued gaps; the counter only ever moves forward.
--
-- The options are part of the preview token and the idempotency fingerprint. The earlier signatures
-- are replaced; nothing else calls them.

drop function if exists public.generate_student_codes(uuid, text, text[], integer, text, uuid);
drop function if exists public.preview_student_code_generation(uuid, text, text[]);
drop function if exists public.student_code_generation_summary(uuid, uuid, integer, text, text[], uuid[]);
drop function if exists public.student_code_capacity(uuid, text, integer, bigint);
drop function if exists public.student_code_next_free(uuid, text, integer, bigint);

-- Raises validation for options outside the supported ranges.
create or replace function public.student_code_generation_options(p_start integer, p_step integer, p_parity text)
returns void
language plpgsql immutable set search_path = '' as $$
begin
  if (p_start is not null and (p_start < 1 or p_start > 99999999))
    or p_step is null or p_step < 1 or p_step > 1000
    or p_parity is null or p_parity <> all (array['any', 'even', 'odd']) then
    raise exception using errcode = 'P0001', message = 'validation', hint = 'options';
  end if;
end;
$$;

-- Distance between consecutive codes of the progression.
create or replace function public.student_code_generation_stride(p_step integer, p_parity text)
returns bigint
language sql immutable set search_path = '' as $$
  select case when p_parity = 'any' or p_step % 2 = 0 then p_step::bigint else p_step::bigint * 2 end;
$$;

-- The value just before the first code of the progression, given the counter's current value.
create or replace function public.student_code_generation_before(p_cursor bigint, p_start integer, p_step integer, p_parity text)
returns bigint
language sql immutable set search_path = '' as $$
  select (
    coalesce(p_start::bigint, p_cursor + 1)
    + case when (p_parity = 'even' and coalesce(p_start::bigint, p_cursor + 1) % 2 = 1)
             or (p_parity = 'odd' and coalesce(p_start::bigint, p_cursor + 1) % 2 = 0) then 1 else 0 end
  ) - public.student_code_generation_stride(p_step, p_parity);
$$;

-- The next progression value after p_after whose full code was never issued in the academy, or null
-- when the format has none left. Mirrors allocate_student_code: every issued string is skipped.
create or replace function public.student_code_next_free(p_academy_id uuid, p_prefix text, p_width integer, p_after bigint, p_stride bigint)
returns bigint
language plpgsql set search_path = '' as $$
declare
  capacity bigint := (10::numeric ^ p_width)::bigint - 1;
  candidate bigint := p_after;
begin
  loop
    candidate := candidate + p_stride;
    if candidate > capacity then return null; end if;
    exit when not exists (
      select 1 from public.student_code_assignments a
      where a.academy_id = p_academy_id and a.code = p_prefix || pg_catalog.lpad(candidate::text, p_width, '0')
    );
  end loop;
  return candidate;
end;
$$;

-- How many progression values after p_after the format can still issue: the progression's members up
-- to the format's maximum minus those already issued.
create or replace function public.student_code_capacity(p_academy_id uuid, p_prefix text, p_width integer, p_after bigint, p_stride bigint)
returns bigint
language sql stable set search_path = '' as $$
  with bounds as (
    select (10::numeric ^ p_width)::bigint - 1 as top, p_after + p_stride as first
  )
  select case when b.top < b.first then 0 else (b.top - b.first) / p_stride + 1 end - (
    select count(distinct a.code) from public.student_code_assignments a
    where a.academy_id = p_academy_id
      and pg_catalog.char_length(a.code) = pg_catalog.char_length(p_prefix) + p_width
      and pg_catalog.left(a.code, pg_catalog.char_length(p_prefix)) = p_prefix
      and pg_catalog.substr(a.code, pg_catalog.char_length(p_prefix) + 1) ~ '^[0-9]+$'
      and case when pg_catalog.substr(a.code, pg_catalog.char_length(p_prefix) + 1) ~ '^[0-9]+$'
        then pg_catalog.substr(a.code, pg_catalog.char_length(p_prefix) + 1)::bigint else -1 end >= b.first
      and (case when pg_catalog.substr(a.code, pg_catalog.char_length(p_prefix) + 1) ~ '^[0-9]+$'
        then pg_catalog.substr(a.code, pg_catalog.char_length(p_prefix) + 1)::bigint else 0 end - b.first) % p_stride = 0
  )
  from bounds b;
$$;

-- The reviewable summary of a scope:
-- { settingsVersion, token, targets, coded, missing,
--   patterns: [{ pattern, levelIds, missing, available, examples }],
--   missingFormat: [{ levelId, missing }], options: { start, step, parity } }
-- Formats sharing a prefix and width share one counter and appear once. Examples are the next free
-- progression values right now and are advisory: other assignments may take them first.
create or replace function public.student_code_generation_summary(
  p_academy_id uuid, p_year_id uuid, p_version integer, p_mode text, p_level_ids text[], p_group_ids uuid[],
  p_start integer, p_step integer, p_parity text
)
returns jsonb
language plpgsql set search_path = '' as $$
declare
  total_count bigint;
  coded_count bigint;
  token text;
  missing_format jsonb;
  patterns jsonb := '[]';
  entry record;
  cursor_value bigint;
  candidate bigint;
  examples text[];
  stride bigint := public.student_code_generation_stride(p_step, p_parity);
  before_first bigint;
begin
  select count(*), count(*) filter (where t.coded),
    pg_catalog.md5(p_version::text || ':' || coalesce(p_start::text, '-') || ':' || p_step::text || ':' || p_parity || ':' || coalesce(
      string_agg(t.record_id::text || '@' || coalesce(t.pattern, ''), ',' order by t.record_id) filter (where not t.coded), ''))
  into total_count, coded_count, token
  from public.student_code_generation_targets(p_academy_id, p_year_id, p_mode, p_level_ids, p_group_ids) t;

  select coalesce(jsonb_agg(jsonb_build_object('levelId', m.record_level_id, 'missing', m.n) order by m.record_level_id), '[]')
  into missing_format
  from (
    select t.record_level_id, count(*) as n
    from public.student_code_generation_targets(p_academy_id, p_year_id, p_mode, p_level_ids, p_group_ids) t
    where not t.coded and t.pattern is null
    group by t.record_level_id
  ) m;

  for entry in
    select public.student_code_pattern_prefix(t.pattern) as code_prefix,
      public.student_code_pattern_width(t.pattern) as code_width,
      count(*) as n,
      array_agg(distinct t.record_level_id order by t.record_level_id) as level_ids
    from public.student_code_generation_targets(p_academy_id, p_year_id, p_mode, p_level_ids, p_group_ids) t
    where not t.coded and t.pattern is not null
    group by 1, 2
    order by 1, 2
  loop
    select coalesce(max(c.last_value), 0) into cursor_value from public.student_code_counters c
    where c.academy_id = p_academy_id and c.prefix = entry.code_prefix and c.width = entry.code_width;
    examples := '{}';
    before_first := public.student_code_generation_before(cursor_value, p_start, p_step, p_parity);
    candidate := before_first;
    for i in 1..3 loop
      candidate := public.student_code_next_free(p_academy_id, entry.code_prefix, entry.code_width, candidate, stride);
      exit when candidate is null;
      examples := examples || (entry.code_prefix || pg_catalog.lpad(candidate::text, entry.code_width, '0'));
    end loop;
    patterns := patterns || jsonb_build_object(
      'pattern', entry.code_prefix || pg_catalog.repeat('#', entry.code_width),
      'levelIds', to_jsonb(entry.level_ids),
      'missing', entry.n,
      'available', public.student_code_capacity(p_academy_id, entry.code_prefix, entry.code_width, before_first, stride),
      'examples', to_jsonb(examples)
    );
  end loop;

  return jsonb_build_object(
    'settingsVersion', p_version,
    'token', token,
    'options', jsonb_build_object('start', p_start, 'step', p_step, 'parity', p_parity),
    'targets', total_count,
    'coded', coded_count,
    'missing', total_count - coded_count,
    'patterns', patterns,
    'missingFormat', missing_format
  );
end;
$$;

-- Authenticated read for every staff role while codes are on. Raises forbidden, codes_disabled,
-- year_unavailable (no open year), validation, or invalid_target.
create or replace function public.preview_student_code_generation(
  p_academy_id uuid, p_mode text, p_ids text[], p_start integer default null, p_step integer default 1, p_parity text default 'any'
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  config public.student_code_settings%rowtype;
  open_year uuid;
  scope record;
begin
  if auth.uid() is null or p_academy_id is null or public.academy_role_for(p_academy_id) is null then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  select s.* into config from public.student_code_settings s where s.academy_id = p_academy_id and s.enabled;
  if not found then raise exception using errcode = 'P0001', message = 'codes_disabled'; end if;
  select y.id into open_year from public.academic_years y where y.academy_id = p_academy_id and y.closed_at is null;
  if not found then raise exception using errcode = 'P0001', message = 'year_unavailable'; end if;
  perform public.student_code_generation_options(p_start, p_step, p_parity);
  select * into scope from public.student_code_generation_scope(p_academy_id, open_year, p_mode, p_ids);
  return public.student_code_generation_summary(
    p_academy_id, open_year, config.version, p_mode, scope.level_ids, scope.group_ids, p_start, p_step, p_parity);
end;
$$;

-- Issues every missing code in the reviewed scope in one transaction, or nothing. Every staff role
-- may run it while codes are on. Raises forbidden, validation, codes_disabled, year_unavailable,
-- invalid_target, stale_preview, pattern_missing (hint: level id), code_exhausted (hint: format),
-- code_taken (a concurrent manual assignment took a value mid-run), or idempotency_conflict.
create or replace function public.generate_student_codes(
  p_academy_id uuid, p_mode text, p_ids text[], p_expected_version integer, p_preview_token text, p_request_key uuid,
  p_start integer default null, p_step integer default 1, p_parity text default 'any'
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  config public.student_code_settings%rowtype;
  stored public.student_code_requests%rowtype;
  open_year uuid;
  scope record;
  ids text[];
  fingerprint_value text;
  target_ids uuid[];
  summary jsonb;
  entry jsonb;
  holder record;
  cursors jsonb := '{}';
  counter_key text;
  code_prefix text;
  code_width integer;
  cursor_value bigint;
  assigned integer := 0;
  result jsonb;
  stride bigint;
begin
  if actor is null or p_academy_id is null or public.academy_role_for(p_academy_id) is null then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  if p_request_key is null or p_expected_version is null or p_expected_version < 1
    or p_preview_token is null or p_preview_token !~ '^[0-9a-f]{32}$'
    or p_mode is null or p_mode <> all (array['all', 'levels', 'groups']) then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  perform public.student_code_generation_options(p_start, p_step, p_parity);
  stride := public.student_code_generation_stride(p_step, p_parity);
  select coalesce(array_agg(distinct v order by v), '{}') into ids
  from pg_catalog.unnest(coalesce(p_ids, '{}'::text[])) v where v is not null;
  fingerprint_value := 'generate_many:' || p_mode || ':' || pg_catalog.array_to_string(ids, ',')
    || ':' || p_expected_version::text || ':' || p_preview_token
    || ':' || coalesce(p_start::text, '-') || ':' || p_step::text || ':' || p_parity;

  -- Rank 1. Settings saves (FOR UPDATE) wait for this run, and this run waits for them.
  select s.* into config from public.student_code_settings s where s.academy_id = p_academy_id for share;

  -- A retry after a lost response replays the original result even if the scope changed since.
  select * into stored from public.student_code_requests q
  where q.academy_id = p_academy_id and q.request_key = p_request_key;
  if found then
    if stored.actor_id = actor and stored.fingerprint = fingerprint_value then return stored.result; end if;
    raise exception using errcode = 'P0001', message = 'idempotency_conflict';
  end if;

  if config.academy_id is null or not config.enabled then
    raise exception using errcode = 'P0001', message = 'codes_disabled';
  end if;
  select y.id into open_year from public.academic_years y where y.academy_id = p_academy_id and y.closed_at is null;
  if not found then raise exception using errcode = 'P0001', message = 'year_unavailable'; end if;
  select * into scope from public.student_code_generation_scope(p_academy_id, open_year, p_mode, ids);
  if config.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale_preview';
  end if;

  -- Rank 3. The scope conditions are rechecked on each locked row, so a record archived or moved out
  -- of scope meanwhile is left out. This locked set is the run's target set.
  select coalesce(array_agg(t.id order by t.id), '{}') into target_ids
  from (
    select r.id from public.annual_student_records r
    where r.academy_id = p_academy_id and r.academic_year_id = open_year and r.archived_at is null
      and public.student_code_generation_matches(p_mode, scope.level_ids, scope.group_ids, r.level_id, r.primary_group_id)
    order by r.id
    for update of r
  ) t;

  -- An identical request that committed while this one waited on the records replays here.
  select * into stored from public.student_code_requests q
  where q.academy_id = p_academy_id and q.request_key = p_request_key;
  if found then
    if stored.actor_id = actor and stored.fingerprint = fingerprint_value then return stored.result; end if;
    raise exception using errcode = 'P0001', message = 'idempotency_conflict';
  end if;

  -- Rank 4.
  perform 1 from public.academic_years y where y.id = open_year and y.closed_at is null for share;
  if not found then raise exception using errcode = 'P0001', message = 'year_unavailable'; end if;

  summary := public.student_code_generation_summary(
    p_academy_id, open_year, config.version, p_mode, scope.level_ids, scope.group_ids, p_start, p_step, p_parity);
  if summary ->> 'token' <> p_preview_token then
    raise exception using errcode = 'P0001', message = 'stale_preview';
  end if;
  if jsonb_array_length(summary -> 'missingFormat') > 0 then
    raise exception using errcode = 'P0001', message = 'pattern_missing',
      hint = summary -> 'missingFormat' -> 0 ->> 'levelId';
  end if;
  for entry in select value from jsonb_array_elements(summary -> 'patterns') loop
    if (entry ->> 'available')::bigint < (entry ->> 'missing')::bigint then
      raise exception using errcode = 'P0001', message = 'code_exhausted', hint = entry ->> 'pattern';
    end if;
  end loop;

  -- Rank 6. Every counter this run uses, locked up front in ascending (prefix, width) order.
  insert into public.student_code_counters (academy_id, prefix, width)
  select p_academy_id, public.student_code_pattern_prefix(e ->> 'pattern'), public.student_code_pattern_width(e ->> 'pattern')
  from jsonb_array_elements(summary -> 'patterns') e
  on conflict do nothing;
  perform 1 from public.student_code_counters c
  where c.academy_id = p_academy_id
    and (c.prefix, c.width) in (
      select public.student_code_pattern_prefix(e ->> 'pattern'), public.student_code_pattern_width(e ->> 'pattern')::smallint
      from jsonb_array_elements(summary -> 'patterns') e
    )
  order by c.prefix collate "C", c.width
  for update;

  begin
    for holder in
      select r.id, r.level_id, r.academic_year_id, r.academy_student_profile_id,
        coalesce(st.version, 0) as state_version, coalesce(lp.pattern, config.default_pattern) as pattern
      from public.annual_student_records r
      left join public.student_code_states st on st.annual_student_record_id = r.id
      left join public.student_code_level_patterns lp on lp.academy_id = r.academy_id and lp.level_id = r.level_id
      where r.id = any (target_ids)
        and not exists (
          select 1 from public.student_code_assignments a
          where a.annual_student_record_id = r.id and a.retired_at is null
        )
      order by pg_catalog.lower(r.full_name), r.full_name, r.id
    loop
      code_prefix := public.student_code_pattern_prefix(holder.pattern);
      code_width := public.student_code_pattern_width(holder.pattern);
      counter_key := code_prefix || '#' || code_width::text;
      if cursors ? counter_key then
        cursor_value := (cursors ->> counter_key)::bigint;
      else
        select c.last_value into cursor_value from public.student_code_counters c
        where c.academy_id = p_academy_id and c.prefix = code_prefix and c.width = code_width;
        cursor_value := public.student_code_generation_before(cursor_value, p_start, p_step, p_parity);
      end if;
      cursor_value := public.student_code_next_free(p_academy_id, code_prefix, code_width, cursor_value, stride);
      if cursor_value is null then
        raise exception using errcode = 'P0001', message = 'code_exhausted', hint = holder.pattern;
      end if;
      cursors := jsonb_set(cursors, array[counter_key], to_jsonb(cursor_value));
      insert into public.student_code_assignments (
        academy_id, academic_year_id, academy_student_profile_id, annual_student_record_id,
        level_id, code, code_version, issued_by
      ) values (
        p_academy_id, holder.academic_year_id, holder.academy_student_profile_id, holder.id,
        holder.level_id, code_prefix || pg_catalog.lpad(cursor_value::text, code_width, '0'),
        holder.state_version + 1, actor
      );
      assigned := assigned + 1;
    end loop;
  exception when unique_violation then
    raise exception using errcode = 'P0001', message = 'code_taken', hint = 'generation';
  end;

  update public.student_code_counters c
  set last_value = greatest(c.last_value, (cursors ->> (c.prefix || '#' || c.width::text))::bigint)
  where c.academy_id = p_academy_id and cursors ? (c.prefix || '#' || c.width::text);

  result := jsonb_build_object(
    'targets', pg_catalog.cardinality(target_ids),
    'assigned', assigned,
    'skipped', pg_catalog.cardinality(target_ids) - assigned,
    'mode', p_mode,
    'ids', to_jsonb(ids),
    'settingsVersion', config.version,
    'options', jsonb_build_object('start', p_start, 'step', p_step, 'parity', p_parity),
    'order', 'name'
  );
  insert into public.student_code_requests (academy_id, request_key, actor_id, fingerprint, result)
  values (p_academy_id, p_request_key, actor, fingerprint_value, result);
  return result;
end;
$$;

revoke all on function public.student_code_generation_options(integer, integer, text) from public, anon, authenticated;
revoke all on function public.student_code_generation_stride(integer, text) from public, anon, authenticated;
revoke all on function public.student_code_generation_before(bigint, integer, integer, text) from public, anon, authenticated;
revoke all on function public.student_code_next_free(uuid, text, integer, bigint, bigint) from public, anon, authenticated;
revoke all on function public.student_code_capacity(uuid, text, integer, bigint, bigint) from public, anon, authenticated;
revoke all on function public.student_code_generation_summary(uuid, uuid, integer, text, text[], uuid[], integer, integer, text) from public, anon, authenticated;
revoke all on function public.preview_student_code_generation(uuid, text, text[], integer, integer, text) from public, anon;
revoke all on function public.generate_student_codes(uuid, text, text[], integer, text, uuid, integer, integer, text) from public, anon;
grant execute on function public.preview_student_code_generation(uuid, text, text[], integer, integer, text) to authenticated;
grant execute on function public.generate_student_codes(uuid, text, text[], integer, text, uuid, integer, integer, text) to authenticated;
