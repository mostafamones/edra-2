# Sessions module contract

A session is the live class instance a staff member starts from a schedule to take attendance. It is never generated in bulk or ahead of time. Schema: `supabase/migrations/20261005120000_live_sessions.sql`.

## Rules (owner-confirmed 2026-10-05)

- Any owner, admin, or instructor may start a session from any active schedule (recurring or one-off) at any time. Planned weekday/time never gates starting.
- At most one live session per schedule. Starting a schedule that already has a live session returns that session (`outcome: "existing"`). There is no per-day restriction.
- Retries with the same `startKey` by the same actor return the same session (`outcome: "replayed"`); reusing a key for another schedule fails with `idempotency_conflict`.
- Any staff member may end a live session. Ending is final (no reopen), never marks absence, and never publishes attendance. A live session can still be ended after its academic year closes.
- A live session closes itself 90 minutes after the planned end of the schedule time closest to its start (today, academy time; with none today, 90 minutes after the start; never sooner than 90 minutes after the start). Closing is lazy: `list_live_sessions` and `get_session` already report an expired session as `ended` (`endReason: "auto"`, no `endedBy`), and the next start or end materializes it. Part 2 must treat a session past `autoEndAt` as ended and must call `public.expire_sessions(schedule_id)` (or check `auto_end_at`) after locking the session row.
- Starting captures the roster atomically: every active **in-person** annual record matching the audience (online-only students are excluded), `expected` for mandatory schedules and `eligible` for optional ones, with a placement snapshot. Schedule edits and placement changes never rewrite a started session.
- Writes go through `start_session` / `end_session` RPCs only; reads are RLS-scoped to academy members. Sessions and roster entries are never deleted.
- Locking: `start_session` locks the schedule row, then the academic year. Every workflow on an existing session (ending now, attendance later) locks the `sessions` row first.

## Public API

Client-safe (`index.ts`): `startSession`, `endSession` server actions; `fetchLiveSessions`, `fetchSession` and query keys; `LiveSession`, `SessionDetail`, `RosterEntry` types.

Server (`server.ts`): `listLiveSessions({ academyId?, cursor?, limit? })` (omit `academyId` to list every academy the caller belongs to; newest first; keyset cursor; limit 1–100, default 50), `getSession(academyId, sessionId)`, `readLiveSessionQuery(searchParams)`.

Server reads accept an optional `Authority` (from `@/lib/supabase/authority`) so the bearer-token API runs them as the token's user; `sessionAcademy(sessionId)` resolves a visible session's academy. `v1.ts` builds the `/api/v1` session responses (see `docs/api/sessions-attendance.openapi.yaml`).

HTTP (cookie session):

- `GET /api/sessions?academy=&cursor=&limit=` → `{ sessions: LiveSession[], nextCursor: string | null }`
- `GET /api/sessions/history?academy=&q=&from=&to=&cursor=&limit=` → `{ sessions: PastSession[], nextCursor: string | null }` (ended and auto-closed, newest first; `from`/`to` are inclusive academy-time days (YYYY-MM-DD) of the start; `q` searches class, group, level, program, and starter name)
- `GET /api/sessions/<id>?academy=` → `SessionDetail` (session snapshot, lifecycle, and roster)

`metadataVersion` is the session's own version (incremented on lifecycle changes). Attendance must keep its own revision.

Web routes: `/app/sessions` (live now, upcoming today as faded quick-start cards, and searchable history cards; the Start session button opens a dialog with a schedule select), `/app/sessions/new` (the sessions page with the start dialog open), `/app/sessions/<id>` (details). **Take attendance** links to `/app/sessions/<id>/attendance` (the attendance module).

Starting and ending sessions are web-only server actions; the `/api/v1` token API does not expose them.
