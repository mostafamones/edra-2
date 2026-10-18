-- Server-side student search for the marks list (EDRA-79). A literal, case-insensitive name match or a
-- normalized student-code prefix, applied before paging so `total` counts every match in the cohort.
-- The old five-argument signature is replaced (no data involved); named-argument callers stay compatible.

drop function if exists public.list_assignment_marks(uuid, uuid, text, integer, integer);

create function public.list_assignment_marks(
  p_academy_id uuid, p_assignment_id uuid, p_filter text default 'all', p_limit integer default 1000, p_offset integer default 0,
  p_search text default null
)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  result jsonb;
  needle text := nullif(lower(btrim(coalesce(p_search, ''))), '');
  code_needle text := public.normalize_student_code(p_search);
begin
  if auth.uid() is null or p_academy_id is null or not public.is_academy_member(p_academy_id) then return null; end if;
  if not exists (select 1 from public.assignments a where a.id = p_assignment_id and a.academy_id = p_academy_id) then return null; end if;
  if p_filter is null or p_filter <> all (array['all', 'not_received', 'needs_marking', 'marked', 'unpublished'])
    or p_limit is null or p_limit not between 1 and 1000 or p_offset is null or p_offset < 0 or length(coalesce(p_search, '')) > 100 then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  with filtered as (
    select r.record_id, r.sort_name, r.item from edra_private.assignment_recipient_rows(p_assignment_id, null) r
    where case p_filter
      when 'all' then true
      when 'not_received' then r.item->>'work_status' in ('expected', 'missing')
      when 'needs_marking' then r.item->>'work_status' in ('submitted', 'late') and r.item->>'marking' <> 'complete'
      when 'marked' then r.item->>'marking' = 'complete'
      when 'unpublished' then r.item->>'marking' = 'complete' and r.item->>'publication_state' <> 'published'
    end
    and (needle is null
      or strpos(r.sort_name, needle) > 0
      or (code_needle is not null and starts_with(coalesce(r.item->>'student_code', ''), code_needle)))
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'items', coalesce((
      select jsonb_agg(page.item order by page.sort_name, page.record_id)
      from (select f.* from filtered f order by f.sort_name, f.record_id limit p_limit offset p_offset) page
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.list_assignment_marks(uuid, uuid, text, integer, integer, text) from public, anon;
grant execute on function public.list_assignment_marks(uuid, uuid, text, integer, integer, text) to authenticated;
