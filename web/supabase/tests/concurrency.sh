#!/usr/bin/env bash
# Separate-session race tests for schedule/group/slot and student-record locking. DISPOSABLE DATABASES ONLY:
# fixtures are committed (races need real concurrent transactions) and are not cleaned up.
# Usage: DB_URL=postgresql://... supabase/tests/concurrency.sh   (run via `npm run test:db`)
set -euo pipefail

DB_URL="${DB_URL:?DB_URL must point at a disposable local database}"
psqlx() { psql "$DB_URL" -v ON_ERROR_STOP=1 -X -q "$@"; }
OUT="$(mktemp -d)"; trap 'rm -rf "$OUT"' EXIT

ACADEMY=cccccccc-cccc-4ccc-8ccc-cccccccccccc
ADMIN=c1111111-1111-4111-8111-111111111111
YEAR=cccccccc-1111-4111-8111-cccccccccccc
GROUP_ARCH=c2222222-2222-4222-8222-222222222221   # archive wins first
GROUP_SCHED=c2222222-2222-4222-8222-222222222222  # schedule wins first
SCHED=c3333333-3333-4333-8333-333333333333

psqlx <<SQL
insert into auth.users (id) values ('$ADMIN');
insert into public.academies (id, name, slug, icon, subject, created_by)
  values ('$ACADEMY', 'Race Academy', 'race-academy', 'school', 'Math', '$ADMIN');
update public.academic_years set id = '$YEAR', start_year = 2030 where academy_id = '$ACADEMY';
insert into public.academy_memberships (academy_id, user_id, role, created_by)
  values ('$ACADEMY', '$ADMIN', 'owner', '$ADMIN');
insert into public.academy_levels (academy_id, level_id, sort_order) values ('$ACADEMY', 'grade-10', 10);
insert into public.groups (id, academy_id, academic_year_id, level_id, name) values
  ('$GROUP_ARCH', '$ACADEMY', '$YEAR', 'grade-10', 'Race A'),
  ('$GROUP_SCHED', '$ACADEMY', '$YEAR', 'grade-10', 'Race B');
grant usage on schema public, auth to authenticated;
SQL

as_admin="set local role authenticated; set local request.jwt.claim.sub = '$ADMIN';"
create_sched() { # $1 group id, $2 title
  echo "select public.create_schedule('$ACADEMY','$YEAR','$2','one_off','group','$1',null,null,true,null,'[]'::jsonb,'[{"date":"2030-10-01","startsAt":"10:00","endsAt":"11:00"}]'::jsonb);"
}
fail() { echo "FAIL: $*" >&2; exit 1; }

# 1. Archive holds the group lock; a concurrent schedule insert must end up rejected.
( psqlx -c "begin; $as_admin update public.groups set archived_at = now() where id = '$GROUP_ARCH'; select pg_sleep(2); commit;" >"$OUT/1a" 2>&1 ) &
sleep 0.6
( psqlx -c "begin; $as_admin $(create_sched "$GROUP_ARCH" 'Race sched 1'); commit;" >"$OUT/1b" 2>&1 && echo ok >"$OUT/1b.status" || echo failed >"$OUT/1b.status" ) &
wait
[ "$(cat "$OUT/1b.status")" = failed ] || fail "schedule created on a group archived concurrently"

# 2. Schedule insert holds the group share lock; a concurrent archive must be rejected.
( psqlx -c "begin; $as_admin $(create_sched "$GROUP_SCHED" 'Race sched 2'); select pg_sleep(2); commit;" >"$OUT/2a" 2>&1 ) &
sleep 0.6
( psqlx -c "begin; $as_admin update public.groups set archived_at = now() where id = '$GROUP_SCHED'; commit;" >"$OUT/2b" 2>&1 && echo ok >"$OUT/2b.status" || echo failed >"$OUT/2b.status" ) &
wait
[ "$(cat "$OUT/2b.status")" = failed ] || fail "group archived despite a concurrently created schedule"
psqlx -tA -c "select count(*) from public.groups where id = '$GROUP_SCHED' and archived_at is null" | grep -qx 1 \
  || fail "group with a schedule ended up archived"

# 3. Two sessions each delete a different slot of a two-slot schedule; one must be rejected.
psqlx <<SQL
begin; $as_admin
select public.create_schedule('$ACADEMY','$YEAR','Race slots','recurring','level',null,'grade-10',null,true,null,
  '[{"weekday":1,"startsAt":"09:00","endsAt":"10:00"},{"weekday":2,"startsAt":"09:00","endsAt":"10:00"}]'::jsonb, '[]'::jsonb);
commit;
SQL
del() { echo "begin; $as_admin delete from public.schedule_slots where weekday = $1 and schedule_id = (select id from public.schedules where title = 'Race slots'); select pg_sleep($2); commit;"; }
( psqlx -c "$(del 1 2)" >"$OUT/3a" 2>&1 && echo ok >"$OUT/3a.status" || echo failed >"$OUT/3a.status" ) &
sleep 0.6
( psqlx -c "$(del 2 0)" >"$OUT/3b" 2>&1 && echo ok >"$OUT/3b.status" || echo failed >"$OUT/3b.status" ) &
wait
remaining="$(psqlx -tA -c "select count(*) from public.schedule_slots where schedule_id = (select id from public.schedules where title = 'Race slots')")"
[ "$remaining" -ge 1 ] || fail "concurrent final-slot deletes emptied a recurring schedule"
[ "$(cat "$OUT/3a.status" "$OUT/3b.status" | grep -c failed)" -ge 1 ] || fail "both final-slot deletes committed"

# 4. Two sessions create students with the same phone in different formats; exactly one commits.
GROUP_STUDENT_ARCH=c2222222-2222-4222-8222-222222222223  # archive wins first
GROUP_STUDENT_PLACE=c2222222-2222-4222-8222-222222222224 # placement wins first
psqlx <<SQL
insert into public.groups (id, academy_id, academic_year_id, level_id, name) values
  ('$GROUP_STUDENT_ARCH', '$ACADEMY', '$YEAR', 'grade-10', 'Race students A'),
  ('$GROUP_STUDENT_PLACE', '$ACADEMY', '$YEAR', 'grade-10', 'Race students B');
SQL
create_student() { # $1 name, $2 student phone, $3 group id or null
  local group="null"; [ "$3" != null ] && group="'$3'"
  echo "select public.create_student_record('$ACADEMY','$YEAR','$1','$2','01112223333','grade-10',null,$group,'in_person');"
}
( psqlx -c "begin; $as_admin $(create_student 'Race dup 1' '01055556666' null) select pg_sleep(2); commit;" >"$OUT/4a" 2>&1 && echo ok >"$OUT/4a.status" || echo failed >"$OUT/4a.status" ) &
sleep 0.6
( psqlx -c "begin; $as_admin $(create_student 'Race dup 2' '+20 10 5555 6666' null) commit;" >"$OUT/4b" 2>&1 && echo ok >"$OUT/4b.status" || echo failed >"$OUT/4b.status" ) &
wait
[ "$(cat "$OUT/4a.status")" = ok ] || fail "first concurrent student creation failed: $(cat "$OUT/4a")"
[ "$(cat "$OUT/4b.status")" = failed ] || fail "duplicate student phone committed concurrently"
grep -q duplicate_student_phone "$OUT/4b" || fail "concurrent duplicate did not report duplicate_student_phone"
psqlx -tA -c "select count(*) from public.academy_student_profiles p where p.academy_id = '$ACADEMY'
  and not exists (select 1 from public.annual_student_records r where r.academy_student_profile_id = p.id)" | grep -qx 0 \
  || fail "a failed concurrent creation left an orphan student profile"

# 5. Archive holds the group lock; a concurrent student placement into it must be rejected.
( psqlx -c "begin; $as_admin update public.groups set archived_at = now() where id = '$GROUP_STUDENT_ARCH'; select pg_sleep(2); commit;" >"$OUT/5a" 2>&1 ) &
sleep 0.6
( psqlx -c "begin; $as_admin $(create_student 'Race placed 1' '01066667777' "$GROUP_STUDENT_ARCH") commit;" >"$OUT/5b" 2>&1 && echo ok >"$OUT/5b.status" || echo failed >"$OUT/5b.status" ) &
wait
[ "$(cat "$OUT/5b.status")" = failed ] || fail "student placed into a group archived concurrently"

# 6. Placement holds the group share lock; a concurrent archive must be rejected.
( psqlx -c "begin; $as_admin $(create_student 'Race placed 2' '01077778888' "$GROUP_STUDENT_PLACE") select pg_sleep(2); commit;" >"$OUT/6a" 2>&1 ) &
sleep 0.6
( psqlx -c "begin; $as_admin update public.groups set archived_at = now() where id = '$GROUP_STUDENT_PLACE'; commit;" >"$OUT/6b" 2>&1 && echo ok >"$OUT/6b.status" || echo failed >"$OUT/6b.status" ) &
wait
[ "$(cat "$OUT/6b.status")" = failed ] || fail "group archived despite a concurrently placed student"
psqlx -tA -c "select count(*) from public.annual_student_records where primary_group_id = '$GROUP_STUDENT_PLACE'" | grep -qx 1 \
  || fail "concurrently placed student is missing"

# Imports and bulk group changes ------------------------------------------------------------------
GROUP_BULK_ARCH=c2222222-2222-4222-8222-222222222225   # archive wins first
GROUP_BULK_MOVE=c2222222-2222-4222-8222-222222222226   # group change wins first
GROUP_IMPORT=c2222222-2222-4222-8222-222222222227      # archived while an import batch waits
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
process() { echo "select public.process_student_import_batch('$1', 0);"; }

# 7. Two tabs submit the same batch; the second waits on the session lock and creates nothing more.
S7="$(make_import 'Race overlap' "[$(student_row 1 'Overlap 1' 01088880001),$(student_row 2 'Overlap 2' 01088880002)]")"
[ -n "$S7" ] || fail "could not prepare the overlapping import"
( psqlx -c "begin; $as_admin $(process "$S7") select pg_sleep(2); commit;" >"$OUT/7a" 2>&1 ) &
sleep 0.6
( psqlx -c "begin; $as_admin $(process "$S7") commit;" >"$OUT/7b" 2>&1 && echo ok >"$OUT/7b.status" || echo failed >"$OUT/7b.status" ) &
wait
[ "$(cat "$OUT/7b.status")" = ok ] || fail "a repeated batch failed: $(cat "$OUT/7b")"
psqlx -tA -c "select count(*) from public.annual_student_records where student_phone in ('+201088880001', '+201088880002')" | grep -qx 2 \
  || fail "overlapping batch submissions created duplicate records"
psqlx -tA -c "select state || ':' || created_count from public.student_import_sessions where id = '$S7'" | grep -qx 'completed:2' \
  || fail "overlapping batch submissions left the session inconsistent"

# 8. Two imports with the same student phone run at once; one creates it and the other skips it.
S8A="$(make_import 'Race dup A' "[$(student_row 1 'Import dup A' 01099990001)]")"
S8B="$(make_import 'Race dup B' "[$(student_row 1 'Import dup B' '+20 10 9999 0001')]")"
( psqlx -c "begin; $as_admin $(process "$S8A") select pg_sleep(2); commit;" >"$OUT/8a" 2>&1 ) &
sleep 0.6
( psqlx -c "begin; $as_admin $(process "$S8B") commit;" >"$OUT/8b" 2>&1 && echo ok >"$OUT/8b.status" || echo failed >"$OUT/8b.status" ) &
wait
[ "$(cat "$OUT/8b.status")" = ok ] || fail "a concurrent duplicate import errored instead of skipping: $(cat "$OUT/8b")"
psqlx -tA -c "select count(*) from public.annual_student_records where student_phone = '+201099990001'" | grep -qx 1 \
  || fail "concurrent imports created the same student phone twice"
psqlx -tA -c "select outcome || ':' || outcome_code from public.student_import_rows where session_id = '$S8B'" | grep -qx 'skipped:duplicate_existing' \
  || fail "the losing import did not record a duplicate skip"

# 9. A group archive and a bulk move into it race; whichever commits first wins.
new_student() { # $1 name, $2 phone; prints the record id
  printf 'begin; %s select id from public.create_student_record(%s); commit;\n' "$as_admin" \
    "'$ACADEMY','$YEAR','$1','$2','01112223333','grade-10',null,null,'in_person'" \
    | psqlx -tA | grep -E '^[0-9a-f-]{36}$'
}
R9A="$(new_student 'Bulk race A' 01077770001)"
R9B="$(new_student 'Bulk race B' 01077770002)"
[ -n "$R9A" ] && [ -n "$R9B" ] || fail "could not create bulk race students"
move() { echo "select public.set_student_records_group('$ACADEMY', '$YEAR', '[{\"id\":\"$1\",\"version\":1}]', '$2');"; }
( psqlx -c "begin; $as_admin update public.groups set archived_at = now() where id = '$GROUP_BULK_ARCH'; select pg_sleep(2); commit;" >"$OUT/9a" 2>&1 ) &
sleep 0.6
( psqlx -c "begin; $as_admin $(move "$R9A" "$GROUP_BULK_ARCH") commit;" >"$OUT/9b" 2>&1 && echo ok >"$OUT/9b.status" || echo failed >"$OUT/9b.status" ) &
wait
[ "$(cat "$OUT/9b.status")" = failed ] || fail "students moved into a group archived concurrently"
( psqlx -c "begin; $as_admin $(move "$R9B" "$GROUP_BULK_MOVE") select pg_sleep(2); commit;" >"$OUT/9c" 2>&1 ) &
sleep 0.6
( psqlx -c "begin; $as_admin update public.groups set archived_at = now() where id = '$GROUP_BULK_MOVE'; commit;" >"$OUT/9d" 2>&1 && echo ok >"$OUT/9d.status" || echo failed >"$OUT/9d.status" ) &
wait
[ "$(cat "$OUT/9d.status")" = failed ] || fail "group archived despite a concurrent bulk move into it"
psqlx -tA -c "select count(*) from public.annual_student_records where id = '$R9B' and primary_group_id = '$GROUP_BULK_MOVE'" | grep -qx 1 \
  || fail "the bulk move that won is missing"

# 10. A group archived while an import batch waits turns that row into a failure, not a batch error.
S10="$(make_import 'Race import group' "[$(student_row 1 'Import placed' 01066660001 'Race import'),$(student_row 2 'Import plain' 01066660002)]")"
( psqlx -c "begin; $as_admin update public.groups set archived_at = now() where id = '$GROUP_IMPORT'; select pg_sleep(2); commit;" >"$OUT/10a" 2>&1 ) &
sleep 0.6
( psqlx -c "begin; $as_admin $(process "$S10") commit;" >"$OUT/10b" 2>&1 && echo ok >"$OUT/10b.status" || echo failed >"$OUT/10b.status" ) &
wait
[ "$(cat "$OUT/10b.status")" = ok ] || fail "a concurrent group archive failed the whole batch: $(cat "$OUT/10b")"
psqlx -tA -c "select string_agg(outcome || ':' || coalesce(outcome_code, ''), ',' order by ordinal) from public.student_import_rows where session_id = '$S10'" \
  | grep -qx 'failed:invalid_placement,created:' || fail "the archived group's row was not recorded as a failure"

# 11. Student code settings: two first saves race; exactly one wins and the other is stale.
save_codes() { echo "select public.save_student_code_settings('$ACADEMY', $1, $2, '####', '[]');"; }
( psqlx -c "begin; $as_admin $(save_codes 0 true) select pg_sleep(2); commit;" >"$OUT/11a" 2>&1 && echo ok >"$OUT/11a.status" || echo failed >"$OUT/11a.status" ) &
sleep 0.6
( psqlx -c "begin; $as_admin $(save_codes 0 false) commit;" >"$OUT/11b" 2>&1 && echo ok >"$OUT/11b.status" || echo failed >"$OUT/11b.status" ) &
wait
[ "$(cat "$OUT/11a.status")" = ok ] && [ "$(cat "$OUT/11b.status")" = failed ] && grep -q stale_settings "$OUT/11b" \
  || fail "concurrent first student code saves did not produce one stale save"
psqlx -tA -c "select enabled::text || ':' || version from public.student_code_settings where academy_id = '$ACADEMY'" | grep -qx 'true:1' \
  || fail "the winning student code save is missing"

# 12. An in-flight issuer holds the settings share lock; a concurrent disable waits for it, and an
#     issue attempted after the disable commits is rejected.
R12="$(new_student 'Code race' 01055550001)"
[ -n "$R12" ] || fail "could not create the code race student"
issue12() { # $1 code
  echo "insert into public.student_code_assignments (academy_id, academic_year_id, academy_student_profile_id, annual_student_record_id, level_id, code, code_version, issued_by)
    select academy_id, academic_year_id, academy_student_profile_id, id, level_id, '$1', 1, '$ADMIN' from public.annual_student_records where id = '$R12';"
}
( psqlx -c "begin; $(issue12 0001) select pg_sleep(2); commit;" >"$OUT/12a" 2>&1 && echo ok >"$OUT/12a.status" || echo failed >"$OUT/12a.status" ) &
sleep 0.6
( psqlx -c "begin; $as_admin $(save_codes 1 false) commit;" >"$OUT/12b" 2>&1 && echo ok >"$OUT/12b.status" || echo failed >"$OUT/12b.status" ) &
wait
[ "$(cat "$OUT/12a.status")" = ok ] && [ "$(cat "$OUT/12b.status")" = ok ] || fail "issuer and disable did not both commit in order"
psqlx -c "begin; $(issue12 0002) commit;" >"$OUT/12c" 2>&1 && fail "a code was issued after disable" || true
grep -q codes_disabled "$OUT/12c" || fail "issue after disable failed for the wrong reason: $(cat "$OUT/12c")"

echo "concurrency checks passed"
