-- Student online-access suspension management (EDRA-277).
--
-- * Manual suspension stays academy_student_profiles.access_suspended_at (the EDRA-155 enforcement
--   baseline): it belongs to the persistent academy profile, across annual records, and is independent
--   of the archival cause (annual_student_records.archived_at). Enforcement is unchanged:
--   edra_private.student_access_suspended still combines both causes.
-- * access_suspension_revision is a profile-level counter, separate from annual-record versions, that
--   every actual change increments. Existing suspensions keep their timestamp at revision 0 with no
--   event: their history is unknown and is not fabricated.
-- * student_access_suspension_events is append-only: one row per actual change, with the action,
--   actor, timestamp and optional staff-only reason. Academy staff read it (RLS); students, parents,
--   anonymous callers and other academies cannot. Nobody writes it directly.
-- * set_student_access_suspension is the one desired-state command for individual and bulk actions.
--   Managers only, rechecked live. It may target archived and closed-year records: the change is to
--   the profile, never to the annual record, its version or its year.
--
-- Lock order: annual records FOR KEY SHARE in id order, then profiles FOR UPDATE in id order. Enrollment
-- links lock the matched record FOR SHARE before updating its profile, and archive/restore lock records
-- FOR UPDATE without touching profiles, so every path takes record locks before profile locks.
begin;

alter table public.academy_student_profiles
  add column access_suspension_revision integer not null default 0
    constraint academy_student_profiles_access_suspension_revision_check check (access_suspension_revision >= 0);

create table public.student_access_suspension_events (
  id bigint generated always as identity primary key,
  academy_id uuid not null,
  academy_student_profile_id uuid not null,
  revision integer not null check (revision >= 1),
  action text not null check (action in ('suspended', 'restored')),
  -- Null only after the acting account is deleted.
  actor_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  reason text check (reason is null or (char_length(reason) between 1 and 500 and reason = pg_catalog.btrim(reason))),
  constraint student_access_suspension_events_profile_fkey foreign key (academy_id, academy_student_profile_id)
    references public.academy_student_profiles (academy_id, id) on delete cascade,
  -- One event per revision; also the latest-event index (revision desc).
  constraint student_access_suspension_events_revision_key unique (academy_student_profile_id, revision)
);
create index student_access_suspension_events_academy_idx on public.student_access_suspension_events (academy_id);
create index student_access_suspension_events_actor_idx on public.student_access_suspension_events (actor_id);

create function edra_private.protect_student_access_suspension_event()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = 'validation', hint = 'Suspension events are append-only.';
end;
$$;
create trigger student_access_suspension_events_append_only
before update on public.student_access_suspension_events
for each row execute function edra_private.protect_student_access_suspension_event();

alter table public.student_access_suspension_events enable row level security;
create policy student_access_suspension_events_select_staff on public.student_access_suspension_events
  for select to authenticated using (public.is_academy_member(academy_id));
revoke all on table public.student_access_suspension_events from public, anon, authenticated;
grant select on table public.student_access_suspension_events to authenticated;

-- The caller, when they hold live Owner, Head Admin or Admin authority in the academy; otherwise `forbidden`.
create function edra_private.require_student_manager(p_academy_id uuid)
returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_academy_id is null
    or coalesce(public.academy_role_for(p_academy_id)::text, '') not in ('owner', 'head_admin', 'admin') then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  return auth.uid();
end;
$$;
revoke all on function edra_private.require_student_manager(uuid) from public, anon, authenticated;

-- Fresh state for a selection before confirmation: each existing record in the academy (any year or
-- archive state) with its profile's current suspension and revision. Missing IDs are omitted.
create function public.preview_student_access_suspension(p_academy_id uuid, p_record_ids uuid[])
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  target_ids uuid[];
begin
  perform edra_private.require_student_manager(p_academy_id);
  if p_record_ids is null or array_position(p_record_ids, null::uuid) is not null then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  target_ids := array(select distinct t.id from unnest(p_record_ids) as t(id));
  if cardinality(target_ids) not between 1 and 500 then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'record_id', r.id,
      'profile_id', p.id,
      'full_name', r.full_name,
      'academic_year_id', r.academic_year_id,
      'archived', r.archived_at is not null,
      'year_closed', y.closed_at is not null,
      'connected', p.user_id is not null,
      'suspended', p.access_suspended_at is not null,
      'revision', p.access_suspension_revision
    ) order by lower(r.full_name), r.id)
    from public.annual_student_records r
    join public.academy_student_profiles p on p.academy_id = r.academy_id and p.id = r.academy_student_profile_id
    join public.academic_years y on y.id = r.academic_year_id
    where r.academy_id = p_academy_id and r.id = any(target_ids)
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.preview_student_access_suspension(uuid, uuid[]) from public, anon;
grant execute on function public.preview_student_access_suspension(uuid, uuid[]) to authenticated;

-- Sets manual suspension to the desired state for the profiles of explicit annual records, in one
-- transaction. p_records: [{ "id": <record id>, "revision": <suspension revision last seen> }], at most
-- 500. Profiles already in the desired state are unchanged (no event, latest reason kept). A profile
-- that needs a change must still be at the expected revision; otherwise the whole batch is rejected
-- (`stale_suspension`), so a delayed retry never reverses a newer opposing action.
-- Returns { "changed": [{ record_id, profile_id, revision }], "unchanged": [same] }.
create function public.set_student_access_suspension(p_academy_id uuid, p_records jsonb, p_suspended boolean, p_reason text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := edra_private.require_student_manager(p_academy_id);
  reason text := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
  ids uuid[];
  revisions integer[];
  matched integer;
  result jsonb;
begin
  if p_suspended is null or p_records is null or jsonb_typeof(p_records) <> 'array'
    or jsonb_array_length(p_records) not between 1 and 500
    or (reason is not null and char_length(reason) > 500) then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  begin
    -- Repeated IDs collapse; the same ID with different revisions is ambiguous.
    select array_agg(e.id order by e.id), array_agg(e.revision order by e.id) into ids, revisions
    from (select distinct x.id, x.revision from jsonb_to_recordset(p_records) as x (id uuid, revision integer)) e;
  exception when others then
    raise exception using errcode = 'P0001', message = 'validation';
  end;
  if array_position(ids, null) is not null or array_position(revisions, null) is not null
    or (select count(distinct t) from unnest(ids) t) <> cardinality(ids)
    or exists (select 1 from unnest(revisions) v where v < 0) then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;

  select count(*) into matched from (
    select r.id from public.annual_student_records r
    where r.academy_id = p_academy_id and r.id = any(ids) order by r.id for key share
  ) locked;
  if matched <> cardinality(ids) then raise exception using errcode = 'P0001', message = 'not_found'; end if;

  perform 1 from public.academy_student_profiles p
  where p.academy_id = p_academy_id and p.id in (
    select r.academy_student_profile_id from public.annual_student_records r where r.id = any(ids))
  order by p.id for update;

  -- Only profiles that need a change are revision-checked; ones already in the desired state are unchanged.
  if exists (
    select 1 from unnest(ids, revisions) as t (id, revision)
    join public.annual_student_records r on r.id = t.id
    join public.academy_student_profiles p on p.academy_id = r.academy_id and p.id = r.academy_student_profile_id
    where (p.access_suspended_at is not null) <> p_suspended and p.access_suspension_revision <> t.revision
  ) then
    raise exception using errcode = 'P0001', message = 'stale_suspension';
  end if;

  with targets as (
    select t.id as record_id, p.id as profile_id, p.access_suspension_revision as revision,
      (p.access_suspended_at is not null) <> p_suspended as needs_change
    from unnest(ids) as t (id)
    join public.annual_student_records r on r.id = t.id
    join public.academy_student_profiles p on p.academy_id = r.academy_id and p.id = r.academy_student_profile_id
  ), changed as (
    update public.academy_student_profiles p
    set access_suspended_at = case when p_suspended then now() end,
      access_suspension_revision = p.access_suspension_revision + 1
    where p.id in (select profile_id from targets where needs_change)
    returning p.id, p.academy_id, p.access_suspension_revision
  ), events as (
    insert into public.student_access_suspension_events (academy_id, academy_student_profile_id, revision, action, actor_id, reason)
    select c.academy_id, c.id, c.access_suspension_revision, case when p_suspended then 'suspended' else 'restored' end, actor, reason
    from changed c order by c.id
    returning academy_student_profile_id, revision
  )
  select jsonb_build_object(
    'changed', coalesce(jsonb_agg(jsonb_build_object('record_id', t.record_id, 'profile_id', t.profile_id, 'revision', e.revision) order by t.record_id) filter (where t.needs_change), '[]'::jsonb),
    'unchanged', coalesce(jsonb_agg(jsonb_build_object('record_id', t.record_id, 'profile_id', t.profile_id, 'revision', t.revision) order by t.record_id) filter (where not t.needs_change), '[]'::jsonb)
  ) into result
  from targets t left join events e on e.academy_student_profile_id = t.profile_id;

  return result;
end;
$$;
revoke all on function public.set_student_access_suspension(uuid, jsonb, boolean, text) from public, anon;
grant execute on function public.set_student_access_suspension(uuid, jsonb, boolean, text) to authenticated;

-- One record's suspension state and its profile's latest manual change, for any academy staff member.
-- The actor's name comes through this definer function because former staff profiles are not readable.
create function public.get_student_access_suspension(p_academy_id uuid, p_record_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  result jsonb;
begin
  if p_academy_id is null or p_record_id is null or not public.is_academy_member(p_academy_id) then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  select jsonb_build_object(
    'connected', p.user_id is not null,
    'suspended', p.access_suspended_at is not null,
    'suspended_at', p.access_suspended_at,
    'archived', r.archived_at is not null,
    'revision', p.access_suspension_revision,
    'latest', (
      select jsonb_build_object('action', e.action, 'reason', e.reason, 'created_at', e.created_at,
        'actor_name', coalesce(pr.display_name, pr.full_name))
      from public.student_access_suspension_events e
      left join public.profiles pr on pr.id = e.actor_id
      where e.academy_student_profile_id = p.id
      order by e.revision desc limit 1
    )
  ) into result
  from public.annual_student_records r
  join public.academy_student_profiles p on p.academy_id = r.academy_id and p.id = r.academy_student_profile_id
  where r.academy_id = p_academy_id and r.id = p_record_id;
  if result is null then raise exception using errcode = 'P0001', message = 'not_found'; end if;
  return result;
end;
$$;
revoke all on function public.get_student_access_suspension(uuid, uuid) from public, anon;
grant execute on function public.get_student_access_suspension(uuid, uuid) to authenticated;

-- The list gains explicit manual suspension, connection and revision per row, and an online-access
-- filter applied before counting and paging: 'suspended' (manual, connected or not) or 'has_access'
-- (connected, no manual suspension, listed record not archived). Null adds no restriction. The default
-- keeps earlier callers working; the old signature is dropped so the RPC has one overload.
drop function public.list_student_records(uuid, uuid, text, text, text, text, text, text, jsonb, integer, integer, uuid[], boolean);
create function public.list_student_records(p_academy_id uuid, p_academic_year_id uuid, p_search text, p_status text, p_level_id text, p_track text, p_group text, p_participation_type text, p_sorts jsonb, p_page_index integer, p_page_size integer, p_label_ids uuid[] default null, p_unlabeled boolean default false, p_access text default null)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  term text := nullif(pg_catalog.btrim(coalesce(p_search, '')), '');
  pattern text;
  digits text;
  status text := coalesce(p_status, 'active');
  label_ids uuid[] := coalesce(p_label_ids, '{}');
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
    or (p_sorts is not null and (jsonb_typeof(p_sorts) <> 'array' or jsonb_array_length(p_sorts) > 3))
    or p_unlabeled is null or cardinality(label_ids) > 100 or (p_unlabeled and cardinality(label_ids) > 0)
    or (p_access is not null and p_access not in ('suspended', 'has_access')) then
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
      when 'track' then 'lower(edra_private.track_label(r.track_id,r.academic_year_id))'
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
    join public.academy_student_profiles p on p.id = r.academy_student_profile_id and p.academy_id = r.academy_id
    where r.academy_id = $1 and r.academic_year_id = $2
      and ($3 = 'all' or ($3 = 'active') = (r.archived_at is null))
      and ($4::text is null or r.level_id = $4)
      and ($5::text is null or ($5 = 'none' and r.track_id is null) or r.track_id::text = $5)
      and ($6::text is null or ($6 = 'none' and r.primary_group_id is null) or r.primary_group_id::text = $6)
      and ($7::text is null or r.participation_type::text = $7)
      and ($8::text is null
        or r.full_name ilike $8 or gl.name ilike $8 or edra_private.track_label(r.track_id,r.academic_year_id) ilike $8 or g.name ilike $8
        or r.student_phone ilike $8 or r.parent_phone ilike $8
        or exists (
          select 1 from public.student_code_settings s
          join public.student_code_assignments a on a.academy_id = s.academy_id
          where s.academy_id = r.academy_id and s.enabled
            and a.annual_student_record_id = r.id and a.academic_year_id = r.academic_year_id
            and a.retired_at is null and a.code ilike $8
        )
        or ($9::text is not null and (r.student_phone like '%' || $9 || '%' or r.parent_phone like '%' || $9 || '%')))
      and (cardinality($10::uuid[]) = 0 or exists (
        select 1 from public.annual_student_record_labels sl where sl.annual_student_record_id = r.id and sl.label_id = any($10::uuid[])))
      and (not $11::boolean or not exists (
        select 1 from public.annual_student_record_labels sl where sl.annual_student_record_id = r.id))
      and ($14::text is null
        or ($14 = 'suspended' and p.access_suspended_at is not null)
        or ($14 = 'has_access' and p.user_id is not null and p.access_suspended_at is null and r.archived_at is null))
  $q$;

  execute 'select count(*) ' || base into total
    using p_academy_id, p_academic_year_id, status, p_level_id, p_track, p_group, p_participation_type, pattern, digits, label_ids, p_unlabeled,
      null::integer, null::integer, p_access;

  execute format($q$
    select coalesce(jsonb_agg(to_jsonb(x) - 'ord' order by x.ord), '[]'::jsonb) from (
      select row_number() over (order by %1$s) as ord,
        r.id, r.academy_student_profile_id, r.full_name, r.student_phone, r.parent_phone,
        r.level_id, gl.name as level_name, r.track_id, edra_private.track_label(r.track_id,r.academic_year_id) as track_name,
        r.primary_group_id, g.name as group_name, r.participation_type,
        r.archived_at, r.created_at, r.updated_at, r.version,
        -- Same rule as edra_private.student_access_suspended and the edit sheet.
        case when p.user_id is null then 'not_connected'
          when r.archived_at is not null or p.access_suspended_at is not null then 'suspended'
          else 'connected' end as online_account,
        p.access_suspended_at is not null as manually_suspended,
        p.access_suspension_revision as suspension_revision,
        edra_private.student_account_name(p.id) as account_name,
        coalesce((select jsonb_agg(sl.label_id) from public.annual_student_record_labels sl where sl.annual_student_record_id = r.id), '[]'::jsonb) as label_ids
      %2$s
      order by %1$s
      limit $12 offset $13
    ) x
  $q$, order_sql, base) into page
    using p_academy_id, p_academic_year_id, status, p_level_id, p_track, p_group, p_participation_type, pattern, digits, label_ids, p_unlabeled,
      p_page_size, p_page_index * p_page_size, p_access;

  return jsonb_build_object('rows', page, 'total', total);
end;
$function$;
revoke all on function public.list_student_records(uuid, uuid, text, text, text, text, text, text, jsonb, integer, integer, uuid[], boolean, text) from public, anon;
grant execute on function public.list_student_records(uuid, uuid, text, text, text, text, text, text, jsonb, integer, integer, uuid[], boolean, text) to authenticated;

commit;
