-- Student list: return the linked account's own name (display name, else full name) beside the
-- staff record name. Staff cannot read student `profiles` rows under RLS (students are not academy
-- members), so a definer helper returns only the name, and only to members of the profile's academy.
begin;

create function edra_private.student_account_name(p_profile_id uuid)
returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(pr.display_name, pr.full_name)
  from public.academy_student_profiles sp
  join public.profiles pr on pr.id = sp.user_id
  where sp.id = p_profile_id and public.is_academy_member(sp.academy_id);
$$;

revoke all on function edra_private.student_account_name(uuid) from public, anon, authenticated, service_role;
grant execute on function edra_private.student_account_name(uuid) to authenticated;

create or replace function public.list_student_records(p_academy_id uuid, p_academic_year_id uuid, p_search text, p_status text, p_level_id text, p_track text, p_group text, p_participation_type text, p_sorts jsonb, p_page_index integer, p_page_size integer)
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
    left join public.academy_student_profiles p on p.id = r.academy_student_profile_id and p.academy_id = r.academy_id
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
  $q$;

  execute 'select count(*) ' || base into total
    using p_academy_id, p_academic_year_id, status, p_level_id, p_track, p_group, p_participation_type, pattern, digits;

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
        edra_private.student_account_name(p.id) as account_name
      %2$s
      order by %1$s
      limit $10 offset $11
    ) x
  $q$, order_sql, base) into page
    using p_academy_id, p_academic_year_id, status, p_level_id, p_track, p_group, p_participation_type, pattern, digits,
      p_page_size, p_page_index * p_page_size;

  return jsonb_build_object('rows', page, 'total', total);
end;
$function$;

commit;
