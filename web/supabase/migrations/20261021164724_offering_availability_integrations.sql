-- EDRA-129: availability integration. Historical reads and staff marking remain available.
begin;

alter table public.schedules add column original_track_name text;
alter table public.assignments add column offering_closed_at timestamptz;
alter table public.quizzes add column offering_closed_at timestamptz;
alter table public.exams add column offering_closed_at timestamptz,
  add column roster_frozen_at timestamptz,
  add column roster_frozen_by uuid references public.profiles(id);
alter table public.content_units add column offering_epoch integer not null default 1;

create table edra_private.exam_fixed_roster (
  exam_id uuid not null references public.exams(id),
  annual_student_record_id uuid not null references public.annual_student_records(id),
  primary key(exam_id,annual_student_record_id)
);
alter table edra_private.exam_fixed_roster enable row level security;
revoke all on edra_private.exam_fixed_roster from public,anon,authenticated,service_role;

grant execute on function edra_private.offering_gate() to authenticated,service_role;

create function edra_private.require_schedule_offering(p_schedule uuid)
returns void language plpgsql security definer set search_path='' as $$
declare s public.schedules; g public.groups;
begin
  select * into strict s from public.schedules where id=p_schedule;
  if s.audience='group' then
    select * into strict g from public.groups where id=s.group_id and academy_id=s.academy_id;
    perform edra_private.require_offering(s.academy_id,g.level_id,g.track_id);
  else perform edra_private.require_offering(s.academy_id,s.level_id,s.track_id); end if;
end $$;

create function edra_private.require_assessment_offering(p_kind text,p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare a jsonb; g record;
begin
  if p_kind not in ('assignment','quiz','exam') then raise exception 'validation'; end if;
  execute format('select to_jsonb(a) from public.%I a where id=$1',p_kind||'s') into a using p_id;
  if a is null then raise exception 'not_found'; end if;
  if a->>'audience'='groups' then
    for g in execute format('select g.* from public.%I x join public.groups g on g.id=x.group_id where x.%I=$1',p_kind||'_audience_groups',p_kind||'_id') using p_id loop
      perform edra_private.require_offering(g.academy_id,g.level_id,g.track_id);
    end loop;
  elsif a->>'level_id' is not null then
    perform edra_private.require_offering((a->>'academy_id')::uuid,a->>'level_id',(a->>'track_id')::uuid);
  end if;
  if a->>'offering_closed_at' is not null then raise exception 'offering_closed'; end if;
end $$;

-- Future learning authorization must combine its entitlement checks with this predicate.
-- Publication stamps the current epoch. Resume never makes an old publication effective again.
create function edra_private.content_offering_available(p_unit uuid,p_record uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.content_units u join public.content_programs p on p.id=u.program_id
    join public.academy_levels l on l.academy_id=p.academy_id and l.level_id=p.level_id
    join public.annual_student_records r on r.id=p_record and r.academy_id=p.academy_id and r.academic_year_id=p.academic_year_id
    join public.academic_years y on y.id=p.academic_year_id and y.closed_at is null
    join public.academy_student_profiles sp on sp.id=r.academy_student_profile_id
    where u.id=p_unit and u.state='published' and u.offering_epoch=l.learning_epoch
      and not edra_private.student_access_suspended(r,sp)
      and edra_private.offering_available(p.academy_id,p.level_id,p.track_id)
      and r.level_id=p.level_id and (p.track_id is null or p.track_id=r.track_id));
$$;

create function edra_private.guard_offering_use()
returns trigger language plpgsql security definer set search_path='' as $$
declare n jsonb:=to_jsonb(new); o jsonb:=case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  a uuid:=(n->>'academy_id')::uuid; l text:=n->>'level_id'; t uuid:=(n->>'track_id')::uuid;
  g public.groups; p public.content_programs; must_check boolean:=false;
begin
  if tg_table_name in ('annual_student_records','groups') then
    must_check:=tg_op='INSERT' or (n->>'archived_at' is null and o->>'archived_at' is not null)
      or (n->>'level_id',n->>'track_id',n->>'primary_group_id') is distinct from (o->>'level_id',o->>'track_id',o->>'primary_group_id');
    if tg_op='UPDATE' and edra_private.offering_transition(a,l,old.track_id,'remove_track')
      and new.track_id is null and new.level_id=old.level_id then must_check:=false; end if;
  elsif tg_table_name='schedules' then
    must_check:=tg_op='INSERT' or (n->>'archived_at' is null and o->>'archived_at' is not null)
      or (n->>'audience',n->>'group_id',l,t) is distinct from (o->>'audience',o->>'group_id',o->>'level_id',(o->>'track_id')::uuid);
    if n->>'audience'='group' then
      select * into strict g from public.groups where id=(n->>'group_id')::uuid and academy_id=a;
      l:=g.level_id; t:=g.track_id;
    end if;
  elsif tg_table_name in ('schedule_slots','schedule_sessions') then
    perform edra_private.require_schedule_offering(new.schedule_id); return new;
  elsif tg_table_name in ('assignments','quizzes','exams') then
    if tg_op='UPDATE' and o->>'offering_closed_at' is not null and (
      n->>'offering_closed_at' is distinct from o->>'offering_closed_at'
      or (tg_table_name='assignments' and n->>'state'='active')
      or (n->>'opens_at',n->>'closes_at',n->>'actual_closes_at') is distinct from (o->>'opens_at',o->>'closes_at',o->>'actual_closes_at')) then
      raise exception 'offering_closed';
    end if;
    must_check:=tg_op='INSERT' or (n->>'audience',l,t) is distinct from (o->>'audience',o->>'level_id',(o->>'track_id')::uuid)
      or (n->>'opens_at',n->>'closes_at') is distinct from (o->>'opens_at',o->>'closes_at');
    if tg_op='UPDATE' and edra_private.offering_transition(a,coalesce(l,old.level_id),old.track_id,'remove_track')
      and n->>'audience'='level' and t is null then must_check:=false; end if;
    if tg_op='UPDATE' and edra_private.offering_transition(a,l,null,'stop_level') then must_check:=false; end if;
  elsif tg_table_name='content_programs' then must_check:=true;
  elsif tg_table_name='content_units' then
    select * into strict p from public.content_programs where id=new.program_id and academy_id=a;
    l:=p.level_id; t:=p.track_id;
    must_check:=tg_op='INSERT' or n->>'program_id' is distinct from o->>'program_id'
      or (n->>'state'='published' and (n->>'state' is distinct from o->>'state'
        or n->>'published_version' is distinct from o->>'published_version'));
    if must_check and n->>'state'='published' then
      select learning_epoch into new.offering_epoch from public.academy_levels where academy_id=a and level_id=l;
    end if;
  end if;
  if must_check and l is not null then perform edra_private.require_offering(a,l,t); end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['annual_student_records','groups','schedules','schedule_slots','schedule_sessions',
    'assignments','quizzes','exams','content_programs','content_units'] loop
    execute format('create trigger offering_available_before_use before insert or update on public.%I for each row execute function edra_private.guard_offering_use()',t);
  end loop;
end $$;

create or replace function public.validate_student_record_write()
returns trigger language plpgsql set search_path = '' as $$
declare placed public.groups%rowtype;
begin
  perform edra_private.offering_gate();
  -- Locking the year row keeps a concurrent year close from interleaving with this write.
  perform 1 from public.academic_years y
  where y.id = new.academic_year_id and y.academy_id = new.academy_id and y.closed_at is null
  for share;
  if not found then
    raise exception using errcode = 'P0001', message = 'year_unavailable',
      hint = 'Student records can only change in the active academic year.';
  end if;

  if tg_op = 'INSERT' then
    if new.archived_at is not null then
      raise exception using errcode = 'P0001', message = 'validation', hint = 'New student records start active.';
    end if;
    new.version := 1;
  else
    if new.academy_id is distinct from old.academy_id
      or new.academic_year_id is distinct from old.academic_year_id
      or new.academy_student_profile_id is distinct from old.academy_student_profile_id
      or new.created_at is distinct from old.created_at
      or new.created_by is distinct from old.created_by then
      raise exception using errcode = 'P0001', message = 'validation',
        hint = 'A student record''s academy, year, and identity cannot change.';
    end if;
    -- An archived record may only be restored; every other edit is rejected.
    if old.archived_at is not null and (
      new.archived_at is not null
      or (new.full_name, new.student_phone, new.parent_phone, new.level_id, new.track_id,
          new.primary_group_id, new.participation_type)
        is distinct from
         (old.full_name, old.student_phone, old.parent_phone, old.level_id, old.track_id,
          old.primary_group_id, old.participation_type)
    ) then
      raise exception using errcode = 'P0001', message = 'archived_record',
        hint = 'Restore the student record before editing it.';
    end if;
    new.version := old.version + 1;
    new.updated_at := now();
  end if;

  -- Checked only when placement changes, so archiving an older record never fails because its level
  -- gained tracks later.
  if (tg_op = 'INSERT' or (new.level_id, new.track_id) is distinct from (old.level_id, old.track_id))
    and not edra_private.offering_transition(new.academy_id,new.level_id,old.track_id,'remove_track')
    and new.track_id is null and exists (
      select 1 from public.academy_tracks t where t.academy_id = new.academy_id and t.level_id = new.level_id and t.retired_at is null
    ) then
    raise exception using errcode = 'P0001', message = 'invalid_placement', hint = 'Choose a track for this level.';
  end if;

  if new.primary_group_id is not null and (
    tg_op = 'INSERT'
    or (new.primary_group_id, new.level_id, new.track_id)
      is distinct from (old.primary_group_id, old.level_id, old.track_id)
  ) then
    -- The share lock conflicts with a concurrent group archive or program change: whichever commits
    -- first wins, and the other observes it (protect_group_dependencies checks student references).
    select g.* into placed from public.groups g
    where g.id = new.primary_group_id and g.academy_id = new.academy_id
      and g.academic_year_id = new.academic_year_id
    for share of g;
    if not found or placed.archived_at is not null
      or placed.level_id <> new.level_id
      or (placed.track_id is not null and placed.track_id is distinct from new.track_id) then
      raise exception using errcode = 'P0001', message = 'invalid_placement',
        hint = 'Choose an active group in the same level that is level-wide or matches the student''s track.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.start_session(p_academy_id uuid, p_schedule_id uuid, p_start_key uuid)
returns table (session_id uuid, outcome text)
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  parent public.schedules%rowtype;
  placed public.groups%rowtype;
  prior public.sessions%rowtype;
  bound public.sessions%rowtype;
  new_id uuid;
  effective_level text;
  effective_track uuid;
  constraint_name text;
  started_moment timestamptz := now();
begin
  perform edra_private.offering_gate();
  if actor is null or p_academy_id is null or public.academy_role_for(p_academy_id) is null then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  if p_schedule_id is null or p_start_key is null then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;

  -- One actor/key at a time, across schedules, before any schedule lock. A hash collision only
  -- serializes unrelated starts; the receipt primary key is the real invariant.
  perform pg_advisory_xact_lock(hashtextextended('session_start:' || actor::text || ':' || p_start_key::text, 0));

  -- Serializes starts of one schedule and keeps it from being archived or edited mid-start.
  select s.* into parent from public.schedules s
  where s.id = p_schedule_id and s.academy_id = p_academy_id
  for no key update;
  if not found then raise exception using errcode = 'P0001', message = 'not_found'; end if;

  -- A bound key returns its original session whatever has happened since. The legacy fallback
  -- covers an original start committed by the previous function around the backfill.
  select s.* into bound from public.sessions s
  where s.id = (select r.session_id from public.session_start_requests r
                where r.actor_id = actor and r.start_key = p_start_key);
  if not found then
    select s.* into bound from public.sessions s where s.started_by = actor and s.start_key = p_start_key;
    if found then
      insert into public.session_start_requests (actor_id, start_key, session_id)
      values (actor, p_start_key, bound.id) on conflict do nothing;
    end if;
  end if;
  if bound.id is not null then
    if bound.schedule_id <> p_schedule_id then
      raise exception using errcode = 'P0001', message = 'idempotency_conflict';
    end if;
    return query select bound.id, 'replayed'::text;
    return;
  end if;

  perform edra_private.require_schedule_offering(parent.id);
  if parent.archived_at is not null then
    raise exception using errcode = 'P0001', message = 'schedule_unavailable';
  end if;
  perform 1 from public.academic_years y
  where y.id = parent.academic_year_id and y.academy_id = parent.academy_id and y.closed_at is null
  for share;
  if not found then raise exception using errcode = 'P0001', message = 'year_unavailable'; end if;

  perform public.expire_sessions(p_schedule_id);
  -- Locked, so a start waits for an in-flight archive of the live session and then starts anew.
  select * into prior from public.sessions s where s.schedule_id = p_schedule_id and s.state = 'live' for update;
  if found then
    insert into public.session_start_requests (actor_id, start_key, session_id)
    values (actor, p_start_key, prior.id);
    return query select prior.id, 'existing'::text;
    return;
  end if;

  if parent.audience = 'group' then
    select g.* into placed from public.groups g
    where g.id = parent.group_id and g.academy_id = parent.academy_id
      and g.academic_year_id = parent.academic_year_id;
    if not found then raise exception using errcode = 'P0001', message = 'schedule_unavailable'; end if;
    effective_level := placed.level_id;
    effective_track := placed.track_id;
  else
    effective_level := parent.level_id;
    effective_track := parent.track_id;
  end if;

  begin
    insert into public.sessions (
      academy_id, academic_year_id, schedule_id, started_by, started_by_name, start_key,
      schedule_title, schedule_kind, audience, group_id, group_name, level_id, track_id, track_name,
      mandatory, location, started_at, auto_end_at
    ) values (
      parent.academy_id, parent.academic_year_id, parent.id, actor,
      (select nullif(btrim(p.full_name), '') from public.profiles p where p.id = actor),
      p_start_key, parent.title, parent.kind, parent.audience,
      parent.group_id, placed.name, effective_level, effective_track,
      (select t.name from public.academy_tracks t where t.id = effective_track),
      parent.mandatory, parent.location, started_moment, public.session_auto_end_at(parent.id, started_moment)
    ) returning id into new_id;
  exception when unique_violation then
    -- Only a start by the previous function (no advisory lock) can reach this: bind and report it.
    get stacked diagnostics constraint_name = constraint_name;
    if constraint_name = 'sessions_start_key_unique' then
      select * into prior from public.sessions s where s.started_by = actor and s.start_key = p_start_key;
      if prior.schedule_id <> p_schedule_id then
        raise exception using errcode = 'P0001', message = 'idempotency_conflict';
      end if;
      insert into public.session_start_requests (actor_id, start_key, session_id)
      values (actor, p_start_key, prior.id) on conflict do nothing;
      return query select prior.id, 'replayed'::text;
      return;
    end if;
    select * into prior from public.sessions s where s.schedule_id = p_schedule_id and s.state = 'live';
    if not found then raise; end if;
    insert into public.session_start_requests (actor_id, start_key, session_id)
    values (actor, p_start_key, prior.id);
    return query select prior.id, 'existing'::text;
    return;
  end;

  insert into public.session_start_requests (actor_id, start_key, session_id)
  values (actor, p_start_key, new_id);

  -- Every active annual record matching the audience, captured in the same transaction.
  insert into public.session_roster_entries (
    academy_id, academic_year_id, session_id, annual_student_record_id, origin,
    level_id, track_id, primary_group_id, participation_type
  )
  select r.academy_id, r.academic_year_id, new_id, r.id,
    case when parent.mandatory then 'expected' else 'eligible' end::public.session_roster_origin,
    r.level_id, r.track_id, r.primary_group_id, r.participation_type
  from public.annual_student_records r
  where r.academy_id = parent.academy_id and r.academic_year_id = parent.academic_year_id
    and r.archived_at is null
    and r.participation_type = 'in_person'
    and case parent.audience
      when 'group' then r.primary_group_id = parent.group_id
      when 'level' then r.level_id = parent.level_id
      when 'program' then r.level_id = parent.level_id and r.track_id = parent.track_id
    end;

  return query select new_id, 'started'::text;
end;
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
  if actor is null or not edra_auth.session_allowed() then return jsonb_build_object('result', 'unauthenticated'); end if;
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
      'trackName', (select t.name from (select * from public.academy_tracks where retired_at is null) t where t.id = current_record.track_id),
      'groupName', (select g.name from public.groups g where g.id = current_record.primary_group_id)
    ));
  elsif matched.kind in ('archived', 'conflict') then
    return jsonb_build_object('result', 'staff_help', 'reason', matched.kind, 'academy', academy);
  end if;

  -- The account's level is bound to the student; the academy must offer it.
  if not exists (
    select 1 from (select * from public.academy_levels where stopped_at is null) l where l.academy_id = settings.academy_id and l.level_id = student_level
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
  matched_record_id uuid;
  academy jsonb;
  account_name text;
  parent text;
  student_level text;
  participation public.student_participation_type;
  chosen public.groups%rowtype;
  profile_id uuid;
begin
  perform edra_private.offering_gate();
  if actor is null or not edra_auth.session_allowed() then return jsonb_build_object('result', 'unauthenticated'); end if;
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
  if matched.record_id is not null then
    -- Staff may change a contact or archive participation while onboarding is open. Serialize
    -- the final match with that annual record and re-read after waiting before linking identity.
    matched_record_id:=matched.record_id;
    perform 1 from public.annual_student_records r where r.id=matched_record_id for share;
    matched := edra_private.student_enrollment_match(settings.academy_id, year_id, actor, phone);
    if matched.record_id is distinct from matched_record_id then
      return jsonb_build_object('result','changed','academy',academy);
    end if;
  end if;
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
    select 1 from (select * from public.academy_levels where stopped_at is null) l where l.academy_id = settings.academy_id and l.level_id = student_level
  ) then
    return jsonb_build_object('result', 'level_unavailable', 'academy', academy);
  end if;
  if not settings.enrollment_open then return jsonb_build_object('result', 'closed', 'academy', academy); end if;
  if (p_track_id is null and exists (
    select 1 from (select * from public.academy_tracks where retired_at is null) t where t.academy_id = settings.academy_id and t.level_id = student_level
  )) or (p_track_id is not null and not exists (
    select 1 from (select * from public.academy_tracks where retired_at is null) t
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
        -- Null when the group has no capacity limit.
        'seatsLeft', case when g.capacity is null then null else greatest(g.capacity - (
          select count(*) from public.annual_student_records r
          where r.primary_group_id = g.id and r.archived_at is null
        ), 0) end,
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
    from (select * from public.academy_levels where stopped_at is null) l
    join public.global_levels gl on gl.id = l.level_id
    left join (select * from public.academy_tracks where retired_at is null) t on t.academy_id = l.academy_id and t.level_id = l.level_id
    where l.academy_id = p_academy_id and l.level_id = p_level_id
  ) program;
$$;

create or replace function public.resolve_student_import_row(
  p_academy_id uuid, p_academic_year_id uuid, p_defaults jsonb, p_source jsonb, p_corrected jsonb,
  out input jsonb, out normalized_phone text, out issues jsonb
) language plpgsql stable set search_path = '' as $$
declare
  use_defaults boolean := p_corrected is null;
  cells jsonb;
  problems text[] := '{}';
  item record;
  raw text;
  label text;
  v_full_name text;
  v_parent_phone text;
  v_level_id text;
  v_track_id uuid;
  v_group_id uuid;
  v_type text;
  has_tracks boolean := false;
  matches text[];
  d_level text := nullif(p_defaults ->> 'level_id', '');
  d_track text := nullif(p_defaults ->> 'track_id', '');
  d_group text := nullif(p_defaults ->> 'primary_group_id', '');
  d_type text := nullif(p_defaults ->> 'participation_type', '');
begin
  issues := '[]'::jsonb;
  if use_defaults then
    cells := coalesce(p_source, '{}'::jsonb);
  else
    cells := pg_catalog.jsonb_build_object(
      'full_name', p_corrected -> 'full_name',
      'student_phone', p_corrected -> 'student_phone',
      'parent_phone', p_corrected -> 'parent_phone',
      'level', p_corrected -> 'level_id',
      'group', coalesce(p_corrected -> 'primary_group_id', 'null'::jsonb),
      'student_type', p_corrected -> 'participation_type')
      || case when p_corrected ->> 'track_id' is not null
        then pg_catalog.jsonb_build_object('track', p_corrected -> 'track_id') else '{}'::jsonb end;
  end if;

  -- Cells the parser could not read as plain values (formulas, dates, nested values, …).
  for item in select e.key, e.value from pg_catalog.jsonb_each(cells) e
    where pg_catalog.jsonb_typeof(e.value) not in ('string', 'null') loop
    problems := problems || item.key;
    issues := issues || pg_catalog.jsonb_build_object('field', item.key, 'code', 'unsupported',
      'detail', coalesce(item.value ->> 'problem', 'unsupported'));
  end loop;

  -- Name and phones are always required from the row.
  v_full_name := public.student_import_cell(cells, 'full_name');
  if v_full_name is null then
    if not 'full_name' = any(problems) then
      issues := issues || '{"field": "full_name", "code": "required"}'::jsonb;
    end if;
  elsif char_length(v_full_name) > 200 then
    issues := issues || '{"field": "full_name", "code": "too_long"}'::jsonb;
  end if;

  raw := public.student_import_cell(cells, 'student_phone');
  normalized_phone := public.normalize_egyptian_phone(raw);
  if raw is null and not 'student_phone' = any(problems) then
    issues := issues || '{"field": "student_phone", "code": "required"}'::jsonb;
  elsif raw is not null and normalized_phone is null then
    issues := issues || '{"field": "student_phone", "code": "invalid_phone"}'::jsonb;
  end if;

  raw := public.student_import_cell(cells, 'parent_phone');
  v_parent_phone := public.normalize_egyptian_phone(raw);
  if raw is null and not 'parent_phone' = any(problems) then
    issues := issues || '{"field": "parent_phone", "code": "required"}'::jsonb;
  elsif raw is not null and v_parent_phone is null then
    issues := issues || '{"field": "parent_phone", "code": "invalid_phone"}'::jsonb;
  end if;

  -- Level: the academy's level code, else its exact normalized display name; else the default.
  raw := public.student_import_cell(cells, 'level');
  if raw is not null then
    label := public.normalize_import_label(raw);
    select pg_catalog.array_agg(al.level_id) into matches from (select * from public.academy_levels where stopped_at is null) al
    where al.academy_id = p_academy_id and public.normalize_import_label(al.level_id) = label;
    if coalesce(cardinality(matches), 0) = 0 then
      select pg_catalog.array_agg(al.level_id) into matches from (select * from public.academy_levels where stopped_at is null) al
      join public.global_levels gl on gl.id = al.level_id
      where al.academy_id = p_academy_id and public.normalize_import_label(gl.name) = label;
    end if;
    if cardinality(matches) = 1 then v_level_id := matches[1];
    else
      issues := issues || pg_catalog.jsonb_build_object('field', 'level',
        'code', case when cardinality(matches) > 1 then 'ambiguous' else 'unknown' end);
    end if;
  elsif not 'level' = any(problems) then
    if use_defaults and d_level is not null
      and exists (select 1 from (select * from public.academy_levels where stopped_at is null) al where al.academy_id = p_academy_id and al.level_id = d_level) then
      v_level_id := d_level;
    else
      issues := issues || '{"field": "level", "code": "required"}'::jsonb;
    end if;
  end if;

  -- Track: only within the resolved level. Required exactly when the level has tracks.
  if v_level_id is not null then
    has_tracks := exists (select 1 from (select * from public.academy_tracks where retired_at is null) t where t.academy_id = p_academy_id and t.level_id = v_level_id);
    raw := public.student_import_cell(cells, 'track');
    if raw is not null then
      if not has_tracks then
        issues := issues || '{"field": "track", "code": "not_offered"}'::jsonb;
      else
        label := public.normalize_import_label(raw);
        select pg_catalog.array_agg(t.id::text) into matches from (select * from public.academy_tracks where retired_at is null) t
        where t.academy_id = p_academy_id and t.level_id = v_level_id and t.id::text = label;
        if coalesce(cardinality(matches), 0) = 0 then
          select pg_catalog.array_agg(t.id::text) into matches from (select * from public.academy_tracks where retired_at is null) t
          where t.academy_id = p_academy_id and t.level_id = v_level_id and public.normalize_import_label(t.name) = label;
        end if;
        if cardinality(matches) = 1 then v_track_id := matches[1]::uuid;
        else
          issues := issues || pg_catalog.jsonb_build_object('field', 'track',
            'code', case when cardinality(matches) > 1 then 'ambiguous' else 'unknown' end);
        end if;
      end if;
    elsif has_tracks and not 'track' = any(problems) then
      if use_defaults and d_track is not null and exists (
        select 1 from (select * from public.academy_tracks where retired_at is null) t
        where t.academy_id = p_academy_id and t.level_id = v_level_id and t.id::text = d_track
      ) then
        v_track_id := d_track::uuid;
      else
        issues := issues || '{"field": "track", "code": "required"}'::jsonb;
      end if;
    end if;
  end if;

  -- Group: optional. JSON null and "Unassigned"/"none" are an explicit empty assignment; a blank
  -- cell takes the default group only when it matches the row's placement.
  if v_level_id is not null and (not has_tracks or v_track_id is not null) and not 'group' = any(problems) then
    raw := public.student_import_cell(cells, 'group');
    label := public.normalize_import_label(raw);
    if pg_catalog.jsonb_typeof(cells -> 'group') = 'null'
      or label in ('unassigned', 'none', 'no group', '-', '—', 'بدون', 'بدون مجموعة', 'لا يوجد', 'غير محدد') then
      v_group_id := null;
    elsif raw is not null then
      select pg_catalog.array_agg(g.id::text) into matches from public.groups g
      where g.academy_id = p_academy_id and g.academic_year_id = p_academic_year_id and g.archived_at is null
        and g.level_id = v_level_id and (g.track_id is null or g.track_id = v_track_id) and g.id::text = label;
      if coalesce(cardinality(matches), 0) = 0 then
        select pg_catalog.array_agg(g.id::text) into matches from public.groups g
        where g.academy_id = p_academy_id and g.academic_year_id = p_academic_year_id and g.archived_at is null
          and g.level_id = v_level_id and (g.track_id is null or g.track_id = v_track_id)
          and public.normalize_import_label(g.name) = label;
      end if;
      if cardinality(matches) = 1 then v_group_id := matches[1]::uuid;
      elsif cardinality(matches) > 1 then
        issues := issues || '{"field": "group", "code": "ambiguous"}'::jsonb;
      elsif exists (
        select 1 from public.groups g
        where g.academy_id = p_academy_id and g.academic_year_id = p_academic_year_id and g.archived_at is null
          and (g.id::text = label or public.normalize_import_label(g.name) = label)
      ) then
        issues := issues || '{"field": "group", "code": "incompatible"}'::jsonb;
      else
        issues := issues || '{"field": "group", "code": "unknown"}'::jsonb;
      end if;
    elsif use_defaults and d_group is not null then
      select g.id into v_group_id from public.groups g
      where g.academy_id = p_academy_id and g.academic_year_id = p_academic_year_id and g.archived_at is null
        and g.id::text = d_group and g.level_id = v_level_id and (g.track_id is null or g.track_id = v_track_id);
    end if;
  end if;

  -- Student type: the enum value or its displayed label; else the default.
  raw := public.student_import_cell(cells, 'student_type');
  if raw is not null then
    label := public.normalize_import_label(raw);
    v_type := case
      when label in ('in_person', 'in person') then 'in_person'
      when label in ('online_only', 'online only') then 'online_only'
    end;
    if v_type is null then issues := issues || '{"field": "student_type", "code": "unknown"}'::jsonb; end if;
  elsif not 'student_type' = any(problems) then
    if use_defaults and d_type in ('in_person', 'online_only') then v_type := d_type;
    else issues := issues || '{"field": "student_type", "code": "required"}'::jsonb;
    end if;
  end if;

  input := pg_catalog.jsonb_build_object(
    'full_name', v_full_name, 'student_phone', normalized_phone, 'parent_phone', v_parent_phone,
    'level_id', v_level_id, 'track_id', v_track_id, 'primary_group_id', v_group_id, 'participation_type', v_type);
end;
$$;

create or replace function public.start_student_import(p_academy_id uuid, p_academic_year_id uuid, p_file_name text, p_format student_import_format, p_worksheet text, p_expected_rows integer, p_defaults jsonb, p_replaces uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  session_id uuid;
  d jsonb := coalesce(p_defaults, '{}'::jsonb);
begin
  if actor is null or coalesce(public.academy_role_for(p_academy_id)::text, '') not in ('owner', 'head_admin', 'admin') then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  if p_format is null or p_expected_rows is null or p_expected_rows not between 1 and 5000
    or p_file_name is null or char_length(p_file_name) not between 1 and 255
    or (p_worksheet is not null and char_length(p_worksheet) not between 1 and 255)
    or jsonb_typeof(d) <> 'object'
    or exists (select 1 from jsonb_each(d) e where e.key not in ('level_id', 'track_id', 'primary_group_id', 'participation_type')
      or jsonb_typeof(e.value) not in ('string', 'null')) then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  if not exists (
    select 1 from public.academic_years y
    where y.id = p_academic_year_id and y.academy_id = p_academy_id and y.closed_at is null
  ) then
    raise exception using errcode = 'P0001', message = 'year_unavailable';
  end if;
  -- Defaults must name this academy's structure; compatibility with each row is decided per row.
  if (d ->> 'level_id' is not null and not exists (
        select 1 from (select * from public.academy_levels where stopped_at is null) al where al.academy_id = p_academy_id and al.level_id = d ->> 'level_id'))
    or (d ->> 'track_id' is not null and not exists (
        select 1 from (select * from public.academy_tracks where retired_at is null) t where t.academy_id = p_academy_id and t.id::text = d ->> 'track_id'))
    or (d ->> 'primary_group_id' is not null and not exists (
        select 1 from public.groups g where g.academy_id = p_academy_id and g.academic_year_id = p_academic_year_id
          and g.archived_at is null and g.id::text = d ->> 'primary_group_id'))
    or (d ->> 'participation_type' is not null and d ->> 'participation_type' not in ('in_person', 'online_only')) then
    raise exception using errcode = 'P0001', message = 'validation', hint = 'defaults';
  end if;

  if p_replaces is not null then
    update public.student_import_sessions s set state = 'cancelled', updated_at = now()
    where s.id = p_replaces and s.academy_id = p_academy_id and s.created_by = actor
      and s.state in ('staging', 'reviewing');
  end if;

  insert into public.student_import_sessions (
    academy_id, academic_year_id, created_by, file_name, format, worksheet, expected_rows, defaults
  ) values (
    p_academy_id, p_academic_year_id, actor, p_file_name, p_format, p_worksheet, p_expected_rows, jsonb_strip_nulls(d)
  ) returning id into session_id;
  return session_id;
end;
$function$;

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
  if p_audience='groups' then
    perform edra_private.require_offering(g.academy_id,g.level_id,g.track_id) from public.groups g where g.id=any(p_group_ids) and g.academy_id=p_academy_id;
  elsif p_level_id is not null then perform edra_private.require_offering(p_academy_id,p_level_id,p_track_id); end if;
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
  if p_audience='groups' then
    perform edra_private.require_offering(g.academy_id,g.level_id,g.track_id) from public.groups g where g.id=any(p_group_ids) and g.academy_id=p_academy_id;
  elsif p_level_id is not null then perform edra_private.require_offering(p_academy_id,p_level_id,p_track_id); end if;
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
  if p_audience='groups' then
    perform edra_private.require_offering(g.academy_id,g.level_id,g.track_id) from public.groups g where g.id=any(p_group_ids) and g.academy_id=p_academy_id;
  elsif p_level_id is not null then perform edra_private.require_offering(p_academy_id,p_level_id,p_track_id); end if;
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
end;
$$;

create or replace function edra_private.require_assignment_placement(p_target public.assignments,p_record_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform edra_private.require_assessment_offering('assignment',p_target.id);
  if not exists(select 1 from public.annual_student_records r where r.id=p_record_id
    and r.academy_id=p_target.academy_id and r.academic_year_id=p_target.academic_year_id
    and edra_private.assignment_matches_record(p_target,r)) then raise exception 'not_recipient'; end if;
end;
$$;

create or replace function edra_private.require_quiz_placement(p_target public.quizzes, p_record_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform edra_private.require_assessment_offering('quiz',p_target.id);
  perform edra_private.lock_quiz_record(p_target, p_record_id);
  if not edra_private.quiz_is_eligible(p_target.id, p_record_id) then
    raise exception using errcode = 'P0001', message = 'not_eligible';
  end if;
end;
$$;

create or replace function edra_private.require_exam_placement(p_target public.exams, p_record_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform edra_private.require_assessment_offering('exam',p_target.id);
  perform edra_private.lock_exam_record(p_target, p_record_id);
  if not edra_private.exam_is_eligible(p_target.id, p_record_id) then
    raise exception using errcode = 'P0001', message = 'not_eligible';
  end if;
end;
$$;

create function edra_private.guard_assessment_group_offering()
returns trigger language plpgsql security definer set search_path='' as $$
declare g public.groups;
begin
  select * into strict g from public.groups where id=new.group_id and academy_id=new.academy_id;
  perform edra_private.require_offering(g.academy_id,g.level_id,g.track_id);
  return new;
end $$;
create trigger assignment_group_offering before insert or update on public.assignment_audience_groups for each row execute function edra_private.guard_assessment_group_offering();
create trigger quiz_group_offering before insert or update on public.quiz_audience_groups for each row execute function edra_private.guard_assessment_group_offering();
create trigger exam_group_offering before insert or update on public.exam_audience_groups for each row execute function edra_private.guard_assessment_group_offering();

create or replace function edra_private.exam_audience_records(p_exam_id uuid)
returns setof uuid language sql stable security definer set search_path='' as $$
  select r.id from public.exams z
  join public.annual_student_records r on r.academy_id=z.academy_id and r.academic_year_id=z.academic_year_id
  where z.id=p_exam_id and r.archived_at is null and z.audience is not null
    and case when z.roster_frozen_at is not null then exists(
      select 1 from edra_private.exam_fixed_roster f where f.exam_id=z.id and f.annual_student_record_id=r.id)
    else case z.audience
      when 'level' then r.level_id=z.level_id
      when 'program' then r.level_id=z.level_id and r.track_id=z.track_id
      when 'groups' then r.primary_group_id in (select x.group_id from public.exam_audience_groups x where x.exam_id=z.id)
    end end;
$$;

create or replace function edra_private.quiz_phase(p_quiz public.quizzes, p_at timestamptz)
returns text
language sql stable security definer set search_path = '' as $$
  select case
    when p_quiz.archived_at is not null then 'archived'
    when p_quiz.offering_closed_at is not null then 'closed'
    when p_quiz.closes_at is not null and p_at >= p_quiz.actual_closes_at then 'closed'
    when not edra_private.quiz_ready(p_quiz.id) then 'preparing'
    when p_quiz.opens_at is null then 'ready'
    when p_at < p_quiz.opens_at then 'scheduled'
    when p_at < p_quiz.closes_at then 'open'
    else 'headroom'
  end;
$$;

create or replace function edra_private.configure_quiz_availability(
  p_academy_id uuid, p_quiz_id uuid, p_expected_version integer, p_opens_at timestamptz, p_closes_at timestamptz
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  target public.quizzes%rowtype;
  started boolean;
  at timestamptz := clock_timestamp();
begin
  perform edra_private.require_assessment_offering('quiz',p_quiz_id);
  perform edra_private.require_quiz_role(p_academy_id, true);
  target := edra_private.lock_quiz(p_academy_id, p_quiz_id, true);
  perform edra_private.require_open_quiz_year(target.academy_id, target.academic_year_id);
  -- Time is read after the locks so a blocked request cannot act on a window that has since closed.
  at := clock_timestamp();
  if target.archived_at is not null then raise exception using errcode = 'P0001', message = 'invalid_state'; end if;
  if p_expected_version is null or p_expected_version <> target.version then
    raise exception using errcode = 'P0001', message = 'quiz_conflict';
  end if;
  if target.actual_closes_at is not null and at >= target.actual_closes_at then
    raise exception using errcode = 'P0001', message = 'quiz_closed';
  end if;
  started := target.work_started_at is not null;
  if (p_opens_at is null) <> (p_closes_at is null) then raise exception using errcode = 'P0001', message = 'validation'; end if;

  if p_opens_at is null then
    if target.opens_at is not null and (at >= target.opens_at or started) then
      raise exception using errcode = 'P0001', message = 'already_open';
    end if;
  else
    if not edra_private.quiz_ready(target.id) then raise exception using errcode = 'P0001', message = 'not_ready'; end if;
    if p_opens_at >= p_closes_at or p_closes_at <= at then raise exception using errcode = 'P0001', message = 'validation'; end if;
    if target.opens_at is not null and at >= target.opens_at and p_opens_at <> target.opens_at then
      raise exception using errcode = 'P0001', message = 'already_open';
    end if;
    if started and target.closes_at is not null and p_closes_at < target.closes_at then
      raise exception using errcode = 'P0001', message = 'window_locked';
    end if;
  end if;

  update public.quizzes set opens_at = p_opens_at, closes_at = p_closes_at,
    actual_closes_at = p_closes_at + interval '2 minutes',
    availability_updated_by = actor, availability_updated_at = at,
    version = version + 1, updated_by = actor, updated_at = at
  where id = target.id;
  return edra_private.quiz_json(target.id);
end;
$$;

create or replace function edra_private.exam_phase(p_exam public.exams, p_at timestamptz)
returns text
language sql stable security definer set search_path = '' as $$
  select case
    when p_exam.archived_at is not null then 'archived'
    when p_exam.offering_closed_at is not null then 'closed'
    when p_exam.closes_at is not null and p_at >= p_exam.actual_closes_at then 'closed'
    when not edra_private.exam_ready(p_exam.id) then 'preparing'
    when p_exam.opens_at is null then 'ready'
    when p_at < p_exam.opens_at then 'scheduled'
    when p_at < p_exam.closes_at then 'open'
    else 'headroom'
  end;
$$;

create or replace function edra_private.configure_exam_availability(
  p_academy_id uuid, p_exam_id uuid, p_expected_version integer, p_opens_at timestamptz, p_closes_at timestamptz
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  target public.exams%rowtype;
  started boolean;
  at timestamptz := clock_timestamp();
begin
  perform edra_private.require_assessment_offering('exam',p_exam_id);
  perform edra_private.require_exam_role(p_academy_id, true);
  target := edra_private.lock_exam(p_academy_id, p_exam_id, true);
  perform edra_private.require_open_exam_year(target.academy_id, target.academic_year_id);
  -- Time is read after the locks so a blocked request cannot act on a window that has since closed.
  at := clock_timestamp();
  if target.archived_at is not null then raise exception using errcode = 'P0001', message = 'invalid_state'; end if;
  if p_expected_version is null or p_expected_version <> target.version then
    raise exception using errcode = 'P0001', message = 'exam_conflict';
  end if;
  if target.actual_closes_at is not null and at >= target.actual_closes_at then
    raise exception using errcode = 'P0001', message = 'exam_closed';
  end if;
  started := target.work_started_at is not null;
  if (p_opens_at is null) <> (p_closes_at is null) then raise exception using errcode = 'P0001', message = 'validation'; end if;

  if p_opens_at is null then
    if target.opens_at is not null and (at >= target.opens_at or started) then
      raise exception using errcode = 'P0001', message = 'already_open';
    end if;
  else
    if not edra_private.exam_ready(target.id) then raise exception using errcode = 'P0001', message = 'not_ready'; end if;
    if p_opens_at >= p_closes_at or p_closes_at <= at then raise exception using errcode = 'P0001', message = 'validation'; end if;
    if target.opens_at is not null and at >= target.opens_at and p_opens_at <> target.opens_at then
      raise exception using errcode = 'P0001', message = 'already_open';
    end if;
    if started and target.closes_at is not null and p_closes_at < target.closes_at then
      raise exception using errcode = 'P0001', message = 'window_locked';
    end if;
  end if;

  update public.exams set opens_at = p_opens_at, closes_at = p_closes_at,
    actual_closes_at = p_closes_at + interval '2 minutes',
    availability_updated_by = actor, availability_updated_at = at,
    version = version + 1, updated_by = actor, updated_at = at
  where id = target.id;
  return edra_private.exam_json(target.id);
end;
$$;

create or replace function edra_private.student_caller_record(p_academy_id uuid, p_academic_year_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select r.id
  from public.academy_student_profiles p
  join public.annual_student_records r on r.academy_student_profile_id = p.id
  join public.academic_years y on y.id = r.academic_year_id and y.closed_at is null
  where edra_auth.session_allowed() and p.academy_id = p_academy_id and p.user_id = auth.uid()
    and r.academic_year_id = p_academic_year_id
    and not edra_private.student_access_suspended(r, p)
    and edra_private.offering_available(r.academy_id,r.level_id,r.track_id);
$$;

create or replace function edra_private.change_assignment_state(
  p_academy_id uuid, p_assignment_id uuid, p_expected_version integer, p_action text
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  target public.assignments%rowtype;
begin
  perform edra_private.require_assignment_role(p_academy_id, true);
  if p_expected_version is null or p_action is null or p_action <> all (array['close', 'reopen', 'archive']) then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  target := edra_private.lock_assignment(p_academy_id, p_assignment_id);
  if target.version <> p_expected_version then raise exception using errcode = 'P0001', message = 'assignment_conflict'; end if;
  perform edra_private.require_open_assignment_year(target.academy_id, target.academic_year_id);

  if p_action='reopen' then perform edra_private.require_assessment_offering('assignment',target.id); end if;
  if p_action = 'close' then
    if target.state <> 'active' then raise exception using errcode = 'P0001', message = 'invalid_state'; end if;
    update public.assignments set state = 'closed', closed_at = now(), closed_by = actor,
      version = version + 1, updated_by = actor, updated_at = now()
    where id = target.id;
  elsif p_action = 'reopen' then
    if target.state <> 'closed' then raise exception using errcode = 'P0001', message = 'invalid_state'; end if;
    update public.assignments set state = 'active', closed_at = null, closed_by = null,
      version = version + 1, updated_by = actor, updated_at = now()
    where id = target.id;
  else
    if target.state = 'archived' or (target.state = 'active' and edra_private.assignment_has_activity(target.id)) then
      raise exception using errcode = 'P0001', message = 'invalid_state';
    end if;
    update public.assignments set state = 'archived', archived_at = now(), archived_by = actor,
      version = version + 1, updated_by = actor, updated_at = now()
    where id = target.id;
  end if;
  return edra_private.assignment_json(target.id);
end;
$$;

create or replace function public.list_student_records(p_academy_id uuid, p_academic_year_id uuid, p_search text, p_status text, p_level_id text, p_track text, p_group text, p_participation_type text, p_sorts jsonb, p_page_index integer, p_page_size integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  term text := nullif(pg_catalog.btrim(coalesce(p_search, '')), '');
  pattern text;
  digits text;
  status text := coalesce(p_status, 'active');
  sort jsonb;
  sort_expr text;
  order_sql text := '';
  seen text[] := '{}';
  base text;
  total bigint;
  page jsonb;
begin
  if not public.is_academy_member(p_academy_id) then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  if p_page_size is null or p_page_size not in (10, 20, 50, 100) or p_page_index is null or p_page_index < 0
    or status not in ('active', 'archived', 'all')
    or (p_participation_type is not null and p_participation_type not in ('in_person', 'online_only'))
    or (p_sorts is not null and (jsonb_typeof(p_sorts) <> 'array' or jsonb_array_length(p_sorts) > 3)) then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;

  if term is not null then
    term := left(term, 100);
    -- Backslash is LIKE's default escape character: match %, _ and \ literally.
    pattern := '%' || replace(replace(replace(term, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    -- Phone-like searches also match stored +20 numbers when typed in domestic (01…) or 0020 form.
    if term ~ '^[+0-9[:space:]().-]+$' then
      digits := pg_catalog.regexp_replace(term, '[^0-9]', '', 'g');
      if digits like '00%' then digits := substr(digits, 3);
      elsif digits like '0%' then digits := substr(digits, 2);
      end if;
      digits := nullif(digits, '');
    end if;
  end if;

  for sort in select value from jsonb_array_elements(coalesce(p_sorts, '[]'::jsonb)) loop
    if (sort ->> 'id') = any(seen) then raise exception using errcode = 'P0001', message = 'validation'; end if;
    seen := seen || (sort ->> 'id');
    sort_expr := case sort ->> 'id'
      when 'name' then 'lower(r.full_name)'
      when 'studentPhone' then 'r.student_phone'
      when 'parentPhone' then 'r.parent_phone'
      when 'level' then 'al.sort_order'
      when 'track' then 'lower(edra_private.track_label(r.track_id,r.academic_year_id))'
      when 'group' then 'lower(g.name)'
      when 'participationType' then 'r.participation_type'
      when 'status' then '(r.archived_at is not null)'
      when 'createdAt' then 'r.created_at'
    end;
    if sort_expr is null or jsonb_typeof(sort -> 'desc') is distinct from 'boolean' then
      raise exception using errcode = 'P0001', message = 'validation';
    end if;
    order_sql := order_sql || sort_expr || case when (sort ->> 'desc')::boolean then ' desc' else ' asc' end || ' nulls last, ';
  end loop;
  if order_sql = '' then order_sql := 'lower(r.full_name) asc, '; end if;
  order_sql := order_sql || 'r.id asc';

  base := $q$
    from public.annual_student_records r
    join public.academy_levels al on al.academy_id = r.academy_id and al.level_id = r.level_id
    join public.global_levels gl on gl.id = r.level_id
    left join public.academy_tracks t on t.id = r.track_id
    left join public.groups g on g.id = r.primary_group_id
    left join public.academy_student_profiles p on p.id = r.academy_student_profile_id and p.academy_id = r.academy_id
    where r.academy_id = $1 and r.academic_year_id = $2
      and ($3 = 'all' or ($3 = 'active') = (r.archived_at is null))
      and ($4::text is null or r.level_id = $4)
      and ($5::text is null or ($5 = 'none' and r.track_id is null) or r.track_id::text = $5)
      and ($6::text is null or ($6 = 'none' and r.primary_group_id is null) or r.primary_group_id::text = $6)
      and ($7::text is null or r.participation_type::text = $7)
      and ($8::text is null
        or r.full_name ilike $8 or gl.name ilike $8 or edra_private.track_label(r.track_id,r.academic_year_id) ilike $8 or g.name ilike $8
        or r.student_phone ilike $8 or r.parent_phone ilike $8
        or exists (
          select 1 from public.student_code_settings s
          join public.student_code_assignments a on a.academy_id = s.academy_id
          where s.academy_id = r.academy_id and s.enabled
            and a.annual_student_record_id = r.id and a.academic_year_id = r.academic_year_id
            and a.retired_at is null and a.code ilike $8
        )
        or ($9::text is not null and (r.student_phone like '%' || $9 || '%' or r.parent_phone like '%' || $9 || '%')))
  $q$;

  execute 'select count(*) ' || base into total
    using p_academy_id, p_academic_year_id, status, p_level_id, p_track, p_group, p_participation_type, pattern, digits;

  execute format($q$
    select coalesce(jsonb_agg(to_jsonb(x) - 'ord' order by x.ord), '[]'::jsonb) from (
      select row_number() over (order by %1$s) as ord,
        r.id, r.academy_student_profile_id, r.full_name, r.student_phone, r.parent_phone,
        r.level_id, gl.name as level_name, r.track_id, edra_private.track_label(r.track_id,r.academic_year_id) as track_name,
        r.primary_group_id, g.name as group_name, r.participation_type,
        r.archived_at, r.created_at, r.updated_at, r.version,
        -- Same rule as edra_private.student_access_suspended and the edit sheet.
        case when p.user_id is null then 'not_connected'
          when r.archived_at is not null or p.access_suspended_at is not null then 'suspended'
          else 'connected' end as online_account
      %2$s
      order by %1$s
      limit $10 offset $11
    ) x
  $q$, order_sql, base) into page
    using p_academy_id, p_academic_year_id, status, p_level_id, p_track, p_group, p_participation_type, pattern, digits,
      p_page_size, p_page_index * p_page_size;

  return jsonb_build_object('rows', page, 'total', total);
end;
$function$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='edra_private' and p.proname in ('require_schedule_offering','require_assessment_offering',
      'content_offering_available','guard_offering_use','guard_assessment_group_offering')
  loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature); end loop;
end $$;
commit;
