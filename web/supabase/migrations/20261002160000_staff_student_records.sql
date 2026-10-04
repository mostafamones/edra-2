-- Staff-managed academy student records.
--
-- An academy student profile is the persistent internal identity of a student inside one academy.
-- Each academic year holds at most one annual student record per profile with the student's name,
-- contact phones, level/track placement, optional primary group, and participation type.
-- No authentication account is created or linked here; account linking is a later slice.
--
-- Clients read through RLS. Every write goes through the RPCs below, which check the caller's
-- membership and role before writing; authenticated users have no direct insert/update/delete.
-- Errors raised for the application use SQLSTATE P0001 with a stable code as the message.

create type public.student_participation_type as enum ('in_person', 'online_only');

-- Mirrors normalizeEgyptianPhone in src/lib/phone.ts: returns the canonical +201XXXXXXXXX form or NULL.
create or replace function public.normalize_egyptian_phone(value text)
returns text language plpgsql immutable set search_path = '' as $$
declare national text;
begin
  if value is null then return null; end if;
  national := pg_catalog.regexp_replace(value, '[[:space:]().-]', '', 'g');
  if national like '0020%' then national := pg_catalog.substr(national, 5);
  elsif national like '+20%' then national := pg_catalog.substr(national, 4);
  elsif national like '20%' then national := pg_catalog.substr(national, 3);
  end if;
  if national like '0%' then national := pg_catalog.substr(national, 2); end if;
  national := '+20' || national;
  return case when national ~ '^\+201[0125][0-9]{8}$' then national end;
end;
$$;

create table public.academy_student_profiles (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.academies (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles (id),
  unique (academy_id, id)
);

create table public.annual_student_records (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null,
  academic_year_id uuid not null,
  academy_student_profile_id uuid not null,
  full_name text not null
    check (char_length(full_name) between 1 and 200 and full_name !~ '^[[:space:]]|[[:space:]]$'),
  student_phone text not null check (student_phone ~ '^\+201[0125][0-9]{8}$'),
  parent_phone text not null check (parent_phone ~ '^\+201[0125][0-9]{8}$'),
  level_id text not null,
  track_id uuid,
  primary_group_id uuid,
  participation_type public.student_participation_type not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references public.profiles (id),
  version integer not null default 1 check (version >= 1),
  constraint annual_student_records_one_per_year unique (academy_student_profile_id, academic_year_id),
  -- Archived records keep their phone reserved for the year.
  constraint annual_student_records_student_phone_unique unique (academy_id, academic_year_id, student_phone),
  foreign key (academy_id, academy_student_profile_id)
    references public.academy_student_profiles (academy_id, id),
  foreign key (academy_id, academic_year_id)
    references public.academic_years (academy_id, id),
  foreign key (academy_id, level_id)
    references public.academy_levels (academy_id, level_id),
  foreign key (academy_id, level_id, track_id)
    references public.academy_tracks (academy_id, level_id, id),
  foreign key (academy_id, academic_year_id, primary_group_id)
    references public.groups (academy_id, academic_year_id, id)
);

create index annual_student_records_listing_idx
  on public.annual_student_records (academy_id, academic_year_id, (archived_at is null), lower(full_name), id);
create index annual_student_records_program_idx
  on public.annual_student_records (academy_id, academic_year_id, level_id, track_id);
create index annual_student_records_group_idx
  on public.annual_student_records (primary_group_id) where primary_group_id is not null;

-- Year, placement, immutability, and archive rules for every write, plus version/updated_at upkeep.
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
      or placed.track_id is distinct from new.track_id then
      raise exception using errcode = 'P0001', message = 'invalid_placement',
        hint = 'Choose an active group in the same level and track.';
    end if;
  end if;
  return new;
end;
$$;

create trigger annual_student_records_validate before insert or update on public.annual_student_records
for each row execute function public.validate_student_record_write();

-- Groups referenced by schedules or any student record (active or archived) keep their program
-- and cannot be archived.
create or replace function public.protect_group_dependencies()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.level_id, new.track_id) is distinct from (old.level_id, old.track_id)
    or (new.archived_at is not null and old.archived_at is null) then
    if exists (select 1 from public.schedules s where s.group_id = old.id) then
      raise exception 'Group has schedules and cannot change program or be archived';
    end if;
    if exists (select 1 from public.annual_student_records r where r.primary_group_id = old.id) then
      raise exception 'Group has student records and cannot change program or be archived';
    end if;
  end if;
  return new;
end;
$$;

alter table public.academy_student_profiles enable row level security;
alter table public.annual_student_records enable row level security;
revoke all on public.academy_student_profiles, public.annual_student_records from public, anon, authenticated;
grant select on public.academy_student_profiles, public.annual_student_records to authenticated;

create policy academy_student_profiles_select_members on public.academy_student_profiles
  for select to authenticated using (public.is_academy_member(academy_id));
create policy annual_student_records_select_members on public.annual_student_records
  for select to authenticated using (public.is_academy_member(academy_id));

-- Shared input checks for create and update. Returns the normalized phones.
create or replace function public.check_student_record_input(
  p_full_name text, p_student_phone text, p_parent_phone text, p_level_id text,
  p_participation_type public.student_participation_type,
  out full_name text, out student_phone text, out parent_phone text
) language plpgsql immutable set search_path = '' as $$
begin
  full_name := pg_catalog.btrim(coalesce(p_full_name, ''));
  student_phone := public.normalize_egyptian_phone(p_student_phone);
  parent_phone := public.normalize_egyptian_phone(p_parent_phone);
  if char_length(full_name) not between 1 and 200 then
    raise exception using errcode = 'P0001', message = 'validation', hint = 'full_name';
  end if;
  if student_phone is null then
    raise exception using errcode = 'P0001', message = 'validation', hint = 'student_phone';
  end if;
  if parent_phone is null then
    raise exception using errcode = 'P0001', message = 'validation', hint = 'parent_phone';
  end if;
  if p_level_id is null or p_participation_type is null then
    raise exception using errcode = 'P0001', message = 'validation', hint = 'placement';
  end if;
end;
$$;

create or replace function public.create_student_record(
  p_academy_id uuid, p_academic_year_id uuid, p_full_name text,
  p_student_phone text, p_parent_phone text,
  p_level_id text, p_track_id uuid, p_primary_group_id uuid,
  p_participation_type public.student_participation_type
)
returns table (id uuid, version integer)
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  checked record;
  profile_id uuid;
  constraint_name text;
begin
  if actor is null or public.academy_role_for(p_academy_id) is null then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  select * into checked from public.check_student_record_input(
    p_full_name, p_student_phone, p_parent_phone, p_level_id, p_participation_type);
  -- The form's loaded year must still be the open year; a stale form never writes into another year.
  if not exists (
    select 1 from public.academic_years y
    where y.id = p_academic_year_id and y.academy_id = p_academy_id and y.closed_at is null
  ) then
    raise exception using errcode = 'P0001', message = 'year_unavailable';
  end if;

  begin
    insert into public.academy_student_profiles (academy_id, created_by)
    values (p_academy_id, actor) returning academy_student_profiles.id into profile_id;
    return query
      insert into public.annual_student_records as r (
        academy_id, academic_year_id, academy_student_profile_id, full_name, student_phone, parent_phone,
        level_id, track_id, primary_group_id, participation_type, created_by
      ) values (
        p_academy_id, p_academic_year_id, profile_id, checked.full_name, checked.student_phone,
        checked.parent_phone, p_level_id, p_track_id, p_primary_group_id, p_participation_type, actor
      ) returning r.id, r.version;
  exception
    when unique_violation then
      get stacked diagnostics constraint_name = constraint_name;
      if constraint_name = 'annual_student_records_student_phone_unique' then
        raise exception using errcode = 'P0001', message = 'duplicate_student_phone';
      end if;
      raise;
    when foreign_key_violation then
      raise exception using errcode = 'P0001', message = 'invalid_placement';
  end;
end;
$$;

create or replace function public.update_student_record(
  p_record_id uuid, p_expected_version integer, p_academy_id uuid, p_full_name text,
  p_student_phone text, p_parent_phone text,
  p_level_id text, p_track_id uuid, p_primary_group_id uuid,
  p_participation_type public.student_participation_type
)
returns table (id uuid, version integer)
language plpgsql security definer set search_path = '' as $$
declare
  actor_role public.academy_role := public.academy_role_for(p_academy_id);
  checked record;
  existing public.annual_student_records%rowtype;
  constraint_name text;
begin
  if auth.uid() is null or actor_role is null then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  select * into checked from public.check_student_record_input(
    p_full_name, p_student_phone, p_parent_phone, p_level_id, p_participation_type);

  select r.* into existing from public.annual_student_records r
  where r.id = p_record_id and r.academy_id = p_academy_id
  for update;
  if not found then raise exception using errcode = 'P0001', message = 'not_found'; end if;
  if existing.archived_at is not null then
    raise exception using errcode = 'P0001', message = 'archived_record';
  end if;
  if existing.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale_record';
  end if;
  -- Instructors edit names and contact details only.
  if actor_role = 'instructor' and (p_level_id, p_track_id, p_primary_group_id, p_participation_type)
    is distinct from (existing.level_id, existing.track_id, existing.primary_group_id, existing.participation_type) then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;

  begin
    return query
      update public.annual_student_records as r set
        full_name = checked.full_name, student_phone = checked.student_phone,
        parent_phone = checked.parent_phone, level_id = p_level_id, track_id = p_track_id,
        primary_group_id = p_primary_group_id, participation_type = p_participation_type
      where r.id = p_record_id
      returning r.id, r.version;
  exception
    when unique_violation then
      get stacked diagnostics constraint_name = constraint_name;
      if constraint_name = 'annual_student_records_student_phone_unique' then
        raise exception using errcode = 'P0001', message = 'duplicate_student_phone';
      end if;
      raise;
    when foreign_key_violation then
      raise exception using errcode = 'P0001', message = 'invalid_placement';
  end;
end;
$$;

-- Archives or restores a batch atomically. p_records is [{ "id": uuid, "version": int }, ...].
-- Every target must exist in the academy/year at the expected version, or nothing changes.
-- Targets already in the requested state are left alone. Returns the ids that changed.
create or replace function public.set_student_records_archived(
  p_academy_id uuid, p_academic_year_id uuid, p_records jsonb, p_archived boolean
)
returns setof uuid
language plpgsql security definer set search_path = '' as $$
declare
  ids uuid[];
  versions integer[];
  locked_count integer;
  stale boolean;
begin
  if auth.uid() is null or coalesce(public.academy_role_for(p_academy_id)::text, '') not in ('owner', 'admin') then
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
$$;

-- One page of the academy's annual student records with joined labels and the total match count.
-- Runs as the caller, so RLS limits it to academies the caller belongs to. Sorting is allowlisted;
-- every filter and search value is passed as a bound parameter.
create or replace function public.list_student_records(
  p_academy_id uuid, p_academic_year_id uuid, p_search text, p_status text,
  p_level_id text, p_track text, p_group text, p_participation_type text,
  p_sorts jsonb, p_page_index integer, p_page_size integer
)
returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  term text := nullif(pg_catalog.btrim(coalesce(p_search, '')), '');
  pattern text;
  digits text;
  status text := coalesce(p_status, 'active');
  sort jsonb;
  sort_expr text;
  order_sql text := '';
  seen text[] := '{}';
  base text;
  total bigint;
  page jsonb;
begin
  if not public.is_academy_member(p_academy_id) then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  if p_page_size is null or p_page_size not in (10, 20, 50, 100) or p_page_index is null or p_page_index < 0
    or status not in ('active', 'archived', 'all')
    or (p_participation_type is not null and p_participation_type not in ('in_person', 'online_only'))
    or (p_sorts is not null and (jsonb_typeof(p_sorts) <> 'array' or jsonb_array_length(p_sorts) > 3)) then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;

  if term is not null then
    term := left(term, 100);
    -- Backslash is LIKE's default escape character: match %, _ and \ literally.
    pattern := '%' || replace(replace(replace(term, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    -- Phone-like searches also match stored +20 numbers when typed in domestic (01…) or 0020 form.
    if term ~ '^[+0-9[:space:]().-]+$' then
      digits := pg_catalog.regexp_replace(term, '[^0-9]', '', 'g');
      if digits like '00%' then digits := substr(digits, 3);
      elsif digits like '0%' then digits := substr(digits, 2);
      end if;
      digits := nullif(digits, '');
    end if;
  end if;

  for sort in select value from jsonb_array_elements(coalesce(p_sorts, '[]'::jsonb)) loop
    if (sort ->> 'id') = any(seen) then raise exception using errcode = 'P0001', message = 'validation'; end if;
    seen := seen || (sort ->> 'id');
    sort_expr := case sort ->> 'id'
      when 'name' then 'lower(r.full_name)'
      when 'studentPhone' then 'r.student_phone'
      when 'parentPhone' then 'r.parent_phone'
      when 'level' then 'al.sort_order'
      when 'track' then 'lower(t.name)'
      when 'group' then 'lower(g.name)'
      when 'participationType' then 'r.participation_type'
      when 'status' then '(r.archived_at is not null)'
      when 'createdAt' then 'r.created_at'
    end;
    if sort_expr is null or jsonb_typeof(sort -> 'desc') is distinct from 'boolean' then
      raise exception using errcode = 'P0001', message = 'validation';
    end if;
    order_sql := order_sql || sort_expr || case when (sort ->> 'desc')::boolean then ' desc' else ' asc' end || ' nulls last, ';
  end loop;
  if order_sql = '' then order_sql := 'lower(r.full_name) asc, '; end if;
  order_sql := order_sql || 'r.id asc';

  base := $q$
    from public.annual_student_records r
    join public.academy_levels al on al.academy_id = r.academy_id and al.level_id = r.level_id
    join public.global_levels gl on gl.id = r.level_id
    left join public.academy_tracks t on t.id = r.track_id
    left join public.groups g on g.id = r.primary_group_id
    where r.academy_id = $1 and r.academic_year_id = $2
      and ($3 = 'all' or ($3 = 'active') = (r.archived_at is null))
      and ($4::text is null or r.level_id = $4)
      and ($5::text is null or ($5 = 'none' and r.track_id is null) or r.track_id::text = $5)
      and ($6::text is null or ($6 = 'none' and r.primary_group_id is null) or r.primary_group_id::text = $6)
      and ($7::text is null or r.participation_type::text = $7)
      and ($8::text is null
        or r.full_name ilike $8 or gl.name ilike $8 or t.name ilike $8 or g.name ilike $8
        or r.student_phone ilike $8 or r.parent_phone ilike $8
        or ($9::text is not null and (r.student_phone like '%' || $9 || '%' or r.parent_phone like '%' || $9 || '%')))
  $q$;

  execute 'select count(*) ' || base into total
    using p_academy_id, p_academic_year_id, status, p_level_id, p_track, p_group, p_participation_type, pattern, digits;

  execute format($q$
    select coalesce(jsonb_agg(to_jsonb(x) - 'ord' order by x.ord), '[]'::jsonb) from (
      select row_number() over (order by %1$s) as ord,
        r.id, r.academy_student_profile_id, r.full_name, r.student_phone, r.parent_phone,
        r.level_id, gl.name as level_name, r.track_id, t.name as track_name,
        r.primary_group_id, g.name as group_name, r.participation_type,
        r.archived_at, r.created_at, r.updated_at, r.version
      %2$s
      order by %1$s
      limit $10 offset $11
    ) x
  $q$, order_sql, base) into page
    using p_academy_id, p_academic_year_id, status, p_level_id, p_track, p_group, p_participation_type, pattern, digits,
      p_page_size, p_page_index * p_page_size;

  return jsonb_build_object('rows', page, 'total', total);
end;
$$;

revoke all on function public.normalize_egyptian_phone(text) from public, anon;
revoke all on function public.validate_student_record_write() from public, anon, authenticated;
revoke all on function public.protect_group_dependencies() from public, anon, authenticated;
revoke all on function public.check_student_record_input(text, text, text, text, public.student_participation_type) from public, anon, authenticated;
revoke all on function public.create_student_record(uuid, uuid, text, text, text, text, uuid, uuid, public.student_participation_type) from public, anon;
revoke all on function public.update_student_record(uuid, integer, uuid, text, text, text, text, uuid, uuid, public.student_participation_type) from public, anon;
revoke all on function public.set_student_records_archived(uuid, uuid, jsonb, boolean) from public, anon;
revoke all on function public.list_student_records(uuid, uuid, text, text, text, text, text, text, jsonb, integer, integer) from public, anon;

grant execute on function public.normalize_egyptian_phone(text) to authenticated;
grant execute on function public.create_student_record(uuid, uuid, text, text, text, text, uuid, uuid, public.student_participation_type) to authenticated;
grant execute on function public.update_student_record(uuid, integer, uuid, text, text, text, text, uuid, uuid, public.student_participation_type) to authenticated;
grant execute on function public.set_student_records_archived(uuid, uuid, jsonb, boolean) to authenticated;
grant execute on function public.list_student_records(uuid, uuid, text, text, text, text, text, text, jsonb, integer, integer) to authenticated;
