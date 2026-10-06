-- Deleting a finished session. Only sessions whose attendance was never published can be removed;
-- published attendance is official history and stays. Owners and admins only.

-- Draft attendance rows may now be deleted, but only while the session has no publication.
create or replace function public.reject_published_attendance_delete()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.attendance_publications p where p.session_id = old.session_id) then
    raise exception using errcode = 'P0001', message = 'validation', hint = 'Published attendance history cannot change.';
  end if;
  return old;
end;
$$;

revoke all on function public.reject_published_attendance_delete() from public, anon, authenticated;

drop trigger attendance_records_no_delete on public.attendance_records;
drop trigger attendance_sheets_no_delete on public.attendance_sheets;
create trigger attendance_records_no_delete before delete on public.attendance_records
for each row execute function public.reject_published_attendance_delete();
create trigger attendance_sheets_no_delete before delete on public.attendance_sheets
for each row execute function public.reject_published_attendance_delete();

create or replace function public.delete_session(p_academy_id uuid, p_session_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  target public.sessions%rowtype;
begin
  if auth.uid() is null or p_academy_id is null or public.academy_role_for(p_academy_id) not in ('owner', 'admin') then
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
