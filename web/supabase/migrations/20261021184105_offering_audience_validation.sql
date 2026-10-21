-- Preserve assessment invalid_audience errors before lifecycle checks.
-- The offering gate still precedes all audience/group locks.
begin;

create or replace function edra_private.check_assignment_audience(
  p_academy_id uuid, p_academic_year_id uuid, p_audience public.assignment_audience, p_level_id text, p_track_id uuid,
  p_group_ids uuid[]
)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  group_total integer := coalesce(array_length(p_group_ids, 1), 0);
  active_total integer;
begin
  perform edra_private.offering_gate();
  if p_audience = 'groups' then
    if p_level_id is not null or p_track_id is not null or group_total < 1 or group_total > 100
      or (select count(distinct g) from unnest(p_group_ids) g) <> group_total or array_position(p_group_ids, null) is not null then
      raise exception using errcode = 'P0001', message = 'invalid_audience';
    end if;
    select count(*) into active_total from (
      select 1 from public.groups g
      where g.id = any (p_group_ids) and g.academy_id = p_academy_id and g.academic_year_id = p_academic_year_id
        and g.archived_at is null
      for share of g
    ) locked;
    if active_total <> group_total then raise exception using errcode = 'P0001', message = 'invalid_audience'; end if;
    perform edra_private.require_offering(g.academy_id,g.level_id,g.track_id)
      from public.groups g where g.id=any(p_group_ids) and g.academy_id=p_academy_id;
    return;
  end if;
  if group_total > 0 or p_level_id is null then raise exception using errcode = 'P0001', message = 'invalid_audience'; end if;
  perform 1 from public.academy_levels l where l.academy_id = p_academy_id and l.level_id = p_level_id;
  if not found then raise exception using errcode = 'P0001', message = 'invalid_audience'; end if;
  if p_audience = 'level' then
    if p_track_id is not null then raise exception using errcode = 'P0001', message = 'invalid_audience'; end if;
  else
    perform 1 from public.academy_tracks t where t.academy_id = p_academy_id and t.level_id = p_level_id and t.id = p_track_id;
    if not found then raise exception using errcode = 'P0001', message = 'invalid_audience'; end if;
  end if;
  perform edra_private.require_offering(p_academy_id,p_level_id,p_track_id);
end;
$$;

create or replace function edra_private.check_quiz_audience(
  p_academy_id uuid, p_academic_year_id uuid, p_audience public.quiz_audience, p_level_id text, p_track_id uuid, p_group_ids uuid[]
)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  group_total integer := coalesce(array_length(p_group_ids, 1), 0);
  active_total integer;
begin
  perform edra_private.offering_gate();
  if p_audience is null then
    if p_level_id is not null or p_track_id is not null or group_total > 0 then
      raise exception using errcode = 'P0001', message = 'invalid_audience';
    end if;
    return;
  end if;
  if p_audience = 'groups' then
    if p_level_id is not null or p_track_id is not null or group_total < 1 or group_total > 100
      or (select count(distinct g) from unnest(p_group_ids) g) <> group_total or array_position(p_group_ids, null) is not null then
      raise exception using errcode = 'P0001', message = 'invalid_audience';
    end if;
    select count(*) into active_total from (
      select 1 from public.groups g
      where g.id = any (p_group_ids) and g.academy_id = p_academy_id and g.academic_year_id = p_academic_year_id
        and g.archived_at is null
      for share of g
    ) locked;
    if active_total <> group_total then raise exception using errcode = 'P0001', message = 'invalid_audience'; end if;
    perform edra_private.require_offering(g.academy_id,g.level_id,g.track_id)
      from public.groups g where g.id=any(p_group_ids) and g.academy_id=p_academy_id;
    return;
  end if;
  if group_total > 0 or p_level_id is null then raise exception using errcode = 'P0001', message = 'invalid_audience'; end if;
  perform 1 from public.academy_levels l where l.academy_id = p_academy_id and l.level_id = p_level_id;
  if not found then raise exception using errcode = 'P0001', message = 'invalid_audience'; end if;
  if p_audience = 'level' then
    if p_track_id is not null then raise exception using errcode = 'P0001', message = 'invalid_audience'; end if;
  else
    perform 1 from public.academy_tracks t where t.academy_id = p_academy_id and t.level_id = p_level_id and t.id = p_track_id;
    if not found then raise exception using errcode = 'P0001', message = 'invalid_audience'; end if;
  end if;
  perform edra_private.require_offering(p_academy_id,p_level_id,p_track_id);
end;
$$;

create or replace function edra_private.check_exam_audience(
  p_academy_id uuid, p_academic_year_id uuid, p_audience public.exam_audience, p_level_id text, p_track_id uuid, p_group_ids uuid[]
)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  group_total integer := coalesce(array_length(p_group_ids, 1), 0);
  active_total integer;
begin
  perform edra_private.offering_gate();
  if p_audience is null then
    if p_level_id is not null or p_track_id is not null or group_total > 0 then
      raise exception using errcode = 'P0001', message = 'invalid_audience';
    end if;
    return;
  end if;
  if p_audience = 'groups' then
    if p_level_id is not null or p_track_id is not null or group_total < 1 or group_total > 100
      or (select count(distinct g) from unnest(p_group_ids) g) <> group_total or array_position(p_group_ids, null) is not null then
      raise exception using errcode = 'P0001', message = 'invalid_audience';
    end if;
    select count(*) into active_total from (
      select 1 from public.groups g
      where g.id = any (p_group_ids) and g.academy_id = p_academy_id and g.academic_year_id = p_academic_year_id
        and g.archived_at is null
      for share of g
    ) locked;
    if active_total <> group_total then raise exception using errcode = 'P0001', message = 'invalid_audience'; end if;
    perform edra_private.require_offering(g.academy_id,g.level_id,g.track_id)
      from public.groups g where g.id=any(p_group_ids) and g.academy_id=p_academy_id;
    return;
  end if;
  if group_total > 0 or p_level_id is null then raise exception using errcode = 'P0001', message = 'invalid_audience'; end if;
  perform 1 from public.academy_levels l where l.academy_id = p_academy_id and l.level_id = p_level_id;
  if not found then raise exception using errcode = 'P0001', message = 'invalid_audience'; end if;
  if p_audience = 'level' then
    if p_track_id is not null then raise exception using errcode = 'P0001', message = 'invalid_audience'; end if;
  else
    perform 1 from public.academy_tracks t where t.academy_id = p_academy_id and t.level_id = p_level_id and t.id = p_track_id;
    if not found then raise exception using errcode = 'P0001', message = 'invalid_audience'; end if;
  end if;
  perform edra_private.require_offering(p_academy_id,p_level_id,p_track_id);
end;
$$;

commit;
