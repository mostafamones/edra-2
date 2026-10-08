#!/usr/bin/env bash
# Replays every migration on a clean local Supabase database, then runs the SQL assertions and the
# concurrency harness. Any migration error or failed assertion produces a non-zero exit status.
# Prerequisites: Docker running, the Supabase CLI and psql on PATH. Destroys the local database.
set -euo pipefail
cd "$(dirname "$0")/.."

for tool in docker supabase psql; do
  command -v "$tool" >/dev/null || { echo "db-test: '$tool' is required but not installed" >&2; exit 2; }
done
docker info >/dev/null 2>&1 || { echo "db-test: Docker is not running" >&2; exit 2; }

supabase start >/dev/null
supabase db reset --local
export DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

psql "$DB_URL" -v ON_ERROR_STOP=1 -X -f supabase/tests/groups_schedules.sql
psql "$DB_URL" -v ON_ERROR_STOP=1 -X -f supabase/tests/student_records.sql
psql "$DB_URL" -v ON_ERROR_STOP=1 -X -f supabase/tests/student_imports.sql
psql "$DB_URL" -v ON_ERROR_STOP=1 -X -f supabase/tests/student_import_logs.sql
psql "$DB_URL" -v ON_ERROR_STOP=1 -X -f supabase/tests/staff_invitations.sql
psql "$DB_URL" -v ON_ERROR_STOP=1 -X -f supabase/tests/sessions.sql
psql "$DB_URL" -v ON_ERROR_STOP=1 -X -f supabase/tests/attendance.sql
psql "$DB_URL" -v ON_ERROR_STOP=1 -X -f supabase/tests/session_authority.sql
psql "$DB_URL" -v ON_ERROR_STOP=1 -X -f supabase/tests/student_codes.sql
psql "$DB_URL" -v ON_ERROR_STOP=1 -X -f supabase/tests/student_code_changes.sql
psql "$DB_URL" -v ON_ERROR_STOP=1 -X -f supabase/tests/student_code_generation.sql
psql "$DB_URL" -v ON_ERROR_STOP=1 -X -f supabase/tests/student_code_checkin.sql
psql "$DB_URL" -v ON_ERROR_STOP=1 -X -f supabase/tests/assignments.sql
psql "$DB_URL" -v ON_ERROR_STOP=1 -X -f supabase/tests/assignment_marks.sql
bash supabase/tests/concurrency.sh
