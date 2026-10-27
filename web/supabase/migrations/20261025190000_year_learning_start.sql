-- EDRA-231: manager-controlled student learning start for the academy's single open year.
--
-- * academic_years.student_learning_started_at gates protected student learning. It is separate
--   from closed_at, the generated calendar boundaries and both suspension causes; no date starts it.
-- * New years start in preparation (null). Existing years keep their current availability through
--   the 'legacy' source, which records no manager.
-- * Starting is one-way and idempotent. It locks the year row, so it serializes with closure and
--   with record/enrollment writes that hold the year FOR SHARE.
-- * edra_private.student_caller_record is the shared resolver for every protected student learning
--   service (content, coupons, assignments, quizzes, exams and their image/upload authorization), so
--   the gate lives there. Identity, linking and the academy landing do not use it.
begin;

alter table public.academic_years
  add column student_learning_started_at timestamptz,
  add column student_learning_started_by uuid references public.profiles (id),
  add column student_learning_start_source text,
  add constraint academic_years_learning_start_shape check (
    (student_learning_started_at is null and student_learning_started_by is null and student_learning_start_source is null)
    or (student_learning_start_source = 'legacy' and student_learning_started_at is not null and student_learning_started_by is null)
    or (student_learning_start_source = 'manager' and student_learning_started_at is not null and student_learning_started_by is not null)
  );

update public.academic_years
set student_learning_started_at = now(), student_learning_start_source = 'legacy';

-- A start is never edited or reverted, and a closed year cannot be started.
create function edra_private.guard_year_learning_start()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.student_learning_started_at is not null or old.closed_at is not null then
    raise exception using errcode = 'P0001', message = 'year_unavailable';
  end if;
  return new;
end;
$$;

create trigger academic_years_learning_start
before update of student_learning_started_at, student_learning_started_by, student_learning_start_source
on public.academic_years for each row
when ((new.student_learning_started_at, new.student_learning_started_by, new.student_learning_start_source)
  is distinct from (old.student_learning_started_at, old.student_learning_started_by, old.student_learning_start_source))
execute function edra_private.guard_year_learning_start();

create function edra_private.year_learning_json(p_year public.academic_years, p_academy_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'year', case when p_year.id is null then null else jsonb_build_object(
      'id', p_year.id, 'startYear', p_year.start_year, 'startedAt', p_year.student_learning_started_at) end,
    'canManage', public.is_academy_manager(p_academy_id));
$$;

-- Every staff role may read the open year's learning state.
create function public.get_year_learning(p_academy_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare y public.academic_years%rowtype;
begin
  if auth.uid() is null or not edra_auth.session_allowed() or public.academy_role_for(p_academy_id) is null then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  select * into y from public.academic_years where academy_id = p_academy_id and closed_at is null;
  return edra_private.year_learning_json(y, p_academy_id);
end;
$$;

-- Owners, Head Admins and Admins start the open year. Retries return the recorded start unchanged.
create function public.start_year_learning(p_academy_id uuid, p_academic_year_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare y public.academic_years%rowtype;
begin
  if auth.uid() is null or not edra_auth.session_allowed() or not public.is_academy_manager(p_academy_id) then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  select * into y from public.academic_years
  where id = p_academic_year_id and academy_id = p_academy_id for update;
  if not found or y.closed_at is not null then
    raise exception using errcode = 'P0001', message = 'year_unavailable';
  end if;
  if y.student_learning_started_at is null then
    update public.academic_years
    set student_learning_started_at = now(), student_learning_started_by = auth.uid(), student_learning_start_source = 'manager'
    where id = y.id returning * into y;
  end if;
  return edra_private.year_learning_json(y, p_academy_id);
end;
$$;

-- Latest definition (offering availability) plus the year learning start.
create or replace function edra_private.student_caller_record(p_academy_id uuid, p_academic_year_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select r.id
  from public.academy_student_profiles p
  join public.annual_student_records r on r.academy_student_profile_id = p.id
  join public.academic_years y on y.id = r.academic_year_id and y.closed_at is null
  where edra_auth.session_allowed() and p.academy_id = p_academy_id and p.user_id = auth.uid()
    and r.academic_year_id = p_academic_year_id
    and y.student_learning_started_at is not null
    and not edra_private.student_access_suspended(r, p)
    and edra_private.offering_available(r.academy_id,r.level_id,r.track_id);
$$;

-- Identity and registration stay visible before the start. Suspension feedback takes precedence.
create or replace function public.get_my_student_academy(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  profile public.academy_student_profiles%rowtype;
  current_record public.annual_student_records%rowtype;
  open_year public.academic_years%rowtype;
begin
  if auth.uid() is null or not edra_auth.session_allowed() then return null; end if;
  select p.* into profile from public.academy_student_profiles p
  join public.academies a on a.id = p.academy_id
  where a.slug = p_slug and p.user_id = auth.uid();
  if not found then return null; end if;
  select y.* into open_year from public.academic_years y
  where y.academy_id = profile.academy_id and y.closed_at is null;
  select r.* into current_record from public.annual_student_records r
  where r.academy_student_profile_id = profile.id and r.academic_year_id = open_year.id;
  return jsonb_build_object(
    'academy', edra_private.student_invite_academy_json(profile.academy_id),
    'startYear', open_year.start_year,
    'access', case
      when current_record.id is null then 'no_current_year'
      when edra_private.student_access_suspended(current_record, profile) then 'suspended'
      when open_year.student_learning_started_at is null then 'not_started'
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

revoke all on function edra_private.guard_year_learning_start() from public, anon, authenticated;
revoke all on function edra_private.year_learning_json(public.academic_years, uuid) from public, anon, authenticated;
revoke all on function public.get_year_learning(uuid) from public, anon;
revoke all on function public.start_year_learning(uuid, uuid) from public, anon;
grant execute on function public.get_year_learning(uuid) to authenticated;
grant execute on function public.start_year_learning(uuid, uuid) to authenticated;

commit;
