-- Sessions, captured rosters and attendance are history and are never deleted (owner decision; see
-- the product "Permissions and history" section). This withdraws the ordinary deletion surface added
-- by 20261006100000_delete_session, 20261006110000_delete_session_role_guard and
-- 20261006230000_force_delete_session. No rows are touched.
--
--   * delete_session and force_delete_session keep their signatures so old application versions get
--     a stable denial instead of a missing-function error. Nobody but the owner role may execute them,
--     and their bodies always refuse, so an accidental future grant cannot delete anything.
--   * The history guards no longer honour the caller-controlled edra.force_delete_session setting.
--     Draft attendance rows and sheets are never deleted again, published or not; draft edits update
--     rows in place, so this does not affect editing, finalization, corrections or session expiry.
--   * Sessions and roster entries reject DELETE, and service_role loses DELETE/TRUNCATE on the
--     session and attendance history tables (it never needed them). Lifecycle updates are unchanged.
--
-- Cancellation, rescheduling and exceptional repair are separate future workflows.

create or replace function public.delete_session(p_academy_id uuid, p_session_id uuid)
returns void
language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = 'forbidden', hint = 'Sessions are history and cannot be deleted.';
end;
$$;

create or replace function public.force_delete_session(p_academy_id uuid, p_session_id uuid)
returns void
language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = 'forbidden', hint = 'Sessions are history and cannot be deleted.';
end;
$$;

revoke all on function public.delete_session(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.force_delete_session(uuid, uuid) from public, anon, authenticated, service_role;

-- History is never rewritten or deleted (restores the 20261005170000_attendance definition).
create or replace function public.reject_attendance_history_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = 'validation', hint = 'Published attendance history cannot change.';
end;
$$;

drop trigger attendance_records_no_delete on public.attendance_records;
drop trigger attendance_sheets_no_delete on public.attendance_sheets;
create trigger attendance_records_no_delete before delete on public.attendance_records
for each row execute function public.reject_attendance_history_change();
create trigger attendance_sheets_no_delete before delete on public.attendance_sheets
for each row execute function public.reject_attendance_history_change();

-- Only the two triggers above used it.
drop function public.reject_published_attendance_delete();

create or replace function public.reject_session_delete()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = 'validation', hint = 'Sessions are history and cannot be deleted.';
end;
$$;

create trigger sessions_no_delete before delete on public.sessions
for each row execute function public.reject_session_delete();

-- protect_session_roster_entry already rejects every change; extend it to deletes.
drop trigger session_roster_entries_protect on public.session_roster_entries;
create trigger session_roster_entries_protect before update or delete on public.session_roster_entries
for each row execute function public.protect_session_roster_entry();

revoke all on function public.reject_session_delete() from public, anon, authenticated, service_role;
revoke all on function public.reject_attendance_history_change() from public, anon, authenticated, service_role;
revoke all on function public.protect_session_roster_entry() from public, anon, authenticated, service_role;
revoke all on function public.protect_session_write() from public, anon, authenticated, service_role;

revoke delete, truncate on public.sessions, public.session_roster_entries, public.attendance_sheets,
  public.attendance_records, public.attendance_publications, public.attendance_publication_items,
  public.attendance_effects
  from public, anon, authenticated, service_role;
