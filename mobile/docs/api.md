# Native API integration

The API contract is owned by [web](../../web/docs/api/README.md). Current endpoint names use snake_case; native models decode those fields rather than rename the backend contract. Product words such as Finalize and Announce do not require renaming existing publication endpoints.

## Current iOS adapter

Core/Networking/APIClient.swift uses an ephemeral URLSession without cookies, obtains a bearer token per request and retries once after forced refresh on 401. POST/PATCH take a caller-created Idempotency-Key reused for the logical action. Cancellation surfaces as `APIError.cancelled`, distinct from `.network` (a cancelled token refresh is not treated as signed out); 401/403 have typed handling and other failures surface the backend message where available. The transport is injectable so tests can complete requests in any order.

The decoder converts snake_case and parses ISO dates. Keep request CodingKeys explicit where needed. Attendance uses expected versions/revisions: conflict means review the returned/current state, not retry with invented versions.

Request ownership: cancellation is best effort; correctness comes from explicit checks after every suspension point.

- `AccountScope` (Core/Auth) lives for one signed-in account and ends before sign-out clears state. Models check it before committing, and their 401 callback signs out only that scope, so a late answer from an earlier account cannot sign out or populate the next one.
- `AcademyContext` is the selected academy plus a selection epoch; A → B → A yields a new context. `AcademiesModel.isCurrent(_:)` gates academy-scoped work.
- `AcademiesModel` commits only its newest load. It keeps a still-granted current selection, then the remembered one (only if the server grants it), then the first academy; it never restores an academy from cache. Network/server failures keep the granted list (not evidence of revocation).
- `SessionsModel` and `SchedulesModel` commit only their newest load for the current context; a stale 401/403 neither signs out nor clears a newer context. An older page load cannot reset a newer load's busy state.
- On a context change the shell returns to Sessions, leaves both destination stacks and resets the start flow (retry key, picker, pending navigation). Reselecting the current academy changes nothing. The Assessments tab is a placeholder that makes no requests until EDRA-79.

These are source behaviors with deterministic unit tests (EdraInstructorTests/RequestOwnershipTests.swift, StartSessionTests.swift); see the README for which checks have actually been run.

## Starting a session

"Start session" on the Sessions tab opens a picker of `GET /api/v1/academies/{id}/schedules` (title search, offset pages loaded on scroll, "Planned today" grouping only, academy time zone noted when it differs). Choosing a schedule asks for confirmation, then `POST /api/v1/academies/{id}/sessions` with one Idempotency-Key per logical start. The key is kept for that academy/schedule until acknowledged: a dropped response shows the outcome as unknown and Retry resends the same key; a different schedule is a new start. Duplicate submission is blocked while in flight. `started`, `existing` and `replayed` all refresh the live list and, if the picker is still open and the context is current, open the server-returned session; the session screen shows Ended or Archived state from the server rather than presenting a replay as newly live. A 403 revalidates academies; a 401 uses the existing sign-out flow.

## Current surface and limits

The native source calls academy/session/attendance reads, startable-schedule reads, session start, check-ins, attendance changes and attendance publication. The staff HTTP contract also exposes assignment reads/part marks and code resolution. Session end/archive/restore and individual result announcement remain web actions in the HTTP surface; required future native operations need a backend plan, not invented endpoint names. The start and schedule endpoints exist in source; a deployed server must include them before the app can use them.

Keep backend errors, retry identity and authority aligned with OpenAPI/handlers. The source enforces owner/head_admin/admin/instructor roles (decoded as a string; the app uses server-provided permitted actions, not role checks). A 403 revalidates `/api/v1/academies`: a suspended or removed academy drops out, the app leaves its session screens and discards their retry keys, and other academies and the signed-in account are unaffected. An archived session (web-managed by Owners, Head Admins and Admins) arrives with `session.archived_at` set and all permitted actions false: the session screen shows an "Archived · not counted" banner, drops pending retry keys, and the scanner refuses to start; writes return `409 SESSION_ARCHIVED`. Returning from a session screen reloads the live list. Later product rules remain intended scope. Source inspection does not verify deployed API/schema compatibility, secure token persistence or device behavior.
