#!/usr/bin/env bash
# GitHub Actions only: builds a fresh Supabase database on the hosted runner from this checkout's
# migrations, runs the full `npm run test:db` suite against it, and destroys it. It is not a local
# developer stack command and refuses to run anywhere else. Cloud targets are never touched: no
# link, remote push/reset, migration repair or Management API call, and supplied cloud connection
# variables are ignored.
#
# Usage: bash scripts/db-ci.sh
# Exit status: the runner's status (0 passed, 1 a suite failed, 2 rejected before writes), 2 when
# this script refuses to start, or the failing startup/bootstrap command's status.
set -euo pipefail
cd "$(dirname "$0")/.."

reject() { echo "db-ci: $*" >&2; exit 2; }

[ "${GITHUB_ACTIONS:-}" = true ] && [ "${RUNNER_ENVIRONMENT:-}" = github-hosted ] \
  || reject "runs only on a GitHub-hosted Actions runner; use npm run test:db against a prepared target instead"
[ -n "${RUNNER_TEMP:-}" ] && [ -d "$RUNNER_TEMP" ] || reject "RUNNER_TEMP is not an existing directory"
for tool in supabase psql docker; do command -v "$tool" >/dev/null || reject "$tool is required on PATH"; done

# Only this script's loopback instance is a valid target here.
unset EDRA_DB_TEST_URL EDRA_DB_TEST_TARGET EDRA_DB_TEST_CONN NEXT_PUBLIC_SUPABASE_URL \
  SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD SUPABASE_PROJECT_ID PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE

run_id="$(printf '%s-%s' "${GITHUB_RUN_ID:-0}" "${GITHUB_RUN_ATTEMPT:-1}" | tr -cd '0-9-')"
project="edra-ci-$run_id-$(od -An -N2 -tx1 /dev/urandom | tr -d ' \n')"
work="$(mktemp -d "$RUNNER_TEMP/edra-db-XXXXXX")"
# Fixed by scripts/ci/supabase.toml and the pinned CLI's local defaults; never a pooler.
conn="postgresql://postgres:postgres@127.0.0.1:54322/postgres"

# Only the CI config, its bootstrap SQL and timestamped migrations: no .temp, .branches, .env*,
# linked-project metadata, seeds or the unnumbered legacy foundation.sql.
mkdir -p "$work/supabase/migrations"
sed "s/^project_id = .*/project_id = \"$project\"/" scripts/ci/supabase.toml >"$work/supabase/config.toml"
cp scripts/ci/roles.sql "$work/supabase/roles.sql"
cp supabase/migrations/[0-9]*_*.sql "$work/supabase/migrations/"

started=false
cleanup() {
  local status=$?
  trap - EXIT
  if $started; then
    if [ "$status" -ne 0 ]; then
      echo "db-ci: failed (exit $status); last database log lines:" >&2
      docker logs --tail 200 "supabase_db_$project" 2>&1 | sed 's/^/  /' >&2 || true
    fi
    if supabase stop --workdir "$work" --project-id "$project" --no-backup; then
      echo "db-ci: removed project $project"
    else
      echo "db-ci: cleanup of project $project failed" >&2
      [ "$status" -ne 0 ] || status=1
    fi
  fi
  rm -rf "$work"
  exit "$status"
}
trap cleanup EXIT

phase() { echo "db-ci: $1 (${SECONDS}s elapsed)"; }

echo "db-ci: project $project, $(ls "$work/supabase/migrations" | wc -l | tr -d ' ') migrations"
echo "db-ci: supabase $(supabase --version | head -1), $(psql --version)"
phase "starting database"
started=true
supabase db start --workdir "$work"
docker ps --filter "name=^supabase_db_$project\$" --format 'db-ci: database image {{.Image}}'

phase "verifying bootstrap and marking target"
psql "$conn" -X -q -tA -v ON_ERROR_STOP=1 -v target="$project" -f scripts/ci/prepare.sql

if [ -n "${EDRA_DB_TYPES_OUTPUT:-}" ]; then
  phase "exporting types from the isolated schema"
  supabase gen types typescript --db-url "$conn" --schema public >"$EDRA_DB_TYPES_OUTPUT"
fi

phase "running database suites"
EDRA_DB_TEST_URL="$conn" EDRA_DB_TEST_TARGET="$project" bash scripts/db-test.sh
phase "database suites passed"
