# Personal account settings

Implements EDRA-126 and EDRA-127. Product rules: [account settings](../../../docs/product/domains/account-settings.md) (Ownership and entry, Names, Profile picture, Password changes, Login-phone changes, Parent-contact changes). The student-table indicator lives in the [student records module](../students/records/README.md).

## Entry and authority

Staff settings open inside the academy shell at `/{academy}/manage/account` (`src/app/app/[academySlug]/manage/account/page.tsx`); `/account` redirects there for the last-used or first academy and renders standalone only for an account with no staff academy. The staff page and student `/profile` (`src/app/learn/profile/page.tsx`) render the same `AccountSettings`. Neither requires an academy; the student page keeps the learn layout's completed-setup gate. Every mutation acts as the caller with a live password session: Server Actions use `cookieAuthority` (phone-code sessions refused), the database adds RLS/column grants and `edra_auth.session_allowed`, and Storage policies call `owns_avatar_object`. A suspended membership does not affect any of it.

## Names

`profiles.full_name` stays the signup-initialized full name (signup still joins first and last name); settings edit it as one field. `profiles.display_name` is optional. `accountName` (public, `contract.ts`) returns the display name, else the full name; staff team lists, member dialogs, the account menu and live attendance presence use it. Recorded attribution snapshots and student record names are not resolved through it.

`saveProfile` accepts exactly `{ fullName, displayName }`, trims and collapses whitespace, stores a blank display name as null, and updates both columns in one statement. Database constraints mirror the 1–200 character bounds of annual student record names.

Auth `user_metadata.full_name` is the signup value only. It is not updated or used by the app UI or authorization; development-mode WhatsApp messages still use it as a greeting.

Enrollment (`complete_student_invite`): a genuinely new student's first record takes the display name, else the full name. Connecting an existing record keeps the academy's name; the returning path keeps using the full name. Later edits never reach existing records.

## Profile picture

The source image stays in browser memory (object URL revoked on close, replacement and unmount). The crop dialog drags, zooms (slider, wheel, `+`/`-`) and moves with arrow keys inside a square viewport whose inscribed circle is the preview; `crop.ts` holds the shared geometry. Save draws the square at 512 px with opaque corners and uploads only that.

Limits (engineering constants): browser source JPEG/PNG/WebP up to 20 MB and 64–10,000 px; uploaded crop up to 900 KB, square 128–2,048 px, JPEG/PNG/WebP. The server decodes it with sharp, rejects anything else (including SVG and malformed files), flattens it, strips metadata and stores a 512 px WebP at quality 82. The private `avatars` bucket accepts only `image/webp` up to 256 KB.

Objects are immutable at `<user_id>/<uuid>.webp`. `uploadAvatar` uploads a new object, then `set_my_avatar(path, expected)` switches the profile only if the avatar is still the one the client saw; the superseded object is deleted through the Storage API. A losing or failed switch deletes its own upload; an unknown outcome keeps it. Each avatar action first reconciles the caller's folder, deleting objects that are neither current nor uploaded in the last ten minutes, and refuses a new upload while three recent unfinished uploads exist. Storage itself is the retry record, so a failed deletion is retried by the next action.

Pictures are read through owner-only signed URLs (one hour, refreshed before expiry) and are never stored. Staff student views do not read them.

## Password change

`PasswordChange` drives the [`account-password`](../../../supabase/functions/account-password/README.md) Edge Function: request a code to the current verified account phone → verify → new password and confirmation → complete. The current password is not asked for; the new-password policy is `resetPasswordSchema`. Codes, grants and passwords stay in component state only.

The challenge (`account_password_challenges`, service-role functions) binds the account, the originating session and the phone; a new request supersedes the old challenge, and sign-out of that session or a phone change voids it. Completion updates the password through Auth with the caller's own access token. Hosted Auth keeps that session and revokes the others; revoked access tokens are refused by the database and Storage on their next request. Recovery keeps its own global sign-out.

Hosted Auth currently has secure password change (reauthentication) and current-password requirement off, so no native nonce is needed. If either is enabled, Auth rejects the update and the flow reports the error; adapt `updatePassword` in the function before enabling them.

## Contact changes

`ContactChange` (`components/contact.tsx`) drives the [`account-contact`](../../../supabase/functions/account-contact/README.md) Edge Function for the Account phone and, for an account with a completed student profile (including staff who are also students), the Parent phone: new number → code to the current number → code to the new number → commit. No password is asked for. `useAccountContacts` reads the verified contacts and this session's unfinished operations from the function's `status` action, keyed by account and Auth session, so a reload resumes the current stage and another session's operation is never shown; `profiles.phone` is not edited by the client. The current number stays displayed until the commit succeeds. After a login change the client refreshes its session so the header and menus show the new phone; the account ID, memberships, academy records and history are untouched.

Storage and rules are in `account_contact_changes` (migration `20261018210000`): one operation per account and purpose, bound to the originating live session, the expected old contact and the normalized replacement. Codes are per stage and hashed with purpose, stage, account, operation and recipient. Every step rechecks the session and that the old contact is still current (otherwise the operation becomes `stale` and ends). A new start supersedes the previous operation; send limits are kept per stage across operations. A replacement equal to the current number, the account's other phone, or (for login) another account's login phone is refused at start and again at commit; parent numbers may be shared.

- Parent: verifying the new code updates `student_profiles.parent_phone` and its verification time in the same transaction, conditional on the old value, without touching `level_id`.
- Login: after both proofs the function claims the commit and calls Auth's admin user update for this user (`phone`, `phone_confirm`). The `guard_auth_phone_change` trigger on `auth.users` accepts a change of a confirmed phone only for that account's committing operation with matching old and new numbers, and completes the operation inside Auth's transaction, so the change and proof consumption commit together. `settle_login_phone_change` then reads the outcome under the operation's row lock: completed, or the claim is released (any delayed Auth write is then rejected) and the user may retry, up to three attempts in ten minutes. A lost response is reconciled by the next `status`.

The trigger also refuses Auth's own phone change API (`updateUser({ phone })` with `phone_change` verification) and dashboard or administrator edits of a confirmed phone, so the old-number proof cannot be skipped through Auth. Phones that were never confirmed are not guarded. If the old number is unreachable, the change cannot be completed in settings; the future support process will need its own deliberate path through this guard.

## Not implemented

Native settings, a support path for unreachable old numbers, avatar originals or re-cropping without re-selecting the source, and Auth-wide enforcement of the code: a signed-in session can still call Auth's own password update directly, as before this feature.
