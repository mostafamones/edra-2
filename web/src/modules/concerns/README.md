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

This initial prerequisite does not yet implement the complete EDRA-292 lifecycle,
messaging, media, panel or notification experience. Generated database types and
database assertions are verified against the disposable CI database, not a shared
cloud reset or local developer stack.
