-- Student course cards: what a unit contains by kind (with the caller's completion), and the
-- Assignments list filtered to one unit. Read-only function changes; no table or data change.
begin;

-- Per-kind contents on top of the progress-aware list. Documents are not tracked, so their
-- completed count stays 0; answer items are solutions, not course contents, and are left out.
alter function public.list_my_content_units(uuid,integer,integer,text) rename to list_my_content_units_before_contents;
create function public.list_my_content_units(p_academy_id uuid,p_offset integer default 0,p_limit integer default 24,p_search text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; items jsonb;
begin
 result:=public.list_my_content_units_before_contents(p_academy_id,p_offset,p_limit,p_search);
 select coalesce(jsonb_agg(x.item||jsonb_build_object('contents',(
   select coalesce(jsonb_agg(jsonb_build_object('kind',c.kind,'total',c.total,'completed',c.completed) order by c.kind),'[]')
   from (
     select case d->>'kind' when 'explanation' then 'video' when 'document' then 'document' else d->>'assessmentKind' end kind,
       count(*)::integer total,
       count(*) filter (where exists (select 1 from jsonb_array_elements(coalesce(x.item->'progress'->'items','[]')) p
         where p->>'itemId'=d->>'id' and (p->>'completed')::boolean))::integer completed
     from jsonb_array_elements(coalesce(v.document->'items','[]')) d
     where d->>'kind' in ('explanation','document') or (d->>'kind'='assessment' and d->>'assessmentKind' in ('assignment','quiz','exam'))
     group by 1
   ) c)) order by x.ord),'[]') into items
 from jsonb_array_elements(result->'units') with ordinality x(item,ord)
 join public.content_units u on u.id=(x.item->>'id')::uuid
 join public.content_revisions v on v.unit_id=u.id and v.revision=u.published_revision;
 return result||jsonb_build_object('units',items);
end $$;

-- An optional unit filter. Same signature otherwise; replaced rather than overloaded so
-- PostgREST calls stay unambiguous.
drop function public.list_my_assignments(uuid,integer,text);
create function public.list_my_assignments(p_academy_id uuid, p_offset integer default 0, p_search text default '', p_unit_id uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare year_id uuid; record_id uuid; r public.annual_student_records; a record; items jsonb := '[]'; more boolean := false; seen integer := 0;
begin
  if auth.uid() is null or edra_auth.session_allowed() is not true then raise exception 'student_unavailable'; end if;
  if p_offset is null or p_offset not between 0 and 100000 or char_length(coalesce(p_search, '')) > 100 then raise exception 'validation'; end if;
  select id into year_id from public.academic_years where academy_id = p_academy_id and closed_at is null;
  record_id := edra_private.student_caller_record(p_academy_id, year_id);
  if record_id is null then raise exception 'student_unavailable'; end if;
  select * into strict r from public.annual_student_records where id = record_id;
  for a in select x.id from public.assignments x
    where x.academy_id = p_academy_id and x.academic_year_id = year_id and x.state <> 'archived' and edra_private.assignment_ready(x.id)
      and (edra_private.assignment_matches_record(x, r)
        or exists (select 1 from public.assignment_recipients w where w.assignment_id = x.id and w.annual_student_record_id = r.id))
      and (coalesce(p_search, '') = '' or position(lower(btrim(p_search)) in lower(x.title)) > 0)
      and (p_unit_id is null or edra_private.assignment_unit(x.id) = p_unit_id)
      and not exists (select 1 from public.content_units u join public.content_programs p on p.id = u.program_id
        where u.id = edra_private.assignment_unit(x.id) and (p.level_id <> r.level_id or (p.track_id is not null and p.track_id is distinct from r.track_id)))
    order by x.created_at desc, x.id limit 26 offset p_offset
  loop
    seen := seen + 1;
    if seen > 25 then more := true; exit; end if;
    items := items || (edra_private.assignment_student_overview(a.id, edra_private.assignment_student_scope(p_academy_id, a.id))
      - 'instructions' - 'answerVideos');
  end loop;
  return jsonb_build_object('items', items, 'hasMore', more);
end $$;

revoke all on function public.list_my_content_units_before_contents(uuid,integer,integer,text),
  public.list_my_content_units(uuid,integer,integer,text),
  public.list_my_assignments(uuid,integer,text,uuid) from public, anon, authenticated;
grant execute on function public.list_my_content_units(uuid,integer,integer,text),
  public.list_my_assignments(uuid,integer,text,uuid) to authenticated;
commit;
