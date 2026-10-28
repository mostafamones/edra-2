begin;

-- Order before pagination so a later page cannot contain an earlier expiry.
create or replace function public.list_my_content_units_before_progress(p_academy_id uuid,p_offset integer default 0,p_limit integer default 24,p_search text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare record_id uuid; year_id uuid; r public.annual_student_records; result jsonb;
begin
  if edra_auth.session_allowed() is not true or auth.uid() is null then raise exception 'student_unavailable'; end if;
  if p_offset is null or p_offset not between 0 and 100000 or p_limit is null or p_limit not between 1 and 100 or char_length(coalesce(p_search,''))>100 then raise exception 'validation'; end if;
  select id into year_id from public.academic_years where academy_id=p_academy_id and closed_at is null;
  record_id:=edra_private.student_caller_record(p_academy_id,year_id);
  if record_id is null then raise exception 'student_unavailable'; end if;
  select * into strict r from public.annual_student_records where id=record_id;
  with candidates as (
    select u.id,v.document,v.published_at,edra_private.learning_state(record_id,u.id) as access
    from public.content_units u
    join public.content_programs p on p.id=u.program_id
    join public.content_revisions v on v.unit_id=u.id and v.revision=u.published_revision
    where u.academy_id=p_academy_id and u.state='published' and p.academic_year_id=year_id
      and p.level_id=r.level_id and (p.track_id is null or p.track_id=r.track_id)
      and (coalesce(p_search,'')='' or position(lower(btrim(p_search)) in lower(v.document->>'title'))>0)
  ), matches as (
    select *, (access->>'expiresAt')::timestamptz as expires_at from candidates
    order by (access->>'expiresAt')::timestamptz asc nulls last,published_at desc,id
    limit p_limit+1 offset p_offset
  ), page as (
    select * from matches order by expires_at asc nulls last,published_at desc,id limit p_limit
  )
  select jsonb_build_object('units',coalesce((select jsonb_agg(jsonb_build_object(
    'id',id,'title',document->>'title','materialCount',jsonb_array_length(document->'items'),'publishedAt',published_at,
    'access',access) order by expires_at asc nulls last,published_at desc,id) from page),'[]'::jsonb),
    'hasMore',(select count(*)>p_limit from matches)) into result;
  return result;
end $$;

commit;
