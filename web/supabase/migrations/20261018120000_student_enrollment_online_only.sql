-- New students who enroll through the academy invite link are always online-only; returning
-- students keep the participation type of their earlier record. The setting is retired: the
-- column stays (default online_only) so enrollment code that reads it is unchanged.

alter table public.student_enrollment_settings alter column new_student_participation_type set default 'online_only';
update public.student_enrollment_settings set new_student_participation_type = 'online_only';

create or replace function edra_private.student_enrollment_settings_json(p_academy_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'enrollmentOpen', coalesce(s.enrollment_open, true),
    'inviteToken', s.invite_token,
    'canManage', public.is_academy_manager(p_academy_id)
  )
  from (select 1) one
  left join public.student_enrollment_settings s on s.academy_id = p_academy_id;
$$;

drop function public.update_student_enrollment_settings(uuid, boolean, public.student_participation_type);

create function public.update_student_enrollment_settings(p_academy_id uuid, p_enrollment_open boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_academy_manager(p_academy_id) then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  if p_enrollment_open is null then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  insert into public.student_enrollment_settings as s (academy_id, enrollment_open, updated_by)
  values (p_academy_id, p_enrollment_open, auth.uid())
  on conflict (academy_id) do update
  set enrollment_open = excluded.enrollment_open, updated_at = now(), updated_by = excluded.updated_by;
  return edra_private.student_enrollment_settings_json(p_academy_id);
end;
$$;

revoke all on function public.update_student_enrollment_settings(uuid, boolean) from public, anon;
grant execute on function public.update_student_enrollment_settings(uuid, boolean) to authenticated;
