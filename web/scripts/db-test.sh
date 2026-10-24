#!/usr/bin/env bash
# Runs database assertions and concurrency checks only against the disposable instance that
# scripts/db-ci.sh builds on a GitHub-hosted runner. It never starts infrastructure, resets a
# database, or applies migrations.
#
#   EDRA_DB_TEST_URL     postgres:// URL of the runner's loopback database
#   EDRA_DB_TEST_TARGET  name recorded in the target's edra_db_test.target marker row
#
# Usage: npm run test:db [-- --check] [-- suite ...]   (suites: SQL file basenames, `concurrency`)
# Exit status: 0 passed, 1 a suite failed, 2 configuration/target/prerequisite rejected before writes.
# See docs/engineering.md "Database assertions" for the target contract and fixture retention.
set -euo pipefail
cd "$(dirname "$0")/.."

TESTS=supabase/tests
SQL_SUITES=(groups_schedules student_records student_imports student_import_logs staff_invitations sessions
  attendance session_authority student_codes student_code_changes student_code_generation student_code_checkin
  attendance_corrections assignments assignment_marks assignment_eligibility session_archival staff_access quizzes exams assessment_exposure student_exams student_exam_answering student_exam_review student_assignments level_wide_groups level_catalog student_enrollment account_settings account_contacts content content_options session_content content_access track_coupons coupon_settings academy_profile academy_structure development_tooling)

reject() { echo "db-test: $*" >&2; exit 2; }

[ "${GITHUB_ACTIONS:-}" = true ] && [ "${RUNNER_ENVIRONMENT:-}" = github-hosted ] \
  || reject "runs only on a GitHub-hosted Actions runner through scripts/db-ci.sh"

check_only=false
selected=()
for arg in "$@"; do
  case "$arg" in
    --check) check_only=true ;;
    concurrency) selected+=("$arg") ;;
    -*) reject "unknown option '$arg'" ;;
    *) [[ " ${SQL_SUITES[*]} " == *" $arg "* ]] || reject "unknown suite '$arg'"; selected+=("$arg") ;;
  esac
done
[ ${#selected[@]} -gt 0 ] || selected=("${SQL_SUITES[@]}" concurrency)

# Configuration -----------------------------------------------------------------------------------
[ -n "${EDRA_DB_TEST_URL:-}" ] || reject "EDRA_DB_TEST_URL is not set (no default connection is used)"
[ -n "${EDRA_DB_TEST_TARGET:-}" ] || reject "EDRA_DB_TEST_TARGET is not set (name of the isolated target's marker)"
[[ "$EDRA_DB_TEST_TARGET" =~ ^[a-z0-9][a-z0-9-]{0,62}$ ]] || reject "EDRA_DB_TEST_TARGET must be lowercase letters, digits and hyphens"
[[ "$EDRA_DB_TEST_TARGET" =~ ^edra-db-check-[0-9]+-[0-9]+-[0-9a-f]{4}$ ]] \
  || reject "EDRA_DB_TEST_TARGET must identify this disposable CI run"

[[ "$EDRA_DB_TEST_URL" =~ ^postgres(ql)?://([^@/?#]*@)?([^/:?#]+)(:([0-9]+))?(/[^?#]*)?(\?[^#]*)?$ ]] \
  || reject "EDRA_DB_TEST_URL must be a postgres:// or postgresql:// URL"
userinfo="${BASH_REMATCH[2]%@}"; host="${BASH_REMATCH[3]}"; port="${BASH_REMATCH[5]:-5432}"
path="${BASH_REMATCH[6]}"; query="${BASH_REMATCH[7]}"
[[ "$query" != *password=* ]] || reject "put the password in the URL userinfo or ~/.pgpass, not a query parameter"
[ "$port" != 6543 ] || reject "port 6543 is a transaction pooler; races need a direct or session-pooler connection"
[ "$host" = 127.0.0.1 ] && [ "$port" = 54322 ] && [ "$path" = /postgres ] && [ -z "$query" ] \
  || reject "EDRA_DB_TEST_URL must use the disposable CI database at 127.0.0.1:54322/postgres without connection overrides"

user="${userinfo%%:*}"; password=""
[[ "$userinfo" != *:* ]] || password="${userinfo#*:}"
if [ -n "$password" ]; then
  # Keep the password out of process arguments: libpq reads it from the environment instead.
  export PGPASSWORD; printf -v PGPASSWORD '%b' "${password//%/\\x}"
fi
export EDRA_DB_TEST_CONN="postgresql://${user:+$user@}$host:$port$path$query"
unset EDRA_DB_TEST_URL
export PGAPPNAME=edra-db-test PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-15}"

command -v psql >/dev/null || reject "psql is required on PATH"
unset PGHOSTADDR PGSERVICE PGSERVICEFILE

# Never print the connection string: mask its parts in anything psql reports.
redact() {
  local text; text="$(cat)"
  [ -z "${PGPASSWORD:-}" ] || text="${text//"$PGPASSWORD"/<password>}"
  text="${text//"$host"/<host>}"
  [ -z "$user" ] || text="${text//"$user"/<user>}"
  printf '%s\n' "$text"
}
export EDRA_DB_TEST_HOST="$host" EDRA_DB_TEST_USER="$user"

# Read-only preflight -----------------------------------------------------------------------------
versions="$(ls supabase/migrations | sed -n 's/^\([0-9]\{1,\}\)_.*\.sql$/\1/p' | sort | paste -sd, -)"
fixture_ids="$(grep -ohE "'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'" "$TESTS"/*.sql | tr -d "'" | sort -u | paste -sd, -)"
fixture_phones="$(grep -hA30 'insert into auth.users' "$TESTS"/*.sql | grep -ohE "'20[0-9]{10}'" | tr -d "'" | sort -u | paste -sd, -)"

preflight_out="$(mktemp)"; trap 'rm -f "$preflight_out"' EXIT
if ! psql "$EDRA_DB_TEST_CONN" -X -q -tA -v ON_ERROR_STOP=1 -v target="$EDRA_DB_TEST_TARGET" -v versions="$versions" \
  -v fixture_ids="$fixture_ids" -v fixture_phones="$fixture_phones" >"$preflight_out" 2>&1 <<'SQL'
begin transaction read only;
select to_regclass('edra_db_test.target') is not null as has_marker \gset
\if :has_marker
  select 'marker=' || coalesce((select string_agg(name, ',' order by name) from edra_db_test.target), '');
\else
  select 'marker=';
\endif
select 'read_only=' || pg_is_in_recovery();
select to_regclass('supabase_migrations.schema_migrations') is not null as has_history \gset
\if :has_history
  select 'missing_migrations=' || coalesce(string_agg(v, ',' order by v), '')
  from unnest(string_to_array(:'versions', ',')) v
  where not exists (select 1 from supabase_migrations.schema_migrations m where m.version = v);
\else
  select 'missing_migrations=history table supabase_migrations.schema_migrations is absent';
\endif
\if :has_history
  select 'extra_migrations=' || coalesce(string_agg(m.version, ',' order by m.version), '')
  from supabase_migrations.schema_migrations m
  where m.version <> all(string_to_array(:'versions', ','));
\endif
select 'privileges=' || concat_ws(',',
  case when not has_table_privilege('auth.users', 'insert') then 'insert into auth.users' end,
  case when not pg_has_role('authenticated', 'member') then 'set role authenticated' end,
  case when not has_schema_privilege('authenticated', 'public', 'usage') then 'authenticated usage on public' end,
  case when not has_schema_privilege('authenticated', 'auth', 'usage') then 'authenticated usage on auth' end);
select 'collisions=' || coalesce(string_agg(found, ',' order by found), '') from (
  select 'auth.users ' || id from auth.users where id = any(string_to_array(:'fixture_ids', ',')::uuid[])
  union all select 'auth.users phone ' || phone from auth.users where phone = any(string_to_array(:'fixture_phones', ','))
  union all select 'academies ' || id from public.academies where id = any(string_to_array(:'fixture_ids', ',')::uuid[])
) c(found);
rollback;
SQL
then
  redact <"$preflight_out" >&2
  reject "could not run the read-only preflight (connection or catalog access failed); nothing was written"
fi
value() { sed -n "s/^$1=//p" "$preflight_out" | tail -1; }

marker="$(value marker)"
[ -n "$marker" ] || reject "target has no edra_db_test.target marker; it is not the disposable CI database"
[ "$marker" = "$EDRA_DB_TEST_TARGET" ] || reject "target marker is '$marker', expected '$EDRA_DB_TEST_TARGET'"
[ "$(value read_only)" = false ] || reject "target is a read-only replica"
missing="$(value missing_migrations)"
[ -z "$missing" ] || reject "target schema is behind the repository (missing: $missing). Rebuild the disposable CI instance from this checkout"
extra="$(value extra_migrations)"
[ -z "$extra" ] || reject "target has migrations this checkout does not (extra: $extra); rebuild the disposable CI instance from this checkout"
privileges="$(value privileges)"
[ -z "$privileges" ] || reject "connection role lacks fixture privileges: $privileges"
collisions="$(value collisions)"
[ -z "$collisions" ] || reject "SQL suite fixtures already exist on the target ($collisions); rebuild the disposable CI instance"
echo "db-test: preflight passed for disposable CI target '$EDRA_DB_TEST_TARGET'"
if $check_only; then echo "db-test: --check wrote nothing"; exit 0; fi

# Assertions --------------------------------------------------------------------------------------
export EDRA_DB_TEST_RUN
EDRA_DB_TEST_RUN="$(date -u +%Y%m%dt%H%M%Sz)-$(od -An -N2 -tx1 /dev/urandom | tr -d ' \n')"
passed=()
for suite in "${selected[@]}"; do
  echo "db-test: running $suite"
  errors="$(mktemp)"
  if [ "$suite" = concurrency ]; then
    bash "$TESTS/concurrency.sh" 2>"$errors" && status=0 || status=$?
  else
    psql "$EDRA_DB_TEST_CONN" -X -v ON_ERROR_STOP=1 -f "$TESTS/$suite.sql" 2>"$errors" && status=0 || status=$?
  fi
  redact <"$errors" >&2; rm -f "$errors"
  if [ "$status" -ne 0 ]; then
    echo "db-test: FAILED $suite (exit $status); passed before it: ${passed[*]:-none}" >&2
    exit 1
  fi
  passed+=("$suite")
done
echo "db-test: passed ${#passed[@]} suite(s): ${passed[*]}"
