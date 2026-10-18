# Personal account settings

Implements EDRA-126. Product rules: [account settings](../../../docs/product/domains/account-settings.md) (Ownership and entry, Names, Profile picture, Password changes). Login-phone and parent-contact changes and the student-table indicator are EDRA-127.

## Entry and authority

Staff `/account` (`src/app/account/page.tsx`) and student `/profile` (`src/app/learn/profile/page.tsx`) render the same `AccountSettings`. Neither requires an academy; the student page keeps the learn layout's completed-setup gate. Every mutation acts as the caller with a live password session: Server Actions use `cookieAuthority` (phone-code sessions refused), the database adds RLS/column grants and `edra_auth.session_allowed`, and Storage policies call `owns_avatar_object`. A suspended membership does not affect any of it.

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

## Not implemented

EDRA-127 contact changes and indicators, native settings, avatar originals or re-cropping without re-selecting the source, and Auth-wide enforcement of the code: a signed-in session can still call Auth's own password update directly, as before this feature.
