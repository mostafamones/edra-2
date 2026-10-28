-- Booking choices become exclusions: every live level, track and group of the open year is offered
-- unless staff exclude it, so offerings added later are bookable without revisiting the settings.
-- Existing allow-lists are converted to the equivalent exclusions of the current catalog.

alter table public.student_booking_settings rename column level_ids to excluded_level_ids;
alter table public.student_booking_settings rename column track_ids to excluded_track_ids;
alter table public.student_booking_settings rename column group_ids to excluded_group_ids;

update public.student_booking_settings s set
  excluded_level_ids = array(select l.level_id from public.academy_levels l
    where l.academy_id = s.academy_id and l.stopped_at is null and not l.level_id = any (s.excluded_level_ids)
      and not exists (select 1 from public.academy_tracks t
        where t.academy_id = l.academy_id and t.level_id = l.level_id and t.retired_at is null)),
  excluded_track_ids = array(select t.id from public.academy_tracks t
    where t.academy_id = s.academy_id and t.retired_at is null and not t.id = any (s.excluded_track_ids)),
  excluded_group_ids = array(select g.id from public.groups g
    where g.academy_id = s.academy_id and g.academic_year_id = s.academic_year_id and g.archived_at is null
      and not g.id = any (s.excluded_group_ids));

-- Whether (level, track) is a live offering not excluded by the settings. A level with active tracks
-- is offered only through a non-excluded active track; a trackless level unless it is excluded.
create or replace function edra_private.booking_program_enabled(p_settings public.student_booking_settings, p_level text, p_track uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select edra_private.offering_available(p_settings.academy_id, p_level, p_track)
    and case
      when exists (select 1 from public.academy_tracks t
        where t.academy_id = p_settings.academy_id and t.level_id = p_level and t.retired_at is null)
        then p_track is not null and not p_track = any (p_settings.excluded_track_ids)
      else p_track is null and not p_level = any (p_settings.excluded_level_ids)
    end;
$$;

create or replace function edra_private.booking_group_enabled(p_settings public.student_booking_settings, p_group public.groups, p_level text, p_track uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select not p_group.id = any (p_settings.excluded_group_ids) and p_group.academy_id = p_settings.academy_id
    and p_group.academic_year_id = p_settings.academic_year_id and p_group.archived_at is null
    and p_group.level_id = p_level and (p_group.track_id is null or p_group.track_id = p_track);
$$;

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
      -- Only exclusions of identities that are still live offerings or active groups are reported.
      'excludedLevelIds', to_jsonb(array(select x from unnest(coalesce(s.excluded_level_ids, '{}')) x
        where exists (select 1 from jsonb_array_elements(catalog) c where c->>'id' = x and jsonb_array_length(c->'tracks') = 0))),
      'excludedTrackIds', to_jsonb(array(select x from unnest(coalesce(s.excluded_track_ids, '{}')) x
        where exists (select 1 from jsonb_array_elements(catalog) c, jsonb_array_elements(c->'tracks') t where (t->>'id')::uuid = x))),
      'excludedGroupIds', to_jsonb(array(select x from unnest(coalesce(s.excluded_group_ids, '{}')) x
        where exists (select 1 from jsonb_array_elements(catalog) c, jsonb_array_elements(c->'groups') g where (g->>'id')::uuid = x))),
      'revision', coalesce(s.revision, 0)
    )
  );
end;
$$;

-- Parameter names change with the meaning, so the function is recreated.
drop function public.save_student_booking_settings(uuid, uuid, integer, boolean, boolean, text, text[], uuid[], uuid[]);

-- Saves the open year's configuration atomically against the expected revision (0 before the first save).
create function public.save_student_booking_settings(
  p_academy_id uuid, p_academic_year_id uuid, p_expected_revision integer, p_open boolean, p_allow_without_group boolean,
  p_participation_mode text, p_excluded_level_ids text[], p_excluded_track_ids uuid[], p_excluded_group_ids uuid[]
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  existing public.student_booking_settings%rowtype;
  v_next public.student_booking_settings%rowtype;
begin
  perform edra_private.offering_gate();
  if actor is null or not edra_auth.session_allowed() or not public.is_academy_manager(p_academy_id) then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  if p_academic_year_id is null or p_expected_revision is null or p_open is null or p_allow_without_group is null
    or p_participation_mode is null or p_participation_mode not in ('in_person', 'online_only', 'choice')
    or cardinality(p_excluded_level_ids) > 50 or cardinality(p_excluded_track_ids) > 200 or cardinality(p_excluded_group_ids) > 500 then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  perform 1 from public.academic_years y
  where y.id = p_academic_year_id and y.academy_id = p_academy_id and y.closed_at is null for share;
  if not found then raise exception using errcode = 'P0001', message = 'year_unavailable'; end if;
  select * into existing from public.student_booking_settings where academic_year_id = p_academic_year_id for update;
  if coalesce(existing.revision, 0) <> p_expected_revision then
    raise exception using errcode = 'P0001', message = 'stale';
  end if;

  v_next.academy_id := p_academy_id;
  v_next.academic_year_id := p_academic_year_id;
  v_next.is_open := p_open;
  v_next.allow_without_group := p_allow_without_group;
  v_next.participation_mode := p_participation_mode;
  -- Keep only exclusions of identities that are currently offered in this academy and year.
  v_next.excluded_level_ids := array(select distinct x from unnest(coalesce(p_excluded_level_ids, '{}')) x
    where edra_private.offering_available(p_academy_id, x, null));
  v_next.excluded_track_ids := array(select distinct x from unnest(coalesce(p_excluded_track_ids, '{}')) x
    join public.academy_tracks t on t.id = x and t.academy_id = p_academy_id
    where edra_private.offering_available(p_academy_id, t.level_id, t.id));
  v_next.excluded_group_ids := array(select distinct x from unnest(coalesce(p_excluded_group_ids, '{}')) x
    join public.groups g on g.id = x and g.academy_id = p_academy_id and g.academic_year_id = p_academic_year_id
    where g.archived_at is null);

  -- Opening needs at least one registration path.
  if p_open and not exists (
    select 1 from public.academy_levels l
    left join (select * from public.academy_tracks where retired_at is null) t on t.academy_id = l.academy_id and t.level_id = l.level_id
    where l.academy_id = p_academy_id and edra_private.booking_program_enabled(v_next, l.level_id, t.id)
      and (v_next.allow_without_group or exists (select 1 from public.groups g
        where g.academy_id = p_academy_id and edra_private.booking_group_enabled(v_next, g, l.level_id, t.id)))
  ) then
    raise exception using errcode = 'P0001', message = 'no_options';
  end if;

  insert into public.student_booking_settings as s (academic_year_id, academy_id, is_open, allow_without_group,
    participation_mode, excluded_level_ids, excluded_track_ids, excluded_group_ids, updated_by)
  values (p_academic_year_id, p_academy_id, v_next.is_open, v_next.allow_without_group, v_next.participation_mode,
    v_next.excluded_level_ids, v_next.excluded_track_ids, v_next.excluded_group_ids, actor)
  on conflict (academic_year_id) do update set
    is_open = excluded.is_open, allow_without_group = excluded.allow_without_group,
    participation_mode = excluded.participation_mode, excluded_level_ids = excluded.excluded_level_ids,
    excluded_track_ids = excluded.excluded_track_ids, excluded_group_ids = excluded.excluded_group_ids,
    revision = s.revision + 1, updated_at = now(), updated_by = excluded.updated_by;
  insert into public.student_booking_links (academy_id, token, created_by)
  values (p_academy_id, edra_private.new_student_invite_token(), actor)
  on conflict (academy_id) do nothing;
  return edra_private.student_booking_settings_json(p_academy_id);
end;
$$;

revoke all on function public.save_student_booking_settings(uuid, uuid, integer, boolean, boolean, text, text[], uuid[], uuid[]) from public, anon;
grant execute on function public.save_student_booking_settings(uuid, uuid, integer, boolean, boolean, text, text[], uuid[], uuid[]) to authenticated;
