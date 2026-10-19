# Student enrollment and account linking

Implements EDRA-80. Product rules: [student enrollment](../../../../docs/product/domains/student-enrollment.md), plus the Online accounts and Archival sections of [student records](../../../../docs/product/domains/student-records.md).

## Flow

1. `/invite/student/<token>` (student host) validates the token's shape, stores it in the HTTP-only `edra_pending_student_invite` cookie and redirects to `/onboarding/student/join`. It never looks the invite up.
2. A student with no academy who finishes setup lands on a join prompt (paste an invite link, or skip into the portal with the same entry transition). The join page sends signed-out visitors to login and unfinished accounts to global student setup (`/onboarding/student`), which returns to the join page once complete while the cookie remains.
3. `preview_student_invite` decides the path from the account's verified phone, the invited academy and its open year: `existing` (confirm, then link), `enroll` (track where the account's level has tracks, then optional group; `returning` marks a historical profile), `connected`, `closed`, `unavailable`, `level_unavailable` (the academy doesn't offer the account's level), `staff_help` (`archived`, `conflict`, `details`), `invalid`, `unverified`.
4. `complete_student_invite` rechecks everything under locks and either links the existing record or creates current-year participation (under the returning profile or a new one) and links it, atomically. A retry after success returns `connected`. On success the client navigates to `/<academySlug>` with the `academy-join` view transition (instant under reduced motion).
5. The cookie is cleared on `connected` and `invalid` by server actions (and terminal page cleanup); other outcomes stay retryable after staff action. Completion rejects extra client level/record identifiers. GET/render/prefetch never links or enrolls.

Connected students reach `/<academySlug>` through the student sidebar; `get_my_student_academy` shows their current participation and access status. Unconnected accounts get not found.

## Data and authority

- `academy_student_profiles.user_id` is the account link: one profile per account per academy, never reassigned (trigger), never written by staff.
- `academy_student_profiles.access_suspended_at` is the independent staff suspension (managed by EDRA-155). Archiving the annual record is the other cause; restore clears only `archived_at`. `edra_private.student_access_suspended` is the effective check, and `edra_private.student_caller_record(academy, year)` is the shared resolver for protected student services (quizzes and exams use it).
- `student_enrollment_settings` holds the invite token, whether new annual participation is accepted, and the retired participation-type column (genuinely new students are always `online_only`; returning students keep their latest type). The link lives in Manage → Student enrollment (also reachable from the Add student menu); all staff may read and share it, and Owners, Head Admins and Admins replace or turn it off and change availability. Clients have no table grants.
- The account's level (set in global setup) is bound to the student: academy onboarding never asks for it, offers only that level's tracks, and is blocked when the academy lacks the level. `complete_student_invite(token, track, group)` ignores any client level.
- New participation reuses the account's verified phone and verified parent phone. A genuinely new student's record name is the account display name, else its full name; a returning student's new record uses the full name; linking an existing record keeps the academy's name (EDRA-126). Group capacity is checked under a group row lock; a full group returns `group_full`.

## For EDRA-231 (booking)

A signed-in returning student's booking entry must reach `/onboarding/student/join` with trusted academy entry authority (today: a valid invite token in the pending cookie). A client-supplied academy id or plain login is not a substitute. The public booking form, its settings and first-time booking without an account are outside this module.

## Not implemented

Staff UI for independent suspension (EDRA-155), per-program enrollment restrictions, invite lookup rate limiting (tokens are 256-bit), mobile bottom-nav academy entries, and academy pages beyond the landing.

## Task 4 resolution evidence — 2026-10-19

G01's historical missing-implementation assertion is superseded at source level by the existing enrollment migrations/module, not by a second linking flow. Task 4 adds ordinary-session checks inside the shared student resolver, preview/completion and connected-academy reads; recovery/revoked sessions cannot use those privileged boundaries even without the REST hook. Completion locks and rechecks an existing annual-record match before linking so concurrent staff contact/archive edits cannot leave a stale match. Account-level, compatible placement, existing/returning identity and independent suspension behavior remain covered by `student_enrollment.sql`. The original audit snapshot is unchanged. CI validation and hosted deployment are distinct; these source changes do not establish a production rollout.
