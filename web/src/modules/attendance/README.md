# Attendance module contract

Attendance for a started session: draft inputs, positive check-ins, explicit publication with corrections, realtime collaboration, and the token API used by the future phone app. Schema: `supabase/migrations/20261005170000_attendance.sql`. Sessions (start, end, roster snapshot) belong to the sessions module.

## Rules (owner-confirmed 2026-10-05)

- Every roster student starts **Unknown** (version 0, no row). Inputs: Present, Late, Absent, Excused, or back to Unknown. Late is set by staff, or automatically by a check-in made after the caller's `lateAfterMinutes` deadline (measured from the session start; 0 or omitted disables it).
- Nothing marks students absent or publishes automatically, including ending a session. **Mark unrecorded absent** is an explicit bulk action for expected students of a mandatory class.
- **Check-in** (by record UUID, or by an academy-local student code resolved by the database in the same transaction via `check_in_attendance_by_code`; the HTTP/server-action contract accepts exactly one of `student_id`/`studentCode` or `annual_student_record_id`) is a positive input: Unknown → draft Present (`recorded`), or draft Late when `lateAfterMinutes` is above 0 and the check-in is later than that after the session start (a second versioned write; if it fails the student stays Present). Present or Late → `already_recorded`; nothing changes, including the first check-in time. Absent or Excused → `review_required`; nothing changes. Only roster students can be checked in: others get `not_on_roster` (same academy and year) or `student_not_found`. Code failures: `student_codes_disabled`, `student_code_not_found`, `student_code_retired`, `student_code_ambiguous` (API codes `STUDENT_CODES_DISABLED`, `STUDENT_CODE_NOT_FOUND` 404, `STUDENT_CODE_RETIRED`, `STUDENT_CODE_AMBIGUOUS`). A retry replays the original acknowledgment (stored with the resolved record and assignment for code requests), not the latest state; the UUID fingerprint is unchanged and the code fingerprint adds the tagged identifier and the Late-after option (omitted equals 0). The web scan field (`components/scan.tsx`) submits the exact code and shows only server acknowledgments.
- Check-ins work only while the session is live. After it ends, staff can still edit, bulk-change, and publish while the academic year is open. A closed year makes attendance read-only.
- Manual and bulk edits carry the `expectedVersion` the user saw. A stale version applies nothing and returns the current rows (`conflict`). Bulk changes are all or nothing (max 500).
- Every draft change bumps the session's monotonic attendance **revision** (separate from the session's `metadataVersion`). Publishing names the revision that was reviewed; a newer save makes it `publication_stale`.
- Publication snapshots what became official (`attendance_publications` + immutable items). Later edits are **pending corrections**; published values stay official until republished.
- Every write takes an idempotency key (UUID per action, reused on retry). The response is stored with the write, per user; a retry replays it; a key reused for a different request is `idempotency_conflict`. Conflicts and `review_required` are not stored. Records are kept (no expiry job yet).
- Locking: the sessions row first (`for no key update`, which serializes with `end_session`), then the academic year (`for share`).

## Publication effects (outbox only)

`attendance_effects` records official effects once per student and session: Present/Late → `explanation_access`; Absent on a mandatory class for an expected student → `absence_event`; Excused and Unknown → none. A correction that no longer supports an earlier effect records `revocation_review` (owner policy pending). **Nothing consumes the outbox yet**: no access is granted and no parent is notified until those modules exist.

## Realtime

Private Broadcast channel `attendance:<academyId>:<sessionId>`. A trigger on `attendance_sheets` sends `attendance_changed` with `{ session_id, revision, published_revision, publication_count }` after commit; clients refetch. `can_join_attendance_channel` checks topic shape, membership, and that the session belongs to the academy. Members may send presence only (no broadcasts). The web screen rejoins every 20 minutes, refetches on join, focus, and every 60 s, and polls every 15 s while realtime is down.

## Public API

Client-safe (`index.ts`): `recordCheckIn`, `saveAttendanceChanges`, `publishReviewedAttendance` server actions; `fetchAttendance` and query keys; types.

Server (`server.ts`): `getAttendance`, `checkIn`, `changeAttendance`, `publishAttendance` (each takes an optional `Authority`; default is the cookie session), and the `/api/v1` response builders.

HTTP: `GET /api/sessions/<id>/attendance?academy=` (web, cookie) and the bearer-token `/api/v1` endpoints documented in `docs/api/sessions-attendance.openapi.yaml`.

Web route: `/app/sessions/<id>/attendance` (linked from session details and the history menu as **Take attendance** / **View attendance**).
