-- Labels on annual student records, the third catalog of the shared academy labels. Associations belong
-- to one annual record, so a new year's record starts unlabeled. Organizational metadata: applying or
-- removing never touches the record or its version, and is allowed on archived and closed-year records.
-- The catalog starts empty. Students and parents read nothing here.

alter table public.labels
  drop constraint labels_domain_check,
  add constraint labels_domain_check check (domain in ('assessments', 'content', 'students'));

alter table public.annual_student_records
  add constraint annual_student_records_academy_id_key unique (academy_id, id);

create table public.annual_student_record_labels (
  academy_id uuid not null,
  annual_student_record_id uuid not null,
  label_id uuid not null,
  domain text not null generated always as ('students'::text) stored,
  created_at timestamptz not null default now(),
  primary key (annual_student_record_id, label_id),
  constraint annual_student_record_labels_record_fkey foreign key (academy_id, annual_student_record_id) references public.annual_student_records (academy_id, id) on delete cascade,
  constraint annual_student_record_labels_label_fkey foreign key (academy_id, domain, label_id) references public.labels (academy_id, domain, id) on delete cascade
);
create index annual_student_record_labels_label_idx on public.annual_student_record_labels (label_id);
create index annual_student_record_labels_academy_idx on public.annual_student_record_labels (academy_id);

alter table public.annual_student_record_labels enable row level security;
create policy annual_student_record_labels_select_staff on public.annual_student_record_labels for select to authenticated using (public.is_academy_member(academy_id));
revoke all on table public.annual_student_record_labels from public, anon, authenticated;
grant select on table public.annual_student_record_labels to authenticated;

-- Applies or removes one label on explicit records: the desired state, not a replacement, so retries and
-- every other label are preserved. All-or-nothing: one invalid target rejects the whole call. Returns how
-- many associations changed.
create function public.set_student_records_label(p_academy_id uuid, p_record_ids uuid[], p_label_id uuid, p_applied boolean)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  target_ids uuid[];
  matched integer;
  changed integer;
begin
  perform edra_private.require_label_role(p_academy_id, false);
  if p_record_ids is null or p_label_id is null or p_applied is null or array_position(p_record_ids, null::uuid) is not null then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  target_ids := array(select distinct target.id from unnest(p_record_ids) as target(id) order by target.id);
  if cardinality(target_ids) not between 1 and 500 then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  -- Share lock: waits for a deletion in progress and blocks one from starting until this commits.
  perform 1 from public.labels where id = p_label_id and academy_id = p_academy_id and domain = 'students' for share;
  if not found and p_applied then raise exception using errcode = 'P0001', message = 'label_not_found'; end if;
  -- Records lock in id order, like the other bulk record commands. The key share lock leaves edits unblocked.
  select count(*) into matched from (
    select r.id from public.annual_student_records r
    where r.academy_id = p_academy_id and r.id = any(target_ids) order by r.id for key share
  ) locked;
  if matched <> cardinality(target_ids) then raise exception using errcode = 'P0001', message = 'not_found'; end if;
  if p_applied then
    insert into public.annual_student_record_labels (academy_id, annual_student_record_id, label_id)
    select p_academy_id, target.id, p_label_id from unnest(target_ids) as target(id) order by target.id
    on conflict do nothing;
  else
    delete from public.annual_student_record_labels
    where label_id = p_label_id and annual_student_record_id in (
      select l.annual_student_record_id from public.annual_student_record_labels l
      where l.label_id = p_label_id and l.annual_student_record_id = any(target_ids)
      order by l.annual_student_record_id for update
    );
  end if;
  get diagnostics changed = row_count;
  return changed;
end;
$$;
revoke all on function public.set_student_records_label(uuid, uuid[], uuid, boolean) from public, anon;
grant execute on function public.set_student_records_label(uuid, uuid[], uuid, boolean) to authenticated;

-- The same deletion, now also counting student records as uses. The row lock serializes this with every set command.
create or replace function public.delete_label(p_academy_id uuid, p_label_id uuid, p_confirmed boolean)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uses integer;
begin
  perform edra_private.require_label_role(p_academy_id, true);
  if p_label_id is null or p_confirmed is null then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  perform 1 from public.labels where id = p_label_id and academy_id = p_academy_id for update;
  if not found then return jsonb_build_object('status', 'deleted', 'uses', 0); end if;
  uses := (select count(*) from public.assignment_labels where label_id = p_label_id)
    + (select count(*) from public.quiz_labels where label_id = p_label_id)
    + (select count(*) from public.exam_labels where label_id = p_label_id)
    + (select count(*) from public.content_unit_labels where label_id = p_label_id)
    + (select count(*) from public.annual_student_record_labels where label_id = p_label_id);
  if uses > 0 and not p_confirmed then return jsonb_build_object('status', 'confirm', 'uses', uses); end if;
  delete from public.labels where id = p_label_id and academy_id = p_academy_id;
  return jsonb_build_object('status', 'deleted', 'uses', uses);
end;
$$;

-- The list gains each row's label IDs and a label filter applied before counting and paging: any of the
-- selected labels, or Unlabeled instead of them. The defaults keep code deployed before this migration working.
drop function public.list_student_records(uuid, uuid, text, text, text, text, text, text, jsonb, integer, integer);
create function public.list_student_records(p_academy_id uuid, p_academic_year_id uuid, p_search text, p_status text, p_level_id text, p_track text, p_group text, p_participation_type text, p_sorts jsonb, p_page_index integer, p_page_size integer, p_label_ids uuid[] default null, p_unlabeled boolean default false)
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
    or p_unlabeled is null or cardinality(label_ids) > 100 or (p_unlabeled and cardinality(label_ids) > 0) then
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
      and (cardinality($10::uuid[]) = 0 or exists (
        select 1 from public.annual_student_record_labels sl where sl.annual_student_record_id = r.id and sl.label_id = any($10::uuid[])))
      and (not $11::boolean or not exists (
        select 1 from public.annual_student_record_labels sl where sl.annual_student_record_id = r.id))
  $q$;

  execute 'select count(*) ' || base into total
    using p_academy_id, p_academic_year_id, status, p_level_id, p_track, p_group, p_participation_type, pattern, digits, label_ids, p_unlabeled;

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
        edra_private.student_account_name(p.id) as account_name,
        coalesce((select jsonb_agg(sl.label_id) from public.annual_student_record_labels sl where sl.annual_student_record_id = r.id), '[]'::jsonb) as label_ids
      %2$s
      order by %1$s
      limit $12 offset $13
    ) x
  $q$, order_sql, base) into page
    using p_academy_id, p_academic_year_id, status, p_level_id, p_track, p_group, p_participation_type, pattern, digits, label_ids, p_unlabeled,
      p_page_size, p_page_index * p_page_size;

  return jsonb_build_object('rows', page, 'total', total);
end;
$function$;
revoke all on function public.list_student_records(uuid, uuid, text, text, text, text, text, text, jsonb, integer, integer, uuid[], boolean) from public, anon;
grant execute on function public.list_student_records(uuid, uuid, text, text, text, text, text, text, jsonb, integer, integer, uuid[], boolean) to authenticated;
