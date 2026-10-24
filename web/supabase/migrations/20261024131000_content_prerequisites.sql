-- EDRA-253: publication-scoped requirements; existing active grants are retained.
begin;

create function edra_private.content_requirements(p_unit uuid,p_document jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare u public.content_units; source public.content_units; requirement jsonb; source_document jsonb; requirements jsonb;
begin
  select * into strict u from public.content_units where id=p_unit;
  perform pg_advisory_xact_lock(hashtextextended('content-requirements:'||u.academy_id::text,0));
  if p_document ? 'couponTypeId' and p_document->'couponTypeId'<>'null'::jsonb then
    if jsonb_typeof(p_document->'couponTypeId')<>'string' then raise exception 'validation'; end if;
    perform 1 from public.content_coupon_types t join public.content_programs p on p.id=u.program_id
      where t.id=(p_document->>'couponTypeId')::uuid and t.academy_id=u.academy_id
        and t.academic_year_id=p.academic_year_id and t.level_id=p.level_id and t.track_id is not distinct from p.track_id;
    if not found then raise exception 'coupon_type_mismatch'; end if;
  end if;
  requirements:=coalesce(p_document->'prerequisites','[]'::jsonb);
  if jsonb_typeof(requirements) is distinct from 'array' then raise exception 'validation'; end if;
  if jsonb_array_length(requirements)>100 then raise exception 'validation'; end if;
  if (select count(distinct value) from jsonb_array_elements(requirements))<>jsonb_array_length(requirements) then raise exception 'validation'; end if;
  for requirement in select value from jsonb_array_elements(requirements) loop
    if jsonb_typeof(requirement) is distinct from 'object'
      or requirement-array['unitId','kind','assessmentId']<>'{}'::jsonb
      or jsonb_typeof(requirement->'unitId') is distinct from 'string'
      or jsonb_typeof(requirement->'assessmentId') is distinct from 'string'
      or coalesce(requirement->>'kind','') not in ('assignment','quiz') then raise exception 'validation'; end if;
    select candidate.* into source from public.content_units candidate
      join public.content_programs sp on sp.id=candidate.program_id
      join public.content_programs tp on tp.id=u.program_id
      where candidate.id=(requirement->>'unitId')::uuid and candidate.academy_id=u.academy_id and candidate.state='published'
        and sp.academic_year_id=tp.academic_year_id and sp.level_id=tp.level_id and sp.track_id is not distinct from tp.track_id;
    if not found or source.id=u.id then raise exception 'invalid_prerequisite'; end if;
    select document into strict source_document from public.content_revisions where unit_id=source.id and revision=source.published_revision;
    if not exists(select 1 from jsonb_array_elements(source_document->'items') item
      where item->>'kind'='assessment' and item->>'assessmentKind'=requirement->>'kind'
        and item->>'assessmentId'=requirement->>'assessmentId') then raise exception 'invalid_prerequisite'; end if;
  end loop;
  -- A serialized publication cannot introduce a cycle in the published graph.
  if exists(with recursive dependencies(id) as (
    select (value->>'unitId')::uuid from jsonb_array_elements(requirements)
    union
    select (r.value->>'unitId')::uuid from dependencies d
      join public.content_units x on x.id=d.id and x.academy_id=u.academy_id
      join public.content_revisions v on v.unit_id=x.id and v.revision=x.published_revision
      cross join lateral jsonb_array_elements(coalesce(v.document->'prerequisites','[]'::jsonb)) r(value)
  ) select 1 from dependencies where id=u.id) then raise exception 'prerequisite_cycle'; end if;
end $$;

-- Reuse the established material/work/history validator, adding policy checks.
alter function edra_private.content_document(uuid,jsonb,boolean) rename to content_document_before_requirements;
create function edra_private.content_document(p_unit uuid,p_document jsonb,p_publish boolean default false) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform edra_private.content_requirements(p_unit,p_document);
  perform edra_private.content_document_before_requirements(p_unit,p_document,p_publish);
end $$;

do $$
declare definition text; updated text;
begin
  definition:=pg_get_functiondef('edra_private.content_shape()'::regprocedure);
  updated:=replace(definition, 'array[''title'',''description'',''items'',''accessDays'']',
    'array[''title'',''description'',''items'',''accessDays'',''couponTypeId'',''prerequisites'']');
  if updated=definition then raise exception 'Content shape validator changed'; end if;
  execute updated;
  definition:=pg_get_functiondef('public.copy_content_unit(uuid,uuid,uuid,text,uuid,uuid)'::regprocedure);
  updated:=replace(definition,'doc:=doc||jsonb_build_object(''items'',items);',
    'doc:=(doc-array[''couponTypeId'',''prerequisites''])||jsonb_build_object(''items'',items);');
  if updated=definition then raise exception 'Content copy policy changed'; end if;
  execute updated;
end $$;

create function edra_private.content_requirements_met(p_unit uuid,p_record uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare requirement jsonb; doc jsonb;
begin
  select v.document into doc from public.content_units u
    join public.content_revisions v on v.unit_id=u.id and v.revision=u.published_revision where u.id=p_unit;
  for requirement in select value from jsonb_array_elements(coalesce(doc->'prerequisites','[]'::jsonb)) loop
    if requirement->>'kind'='assignment' then
      if not exists(select 1 from public.assignment_recipients r
        where r.assignment_id=(requirement->>'assessmentId')::uuid and r.annual_student_record_id=p_record
          and r.work_status='received' and r.received_at is not null) then return false; end if;
    elsif requirement->>'kind'='quiz' then
      if not exists(select 1 from public.quiz_submissions s
        where s.quiz_id=(requirement->>'assessmentId')::uuid and s.annual_student_record_id=p_record) then return false; end if;
    else return false;
    end if;
  end loop;
  return true;
end $$;

-- Every new source goes through this invariant, including future attendance
-- consumers. Old grant rows are neither updated nor reevaluated on publication.
create function edra_private.content_grant_requirements() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.content_units where id=new.unit_id for share;
  if edra_private.content_requirements_met(new.unit_id,new.annual_record_id) is not true then
    raise exception 'prerequisites_required';
  end if;
  return new;
end $$;
create trigger content_grant_prerequisites before insert on public.content_access_grants
  for each row execute function edra_private.content_grant_requirements();

alter function public.get_my_content_unit(uuid,uuid) rename to get_my_content_unit_before_requirements;
revoke all on function public.get_my_content_unit_before_requirements(uuid,uuid) from public,anon,authenticated;
create function public.get_my_content_unit(p_academy_id uuid,p_unit_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; scope jsonb; requirement jsonb; requirements jsonb:='[]'::jsonb; record_id uuid; met boolean; title text; unit_title text;
begin
  result:=public.get_my_content_unit_before_requirements(p_academy_id,p_unit_id);
  scope:=edra_private.learning_student(p_academy_id,p_unit_id);
  record_id:=(scope->>'record')::uuid;
  for requirement in select value from jsonb_array_elements(coalesce(scope->'document'->'prerequisites','[]'::jsonb)) loop
    select v.document->>'title',item->>'title' into unit_title,title from public.content_units u
      join public.content_revisions v on v.unit_id=u.id and v.revision=u.published_revision
      cross join lateral jsonb_array_elements(v.document->'items') item
      where u.id=(requirement->>'unitId')::uuid and item->>'kind'='assessment'
        and item->>'assessmentKind'=requirement->>'kind' and item->>'assessmentId'=requirement->>'assessmentId';
    met:=case when requirement->>'kind'='assignment' then exists(select 1 from public.assignment_recipients r
      where r.assignment_id=(requirement->>'assessmentId')::uuid and r.annual_student_record_id=record_id and r.work_status='received' and r.received_at is not null)
      else exists(select 1 from public.quiz_submissions s where s.quiz_id=(requirement->>'assessmentId')::uuid and s.annual_student_record_id=record_id) end;
    requirements:=requirements||jsonb_build_array(jsonb_build_object('unitId',requirement->>'unitId','kind',requirement->>'kind',
      'assessmentId',requirement->>'assessmentId','unitTitle',coalesce(unit_title,'Prerequisite unit'),
      'title',coalesce(title,'Required assessment'),'submitted',met));
  end loop;
  return result||jsonb_build_object('prerequisites',requirements,'prerequisitesMet',edra_private.content_requirements_met(p_unit_id,record_id),
    'couponType', (select name from public.content_coupon_types where id=(scope->'document'->>'couponTypeId')::uuid));
end $$;
revoke all on function public.get_my_content_unit(uuid,uuid) from public,anon;
grant execute on function public.get_my_content_unit(uuid,uuid) to authenticated;

create function public.get_content_requirement_options(p_academy_id uuid,p_unit_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare target public.content_units;
begin
  perform edra_private.learning_actor(p_academy_id);
  select * into target from public.content_units where id=p_unit_id and academy_id=p_academy_id;
  if not found then raise exception 'content_unavailable'; end if;
  return jsonb_build_object('types',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name) order by t.name,t.id)
    from public.content_coupon_types t join public.content_programs p on p.id=target.program_id
      where t.academy_id=p_academy_id and t.academic_year_id=p.academic_year_id
        and t.level_id=p.level_id and t.track_id is not distinct from p.track_id),'[]'::jsonb),
    'units',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'title',v.document->>'title','assessments',
      (select jsonb_agg(jsonb_build_object('id',item->>'assessmentId','kind',item->>'assessmentKind','title',item->>'title') order by ordinal)
        from jsonb_array_elements(v.document->'items') with ordinality x(item,ordinal)
        where item->>'kind'='assessment' and item->>'assessmentKind' in ('assignment','quiz'))) order by v.published_at desc,u.id)
      from public.content_units u join public.content_revisions v on v.unit_id=u.id and v.revision=u.published_revision
      join public.content_programs sp on sp.id=u.program_id join public.content_programs tp on tp.id=target.program_id
      where u.academy_id=p_academy_id and sp.academic_year_id=tp.academic_year_id and sp.level_id=tp.level_id
        and sp.track_id is not distinct from tp.track_id and u.id<>target.id and u.state='published'),'[]'::jsonb));
end $$;
revoke all on function public.get_content_requirement_options(uuid,uuid) from public,anon;
grant execute on function public.get_content_requirement_options(uuid,uuid) to authenticated;
revoke all on function edra_private.content_requirements(uuid,jsonb),edra_private.content_document(uuid,jsonb,boolean),
  edra_private.content_document_before_requirements(uuid,jsonb,boolean),edra_private.content_requirements_met(uuid,uuid),
  edra_private.content_grant_requirements() from public,anon,authenticated;

commit;
