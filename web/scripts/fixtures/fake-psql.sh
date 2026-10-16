#!/usr/bin/env bash
# Fake psql for scripts/db-test.test.ts: logs each call and answers the runner's known queries.
files=(); cmds=(); args="$*"
while [ $# -gt 0 ]; do
  case "$1" in -f) files+=("$2"); shift 2 ;; -c) cmds+=("$2"); shift 2 ;; *) shift ;; esac
done
input=""; [ ${#files[@]} -gt 0 ] || [ ${#cmds[@]} -gt 0 ] || input="$(cat)"
text="${cmds[*]-} $input"
{ echo "CALL"; echo "ARGV $args"; echo "PGPASSWORD ${PGPASSWORD:-}"; echo "FILES ${files[*]-}"; printf '%s\n' "$text"; } >>"$FAKE_LOG"
if [ -n "${FAKE_CONNECT_FAIL:-}" ]; then
  echo "psql: error: connection to server at \"$EDRA_DB_TEST_HOST\", port 5432 failed: FATAL: password authentication failed for user \"$EDRA_DB_TEST_USER\"" >&2
  exit 2
fi
for file in "${files[@]}"; do
  [ "$(basename "$file")" != "${FAKE_FAIL_FILE:-}" ] || { echo "psql:$file:10: ERROR:  assertion failed" >&2; exit 3; }
done
if [ -n "${FAKE_FAIL_MATCH:-}" ] && [[ "$text" =~ $FAKE_FAIL_MATCH ]]; then
  echo "${FAKE_FAIL_MESSAGE:-ERROR:  rejected}" >&2; exit "${FAKE_FAIL_CODE:-1}"
fi
case "$text" in
  *"collisions="*)
    echo "marker=${FAKE_MARKER-}"; echo "read_only=${FAKE_READ_ONLY:-false}"; echo "missing_migrations=${FAKE_MISSING:-}"
    echo "privileges="; echo "collisions=" ;;
  *"from edra_db_test.target"*) echo "${FAKE_MARKER-}" ;;
  *pg_stat_activity*) [ "${FAKE_READY:-1}" = 0 ] || echo 1 ;;
esac
