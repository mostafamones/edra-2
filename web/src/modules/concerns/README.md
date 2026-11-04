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
empty. Participant management, Owner recovery, settlement/reopening (EDRA-292), the panel
(EDRA-295) and notification delivery (EDRA-296) are not implemented here. Generated database types and
database assertions are verified against the disposable CI database, not a shared
cloud reset or local developer stack.

Current verification limits: messaging SQL/concurrency assertions await the next disposable CI
run. RPC TypeScript signatures are provisional manual additions; replace them with the CI
`database-types` artifact, including the new tables. Multi-user Realtime delivery is unverified.
Presence typing is advisory and client keys can impersonate another participant; it must become
server-attributed before final delivery. Existing channels may retain access to activity hints and
presence until reauthorization; message content always requires a fresh authorized read. These
live-state limitations remain explicit integration work, not completed acceptance criteria.
