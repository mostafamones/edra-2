-- Session details show each rostered student's and parent's phone number (current values), so staff
-- can reach a family from the session. Same signature and grants as the original get_session.

create or replace function public.get_session(p_academy_id uuid, p_session_id uuid)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'session', to_jsonb(x),
    'roster', coalesce((
      select jsonb_agg(to_jsonb(e) order by lower(e.full_name), e.annual_student_record_id) from (
        select en.annual_student_record_id, r.academy_student_profile_id, r.full_name, r.student_phone, r.parent_phone,
          r.archived_at is not null as archived, en.origin, en.level_id, rl.name as level_name,
          en.track_id, t.name as track_name, en.primary_group_id, g.name as group_name,
          en.participation_type
        from public.session_roster_entries en
        join public.annual_student_records r on r.id = en.annual_student_record_id
        left join public.global_levels rl on rl.id = en.level_id
        left join public.academy_tracks t on t.id = en.track_id
        left join public.groups g on g.id = en.primary_group_id
        where en.session_id = x.id
      ) e
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
      s.ended_by, s.ended_by_name
    from public.sessions s
    left join public.global_levels gl on gl.id = s.level_id
    where s.id = p_session_id and s.academy_id = p_academy_id
  ) x;
$$;
