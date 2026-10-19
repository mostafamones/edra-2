-- EDRA-126: a genuinely new student's first annual record takes the account display name, falling
-- back to the full account name. Connecting an existing record keeps the academy's name, and the
-- returning path keeps its established full-name behavior. Later account edits never propagate.
-- Otherwise identical to 20261018110000_student_level_bound_enrollment.sql.

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

  select case when matched.kind = 'returning' then p.full_name else coalesce(p.display_name, p.full_name) end
  into account_name from public.profiles p where p.id = actor;
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
