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
Broadcasts carry only ids and revisions, never content; typing uses presence, shown only for current
participants and expired on the viewer's clock. Channels rejoin every 20 minutes to re-run
authorization, and a degraded channel falls back to polling the change feed.

Attachments and voice notes (EDRA-294) extend the message `attachments` array, currently always
empty. Participant management, Owner recovery, settlement/reopening (EDRA-292) and notification delivery (EDRA-296) remain separate integration work. Generated database types and
database assertions are verified against the disposable CI database, not a shared
cloud reset or local developer stack.

Current verification limits: messaging SQL/concurrency assertions passed the disposable CI run
41902873421 at base HEAD `084a24c8`; the uncommitted panel changes have no CI run yet. The parent replaced provisional RPC signatures with the actual `database-types` artifact from
that disposable CI run, including all concern tables (trailing blank line normalized). Multi-user Realtime delivery is unverified.
Presence typing is advisory and client keys can impersonate another participant; it must become
server-attributed before final delivery. Existing channels may retain access to activity hints and
presence until reauthorization; message content always requires a fresh authorized read. These
live-state limitations remain explicit integration work, not completed acceptance criteria.


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

Still required before EDRA-295 completion: participant add/remove, Owner recovery, settlement and
reopening with recorded reasons/history; mute and browser push controls plus actual in-app/browser
notification routing/delivery; attachments, image/PDF/download and voice-note controls with real
upload/playback commands. Preserve the documented media limits. Typing identity remains untrusted
and generic; server-attributed typing and prompt live revocation remain authority/final integration
gaps. Database types now come from the disposable CI artifact for the messaging schema.

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
