-- Student enrollment: the account's level is bound to the student (EDRA-80 follow-up).
-- Academy onboarding never asks for a level. An academy that does not offer the account's level
-- blocks new and returning enrollment ('level_unavailable'); the student only chooses a track where
-- their level has tracks, and optionally a group. complete_student_invite loses its level argument.

drop function public.complete_student_invite(text, text, uuid, uuid);
drop function edra_private.student_enrollment_programs(uuid, uuid);

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
        ) >= g.capacity
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

create or replace function public.preview_student_invite(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  settings public.student_enrollment_settings%rowtype;
  phone text;
  student_level text;
  year_id uuid;
  matched record;
  academy jsonb;
  programs jsonb;
  current_record public.annual_student_records%rowtype;
begin
  if actor is null then return jsonb_build_object('result', 'unauthenticated'); end if;
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then return jsonb_build_object('result', 'invalid'); end if;
  select s.* into settings from public.student_enrollment_settings s where s.invite_token = p_token;
  if not found then return jsonb_build_object('result', 'invalid'); end if;
  phone := public.verified_account_phone(actor);
  if phone is null then return jsonb_build_object('result', 'unverified'); end if;
  select sp.level_id into student_level from public.student_profiles sp
  where sp.user_id = actor and sp.level_id is not null and sp.parent_phone_verified_at is not null;
  if not found then return jsonb_build_object('result', 'setup_required'); end if;

  academy := edra_private.student_invite_academy_json(settings.academy_id);
  select y.id into year_id from public.academic_years y where y.academy_id = settings.academy_id and y.closed_at is null;
  if year_id is null then return jsonb_build_object('result', 'unavailable', 'academy', academy); end if;

  matched := edra_private.student_enrollment_match(settings.academy_id, year_id, actor, phone);
  if matched.kind = 'connected' then
    return jsonb_build_object('result', 'connected', 'academy', academy);
  elsif matched.kind = 'existing' then
    select r.* into current_record from public.annual_student_records r where r.id = matched.record_id;
    return jsonb_build_object('result', 'existing', 'academy', academy, 'student', jsonb_build_object(
      'fullName', current_record.full_name,
      'levelName', (select gl.name from public.global_levels gl where gl.id = current_record.level_id),
      'trackName', (select t.name from public.academy_tracks t where t.id = current_record.track_id),
      'groupName', (select g.name from public.groups g where g.id = current_record.primary_group_id)
    ));
  elsif matched.kind in ('archived', 'conflict') then
    return jsonb_build_object('result', 'staff_help', 'reason', matched.kind, 'academy', academy);
  end if;

  -- The account's level is bound to the student; the academy must offer it.
  if not exists (
    select 1 from public.academy_levels l where l.academy_id = settings.academy_id and l.level_id = student_level
  ) then
    return jsonb_build_object('result', 'level_unavailable', 'academy', academy);
  end if;
  if not settings.enrollment_open then return jsonb_build_object('result', 'closed', 'academy', academy); end if;
  programs := edra_private.student_enrollment_programs(settings.academy_id, year_id, student_level);
  if jsonb_array_length(programs) = 0 then return jsonb_build_object('result', 'unavailable', 'academy', academy); end if;
  return jsonb_build_object(
    'result', 'enroll', 'returning', matched.kind = 'returning', 'academy', academy, 'programs', programs);
end;
$$;

create or replace function public.complete_student_invite(
  p_token text, p_track_id uuid, p_group_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  settings public.student_enrollment_settings%rowtype;
  phone text;
  year_id uuid;
  matched record;
  academy jsonb;
  account_name text;
  parent text;
  student_level text;
  participation public.student_participation_type;
  chosen public.groups%rowtype;
  profile_id uuid;
begin
  if actor is null then return jsonb_build_object('result', 'unauthenticated'); end if;
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then return jsonb_build_object('result', 'invalid'); end if;
  phone := public.verified_account_phone(actor);
  if phone is null then return jsonb_build_object('result', 'unverified'); end if;
  select sp.parent_phone, sp.level_id into parent, student_level from public.student_profiles sp
  where sp.user_id = actor and sp.level_id is not null and sp.parent_phone_verified_at is not null;
  if not found then return jsonb_build_object('result', 'setup_required'); end if;

  select s.* into settings from public.student_enrollment_settings s where s.invite_token = p_token for share;
  if not found then return jsonb_build_object('result', 'invalid'); end if;
  academy := edra_private.student_invite_academy_json(settings.academy_id);

  -- One onboarding at a time per academy and phone (so also per account).
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('student_enrollment:' || settings.academy_id::text || ':' || phone, 0));

  select y.id into year_id from public.academic_years y
  where y.academy_id = settings.academy_id and y.closed_at is null for share;
  if year_id is null then return jsonb_build_object('result', 'unavailable', 'academy', academy); end if;

  matched := edra_private.student_enrollment_match(settings.academy_id, year_id, actor, phone);
  if matched.kind = 'connected' then
    return jsonb_build_object('result', 'connected', 'academy', academy);
  elsif matched.kind in ('archived', 'conflict') then
    return jsonb_build_object('result', 'staff_help', 'reason', matched.kind, 'academy', academy);
  elsif matched.kind = 'existing' then
    update public.academy_student_profiles p set user_id = actor, linked_at = now()
    where p.id = matched.profile_id and p.user_id is null;
    if not found then
      return jsonb_build_object('result', 'staff_help', 'reason', 'conflict', 'academy', academy);
    end if;
    return jsonb_build_object('result', 'connected', 'academy', academy);
  end if;

  -- New or returning: creates annual participation.
  if not exists (
    select 1 from public.academy_levels l where l.academy_id = settings.academy_id and l.level_id = student_level
  ) then
    return jsonb_build_object('result', 'level_unavailable', 'academy', academy);
  end if;
  if not settings.enrollment_open then return jsonb_build_object('result', 'closed', 'academy', academy); end if;
  if (p_track_id is null and exists (
    select 1 from public.academy_tracks t where t.academy_id = settings.academy_id and t.level_id = student_level
  )) or (p_track_id is not null and not exists (
    select 1 from public.academy_tracks t
    where t.academy_id = settings.academy_id and t.level_id = student_level and t.id = p_track_id
  )) then
    return jsonb_build_object('result', 'invalid_choice', 'academy', academy);
  end if;

  if p_group_id is not null then
    select g.* into chosen from public.groups g
    where g.id = p_group_id and g.academy_id = settings.academy_id and g.academic_year_id = year_id
      and g.archived_at is null and g.level_id = student_level and (g.track_id is null or g.track_id = p_track_id)
    for update;
    if not found then return jsonb_build_object('result', 'invalid_choice', 'academy', academy); end if;
    if chosen.capacity is not null and (
      select count(*) from public.annual_student_records r where r.primary_group_id = chosen.id and r.archived_at is null
    ) >= chosen.capacity then
      return jsonb_build_object('result', 'group_full', 'academy', academy);
    end if;
  end if;

  select p.full_name into account_name from public.profiles p where p.id = actor;
  if matched.kind = 'returning' then
    select r.participation_type into participation from public.annual_student_records r
    where r.academy_student_profile_id = matched.profile_id order by r.created_at desc limit 1;
  end if;
  participation := coalesce(participation, settings.new_student_participation_type);

  begin
    perform public.check_student_record_input(account_name, phone, parent, student_level, participation);
  exception when sqlstate 'P0001' then
    return jsonb_build_object('result', 'staff_help', 'reason', 'details', 'academy', academy);
  end;

  begin
    if matched.kind = 'returning' then
      profile_id := matched.profile_id;
      update public.academy_student_profiles p set user_id = actor, linked_at = coalesce(p.linked_at, now())
      where p.id = profile_id and (p.user_id is null or p.user_id = actor);
      if not found then
        return jsonb_build_object('result', 'staff_help', 'reason', 'conflict', 'academy', academy);
      end if;
    else
      insert into public.academy_student_profiles (academy_id, created_by, user_id, linked_at)
      values (settings.academy_id, actor, actor, now())
      returning id into profile_id;
    end if;
    insert into public.annual_student_records (
      academy_id, academic_year_id, academy_student_profile_id, full_name, student_phone, parent_phone,
      level_id, track_id, primary_group_id, participation_type, created_by
    ) values (
      settings.academy_id, year_id, profile_id, pg_catalog.btrim(account_name), phone, parent,
      student_level, p_track_id, p_group_id, participation, actor
    );
  exception
    when unique_violation then
      -- A concurrent staff record or link took the phone or account; the student should re-check.
      return jsonb_build_object('result', 'changed', 'academy', academy);
    when sqlstate 'P0001' then
      return jsonb_build_object('result', 'invalid_choice', 'academy', academy);
  end;
  return jsonb_build_object('result', 'connected', 'academy', academy);
end;
$$;

revoke all on function edra_private.student_enrollment_programs(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.complete_student_invite(text, uuid, uuid) from public, anon;
grant execute on function public.complete_student_invite(text, uuid, uuid) to authenticated;
