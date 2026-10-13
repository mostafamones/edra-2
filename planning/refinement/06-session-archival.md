# Session archival and restoration — follow-up to R01

Claude implementation handoff, prepared 2026-10-13. This follows history preservation (R01); the separate R06 level-wide placement task is outside its scope.

## Intended outcome

Managers can archive a mistaken session so it stops affecting attendance and disappears from normal lists, while its roster, saved marks, official snapshots and audit evidence remain available. Managers can restore it. No session or attendance history is hard-deleted.

Owner confirmed on 2026-10-13:

- Owner, Head Admin and Admin can archive and restore; Instructor cannot.
- Archive ends a live session and archives it atomically.
- Archived attendance is excluded from totals; issued learning access and sent-message history are preserved; pending unprocessed effects are stopped.

The affected product references have been updated with these decisions. Existing closed-year read-only rules still apply. Restoration lifts the exclusion without reopening the session, re-finalizing attendance, restarting grants or resending messages.

Implement in a separate implementation thread. No implementation, migration or cloud mutation was performed when drafting this plan.

## Required reading

- Root `AGENTS.md`, `web/AGENTS.md`; `mobile/AGENTS.md` for native compatibility work.
- `web/docs/engineering.md`, `docs/engineering/application-boundaries.md`, `web/docs/api/README.md` and applicable module READMEs for sessions/attendance.
- Assigned final product sections: `sessions-and-attendance.md` — “Ending a session,” “Finalizing attendance,” “Corrections,” “Replacement attendance,” “Permissions and history” and “Session archival and restoration”; `product/permissions.md` — session/attendance rows; `learning-access.md` — “Explanation access and duration” and “Suspension and revocation.”
- Only the confirmed archival paragraphs in `report-metrics.md` and `messages.md` are requirements for this slice. Their formulas, provider policy and other working-draft proposals remain unresolved.
- `web/docs/api/sessions-attendance.openapi.yaml`, `mobile/docs/api.md`, `mobile/docs/engineering.md`, `mobile/README.md` for existing bearer/native integration.
- Relevant installed Next.js documentation before editing web code. Use applicable Supabase migration/cloud practices under repository guidance.

Root `plans.md` and temporary review queues are excluded. Do not build unrelated reporting formulas, content services, message providers, replacement attendance or native staff management.

## Baseline and discrepancies

Source inspected at commit `4af654313a82e4799c0eb4f6d98e6542d528b267`, with uncommitted session-history, icon, empty-state and native wording changes. Preserve them. `20261013100000_preserve_session_history.sql` is present as current work; do not replace it or reintroduce the retired delete RPCs.

Current source has Live/Ended session state and no session archive metadata. `protect_session_write` in `20261005120000_live_sessions.sql` rejects any update to an ended session, so adding an archive button alone cannot work. Live uniqueness depends on `state = 'live'`.

History RPC `20261005160000_session_history_range.sql` and web queries have no archival filter. `use-start-data.ts` uses past sessions to decide which schedules already ran today; archived mistaken sessions must not suppress an upcoming schedule. Existing roster-entry `archived` means the student record is archived, not the session.

Attendance finalization writes immutable publications and an outbox (`20261005170000_attendance.sql`), with effects once per student/session. Its current README says no access/message consumer exists. Reports, material recovery and issued-grant delivery are not complete features in the inspected tree. This task must establish the archive eligibility contract without claiming those downstream flows now run.

## Product behavior to implement

1. **Separate archival from lifecycle:** keep Live/Ended. Archival is an orthogonal exclusion on an ended session. Archiving live performs the ordinary end semantics in the same transaction, then applies archival. No automatic absence/finalization. An expired live session uses existing expiry semantics rather than inventing another end reason.
2. **Retention:** all session identity/start/end facts, roster snapshots, draft values, official publications/items, effects and idempotency receipts stay stored. Archive/restore audit is separate from attendance history.
3. **Read-only archive:** attendance mutations, check-ins, bulk edits, finalization and corrections are denied for an archived session. Read authorized detail/history with a clear Archived badge and exclusion explanation. Preserve existing tenant and closed-year protections.
4. **Current year only:** archive and restore require an open academic year. Exceptional closed-year repair remains separate. Suspended/removed staff lose access under R05 where implemented.
5. **List behavior:** normal history defaults to unarchived; add Archived and All filters. Live lists exclude archived sessions. Authorized staff may inspect archived history. Archive does not archive the schedule/group or affect other sessions.
6. **Counting:** exclude the whole archived session from every attendance count, rate, absence summary and material-recovery projection. Do not convert marks to Excused/Unknown or change a denominator by mutating stored values. Preserve history inspection separately from counted attendance.
7. **Restoration:** session stays ended. Existing official attendance counts again; unfinalized drafts do not become official. Ordinary ended-session editing is available again while the year is open. Original end facts and start retry identity remain unchanged.
8. **External effects:** no automatic revocation of issued grants or deletion of sent-message records. Stop still-pending unprocessed session effects. Restoration itself must not generate/replay access grants, restart their issue/expiry time or reannounce attendance. Future ordinary processing must use original effect identities/current eligibility, not an archive-toggle backfill that silently sends old messages.

## Database and service implementation

### A. Archive metadata and audit

Add a corrective migration with session-level archive metadata (`archived_at`, `archived_by`, optional bounded note) and a durable archive/restore event trail. Metadata version increments on actual transitions; repeated unchanged requests do not add duplicate audit entries. Existing sessions migrate as unarchived. Record actor/time without making free-text justification mandatory.

Preserve current immutable identity and end snapshots. Amend `protect_session_write` narrowly to allow only the approved archive transitions/metadata on ended sessions and legitimate Live → Ended changes. Never loosen arbitrary updates to ended facts, rosters or publications. Enforce archived implies ended and valid metadata shape. Direct client updates are not an archive API. Keep delete/truncate guards and deny-only legacy deletion functions intact.

### B. Trusted atomic archive/restore operations

Add public session services and explicit database RPCs. Validate academy/session IDs, live actor membership/manager role, open year, expected metadata version and action retry identity. Same key/same request replays the original result; reused key/different action or version fails. A stale version changes nothing and returns a reviewable conflict. Retrying a prior Archive after a later Restore must not archive again.

Lock the session first, then year consistently with attendance operations. Serialize archive with check-in, correction, finalization, end and future effect consumption. No race may create new attendance work/effects on an already archived session. Inspect the existing schedule-first start lock and session expiry paths before adding nested calls; do not introduce conflicting lock order through calling an end function without accounting for its locks.

For a live session, end and archive in one transaction. A failure leaves both unchanged. Archiving an ended session never changes its original ended time/actor/reason. Restore removes archive metadata, appends audit and increments metadata version; it never performs Ended → Live.

Use Owner/Admin now and Head Admin through the shared four-role contract once R05 is implemented. Coordinate with R05 rather than add a second role enum/authorization system. Do not claim Head Admin support complete before its schema/live membership enforcement exists. Scope this task's new permission to managers; normal attendance stays available to all staff on nonarchived sessions.

### C. Attendance eligibility and outbox suppression

Add an archive check to every attendance mutation RPC/adapter, including UUID/code check-in, bulk/manual edits and finalization. Backend response capabilities reflect archived read-only state. Stored successful receipts may remain replayable as historical acknowledgments under existing identity/authorization semantics; a replay cannot execute a fresh write.

Expose a server/database authoritative eligibility predicate or small session contract for **counted attendance** and **pending session effects**. All current/new consumers must use it. Keep immutable outbox rows; suppression/eligibility metadata belongs outside publication snapshot content. When no consumer exists, implement/test the eligibility contract and describe that limit accurately instead of building a pretend delivery service.

Future workers check status under a serialized claim/dispatch boundary. Archival stops not-yet-dispatched effects; provider requests already dispatched cannot be recalled. Retain delivery outcome/uncertainty and issued grants. Do not alter unrelated coupon/manual grants, trigger revocation, create compensation messages or decide ordinary attendance-correction policy in this task.

Where reporting/replacement modules exist by implementation time, update their session joins to exclude archived sources while preserving historical relationships. If absent, document the authoritative contract and test representative finalized-data projections. Do not implement the draft attendance formula or a full parent report. Restore counts original official records again, without a new publication/outbox event.

## Web, API and native integration

Primary source anchors:

- `web/src/modules/sessions/{actions,data,types,errors,queries,index,server,v1}.ts`.
- `web/src/modules/sessions/components/{sessions-page,history-card,details-page,facts,live-card,use-start-data,use-start-session}.tsx` / relevant `.ts` hooks.
- `web/src/app/api/sessions/history/route.ts` and session/attendance read routes.
- `web/src/modules/attendance/{data,types,errors,v1}.ts` and attendance components.
- Session lifecycle/history and attendance SQL migrations/tests; current preservation migration.

Use web server actions for Archive/Restore and existing shadcn dialogs/menus outside protected primitives. Add a confirmation with live-session ending, student/official-attendance impact and preserved external effects. Display affected record counts from trusted data; do not claim delivered messages or issued access when no consumer exists. Confirm success only on server acknowledgment, retaining retry identity for uncertainty.

Add archive filter to history request parsing/RPC/query keys and reset paginated cursors on filter changes. Preserve existing search/date filters. Include archival metadata/status in authorized session/attendance detail projections; choose explicit names to distinguish student `entry.archived` from session archival. Show archived history/detail and restore permission, with no active attendance controls. Empty filtered lists replace the whole table/container if a table is used.

Invalidate/refetch live/history/detail/attendance and upcoming schedule calculations after a transition. Send or use appropriate session metadata notifications so another open web/native attendance screen becomes read-only; existing attendance-sheet notifications alone may not fire on session archival. Keep fallback focus/polling/reconnect refresh. Prevent a late response from another user/academy/session from repopulating current state.

Old start-key retry still returns the original now-archived session as historical/replayed, never opens a new one or restores it. Starting the schedule again after archival uses a new key and creates the ordinary new live session. Review `use-start-session` behavior so uncertain start retries cannot silently lead a user into writing to the archived original.

Update bearer detail schemas/error/capability responses additively and keep existing endpoint paths, attendance publication names and outcome semantics. No native archive-management API is required by this web-management slice. Existing native clients must treat archived details/capabilities as read-only, clear pending attendance/scan inputs and refetch live lists on confirmed archival. Preserve ordinary ended-session attendance editing for nonarchived sessions. Review current `SessionDetailModel` capability checks; do not rely solely on backend rejection or change a field shared with student archival by accident.

## Verification

Use existing Vitest, SQL and native setups. Verify:

- Manager archive/restore works; Instructor/self-appointed roles/nonmember/cross-academy/suspended actors fail. Closed-year actions fail.
- Live archive atomically ends, frees schedule live uniqueness and preserves all rows; no absence/finalization occurs. Ended archive preserves original end facts; restore never reopens.
- Archived drafts cannot be edited/finalized; check-in/manual/bulk/direct authenticated RPC paths agree. Roster/publication/effect history and delete-denial tests remain intact.
- Finalized attendance is excluded from counts while archived and restored from the same official values on restore. Drafts/private corrections remain private; optional/excused/unknown semantics are unchanged.
- Issued grants retain original identity/timing. Sent/uncertain delivery records stay intact. Pending consumers cannot claim archived effects, restore has no duplicate grant/message/publication event, and independent grant sources are untouched.
- Retry Archive → Restore → retry original Archive returns the historical result without changing current restored state; stale version and conflicting idempotency keys do not partially write.
- Concurrent archive versus finalization/check-in/end/new schedule start, year closure and worker claim has a deterministic valid outcome with no deadlock or postarchive new write. Repeated archive/restore retains audit history.
- Search/date/archive filters, pagination/cache keys, upcoming schedule eligibility, no-result states and old direct links work. All staff can inspect archived history; mutation buttons reflect capabilities.
- Web/native already-open screens stop actionable attendance and drop stale pending inputs after refetch/event; same schedule can run a new session; old start retries do not reopen the original.

From `web/`, run required lint/build plus typecheck/tests and affected cloud SQL/concurrency checks. Use the current explicit isolated-cloud test runner; do not reset shared targets or start local Supabase. Regenerate database types and check OpenAPI/builders. For native changes, use available README build/test checks and report unavailable device/runtime evidence precisely. No provider deployment, production messaging, native signing/distribution or destructive cleanup is authorized here.

## Delivery and documentation

Ship additive schema/services with archive-aware reads/capabilities and mutation denial before exposing management controls. Preserve concurrent R01 and R05 changes. If an effect consumer appears since this baseline, include its archive gate in the slice; do not release an archive control that counts less attendance while workers still process excluded sessions.

Update module READMEs and HTTP/native integration docs to actual source support. Approved product archival rules already live in sessions, permissions, access and confirmed reporting/messaging paragraphs. Correct factual source/deployment status without expanding their draft formulas/provider policies. Report migration order, altered contracts, checks, archived count behavior, effect-consumer limits and any remaining cloud/device gap.

Suggested Claude instruction:

> Implement `planning/refinement/06-session-archival.md` in an implementation thread. Use its assigned final references and approved archive decisions. Preserve existing history-protection and concurrent role/UI work. Implement reversible manager archival, counting exclusion, read-only archive enforcement, atomic live-session ending and safe pending-effect eligibility. Retain all history and existing external effects. Complete the stated verification and report unverified environment paths separately.
