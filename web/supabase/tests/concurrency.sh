#!/usr/bin/env bash
# Separate-session race tests for schedule/group/slot locking. DISPOSABLE DATABASES ONLY:
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

echo "concurrency checks passed"
