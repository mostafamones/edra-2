-- Student enrollment and account linking (EDRA-80).
--
-- * academy_student_profiles.user_id connects one Edra account to one academy profile, with at most
--   one profile per account in an academy. A connection is never reassigned; a phone match cannot
--   transfer it. Staff never write it: only complete_student_invite links accounts.
-- * Online-access suspension has two independent causes. Archiving the current annual record is
--   one (archived_at); academy_student_profiles.access_suspended_at is the independent staff
--   suspension, managed by EDRA-155. Restoring a record clears only archived_at, so an independent
--   suspension survives it. edra_private.student_access_suspended is the effective check.
-- * student_enrollment_settings holds the academy's shareable invite token, whether new annual
--   participation may be created, and the participation type given to genuinely new students.
--   Clients have no table grants; the functions below derive the actor from auth.uid().
-- * Onboarding matches only the caller's verified account phone within the invited academy.
--   Ordinary access (edra_private.student_caller_record) resolves the connected record and never
--   matches phones.
--
-- Lock order in complete_student_invite: settings row FOR SHARE, advisory (academy, phone), active
-- year FOR SHARE, chosen group FOR UPDATE, profile row. Settings changes take the settings row
-- FOR UPDATE, so closing enrollment or replacing the link serializes with in-flight completions.

alter table public.academy_student_profiles
  add column user_id uuid,
  add column linked_at timestamptz,
  add column access_suspended_at timestamptz,
  add constraint academy_student_profiles_user_fk foreign key (user_id)
    references public.profiles (id) on delete set null,
  add constraint academy_student_profiles_link_pair check (user_id is null or linked_at is not null);

create unique index academy_student_profiles_one_per_account
  on public.academy_student_profiles (academy_id, user_id) where user_id is not null;

create or replace function public.protect_student_account_link()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- Only a deleted account (ON DELETE SET NULL) may clear an existing connection.
  if old.user_id is not null and new.user_id is distinct from old.user_id
    and (new.user_id is not null or exists (select 1 from public.profiles p where p.id = old.user_id)) then
    raise exception using errcode = 'P0001', message = 'account_link_conflict';
  end if;
  return new;
end;
$$;

create trigger academy_student_profiles_protect_link
before update of user_id on public.academy_student_profiles
for each row execute function public.protect_student_account_link();

create table public.student_enrollment_settings (
  academy_id uuid primary key references public.academies (id) on delete cascade,
  enrollment_open boolean not null default true,
  new_student_participation_type public.student_participation_type not null default 'in_person',
  invite_token text unique check (invite_token ~ '^[A-Za-z0-9_-]{43}$'),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

alter table public.student_enrollment_settings enable row level security;
revoke all on public.student_enrollment_settings from public, anon, authenticated;

-- 32 random bytes in base64url (43 characters).
create or replace function edra_private.new_student_invite_token()
returns text language sql volatile set search_path = '' as $$
  select pg_catalog.rtrim(
    pg_catalog.translate(pg_catalog.encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
$$;

-- Either suspension cause blocks protected online access.
create or replace function edra_private.student_access_suspended(
  p_record public.annual_student_records, p_profile public.academy_student_profiles
)
returns boolean language sql immutable set search_path = '' as $$
  select p_record.archived_at is not null or p_profile.access_suspended_at is not null;
$$;

-- The caller's connected, not effectively suspended annual record in an open academy year.
create or replace function edra_private.student_caller_record(p_academy_id uuid, p_academic_year_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select r.id
  from public.academy_student_profiles p
  join public.annual_student_records r on r.academy_student_profile_id = p.id
  join public.academic_years y on y.id = r.academic_year_id and y.closed_at is null
  where p.academy_id = p_academy_id and p.user_id = auth.uid()
    and r.academic_year_id = p_academic_year_id
    and not edra_private.student_access_suspended(r, p);
$$;

create or replace function edra_private.student_enrollment_settings_json(p_academy_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'enrollmentOpen', coalesce(s.enrollment_open, true),
    'newStudentParticipationType', coalesce(s.new_student_participation_type, 'in_person'),
    'inviteToken', s.invite_token,
    'canManage', public.is_academy_manager(p_academy_id)
  )
  from (select 1) one
  left join public.student_enrollment_settings s on s.academy_id = p_academy_id;
$$;

-- Every staff role may read and share the link; the raw token is returned only to members.
create or replace function public.get_student_enrollment_settings(p_academy_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.academy_role_for(p_academy_id) is null then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  return edra_private.student_enrollment_settings_json(p_academy_id);
end;
$$;

create or replace function public.update_student_enrollment_settings(
  p_academy_id uuid, p_enrollment_open boolean, p_participation_type public.student_participation_type
)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_academy_manager(p_academy_id) then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  if p_enrollment_open is null or p_participation_type is null then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  insert into public.student_enrollment_settings as s (academy_id, enrollment_open, new_student_participation_type, updated_by)
  values (p_academy_id, p_enrollment_open, p_participation_type, auth.uid())
  on conflict (academy_id) do update
  set enrollment_open = excluded.enrollment_open,
      new_student_participation_type = excluded.new_student_participation_type,
      updated_at = now(), updated_by = excluded.updated_by;
  return edra_private.student_enrollment_settings_json(p_academy_id);
end;
$$;

-- p_active = true issues a new link (replacing any current one); false revokes it. Existing
-- connections are unaffected either way.
create or replace function public.set_student_invite(p_academy_id uuid, p_active boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  token text := case when p_active then edra_private.new_student_invite_token() end;
begin
  if auth.uid() is null or not public.is_academy_manager(p_academy_id) then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  if p_active is null then raise exception using errcode = 'P0001', message = 'validation'; end if;
  insert into public.student_enrollment_settings as s (academy_id, invite_token, updated_by)
  values (p_academy_id, token, auth.uid())
  on conflict (academy_id) do update
  set invite_token = excluded.invite_token, updated_at = now(), updated_by = excluded.updated_by;
  return edra_private.student_enrollment_settings_json(p_academy_id);
end;
$$;

-- Which onboarding path applies to an account in an academy year. Kinds: connected, existing, new,
-- returning, archived, conflict. profile_id/record_id identify the matched profile/record.
create or replace function edra_private.student_enrollment_match(
  p_academy_id uuid, p_academic_year_id uuid, p_actor uuid, p_phone text,
  out kind text, out profile_id uuid, out record_id uuid
)
language plpgsql stable security definer set search_path = '' as $$
declare
  current_record public.annual_student_records%rowtype;
  matches integer;
begin
  -- An existing connection is authoritative.
  select p.id into profile_id from public.academy_student_profiles p
  where p.academy_id = p_academy_id and p.user_id = p_actor;
  if found then
    select r.* into current_record from public.annual_student_records r
    where r.academy_student_profile_id = profile_id and r.academic_year_id = p_academic_year_id;
    if found then
      record_id := current_record.id;
      kind := case when current_record.archived_at is null then 'connected' else 'archived' end;
    elsif exists (
      select 1 from public.annual_student_records r
      where r.academy_id = p_academy_id and r.academic_year_id = p_academic_year_id and r.student_phone = p_phone
    ) then
      kind := 'conflict';
    else
      kind := 'returning';
    end if;
    return;
  end if;

  -- Current-year phone uniqueness includes archived records, so at most one row matches.
  select r.* into current_record from public.annual_student_records r
  where r.academy_id = p_academy_id and r.academic_year_id = p_academic_year_id and r.student_phone = p_phone;
  if found then
    record_id := current_record.id;
    profile_id := current_record.academy_student_profile_id;
    kind := case
      when exists (select 1 from public.academy_student_profiles p where p.id = profile_id and p.user_id is not null) then 'conflict'
      when current_record.archived_at is not null then 'archived'
      else 'existing'
    end;
    return;
  end if;

  -- Several historical records under one profile are one identity.
  select count(distinct r.academy_student_profile_id), (array_agg(r.academy_student_profile_id))[1]
  into matches, profile_id
  from public.annual_student_records r
  where r.academy_id = p_academy_id and r.student_phone = p_phone;
  if matches = 0 then
    kind := 'new';
    profile_id := null;
  elsif matches > 1 or exists (
    select 1 from public.academy_student_profiles p where p.id = profile_id and p.user_id is not null
  ) or exists (
    -- The profile already has a current-year record under another phone.
    select 1 from public.annual_student_records r
    where r.academy_student_profile_id = profile_id and r.academic_year_id = p_academic_year_id
  ) then
    kind := 'conflict';
    profile_id := null;
  else
    kind := 'returning';
  end if;
end;
$$;

create or replace function edra_private.student_invite_academy_json(p_academy_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', a.id, 'name', a.name, 'slug', a.slug, 'icon', a.icon)
  from public.academies a where a.id = p_academy_id;
$$;

-- The academy's programs (level, plus track where the level has tracks) with compatible active groups.
create or replace function edra_private.student_enrollment_programs(p_academy_id uuid, p_academic_year_id uuid)
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
    where l.academy_id = p_academy_id
  ) program;
$$;

-- Read-only: what this account's onboarding into the invited academy looks like now. Never links.
create or replace function public.preview_student_invite(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  settings public.student_enrollment_settings%rowtype;
  phone text;
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
  if not exists (
    select 1 from public.student_profiles sp
    where sp.user_id = actor and sp.level_id is not null and sp.parent_phone_verified_at is not null
  ) then
    return jsonb_build_object('result', 'setup_required');
  end if;

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

  if not settings.enrollment_open then return jsonb_build_object('result', 'closed', 'academy', academy); end if;
  programs := edra_private.student_enrollment_programs(settings.academy_id, year_id);
  if jsonb_array_length(programs) = 0 then return jsonb_build_object('result', 'unavailable', 'academy', academy); end if;
  return jsonb_build_object(
    'result', 'enroll', 'returning', matched.kind = 'returning', 'academy', academy, 'programs', programs);
end;
$$;

-- Connects the existing current-year record, or creates current-year participation (under the
-- returning profile or a new one) and connects it, atomically. Rechecks invite, year, enrollment
-- availability, program/group compatibility and capacity at commit time. A retry after success
-- returns 'connected' for the same relationship.
create or replace function public.complete_student_invite(
  p_token text, p_level_id text, p_track_id uuid, p_group_id uuid
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
  participation public.student_participation_type;
  chosen public.groups%rowtype;
  profile_id uuid;
begin
  if actor is null then return jsonb_build_object('result', 'unauthenticated'); end if;
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then return jsonb_build_object('result', 'invalid'); end if;
  phone := public.verified_account_phone(actor);
  if phone is null then return jsonb_build_object('result', 'unverified'); end if;
  select sp.parent_phone into parent from public.student_profiles sp
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
  if not settings.enrollment_open then return jsonb_build_object('result', 'closed', 'academy', academy); end if;
  if p_level_id is null or not exists (
    select 1 from public.academy_levels l where l.academy_id = settings.academy_id and l.level_id = p_level_id
  ) or (p_track_id is null and exists (
    select 1 from public.academy_tracks t where t.academy_id = settings.academy_id and t.level_id = p_level_id
  )) or (p_track_id is not null and not exists (
    select 1 from public.academy_tracks t
    where t.academy_id = settings.academy_id and t.level_id = p_level_id and t.id = p_track_id
  )) then
    return jsonb_build_object('result', 'invalid_choice', 'academy', academy);
  end if;

  if p_group_id is not null then
    select g.* into chosen from public.groups g
    where g.id = p_group_id and g.academy_id = settings.academy_id and g.academic_year_id = year_id
      and g.archived_at is null and g.level_id = p_level_id and (g.track_id is null or g.track_id = p_track_id)
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
    perform public.check_student_record_input(account_name, phone, parent, p_level_id, participation);
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
      p_level_id, p_track_id, p_group_id, participation, actor
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

-- Academies this account is connected to, for student navigation.
create or replace function public.list_my_student_academies()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'slug', a.slug, 'icon', a.icon)
    order by lower(a.name), a.id), '[]'::jsonb)
  from public.academy_student_profiles p
  join public.academies a on a.id = p.academy_id
  where p.user_id = auth.uid();
$$;

-- The connected account's view of one academy: current participation and access status. Null when
-- the account is not connected to that academy.
create or replace function public.get_my_student_academy(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  profile public.academy_student_profiles%rowtype;
  current_record public.annual_student_records%rowtype;
  year_start integer;
begin
  if auth.uid() is null then return null; end if;
  select p.* into profile from public.academy_student_profiles p
  join public.academies a on a.id = p.academy_id
  where a.slug = p_slug and p.user_id = auth.uid();
  if not found then return null; end if;
  select r.* into current_record from public.annual_student_records r
  join public.academic_years y on y.id = r.academic_year_id and y.closed_at is null
  where r.academy_student_profile_id = profile.id;
  select y.start_year into year_start from public.academic_years y
  where y.academy_id = profile.academy_id and y.closed_at is null;
  return jsonb_build_object(
    'academy', edra_private.student_invite_academy_json(profile.academy_id),
    'startYear', year_start,
    'access', case
      when current_record.id is null then 'no_current_year'
      when edra_private.student_access_suspended(current_record, profile) then 'suspended'
      else 'active'
    end,
    'record', case when current_record.id is null then null else jsonb_build_object(
      'fullName', current_record.full_name,
      'levelName', (select gl.name from public.global_levels gl where gl.id = current_record.level_id),
      'trackName', (select t.name from public.academy_tracks t where t.id = current_record.track_id),
      'groupName', (select g.name from public.groups g where g.id = current_record.primary_group_id),
      'participationType', current_record.participation_type
    ) end
  );
end;
$$;

-- Quiz and exam student wrappers resolve identity through the shared connected-record resolver.
-- Their audience, window/timer and content guards are unchanged (quiz content remains denied).
create or replace function edra_private.quiz_caller_record(p_quiz_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select edra_private.student_caller_record(q.academy_id, q.academic_year_id)
  from public.quizzes q where q.id = p_quiz_id;
$$;

create or replace function edra_private.exam_caller_record(p_exam_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select edra_private.student_caller_record(z.academy_id, z.academic_year_id)
  from public.exams z where z.id = p_exam_id;
$$;

revoke all on function public.protect_student_account_link() from public, anon, authenticated;
revoke all on function edra_private.new_student_invite_token() from public, anon, authenticated;
revoke all on function edra_private.student_access_suspended(public.annual_student_records, public.academy_student_profiles) from public, anon, authenticated;
revoke all on function edra_private.student_caller_record(uuid, uuid) from public, anon, authenticated;
revoke all on function edra_private.student_enrollment_settings_json(uuid) from public, anon, authenticated;
revoke all on function edra_private.student_enrollment_match(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function edra_private.student_invite_academy_json(uuid) from public, anon, authenticated;
revoke all on function edra_private.student_enrollment_programs(uuid, uuid) from public, anon, authenticated;
revoke all on function edra_private.quiz_caller_record(uuid) from public, anon, authenticated;
revoke all on function edra_private.exam_caller_record(uuid) from public, anon, authenticated;

revoke all on function public.get_student_enrollment_settings(uuid) from public, anon;
revoke all on function public.update_student_enrollment_settings(uuid, boolean, public.student_participation_type) from public, anon;
revoke all on function public.set_student_invite(uuid, boolean) from public, anon;
revoke all on function public.preview_student_invite(text) from public, anon;
revoke all on function public.complete_student_invite(text, text, uuid, uuid) from public, anon;
revoke all on function public.list_my_student_academies() from public, anon;
revoke all on function public.get_my_student_academy(text) from public, anon;
grant execute on function public.get_student_enrollment_settings(uuid) to authenticated;
grant execute on function public.update_student_enrollment_settings(uuid, boolean, public.student_participation_type) to authenticated;
grant execute on function public.set_student_invite(uuid, boolean) to authenticated;
grant execute on function public.preview_student_invite(text) to authenticated;
grant execute on function public.complete_student_invite(text, text, uuid, uuid) to authenticated;
grant execute on function public.list_my_student_academies() to authenticated;
grant execute on function public.get_my_student_academy(text) to authenticated;
