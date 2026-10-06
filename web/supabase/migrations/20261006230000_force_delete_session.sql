-- Force-deleting a finished session together with its published attendance history. Only
-- force_delete_session may lift the history guards, and only for the rest of its own transaction.

create or replace function public.reject_attendance_history_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and pg_catalog.current_setting('edra.force_delete_session', true) = 'on' then
    return old;
  end if;
  raise exception using errcode = 'P0001', message = 'validation', hint = 'Published attendance history cannot change.';
end;
$$;

create or replace function public.reject_published_attendance_delete()
returns trigger language plpgsql set search_path = '' as $$
begin
  if pg_catalog.current_setting('edra.force_delete_session', true) = 'on' then
    return old;
  end if;
  if exists (select 1 from public.attendance_publications p where p.session_id = old.session_id) then
    raise exception using errcode = 'P0001', message = 'validation', hint = 'Published attendance history cannot change.';
  end if;
  return old;
end;
$$;

create function public.force_delete_session(p_academy_id uuid, p_session_id uuid)
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

  perform pg_catalog.set_config('edra.force_delete_session', 'on', true);
  delete from public.attendance_effects where session_id = p_session_id;
  delete from public.attendance_requests where session_id = p_session_id;
  delete from public.attendance_records where session_id = p_session_id;
  delete from public.attendance_sheets where session_id = p_session_id;
  delete from public.attendance_publication_items where session_id = p_session_id;
  delete from public.attendance_publications where session_id = p_session_id;
  delete from public.session_roster_entries where session_id = p_session_id;
  delete from public.sessions where id = p_session_id;
  perform pg_catalog.set_config('edra.force_delete_session', 'off', true);
end;
$$;

revoke all on function public.force_delete_session(uuid, uuid) from public, anon;
grant execute on function public.force_delete_session(uuid, uuid) to authenticated;
