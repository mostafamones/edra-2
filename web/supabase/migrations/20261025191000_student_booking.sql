-- EDRA-231: public booking form and settings.
--
-- * student_booking_links holds the academy's stable, opaque booking token. It is independent of the
--   ordinary student invite token and is never returned through public booking responses.
-- * student_booking_settings is the explicit configuration of one academic year: open state, enabled
--   trackless levels, enabled tracks and groups, group-optional registration and participation mode.
--   A new year has no row, so booking starts closed. Enabled identities are intersected with live
--   offerings and active groups on every read and write; nothing new is exposed automatically.
-- * student_booking_receipts records each booking-origin annual creation (public form or signed-in
--   returning onboarding) for retry safety and staff provenance. It is not an application workflow.
-- * Provenance: academy_student_profiles and annual_student_records gain created_via. A null
--   created_by is allowed only for 'booking' (anonymous public registration); every other creation
--   keeps its true actor. Both columns are immutable.
-- * Public booking never links an account. Signed-in returning and eligible current-year students
--   use the shared verified onboarding (edra_private.student_entry_preview/complete) with the
--   booking entry kind; the ordinary invite wrappers keep their behavior.
--
-- Lock order (submit_student_booking): offering gate, booking link FOR SHARE, retry-key advisory,
-- quota rows, advisory (academy, phone) shared with invite onboarding, open year FOR SHARE, booking
-- settings FOR SHARE, chosen group FOR UPDATE, historical profile FOR UPDATE. Settings saves take the
-- year FOR SHARE then the settings row FOR UPDATE, so closing or editing serializes with completion.
begin;

-- Provenance --------------------------------------------------------------------------------------

alter table public.academy_student_profiles
  alter column created_by drop not null,
  add column created_via text not null default 'direct' check (created_via in ('direct', 'booking')),
  add constraint academy_student_profiles_creator check (created_by is not null or created_via = 'booking');
alter table public.annual_student_records
  alter column created_by drop not null,
  add column created_via text not null default 'direct' check (created_via in ('direct', 'booking')),
  add constraint annual_student_records_creator check (created_by is not null or created_via = 'booking');

create function edra_private.protect_student_provenance()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.created_by, new.created_via) is distinct from (old.created_by, old.created_via) then
    raise exception using errcode = 'P0001', message = 'validation', hint = 'Creation provenance cannot change.';
  end if;
  return new;
end;
$$;

create trigger academy_student_profiles_provenance before update on public.academy_student_profiles
for each row execute function edra_private.protect_student_provenance();
create trigger annual_student_records_provenance before update on public.annual_student_records
for each row execute function edra_private.protect_student_provenance();

-- Storage -----------------------------------------------------------------------------------------

create table public.student_booking_links (
  academy_id uuid primary key references public.academies (id) on delete cascade,
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{43}$'),
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles (id)
);

create table public.student_booking_settings (
  academic_year_id uuid primary key,
  academy_id uuid not null,
  is_open boolean not null default false,
  allow_without_group boolean not null default false,
  participation_mode text not null default 'in_person' check (participation_mode in ('in_person', 'online_only', 'choice')),
  level_ids text[] not null default '{}' check (cardinality(level_ids) <= 50),
  track_ids uuid[] not null default '{}' check (cardinality(track_ids) <= 200),
  group_ids uuid[] not null default '{}' check (cardinality(group_ids) <= 500),
  revision integer not null default 1 check (revision >= 1),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles (id),
  foreign key (academy_id, academic_year_id) references public.academic_years (academy_id, id) on delete cascade
);

create table public.student_booking_receipts (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null,
  academic_year_id uuid not null,
  annual_student_record_id uuid not null unique references public.annual_student_records (id) on delete cascade,
  entry text not null check (entry in ('form', 'onboarding')),
  -- Public form submissions only: the caller's retry key and the validated request it is bound to.
  retry_key uuid unique,
  fingerprint text,
  settings_revision integer not null,
  actor_id uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint student_booking_receipts_retry check ((entry = 'form') = (retry_key is not null and fingerprint is not null)),
  foreign key (academy_id, academic_year_id) references public.academic_years (academy_id, id) on delete cascade
);
create index student_booking_receipts_listing_idx on public.student_booking_receipts (academy_id, academic_year_id, created_at desc, id);

-- Durable submission quotas, charged inside the trusted operation so direct RPC calls cannot skip them.
create table edra_private.student_booking_quota (
  scope text primary key,
  window_start timestamptz not null,
  attempts integer not null
);

alter table public.student_booking_links enable row level security;
alter table public.student_booking_settings enable row level security;
alter table public.student_booking_receipts enable row level security;
alter table edra_private.student_booking_quota enable row level security;
revoke all on public.student_booking_links, public.student_booking_settings, public.student_booking_receipts
  from public, anon, authenticated;
revoke all on edra_private.student_booking_quota from public, anon, authenticated, service_role;

-- Helpers -----------------------------------------------------------------------------------------

-- Counts one attempt in the scope's window; false once the limit is exceeded.
create function edra_private.charge_booking_quota(p_scope text, p_limit integer, p_window interval)
returns boolean language plpgsql security definer set search_path = '' as $$
declare used integer;
begin
  insert into edra_private.student_booking_quota as q (scope, window_start, attempts)
  values (p_scope, clock_timestamp(), 1)
  on conflict (scope) do update set
    attempts = case when q.window_start <= clock_timestamp() - p_window then 1 else q.attempts + 1 end,
    window_start = case when q.window_start <= clock_timestamp() - p_window then clock_timestamp() else q.window_start end
  returning attempts into used;
  return used <= p_limit;
end;
$$;

-- Whether (level, track) is a live offering enabled by the settings. A level with active tracks is
-- enabled only through an enabled active track; a trackless level only through level_ids.
create function edra_private.booking_program_enabled(p_settings public.student_booking_settings, p_level text, p_track uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select edra_private.offering_available(p_settings.academy_id, p_level, p_track)
    and case
      when exists (select 1 from public.academy_tracks t
        where t.academy_id = p_settings.academy_id and t.level_id = p_level and t.retired_at is null)
        then p_track is not null and p_track = any (p_settings.track_ids)
      else p_track is null and p_level = any (p_settings.level_ids)
    end;
$$;

create function edra_private.booking_group_enabled(p_settings public.student_booking_settings, p_group public.groups, p_level text, p_track uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_group.id = any (p_settings.group_ids) and p_group.academy_id = p_settings.academy_id
    and p_group.academic_year_id = p_settings.academic_year_id and p_group.archived_at is null
    and p_group.level_id = p_level and (p_group.track_id is null or p_group.track_id = p_track);
$$;

-- Enabled programs (optionally for one level) with their enabled groups, in the enrollment program
-- shape. Programs without any enabled group are omitted unless registration without a group is allowed.
create function edra_private.student_booking_programs(p_settings public.student_booking_settings, p_level text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(program.value order by program.level_order, program.track_order nulls first), '[]'::jsonb)
  from (
    select l.sort_order as level_order, t.sort_order as track_order,
      jsonb_build_object('levelId', l.level_id, 'levelName', gl.name, 'trackId', t.id, 'trackName', t.name,
        'groups', groups.value) as value
    from (select * from public.academy_levels where stopped_at is null) l
    join public.global_levels gl on gl.id = l.level_id
    left join (select * from public.academy_tracks where retired_at is null) t on t.academy_id = l.academy_id and t.level_id = l.level_id
    cross join lateral (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', g.name,
        'full', g.capacity is not null and occupied.n >= g.capacity,
        'seatsLeft', case when g.capacity is null then null else greatest(g.capacity - occupied.n, 0) end,
        'slots', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'weekday', sl.weekday, 'startsAt', to_char(sl.starts_at, 'HH24:MI'), 'location', s.location
          ) order by sl.weekday, sl.starts_at), '[]'::jsonb)
          from public.schedules s join public.schedule_slots sl on sl.schedule_id = s.id
          where s.group_id = g.id and s.kind = 'recurring' and s.archived_at is null)
      ) order by lower(g.name), g.id), '[]'::jsonb) as value
      from public.groups g
      cross join lateral (select count(*) as n from public.annual_student_records r
        where r.primary_group_id = g.id and r.archived_at is null) occupied
      where edra_private.booking_group_enabled(p_settings, g, l.level_id, t.id)
    ) groups
    where l.academy_id = p_settings.academy_id and (p_level is null or l.level_id = p_level)
      and edra_private.booking_program_enabled(p_settings, l.level_id, t.id)
      and (p_settings.allow_without_group or jsonb_array_length(groups.value) > 0)
  ) program;
$$;

-- Shared verified onboarding -----------------------------------------------------------------------
-- p_kind is fixed by the public wrapper ('invite' or 'booking'), never by the client. Invite entry
-- keeps its own enrollment availability and choices; booking entry uses the booking settings for new
-- annual participation, while existing current-year connection stays available when booking closes.

create function edra_private.student_entry_preview(p_kind text, p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  v_academy uuid;
  creation_open boolean;
  booking public.student_booking_settings%rowtype;
  phone text;
  parent text;
  student_level text;
  year_id uuid;
  matched record;
  academy jsonb;
  programs jsonb;
  current_record public.annual_student_records%rowtype;
begin
  if actor is null or not edra_auth.session_allowed() then return jsonb_build_object('result', 'unauthenticated'); end if;
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then return jsonb_build_object('result', 'invalid'); end if;
  if p_kind = 'invite' then
    select s.academy_id, s.enrollment_open into v_academy, creation_open
    from public.student_enrollment_settings s where s.invite_token = p_token;
  elsif p_kind = 'booking' then
    select l.academy_id into v_academy from public.student_booking_links l where l.token = p_token;
  end if;
  if v_academy is null then return jsonb_build_object('result', 'invalid'); end if;
  phone := public.verified_account_phone(actor);
  if phone is null then return jsonb_build_object('result', 'unverified'); end if;
  select sp.level_id, sp.parent_phone into student_level, parent from public.student_profiles sp
  where sp.user_id = actor and sp.level_id is not null and sp.parent_phone_verified_at is not null;
  if not found then return jsonb_build_object('result', 'setup_required'); end if;

  academy := edra_private.student_invite_academy_json(v_academy);
  select y.id into year_id from public.academic_years y where y.academy_id = v_academy and y.closed_at is null;
  if year_id is null then return jsonb_build_object('result', 'unavailable', 'academy', academy); end if;

  matched := edra_private.student_enrollment_match(v_academy, year_id, actor, phone);
  if matched.kind = 'connected' then
    return jsonb_build_object('result', 'connected', 'academy', academy);
  elsif matched.kind = 'existing' then
    select r.* into current_record from public.annual_student_records r where r.id = matched.record_id;
    return jsonb_build_object('result', 'existing', 'academy', academy, 'student', jsonb_build_object(
      'fullName', current_record.full_name,
      'levelName', (select gl.name from public.global_levels gl where gl.id = current_record.level_id),
      'trackName', (select t.name from (select * from public.academy_tracks where retired_at is null) t where t.id = current_record.track_id),
      'groupName', (select g.name from public.groups g where g.id = current_record.primary_group_id)
    ));
  elsif matched.kind in ('archived', 'conflict') then
    return jsonb_build_object('result', 'staff_help', 'reason', matched.kind, 'academy', academy);
  elsif matched.kind = 'new' and p_kind = 'booking' then
    -- First-time students register through the public form, prefilled with their known details.
    return jsonb_build_object('result', 'form', 'academy', academy, 'prefill', jsonb_build_object(
      'fullName', (select coalesce(p.display_name, p.full_name) from public.profiles p where p.id = actor),
      'studentPhone', phone, 'parentPhone', parent, 'levelId', student_level));
  end if;

  -- The account's level is bound to the student; the academy must offer it.
  if not exists (
    select 1 from (select * from public.academy_levels where stopped_at is null) l where l.academy_id = v_academy and l.level_id = student_level
  ) then
    return jsonb_build_object('result', 'level_unavailable', 'academy', academy);
  end if;
  if p_kind = 'booking' then
    select s.* into booking from public.student_booking_settings s where s.academic_year_id = year_id;
    if not coalesce(booking.is_open, false) then return jsonb_build_object('result', 'closed', 'academy', academy); end if;
    programs := edra_private.student_booking_programs(booking, student_level);
  else
    if not creation_open then return jsonb_build_object('result', 'closed', 'academy', academy); end if;
    programs := edra_private.student_enrollment_programs(v_academy, year_id, student_level);
  end if;
  if jsonb_array_length(programs) = 0 then return jsonb_build_object('result', 'unavailable', 'academy', academy); end if;
  return jsonb_build_object('result', 'enroll', 'returning', matched.kind = 'returning', 'academy', academy,
    'programs', programs, 'groupOptional', p_kind = 'invite' or booking.allow_without_group);
end;
$$;

create function edra_private.student_entry_complete(p_kind text, p_token text, p_track_id uuid, p_group_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  settings public.student_enrollment_settings%rowtype;
  booking public.student_booking_settings%rowtype;
  v_academy uuid;
  phone text;
  year_id uuid;
  matched record;
  matched_record_id uuid;
  academy jsonb;
  account_name text;
  parent text;
  student_level text;
  participation public.student_participation_type;
  chosen public.groups%rowtype;
  profile_id uuid;
  record_id uuid;
begin
  perform edra_private.offering_gate();
  if actor is null or not edra_auth.session_allowed() then return jsonb_build_object('result', 'unauthenticated'); end if;
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then return jsonb_build_object('result', 'invalid'); end if;
  phone := public.verified_account_phone(actor);
  if phone is null then return jsonb_build_object('result', 'unverified'); end if;
  select sp.parent_phone, sp.level_id into parent, student_level from public.student_profiles sp
  where sp.user_id = actor and sp.level_id is not null and sp.parent_phone_verified_at is not null;
  if not found then return jsonb_build_object('result', 'setup_required'); end if;

  if p_kind = 'invite' then
    select s.* into settings from public.student_enrollment_settings s where s.invite_token = p_token for share;
    v_academy := settings.academy_id;
  elsif p_kind = 'booking' then
    select l.academy_id into v_academy from public.student_booking_links l where l.token = p_token for share;
  end if;
  if v_academy is null then return jsonb_build_object('result', 'invalid'); end if;
  academy := edra_private.student_invite_academy_json(v_academy);

  -- One onboarding or booking at a time per academy and phone (so also per account).
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('student_enrollment:' || v_academy::text || ':' || phone, 0));

  select y.id into year_id from public.academic_years y
  where y.academy_id = v_academy and y.closed_at is null for share;
  if year_id is null then return jsonb_build_object('result', 'unavailable', 'academy', academy); end if;

  matched := edra_private.student_enrollment_match(v_academy, year_id, actor, phone);
  if matched.record_id is not null then
    -- Staff may change a contact or archive participation while onboarding is open. Serialize
    -- the final match with that annual record and re-read after waiting before linking identity.
    matched_record_id:=matched.record_id;
    perform 1 from public.annual_student_records r where r.id=matched_record_id for share;
    matched := edra_private.student_enrollment_match(v_academy, year_id, actor, phone);
    if matched.record_id is distinct from matched_record_id then
      return jsonb_build_object('result','changed','academy',academy);
    end if;
  end if;
  if matched.kind = 'connected' then
    return jsonb_build_object('result', 'connected', 'academy', academy);
  elsif matched.kind in ('archived', 'conflict') then
    return jsonb_build_object('result', 'staff_help', 'reason', matched.kind, 'academy', academy);
  elsif matched.kind = 'existing' then
    -- Existing-record connection preserves the record and does not depend on booking choices.
    update public.academy_student_profiles p set user_id = actor, linked_at = now()
    where p.id = matched.profile_id and p.user_id is null;
    if not found then
      return jsonb_build_object('result', 'staff_help', 'reason', 'conflict', 'academy', academy);
    end if;
    return jsonb_build_object('result', 'connected', 'academy', academy);
  elsif matched.kind = 'new' and p_kind = 'booking' then
    return jsonb_build_object('result', 'form', 'academy', academy);
  end if;

  -- New or returning: creates annual participation.
  if not exists (
    select 1 from (select * from public.academy_levels where stopped_at is null) l where l.academy_id = v_academy and l.level_id = student_level
  ) then
    return jsonb_build_object('result', 'level_unavailable', 'academy', academy);
  end if;
  if p_kind = 'booking' then
    select s.* into booking from public.student_booking_settings s where s.academic_year_id = year_id for share;
    if not coalesce(booking.is_open, false) then return jsonb_build_object('result', 'closed', 'academy', academy); end if;
    if not edra_private.booking_program_enabled(booking, student_level, p_track_id)
      or (p_group_id is null and not booking.allow_without_group) then
      return jsonb_build_object('result', 'invalid_choice', 'academy', academy);
    end if;
  else
    if not settings.enrollment_open then return jsonb_build_object('result', 'closed', 'academy', academy); end if;
    if (p_track_id is null and exists (
      select 1 from (select * from public.academy_tracks where retired_at is null) t where t.academy_id = v_academy and t.level_id = student_level
    )) or (p_track_id is not null and not exists (
      select 1 from (select * from public.academy_tracks where retired_at is null) t
      where t.academy_id = v_academy and t.level_id = student_level and t.id = p_track_id
    )) then
      return jsonb_build_object('result', 'invalid_choice', 'academy', academy);
    end if;
  end if;

  if p_group_id is not null then
    select g.* into chosen from public.groups g
    where g.id = p_group_id and g.academy_id = v_academy and g.academic_year_id = year_id
      and g.archived_at is null and g.level_id = student_level and (g.track_id is null or g.track_id = p_track_id)
    for update;
    if not found or (p_kind = 'booking' and not edra_private.booking_group_enabled(booking, chosen, student_level, p_track_id)) then
      return jsonb_build_object('result', 'invalid_choice', 'academy', academy);
    end if;
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
      values (v_academy, actor, actor, now())
      returning id into profile_id;
    end if;
    insert into public.annual_student_records (
      academy_id, academic_year_id, academy_student_profile_id, full_name, student_phone, parent_phone,
      level_id, track_id, primary_group_id, participation_type, created_by, created_via
    ) values (
      v_academy, year_id, profile_id, pg_catalog.btrim(account_name), phone, parent,
      student_level, p_track_id, p_group_id, participation, actor,
      case when p_kind = 'booking' then 'booking' else 'direct' end
    ) returning id into record_id;
    if p_kind = 'booking' then
      insert into public.student_booking_receipts (academy_id, academic_year_id, annual_student_record_id, entry, settings_revision, actor_id)
      values (v_academy, year_id, record_id, 'onboarding', booking.revision, actor);
    end if;
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

-- The ordinary invite contract is unchanged; its body now lives in the shared functions above.
create or replace function public.preview_student_invite(p_token text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select edra_private.student_entry_preview('invite', p_token) - 'groupOptional';
$$;

create or replace function public.complete_student_invite(p_token text, p_track_id uuid, p_group_id uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select edra_private.student_entry_complete('invite', p_token, p_track_id, p_group_id);
$$;

create function public.preview_student_booking_entry(p_token text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select edra_private.student_entry_preview('booking', p_token);
$$;

create function public.complete_student_booking_entry(p_token text, p_track_id uuid, p_group_id uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select edra_private.student_entry_complete('booking', p_token, p_track_id, p_group_id);
$$;

-- Public form -------------------------------------------------------------------------------------

-- Anonymous read of the open form: academy display identity, year/revision and enabled choices only.
create function public.get_student_booking_form(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_academy uuid;
  y public.academic_years%rowtype;
  booking public.student_booking_settings%rowtype;
  academy jsonb;
  programs jsonb;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then return jsonb_build_object('result', 'invalid'); end if;
  select l.academy_id into v_academy from public.student_booking_links l where l.token = p_token;
  if v_academy is null then return jsonb_build_object('result', 'invalid'); end if;
  academy := edra_private.student_invite_academy_json(v_academy);
  select * into y from public.academic_years where academic_years.academy_id = v_academy and closed_at is null;
  if y.id is null then return jsonb_build_object('result', 'unavailable', 'academy', academy); end if;
  select * into booking from public.student_booking_settings where academic_year_id = y.id;
  if not coalesce(booking.is_open, false) then return jsonb_build_object('result', 'closed', 'academy', academy); end if;
  programs := edra_private.student_booking_programs(booking, null);
  if jsonb_array_length(programs) = 0 then return jsonb_build_object('result', 'unavailable', 'academy', academy); end if;
  return jsonb_build_object('result', 'open', 'academy', academy,
    'year', jsonb_build_object('id', y.id, 'startYear', y.start_year), 'revision', booking.revision,
    'groupOptional', booking.allow_without_group, 'participation', booking.participation_mode, 'programs', programs);
end;
$$;

-- Record-only registration. Creates the current-year record under a new academy profile or the
-- unique historical profile for the phone. Never creates or links an account, or grants access.
create function public.submit_student_booking(
  p_token text, p_year_id uuid, p_revision integer, p_retry_key uuid,
  p_full_name text, p_student_phone text, p_parent_phone text,
  p_level_id text, p_track_id uuid, p_group_id uuid, p_participation_type text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid;
  v_academy uuid;
  academy jsonb;
  receipt public.student_booking_receipts%rowtype;
  v_fingerprint text;
  v_field text;
  entered record;
  participation public.student_participation_type;
  year_id uuid;
  booking public.student_booking_settings%rowtype;
  chosen public.groups%rowtype;
  account_phone text;
  matched record;
  profiles_found integer;
  profile_id uuid;
  is_new_profile boolean;
  record_id uuid;
  violated text;
begin
  perform edra_private.offering_gate();
  -- A signed-in caller is used only for routing and attribution; an inactive session is a guest.
  if auth.uid() is not null and edra_auth.session_allowed() then actor := auth.uid(); end if;
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' or p_retry_key is null or p_year_id is null or p_revision is null then
    return jsonb_build_object('result', 'invalid');
  end if;
  select l.academy_id into v_academy from public.student_booking_links l where l.token = p_token for share;
  if v_academy is null then return jsonb_build_object('result', 'invalid'); end if;
  academy := edra_private.student_invite_academy_json(v_academy);

  if char_length(coalesce(p_full_name, '')) > 400 or char_length(coalesce(p_student_phone, '')) > 32
    or char_length(coalesce(p_parent_phone, '')) > 32 or char_length(coalesce(p_level_id, '')) > 64
    or char_length(coalesce(p_participation_type, '')) > 32 then
    return jsonb_build_object('result', 'validation', 'academy', academy);
  end if;
  begin
    select * into entered from public.check_student_record_input(p_full_name, p_student_phone, p_parent_phone, p_level_id, 'in_person');
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_field = pg_exception_hint;
    if v_field not in ('full_name', 'student_phone', 'parent_phone') then
      return jsonb_build_object('result', 'invalid_choice', 'academy', academy);
    end if;
    return jsonb_build_object('result', 'validation', 'academy', academy, 'field', v_field);
  end;

  v_fingerprint := pg_catalog.md5(jsonb_build_array(v_academy, p_year_id, p_revision, entered.full_name, entered.student_phone,
    entered.parent_phone, p_level_id, p_track_id, p_group_id, p_participation_type)::text);
  -- Identical retries return the recorded outcome, even after closure; a changed payload cannot reuse the key.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('student_booking_retry:' || p_retry_key::text, 0));
  select * into receipt from public.student_booking_receipts r where r.retry_key = p_retry_key;
  if found then
    if receipt.academy_id <> v_academy or receipt.fingerprint <> v_fingerprint then
      return jsonb_build_object('result', 'invalid');
    end if;
    return jsonb_build_object('result', 'registered', 'academy', academy,
      'receipt', jsonb_build_object('id', receipt.id, 'createdAt', receipt.created_at));
  end if;

  if not edra_private.charge_booking_quota('academy:' || v_academy::text, 300, interval '10 minutes')
    or not edra_private.charge_booking_quota('phone:' || v_academy::text || ':' || entered.student_phone, 10, interval '1 hour') then
    return jsonb_build_object('result', 'rate_limited', 'academy', academy);
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('student_enrollment:' || v_academy::text || ':' || entered.student_phone, 0));
  select y.id into year_id from public.academic_years y
  where y.academy_id = v_academy and y.closed_at is null for share;
  if year_id is null then return jsonb_build_object('result', 'unavailable', 'academy', academy); end if;
  if year_id <> p_year_id then return jsonb_build_object('result', 'changed', 'academy', academy); end if;
  select s.* into booking from public.student_booking_settings s where s.academic_year_id = year_id for share;
  if not coalesce(booking.is_open, false) then return jsonb_build_object('result', 'closed', 'academy', academy); end if;
  if booking.revision <> p_revision then return jsonb_build_object('result', 'changed', 'academy', academy); end if;

  -- Signed-in students with an academy relationship continue through verified onboarding instead.
  if actor is not null then
    account_phone := public.verified_account_phone(actor);
    if account_phone is not null and exists (select 1 from public.student_profiles sp
      where sp.user_id = actor and sp.level_id is not null and sp.parent_phone_verified_at is not null) then
      matched := edra_private.student_enrollment_match(v_academy, year_id, actor, account_phone);
      if matched.kind in ('connected', 'existing', 'returning') then
        return jsonb_build_object('result', 'continue', 'academy', academy);
      elsif matched.kind in ('archived', 'conflict') then
        return jsonb_build_object('result', 'staff_help', 'academy', academy);
      end if;
    end if;
  end if;

  -- Archived records keep their phone reserved for the year.
  if exists (select 1 from public.annual_student_records r
    where r.academy_id = v_academy and r.academic_year_id = year_id and r.student_phone = entered.student_phone) then
    return jsonb_build_object('result', 'already_registered', 'academy', academy);
  end if;

  if not edra_private.booking_program_enabled(booking, p_level_id, p_track_id) then
    return jsonb_build_object('result', 'invalid_choice', 'academy', academy);
  end if;
  if p_group_id is null then
    if not booking.allow_without_group then return jsonb_build_object('result', 'invalid_choice', 'academy', academy); end if;
  else
    -- The same group row lock as invite onboarding: both compete for the last place.
    select g.* into chosen from public.groups g where g.id = p_group_id and g.academy_id = v_academy for update;
    if not found or not edra_private.booking_group_enabled(booking, chosen, p_level_id, p_track_id) then
      return jsonb_build_object('result', 'invalid_choice', 'academy', academy);
    end if;
    if chosen.capacity is not null and (
      select count(*) from public.annual_student_records r where r.primary_group_id = chosen.id and r.archived_at is null
    ) >= chosen.capacity then
      return jsonb_build_object('result', 'group_full', 'academy', academy);
    end if;
  end if;

  if booking.participation_mode = 'choice' then
    if p_participation_type is null or p_participation_type not in ('in_person', 'online_only') then
      return jsonb_build_object('result', 'validation', 'academy', academy, 'field', 'participation_type');
    end if;
    participation := p_participation_type::public.student_participation_type;
  else
    participation := booking.participation_mode::public.student_participation_type;
  end if;

  -- A unique historical profile for the phone is reused; ambiguity or a profile already
  -- participating this year under another phone needs staff resolution.
  select count(distinct r.academy_student_profile_id), (array_agg(r.academy_student_profile_id))[1]
  into profiles_found, profile_id
  from public.annual_student_records r where r.academy_id = v_academy and r.student_phone = entered.student_phone;
  is_new_profile := profiles_found = 0;
  if profiles_found > 1 then return jsonb_build_object('result', 'staff_help', 'academy', academy); end if;
  if not is_new_profile then
    perform 1 from public.academy_student_profiles p where p.id = profile_id for update;
    if exists (select 1 from public.annual_student_records r
      where r.academy_student_profile_id = profile_id and r.academic_year_id = year_id) then
      return jsonb_build_object('result', 'staff_help', 'academy', academy);
    end if;
  end if;

  begin
    if is_new_profile then
      insert into public.academy_student_profiles (academy_id, created_by, created_via)
      values (v_academy, actor, 'booking') returning id into profile_id;
    end if;
    insert into public.annual_student_records (
      academy_id, academic_year_id, academy_student_profile_id, full_name, student_phone, parent_phone,
      level_id, track_id, primary_group_id, participation_type, created_by, created_via
    ) values (
      v_academy, year_id, profile_id, entered.full_name, entered.student_phone, entered.parent_phone,
      p_level_id, p_track_id, p_group_id, participation, actor, 'booking'
    ) returning id into record_id;
    insert into public.student_booking_receipts (academy_id, academic_year_id, annual_student_record_id, entry,
      retry_key, fingerprint, settings_revision, actor_id)
    values (v_academy, year_id, record_id, 'form', p_retry_key, v_fingerprint, booking.revision, actor)
    returning * into receipt;
  exception
    when unique_violation then
      get stacked diagnostics violated = constraint_name;
      -- A concurrent staff record or import took the phone first.
      if violated = 'annual_student_records_student_phone_unique' then
        return jsonb_build_object('result', 'already_registered', 'academy', academy);
      end if;
      return jsonb_build_object('result', 'changed', 'academy', academy);
    when sqlstate 'P0001' then
      return jsonb_build_object('result', 'invalid_choice', 'academy', academy);
  end;
  return jsonb_build_object('result', 'registered', 'academy', academy,
    'receipt', jsonb_build_object('id', receipt.id, 'createdAt', receipt.created_at));
end;
$$;

-- Staff settings ----------------------------------------------------------------------------------

create function edra_private.student_booking_settings_json(p_academy_id uuid)
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
      'groups', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'trackId', g.track_id, 'capacity', g.capacity)
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

-- Every staff role may read and share; the token is returned only to members.
create function public.get_student_booking_settings(p_academy_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not edra_auth.session_allowed() or public.academy_role_for(p_academy_id) is null then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  return edra_private.student_booking_settings_json(p_academy_id);
end;
$$;

-- Saves the open year's configuration atomically against the expected revision (0 before the first save).
create function public.save_student_booking_settings(
  p_academy_id uuid, p_academic_year_id uuid, p_expected_revision integer, p_open boolean,
  p_allow_without_group boolean, p_participation_mode text, p_level_ids text[], p_track_ids uuid[], p_group_ids uuid[]
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
    or cardinality(p_level_ids) > 50 or cardinality(p_track_ids) > 200 or cardinality(p_group_ids) > 500 then
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
  -- Keep only identities that are currently offered in this academy and year.
  v_next.level_ids := array(select distinct x from unnest(coalesce(p_level_ids, '{}')) x
    where edra_private.offering_available(p_academy_id, x, null));
  v_next.track_ids := array(select distinct x from unnest(coalesce(p_track_ids, '{}')) x
    join public.academy_tracks t on t.id = x and t.academy_id = p_academy_id
    where edra_private.offering_available(p_academy_id, t.level_id, t.id));
  v_next.group_ids := array(select distinct x from unnest(coalesce(p_group_ids, '{}')) x
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
    participation_mode, level_ids, track_ids, group_ids, updated_by)
  values (p_academic_year_id, p_academy_id, v_next.is_open, v_next.allow_without_group, v_next.participation_mode,
    v_next.level_ids, v_next.track_ids, v_next.group_ids, actor)
  on conflict (academic_year_id) do update set
    is_open = excluded.is_open, allow_without_group = excluded.allow_without_group,
    participation_mode = excluded.participation_mode, level_ids = excluded.level_ids,
    track_ids = excluded.track_ids, group_ids = excluded.group_ids,
    revision = s.revision + 1, updated_at = now(), updated_by = excluded.updated_by;
  insert into public.student_booking_links (academy_id, token, created_by)
  values (p_academy_id, edra_private.new_student_invite_token(), actor)
  on conflict (academy_id) do nothing;
  return edra_private.student_booking_settings_json(p_academy_id);
end;
$$;

-- Successful booking-origin registrations of the open year, newest first, for staff.
create function public.list_student_booking_registrations(p_academy_id uuid, p_offset integer, p_limit integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare year_id uuid;
begin
  if auth.uid() is null or not edra_auth.session_allowed() or public.academy_role_for(p_academy_id) is null then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  if p_offset is null or p_offset < 0 or p_limit is null or p_limit not between 1 and 100 then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  select id into year_id from public.academic_years where academy_id = p_academy_id and closed_at is null;
  return jsonb_build_object(
    'total', (select count(*) from public.student_booking_receipts b where b.academy_id = p_academy_id and b.academic_year_id = year_id),
    'rows', (select coalesce(jsonb_agg(page.item order by page.created_at desc, page.id), '[]'::jsonb) from (
      select b.created_at, b.id, jsonb_build_object(
        'recordId', r.id, 'fullName', r.full_name, 'studentPhone', r.student_phone,
        'levelName', gl.name, 'trackName', t.name, 'groupName', g.name,
        'participationType', r.participation_type, 'entry', b.entry, 'archived', r.archived_at is not null,
        'createdAt', b.created_at) as item
      from public.student_booking_receipts b
      join public.annual_student_records r on r.id = b.annual_student_record_id
      join public.global_levels gl on gl.id = r.level_id
      left join public.academy_tracks t on t.id = r.track_id
      left join public.groups g on g.id = r.primary_group_id
      where b.academy_id = p_academy_id and b.academic_year_id = year_id
      order by b.created_at desc, b.id
      offset p_offset limit p_limit) page)
  );
end;
$$;

-- Grants ------------------------------------------------------------------------------------------

revoke all on function edra_private.protect_student_provenance() from public, anon, authenticated;
revoke all on function edra_private.charge_booking_quota(text, integer, interval) from public, anon, authenticated;
revoke all on function edra_private.booking_program_enabled(public.student_booking_settings, text, uuid) from public, anon, authenticated;
revoke all on function edra_private.booking_group_enabled(public.student_booking_settings, public.groups, text, uuid) from public, anon, authenticated;
revoke all on function edra_private.student_booking_programs(public.student_booking_settings, text) from public, anon, authenticated;
revoke all on function edra_private.student_entry_preview(text, text) from public, anon, authenticated;
revoke all on function edra_private.student_entry_complete(text, text, uuid, uuid) from public, anon, authenticated;
revoke all on function edra_private.student_booking_settings_json(uuid) from public, anon, authenticated;

revoke all on function public.preview_student_booking_entry(text) from public, anon;
revoke all on function public.complete_student_booking_entry(text, uuid, uuid) from public, anon;
revoke all on function public.get_student_booking_settings(uuid) from public, anon;
revoke all on function public.save_student_booking_settings(uuid, uuid, integer, boolean, boolean, text, text[], uuid[], uuid[]) from public, anon;
revoke all on function public.list_student_booking_registrations(uuid, integer, integer) from public, anon;
revoke all on function public.get_student_booking_form(text) from public;
revoke all on function public.submit_student_booking(text, uuid, integer, uuid, text, text, text, text, uuid, uuid, text) from public;
grant execute on function public.preview_student_booking_entry(text) to authenticated;
grant execute on function public.complete_student_booking_entry(text, uuid, uuid) to authenticated;
grant execute on function public.get_student_booking_settings(uuid) to authenticated;
grant execute on function public.save_student_booking_settings(uuid, uuid, integer, boolean, boolean, text, text[], uuid[], uuid[]) to authenticated;
grant execute on function public.list_student_booking_registrations(uuid, integer, integer) to authenticated;
-- The public booking contract is intentionally anonymous.
grant execute on function public.get_student_booking_form(text) to anon, authenticated;
grant execute on function public.submit_student_booking(text, uuid, integer, uuid, text, text, text, text, uuid, uuid, text) to anon, authenticated;

commit;
