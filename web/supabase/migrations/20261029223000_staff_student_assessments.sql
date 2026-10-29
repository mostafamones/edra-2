-- Staff-only per-record overview; reuse domain marking/publication calculations and omit questions.
create function public.staff_student_assessments(p_academy_id uuid,p_record_id uuid,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.annual_student_records; result jsonb;
begin
  if auth.uid() is null or public.academy_role_for(p_academy_id) is null then raise exception 'forbidden'; end if;
  if p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'validation'; end if;
  select * into r from public.annual_student_records where id=p_record_id and academy_id=p_academy_id;
  if not found then raise exception 'not_found'; end if;
  with candidates as (
    select a.id,a.title,'assignment'::text as kind,a.created_at,a.max_score::text as maximum
    from public.assignments a join public.assignment_recipients x on x.assignment_id=a.id
    where a.academy_id=p_academy_id and a.academic_year_id=r.academic_year_id and x.annual_student_record_id=r.id
    union all
    select q.id,q.title,'quiz',q.created_at,null from public.quizzes q join public.quiz_work w on w.quiz_id=q.id
    where q.academy_id=p_academy_id and q.academic_year_id=r.academic_year_id and w.annual_student_record_id=r.id
    union all
    select q.id,q.title,'exam',q.created_at,null from public.exams q join public.exam_work w on w.exam_id=q.id
    where q.academy_id=p_academy_id and q.academic_year_id=r.academic_year_id and w.annual_student_record_id=r.id
  ), page as (select * from candidates order by created_at desc,id limit 24 offset p_offset),
  described as (
    select p.*,case kind when 'assignment' then (select item from edra_private.assignment_recipient_rows(p.id,r.id))
      when 'quiz' then edra_private.quiz_student_row(p.id,r.id) else edra_private.exam_student_row(p.id,r.id) end as item from page p
  )
  select jsonb_build_object('total',(select count(*) from candidates),'items',coalesce((select jsonb_agg(jsonb_build_object(
    'id',id,'title',title,'kind',kind,'publication',item->'publication',
    'publicationState',item->>'publication_state',
    'complete',case when kind='assignment' then item->>'marking'='complete' else coalesce((item#>>'{result,complete}')::boolean,false) end,
    'score',case when kind='assignment' then item->>'total' else item#>>'{result,total}' end,
    'maximum',case when kind='assignment' then maximum else item#>>'{result,max_score}' end,
    'work',case when kind='assignment' then item->>'work_status' when item->'submission'<>'null'::jsonb then 'submitted' else 'in_progress' end
  ) order by created_at desc,id) from described),'[]'::jsonb)) into result;
  return result;
end $$;
revoke all on function public.staff_student_assessments(uuid,uuid,integer) from public,anon;
grant execute on function public.staff_student_assessments(uuid,uuid,integer) to authenticated;
