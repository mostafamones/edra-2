-- Booking settings report each group's live seats and recurring schedule, so the staff preview
-- shows the same group cards as the public form.

create or replace function edra_private.student_booking_settings_json(p_academy_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  y public.academic_years%rowtype;
  s public.student_booking_settings%rowtype;
  catalog jsonb;
begin
  select * into y from public.academic_years where academy_id = p_academy_id and closed_at is null;
  if y.id is not null then
    select * into s from public.student_booking_settings where academic_year_id = y.id;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', l.level_id, 'name', gl.name,
      'tracks', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name) order by t.sort_order, t.id), '[]'::jsonb)
        from public.academy_tracks t where t.academy_id = l.academy_id and t.level_id = l.level_id and t.retired_at is null),
      'groups', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'trackId', g.track_id, 'capacity', g.capacity,
          'seatsLeft', case when g.capacity is null then null else greatest(g.capacity - (select count(*) from public.annual_student_records r
            where r.primary_group_id = g.id and r.archived_at is null), 0) end,
          'slots', (
            select coalesce(jsonb_agg(jsonb_build_object(
              'weekday', sl.weekday, 'startsAt', to_char(sl.starts_at, 'HH24:MI'), 'location', sc.location
            ) order by sl.weekday, sl.starts_at), '[]'::jsonb)
            from public.schedules sc join public.schedule_slots sl on sl.schedule_id = sc.id
            where sc.group_id = g.id and sc.kind = 'recurring' and sc.archived_at is null))
          order by lower(g.name), g.id), '[]'::jsonb)
        from public.groups g where g.academy_id = l.academy_id and g.academic_year_id = y.id and g.level_id = l.level_id
          and g.archived_at is null and (g.track_id is null or edra_private.offering_available(g.academy_id, g.level_id, g.track_id)))
    ) order by l.sort_order, l.level_id), '[]'::jsonb) into catalog
    from public.academy_levels l join public.global_levels gl on gl.id = l.level_id
    where l.academy_id = p_academy_id and l.stopped_at is null;
  end if;
  return jsonb_build_object(
    'token', (select token from public.student_booking_links where academy_id = p_academy_id),
    'canManage', public.is_academy_manager(p_academy_id),
    'year', case when y.id is null then null else jsonb_build_object('id', y.id, 'startYear', y.start_year) end,
    'catalog', coalesce(catalog, '[]'::jsonb),
    'settings', jsonb_build_object(
      'open', coalesce(s.is_open, false),
      'allowWithoutGroup', coalesce(s.allow_without_group, false),
      'participationMode', coalesce(s.participation_mode, 'in_person'),
      -- Only identities that are still live offerings or active groups are reported as enabled.
      'levelIds', to_jsonb(array(select x from unnest(coalesce(s.level_ids, '{}')) x
        where exists (select 1 from jsonb_array_elements(catalog) c where c->>'id' = x and jsonb_array_length(c->'tracks') = 0))),
      'trackIds', to_jsonb(array(select x from unnest(coalesce(s.track_ids, '{}')) x
        where exists (select 1 from jsonb_array_elements(catalog) c, jsonb_array_elements(c->'tracks') t where (t->>'id')::uuid = x))),
      'groupIds', to_jsonb(array(select x from unnest(coalesce(s.group_ids, '{}')) x
        where exists (select 1 from jsonb_array_elements(catalog) c, jsonb_array_elements(c->'groups') g where (g->>'id')::uuid = x))),
      'revision', coalesce(s.revision, 0)
    )
  );
end;
$$;
