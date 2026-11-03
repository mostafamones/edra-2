-- Scheduling with no version saved since the last publication saves the current draft as that version.
begin;
create or replace function public.schedule_content_publication(p_academy_id uuid,p_unit_id uuid,p_at timestamptz,p_generation integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u public.content_units; s public.content_publication_schedules; had_pending boolean;
begin
  perform edra_private.offering_gate();
  perform edra_private.content_actor(p_academy_id,true);
  u:=edra_private.content_edit(p_academy_id,p_unit_id);
  select * into s from public.content_publication_schedules where unit_id=u.id for update;
  -- A retried command whose outcome already stands.
  if found and s.state='pending' and s.scheduled_for=p_at and s.scheduled_by=auth.uid() then return edra_private.content_schedule_view(s); end if;
  if coalesce(s.generation,0) is distinct from p_generation then raise exception 'schedule_conflict'; end if;
  if p_at is null or p_at<=clock_timestamp() then raise exception 'schedule_in_past'; end if;
  if (edra_private.content_latest_candidate(u.id,u.published_revision)).id is null then
    if exists(select 1 from public.content_revisions v where v.unit_id=u.id and v.revision=u.published_revision and v.document=u.draft) then raise exception 'nothing_to_publish'; end if;
    perform public.save_content_draft_version(p_academy_id,p_unit_id,u.version);
  end if;
  had_pending:=coalesce(s.state='pending',false);
  insert into public.content_publication_schedules(unit_id,academy_id,state,scheduled_for,scheduled_by,next_attempt_at)
    values(u.id,u.academy_id,'pending',p_at,auth.uid(),p_at)
    on conflict(unit_id) do update set generation=content_publication_schedules.generation+1,state='pending',scheduled_for=p_at,scheduled_by=auth.uid(),
      attempts=0,next_attempt_at=p_at,last_attempt_at=null,reason=null,candidate_id=null,published_revision=null,updated_at=clock_timestamp()
    returning * into s;
  insert into public.content_publication_events(academy_id,unit_id,generation,kind,actor_id,scheduled_for)
    values(u.academy_id,u.id,s.generation,case when had_pending then 'rescheduled' else 'scheduled' end,auth.uid(),p_at);
  return edra_private.content_schedule_view(s);
end $$;
commit;
