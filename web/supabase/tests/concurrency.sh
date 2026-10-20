#!/usr/bin/env bash
# Separate-session race tests for staff access, schedule/group/slot, student-record, import,
# student-code, check-in, attendance-correction, quiz and exam locking. Run only through `npm run test:db`, which validates the isolated target and
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
insert into public.academy_levels (academy_id, level_id, sort_order) values ('$ACADEMY', 'secondary-1', 10);
insert into public.groups (id, academy_id, academic_year_id, level_id, name) values
  ('$GROUP_ARCH', '$ACADEMY', '$YEAR', 'secondary-1', 'Race A'),
  ('$GROUP_SCHED', '$ACADEMY', '$YEAR', 'secondary-1', 'Race B');
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

# S1-S4. Staff access races. Membership changes take the target advisory lock, then the actor and
# target rows in user_id order; acceptance takes the recipient advisory lock, then the creator row.
as_user() { echo "set local role authenticated; set local request.jwt.claim.sub = '$1';"; }
phone() { echo "2010$(od -An -N4 -tu4 /dev/urandom | tr -d ' ' | tail -c 9 | sed -e :a -e 's/^.\{1,7\}$/0&/;ta')"; }
token() { od -An -N22 -tx1 /dev/urandom | tr -d ' \n' | cut -c1-43; }
HEAD1="$(uuid)"; HEAD2="$(uuid)"; STAFF_ADMIN="$(uuid)"; STAFF_INST="$(uuid)"; RECIPIENT1="$(uuid)"; RECIPIENT2="$(uuid)"
RPHONE1="$(phone)"; RPHONE2="$(phone)"; TOKEN1="$(token)"; TOKEN2="$(token)"
psqlx <<SQL
insert into auth.users (id) values ('$HEAD1'), ('$HEAD2'), ('$STAFF_ADMIN'), ('$STAFF_INST');
insert into auth.users (id, phone, phone_confirmed_at) values ('$RECIPIENT1', '$RPHONE1', now()), ('$RECIPIENT2', '$RPHONE2', now());
insert into public.academy_memberships (academy_id, user_id, role, created_by) values
  ('$ACADEMY', '$HEAD1', 'head_admin', '$ADMIN'), ('$ACADEMY', '$HEAD2', 'head_admin', '$ADMIN'),
  ('$ACADEMY', '$STAFF_ADMIN', 'admin', '$ADMIN'), ('$ACADEMY', '$STAFF_INST', 'instructor', '$ADMIN');
SQL
psqlx -c "begin; $(as_user "$STAFF_ADMIN") select public.create_staff_invitation('$ACADEMY', '+$RPHONE1', 'instructor', '$TOKEN1', 'race-1'); commit;" | grep -q created \
  || fail "could not create the race invitation for S1"
psqlx -c "begin; $(as_user "$HEAD1") select public.create_staff_invitation('$ACADEMY', '+$RPHONE2', 'instructor', '$TOKEN2', 'race-2'); commit;" | grep -q created \
  || fail "could not create the race invitation for S2"
member_state() { psqlx -tA -c "select role || ':' || (suspended_at is not null) from public.academy_memberships where academy_id = '$ACADEMY' and user_id = '$1'"; }

# S1. Suspending the creator holds their row; a concurrent acceptance of their invitation waits and
#     then finds the creator without authority. No membership is created.
hold s1a s1b "$as_admin select public.suspend_staff_member('$ACADEMY', '$STAFF_ADMIN');"
start s1b "$(as_user "$RECIPIENT1") select public.accept_staff_invitation('$TOKEN1');"
wait
expect_ok s1a "the suspension holding the creator row failed"
expect_ok s1b "an acceptance waiting on the creator failed"
grep -q inviter_unavailable "$OUT/s1b" || fail "an invitation from a creator suspended concurrently was accepted: $(out s1b)"
[ -z "$(member_state "$RECIPIENT1")" ] || fail "acceptance created a membership from a suspended creator"
psqlx -c "begin; $as_admin select public.restore_staff_member('$ACADEMY', '$STAFF_ADMIN'); commit;" | grep -q restored \
  || fail "could not restore the S1 creator"

# S2. Acceptance holds the creator row; a concurrent suspension of the creator waits, then applies.
#     The completed acceptance stands.
hold s2a s2b "$(as_user "$RECIPIENT2") select public.accept_staff_invitation('$TOKEN2');"
start s2b "$as_admin select public.suspend_staff_member('$ACADEMY', '$HEAD1');"
wait
expect_ok s2a "the acceptance holding the creator row failed"
expect_ok s2b "a suspension waiting on an acceptance failed"
grep -q joined "$OUT/s2a" || fail "the acceptance did not join: $(out s2a)"
grep -q suspended "$OUT/s2b" || fail "the creator was not suspended after the acceptance: $(out s2b)"
[ "$(member_state "$RECIPIENT2")" = "instructor:false" ] || fail "the accepted membership is wrong: $(member_state "$RECIPIENT2")"
psqlx -c "begin; $as_admin select public.restore_staff_member('$ACADEMY', '$HEAD1'); commit;" | grep -q restored \
  || fail "could not restore the S2 creator"

# S3. Two Head Admins target each other at once. Both are refused (peers), and the opposing row
#     locks are taken in one order, so neither deadlocks.
hold s3a s3b "$(as_user "$HEAD1") select public.suspend_staff_member('$ACADEMY', '$HEAD2');"
start s3b "$(as_user "$HEAD2") select public.suspend_staff_member('$ACADEMY', '$HEAD1');"
wait
expect_ok s3a "a peer suspension attempt failed instead of being refused"
expect_ok s3b "an opposing peer suspension attempt failed instead of being refused"
grep -q forbidden "$OUT/s3a" && grep -q forbidden "$OUT/s3b" || fail "a Head Admin managed a peer: $(out s3a) $(out s3b)"
[ "$(member_state "$HEAD1"),$(member_state "$HEAD2")" = "head_admin:false,head_admin:false" ] \
  || fail "peer Head Admins changed: $(member_state "$HEAD1"),$(member_state "$HEAD2")"

# S4. The Owner demotes an Admin while a Head Admin suspends them: the suspension waits, then
#     applies to the demoted member. The role change does not restore access and nothing is lost.
hold s4a s4b "$as_admin select public.change_staff_member_role('$ACADEMY', '$STAFF_ADMIN', 'instructor');"
start s4b "$(as_user "$HEAD2") select public.suspend_staff_member('$ACADEMY', '$STAFF_ADMIN');"
start s4c "$(as_user "$STAFF_ADMIN") select public.suspend_staff_member('$ACADEMY', '$STAFF_INST');"
wait
expect_ok s4a "the role change holding the member row failed"
expect_ok s4b "a suspension waiting on a role change failed"
expect_ok s4c "an action by the member being changed failed instead of being decided"
grep -q suspended "$OUT/s4b" || fail "the demoted member was not suspended: $(out s4b)"
[ "$(member_state "$STAFF_ADMIN")" = "instructor:true" ] || fail "role change and suspension did not both apply: $(member_state "$STAFF_ADMIN")"

# 3. Two sessions each delete a different slot of a two-slot schedule; one must be rejected.
psqlx >/dev/null <<SQL
begin; $as_admin
select public.create_schedule('$ACADEMY','$YEAR','Race slots','recurring','level',null,'secondary-1',null,true,null,
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
  ('$GROUP_STUDENT_ARCH', '$ACADEMY', '$YEAR', 'secondary-1', 'Race students A'),
  ('$GROUP_STUDENT_PLACE', '$ACADEMY', '$YEAR', 'secondary-1', 'Race students B');
SQL
create_student() { # $1 name, $2 student phone, $3 group id or null
  local group="null"; [ "$3" != null ] && group="'$3'"
  echo "select public.create_student_record('$ACADEMY','$YEAR','$1','$2','01112223333','secondary-1',null,$group,'in_person');"
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
  ('$GROUP_BULK_ARCH', '$ACADEMY', '$YEAR', 'secondary-1', 'Race bulk A'),
  ('$GROUP_BULK_MOVE', '$ACADEMY', '$YEAR', 'secondary-1', 'Race bulk B'),
  ('$GROUP_IMPORT', '$ACADEMY', '$YEAR', 'secondary-1', 'Race import');
SQL
student_row() { # $1 ordinal, $2 name, $3 phone, $4 optional group name
  local group=""; [ -n "${4:-}" ] && group=",\"group\":\"$4\""
  echo "{\"ordinal\":$1,\"source_row\":$1,\"values\":{\"full_name\":\"$2\",\"student_phone\":\"$3\",\"parent_phone\":\"01112223333\"$group}}"
}
make_import() { # $1 file name, $2 JSON rows; prints the confirmed session id
  psqlx -tA <<SQL | grep -E '^[0-9a-f-]{36}$' | tail -1
begin; $as_admin
select set_config('race.s', public.start_student_import('$ACADEMY', '$YEAR', '$1', 'json', null, jsonb_array_length('$2'::jsonb),
  '{"level_id": "secondary-1", "participation_type": "in_person"}', null)::text, true);
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
psqlx -c "insert into public.groups (id, academy_id, academic_year_id, level_id, name) values ('$GROUP_SCAN', '$ACADEMY', '$YEAR', 'secondary-1', 'Scan race');"
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
hold 15a 15b "update public.annual_student_records set level_id = 'secondary-1', student_phone = '+201055559999' where id = '$R15';"
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

# 18-21. Session archival races. Archival locks the session row first, like every attendance write.
new_session() { # $1 title; prints the session id of a fresh live session on a fresh schedule
  local sched
  sched="$(psqlx -tA <<SQL | grep -E '^[0-9a-f-]{36}$' | tail -1
begin; $as_admin
select public.create_schedule('$ACADEMY','$YEAR','$1','recurring','group','$GROUP_SCAN',null,null,true,null,
  '[{"weekday":2,"startsAt":"17:00","endsAt":"18:30"}]'::jsonb, '[]'::jsonb);
commit;
SQL
)"
  echo "$sched" >"$OUT/schedule-$1"
  psqlx -tA <<SQL | grep -E '^[0-9a-f-]{36}$' | tail -1
begin; $as_admin
select session_id from public.start_session('$ACADEMY', '$sched', '$(uuid)');
commit;
SQL
}
archive_now() { echo "$as_admin select public.archive_session('$ACADEMY','$1',(select metadata_version from public.sessions where id = '$1'),gen_random_uuid());"; }
uuid_check_in() { echo "$as_admin select public.check_in_attendance('$ACADEMY','$1','$2',gen_random_uuid());"; }
archived() { psqlx -tA -c "select archived_at is not null from public.sessions where id = '$1'" | grep -qx t; }

# 18. Archive holds the session lock; a concurrent check-in waits and is rejected as archived.
S18="$(new_session 'Archive race 18')"
[ -n "$S18" ] || fail "could not start the archive race session 18"
hold 18a 18b "$(archive_now "$S18")"
start 18b "$(uuid_check_in "$S18" "$R15")"
wait
expect_ok 18a "the archive holding the session lock failed"
expect_rejected 18b "a check-in was written to a session archived concurrently" session_archived
psqlx -tA -c "select count(*) from public.attendance_records where session_id = '$S18'" | grep -qx 0 \
  || fail "attendance was written after archival"

# 19. Finalization holds the session lock; a concurrent archive waits, then archives and stops the
#     effects that finalization created. No effect stays deliverable.
S19="$(new_session 'Archive race 19')"
[ -n "$S19" ] || fail "could not start the archive race session 19"
psqlx -c "begin; $(uuid_check_in "$S19" "$R15") commit;" >/dev/null
hold 19a 19b "$as_admin select public.publish_attendance('$ACADEMY','$S19',1,gen_random_uuid());"
start 19b "$(archive_now "$S19")"
wait
expect_ok 19a "the finalization holding the session lock failed"
expect_ok 19b "the archive waiting on finalization failed"
archived "$S19" || fail "the session was not archived after finalization"
psqlx -tA -c "select count(*) from public.attendance_effects e where e.session_id = '$S19'
  and not exists (select 1 from public.attendance_effect_suppressions x where x.effect_id = e.id)" | grep -qx 0 \
  || fail "an effect created by a concurrent finalization escaped archival"

# 20. Archive holds the live session; a concurrent end reports already ended and a concurrent start
#     with a new key waits and starts a new live session instead of returning the archived one.
S20="$(new_session 'Archive race 20')"
[ -n "$S20" ] || fail "could not start the archive race session 20"
SCHED20="$(cat "$OUT/schedule-Archive race 20")"
hold 20a 20b "$(archive_now "$S20")"
start 20b "$as_admin select public.end_session('$ACADEMY','$S20');"
start 20c "$as_admin select session_id, outcome from public.start_session('$ACADEMY','$SCHED20','$(uuid)');"
wait
expect_ok 20a "the archive holding the session lock failed"
expect_ok 20b "a concurrent end failed"
expect_ok 20c "a concurrent start failed"
grep -q already_ended "$OUT/20b" || fail "a concurrent end did not see the archived session as ended: $(out 20b)"
grep -q started "$OUT/20c" && ! grep -q "$S20" "$OUT/20c" || fail "a concurrent start returned the archived session: $(out 20c)"
psqlx -tA -c "select count(*) from public.sessions where schedule_id = '$SCHED20' and state = 'live'" | grep -qx 1 \
  || fail "the schedule does not have exactly one new live session"

# 21. A future effect consumer holds its claim (session share lock); a concurrent archive waits,
#     then stops nothing that was already claimed and dispatched, and a later claim gets nothing.
S21="$(new_session 'Archive race 21')"
[ -n "$S21" ] || fail "could not start the archive race session 21"
psqlx -c "begin; $(uuid_check_in "$S21" "$R15") $as_admin select public.publish_attendance('$ACADEMY','$S21',1,gen_random_uuid()); commit;" >/dev/null
E21="$(psqlx -tA -c "select id from public.attendance_effects where session_id = '$S21' limit 1")"
[ -n "$E21" ] || fail "no effect to claim for race 21"
hold 21a 21b "select (edra_private.claim_attendance_effect('$E21')).id; update public.attendance_effects set processed_at = now() where id = '$E21';"
start 21b "$(archive_now "$S21")"
wait
expect_ok 21a "the claim holding the session share lock failed"
expect_ok 21b "the archive waiting on a claim failed"
grep -q "$E21" "$OUT/21a" || fail "the in-flight claim did not get the pending effect: $(out 21a)"
psqlx -tA -c "select count(*) from public.attendance_effect_suppressions where effect_id = '$E21'" | grep -qx 0 \
  || fail "archival suppressed an effect that was already dispatched"
psqlx -tA -c "select edra_private.claim_attendance_effect('$E21') is null" | grep -qx t \
  || fail "a dispatched effect could be claimed again"

# 34-36. Attendance correction races. Every command takes the session row first.
# 34. Two adds of the same unexpected attendee: one appends, the other waits and reports the existing
#     entry. Exactly one roster snapshot exists.
S34="$(new_session 'Attendee race 34')"
[ -n "$S34" ] || fail "could not start the attendee race session 34"
hold 34a 34b "$as_admin select public.add_session_attendee('$ACADEMY','$S34','$R12',0,gen_random_uuid());"
start 34b "$as_admin select public.add_session_attendee('$ACADEMY','$S34','$R12',0,gen_random_uuid());"
wait
expect_ok 34a "the add holding the session lock failed"
expect_ok 34b "a concurrent duplicate add failed"
grep -q '"added"' "$OUT/34a" || fail "the first add did not append: $(out 34a)"
grep -q already_on_roster "$OUT/34b" || fail "a concurrent duplicate add did not report the existing entry: $(out 34b)"
psqlx -tA -c "select count(*) from public.session_roster_entries where session_id = '$S34' and annual_student_record_id = '$R12' and origin = 'unexpected'" | grep -qx 1 \
  || fail "duplicate adds did not produce exactly one unexpected roster entry"

# 35. All-remaining absence holds the session; a concurrent manual edit made against version 0
#     waits, then conflicts. The unexpected attendee from an add is never marked absent.
S35="$(new_session 'Absence race 35')"
[ -n "$S35" ] || fail "could not start the absence race session 35"
psqlx -c "begin; $as_admin select public.add_session_attendee('$ACADEMY','$S35','$R12',0,gen_random_uuid()); commit;" >/dev/null
hold 35a 35b "$as_admin select public.mark_unrecorded_absent('$ACADEMY','$S35',1,gen_random_uuid());"
start 35b "$as_admin select public.apply_attendance_changes('$ACADEMY','$S35','[{\"annual_student_record_id\":\"$R14\",\"status\":\"present\",\"expected_version\":0}]'::jsonb,'set',gen_random_uuid());"
wait
expect_ok 35a "the absence command holding the session lock failed"
expect_ok 35b "a concurrent manual edit failed"
grep -q '"updated"' "$OUT/35a" || fail "the absence command did not apply: $(out 35a)"
grep -q conflict "$OUT/35b" || fail "a manual edit over a concurrent absence did not conflict: $(out 35b)"
psqlx -tA -c "select status from public.attendance_records where session_id = '$S35' and annual_student_record_id = '$R14'" | grep -qx absent \
  || fail "the absence command result was overwritten"
psqlx -tA -c "select count(*) from public.attendance_records where session_id = '$S35' and annual_student_record_id = '$R12'" | grep -qx 0 \
  || fail "the unexpected attendee was marked absent"

# 36. A Late check-in holds the session; a concurrent finalization of the reviewed revision waits,
#     then publishes Late. No transient Present is ever official.
S36="$(new_session 'Late race 36')"
[ -n "$S36" ] || fail "could not start the late race session 36"
psqlx >/dev/null -c "begin; set local session_replication_role = replica; update public.sessions set started_at = started_at - interval '30 minutes' where id = '$S36'; commit;"
hold 36a 36b "$as_admin select public.check_in_attendance_with_late('$ACADEMY','$S36','$R14',gen_random_uuid(),10);"
start 36b "$as_admin select public.publish_attendance('$ACADEMY','$S36',1,gen_random_uuid());"
wait
expect_ok 36a "the Late check-in holding the session lock failed"
expect_ok 36b "the finalization waiting on the check-in failed"
psqlx -tA -c "select status || ':' || coalesce(published_status::text, '-') from public.attendance_records where session_id = '$S36' and annual_student_record_id = '$R14'" | grep -qx late:late \
  || fail "finalization did not publish the atomic Late check-in"

# Quiz student phones use a separate range from the import fixtures above.
# 22-25. Quiz races. Per-student commands take the quiz key-share lock and the student's work row;
#     quiz-wide commands (corrections, closure settlement) take the quiz exclusively.
QUIZ="$(uuid)"
QR1="$(new_student 'Quiz race 1' 01088880021 null)"
QR2="$(new_student 'Quiz race 2' 01088880022 null)"
[ -n "$QR1" ] && [ -n "$QR2" ] || fail "could not create quiz race students"
psqlx >/dev/null <<SQL
begin; $as_admin
select public.create_quiz('$ACADEMY','$YEAR','$QUIZ','{"title":"Race quiz","audience":"level","level_id":"secondary-1","parts":[{"title":"P","kind":"question_sheet","questions":[{"prompt":"Q","max_score":"1","choices":[{"label":"A","is_correct":true},{"label":"B"}]}]}]}');
select public.configure_quiz_availability('$ACADEMY','$QUIZ',1,now() - interval '1 minute',now() + interval '1 hour');
commit;
SQL
QQ="$(psqlx -tA -c "select id from public.quiz_questions where quiz_id = '$QUIZ'")"
QCA="$(psqlx -tA -c "select id from public.quiz_choices where question_id = '$QQ' and position = 1")"
QCB="$(psqlx -tA -c "select id from public.quiz_choices where question_id = '$QQ' and position = 2")"
[ -n "$QQ" ] && [ -n "$QCA" ] && [ -n "$QCB" ] || fail "could not create the race quiz"

# 22. Two students start at once: both record work-start on the quiz row without deadlocking.
hold 22a 22b "select edra_private.start_quiz_attempt_for('$QUIZ','$QR1');"
start 22b "select edra_private.start_quiz_attempt_for('$QUIZ','$QR2');"
wait
expect_ok 22a "the first concurrent quiz start failed"
expect_ok 22b "the second concurrent quiz start failed"
psqlx -tA -c "select count(*) from public.quiz_attempts where quiz_id = '$QUIZ'" | grep -qx 2 || fail "concurrent starts did not create one attempt each"

# 23. Physical confirmation holds the student's work row; the student's concurrent final online
#     submission waits and reports source_conflict. Exactly one (physical) submission exists.
hold 23a 23b "$as_admin select public.confirm_quiz_physical('$ACADEMY','$QUIZ','$QR1',0,gen_random_uuid());"
start 23b "select edra_private.submit_quiz_attempt_for('$QUIZ','$QR1',gen_random_uuid());"
wait
expect_ok 23a "the physical confirmation holding the work row failed"
expect_ok 23b "the concurrent online submission failed"
grep -q source_conflict "$OUT/23b" || fail "the losing online submission did not report source_conflict: $(out 23b)"
psqlx -tA -c "select string_agg(source::text, ',') from public.quiz_submissions where quiz_id = '$QUIZ' and annual_student_record_id = '$QR1'" \
  | grep -qx physical || fail "the student does not have exactly one physical submission"

# 24. A key correction holds the quiz; an announcement prepared at the old scoring revision waits and
#     is rejected, so no result is published on a stale basis.
psqlx >/dev/null -c "select edra_private.save_quiz_answers_for('$QUIZ','$QR2',0,'[{\"question_id\":\"$QQ\",\"choice_id\":\"$QCA\"}]',gen_random_uuid());"
V24="$(psqlx -tA -c "select version from public.quiz_work where quiz_id = '$QUIZ' and annual_student_record_id = '$QR1'")"
hold 24a 24b "$as_admin select public.correct_quiz_key('$ACADEMY','$QUIZ','$QQ','$QCB',1,gen_random_uuid());"
start 24b "$as_admin select public.announce_quiz_results('$ACADEMY','$QUIZ',1,'[{\"annual_student_record_id\":\"$QR1\",\"expected_version\":$V24}]',gen_random_uuid());"
wait
expect_ok 24a "the correction holding the quiz failed"
expect_rejected 24b "an announcement on a stale scoring basis was accepted" stale_basis
psqlx -tA -c "select count(*) from public.quiz_result_publications where quiz_id = '$QUIZ' and annual_student_record_id = '$QR1'" | grep -qx 0 \
  || fail "a result was published on a stale scoring basis"

# 25. The worker settles actual closure while holding the quiz; a late answer save waits, then
#     reports finalized. The saved answer is unchanged and the effective time is the closure.
psqlx >/dev/null -c "update public.quizzes set opens_at = now() - interval '2 hours', closes_at = now() - interval '3 minutes', actual_closes_at = now() - interval '1 minute' where id = '$QUIZ';"
hold 25a 25b "select edra_private.settle_quiz_closure('$QUIZ');"
start 25b "select edra_private.save_quiz_answers_for('$QUIZ','$QR2',1,'[{\"question_id\":\"$QQ\",\"choice_id\":\"$QCB\"}]',gen_random_uuid());"
wait
expect_ok 25a "the closure settlement holding the quiz failed"
expect_ok 25b "the late answer save failed"
grep -q finalized "$OUT/25b" || fail "the late save did not report finalized: $(out 25b)"
psqlx -tA -c "select s.reason = 'window_closed' and s.submitted_at = z.actual_closes_at and a.choice_id = '$QCA'
  from public.quiz_submissions s join public.quizzes z on z.id = s.quiz_id
  join public.quiz_submission_answers a on a.submission_id = s.id
  where s.quiz_id = '$QUIZ' and s.annual_student_record_id = '$QR2'" | grep -qx t \
  || fail "the late save crossed the cutoff or the effective time is wrong"

# 27-33. Exam races. Same lock order as quizzes: year (share), exam row (key share for per-student
#     commands, for update for exam-wide ones), the student's record (share), the work row, the attempt.
EXAM="$(uuid)"
ER1="$(new_student 'Exam race 1' 01088880011 null)"
ER2="$(new_student 'Exam race 2' 01088880012 null)"
ER3="$(new_student 'Exam race 3' 01088880013 null)"
ER4="$(new_student 'Exam race 4' 01088880014 null)"
[ -n "$ER1" ] && [ -n "$ER2" ] && [ -n "$ER3" ] && [ -n "$ER4" ] || fail "could not create exam race students"
psqlx >/dev/null <<SQL
begin; $as_admin
select public.create_exam('$ACADEMY','$YEAR','$EXAM','{"title":"Race exam","audience":"level","level_id":"secondary-1","time_limit_minutes":60,"parts":[{"title":"P","kind":"question_sheet","questions":[{"prompt":"Q","max_score":"1","choices":[{"label":"A","is_correct":true},{"label":"B"}]}]}]}');
select public.configure_exam_availability('$ACADEMY','$EXAM',1,now() - interval '1 minute',now() + interval '1 hour');
commit;
SQL
EQ="$(psqlx -tA -c "select id from public.exam_questions where exam_id = '$EXAM'")"
ECA="$(psqlx -tA -c "select id from public.exam_choices where question_id = '$EQ' and position = 1")"
ECB="$(psqlx -tA -c "select id from public.exam_choices where question_id = '$EQ' and position = 2")"
[ -n "$EQ" ] && [ -n "$ECA" ] && [ -n "$ECB" ] || fail "could not create the race exam"

# 27. Two students start at once: both record work-start on the exam row without deadlocking.
hold 27a 27b "select edra_private.start_exam_attempt_for('$EXAM','$ER1');"
start 27b "select edra_private.start_exam_attempt_for('$EXAM','$ER2');"
wait
expect_ok 27a "the first concurrent exam start failed"
expect_ok 27b "the second concurrent exam start failed"
psqlx -tA -c "select count(*) from public.exam_attempts where exam_id = '$EXAM'" | grep -qx 2 || fail "concurrent exam starts did not create one attempt each"

# 28. Physical confirmation holds the work row; the concurrent online submission reports source_conflict.
hold 28a 28b "$as_admin select public.confirm_exam_physical('$ACADEMY','$EXAM','$ER1',0,gen_random_uuid());"
start 28b "select edra_private.submit_exam_attempt_for('$EXAM','$ER1',gen_random_uuid());"
wait
expect_ok 28a "the exam physical confirmation holding the work row failed"
expect_ok 28b "the concurrent exam online submission failed"
grep -q source_conflict "$OUT/28b" || fail "the losing exam online submission did not report source_conflict: $(out 28b)"
psqlx -tA -c "select string_agg(source::text, ',') from public.exam_submissions where exam_id = '$EXAM' and annual_student_record_id = '$ER1'" \
  | grep -qx physical || fail "the exam student does not have exactly one physical submission"

# 29. The other order: the online submission holds the work row; a concurrent physical confirmation
#     reports source_conflict and the saved online answer is the accepted work.
psqlx >/dev/null -c "select edra_private.save_exam_answers_for('$EXAM','$ER2',0,'[{\"question_id\":\"$EQ\",\"choice_id\":\"$ECA\"}]',gen_random_uuid());"
hold 29a 29b "select edra_private.submit_exam_attempt_for('$EXAM','$ER2',gen_random_uuid());"
start 29b "$as_admin select public.confirm_exam_physical('$ACADEMY','$EXAM','$ER2',0,gen_random_uuid());"
wait
expect_ok 29a "the exam online submission holding the work row failed"
expect_ok 29b "the concurrent exam physical confirmation failed"
grep -q source_conflict "$OUT/29b" || fail "the losing physical confirmation did not report source_conflict: $(out 29b)"
psqlx -tA -c "select string_agg(source::text || ':' || reason::text, ',') from public.exam_submissions where exam_id = '$EXAM' and annual_student_record_id = '$ER2'" \
  | grep -qx online:submitted || fail "the exam student does not have exactly one online submission"

# 30. A key correction holds the exam; an announcement prepared at the old scoring revision waits and is rejected.
V30="$(psqlx -tA -c "select version from public.exam_work where exam_id = '$EXAM' and annual_student_record_id = '$ER1'")"
hold 30a 30b "$as_admin select public.correct_exam_key('$ACADEMY','$EXAM','$EQ','$ECB',1,gen_random_uuid());"
start 30b "$as_admin select public.announce_exam_results('$ACADEMY','$EXAM',1,'[{\"annual_student_record_id\":\"$ER1\",\"expected_version\":$V30}]',gen_random_uuid());"
wait
expect_ok 30a "the exam correction holding the exam failed"
expect_rejected 30b "an exam announcement on a stale scoring basis was accepted" stale_basis
psqlx -tA -c "select count(*) from public.exam_result_publications where exam_id = '$EXAM' and annual_student_record_id = '$ER1'" | grep -qx 0 \
  || fail "an exam result was published on a stale scoring basis"

# 31. A placement move holds the student's record; a concurrent physical confirmation waits, then
#     finds the student outside the audience and accepts nothing.
psqlx >/dev/null -c "insert into public.academy_levels (academy_id, level_id, sort_order) values ('$ACADEMY', 'secondary-2', 11) on conflict do nothing;"
hold 31a 31b "update public.annual_student_records set level_id = 'secondary-2' where id = '$ER3';"
start 31b "$as_admin select public.confirm_exam_physical('$ACADEMY','$EXAM','$ER3',0,gen_random_uuid());"
wait
expect_ok 31a "the placement move holding the record failed"
expect_rejected 31b "a physical confirmation was accepted for a student moved out concurrently" not_eligible
psqlx -tA -c "select count(*) from public.exam_submissions where exam_id = '$EXAM' and annual_student_record_id = '$ER3'" | grep -qx 0 \
  || fail "work was accepted for a student who left the audience"

# 32. The worker settles actual closure while holding the exam; a late departure waits, then reports
#     finalized: the deadline wins, the departure count is unchanged and the reason is window_closed.
psqlx >/dev/null -c "select edra_private.start_exam_attempt_for('$EXAM','$ER4');"
psqlx >/dev/null -c "update public.exams set opens_at = now() - interval '2 hours', closes_at = now() - interval '3 minutes', actual_closes_at = now() - interval '1 minute' where id = '$EXAM';"
hold 32a 32b "select edra_private.settle_exam_closure('$EXAM');"
start 32b "select edra_private.record_exam_departure_for('$EXAM','$ER4',gen_random_uuid(),'$EQ');"
wait
expect_ok 32a "the exam closure settlement holding the exam failed"
expect_ok 32b "the late departure failed"
grep -q finalized "$OUT/32b" || fail "the late departure did not report finalized: $(out 32b)"
psqlx -tA -c "select s.reason = 'window_closed' and s.submitted_at = z.actual_closes_at and a.departure_count = 0
  from public.exam_submissions s join public.exams z on z.id = s.exam_id join public.exam_attempts a on a.id = s.attempt_id
  where s.exam_id = '$EXAM' and s.annual_student_record_id = '$ER4'" | grep -qx t \
  || fail "the late departure reclassified the closure submission"

# 33. Preparation holds a fresh exam exclusively; a concurrent first physical confirmation waits, then
#     confirms against the saved structure and locks it. Neither deadlocks.
EXAM2="$(uuid)"
psqlx >/dev/null -c "begin; $as_admin select public.create_exam('$ACADEMY','$YEAR','$EXAM2','{\"title\":\"Race exam 2\",\"audience\":\"level\",\"level_id\":\"secondary-1\",\"time_limit_minutes\":30,\"parts\":[{\"title\":\"P\",\"kind\":\"written_work\",\"questions\":[{\"prompt\":\"Q\",\"max_score\":\"2\"}]}]}'); commit;"
hold 33a 33b "$as_admin select public.update_exam('$ACADEMY','$EXAM2',1,'{\"title\":\"Race exam 2 (edited)\",\"audience\":\"level\",\"level_id\":\"secondary-1\",\"time_limit_minutes\":30,\"parts\":[{\"title\":\"P\",\"kind\":\"written_work\",\"questions\":[{\"prompt\":\"Q\",\"max_score\":\"3\"}]}]}');"
start 33b "$as_admin select public.confirm_exam_physical('$ACADEMY','$EXAM2','$ER2',0,gen_random_uuid());"
wait
expect_ok 33a "the preparation holding the exam failed"
expect_ok 33b "the first physical confirmation waiting on preparation failed"
grep -qi deadlock "$OUT/33a" "$OUT/33b" && fail "preparation and the first physical confirmation deadlocked"
psqlx -tA -c "select structure_locked_at is not null and max_score = 3 from public.exams where id = '$EXAM2'" | grep -qx t \
  || fail "the confirmation did not lock the saved structure"

# 46-47. Exam editor claims (EDRA-233). Claims lock the attempt row before the claim row, after the
#     usual year/exam/record/work order, so concurrent editors serialize on the attempt.
EXAM3="$(uuid)"
ER5="$(new_student 'Exam race 5' 01088880015 null)"
[ -n "$ER5" ] || fail "could not create the editor race student"
psqlx >/dev/null <<SQL
begin; $as_admin
select public.create_exam('$ACADEMY','$YEAR','$EXAM3','{"title":"Race exam 3","audience":"level","level_id":"secondary-1","time_limit_minutes":60,"parts":[{"title":"P","kind":"question_sheet","questions":[{"prompt":"Q","max_score":"1","choices":[{"label":"A","is_correct":true},{"label":"B"}]}]}]}');
select public.configure_exam_availability('$ACADEMY','$EXAM3',1,now() - interval '1 minute',now() + interval '1 hour');
commit;
SQL
EQ3="$(psqlx -tA -c "select id from public.exam_questions where exam_id = '$EXAM3'")"
ECA3="$(psqlx -tA -c "select id from public.exam_choices where question_id = '$EQ3' and position = 1")"
[ -n "$EQ3" ] && [ -n "$ECA3" ] || fail "could not create the editor race exam"
psqlx >/dev/null -c "select edra_private.start_exam_attempt_for('$EXAM3','$ER5');"
claims3="select string_agg(c.generation::text, ',') from public.exam_editor_claims c join public.exam_attempts a on a.id = c.attempt_id where a.exam_id = '$EXAM3'"

# 46. Two tabs claim the same attempt at once: the first holds the attempt row; the second waits, then
#     finds the live claim and is busy. Exactly one claim of generation 1 exists.
hold 46a 46b "select edra_private.claim_exam_editor_for('$EXAM3','$ER5',null);"
start 46b "select edra_private.claim_exam_editor_for('$EXAM3','$ER5',null);"
wait
expect_ok 46a "the first concurrent editor claim failed"
expect_ok 46b "the second concurrent editor claim failed"
grep -q '"claimed"' "$OUT/46a" || fail "the first editor did not claim: $(out 46a)"
grep -q '"busy"' "$OUT/46b" || fail "the second editor was not refused as busy: $(out 46b)"
psqlx -tA -c "$claims3" | grep -qx 1 || fail "concurrent claims did not leave exactly one generation-1 claim"
T46="$(grep -o '"token": "[0-9a-f]\{64\}"' "$OUT/46a" | grep -o '[0-9a-f]\{64\}')"
[ -n "$T46" ] || fail "the first editor's token was not returned"

# 47. After the lease expires, a recovering device claims generation 2 while the stale editor's save
#     waits on the attempt; the save then finds a replaced generation and writes nothing.
psqlx >/dev/null -c "update public.exam_editor_claims set expires_at = claimed_at where attempt_id = (select id from public.exam_attempts where exam_id = '$EXAM3' and annual_student_record_id = '$ER5');"
hold 47a 47b "select edra_private.claim_exam_editor_for('$EXAM3','$ER5',null);"
start 47b "select edra_private.save_my_exam_answers_for('$EXAM3','$ER5','$T46',0,'[{\"question_id\":\"$EQ3\",\"choice_id\":\"$ECA3\"}]',gen_random_uuid(),1);"
wait
expect_ok 47a "the recovering claim failed"
expect_ok 47b "the stale editor's save failed"
grep -q editor_lost "$OUT/47b" || fail "the stale editor's save was not fenced: $(out 47b)"
psqlx -tA -c "$claims3" | grep -qx 2 || fail "recovery did not create generation 2"
psqlx -tA -c "select answers_version from public.exam_attempts where exam_id = '$EXAM3' and annual_student_record_id = '$ER5'" | grep -qx 0 \
  || fail "a stale editor's save was accepted"
# Scenario 26 closes the year last, which is refused while an attempt is still running.
psqlx >/dev/null -c "select edra_private.submit_exam_attempt_for('$EXAM3','$ER5',gen_random_uuid());"

# 37-45. Assignment required cohorts/late eligibility. Keep assignment -> year -> recipient,
# with the annual-record lock before receiving first work and no reverse assignment lock on moves.
COHORT_A="$(uuid)"
COHORT_B="$(uuid)"
COHORT_C="$(uuid)"
COHORT_D="$(uuid)"
COHORT_E="$(uuid)"
cohort_draft='{"title":"Cohort race","audience":"level","level_id":"secondary-1","parts":[{"title":"P","kind":"file_upload","questions":[{"prompt":"","max_score":"2"}]}]}'
hold 37a 37b "$as_admin select public.create_assignment('$ACADEMY','$YEAR','$COHORT_A','$cohort_draft');"
start 37b "$as_admin $(create_student 'Cohort late concurrent' 01088880031 null)"
wait
expect_ok 37a "cohort capture failed"
expect_ok 37b "concurrent enrollment failed"
LATE34="$(psqlx -tA -c "select id from public.annual_student_records where academy_id='$ACADEMY' and student_phone='+201088880031'")"
psqlx -tA -c "select not exists(select 1 from public.assignment_cohort_members where assignment_id='$COHORT_A' and annual_student_record_id='$LATE34')
 and (edra_private.assignment_recipient_context('$COHORT_A','$LATE34')->>'eligible')::boolean" | grep -qx t || fail "late enrollment was required or was undiscoverable"

# 38. Audience change wins the assignment lock; first work for an excluded record is rejected.
hold 38a 38b "$as_admin select public.update_assignment('$ACADEMY','$COHORT_A',1,'$cohort_draft'::jsonb || '{\"level_id\":\"secondary-2\"}'::jsonb);"
start 38b "$as_admin select public.record_assignment_work('$ACADEMY','$COHORT_A','$ER2',1,'submitted',now(),'');"
wait
expect_ok 38a "audience reset failed"
expect_rejected 38b "work entered after audience reset excluded the student" not_recipient

# 39. First work wins; a simultaneous audience reset is refused and membership is retained.
psqlx >/dev/null -c "begin; $as_admin select public.create_assignment('$ACADEMY','$YEAR','$COHORT_B','$cohort_draft'); commit;"
hold 39a 39b "$as_admin select public.record_assignment_work('$ACADEMY','$COHORT_B','$ER2',1,'submitted',now(),'');"
start 39b "$as_admin select public.update_assignment('$ACADEMY','$COHORT_B',1,'$cohort_draft'::jsonb || '{\"level_id\":\"secondary-2\"}'::jsonb);"
wait
expect_ok 39a "first work holding the assignment failed"
expect_rejected 39b "audience reset removed a student whose work began concurrently" structure_locked
psqlx -tA -c "select work_status='submitted' from public.assignment_recipients where assignment_id='$COHORT_B' and annual_student_record_id='$ER2'" | grep -qx t || fail "first work lost after audience race"

# 40. Placement wins the annual row. First work sees the committed new placement; the requirement
#     ends without deleting the existing recipient. No assignment lock is taken by placement.
psqlx >/dev/null -c "begin; $as_admin select public.create_assignment('$ACADEMY','$YEAR','$COHORT_C','$cohort_draft'); commit;"
hold 40a 40b "update public.annual_student_records set level_id='secondary-2' where id='$ER1';"
start 40b "$as_admin select public.record_assignment_work('$ACADEMY','$COHORT_C','$ER1',1,'submitted',now(),'');"
wait
expect_ok 40a "placement exit holding annual record failed"
expect_rejected 40b "first work accepted after placement exit" not_recipient
psqlx -tA -c "select requirement_ended_at is not null from public.assignment_cohort_members where assignment_id='$COHORT_C' and annual_student_record_id='$ER1'" | grep -qx t || fail "unfinished requirement not ended"

# 41. Optional first marking holds the annual record; placement waits. After both commits its work
#     and mark survive and the required denominator remains exactly the captured count.
psqlx >/dev/null -c "begin; $as_admin select public.create_assignment('$ACADEMY','$YEAR','$COHORT_D','$cohort_draft'); commit;"
LATE38="$(new_student 'Optional mark race' 01088880032 null)"
PART38="$(psqlx -tA -c "select id from public.assignment_parts where assignment_id='$COHORT_D'")"
COUNT38="$(psqlx -tA -c "select recipient_count from public.assignments where id='$COHORT_D'")"
hold 41a 41b "$as_admin select public.save_assignment_marks('$ACADEMY','$COHORT_D','$LATE38',null,1,'{\"marks\":[{\"part_id\":\"$PART38\",\"score\":\"1\"}]}',gen_random_uuid());"
start 41b "update public.annual_student_records set level_id='secondary-2' where id='$LATE38';"
wait
expect_ok 41a "optional marking holding annual record failed"
expect_ok 41b "placement after optional marking failed"
psqlx -tA -c "select a.recipient_count=$COUNT38 and x.work_status='submitted' and m.score=1
 from public.assignments a join public.assignment_recipients x on x.assignment_id=a.id
 join public.assignment_marks m on m.assignment_id=x.assignment_id and m.annual_student_record_id=x.annual_student_record_id
 where a.id='$COHORT_D' and x.annual_student_record_id='$LATE38'" | grep -qx t || fail "placement erased optional work or changed required count"

# 42. A GET projection while start is uncommitted sees an overview; after commit it sees the same
#     started attempt's questions. Read transactions never create attempts or extend deadlines.
psqlx >/dev/null -c "begin; $as_admin select public.configure_exam_availability('$ACADEMY','$EXAM2',(select version from public.exams where id='$EXAM2'),now()-interval '1 minute',now()+interval '1 hour'); commit;"
# ER1 left secondary-1 in scenario 37; restore placement for this independent exam read/start race.
psqlx >/dev/null -c "update public.annual_student_records set level_id='secondary-1' where id='$ER1';"
hold 42a 42b "select edra_private.start_exam_attempt_for('$EXAM2','$ER1');"
start 42b "select edra_private.exam_student_state('$EXAM2','$ER1')->'parts';"
wait
expect_ok 42a "attempt start during projection race failed"
expect_ok 42b "projection during start failed"
grep -q '\[\]' "$OUT/42b" || fail "pre-commit projection exposed questions"
psqlx -tA -c "select jsonb_array_length(edra_private.exam_student_state('$EXAM2','$ER1')->'parts')=1" | grep -qx t || fail "committed own start did not reveal material"
psqlx >/dev/null -c "select edra_private.submit_exam_attempt_for('$EXAM2','$ER1',gen_random_uuid());"

# 43. An optional student's announcement and placement exit commit without a reverse lock or
#     changed result basis. Placement cannot turn the optional recipient into required work.
psqlx >/dev/null -c "update public.annual_student_records set level_id='secondary-1' where id='$LATE38';"
hold 43a 43b "$as_admin select public.publish_assignment_results('$ACADEMY','$COHORT_D','[{\"annual_student_record_id\":\"$LATE38\",\"expected_version\":2}]',gen_random_uuid());"
start 43b "update public.annual_student_records set level_id='secondary-2' where id='$LATE38';"
wait
expect_ok 43a "optional announcement failed during placement exit"
expect_ok 43b "placement exit failed during optional announcement"
psqlx -tA -c "select edra_private.assignment_recipient_json('$COHORT_D','$LATE38')->>'publication_state'='published'
 and not exists(select 1 from public.assignment_cohort_members where assignment_id='$COHORT_D' and annual_student_record_id='$LATE38')" | grep -qx t || fail "placement changed optional official history"

# 44. A staff contact edit wins the annual row while an existing-record completion is waiting.
#     Completion rechecks its locked match, reports changed, and links/creates no replacement profile.
USER41="$(uuid)"
RECORD41="$(new_student 'Invite contact race' 01088880024 null)"
psqlx >/dev/null <<SQL
insert into auth.users(id,phone,phone_confirmed_at) values('$USER41','201088880024',now());
update public.profiles set full_name='Invite race student' where id='$USER41';
insert into public.student_profiles(user_id,parent_phone,parent_phone_verified_at,level_id)
 values('$USER41','+201100000000',now(),'secondary-1');
SQL
TOKEN41="$(psqlx -tA -c "begin; $as_admin select public.set_student_invite('$ACADEMY',true)->>'inviteToken'; commit;" | tail -1)"
hold 44a 44b "update public.annual_student_records set student_phone='+201088880026' where id='$RECORD41';"
start 44b "set local role authenticated; set local request.jwt.claim.sub='$USER41'; select public.complete_student_invite('$TOKEN41',null,null);"
wait
expect_ok 44a "staff contact change failed"
expect_ok 44b "invite completion failed during contact change"
grep -q changed "$OUT/44b" || fail "stale existing-record confirmation did not report changed"
psqlx -tA -c "select not exists(select 1 from public.academy_student_profiles where academy_id='$ACADEMY' and user_id='$USER41')" | grep -qx t || fail "stale confirmation linked or created a profile"

# 45. Concurrent completions for one new student serialize on the existing academy/verified-phone
#     lock. A repeated completion gets connected, with one profile and one annual participation.
USER42="$(uuid)"
psqlx >/dev/null <<SQL
insert into auth.users(id,phone,phone_confirmed_at) values('$USER42','201088880025',now());
update public.profiles set full_name='Concurrent invite student' where id='$USER42';
insert into public.student_profiles(user_id,parent_phone,parent_phone_verified_at,level_id)
 values('$USER42','+201100000000',now(),'secondary-1');
SQL
hold 45a 45b "set local role authenticated; set local request.jwt.claim.sub='$USER42'; select public.complete_student_invite('$TOKEN41',null,null);"
start 45b "set local role authenticated; set local request.jwt.claim.sub='$USER42'; select public.complete_student_invite('$TOKEN41',null,null);"
wait
expect_ok 45a "first invite completion failed"
expect_ok 45b "concurrent invite retry failed"
grep -q connected "$OUT/45a" && grep -q connected "$OUT/45b" || fail "concurrent invitation completion did not connect both callers"
psqlx -tA -c "select count(*)=1 from public.academy_student_profiles p join public.annual_student_records r on r.academy_student_profile_id=p.id
 where p.academy_id='$ACADEMY' and p.user_id='$USER42' and r.academic_year_id='$YEAR'" | grep -qx t || fail "concurrent completion duplicated participation"

# Late optional assignment work must also queue behind and fail a year close (scenario 26).
psqlx >/dev/null -c "begin; $as_admin select public.create_assignment('$ACADEMY','$YEAR','$COHORT_E','$cohort_draft'); commit;"
LATE26="$(new_student 'Year-close optional' 01088880023 null)"

# 34. Assignment correction wins the assignment lock: an old-basis mark and announcement
#     both wait and then report stale, without applying any part of their commands.
ASSIGNMENT="$(uuid)"
psqlx >/dev/null -c "begin; $as_admin select public.create_assignment('$ACADEMY','$YEAR','$ASSIGNMENT','{\"title\":\"Scoring race\",\"audience\":\"level\",\"level_id\":\"secondary-1\",\"parts\":[{\"title\":\"P\",\"kind\":\"answer_sheet\",\"questions\":[{\"max_score\":\"2.5\",\"choices\":[{\"label\":\"\",\"is_correct\":true},{\"label\":\"\",\"is_correct\":false}]},{\"max_score\":\"1.5\",\"choices\":[{\"label\":\"\",\"is_correct\":true},{\"label\":\"\",\"is_correct\":false}]}]}]}'); commit;"
AP="$(psqlx -tA -c "select id from public.assignment_parts where assignment_id = '$ASSIGNMENT'")"
AQ="$(psqlx -tA -c "select id from public.assignment_part_questions where assignment_id = '$ASSIGNMENT' and position = 1")"
AQ2="$(psqlx -tA -c "select id from public.assignment_part_questions where assignment_id = '$ASSIGNMENT' and position = 2")"
ACB="$(psqlx -tA -c "select id from public.assignment_question_choices where question_id = '$AQ' and position = 2")"
psqlx >/dev/null -c "begin; $as_admin select public.save_assignment_marks('$ACADEMY','$ASSIGNMENT','$QR1',null,1,jsonb_build_object('marks',jsonb_build_array(jsonb_build_object('part_id','$AP','score','3.5'))),gen_random_uuid()); commit;"
AV="$(psqlx -tA -c "select version from public.assignment_recipients where assignment_id = '$ASSIGNMENT' and annual_student_record_id = '$QR1'")"
hold a34a a34b "$as_admin select public.correct_assignment_key('$ACADEMY','$ASSIGNMENT','$AQ','$ACB',1,gen_random_uuid());"
start a34b "$as_admin select public.save_assignment_marks('$ACADEMY','$ASSIGNMENT','$QR1',null,$AV,'{\"feedback\":\"stale scoring\"}',gen_random_uuid());"
start a34c "$as_admin select public.publish_assignment_results('$ACADEMY','$ASSIGNMENT','[{\"annual_student_record_id\":\"$QR1\",\"expected_version\":$AV}]',gen_random_uuid());"
wait
expect_ok a34a "assignment correction holder failed"
expect_ok a34b "old-basis marking did not return its conflict"
expect_ok a34c "old-basis announcement did not return a rejection"
grep -q conflict "$OUT/a34b" || fail "an old-basis mark applied after correction"
grep -q stale "$OUT/a34c" || fail "an old-basis announcement applied after correction"

# 35. Marking wins first: correction waits, preserves the acknowledged direct total in immutable
#     history and invalidates it for manual re-marking against the reduced maximum.
hold a35a a35b "$as_admin select public.save_assignment_marks('$ACADEMY','$ASSIGNMENT','$QR1',null,$((AV+1)),jsonb_build_object('marks',jsonb_build_array(jsonb_build_object('part_id','$AP','score','3'))),gen_random_uuid());"
start a35b "$as_admin select public.exclude_assignment_question('$ACADEMY','$ASSIGNMENT','$AQ2',2,gen_random_uuid());"
wait
expect_ok a35a "assignment mark holder failed"
expect_ok a35b "assignment exclusion waiting behind a mark failed"
psqlx -tA -c "select m.requires_remark and m.score = 3 and exists(select 1 from public.assignment_mark_basis_history h where h.assignment_id = m.assignment_id and h.revision = 3 and h.annual_student_record_id = m.annual_student_record_id and (h.mark->>'score')::numeric = 3) from public.assignment_marks m where m.assignment_id = '$ASSIGNMENT' and m.annual_student_record_id = '$QR1'" | grep -qx t \
  || fail "exclusion did not preserve the committed direct mark and require re-marking"

# 36. Concurrent corrections reviewed on one revision serialize: only the first can apply.
ACA="$(psqlx -tA -c "select id from public.assignment_question_choices where question_id = '$AQ' and position = 1")"
hold a36a a36b "$as_admin select public.correct_assignment_key('$ACADEMY','$ASSIGNMENT','$AQ','$ACA',3,gen_random_uuid());"
start a36b "$as_admin select public.exclude_assignment_question('$ACADEMY','$ASSIGNMENT','$AQ',3,gen_random_uuid());"
wait
expect_ok a36a "first assignment correction failed"
expect_rejected a36b "a stale concurrent correction applied" stale_basis

# 26. Year closure holds the year row and, through its triggers, the quiz and exam rows; a concurrent worker
#     settlement and a staff command both queue behind it (year share lock first, then the quiz) and
#     neither deadlocks. After the commit the worker finds a closed year and the command is refused.
#     Runs last: it closes the race year.
psqlx >/dev/null -c "update public.quizzes set opens_at = now() - interval '2 hours', closes_at = now() - interval '3 minutes', actual_closes_at = now() - interval '1 minute' where id = '$QUIZ';"
hold 26a 26b "update public.academic_years set closed_at = now() where id = '$YEAR';"
start 26b "select edra_private.settle_quiz_closure('$QUIZ');"
start 26c "$as_admin select public.save_quiz_marks('$ACADEMY','$QUIZ','$QR1',1,'{\"feedback\":\"late\"}',gen_random_uuid());"
start 26d "select edra_private.settle_exam_closure('$EXAM');"
start 26f "$as_admin select public.record_assignment_work('$ACADEMY','$COHORT_E','$LATE26',1,'submitted',now(),'');"
start 26g "$as_admin select public.exclude_assignment_question('$ACADEMY','$ASSIGNMENT','$AQ',4,gen_random_uuid());"
start 26e "$as_admin select public.save_exam_marks('$ACADEMY','$EXAM','$ER1',1,'{\"feedback\":\"late\"}',gen_random_uuid());"
wait
expect_rejected 26f "optional assignment work crossed year closure" year_unavailable
expect_ok 26a "the year closure holding the year and quiz rows failed"
expect_ok 26b "the worker settlement queued behind the year closure failed"
expect_rejected 26c "a staff command wrote into a year closed concurrently" year_unavailable
expect_ok 26d "the exam worker settlement queued behind the year closure failed"
expect_rejected 26g "an assignment correction wrote into a year closed concurrently" year_unavailable
expect_rejected 26e "an exam staff command wrote into a year closed concurrently" year_unavailable
psqlx -tA -c "select closed_at is not null from public.academic_years where id = '$YEAR'" | grep -qx t || fail "the year did not close"
grep -qi deadlock "$OUT/26a" "$OUT/26b" "$OUT/26c" "$OUT/26d" "$OUT/26e" "$OUT/26f" "$OUT/26g" && fail "the year closure deadlocked with quiz or exam work"

echo "concurrency checks passed"
