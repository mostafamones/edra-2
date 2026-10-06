-- Student codes: generate missing codes for many students at once (Plan 03).
--
-- A run targets exactly one scope in the academy's open academic year:
--   all     every active student record
--   levels  active records at one or more academy levels
--   groups  active records whose primary group is one of the given active groups
-- Archived records are never targets. Records that already hold a current code are skipped; only
-- missing codes are allocated, each from its record's effective format (level override, otherwise
-- the default), so one run may use several formats.
--
-- preview_student_code_generation is a read: counts, applicable formats with collision-aware
-- remaining capacity, a few advisory examples, levels without a format, and a token that identifies
-- the reviewed summary (settings version plus every missing record and its format). It reserves
-- nothing and moves no cursor.
--
-- generate_student_codes commits the whole reviewed run in one transaction or nothing. It rechecks
-- scope under locks and returns stale_preview when the summary the caller reviewed no longer holds
-- (different settings version, or a different set of missing records/formats). Codes are issued in
-- a deterministic order: lower(full_name), full_name, record id. Numbers are identifiers, not a
-- ranking. A run that would exhaust a format fails as a whole (code_exhausted) with no partial
-- assignments, and the cursors roll back with it. Students added after the run stay uncoded until
-- another run or an individual assignment.
--
-- Idempotency: the compact result ({ targets, assigned, skipped, mode, ids, settingsVersion, order })
-- is stored in student_code_requests under the caller's request key, fingerprinted by mode, scope,
-- expected version, and preview token. A retry with the same key and payload replays the original
-- counts; a different payload is idempotency_conflict.
--
-- Lock order (README "Lock graph"): settings FOR SHARE (1), target records FOR UPDATE in ascending id
-- order (3), the open year FOR SHARE (4), state rows through the ledger triggers (5), and the
-- formats' allocation counters FOR UPDATE in ascending (prefix, width) order (6). Settings writers
-- wait for a running generation and vice versa; two runs over overlapping records serialize on the
-- records, and runs over disjoint records serialize on the shared counters.

-- Whether a record at (level, group) falls inside a generation scope.
create or replace function public.student_code_generation_matches(
  p_mode text, p_level_ids text[], p_group_ids uuid[], p_level_id text, p_group_id uuid
)
returns boolean
language sql immutable set search_path = '' as $$
  select case p_mode
    when 'all' then true
    when 'levels' then p_level_id = any (p_level_ids)
    when 'groups' then p_group_id is not null and p_group_id = any (p_group_ids)
    else false
  end;
$$;

-- Validates and deduplicates a scope against the academy and its open year. Levels must be offered by
-- the academy and groups must be active groups of that year; anything else is invalid_target.
create or replace function public.student_code_generation_scope(
  p_academy_id uuid, p_year_id uuid, p_mode text, p_ids text[],
  out level_ids text[], out group_ids uuid[]
)
language plpgsql stable set search_path = '' as $$
declare
  ids text[];
begin
  level_ids := '{}';
  group_ids := '{}';
  if p_mode is null or p_mode <> all (array['all', 'levels', 'groups']) then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  select coalesce(array_agg(distinct v order by v), '{}') into ids
  from pg_catalog.unnest(coalesce(p_ids, '{}'::text[])) v where v is not null;
  if p_mode = 'all' then
    if pg_catalog.cardinality(ids) > 0 then
      raise exception using errcode = 'P0001', message = 'validation';
    end if;
    return;
  end if;
  if pg_catalog.cardinality(ids) = 0 or pg_catalog.cardinality(ids) > 100 then
    raise exception using errcode = 'P0001', message = 'validation', hint = 'targets';
  end if;
  if p_mode = 'levels' then
    if (select count(*) from public.academy_levels l
        where l.academy_id = p_academy_id and l.level_id = any (ids)) <> pg_catalog.cardinality(ids) then
      raise exception using errcode = 'P0001', message = 'invalid_target';
    end if;
    level_ids := ids;
  else
    if exists (select 1 from pg_catalog.unnest(ids) v
               where v !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
      raise exception using errcode = 'P0001', message = 'invalid_target';
    end if;
    select array_agg(distinct v::uuid order by v::uuid) into group_ids from pg_catalog.unnest(ids) v;
    if (select count(*) from public.groups g
        where g.academy_id = p_academy_id and g.academic_year_id = p_year_id and g.archived_at is null
          and g.id = any (group_ids)) <> pg_catalog.cardinality(group_ids) then
      raise exception using errcode = 'P0001', message = 'invalid_target';
    end if;
  end if;
end;
$$;

-- Active records in scope with whether each holds a current code and its effective format.
create or replace function public.student_code_generation_targets(
  p_academy_id uuid, p_year_id uuid, p_mode text, p_level_ids text[], p_group_ids uuid[]
)
returns table (record_id uuid, record_level_id text, coded boolean, pattern text)
language sql stable set search_path = '' as $$
  select r.id, r.level_id,
    exists (
      select 1 from public.student_code_assignments a
      where a.annual_student_record_id = r.id and a.retired_at is null
    ),
    coalesce(lp.pattern, s.default_pattern)
  from public.annual_student_records r
  left join public.student_code_settings s on s.academy_id = r.academy_id
  left join public.student_code_level_patterns lp on lp.academy_id = r.academy_id and lp.level_id = r.level_id
  where r.academy_id = p_academy_id and r.academic_year_id = p_year_id and r.archived_at is null
    and public.student_code_generation_matches(p_mode, p_level_ids, p_group_ids, r.level_id, r.primary_group_id);
$$;

-- The next value after p_after whose full code was never issued in the academy, or null when the
-- format has none left. Mirrors allocate_student_code: every issued string is skipped, including
-- manual codes and codes of overlapping formats.
create or replace function public.student_code_next_free(p_academy_id uuid, p_prefix text, p_width integer, p_after bigint)
returns bigint
language plpgsql set search_path = '' as $$
declare
  capacity bigint := (10::numeric ^ p_width)::bigint - 1;
  candidate bigint := p_after;
begin
  loop
    candidate := candidate + 1;
    if candidate > capacity then return null; end if;
    exit when not exists (
      select 1 from public.student_code_assignments a
      where a.academy_id = p_academy_id and a.code = p_prefix || pg_catalog.lpad(candidate::text, p_width, '0')
    );
  end loop;
  return candidate;
end;
$$;

-- How many values after p_after the format can still issue: the remaining range minus codes already
-- issued in it. Digit tails are compared as fixed-width strings; codes are never converted to numbers.
create or replace function public.student_code_capacity(p_academy_id uuid, p_prefix text, p_width integer, p_after bigint)
returns bigint
language sql stable set search_path = '' as $$
  select ((10::numeric ^ p_width)::bigint - 1 - p_after) - (
    select count(distinct a.code) from public.student_code_assignments a
    where a.academy_id = p_academy_id
      and pg_catalog.char_length(a.code) = pg_catalog.char_length(p_prefix) + p_width
      and pg_catalog.left(a.code, pg_catalog.char_length(p_prefix)) = p_prefix
      and pg_catalog.substr(a.code, pg_catalog.char_length(p_prefix) + 1) ~ '^[0-9]+$'
      and pg_catalog.substr(a.code, pg_catalog.char_length(p_prefix) + 1) collate "C"
        > pg_catalog.lpad(p_after::text, p_width, '0') collate "C"
  );
$$;

-- The reviewable summary of a scope:
-- { settingsVersion, token, targets, coded, missing,
--   patterns: [{ pattern, levelIds, missing, available, examples }],
--   missingFormat: [{ levelId, missing }] }
-- Formats sharing a prefix and width share one counter and appear once. Examples are the next free
-- values right now and are advisory: other assignments may take them first.
create or replace function public.student_code_generation_summary(
  p_academy_id uuid, p_year_id uuid, p_version integer, p_mode text, p_level_ids text[], p_group_ids uuid[]
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
begin
  select count(*), count(*) filter (where t.coded),
    pg_catalog.md5(p_version::text || ':' || coalesce(
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
    candidate := cursor_value;
    for i in 1..3 loop
      candidate := public.student_code_next_free(p_academy_id, entry.code_prefix, entry.code_width, candidate);
      exit when candidate is null;
      examples := examples || (entry.code_prefix || pg_catalog.lpad(candidate::text, entry.code_width, '0'));
    end loop;
    patterns := patterns || jsonb_build_object(
      'pattern', entry.code_prefix || pg_catalog.repeat('#', entry.code_width),
      'levelIds', to_jsonb(entry.level_ids),
      'missing', entry.n,
      'available', public.student_code_capacity(p_academy_id, entry.code_prefix, entry.code_width, cursor_value),
      'examples', to_jsonb(examples)
    );
  end loop;

  return jsonb_build_object(
    'settingsVersion', p_version,
    'token', token,
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
create or replace function public.preview_student_code_generation(p_academy_id uuid, p_mode text, p_ids text[])
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
  select * into scope from public.student_code_generation_scope(p_academy_id, open_year, p_mode, p_ids);
  return public.student_code_generation_summary(p_academy_id, open_year, config.version, p_mode, scope.level_ids, scope.group_ids);
end;
$$;

-- Issues every missing code in the reviewed scope in one transaction, or nothing. Every staff role
-- may run it while codes are on. Raises forbidden, validation, codes_disabled, year_unavailable,
-- invalid_target, stale_preview, pattern_missing (hint: level id), code_exhausted (hint: format),
-- code_taken (a concurrent manual assignment took a value mid-run), or idempotency_conflict.
create or replace function public.generate_student_codes(
  p_academy_id uuid, p_mode text, p_ids text[], p_expected_version integer, p_preview_token text, p_request_key uuid
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
begin
  if actor is null or p_academy_id is null or public.academy_role_for(p_academy_id) is null then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  if p_request_key is null or p_expected_version is null or p_expected_version < 1
    or p_preview_token is null or p_preview_token !~ '^[0-9a-f]{32}$'
    or p_mode is null or p_mode <> all (array['all', 'levels', 'groups']) then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  select coalesce(array_agg(distinct v order by v), '{}') into ids
  from pg_catalog.unnest(coalesce(p_ids, '{}'::text[])) v where v is not null;
  fingerprint_value := 'generate_many:' || p_mode || ':' || pg_catalog.array_to_string(ids, ',')
    || ':' || p_expected_version::text || ':' || p_preview_token;

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
    p_academy_id, open_year, config.version, p_mode, scope.level_ids, scope.group_ids);
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
      end if;
      cursor_value := public.student_code_next_free(p_academy_id, code_prefix, code_width, cursor_value);
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
  set last_value = (cursors ->> (c.prefix || '#' || c.width::text))::bigint
  where c.academy_id = p_academy_id and cursors ? (c.prefix || '#' || c.width::text);

  result := jsonb_build_object(
    'targets', pg_catalog.cardinality(target_ids),
    'assigned', assigned,
    'skipped', pg_catalog.cardinality(target_ids) - assigned,
    'mode', p_mode,
    'ids', to_jsonb(ids),
    'settingsVersion', config.version,
    'order', 'name'
  );
  insert into public.student_code_requests (academy_id, request_key, actor_id, fingerprint, result)
  values (p_academy_id, p_request_key, actor, fingerprint_value, result);
  return result;
end;
$$;

revoke all on function public.student_code_generation_matches(text, text[], uuid[], text, uuid) from public, anon, authenticated;
revoke all on function public.student_code_generation_scope(uuid, uuid, text, text[]) from public, anon, authenticated;
revoke all on function public.student_code_generation_targets(uuid, uuid, text, text[], uuid[]) from public, anon, authenticated;
revoke all on function public.student_code_next_free(uuid, text, integer, bigint) from public, anon, authenticated;
revoke all on function public.student_code_capacity(uuid, text, integer, bigint) from public, anon, authenticated;
revoke all on function public.student_code_generation_summary(uuid, uuid, integer, text, text[], uuid[]) from public, anon, authenticated;
revoke all on function public.preview_student_code_generation(uuid, text, text[]) from public, anon;
revoke all on function public.generate_student_codes(uuid, text, text[], integer, text, uuid) from public, anon;
grant execute on function public.preview_student_code_generation(uuid, text, text[]) to authenticated;
grant execute on function public.generate_student_codes(uuid, text, text[], integer, text, uuid) to authenticated;
