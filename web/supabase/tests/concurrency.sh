#!/usr/bin/env bash
# Separate-session race tests for schedule/group/slot, student-record, import, student-code and
# check-in locking. Run only through `npm run test:db`, which validates the isolated target and
# exports its connection. Races need real concurrent transactions, so fixtures are committed under a
# run-specific academy, admin and ids. They are retained: preserved history (sessions, attendance,
# code ledger) cannot be removed through normal flows. Fresh identities keep reruns collision-free.
set -euo pipefail

for name in EDRA_DB_TEST_CONN EDRA_DB_TEST_TARGET EDRA_DB_TEST_RUN; do
  [ -n "${!name:-}" ] || { echo "concurrency: $name is not set; run through npm run test:db" >&2; exit 2; }
done
psqlx() { psql "$EDRA_DB_TEST_CONN" -v ON_ERROR_STOP=1 -X -q "$@"; }
redact() {
  local text; text="$(cat)"
  [ -z "${PGPASSWORD:-}" ] || text="${text//"$PGPASSWORD"/<password>}"
  [ -z "${EDRA_DB_TEST_HOST:-}" ] || text="${text//"$EDRA_DB_TEST_HOST"/<host>}"
  [ -z "${EDRA_DB_TEST_USER:-}" ] || text="${text//"$EDRA_DB_TEST_USER"/<user>}"
  printf '%s\n' "$text"
}
uuid() { local h; h="$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"; echo "${h:0:8}-${h:8:4}-4${h:13:3}-8${h:17:3}-${h:20:12}"; }

# Every connection re-proves the same target before the first write.
marker="$(psqlx -tA -c "select string_agg(name, ',') from edra_db_test.target" 2>/dev/null)" || marker=""
[ "$marker" = "$EDRA_DB_TEST_TARGET" ] || { echo "concurrency: target marker does not match; nothing was written" >&2; exit 2; }

RUN="$EDRA_DB_TEST_RUN"
TAG="edra-race-$RUN"
ACADEMY="$(uuid)"
SLUG="race-$RUN"
ADMIN="$(uuid)"
YEAR="$(uuid)"
GROUP_ARCH="$(uuid)"   # archive wins first
GROUP_SCHED="$(uuid)"  # schedule wins first

OUT="$(mktemp -d)"
setup_started=false
finish() {
  local status=$?
  if $setup_started; then
    echo "concurrency: retained fixtures for run $RUN: academy $ACADEMY (slug $SLUG), admin user $ADMIN"
  fi
  if [ "$status" -eq 0 ]; then
    rm -rf "$OUT"
  else
    for file in "$OUT"/*; do [ -f "$file" ] && redact <"$file" >"$file.tmp" && mv "$file.tmp" "$file"; done
    echo "concurrency: worker output kept in $OUT" >&2
  fi
}
trap finish EXIT

fail() { printf 'FAIL: %s\n' "$*" | redact >&2; exit 1; }
out() { cat "$OUT/$1" 2>/dev/null || true; }
rc() { cat "$OUT/$1.rc" 2>/dev/null || echo missing; }

# The holder waits inside its transaction until the named contender is blocked on a lock, has
# finished, or 15 seconds pass. It runs as the connecting role so it can see the other sessions.
read -r -d '' GATE_FN <<'SQL' || true
create function pg_temp.gate(contender text) returns void language plpgsql security definer as $gate$
declare deadline timestamptz := clock_timestamp() + interval '15 seconds'; seen boolean := false;
begin
  loop
    perform pg_stat_clear_snapshot();
    exit when exists (select 1 from pg_stat_activity where application_name = contender and wait_event_type = 'Lock');
    if exists (select 1 from pg_stat_activity where application_name = contender) then seen := true;
    elsif seen or clock_timestamp() > deadline then exit;
    end if;
    perform pg_sleep(0.05);
  end loop;
end $gate$;
SQL

# Each worker runs one transaction and records its own exit status; a missing status means it never
# finished. `run` waits for the worker, `start` leaves it in the background.
work() { # $1 name, $2 SQL
  if psqlx -c "begin; select set_config('application_name', '$TAG-$1', false); $2 commit;" >"$OUT/$1" 2>&1
  then echo 0 >"$OUT/$1.rc"; else echo $? >"$OUT/$1.rc"; fi
}
run() { work "$@"; }
start() { work "$@" & }
hold() { # $1 holder, $2 contender, $3 SQL that takes the contested lock
  start "$1" "$GATE_FN $3 select pg_temp.gate('$TAG-$2');"
  local deadline=$((SECONDS + 30))
  until psqlx -tA -c "select 1 from pg_stat_activity where application_name = '$TAG-$1' and wait_event = 'PgSleep'" | grep -qx 1; do
    [ "$(rc "$1")" = missing ] || fail "holder $1 ended before holding its lock: $(out "$1")"
    [ "$SECONDS" -lt "$deadline" ] || fail "holder $1 did not hold its lock within 30 seconds"
    sleep 0.2
  done
}
# A server-side rejection: a non-zero status with a reported error, not a lost connection (status 2).
rejected() { local s; s="$(rc "$1")"; [ "$s" != 0 ] && [ "$s" != 2 ] && [ "$s" != missing ] && grep -q 'ERROR:' "$OUT/$1"; }
expect_ok() { [ "$(rc "$1")" = 0 ] || fail "$2 (status $(rc "$1")): $(out "$1")"; }
expect_rejected() { # $1 worker, $2 message, $3 optional expected error text
  rejected "$1" && { [ -z "${3:-}" ] || grep -q "$3" "$OUT/$1"; } || fail "$2 (status $(rc "$1")): $(out "$1")"
}

setup_started=true
psqlx <<SQL
insert into auth.users (id) values ('$ADMIN');
insert into public.academies (id, name, slug, icon, subject, created_by)
  values ('$ACADEMY', 'Race $RUN', '$SLUG', 'school', 'Math', '$ADMIN');
update public.academic_years set id = '$YEAR', start_year = 2030 where academy_id = '$ACADEMY';
insert into public.academy_memberships (academy_id, user_id, role, created_by)
  values ('$ACADEMY', '$ADMIN', 'owner', '$ADMIN');
insert into public.academy_levels (academy_id, level_id, sort_order) values ('$ACADEMY', 'grade-10', 10);
insert into public.groups (id, academy_id, academic_year_id, level_id, name) values
  ('$GROUP_ARCH', '$ACADEMY', '$YEAR', 'grade-10', 'Race A'),
  ('$GROUP_SCHED', '$ACADEMY', '$YEAR', 'grade-10', 'Race B');
SQL

as_admin="set local role authenticated; set local request.jwt.claim.sub = '$ADMIN';"
create_sched() { # $1 group id, $2 title
  echo "select public.create_schedule('$ACADEMY','$YEAR','$2','one_off','group','$1',null,null,true,null,'[]'::jsonb,'[{\"date\":\"2030-10-01\",\"startsAt\":\"10:00\",\"endsAt\":\"11:00\"}]'::jsonb);"
}
archive() { echo "update public.groups set archived_at = now() where id = '$1';"; }

# 1. Archive holds the group lock; a concurrent schedule insert must end up rejected.
hold 1a 1b "$as_admin $(archive "$GROUP_ARCH")"
start 1b "$as_admin $(create_sched "$GROUP_ARCH" 'Race sched 1')"
wait
expect_ok 1a "the archive holding the group lock failed"
expect_rejected 1b "schedule created on a group archived concurrently"

# 2. Schedule insert holds the group share lock; a concurrent archive must be rejected.
hold 2a 2b "$as_admin $(create_sched "$GROUP_SCHED" 'Race sched 2')"
start 2b "$as_admin $(archive "$GROUP_SCHED")"
wait
expect_ok 2a "the schedule holding the group lock failed"
expect_rejected 2b "group archived despite a concurrently created schedule"
psqlx -tA -c "select count(*) from public.groups where id = '$GROUP_SCHED' and archived_at is null" | grep -qx 1 \
  || fail "group with a schedule ended up archived"

# 3. Two sessions each delete a different slot of a two-slot schedule; one must be rejected.
psqlx >/dev/null <<SQL
begin; $as_admin
select public.create_schedule('$ACADEMY','$YEAR','Race slots','recurring','level',null,'grade-10',null,true,null,
  '[{"weekday":1,"startsAt":"09:00","endsAt":"10:00"},{"weekday":2,"startsAt":"09:00","endsAt":"10:00"}]'::jsonb, '[]'::jsonb);
commit;
SQL
race_slots="(select id from public.schedules where academy_id = '$ACADEMY' and title = 'Race slots')"
del() { echo "$as_admin delete from public.schedule_slots where weekday = $1 and schedule_id = $race_slots;"; }
hold 3a 3b "$(del 1)"
start 3b "$(del 2)"
wait
for worker in 3a 3b; do [ "$(rc "$worker")" = 0 ] || rejected "$worker" || fail "slot delete $worker did not complete: $(out "$worker")"; done
remaining="$(psqlx -tA -c "select count(*) from public.schedule_slots where schedule_id = $race_slots")"
[ "$remaining" -ge 1 ] || fail "concurrent final-slot deletes emptied a recurring schedule"
rejected 3a || rejected 3b || fail "both final-slot deletes committed"

# 4. Two sessions create students with the same phone in different formats; exactly one commits.
GROUP_STUDENT_ARCH="$(uuid)"  # archive wins first
GROUP_STUDENT_PLACE="$(uuid)" # placement wins first
psqlx <<SQL
insert into public.groups (id, academy_id, academic_year_id, level_id, name) values
  ('$GROUP_STUDENT_ARCH', '$ACADEMY', '$YEAR', 'grade-10', 'Race students A'),
  ('$GROUP_STUDENT_PLACE', '$ACADEMY', '$YEAR', 'grade-10', 'Race students B');
SQL
create_student() { # $1 name, $2 student phone, $3 group id or null
  local group="null"; [ "$3" != null ] && group="'$3'"
  echo "select public.create_student_record('$ACADEMY','$YEAR','$1','$2','01112223333','grade-10',null,$group,'in_person');"
}
hold 4a 4b "$as_admin $(create_student 'Race dup 1' '01055556666' null)"
start 4b "$as_admin $(create_student 'Race dup 2' '+20 10 5555 6666' null)"
wait
expect_ok 4a "first concurrent student creation failed"
expect_rejected 4b "concurrent duplicate did not report duplicate_student_phone" duplicate_student_phone
psqlx -tA -c "select count(*) from public.academy_student_profiles p where p.academy_id = '$ACADEMY'
  and not exists (select 1 from public.annual_student_records r where r.academy_student_profile_id = p.id)" | grep -qx 0 \
  || fail "a failed concurrent creation left an orphan student profile"

# 5. Archive holds the group lock; a concurrent student placement into it must be rejected.
hold 5a 5b "$as_admin $(archive "$GROUP_STUDENT_ARCH")"
start 5b "$as_admin $(create_student 'Race placed 1' '01066667777' "$GROUP_STUDENT_ARCH")"
wait
expect_ok 5a "the archive holding the group lock failed"
expect_rejected 5b "student placed into a group archived concurrently"

# 6. Placement holds the group share lock; a concurrent archive must be rejected.
hold 6a 6b "$as_admin $(create_student 'Race placed 2' '01077778888' "$GROUP_STUDENT_PLACE")"
start 6b "$as_admin $(archive "$GROUP_STUDENT_PLACE")"
wait
expect_ok 6a "the placement holding the group lock failed"
expect_rejected 6b "group archived despite a concurrently placed student"
psqlx -tA -c "select count(*) from public.annual_student_records where primary_group_id = '$GROUP_STUDENT_PLACE'" | grep -qx 1 \
  || fail "concurrently placed student is missing"

# Imports and bulk group changes ------------------------------------------------------------------
GROUP_BULK_ARCH="$(uuid)"   # archive wins first
GROUP_BULK_MOVE="$(uuid)"   # group change wins first
GROUP_IMPORT="$(uuid)"      # archived while an import batch waits
psqlx <<SQL
insert into public.groups (id, academy_id, academic_year_id, level_id, name) values
  ('$GROUP_BULK_ARCH', '$ACADEMY', '$YEAR', 'grade-10', 'Race bulk A'),
  ('$GROUP_BULK_MOVE', '$ACADEMY', '$YEAR', 'grade-10', 'Race bulk B'),
  ('$GROUP_IMPORT', '$ACADEMY', '$YEAR', 'grade-10', 'Race import');
SQL
student_row() { # $1 ordinal, $2 name, $3 phone, $4 optional group name
  local group=""; [ -n "${4:-}" ] && group=",\"group\":\"$4\""
  echo "{\"ordinal\":$1,\"source_row\":$1,\"values\":{\"full_name\":\"$2\",\"student_phone\":\"$3\",\"parent_phone\":\"01112223333\"$group}}"
}
make_import() { # $1 file name, $2 JSON rows; prints the confirmed session id
  psqlx -tA <<SQL | grep -E '^[0-9a-f-]{36}$' | tail -1
begin; $as_admin
select set_config('race.s', public.start_student_import('$ACADEMY', '$YEAR', '$1', 'json', null, jsonb_array_length('$2'::jsonb),
  '{"level_id": "grade-10", "participation_type": "in_person"}', null)::text, true);
select public.stage_student_import_rows(current_setting('race.s')::uuid, '$2'::jsonb);
select public.confirm_student_import(current_setting('race.s')::uuid, public.finalize_student_import(current_setting('race.s')::uuid));
select current_setting('race.s');
commit;
SQL
}
process() { echo "$as_admin select public.process_student_import_batch('$1', 0);"; }
academy_phones() { echo "select count(*) from public.annual_student_records where academy_id = '$ACADEMY' and student_phone in ($1)"; }

# 7. Two tabs submit the same batch; the second waits on the session lock and creates nothing more.
S7="$(make_import 'Race overlap' "[$(student_row 1 'Overlap 1' 01088880001),$(student_row 2 'Overlap 2' 01088880002)]")"
[ -n "$S7" ] || fail "could not prepare the overlapping import"
hold 7a 7b "$(process "$S7")"
start 7b "$(process "$S7")"
wait
expect_ok 7a "the first batch submission failed"
expect_ok 7b "a repeated batch failed"
psqlx -tA -c "$(academy_phones "'+201088880001', '+201088880002'")" | grep -qx 2 \
  || fail "overlapping batch submissions created duplicate records"
psqlx -tA -c "select state || ':' || created_count from public.student_import_sessions where id = '$S7'" | grep -qx 'completed:2' \
  || fail "overlapping batch submissions left the session inconsistent"

# 8. Two imports with the same student phone run at once; one creates it and the other skips it.
S8A="$(make_import 'Race dup A' "[$(student_row 1 'Import dup A' 01099990001)]")"
S8B="$(make_import 'Race dup B' "[$(student_row 1 'Import dup B' '+20 10 9999 0001')]")"
[ -n "$S8A" ] && [ -n "$S8B" ] || fail "could not prepare the duplicate imports"
hold 8a 8b "$(process "$S8A")"
start 8b "$(process "$S8B")"
wait
expect_ok 8a "the first duplicate import failed"
expect_ok 8b "a concurrent duplicate import errored instead of skipping"
psqlx -tA -c "$(academy_phones "'+201099990001'")" | grep -qx 1 \
  || fail "concurrent imports created the same student phone twice"
psqlx -tA -c "select outcome || ':' || outcome_code from public.student_import_rows where session_id = '$S8B'" | grep -qx 'skipped:duplicate_existing' \
  || fail "the losing import did not record a duplicate skip"

# 9. A group archive and a bulk move into it race; whichever commits first wins.
new_student() { # $1 name, $2 phone, $3 group id or null; prints the record id
  printf 'begin; %s %s commit;\n' "$as_admin" "$(create_student "$1" "$2" "$3" | sed 's/^select /select id from /')" \
    | psqlx -tA | grep -E '^[0-9a-f-]{36}$'
}
R9A="$(new_student 'Bulk race A' 01077770001 null)"
R9B="$(new_student 'Bulk race B' 01077770002 null)"
[ -n "$R9A" ] && [ -n "$R9B" ] || fail "could not create bulk race students"
move() { echo "$as_admin select public.set_student_records_group('$ACADEMY', '$YEAR', '[{\"id\":\"$1\",\"version\":1}]', '$2');"; }
hold 9a 9b "$as_admin $(archive "$GROUP_BULK_ARCH")"
start 9b "$(move "$R9A" "$GROUP_BULK_ARCH")"
wait
expect_ok 9a "the archive holding the group lock failed"
expect_rejected 9b "students moved into a group archived concurrently"
hold 9c 9d "$(move "$R9B" "$GROUP_BULK_MOVE")"
start 9d "$as_admin $(archive "$GROUP_BULK_MOVE")"
wait
expect_ok 9c "the bulk move holding the group lock failed"
expect_rejected 9d "group archived despite a concurrent bulk move into it"
psqlx -tA -c "select count(*) from public.annual_student_records where id = '$R9B' and primary_group_id = '$GROUP_BULK_MOVE'" | grep -qx 1 \
  || fail "the bulk move that won is missing"

# 10. A group archived while an import batch waits turns that row into a failure, not a batch error.
S10="$(make_import 'Race import group' "[$(student_row 1 'Import placed' 01066660001 'Race import'),$(student_row 2 'Import plain' 01066660002)]")"
[ -n "$S10" ] || fail "could not prepare the group import"
hold 10a 10b "$as_admin $(archive "$GROUP_IMPORT")"
start 10b "$(process "$S10")"
wait
expect_ok 10a "the archive holding the group lock failed"
expect_ok 10b "a concurrent group archive failed the whole batch"
psqlx -tA -c "select string_agg(outcome || ':' || coalesce(outcome_code, ''), ',' order by ordinal) from public.student_import_rows where session_id = '$S10'" \
  | grep -qx 'failed:invalid_placement,created:' || fail "the archived group's row was not recorded as a failure"

# 11. Student code settings: two first saves race; exactly one wins and the other is stale.
save_codes() { echo "$as_admin select public.save_student_code_settings('$ACADEMY', $1, $2, '####', '[]');"; }
hold 11a 11b "$(save_codes 0 true)"
start 11b "$(save_codes 0 false)"
wait
expect_ok 11a "the first student code save failed"
expect_rejected 11b "concurrent first student code saves did not produce one stale save" stale_settings
psqlx -tA -c "select enabled::text || ':' || version from public.student_code_settings where academy_id = '$ACADEMY'" | grep -qx 'true:1' \
  || fail "the winning student code save is missing"

# 12. An in-flight issuer holds the settings share lock; a concurrent disable waits for it, and an
#     issue attempted after the disable commits is rejected.
issue() { # $1 record, $2 code
  echo "insert into public.student_code_assignments (academy_id, academic_year_id, academy_student_profile_id, annual_student_record_id, level_id, code, code_version, issued_by)
    select academy_id, academic_year_id, academy_student_profile_id, id, level_id, '$2', 1, '$ADMIN' from public.annual_student_records where id = '$1';"
}
R12="$(new_student 'Code race' 01055550001 null)"
[ -n "$R12" ] || fail "could not create the code race student"
hold 12a 12b "$(issue "$R12" 0001)"
start 12b "$(save_codes 1 false)"
wait
expect_ok 12a "the in-flight issuer failed"
expect_ok 12b "the disable waiting on the issuer failed"
run 12c "$(issue "$R12" 0002)"
expect_rejected 12c "a code was issued after disable, or failed for the wrong reason" codes_disabled

# 13. Two issuers race for the same never-issued string on different records: exactly one wins, the
#     other fails at the reservation registry, and the string stays reserved.
psqlx -c "begin; $(save_codes 2 true) commit;"
R13A="$(new_student 'Reserve race A' 01055550013 null)"
R13B="$(new_student 'Reserve race B' 01055550014 null)"
[ -n "$R13A" ] && [ -n "$R13B" ] || fail "could not create the reservation race students"
hold 13a 13b "$(issue "$R13A" 0130)"
start 13b "$(issue "$R13B" 0130)"
wait
expect_ok 13a "the first issuer of the shared code failed"
expect_rejected 13b "concurrent issuers of one code did not produce exactly one winner" code_taken

# 14-16. Code check-in races. A live session with coded students; each case holds a conflicting
#     change open while a scan arrives, then the scan must observe the committed result.
GROUP_SCAN="$(uuid)"
psqlx -c "insert into public.groups (id, academy_id, academic_year_id, level_id, name) values ('$GROUP_SCAN', '$ACADEMY', '$YEAR', 'grade-10', 'Scan race');"
R14="$(new_student 'Scan race one' 01055550021 "$GROUP_SCAN")"
R15="$(new_student 'Scan race two' 01055550022 "$GROUP_SCAN")"
R16="$(new_student 'Scan race three' 01055550023 "$GROUP_SCAN")"
[ -n "$R14" ] && [ -n "$R15" ] && [ -n "$R16" ] || fail "could not create the scan race students"
SCHED_SCAN="$(psqlx -tA <<SQL | grep -E '^[0-9a-f-]{36}$' | tail -1
begin; $as_admin
select public.create_schedule('$ACADEMY','$YEAR','Scan race weekly','recurring','group','$GROUP_SCAN',null,null,true,null,
  '[{"weekday":1,"startsAt":"17:00","endsAt":"18:30"}]'::jsonb, '[]'::jsonb);
commit;
SQL
)"
SESSION_SCAN="$(psqlx -tA <<SQL | grep -E '^[0-9a-f-]{36}$' | tail -1
begin; $as_admin
select session_id from public.start_session('$ACADEMY', '$SCHED_SCAN', '$(uuid)');
commit;
SQL
)"
[ -n "$SESSION_SCAN" ] || fail "could not start the scan race session"
assign_code() { echo "select public.change_student_code('$ACADEMY','$1','assign','$2',0,gen_random_uuid());"; }
psqlx -c "begin; $as_admin $(assign_code "$R14" 0140) $(assign_code "$R15" 0150) $(assign_code "$R16" 0160) commit;"
scan() { echo "$as_admin select public.check_in_attendance_by_code('$ACADEMY','$SESSION_SCAN','$1',gen_random_uuid(),null);"; }

# 14. A retirement holds the record lock; a concurrent scan waits, then is rejected as retired.
hold 14a 14b "$as_admin select public.change_student_code('$ACADEMY','$R14','retire',null,1,gen_random_uuid());"
start 14b "$(scan 0140)"
wait
expect_ok 14a "the retirement holding the record lock failed"
expect_rejected 14b "a scan checked in a holder retired concurrently" student_code_retired
psqlx -tA -c "select count(*) from public.attendance_records where session_id = '$SESSION_SCAN' and annual_student_record_id = '$R14'" | grep -qx 0 \
  || fail "attendance was written for a retired code"

# 15. A non-level edit holds the record lock; the scan waits and then succeeds (only a real level
#     change retires a code; that path is covered in student_code_checkin.sql).
hold 15a 15b "update public.annual_student_records set level_id = 'grade-10', student_phone = '01055559999' where id = '$R15';"
start 15b "$(scan 0150)"
wait
expect_ok 15a "the contact edit holding the record lock failed"
expect_ok 15b "a contact edit must not block a scan"

# 16. Disabling holds the settings lock; a concurrent scan waits and then fails as disabled.
hold 16a 16b "$(save_codes 3 false)"
start 16b "$(scan 0160)"
wait
expect_ok 16a "the disable holding the settings lock failed"
expect_rejected 16b "a scan ran against codes disabled concurrently" student_codes_disabled

# 17. Two instructors scanning the same student at once: one records, the other sees already recorded.
psqlx -c "begin; $(save_codes 4 true) commit;"
start 17a "$(scan 0160)"
start 17b "$(scan 0160)"
wait
expect_ok 17a "a simultaneous scan failed"
expect_ok 17b "a simultaneous scan failed"
psqlx -tA -c "select version || ':' || status from public.attendance_records where session_id = '$SESSION_SCAN' and annual_student_record_id = '$R16'" | grep -qx '1:present' \
  || fail "simultaneous scans wrote the student more than once"

echo "concurrency checks passed"
