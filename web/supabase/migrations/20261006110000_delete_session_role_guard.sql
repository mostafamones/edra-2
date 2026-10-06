-- Corrects the delete_session role guard. academy_role_for returns NULL for a signed-in non-member,
-- and `NULL not in (...)` is NULL, so the original IF skipped the rejection. The guard now denies
-- unless the role is definitely Owner or Admin. Added as a separate migration so the fix also
-- reaches any database where 20261006100000_delete_session was already applied.
create or replace function public.delete_session(p_academy_id uuid, p_session_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  target public.sessions%rowtype;
begin
  if auth.uid() is null or p_academy_id is null or p_session_id is null
    or (public.academy_role_for(p_academy_id) in ('owner', 'admin')) is not true then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  select s.* into target from public.sessions s
  where s.id = p_session_id and s.academy_id = p_academy_id
  for update;
  if not found then raise exception using errcode = 'P0001', message = 'not_found'; end if;
  if target.state = 'live' and target.auto_end_at <= now() then
    perform public.expire_sessions(target.schedule_id);
    select s.* into target from public.sessions s where s.id = p_session_id;
  end if;
  if target.state <> 'ended' then raise exception using errcode = 'P0001', message = 'session_live'; end if;
  if exists (select 1 from public.attendance_publications p where p.session_id = p_session_id) then
    raise exception using errcode = 'P0001', message = 'session_published';
  end if;
  delete from public.attendance_requests where session_id = p_session_id;
  delete from public.attendance_records where session_id = p_session_id;
  delete from public.attendance_sheets where session_id = p_session_id;
  delete from public.session_roster_entries where session_id = p_session_id;
  delete from public.sessions where id = p_session_id;
end;
$$;

revoke all on function public.delete_session(uuid, uuid) from public, anon;
grant execute on function public.delete_session(uuid, uuid) to authenticated;

-- Membership helpers are only needed by authenticated callers and RLS policies scoped to
-- authenticated. Supabase's default privileges granted anon EXECUTE directly; remove it.
revoke execute on function public.is_academy_member(uuid) from anon;
revoke execute on function public.academy_role_for(uuid) from anon;
revoke execute on function public.shares_academy_with(uuid) from anon;
