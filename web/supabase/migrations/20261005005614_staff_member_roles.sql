-- Only an academy Owner can promote/demote an existing staff member.
create function public.change_staff_member_role(p_academy_id uuid, p_user_id uuid, p_role public.academy_role)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  actor_role public.academy_role;
  target_role public.academy_role;
begin
  if actor is null or actor = p_user_id or p_role is null or p_role not in ('admin', 'instructor') then
    return jsonb_build_object('result', 'forbidden');
  end if;
  -- Shares the membership lock used by acceptance and removal.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'academy_membership:' || p_academy_id::text || ':' || p_user_id::text, 0));
  select role into actor_role from public.academy_memberships
    where academy_id = p_academy_id and user_id = actor for share;
  if actor_role is distinct from 'owner' then
    return jsonb_build_object('result', 'forbidden');
  end if;
  select role into target_role from public.academy_memberships
    where academy_id = p_academy_id and user_id = p_user_id for update;
  if target_role is null then return jsonb_build_object('result', 'not_found'); end if;
  if target_role not in ('admin', 'instructor') then return jsonb_build_object('result', 'forbidden'); end if;
  if target_role = p_role then return jsonb_build_object('result', 'unchanged'); end if;
  update public.academy_memberships set role = p_role
    where academy_id = p_academy_id and user_id = p_user_id;
  perform realtime.send(jsonb_build_object('academyId', p_academy_id),
    'staff_role_changed', 'staff-membership:' || p_user_id::text || ':' || p_academy_id::text, true);
  return jsonb_build_object('result', 'role_changed');
end;
$$;
revoke all on function public.change_staff_member_role(uuid, uuid, public.academy_role) from public, anon;
grant execute on function public.change_staff_member_role(uuid, uuid, public.academy_role) to authenticated;
