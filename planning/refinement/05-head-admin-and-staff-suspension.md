# R05 — Head Admin and staff suspension

Prepared 2026-10-13 for Claude implementation in a separate implementation thread.

## Outcome and scope

Implement the approved four-role staff model and temporary academy staff suspension across the existing product. An active Head Admin can perform ordinary Owner-level academy operations except Owner-reserved staff/academy actions. A suspended member retains their membership and historical attribution but cannot use that academy's staff data or operations. Restoration reinstates the retained role. Another academy and the person's Edra account remain unaffected.

Deliver this as one coordinated feature with staged migrations and commits, rather than release an enum/UI change before authorization is complete. Backend, web team management, existing domain permissions, bearer contracts and current native access handling are in scope. Do not build new content, reporting, booking, student suspension, academy deletion/closure or native staff-management features merely because the permission matrix lists them.

This plan is self-contained. Root `plans.md`, review queues and unresolved draft discussions are not implementation requirements. No application implementation, migration or delegation was performed while preparing it.

## Baseline and concurrent work

Inspected commit: `4af654313a82e4799c0eb4f6d98e6542d528b267`. The worktree is not clean: session-history preservation, student table rendering, icon migration and web/native attendance wording changes are present, including `20261013100000_preserve_session_history.sql`. Preserve them and recheck their final state before implementation. Do not stage, commit, overwrite or rewrite another worker's changes.

The cloud-compatible runner now exists at `web/scripts/db-test.sh`, with `EDRA_DB_TEST_URL`, `EDRA_DB_TEST_TARGET`, a target marker and suite selection. Read its current contract rather than invoke the retired local-reset workflow or assume the earlier R04 task remains unimplemented. Schema, cloud migration status, running clients and device behavior were not verified by this planning pass.

## Assigned reading

- Root `AGENTS.md`, `web/AGENTS.md`, and `mobile/AGENTS.md` if touching native integration.
- `web/docs/engineering.md`, `docs/engineering/application-boundaries.md`, `web/docs/api/README.md`, `web/docs/technical/deployment.md` for compatibility and verification.
- Final product: `web/docs/product/domains/identity-and-staff.md` in full, and `web/docs/product/permissions.md` in full. These are the approved rules for this task.
- Existing integration: module READMEs for sessions, attendance, assignments, groups, student records and student codes. They describe implemented behavior and limits, not permission to retain old three-role checks.
- `mobile/docs/api.md`, `mobile/docs/engineering.md`, `mobile/README.md` for changes to the current native client.
- Relevant installed Next.js documentation under `web/node_modules/next/dist/docs/` before application edits. For Supabase implementation, inspect current official guidance/CLI help while preserving repository cloud and migration-history rules.

Other product domains are unnecessary unless investigation reveals a concrete conflict affecting the authorized slice. Do not infer capabilities from unfinished navigation previews.

## Approved authority rules

The existing documents settle these rules; implementation should match them rather than weaken documentation to fit old code.

- Exactly one Owner per academy; academy creator becomes Owner. Ownership transfer is outside this task. Normal staff management cannot change, suspend or remove Owner.
- Owner can invite/appoint Head Admins, Admins and Instructors; manage those roles; and suspend/restore/remove their memberships. An academy may have multiple Head Admins.
- Head Admin can invite/manage Admins and Instructors. They cannot appoint a Head Admin, change an existing Head Admin's role, suspend/restore/remove a Head Admin, manage a peer Head Admin, or change their own role/access.
- Admin can invite/manage Instructors. They cannot appoint Admins or Head Admins, or manage an existing Admin/Head Admin. A role change must be permitted for both the existing target role and proposed role: changing an Instructor to Admin is not an Admin permission.
- Instructor does not manage staff. No staff actor can remove/suspend themselves or change their own role.
- Role changes retain academy records and attribution. Suspension retains membership and role for restoration; removal ends membership and requires a new invitation for return. Neither action deletes the global account or affects other academies.
- Ordinary Head Admin domain authority follows the current Owner/Admin manager permissions in the final matrix: groups, recurring schedules, student administration/imports/codes, assignment lifecycle and all current staff academic operations. Keep domain/year/history constraints and Instructor-specific one-off schedule rules intact.
- Owner-reserved academy closure/deletion remains reserved, but no new closure/deletion workflow is introduced. Do not revive session deletion removed by R01.

Invitation rules remain seven-day expiry, at most one pending invitation per academy/phone, verified matching phone, explicit acceptance and creator-authority recheck. Acceptance does not change an existing member's role or restore a suspended membership. Owners/Head Admins manage invitations for roles they may appoint; Admins may review academy invitations but copy/revoke only Instructor invitations they created. Do not broaden link-secret access by treating every manager as Owner.

Suspended creators have no academy appointment authority. Their pending invitations cannot be accepted while that authority is absent. Recheck live authority at acceptance; do not invent automatic revocation of all their invitations. Restoration permits an otherwise still-valid invitation to be evaluated under the ordinary expiry/role rules.

## Current discrepancies and evidence

1. **Role schema:** `web/supabase/migrations/20260921131600_foundation.sql` defines `academy_role` as owner/admin/instructor. Staff invitation role constraint in `20261004173453_staff_invitations.sql` accepts admin/instructor only. Neither source implements Head Admin or membership suspension.
2. **Staff administration:** `20261005005614_staff_member_roles.sql` permits only Owner role changes between Admin/Instructor. `20261005001436_staff_member_removal.sql` reads actor membership directly and implements removal, not suspension. Invitation functions also query actor/creator memberships directly. They must check active status, not mere row existence.
3. **Central authority:** the latest inspected membership helpers in `20261006120000_active_session_enforcement.sql` enforce live password-authenticated sessions but not suspended membership. Preserve that session enforcement while extending `is_academy_member`, `academy_role_for` and `shares_academy_with`.
4. **Web parsers and guards:** `academies/queries.ts`, `academies/server.ts`, staff schemas/labels/validation/actions, domain permission types and navigation allowlists hard-code three roles. `auth/components/membership-guard.tsx` handles removal/role-change events and checks only `user_id, role`; existence alone would treat suspension as active.
5. **Domain/RLS gates:** groups, schedules, imports, records, codes and assignment lifecycle include owner/admin lists. Some security-definer mutations query `academy_memberships` rather than a central helper. Updating one role union or one helper is insufficient.
6. **API/native:** the session-attendance OpenAPI academy role enum accepts three values. Native `Features/Academies/Academy.swift` already decodes role as String; do not claim it requires an enum migration. Native academy/session models and mutation handlers need to discard academy state when authority is lost rather than keep previously loaded staff data actionable.

## Implementation structure

### 1. Inventory the effective authorization surface

Inspect current migration order and configured cloud schema before editing. Record each current operation's authoritative guard and affected files. Include:

- Academy/membership/profile reads, own academy list, academy layout resolution and remembered academy selection.
- Staff invite create/list/copy/revoke/preview/accept; member role change/removal; new suspension/restoration.
- Group CRUD/restore, recurring/one-off schedule operations, slot writes and related RLS.
- Student CRUD/archive/bulk placement, imports and student-code settings/generation/assignment/resolution.
- Sessions, attendance reads/check-ins/edits/finalization and assignment authoring/work/marking/announcement/lifecycle.
- Assignment-image Storage authorization, private attendance Realtime channel policies and membership-control events.
- Cookie actions, bearer v1 adapters, direct Data API calls, SQL RPCs, and any privileged server/Edge adapter accessing academy data.

Search raw membership SELECTs, role literal lists, role enums, capability builders and SECURITY DEFINER functions as well as central helper use. Use the inventory as an implementation checklist; do not mass-replace every Owner check with a manager check.

### 2. Add role/status schema safely

Extend the existing enum with wire value `head_admin` and label “Head Admin”; use that value consistently in database types, parsers, UI, contracts and fixtures. Add membership suspension state without duplicating memberships or converting role to a suspended role. A nullable `suspended_at` plus actor attribution is a suitable minimal design; avoid redundant status fields that can disagree. Retain timestamps/actor information for completed access changes in a small restricted audit record if needed to preserve suspension/restoration history. This is technical evidence, not a new mandatory reason-entry or appeal workflow.

Existing memberships migrate as active with unchanged roles. Retain Owner/ownership indexes and enforce that an Owner cannot become suspended through any permitted write. Ordinary clients cannot directly edit role/status or insert memberships. Extend invitation constraints for Head Admin; keep one-pending-phone and verified identity protections.

Postgres cannot use a freshly added enum value in the same transaction that adds it. Put enum addition in a separately committed corrective migration before migrations that reference it in functions/constraints/policies. Check how the selected cloud migration tool commits individual migrations. Never rewrite baseline or already applied migrations, including concurrent R01 work. Regenerate Supabase TypeScript types from the actual updated target.

### 3. Enforce active membership across reads and mutations

`academy_role_for` must return no academy authority for a suspended caller. `is_academy_member` must reject suspended staff while retaining existing session/recovery/revocation checks. `shares_academy_with` must not grant a suspended caller access to coworkers through that academy. Active staff still need to see suspended team members and their permitted profile fields; do not filter the target member out of management views merely because their access is suspended.

Keep global own-profile/account access and active memberships in other academies intact. Suspension is academy-scoped, not global Supabase sign-out or account ban.

For RPCs reading raw memberships, check actor status under the relevant locking/transaction rules. Invitation creator checks use that creator's current membership/status, not `academy_role_for` evaluated as the accepting user. Resource queries may keep trusted actor checks plus RLS; neither may rely on JWT metadata or a cached role as live authority.

Audit membership SELECT policies carefully. Retaining suspended rows for management must not let “I can select a membership row” imply active staff authority in application services. Academy selectors and service guards explicitly use active membership. If the UI needs a distinction between suspension and removal, return only the signed-in person's own access status through a narrowly scoped check; do not broadly reopen academy/profile reads to suspended staff.

Update every existing manager role guard to include Head Admin where the approved operation is ordinary academy management. Protect all Owner-reserved checks explicitly. Restore neither historical deletion capabilities nor closed-year write access. New grants/policies/functions need appropriate RLS, explicit EXECUTE restrictions and default-deny nullable role checks.

After suspension commits, new requests using the same otherwise valid cookie/token must fail academy access without waiting for token expiry. Do not promise that an already delivered response can be recalled or introduce global session revocation. Realtime events are hints to refresh state; server/database guards remain authoritative. Verify the behavior of already joined data channels and close/refetch them when access is lost; never use their continued connection as mutation authority.

### 4. Implement transactional staff-management services

Extend existing role-change/remove/invite functions and add dedicated suspend/restore operations. Recheck active actor, actor scope, existing target role and proposed role inside the transaction. Protect Owner, self-management and peer Head Admin boundaries regardless of client input. Preserve not-found/denied behavior without leaking another academy's membership.

Serialize conflicting accept/role/suspend/restore/remove operations for a target membership. Repeated Suspend/Restore should return an unchanged outcome rather than duplicate audit/events. Do not turn restoration into insertion: a removed member requires a fresh invitation. Changing a suspended target's role must not implicitly restore access. Accepted-link replay and a new invitation must not undo suspension or role changes on an existing membership.

Document lock order before adding locks. Existing acceptance takes an invitation lock, target membership advisory lock and creator-membership lock; role/removal operations take target advisory plus actor/target row locks. Extend these consistently across all affected functions and test opposing operations for deadlocks. Avoid a new lock sequence that crosses these existing paths.

Emit private membership-change notifications after committed state changes through the existing user-specific control channel. Do not expose invite tokens, coworkers' status or credentials in event payloads. Notify/reload relevant management views without adding a notification product. Write academic attribution only as already defined; access management never deletes historical work.

### 5. Web team management and authority refresh

Extend `staff/{types,validation,format,permissions,actions,queries}.ts` and the team/member/invite dialogs. Render four role labels consistently and keep Owner at the top of role ordering. Present Active/Suspended access separately from role, retain suspended members in team management, and provide permitted Suspend/Restore/Remove and explicit allowed role choices. A generic Promote/Demote toggle between Admin/Instructor is insufficient for four roles. No self/Owner/peer Head Admin controls.

Use existing shadcn composition and Tabler icons; do not manually modify protected primitives/theme/configuration. Confirm actions and handle retry/unchanged, conflict, permission loss and missing membership without treating optimistic UI as authoritative. Default/view filtering should not hide suspended members permanently. Preserve established team card layout; any empty table must be replaced entirely.

Extend academy query schemas/role types and server active-membership resolution, domain capability helpers, navigation visibility and role-specific explanatory copy. A single small public role contract is appropriate if it prevents divergence; do not introduce a root shared package or move unrelated domain business rules into it.

Update `MembershipGuard` and scoped provider transitions: suspension/removal or reduced authority must cancel pending academy tasks, clear restricted caches/context, leave academy data channels and revalidate available academies. A suspended person must not be told to accept their old invite to restore access. If no active academy remains, show an appropriate no-staff-access state while preserving account access. If another remains, permit its selection. Do not sign out the whole account. Focus/reconnect/polling must cover missed events; network failure alone is not evidence of suspension/removal.

Manager views refresh after status/role mutations. Client actions and stale late responses stay scoped by user/academy; after a role reduction, no newly rendered controls or optimistic actions can retain old privileges.

### 6. Bearer API and current iPhone companion

Keep existing routes, cookie/bearer authority and attendance/assignment wire semantics. Extend OpenAPI role enums/descriptions and relevant contract tests for active Head Admin. Suspended memberships do not appear in `/api/v1/academies`; session/attendance/assignment data and mutation endpoints deny academy authority under their documented forbidden/not-found conventions. Do not add staff-management HTTP endpoints solely for this web-managed feature.

Native `Academy.role` currently accepts String, so verify `head_admin` decoding and the existing UI/capability flow rather than duplicate backend role rules. On forbidden or refreshed loss of membership, clear that academy's session/attendance models, cancel its tasks, discard pending edits/scan confirmations and return to authorized academy selection. Refresh on relevant foreground/reconnect transitions so a previously selected academy is revalidated. Keep stable mutation retry keys only within a still-authorized action; do not replay queued actions after membership removal/rejoin as if authority persisted.

Head Admin can use all current native staff academic operations permitted by backend capabilities. Other active academies remain available and auth credentials are not globally discarded merely due to one academy suspension. Do not add native team administration, marking features or session start APIs in this task. Coordinate edits to native SessionDetailModel/SessionView with the current wording task.

## Test and acceptance checklist

Add meaningful role/status and SQL regression tests using existing Vitest/native/SQL setups. At minimum cover:

1. Owner appoints multiple Head Admins through invitation or allowed existing-member role changes; neither operation can create a second Owner or alter protected ownership.
2. Head Admin manages Admin/Instructor, including allowed role transitions; Owner alone manages old or new Head Admin roles. Head Admin cannot manage a peer. Admin cannot promote Instructor to Admin, manage Admin/Head Admin or obtain their protected invite links. Instructor cannot administer memberships. Self-management and Owner suspension/removal/demotion fail in SQL as well as UI.
3. Invitation seven-day expiry, pending-phone uniqueness, phone verification and current creator permission remain enforced. A suspended/removed/demoted creator loses relevant appointment authority. Acceptance/replay against an existing suspended membership never restores access or changes role.
4. Suspend retains membership/role and academic attribution; repeated Suspend/Restore is stable. Restore reinstates retained role without reinvitation. Restore of removed membership does not insert it; normal new invite is required.
5. A still-valid token/cookie after suspension cannot read academy data, act through ordinary or direct RPCs, retrieve academy Storage objects, or newly join protected attendance data channels. The user's own global account and another academy remain usable. Restoration makes subsequent valid requests work again.
6. Active managers can list suspended members and necessary team profile fields. Suspended staff cannot read coworkers through the suspended academy. Own profile access remains valid; cross-academy membership/contact leakage is denied.
7. Active Head Admin passes every existing ordinary manager operation: groups/recurring schedules, student edit/archive/import/bulk placement/codes and assignment lifecycle. All staff attendance/marking permissions still work. Year closure, versions, idempotency, roster snapshots, scoring completeness and history protection still apply.
8. Concurrent acceptance versus suspension/removal, creator suspension/demotion versus acceptance, and role change versus suspension/restore/remove cannot bypass authority, resurrect memberships or deadlock through opposing lock order. Preserve already completed work and verify denied writes leave no partial results.
9. Web cache/channel and native state are invalidated after confirmed authority loss; missed events are caught on revalidation. Stale responses cannot fill another account/academy. Network errors do not falsely remove access.
10. Four-role parsers, labels, navigation and OpenAPI contract tests accept Head Admin and reject unsupported roles. Legacy active Owner/Admin/Instructor behavior remains supported.

Run `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` and affected edge checks from `web/`. Add a named SQL suite for role/suspension regressions and register it with the current runner if needed. Exercise relevant staff invitation, session-authority, groups/schedules, student/import/code, assignment and attendance SQL tests plus targeted concurrency cases on an authorized isolated cloud target. Do not run global fixed-fixture tests on populated shared development or production. Missing cloud target means cloud validation remains explicitly incomplete, not permission to install local Docker or claim a pass.

For changed native integration, use the current unsigned build/check/test instructions in `mobile/README.md` where the runtime exists. Report native compilation, tests, device behavior and deployment separately. Test account switching and academy-specific loss/restore with controlled actors, not real staff disruption.

## Migration/rollout and documentation

Keep enum addition separate from dependent SQL. Existing memberships stay active with unchanged roles; do not auto-promote Admins or suspend anyone as a backfill. Apply dependent authority changes before permitting Head Admin assignment or exposing new management controls. All supported clients/parsers must accept the new role before it is assigned: gate rollout administratively until updated code is live. A rolling deployment with old three-role web code cannot safely serve newly assigned Head Admins. Suspension enforcement must be effective server-side before UI status controls are enabled.

Routine additive/non-destructive migrations are pre-approved during authorized implementation. Destructive/hard-to-reverse work still needs explicit approval and a preservation plan. Enum removal is not a routine rollback; prefer a forward fix/disabled rollout without rewriting history or silently demoting staff. Do not change production deployment, provider setup, signing or distribution without the applicable authorization.

After implementation, update factual module/API/native references to describe four-role and active-membership enforcement. `web/docs/product/permissions.md` has an implementation-status preamble saying Head Admin is absent; correct that factual status only after source changes support it, while retaining its approved matrix. Similar outdated three-role caveats in module READMEs/API text should be corrected. Do not claim cloud/deployed verification that was not performed. Product policy and AGENTS.md wording need no change for this slice.

## Delivery to owner

Return the source revision and authorization inventory, changed files/migrations in application order, implemented role/status behavior, test results and precise cloud/device/runtime limits. Name any effective policy/RPC not yet covered; do not call the feature complete if suspended staff still have an alternate academy path or Head Admin is only a UI label.

Suggested Claude instruction:

> Implement `planning/refinement/05-head-admin-and-staff-suspension.md` in an implementation thread. Follow its assigned final references and applicable AGENTS.md files. Preserve concurrent changes. Complete the shared database/server authorization, staff UI, existing domain gates and current native/API integration as one coordinated feature. Do not expand to other refinement tasks. Report verification and remaining environment limits separately.
