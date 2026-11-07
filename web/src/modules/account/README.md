# Personal account settings

Implements EDRA-126 and EDRA-127. Product rules: [account settings](../../../docs/product/domains/account-settings.md) (Ownership and entry, Names, Profile picture, Password changes, Login-phone changes, Parent-contact changes). The student-table indicator lives in the [student records module](../students/records/README.md).

## Entry and authority

Staff settings open inside the academy shell at `/{academy}/manage/account` (`src/routes/app/$academySlug/manage/account`); `/account` redirects there for the last-used or first academy and renders standalone only for an account with no staff academy. The staff page and student `/profile` (`src/routes/learn/profile`) render the same `AccountSettings`. Neither requires an academy; the student page keeps the learn layout's completed-setup gate. Every mutation acts as the caller with a live password session: Web commands use `cookieAuthority` (phone-code sessions refused), the database adds RLS/column grants and `edra_auth.session_allowed`, and Storage policies call `owns_avatar_object`. A suspended membership does not affect any of it.

## Names

`profiles.full_name` stays the signup-initialized full name (signup still joins first and last name); settings edit it as one field. `profiles.display_name` is optional. `accountName` (public, `contract.ts`) returns the display name, else the full name; staff team lists, member dialogs, the account menu and live attendance presence use it. Recorded attribution snapshots and student record names are not resolved through it.

`saveProfile` accepts exactly `{ fullName, displayName }`, trims and collapses whitespace, stores a blank display name as null, and updates both columns in one statement. Database constraints mirror the 1–200 character bounds of annual student record names.

Auth `user_metadata.full_name` is the signup value only. It is not updated or used by the app UI or authorization; development-mode WhatsApp messages still use it as a greeting.

Enrollment (`complete_student_invite`): a genuinely new student's first record takes the display name, else the full name. Connecting an existing record keeps the academy's name; the returning path keeps using the full name. Later edits never reach existing records.

## Profile picture

The source image stays in browser memory (object URL revoked on close, replacement and unmount). The crop dialog drags, zooms (slider, wheel, `+`/`-`) and moves with arrow keys inside a square viewport whose inscribed circle is the preview; `crop.ts` holds the shared geometry. Save draws the square at 512 px with opaque corners and uploads only that.

Limits (engineering constants): browser source JPEG/PNG/WebP up to 20 MB and 64–10,000 px; uploaded crop up to 900 KB, square 128–2,048 px, JPEG/PNG/WebP. The server uses precompiled jSquash Wasm codecs, flattens over white, strips metadata and stores a 512 px WebP at quality 82. Four-channel JPEG uses PDF.js' JPEG decoder and LittleCMS with its embedded CMYK profile or the original libvips default profile; profile attribution is in [profiles/README.md](./profiles/README.md). Animated WebP retains its first frame. Invalid dimensions, containers and unsupported formats (including SVG) are rejected before decoding where possible. Sharp remains a development-only oracle. The private `avatars` bucket accepts only `image/webp` up to 256 KB.

LittleCMS 2.19.1 is a pinned, precompiled Wasm reactor with a 32 MiB maximum linear memory; it has no JavaScript bootstrap or runtime compilation. The [profile documentation](./profiles/README.md) includes provenance and rebuilding. ICC conversion uses bounded batches; opaque Lanczos3 resizing retains only the rows needed for the next output row. RGB JPEG/PNG/WebP profiles and tagged 16-bit RGB PNGs are converted using the original pipeline's processing spaces.

`workers-test/image-build.mjs` runs the actual codecs in workerd without a listening server and fails if runtime Wasm compilation executes or Sharp enters the bundle. Its differential fixtures cover EXIF, alpha, animation, CMYK/YCCK, ICC, tagged RGB and 16-bit PNG. CMYK JPEGs with 10,001 real scans are accepted like Sharp. All scans are structurally validated before PDF.js construction: exact table/segment lengths, sampling bounds, a single frame and pinned DNL height prevent malicious frame allocation. Scan processing reuses the frame's coefficient buffers; many scans can still amplify CPU work. The 900 KiB upload bound remains unchanged.

Measured non-uniform CMYK and resampling differences remain within the existing test bounds, not exact pixel parity. The Sharp 0.35.4 differential tests enforce maximum/mean RGB deltas of 4/1.5 for the tight fixtures and 48/5 for non-uniform CMYK. The workerd animation fixtures retain separate limits of 12/2 for lossy first frames and 96/2 for offset frames. These are fixture-specific compatibility bounds, not a universal pixel guarantee; the suites print observed deltas. Do not increase them to conceal a regression. Missing-IEND PNGs are deliberately rejected even when Sharp accepts them; tolerated corrupt JPEG entropy can produce different repaired pixels. Broader real-world profiles and deployed resource measurements remain release gates. Local process RSS is not equivalent to Cloudflare isolate memory accounting and does not establish that the 128 MB limit is met. See the [resource probe](../../../workers-test/image-resource-probe.md) for reproducible preparation without deployment.

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

## Account deletion

`AccountDeletion` confirms with the typed phrase `delete my account` (checked again by `deleteAccount`). The action removes the caller's avatar objects, then calls `delete_my_account` (migration `20261025140000`). Academy history references `profiles` without cascading, so the account is anonymized, not removed: memberships, student profile and pending contact/password operations are deleted; the profile becomes "Deleted user" with no display name, phone or picture; the Auth user loses phone, email, password, metadata and identities, is banned and every session is deleted. The phone guard admits only this erasure. Owners are refused until they transfer their academies. Academy-owned student records keep the academy's copy of the name and phones.

## Not implemented

Native settings, a support path for unreachable old numbers, avatar originals or re-cropping without re-selecting the source, and Auth-wide enforcement of the code: a signed-in session can still call Auth's own password update directly, as before this feature.

## Shared profile presentation

`browser.ts` is the lightweight public entry point for `accountName` and
`resolveProfileAvatars(paths)`. Team and concern consumers share the batch resolver for
one-hour private avatar URLs under the existing Storage policies. Keep these URLs in memory,
refresh before expiry and render initials if resolution fails. This entry point avoids pulling
the account settings UI and image-processing server code into lightweight query consumers.
