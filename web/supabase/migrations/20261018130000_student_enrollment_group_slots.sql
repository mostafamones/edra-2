-- Offers each group's weekly times (when it has any) in the enrollment program list.

create or replace function edra_private.student_enrollment_programs(p_academy_id uuid, p_academic_year_id uuid, p_level_id text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'levelId', program.level_id, 'levelName', program.level_name,
    'trackId', program.track_id, 'trackName', program.track_name,
    'groups', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', g.name,
        'full', g.capacity is not null and (
          select count(*) from public.annual_student_records r
          where r.primary_group_id = g.id and r.archived_at is null
        ) >= g.capacity,
        -- Active recurring weekly times only; groups without any simply have none.
        'slots', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'weekday', sl.weekday, 'startsAt', to_char(sl.starts_at, 'HH24:MI'), 'location', s.location
          ) order by sl.weekday, sl.starts_at), '[]'::jsonb)
          from public.schedules s
          join public.schedule_slots sl on sl.schedule_id = s.id
          where s.group_id = g.id and s.kind = 'recurring' and s.archived_at is null
        )
      ) order by lower(g.name), g.id), '[]'::jsonb)
      from public.groups g
      where g.academy_id = p_academy_id and g.academic_year_id = p_academic_year_id and g.archived_at is null
        and g.level_id = program.level_id and (g.track_id is null or g.track_id = program.track_id)
    )
  ) order by program.level_order, program.track_order nulls first), '[]'::jsonb)
  from (
    select l.level_id, gl.name as level_name, l.sort_order as level_order,
      t.id as track_id, t.name as track_name, t.sort_order as track_order
    from public.academy_levels l
    join public.global_levels gl on gl.id = l.level_id
    left join public.academy_tracks t on t.academy_id = l.academy_id and t.level_id = l.level_id
    where l.academy_id = p_academy_id and l.level_id = p_level_id
  ) program;
$$;
