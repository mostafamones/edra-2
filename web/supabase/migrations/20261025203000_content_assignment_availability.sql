-- Unit assignment links must reflect the same visibility and entitlement as their destination.
begin;
create function edra_private.content_assignment_openable(p_academy uuid,p_unit uuid,p_assignment uuid,p_record uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare scope jsonb;
begin
 if coalesce(edra_private.learning_state(p_record,p_unit)->>'status','locked') not in ('active','expired') then return false;end if;
 scope:=edra_private.assignment_student_scope(p_academy,p_assignment);
 return coalesce(scope->>'unitId'=p_unit::text and scope->>'recordId'=p_record::text,false);
exception when raise_exception then
 if sqlerrm in ('not_found','student_unavailable') then return false;end if;
 raise;
end $$;
revoke all on function edra_private.content_assignment_openable(uuid,uuid,uuid,uuid) from public,anon,authenticated;

do $$ declare definition text; updated text;
begin
 definition:=pg_get_functiondef('public.get_my_content_unit_before_requirements(uuid,uuid)'::regprocedure);
 updated:=replace(definition,
  'case when i->>''kind'' = ''assessment'' then true',
  'case when i->>''kind'' = ''assessment'' then edra_private.content_assignment_openable(p_academy_id,p_unit_id,(i->>''assessmentId'')::uuid,(scope->>''record'')::uuid)');
 if updated=definition then raise exception 'Assignment availability contract changed';end if;
 execute updated;
end $$;
commit;
