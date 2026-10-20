# Taught content — EDRA-138

The staff session detail page composes `ContentTaughtSection` through the content module's public API, above attendance. It reads and saves a session's taught units; it does not implement student learning grants. All active staff may edit until attendance is first finalized, in an open year and an unarchived session. Live and ended sessions are supported. Links are optional, including at finalization.

## Authority and history

Migration `20261019210000_session_content.sql` adds append-only sets/items and private retry receipts. Every RPC verifies current staff authority and academy context. Authenticated clients have read-only RLS access to history and no direct mutation/receipt grants. A save locks the session using the attendance protocol, then checks year, archival, first finalization and the reviewed content revision. New selections must be published and cover the captured session grade/track in the same academy/year. Source rows are locked in stable UUID order against concurrent publication/archival.

Each set records its actor/time, order, selected published content revision and saved title. Unchanged retained items remain valid if their source is subsequently archived or republished; history never follows an edited draft. Keeping a selection is distinct from newly attaching an archived source. The staff-only `session_taught_content` view resolves the latest saved set for future trusted consumers. Once attendance has a publication, the set—including an empty list—is frozen for this slice. Closed years and archived sessions remain read-only. No revocation policy or post-finalization correction flow is inferred.

Every changed save bumps the existing attendance revision. A finalization opened before that change fails as stale; if finalization wins the session lock, a later save fails as locked. Per-actor request keys serialize concurrent retries and retain the original acknowledgment after later changes, finalization or year closure. A successful no-op gets a receipt without another history set or attendance revision.

## UI and contracts

`types.ts` validates trusted inputs/results and defines account/academy/session-scoped cache keys. `data.ts` owns live membership, RPC calls, paginated options and safe error mapping. `actions.ts` exposes cookie-authorized server actions. The session route composes the public UI; no new native API is introduced.

The picker preserves unsaved choices on failures, rejects duplicate selections, supports search, explicit refresh, a 200-unit limit, and confirms discarding edits. An updated saved revision requires an explicit reload; background refresh never overwrites local edits. Loading/error/empty/locked states are visible. Finalization displays the selected taught units and warns that the list will lock. Successful saves invalidate attendance; finalization and archive/restore invalidate taught-content reads. Server checks remain authoritative when another device changes state before the next refresh.

## Verification — 2026-10-19

- The additive migration is applied and recorded in both development and the marked isolated cloud; database types are regenerated from development.
- The rollback `session_content.sql` suite passes: role/grant/RLS checks, picker scope/pagination, instructor and ended-session editing, no-op/retry/conflict semantics, stale attendance review, version/title preservation, first-finalization and empty-list locks, archival/restoration, year closure, suspended staff and cross-academy denial. All fixtures roll back.
- Production build and TypeScript pass. The regular suite passes 579 tests, with one provider test opt-in/skipped. The full Windows suite uses 60-second test/hook limits for existing shell tests. Lint has zero errors and fourteen pre-existing warnings outside this slice.
- The signed-in browser verified the section, picker empty state, finalization summary and immediate locked state on the empty `EDRA-138 verification` class. No student's attendance was changed. The verification session and schedule are archived; the labeled group and preserved history remain under existing dependency guards.
- Existing attendance and session-archival rollback cloud suites also pass after this migration. The CI runner safety tests are rerun after registering the new suites.
- Five separate-connection races are added to the existing `concurrency.sh` CI harness: save/finalize in both orders, duplicate retry, session archival and source archival. A manual cloud attempt using simultaneous CLI temporary logins could not complete because the CLI rotates their shared password; no race pass is claimed. CI's stable PostgreSQL connection must verify these races. Its random isolated fixture academy is retained under the repository's history policy; no provider assets were created.

EDRA-149/150 and replacement-attendance work must consume the stable session/unit context and existing archival effect-claim contract. Recording content does not consume the outbox, issue access, reset access periods, send parent messages or modify captured rosters.

## Continuing on another computer

Handoff verified on 2026-10-20 after merging main through `55579a6`: TypeScript passes; 613 automated tests pass with one opt-in skip; lint has zero errors and eight existing warnings. Both merged database shell scripts pass syntax checks. The production build and cloud rollback evidence above predate this main integration; the five parallel database races still need CI evidence. Work is committed and pushed on `zohdy/session-content`.

Fetch and check out `zohdy/session-content`, then read root/web AGENTS.md, `web/docs/README.md`, this reference and the affected session/attendance module READMEs. Use `zohdy/` for new branch names. Refresh main and incorporate its latest commits before new implementation; preserve any local work first. The owner prefers autonomous implementation of this agreed scope and concise updates.

Install the lockfile dependencies inside `web/` with `npm ci`. Restore the ignored `web/.env.local` through the team's secure secret-sharing method, using `.env.example` as the variable inventory; credentials are not carried by Git. Developers sharing the same cloud project need the same staff invitation encryption key to recopy existing links. Keep Mux/signing/service-role keys server-only. Local development uses the existing cloud project and `lvh.me` origins; do not start a local Supabase/Docker stack. Follow `web/README.md` and the current deployment guide rather than copying Windows-specific paths from this chat.

`20261019210000_session_content.sql` is already applied and recorded on the configured development and isolated cloud projects. Do not rewrite or blindly replay it; later corrections require another migration. Generated types belong to the actual development schema. Existing verification evidence above is dated and is not proof a later checkout has passed.

EDRA-138 is In Review. The remaining verification is the five new real PostgreSQL race scenarios in `supabase/tests/concurrency.sh`; run through the approved isolated-target runner/CI, with stable credentials rather than simultaneous temporary Supabase CLI logins. Do not claim a race pass from the sequential rollback suite. After review, EDRA-149 (entitlement ledger) and EDRA-150 (attendance grants) are the next integrations; student access, playback and post-finalization content corrections are not delivered here.
