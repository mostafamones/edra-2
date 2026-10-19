begin;

-- Fresh assessment authoring documents omit every source structural identity and all work.
create function edra_private.content_copy_assessment(p_kind text,p_id uuid,p_program uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare p public.content_programs; a jsonb; draft jsonb; parts jsonb; new_id uuid:=gen_random_uuid();
begin
  select * into strict p from public.content_programs where id=p_program;
  if p_kind='assignment' then a:=edra_private.assignment_json(p_id);
  elsif p_kind='quiz' then a:=edra_private.quiz_json(p_id);
  elsif p_kind='exam' then a:=edra_private.exam_json(p_id);
  else raise exception 'invalid_assessment'; end if;
  if (a->>'academy_id')::uuid is distinct from p.academy_id then raise exception 'forbidden'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('title',part->>'title','instructions',coalesce(part->>'instructions',''),'kind',part->>'kind','max_score',part->>'max_score','questions',
    (select coalesce(jsonb_agg(jsonb_build_object('prompt',coalesce(q->>'prompt',''),'model_answer',coalesce(q->>'model_answer',''),'max_score',q->>'max_score','choices',
      (select coalesce(jsonb_agg(jsonb_build_object('label',c->>'label','is_correct',(c->>'is_correct')::boolean) order by (c->>'position')::integer),'[]'::jsonb) from jsonb_array_elements(coalesce(q->'choices','[]')) c)) order by (q->>'position')::integer),'[]'::jsonb)
      from jsonb_array_elements(coalesce(part->'questions','[]')) q)) order by (part->>'position')::integer),'[]'::jsonb)
    into parts from jsonb_array_elements(a->'parts') part;
  draft:=jsonb_build_object('title',a->>'title','instructions',coalesce(a->>'instructions',''),'solution_notes',coalesce(a->>'solution_notes',''),
    'audience',case when p.track_id is null then 'level' else 'program' end,'level_id',p.level_id,'track_id',p.track_id,'group_ids','[]'::jsonb,
    'due_at',null,'time_limit_minutes',a->'time_limit_minutes','parts',parts);
  if p_kind='assignment' then perform public.create_assignment(p.academy_id,p.academic_year_id,new_id,draft);
  elsif p_kind='quiz' then perform public.create_quiz(p.academy_id,p.academic_year_id,new_id,draft);
  else perform public.create_exam(p.academy_id,p.academic_year_id,new_id,draft); end if;
  return new_id;
end $$;

create function public.copy_content_unit(p_academy_id uuid,p_source_id uuid,p_year_id uuid,p_level_id text,p_track_id uuid,p_unit_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare source public.content_units; target public.content_units; doc jsonb; item jsonb; items jsonb:='[]'; mapping jsonb:='{}'; new_assessment uuid; key text;
begin
  perform edra_private.content_actor(p_academy_id);
  select * into source from public.content_units where id=p_source_id and academy_id=p_academy_id and state='published' for share;
  if not found then raise exception 'published_source_required'; end if;
  if exists(select 1 from public.content_units where id=p_unit_id and academy_id=p_academy_id and created_by=auth.uid() and source_unit_id=p_source_id) then return p_unit_id; end if;
  select document into strict doc from public.content_revisions where unit_id=source.id and revision=source.published_revision;
  perform public.create_content_unit(p_academy_id,p_year_id,p_level_id,p_track_id,p_unit_id,doc->>'title');
  select * into strict target from public.content_units where id=p_unit_id;
  for item in select value from jsonb_array_elements(doc->'items') where value->>'kind'='assessment' loop
    key:=(item->>'assessmentKind')||':'||(item->>'assessmentId');
    if not mapping ? key then
      new_assessment:=edra_private.content_copy_assessment(item->>'assessmentKind',(item->>'assessmentId')::uuid,target.program_id);
      mapping:=mapping||jsonb_build_object(key,new_assessment);
    end if;
  end loop;
  for item in select value from jsonb_array_elements(doc->'items') loop
    item:=item||jsonb_build_object('id',gen_random_uuid());
    if item->>'kind' in ('answer','assessment') then item:=item||jsonb_build_object('assessmentId',mapping->>((item->>'assessmentKind')||':'||(item->>'assessmentId'))); end if;
    items:=items||jsonb_build_array(item);
  end loop;
  doc:=doc||jsonb_build_object('items',items);
  perform public.save_content_unit(p_academy_id,p_unit_id,target.version,doc);
  update public.content_units set source_unit_id=source.id where id=p_unit_id;
  return p_unit_id;
end $$;

-- Prevent other assessment entry points from breaking an attachment's program coverage.
create function edra_private.content_assessment_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare l record; p public.content_programs;
begin
  for l in select * from public.content_assessments where kind=TG_ARGV[0] and assessment_id=old.id loop
    if TG_OP='DELETE' then raise exception 'attachment_locked'; end if;
    select * into strict p from public.content_programs where id=(select program_id from public.content_units where id=l.unit_id);
    if new.academy_id<>p.academy_id or new.academic_year_id<>p.academic_year_id then raise exception 'incompatible_assessment'; end if;
    if (new.audience::text,new.level_id,new.track_id) is distinct from (old.audience::text,old.level_id,old.track_id) then
      if new.audience::text='groups' or new.level_id<>p.level_id or (p.track_id is not null and new.track_id is distinct from p.track_id) then raise exception 'incompatible_assessment'; end if;
    end if;
  end loop;
  return new;
end $$;
create trigger content_assignment_guard before update or delete on public.assignments for each row execute function edra_private.content_assessment_guard('assignment');
create trigger content_quiz_guard before update or delete on public.quizzes for each row execute function edra_private.content_assessment_guard('quiz');
create trigger content_exam_guard before update or delete on public.exams for each row execute function edra_private.content_assessment_guard('exam');

-- Staff can complete document uploads only after Storage has acknowledged the matching object.
create function public.complete_content_document(p_academy_id uuid,p_asset_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare a public.content_assets;
begin
  select * into a from public.content_assets where id=p_asset_id and academy_id=p_academy_id and kind='document' for update;
  if not found then raise exception 'not_found'; end if;
  perform edra_private.content_edit(p_academy_id,a.unit_id);
  if not exists(select 1 from storage.objects where bucket_id='content-documents' and name=a.storage_path) then raise exception 'upload_incomplete'; end if;
  update public.content_assets set status='ready' where id=a.id;
end $$;

revoke all on function edra_private.content_copy_assessment(text,uuid,uuid),edra_private.content_assessment_guard() from public,anon,authenticated;
revoke all on function public.copy_content_unit(uuid,uuid,uuid,text,uuid,uuid),public.complete_content_document(uuid,uuid) from public,anon;
grant execute on function public.copy_content_unit(uuid,uuid,uuid,text,uuid,uuid),public.complete_content_document(uuid,uuid) to authenticated;
commit;
