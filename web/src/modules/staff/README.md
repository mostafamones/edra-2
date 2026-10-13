# Staff module

Current implementation reference for academy staff invitations and team management. Intended rules are in [accounts and staff](../../../docs/product/domains/identity-and-staff.md) and the [permission matrix](../../../docs/product/permissions.md).

## Roles and authority

Roles are `owner`, `head_admin`, `admin` and `instructor` (shared contract: `modules/academies/roles.ts`). `public.staff_role_can_invite` is the single appointment/management matrix:

| Actor | May appoint and manage |
|---|---|
| Owner | Head Admin, Admin, Instructor |
| Head Admin | Admin, Instructor |
| Admin | Instructor |
| Instructor | Nobody |

A role change needs authority over the member's current role and the proposed role, so an Admin cannot promote an Instructor and a Head Admin cannot change a peer. Nobody manages the Owner or themselves. Every actor check uses the actor's own active membership (`academy_role_for`), never a cached or client-supplied role. `permissions.ts` only shapes the UI.

## Suspension

`suspend_staff_member` / `restore_staff_member` set or clear `academy_memberships.suspended_at` (with `suspended_by`). The row, role and attribution are kept; restoration reinstates the retained role and never inserts a membership (a removed member needs a new invitation). Changing a suspended member's role does not restore access. Repeats return `unchanged`. Each completed suspension, restoration and role change is recorded in the restricted `edra_private.staff_access_events`.

`academy_role_for`, `is_academy_member` and `shares_academy_with` ignore a suspended caller's membership, so every RLS, Storage, Realtime and RPC check built on them denies the next request. Active staff still list suspended coworkers and their profiles. A suspended person's own row is hidden from them; `own_suspended_staff_academies` discloses only their own suspensions so the app can explain the state instead of offering an old invitation. Suspension is academy-scoped: the account and other academies are unaffected.

## Invitations

Seven-day expiry, one pending invitation per academy/phone, verified matching phone and explicit acceptance are unchanged. Owners and Head Admins manage invitations for roles they may appoint; Admins review all and copy/revoke only their own Instructor invitations. An invitation cannot be accepted while its creator lacks active authority for its role (suspended, removed or demoted); after restoration a still-valid invitation is evaluated normally. Acceptance never changes or restores an existing (active or suspended) membership.

## Locking and events

Membership changes take the target advisory lock (`academy_membership:<academy>:<user>`, shared with acceptance), then the actor and target rows in `user_id` order (`edra_private.lock_staff_memberships`). Acceptance takes the invitation row, the recipient advisory lock and the creator row. Committed changes send `staff_role_changed`, `staff_suspended`, `staff_restored` or `staff_removed` on the member's private `staff-membership:<user>:<academy>` channel with only `{ academyId }`; the web `MembershipGuard` treats them as hints and rereads authority (also on focus, reconnect, navigation and a 15-second poll).
