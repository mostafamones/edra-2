-- EDRA-129: selection reads retain RLS/session authority; historical labels remain available.
begin;

create function public.get_offering_track_labels(p_academy_id uuid)
returns table(track_id uuid,academic_year_id uuid,name text)
language plpgsql stable security definer set search_path='' as $$
begin
  perform edra_private.structure_actor(p_academy_id);
  return query select h.track_id,h.academic_year_id,h.name from edra_private.track_year_labels h
    join public.academy_tracks t on t.id=h.track_id join public.academic_years y on y.id=h.academic_year_id
    where t.academy_id=p_academy_id and y.closed_at is not null;
end $$;

create function public.offering_startable_schedules(p_academy_id uuid)
returns setof public.schedules language plpgsql stable security definer set search_path='' as $$
begin
  perform edra_private.structure_actor(p_academy_id);
  return query select s.* from public.schedules s
    join public.academic_years y on y.id=s.academic_year_id and y.closed_at is null
    left join public.groups g on g.id=s.group_id and g.academy_id=s.academy_id
    where s.academy_id=p_academy_id and s.archived_at is null
      and (s.group_id is null or g.archived_at is null)
      and edra_private.offering_available(s.academy_id,coalesce(s.level_id,g.level_id),coalesce(s.track_id,g.track_id));
end $$;
revoke all on function public.get_offering_track_labels(uuid),public.offering_startable_schedules(uuid) from public,anon,authenticated;
grant execute on function public.get_offering_track_labels(uuid),public.offering_startable_schedules(uuid) to authenticated;

-- Existing roster rows are immutable. Capture known labels in an additive sidecar, preferring
-- an original session snapshot. Current labels are explicitly only the names known at migration.
create table edra_private.session_roster_track_labels (
  session_id uuid not null,
  annual_student_record_id uuid not null,
  name text not null,
  source text not null check(source in ('session_snapshot','captured_current')),
  primary key(session_id,annual_student_record_id),
  foreign key(session_id,annual_student_record_id) references public.session_roster_entries(session_id,annual_student_record_id)
);
alter table edra_private.session_roster_track_labels enable row level security;
revoke all on edra_private.session_roster_track_labels from public,anon,authenticated,service_role;
insert into edra_private.session_roster_track_labels(session_id,annual_student_record_id,name,source)
select r.session_id,r.annual_student_record_id,
  case when r.track_id=s.track_id then coalesce(s.track_name,t.name) else coalesce(h.name,t.name) end,
  case when r.track_id=s.track_id and s.track_name is not null then 'session_snapshot' else 'captured_current' end
from public.session_roster_entries r join public.sessions s on s.id=r.session_id
join public.academy_tracks t on t.id=r.track_id
left join public.academic_years y on y.id=s.academic_year_id and y.closed_at is not null
left join edra_private.track_year_labels h on h.track_id=r.track_id and h.academic_year_id=y.id;

create function edra_private.capture_roster_track_label()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into edra_private.session_roster_track_labels(session_id,annual_student_record_id,name,source)
    select new.session_id,new.annual_student_record_id,t.name,'captured_current' from public.academy_tracks t where t.id=new.track_id;
  return null;
end $$;
create trigger roster_capture_track_label after insert on public.session_roster_entries
  for each row execute function edra_private.capture_roster_track_label();

create function edra_private.roster_track_label(p_session uuid,p_record uuid)
returns text language sql stable security definer set search_path='' as $$
  select h.name from edra_private.session_roster_track_labels h join public.sessions s on s.id=h.session_id
    where h.session_id=p_session and h.annual_student_record_id=p_record and edra_auth.session_allowed()
      and public.is_academy_member(s.academy_id);
$$;
revoke all on function edra_private.capture_roster_track_label(),edra_private.roster_track_label(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function edra_private.roster_track_label(uuid,uuid) to authenticated;

-- Retain the stable session-start error contract for web and existing native/bearer clients.
create or replace function edra_private.require_schedule_offering(p_schedule uuid)
returns void language plpgsql security definer set search_path='' as $$
declare s public.schedules; g public.groups;
begin
  select * into strict s from public.schedules where id=p_schedule;
  if s.audience='group' then
    select * into strict g from public.groups where id=s.group_id and academy_id=s.academy_id;
    if not edra_private.offering_available(s.academy_id,g.level_id,g.track_id) then raise exception 'schedule_unavailable'; end if;
  elsif not edra_private.offering_available(s.academy_id,s.level_id,s.track_id) then raise exception 'schedule_unavailable'; end if;
end $$;

create or replace function public.get_session(p_academy_id uuid, p_session_id uuid)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'session', to_jsonb(x),
    'roster', coalesce((
      select jsonb_agg(to_jsonb(e) order by lower(e.full_name), e.annual_student_record_id) from (
        select en.annual_student_record_id, r.academy_student_profile_id, r.full_name, r.student_phone, r.parent_phone,
          r.archived_at is not null as archived, en.origin, en.level_id, rl.name as level_name,
          en.track_id, edra_private.roster_track_label(en.session_id,en.annual_student_record_id) as track_name, en.primary_group_id, g.name as group_name,
          en.participation_type
        from public.session_roster_entries en
        join public.annual_student_records r on r.id = en.annual_student_record_id
        left join public.global_levels rl on rl.id = en.level_id
        left join public.academy_tracks t on t.id = en.track_id
        left join public.groups g on g.id = en.primary_group_id
        where en.session_id = x.id
      ) e
    ), '[]'::jsonb),
    'archive_impact', public.session_archive_impact(x.academy_id, x.id),
    'archive_events', coalesce((
      select jsonb_agg(jsonb_build_object('action', ev.action, 'ended_live', ev.ended_live, 'note', ev.note,
        'actor_name', ev.actor_name, 'occurred_at', ev.occurred_at) order by ev.id)
      from public.session_archive_events ev where ev.session_id = x.id
    ), '[]'::jsonb)
  )
  from (
    select s.id, s.academy_id, s.academic_year_id, s.schedule_id, s.schedule_title, s.schedule_kind,
      s.audience, s.group_id, s.group_name, s.level_id, gl.name as level_name, s.track_id, s.track_name,
      s.mandatory, s.location, s.started_at, s.started_by, s.started_by_name, s.auto_end_at,
      s.metadata_version,
      case when s.state = 'live' and s.auto_end_at <= now() then 'ended'::public.session_state else s.state end as state,
      case when s.state = 'live' and s.auto_end_at <= now() then s.auto_end_at else s.ended_at end as ended_at,
      case when s.state = 'live' and s.auto_end_at <= now() then 'auto'::public.session_end_reason else s.end_reason end as end_reason,
      s.ended_by, s.ended_by_name,
      s.archived_at, s.archived_by_name, s.archive_note,
      exists (select 1 from public.academic_years y where y.id = s.academic_year_id and y.closed_at is null) as year_open,
      coalesce(public.academy_role_for(s.academy_id)::text in ('owner', 'head_admin', 'admin'), false) as can_manage_archive
    from public.sessions s
    left join public.global_levels gl on gl.id = s.level_id
    where s.id = p_session_id and s.academy_id = p_academy_id
  ) x;
$$;
commit;
