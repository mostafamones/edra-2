begin;
create function public.create_content_assessment(p_academy_id uuid,p_unit_id uuid,p_version integer,p_kind text,p_title text)
returns uuid language plpgsql security definer set search_path='' as $$
declare u public.content_units; p public.content_programs; draft jsonb; part jsonb; new_id uuid:=gen_random_uuid();
begin
  u:=edra_private.content_edit(p_academy_id,p_unit_id,p_version);
  select * into strict p from public.content_programs where id=u.program_id;
  if p_kind not in ('assignment','quiz','exam') or char_length(btrim(coalesce(p_title,''))) not between 1 and 200 then raise exception 'validation'; end if;
  part:=jsonb_build_object('title','Part 1','instructions','','kind',case when p_kind='assignment' then 'online_questions' else 'question_sheet' end,
    'questions',jsonb_build_array(jsonb_build_object('prompt','','max_score','1','choices','[]'::jsonb)));
  draft:=jsonb_build_object('title',btrim(p_title),'instructions','','solution_notes','','audience',case when p.track_id is null then 'level' else 'program' end,
    'level_id',p.level_id,'track_id',p.track_id,'group_ids','[]'::jsonb,'due_at',null,'time_limit_minutes',null,'parts',jsonb_build_array(part));
  if p_kind='assignment' then perform public.create_assignment(p_academy_id,p.academic_year_id,new_id,draft);
  elsif p_kind='quiz' then perform public.create_quiz(p_academy_id,p.academic_year_id,new_id,draft);
  else perform public.create_exam(p_academy_id,p.academic_year_id,new_id,draft); end if;
  perform public.save_content_unit(p_academy_id,p_unit_id,p_version,u.draft||jsonb_build_object('items',(u.draft->'items')||jsonb_build_array(jsonb_build_object(
    'id',gen_random_uuid(),'kind','assessment','title',btrim(p_title),'assessmentKind',p_kind,'assessmentId',new_id))));
  return new_id;
end $$;
revoke all on function public.create_content_assessment(uuid,uuid,integer,text,text) from public,anon;
grant execute on function public.create_content_assessment(uuid,uuid,integer,text,text) to authenticated;
commit;
