# Concerns

Product authority: [concern threads](../../../docs/product/domains/concerns.md).

The foundation migration owns `concerns`, `concern_participants` and append-only
`concern_events`. Browser roles have participant-scoped reads and no direct writes.
`concern_has_access(academy, concern)` checks the current session, active academy
membership and participation; leadership has no implicit read bypass.

Trusted concern RPCs must call `edra_private.require_concern(academy, concern,
write, manager)` before reading or writing. It locks the concern row for lifecycle
serialization, checks live authority, and rejects writes while settled. Lifecycle
and membership commands must use the same lock. Read-state updates pass `false`
for write, allowing mandatory receipts on settled concerns.

Participants capture the academy membership creation timestamp. Removal and
rejoining the academy cannot silently restore participation; explicit addition
updates that captured identity. Suspension denies access through the live
membership guard. Membership and lifecycle changes append events rather than
discarding history. New participants can read the full retained conversation.

`contracts.ts` supplies limits, media descriptors and event/notification targets
for messaging, panel, media and notification slices. Media descriptors contain no
public URL; delivery adapters must recheck current authority. Durable events must
be inserted in the same transaction as the action, with a unique event identity.

## Messaging (EDRA-293)

`concern_messages` holds text, reply links and validated participant mentions;
`concern_reactions` holds emoji reactions; `concern_participants.last_read_seq/read_at` are the
mandatory, forward-only read receipts. Every write locks the concern, so each message gets the next
`seq` (stable order and paging) and every send/edit/delete/reaction gets a new `revision` from one
sequence, committed in order per concern. `concern_message_changes(after_revision)` therefore
recovers everything missed after a reconnect with no gaps or duplicates.

Commands (server functions in `actions.ts`, database functions of the same intent): `createConcern`
(minimum manager creation: title, opening message, selected active staff or whole-team snapshot,
creator included, atomic events), `sendConcernMessage`, `editConcernMessage` (author, 300 seconds by
the database clock), `deleteConcernMessage` (author, anytime while ongoing; text, mentions and
reactions removed, replies keep the placeholder), `setConcernReaction`, `markConcernRead`
(allowed when settled). Caller-chosen ids make every create/send retry return the original.
Conversation writes are refused on settled concerns. Sends, edits and deletions append durable
`concern_events` (ids and mentions only, no text) in the same transaction for notifications.

Browser reads (`queries.ts`) call `concern_detail`, `concern_messages_page`,
`concern_message_changes`, `concern_inbox`, `concern_unread` and `search_concerns`; each
rechecks live participation. Keys start with `["concerns", academyId, userId]`. A `forbidden`
read or command forgets that concern's cache. `useConcernLive` joins the private
`concern:<academy>:<concern>` channel; `useConcernInboxLive` joins `concern-inbox:<user>:<academy>`.
Broadcasts carry only ids and revisions, never content; typing is a database-attributed broadcast (see below), shown only for current
participants and expired on the viewer's clock. Channels rejoin every 20 minutes to re-run
authorization, and a degraded channel falls back to polling the change feed.

Attachments and voice notes (EDRA-294) extend the message `attachments` array, currently always
empty. Notification delivery (EDRA-296) remains separate integration work. Generated database types and
database assertions are verified against the disposable CI database, not a shared
cloud reset or local developer stack.

## Authority and lifecycle (EDRA-292)

Migration `20261105023758_concern_lifecycle.sql` adds, all under the shared concern lock:

- `add_concern_participants(academy, concern, user_ids, request_id)` and
  `remove_concern_participant(academy, concern, user_id, request_id)`: participating Owner/Head
  Admin/Admin, ongoing only. Added staff must be active academy members; adding captures their
  current membership identity, so readdition after removal or rejoining is always explicit. Added
  staff read the full history. Rows are never deleted: `removed_at/removed_by` hold current state,
  `participant_added`/`participant_removed` events hold the history. No role hierarchy beyond the
  product rule; instructors only participate.
- `settle_concern(academy, concern, outcome, expected_version, request_id)` and
  `reopen_concern(academy, concern, reason, expected_version, request_id)`: participating
  leadership; written note required (1–4000 characters). `concerns.version` counts lifecycle
  transitions only (messages and membership do not move it), so a decision made on an older state is
  refused as `stale`. Every outcome and reason stays in its `settled`/`reopened` event.
- `recover_concern(academy, concern, request_id)`: current academy Owner only (Head Admin/Admin get
  `forbidden`), targeted by id, allowed when settled. It appends `owner_recovered`, makes the Owner a
  participant and returns `{ recovered }` (false when already a participant). Nothing lists, searches
  or previews private concerns before recovery; inbox/search stay participant-only. No mute or
  subscription changes are made for the Owner.
- `concern_history(academy, concern)`: participant read of created/membership/recovery/settle/reopen
  events with names and notes, oldest first, without silent truncation.
- `concern_detail` now also returns `version`, `settledBy`, `settledByName` and `canManage` (the
  caller's live manager role; presentation only).

Request ids are reserved transactionally in a private request ledger, including successful no-op
commands, and recorded in changed-action events. A retry by the same actor with the same command
and payload returns current state; reuse with another actor, command or payload is `conflict`. A management refusal
for a participant who lost their role is `not_permitted` (the panel refreshes capabilities), distinct
from `forbidden` (access ended: the panel forgets the concern). Unknown recovery targets are
`concern_not_found` for the Owner only. Events are appended in the same transaction for the later
notification adapter (EDRA-296); nothing is dispatched here.

Typing is server-attributed: `set_concern_typing(academy, concern, typing)` checks live access (and
`ongoing` for `true`) and broadcasts `{ userId, typing }` with the caller's own id on the concern
recipient-specific topic. Presence policies on concern topics are dropped; clients can receive
broadcasts only. A private per-user tick limits repeated typing broadcasts on the server.

Revocation: a participant removal broadcasts `participants`, so an honest removed client refetches
detail, receives `forbidden`, forgets the concern cache and closes the conversation and its channel.
Suspension/academy removal is handled by the academy `MembershipGuard`, which unmounts the academy
scope. Delivery selects current active participants for personal channels
`concern:<academy>:<concern>:<user>` and the user's inbox, so an already-joined revoked socket
receives no subsequent message revisions or typing identities. Membership share locks order
delivery before suspension/removal. The removed participant receives only a content-free
revocation hint for client cleanup. Every read and command still rechecks access. This routing
has SQL/client assertions pending disposable CI and still needs true multi-user socket evidence.
Suspended participants remain visible in People for authorized removal, but cannot be mentioned,
shown as typing or receive activity.

## Floating text panel (EDRA-295, Batch 1)

`ConcernPanelProvider` mounts inside the persistent academy layout, under the existing auth and
QueryClient providers. It composes the existing shadcn FloatingSheet: modeless at desktop widths,
full-screen modal below 768px. The centered Dialog alternative would obscure the academy page;
the edge panel preserves navigation context and compact list/chat switching. React Activity keeps
an opened panel's local form/scroll state while collapsed and pauses its effects/subscriptions.
Nothing is persisted to browser storage. Academy/account/preview keys reset the entire panel;
cleanup cancels/removes the prior concern scope. Commands and incremental/older reads fence both
browser generations and replaced cache entries, including leave-and-return races.

Public activation: `useConcernPanel()?.openConcern({ academyId, concernId, messageId? })` returns
`opened`, `different_academy`, `unavailable` or `superseded`. It always rechecks current access
before displaying content, including when detail is already cached. A future notification adapter
must route to the appropriate academy before calling it, handle `different_academy`, and never
present notification payload text as current authorized content. ID-only message activation pages
until the message is found; search supplies the sequence for a more direct historical page read.
`loadConcernPage` and `loadConcernTarget` are also public loaders. Callers of the latter provide a
current-scope fence for navigation work. Search jumps bridge missing pages and preserve the live
revision cursor/newer revisions. They do not acknowledge unseen newer messages.

Implemented UI: server unread totals on the collapsed launcher; paginated Ongoing/Settled inbox;
debounced permitted concern/message search; manager creation with active staff/whole-team snapshot
and automatic creator inclusion; text and explicit HTTP(S) links without enrichment; replies,
participant mentions, arbitrary emoji reactions, author edit/delete controls, edited/deleted states;
settled outcome/read-only presentation; live status, reconnect and generic advisory typing activity;
mandatory avatar receipts with name/time disclosure. Only intersecting messages in the open,
focused panel advance read state. Query/refetch failures preserve safe conversation state while
writes are disabled when detail authority could not be refreshed. Retry UI keeps create/send IDs
and payloads; unconfirmed commands cannot be edited into a duplicate attempt.

Component extension points: `panel.tsx` owns entry/list/create/chat composition and authorization;
`conversation.tsx` owns status/outcome/history/receipts; `composer.tsx` owns the text send attempt;
`message.tsx` owns author/reply/reaction controls. Add lifecycle commands to the conversation header
and outcome area, participant/history management as real authorized surfaces, media to the composer
and message body, and notification preferences/activation through the panel context. No placeholder
buttons claim those actions exist.

Lifecycle UI (EDRA-292): the conversation shows Messages/People/History tabs. Participating
leadership sees Settle/Reopen (written outcome or reason, kept through stale/failed attempts; an
uncertain result retries with the same request id and version) and, while ongoing, Add people
(active non-participants from the staff catalog) and confirmed removal. History lists membership,
recovery, settlements and reopenings with their notes. Every participant can copy the concern ID.
The Owner gets a Recover concern view (ID or any link containing it) and, when an opened concern is
denied, a prefilled recovery form; recovery then reopens through the access-rechecking activation.

Still required before EDRA-295 completion: mute and browser push controls plus actual in-app/browser
notification routing/delivery; attachments, image/PDF/download and voice-note controls with real
upload/playback commands. Preserve the documented media limits. Typing remains labelled generically. Database types come from the disposable CI artifact for the messaging schema; the seven EDRA-292 RPC entries in `database.types.ts` were added by hand (provisional) and must be replaced by the next CI `database-types` artifact.

Acceptance contract/task notes are recorded on EDRA-295. Vitest exercises actual panel consumers
with one real QueryClient and mocked domain transport, including navigation/close persistence,
academy/account/preview and late results, retry IDs, editing/deletion/settled state, mentions/reactions,
remote search recovery/history jump and visible/focused receipts. Query tests cover optional-read
budgets, debounce/late searches, contiguous target windows/cursors and removed/recreated caches.
These are client interaction/cache checks, not multi-user backend or visual proof. No server,
local database or SQL fixture suite was started. Visual review (both themes, 360/1440px and reflow)
and the complete multi-user journey remain unavailable and required for final integration.


Batch-1 local verification (2026-11-05) uses the required placeholder public Supabase environment
for production builds. Lint has no errors and 12 unrelated baseline warnings; typecheck passes.
Targeted consumer/query/live/staff tests pass, with actual channel cleanup/reconnect simulated at
the client boundary. The parent must review and commit/push this slice before its CI evidence can
be attached to a new head. The existing draft PR remains #67; this slice does not mark the issue Done.
