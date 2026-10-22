# Offered levels and tracks — EDRA-129

Implementation in progress. These source changes have not been applied to a database. Removal,
stop and resume are drafted in `*_offering_protected_transitions.sql` but stay disabled behind the
private `edra_private.offering_release` switch (default off); the UI shows those controls only when
the structure read reports `transitionsEnabled`. This is not a release-ready shutdown.

The concrete `/<academy>/manage/structure` route composes this module. The existing
`settings/structure` redirect remains in the academy catch-all. Basic maintenance uses the existing
catalog, trimmed 60-character track validation and cookie-session authority. Owner, Head Admin and
Admin may manage; Instructor reads. No management bearer API or profile-settings rewrite is added.

## Draft database contract

- `get_academy_structure(academy)` returns account/academy scope, offering versions/revision, state,
  retained track identities and dependency counts. Existing history policies remain in force.
- `preview_offering_change(academy, change)` authorizes a manager and captures a fingerprint of
  academy-owned rows, including membership and related academic/configuration data. Counts are
  conservative and the final transition impact contract is not complete yet.
- `maintain_academy_offering(academy, change, revision, fingerprint, requestKey)` recomputes impact
  under the offering barrier, returns conflicts without silently adopting them, and stores receipts
  scoped to actor/academy/key. Replays return the original result; changed payloads fail. Basic
  add/rename are live. Removal, stop and resume refuse with `transition_unavailable` until the
  release switch is enabled after database verification.
- Private transition rows keyed by transaction/academy provide the planned guard exception
  authority. Application roles cannot insert them. No caller-set flag authorizes a bypass.
- Fixed exam roster storage and the shared audience predicate are drafted, including explicit
  frozen-empty behavior. Track retirement captures them before clearing placement.

The initial barrier is deliberately coarse: ordinary academic commands acquire advisory SHARE
`(129,1)` before existing domain locks; offering commands acquire EXCLUSIVE first. Statement
triggers cover writes to public academy-owned tables, including direct RLS writes and year closure.
Existing locking function bodies receive the SHARE gate before their first statement. Their internal
orders remain intact. This briefly serializes an offering transition with writes across academies;
normal academic commands remain concurrent. Full race coverage and review of wrapper/worker lock
entry paths remain required before using destructive transitions. Future functions must explicitly
obtain the same gate before taking domain locks.

`offering_available`/`require_offering` distinguish new use from history. Draft integration covers
record placement/restoration, groups, schedules/session starts, import resolution, invite choices,
assessment audience/placement/window boundaries, content creation/publication and the shared
student resolver. Existing session-start receipts replay before fresh-use availability checks.
Selection/display queries and staff marking boundaries still require the final integration audit.

`content_offering_available(unit, record)` is a prerequisite for the deferred student learning gate,
not an entitlement or playback implementation. Publication stamps the offering learning epoch;
shutdown will advance it so resume cannot reactivate an old publication. Existing attached exam and
quiz content checks remain fail-closed. Actual stop-time revocation and content-owned quiz
transitions are not yet implemented or verified.

## Owner decisions on source conflicts (2026-10-21)

1. Duplicate group names after broadening: preserve both names and IDs. `groups.retired_track_id`
   joins the active-name unique index, so only groups broadened by track removal may share a
   level-wide name; ordinary create/rename/restore uniqueness is unchanged.
2. Assessments shared across levels: stopping a level is blocked (`sharedAssessments` blocker) while
   an open assignment or exam targets groups from the stopped level and another level. Once those
   close, shutdown proceeds without changing them.

## Verification and remaining delivery

The owner instructed this thread not to test against cloud. No cloud query, migration or test runs
have occurred since that instruction. No local database, Supabase/Docker stack, reset, migration
replay, commit, push or implementation thread was created.

The initial SQL/PL/pgSQL parser check passed for all three draft migrations. This establishes syntax
only, not execution, permissions, semantics or concurrency. `academy_structure.sql` is registered
for isolated CI execution and currently covers the foundation; it has not been executed. Hosted
browser evidence remains absent. The generated database type export remains pending a disposable
CI schema; `database.ts` explicitly describes the provisional RPC boundary.

Observed repository checks on 2026-10-21: typecheck passed; production build passed and includes the
concrete structure route; full Vitest run passed 711 tests with one opt-in provider test skipped.
The subsequently added editor suite passed all four tests (uncertain same-key retry, conflict draft
preservation, academy switching and committed-success handling after a failed cache refresh).
Lint passed with eight existing unrelated warnings; focused structure lint passed. SQL/PL/pgSQL
syntax checks also passed for the new SQL suite. These mocked component/service checks are not
authenticated browser, live-session, database, concurrency or hosted learning evidence.

`academy_structure.sql` now also covers the protected transitions (fixed exam rosters, group
broadening, shared-assessment blocker, running-attempt blocker, due-attempt settlement, ten-student
shutdown, markability after archival, resume without restoration, removal blockers). It enables the
release switch only inside its rolled-back transaction. It has not been executed anywhere.

Still required before enabling the release switch: execute the SQL suites on the disposable CI
instance; concurrency races in `concurrency.sh`; database type export;
authenticated manager/Instructor/bearer/student browser journeys; final domain READMEs/routing
documentation and release evidence.
