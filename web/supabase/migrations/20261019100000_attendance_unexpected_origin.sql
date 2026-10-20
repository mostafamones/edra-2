-- Unexpected attendees (product "Student roster"): staff may explicitly add an active annual record of
-- the session's academy and year to an existing session roster. The appended snapshot carries its own
-- origin so it is never treated as expected (no "mark rest absent", no expected-absence effect).
--
-- Additive only. The new enum value is used by statements in the following migration, so it lives in
-- its own file (Postgres cannot use a new enum value in the transaction that adds it). Existing
-- expected/eligible snapshots are not rewritten or backfilled.

alter type public.session_roster_origin add value if not exists 'unexpected';

-- Who appended an entry after the session started. Null for the original start snapshot; created_at
-- already records when the entry was added.
alter table public.session_roster_entries
  add column added_by uuid references public.profiles (id),
  add column added_by_name text;

-- Receipts for the new attendance commands (retained like the others).
alter table public.attendance_requests drop constraint attendance_requests_operation_check;
alter table public.attendance_requests add constraint attendance_requests_operation_check
  check (operation in ('check_in', 'set', 'bulk', 'publish', 'unrecorded_absent', 'add_attendee'));
