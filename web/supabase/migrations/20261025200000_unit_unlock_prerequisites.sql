-- Unlock history and assessment prerequisites share the publication dependency graph.
begin;
CREATE OR REPLACE FUNCTION edra_private.content_requirements(p_unit uuid, p_document jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u public.content_units; source public.content_units; requirement jsonb; source_document jsonb; requirements jsonb;
begin
  select * into strict u from public.content_units where id=p_unit;
  perform pg_advisory_xact_lock(hashtextextended('content-requirements:'||u.academy_id::text,0));
  if p_document ? 'couponTypeId' and p_document->'couponTypeId'<>'null'::jsonb then
    if jsonb_typeof(p_document->'couponTypeId')<>'string' then raise exception 'validation'; end if;
    perform 1 from public.content_coupon_types t join public.content_programs p on p.id=u.program_id
      where not t.retired and t.id=(p_document->>'couponTypeId')::uuid and t.academy_id=u.academy_id
        and t.academic_year_id=p.academic_year_id and (t.level_id is null or (t.level_id=p.level_id and (t.all_tracks or t.track_id is not distinct from p.track_id)));
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
      or (requirement->>'kind'='access' and requirement ? 'assessmentId')
      or (requirement->>'kind'<>'access' and jsonb_typeof(requirement->'assessmentId') is distinct from 'string')
      or coalesce(requirement->>'kind','') not in ('access','assignment','quiz') then raise exception 'validation'; end if;
    select candidate.* into source from public.content_units candidate
      join public.content_programs sp on sp.id=candidate.program_id
      join public.content_programs tp on tp.id=u.program_id
      where candidate.id=(requirement->>'unitId')::uuid and candidate.academy_id=u.academy_id and candidate.state='published'
        and sp.academic_year_id=tp.academic_year_id and sp.level_id=tp.level_id and sp.track_id is not distinct from tp.track_id;
    if not found or source.id=u.id then raise exception 'invalid_prerequisite'; end if;
    select document into strict source_document from public.content_revisions where unit_id=source.id and revision=source.published_revision;
    if requirement->>'kind'<>'access' and not exists(select 1 from jsonb_array_elements(source_document->'items') item
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
end $function$;

create function edra_private.content_previously_unlocked(p_unit uuid,p_record uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.content_access_accounts a
 join public.content_access_grants g on g.id=a.current_grant_id and g.unit_id=a.unit_id and g.annual_record_id=a.annual_record_id
 where a.unit_id=p_unit and a.annual_record_id=p_record and g.starts_at<=now()
 and not exists(select 1 from public.content_access_revocations r where r.grant_id=g.id));
$$;
revoke all on function edra_private.content_previously_unlocked(uuid,uuid) from public,anon,authenticated;

create or replace function edra_private.content_requirements_met(p_unit uuid,p_record uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare requirement jsonb; doc jsonb;
begin
 select v.document into doc from public.content_units u
 join public.content_revisions v on v.unit_id=u.id and v.revision=u.published_revision where u.id=p_unit;
 for requirement in select value from jsonb_array_elements(coalesce(doc->'prerequisites','[]'::jsonb)) loop
  -- Assessment requirements also imply prior activation, including older publications.
  if not edra_private.content_previously_unlocked((requirement->>'unitId')::uuid,p_record) then return false;end if;
  if requirement->>'kind'='assignment' then
   if not exists(select 1 from public.assignment_recipients r where r.assignment_id=(requirement->>'assessmentId')::uuid
    and r.annual_student_record_id=p_record and r.work_status='received' and r.received_at is not null) then return false;end if;
  elsif requirement->>'kind'='quiz' then
   if not exists(select 1 from public.quiz_submissions s where s.quiz_id=(requirement->>'assessmentId')::uuid
    and s.annual_student_record_id=p_record) then return false;end if;
  elsif requirement->>'kind' is distinct from 'access' then return false;
  end if;
 end loop;
 return true;
end $$;

create or replace function public.get_my_content_unit(p_academy_id uuid,p_unit_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; scope jsonb; requirement jsonb; requirements jsonb:='[]'::jsonb;
 record_id uuid; met boolean; title text; unit_title text; source_id uuid; seen uuid[]:='{}'::uuid[];
begin
 result:=public.get_my_content_unit_before_requirements(p_academy_id,p_unit_id);
 scope:=edra_private.learning_student(p_academy_id,p_unit_id);
 record_id:=(scope->>'record')::uuid;
 for requirement in select value from jsonb_array_elements(coalesce(scope->'document'->'prerequisites','[]'::jsonb)) loop
  source_id:=(requirement->>'unitId')::uuid;
  select v.document->>'title' into unit_title from public.content_units u
  join public.content_revisions v on v.unit_id=u.id and v.revision=u.published_revision where u.id=source_id and u.academy_id=p_academy_id;
  if not source_id=any(seen) then
   seen:=array_append(seen,source_id);
   requirements:=requirements||jsonb_build_array(jsonb_build_object('unitId',source_id,'kind','access','assessmentId',null,
    'unitTitle',coalesce(unit_title,'Prerequisite unit'),'title','Previously unlocked',
    'submitted',edra_private.content_previously_unlocked(source_id,record_id)));
  end if;
  if requirement->>'kind'='access' then continue;end if;
  select item->>'title' into title from public.content_units u
  join public.content_revisions v on v.unit_id=u.id and v.revision=u.published_revision
  cross join lateral jsonb_array_elements(v.document->'items') item where u.id=source_id and u.academy_id=p_academy_id
  and item->>'kind'='assessment' and item->>'assessmentKind'=requirement->>'kind' and item->>'assessmentId'=requirement->>'assessmentId';
  met:=case when requirement->>'kind'='assignment' then exists(select 1 from public.assignment_recipients r
   where r.assignment_id=(requirement->>'assessmentId')::uuid and r.annual_student_record_id=record_id and r.work_status='received' and r.received_at is not null)
   else exists(select 1 from public.quiz_submissions s where s.quiz_id=(requirement->>'assessmentId')::uuid and s.annual_student_record_id=record_id) end;
  requirements:=requirements||jsonb_build_array(jsonb_build_object('unitId',source_id,'kind',requirement->>'kind',
   'assessmentId',requirement->>'assessmentId','unitTitle',coalesce(unit_title,'Prerequisite unit'),'title',coalesce(title,'Required assessment'),'submitted',met));
 end loop;
 return result||jsonb_build_object('prerequisites',requirements,'prerequisitesMet',edra_private.content_requirements_met(p_unit_id,record_id),
  'couponType',(select name from public.content_coupon_types where id=(scope->'document'->>'couponTypeId')::uuid));
end $$;
commit;
