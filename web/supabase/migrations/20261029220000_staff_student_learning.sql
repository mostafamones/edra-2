-- Staff projection, not student impersonation. Reuses the existing access and progress engines.
create function public.staff_student_learning(p_academy_id uuid,p_record_id uuid,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.annual_student_records; result jsonb;
begin
  if auth.uid() is null or public.academy_role_for(p_academy_id) is null then raise exception 'forbidden'; end if;
  if p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'validation'; end if;
  select * into r from public.annual_student_records where id=p_record_id and academy_id=p_academy_id;
  if not found then raise exception 'not_found'; end if;
  with eligible as materialized (
    select u.id,v.document,v.published_at,edra_private.learning_state(r.id,u.id) as access,
      edra_private.content_unit_progress(u.id,r.id,v.document) as progress
    from public.content_units u join public.content_programs p on p.id=u.program_id
    join public.content_revisions v on v.unit_id=u.id and v.revision=u.published_revision
    where u.academy_id=p_academy_id and p.academic_year_id=r.academic_year_id
      and u.state='published' and p.level_id=r.level_id and (p.track_id is null or p.track_id=r.track_id)
  ), described as (
    select *, (progress->>'total')::int>0 and (progress->>'completed')::int=(progress->>'total')::int as completed,
      exists(select 1 from jsonb_array_elements(progress->'items') x where (x->>'completed')::boolean or coalesce((x->>'watchedSeconds')::numeric,0)>0) as started
    from eligible
  ), page as (select * from described order by published_at desc,id limit 24 offset p_offset)
  select jsonb_build_object('total',(select count(*) from described),
    'started',(select count(*) from described where started),'completed',(select count(*) from described where completed),
    'units',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',document->>'title','access',access,'progress',progress) order by published_at desc,id) from page),'[]'::jsonb)) into result;
  return result;
end $$;
revoke all on function public.staff_student_learning(uuid,uuid,integer) from public,anon;
grant execute on function public.staff_student_learning(uuid,uuid,integer) to authenticated;
