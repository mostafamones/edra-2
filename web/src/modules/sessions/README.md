# Sessions module contract

Current implementation reference; intended rules are in [teaching and attendance](../../../docs/product/domains/teaching.md). The session schema starts at migration 20261005120000_live_sessions.sql. Source behavior does not establish deployment status.

## Current source behavior

- Any active staff member (owner, head admin, admin, or instructor) may start a session from any active schedule (recurring or one-off) at any time. Planned weekday/time never gates starting.
- At most one live session per schedule. Starting a schedule that already has a live session returns that session (`outcome: "existing"`). There is no per-day restriction.
- Retries with the same `startKey` by the same actor return the same session (`outcome: "replayed"`); reusing a key for another schedule fails with `idempotency_conflict`.
- Any staff member may end a live session. Ending is final (no reopen), never marks absence, and never publishes attendance. A live session can still be ended after its academic year closes.
- A live session closes itself 90 minutes after the planned end of the schedule time closest to its start (today, academy time; with none today, 90 minutes after the start; never sooner than 90 minutes after the start). Closing is lazy: `list_live_sessions` and `get_session` already report an expired session as `ended` (`endReason: "auto"`, no `endedBy`), and the next start or end materializes it. Dependent operations must treat autoEndAt as authoritative and check expiry under the session lock.
- Starting captures the roster atomically: every active **in-person** annual record matching the audience (online-only students are excluded), `expected` for mandatory schedules and `eligible` for optional ones, with a placement snapshot. Schedule edits and placement changes never rewrite a started session.
- Writes go through `start_session` / `end_session` RPCs only; reads are RLS-scoped to academy members. Sessions and their roster snapshots are never deleted: there is no deletion action or UI, the retired `delete_session` / `force_delete_session` RPCs (migration 20261013100000_preserve_session_history.sql) are executable by no application role and always refuse, and delete triggers reject removing session or roster rows.
- **Archival** (migration 20261013200000_session_archival.sql): Owners, Head Admins and Admins archive or restore a session through `archive_session` / `restore_session` (web server actions `archiveSession` / `restoreSession`) in an open year only. Archival is orthogonal to Live/Ended: archiving a live session ends it in the same transaction (manual end by the archiver, or the existing automatic close when it already expired), without marking absence or finalizing. Archiving an ended session keeps its end facts; restoring never reopens it. Each command takes the reviewed `metadataVersion` (stale → `outcome: "conflict"`, nothing changes, not stored) and an idempotency key (same key replays the original result, including after a later opposite transition; a key reused for a different request is `idempotency_conflict`). Transitions bump `metadataVersion` and append to `session_archive_events` (immutable, readable by members); no-ops (`already_archived` / `not_archived`) add nothing. `protect_session_write` allows only these transitions on ended sessions.
- An archived session keeps its roster, drafts, publications, effects and receipts. It is excluded from history by default (`archive=archived|all` shows it), never appears live, and its attendance is read-only. Starting the schedule again with a new key creates a new live session; an old start key still replays the archived original (the action flags it `archived: true`). The upcoming-today list ignores archived sessions. `get_session` adds archival state, the archive trail, `year_open`, a manager flag and `archive_impact` counts (roster, finalized, unfinalized, pending effects) used by the confirmation dialog.
- Locking: `start_session` locks the schedule row, then the academic year, then the live session row (so a start concurrent with an archive waits and starts a new session). Every workflow on an existing session (ending now, archive/restore, attendance) locks the `sessions` row first, then the year.
- A `session_changed` broadcast on the attendance channel announces lifecycle and archival changes; open attendance screens refetch the sheet and session data.

## Public API

Client-safe (`index.ts`): `startSession`, `endSession`, `archiveSession`, `restoreSession` server actions; `fetchLiveSessions`, `fetchSession` and query keys; `LiveSession`, `SessionDetail`, `RosterEntry` types.

Server (`server.ts`): `listLiveSessions({ academyId?, cursor?, limit? })` (omit `academyId` to list every academy the caller belongs to; newest first; keyset cursor; limit 1–100, default 50), `getSession(academyId, sessionId)`, `readLiveSessionQuery(searchParams)`.

Server reads accept an optional `Authority` (from `@/lib/supabase/authority`) so the bearer-token API runs them as the token's user; `sessionAcademy(sessionId)` resolves a visible session's academy. `v1.ts` builds the `/api/v1` session responses (see [sessions/attendance OpenAPI](../../../docs/api/sessions-attendance.openapi.yaml)).

HTTP (cookie session):

- `GET /api/sessions?academy=&cursor=&limit=` → `{ sessions: LiveSession[], nextCursor: string | null }`
- `GET /api/sessions/history?academy=&q=&from=&to=&archive=&cursor=&limit=` → `{ sessions: PastSession[], nextCursor: string | null }` (ended and auto-closed, newest first; `from`/`to` are inclusive academy-time days (YYYY-MM-DD) of the start; `q` searches class, group, level, program, and starter name; `archive` is `active` (default), `archived` or `all`)
- `GET /api/sessions/<id>?academy=` → `SessionDetail` (session snapshot, lifecycle, and roster)

`metadataVersion` is the session's own version (incremented on lifecycle and archive changes). Session archival fields are named `sessionArchivedAt` / `sessionArchivedByName` to keep them distinct from a roster entry's student `archived`. Attendance must keep its own revision.

Web paths: /<academySlug>/attendance, /new and /<id> on the staff host; internal routes are under /app/[academySlug]/attendance.

Starting, ending, archiving and restoring sessions are web-only server actions; the `/api/v1` token API does not expose them. Its session detail adds `session_archived_at`, `session_archived_by_name` and `archive_note`.
