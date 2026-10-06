-- History date range: p_from / p_to are inclusive academy-time (Africa/Cairo) calendar days of the
-- session start; either may be null. Replaces the five-argument list_past_sessions.

drop function public.list_past_sessions(uuid, text, timestamptz, uuid, integer);

create or replace function public.list_past_sessions(
  p_academy_id uuid, p_search text, p_from date, p_to date, p_before_started_at timestamptz, p_before_id uuid, p_limit integer
)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.started_at desc, x.id desc), '[]'::jsonb) from (
    select s.id, s.academy_id, a.name as academy_name, a.slug as academy_slug, s.academic_year_id,
      s.schedule_id, s.schedule_title, s.schedule_kind, s.audience, s.group_id, s.group_name,
      s.level_id, gl.name as level_name, s.track_id, s.track_name, s.mandatory, s.location,
      'ended'::public.session_state as state, s.started_at, s.started_by, s.started_by_name,
      s.auto_end_at, s.metadata_version,
      case when s.state = 'live' then s.auto_end_at else s.ended_at end as ended_at,
      s.ended_by_name,
      case when s.state = 'live' then 'auto'::public.session_end_reason else s.end_reason end as end_reason,
      (select count(*) from public.session_roster_entries e where e.session_id = s.id) as roster_count
    from public.sessions s
    join public.academies a on a.id = s.academy_id
    left join public.global_levels gl on gl.id = s.level_id
    where (s.state = 'ended' or s.auto_end_at <= now())
      and (p_academy_id is null or s.academy_id = p_academy_id)
      and (p_from is null or (s.started_at at time zone 'Africa/Cairo')::date >= p_from)
      and (p_to is null or (s.started_at at time zone 'Africa/Cairo')::date <= p_to)
      and (p_before_started_at is null or (s.started_at, s.id) < (p_before_started_at, p_before_id))
      and (
        nullif(btrim(p_search), '') is null
        or concat_ws(' ', s.schedule_title, s.group_name, gl.name, s.track_name, s.started_by_name)
          ilike '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%'
      )
    order by s.started_at desc, s.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  ) x;
$$;

revoke all on function public.list_past_sessions(uuid, text, date, date, timestamptz, uuid, integer) from public, anon;
grant execute on function public.list_past_sessions(uuid, text, date, date, timestamptz, uuid, integer) to authenticated;
