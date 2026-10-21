#!/usr/bin/env bash
# Disposable GitHub-hosted infrastructure only. No linked/cloud commands or local fallback.
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
reject() { echo "attendance-ci: $*" >&2; exit 2; }
[ "${GITHUB_ACTIONS:-}" = true ] && [ "${RUNNER_ENVIRONMENT:-}" = github-hosted ] || reject 'requires a GitHub-hosted Actions runner'
[ -n "${RUNNER_TEMP:-}" ] && [ -d "$RUNNER_TEMP" ] || reject 'RUNNER_TEMP must exist'
for tool in supabase psql docker node npm timeout; do command -v "$tool" >/dev/null || reject "$tool is required"; done
[ "$(supabase --version | head -1)" = '2.117.0' ] || reject 'requires Supabase CLI 2.117.0'
unset SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD SUPABASE_PROJECT_ID DATABASE_URL \
  EDRA_DB_TEST_URL EDRA_DB_TEST_TARGET EDRA_DB_TEST_CONN PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE \
  NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY SUPABASE_SERVICE_ROLE_KEY \
  ATTENDANCE_TARGET ATTENDANCE_FIXTURE DOCKER_HOST DOCKER_CONTEXT DOCKER_TLS_VERIFY DOCKER_CERT_PATH PGOPTIONS PGSERVICE PGSERVICEFILE

# The fallback uses this exact run's workdir; no --all or linked project lookup.
[[ "${GITHUB_RUN_ID:-}-${GITHUB_RUN_ATTEMPT:-}" =~ ^[0-9]+-[0-9]+$ ]] || reject 'invalid run identity'
state="$RUNNER_TEMP/edra-attendance-cleanup-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
if [ "${1:-}" = --cleanup ]; then
  [ -f "$state" ] || exit 0
  work="$(cat "$state")"
  case "$work" in "$RUNNER_TEMP"/edra-attendance-ci-*) ;; *) reject 'invalid cleanup workspace';; esac
  project="$(basename "$work")"
  [[ "$project" =~ ^edra-attendance-ci-[0-9]+-[0-9]+-[a-f0-9]+$ ]] || reject 'invalid cleanup identity'
  timeout 120 supabase stop --workdir "$work" --project-id "$project" --no-backup
  rm -rf "$work"
  rm -f "$state"
  exit 0
fi
[ -z "${1:-}" ] || reject 'unknown option'
run="${GITHUB_RUN_ID:-0}-${GITHUB_RUN_ATTEMPT:-1}"
[[ "$run" =~ ^[0-9]+-[0-9]+$ ]] || reject 'invalid run identity'
project="edra-attendance-ci-$run-$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n')"
work="$RUNNER_TEMP/$project"
mkdir "$work"
printf '%s' "$work" >"$state"
started=false
mkdir -p artifacts/attendance
phase() { echo "attendance-ci: $1 (${SECONDS}s)" | tee -a artifacts/attendance/phases.log; }
cleanup() {
  local status=$?
  trap - EXIT INT TERM
  if [ "$status" -ne 0 ]; then phase "failed with exit $status; private service logs excluded from artifacts"; fi
  if $started; then
    if ! timeout 120 supabase stop --workdir "$work" --project-id "$project" --no-backup >/dev/null 2>&1; then
      echo 'attendance-ci: cleanup failed; Actions fallback will retry' >&2
      rm -f "$work/target.json" "$work/fixture.json" "$work/status.json" "$work/start.log" "$work/status.log" "$work/prepare.log"
      [ "$status" -ne 0 ] || status=1
      exit "$status"
    fi
  fi
  rm -rf "$work"
  rm -f "$state"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
mkdir -p "$work/supabase/migrations"
sed "s/^project_id = .*/project_id = \"$project\"/" scripts/ci/attendance-e2e.toml >"$work/supabase/config.toml"
cp scripts/ci/roles.sql "$work/supabase/roles.sql"
cp supabase/migrations/[0-9]*_*.sql "$work/supabase/migrations/"
phase 'starting isolated Auth/API/database services'
started=true
# Startup/status output contains generated credentials. Keep it private, never upload it.
timeout 900 supabase start --workdir "$work" >"$work/start.log" 2>&1
supabase status --workdir "$work" --output json >"$work/status.json" 2>"$work/status.log"
export ATTENDANCE_TARGET="$work/target.json" ATTENDANCE_FIXTURE="$work/fixture.json"
node e2e/attendance/setup.mjs status "$work/status.json" "$project"
phase 'checking migrated schema and marking disposable target'
# The pinned CLI applies roles.sql before timestamped application migrations on start.
PGPASSWORD=postgres psql 'postgresql://postgres@127.0.0.1:54322/postgres' -X -q -v ON_ERROR_STOP=1 -v target="$project" -f scripts/ci/prepare.sql >"$work/prepare.log" 2>&1
phase 'building synthetic fixtures with real password Auth'
node e2e/attendance/setup.mjs fixtures
phase 'running authenticated browser and API scenarios'
npm run test:e2e:attendance
phase 'authenticated scenarios passed'
