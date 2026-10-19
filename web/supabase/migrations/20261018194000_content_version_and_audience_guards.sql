begin;
-- Null is allowed only in the private edit-authority probe (uploads), never in a draft save.
create or replace function public.save_content_unit(p_academy_id uuid,p_unit_id uuid,p_version integer,p_document jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare u public.content_units;
begin
  if p_version is null or p_version<1 then raise exception 'validation'; end if;
  u:=edra_private.content_edit(p_academy_id,p_unit_id,p_version);
  perform edra_private.content_document(p_unit_id,p_document);
  update public.content_units set draft=p_document,version=version+1,updated_at=now() where id=p_unit_id;
  return u.version+1;
end $$;

-- Recheck group-target coverage after the complete authoring/track-removal transaction, including
-- changes made through existing assessment and group RPCs rather than through the unit editor.
create function edra_private.content_group_coverage()
returns trigger language plpgsql security definer set search_path='' as $$
declare l record;
begin
  for l in select a.kind,a.assessment_id,u.program_id from public.content_assessments a join public.content_units u on u.id=a.unit_id where a.academy_id=new.academy_id loop
    perform edra_private.content_assessment(l.program_id,l.kind,l.assessment_id);
  end loop;
  return null;
end $$;
create constraint trigger content_assignment_group_coverage after insert or update on public.assignment_audience_groups deferrable initially deferred for each row execute function edra_private.content_group_coverage();
create constraint trigger content_quiz_group_coverage after insert or update on public.quiz_audience_groups deferrable initially deferred for each row execute function edra_private.content_group_coverage();
create constraint trigger content_exam_group_coverage after insert or update on public.exam_audience_groups deferrable initially deferred for each row execute function edra_private.content_group_coverage();
create constraint trigger content_group_placement_coverage after update on public.groups deferrable initially deferred for each row execute function edra_private.content_group_coverage();
revoke all on function edra_private.content_group_coverage() from public,anon,authenticated;
commit;
