# Edra — personal account settings

Approved by the owner, 2026-10-18. Scope: EDRA-126 and EDRA-127. These are product requirements, not a claim that the settings are implemented.

## Ownership and entry

Signed-in staff and students manage their own global Edra account independently of academy membership or role. Settings do not edit another person's account, academy permissions or academic history. Existing staff account and student profile entry points expose the same applicable account capabilities. Student parent-contact settings apply to student accounts only.

## Names

Signup retains its first-name and last-name inputs, combined into the existing full account name. Profile settings edit that full name in one field; they do not split or parse it back into first and last names.

An optional display name applies across academies, falling back to the full account name when absent. It supports names in Arabic. Staff academy displays use this display name or fallback.

For students, the academy's annual record name is the primary student name throughout that academy. When onboarding creates a genuinely new student's record, it initializes the name from the account display name, falling back to the full account name. Authorized academy staff can edit the record name, including using a longer full Arabic name. Other academies retain their own record names. Joining an existing record preserves its name. Later edits to account names never overwrite existing academy records or historical names.

Student school level is not editable in account settings. This does not change staff permissions to maintain academy placement.

## Profile picture

Users can upload, replace and remove their profile picture. Before upload, a Discord-style crop dialog lets them drag to reposition the image and zoom within a circular preview, then save or cancel. Use Edra styling and applicable shadcn foundations.

Store only the final square crop, resized and compressed. Retain its corners so future square presentation is possible; current avatar presentation is circular. Do not retain the original image or a separate circular image. Reopening a crop of the original requires selecting that source image again. Replacing or removing a picture removes the previous stored image. Validate image input and provide accessible controls and upload/error feedback.

Student pictures belong in personal account UI; do not add them to academy staff student-record views.

## Password changes

A signed-in user changes their password by verifying a code sent to their current verified account phone, then entering and confirming the new password. The current password is not required. Reuse the existing new-password policy. Successful change keeps the current session and signs out every other session, regardless of recent activity. The proposed seven-day inactivity selection is superseded by this decision.

Forgotten-password recovery remains a separate existing flow with its existing global sign-out behavior. Code verification for settings must authorize only its intended change and must not turn a recovery-only session into general application access.

## Login-phone changes

Changing the login phone requires verification of both the old and new phone numbers; it does not require the account password. Keep the old phone active until both verifications succeed. A failed, expired, canceled or superseded challenge does not replace the verified contact. Handle an already-used login number without merging accounts.

The account's stable identity, existing academy links, memberships, suspensions and academic history remain intact. A changed number does not automatically discover or connect other academy records. Future joining continues through the completed academy enrollment workflow. Do not overwrite academy-entered student or parent phones.

If the old login number is inaccessible, changing it requires a future support process. This scope does not implement that process or allow bypassing old-number verification.

## Parent-contact changes

A student changes their verified parent contact by verifying both the old and new parent numbers. The account password is not required. Preserve the existing verified contact and completed student setup until the replacement is fully verified; do not reset school level or send the student through onboarding again.

The replacement changes the student's account-level contact only. Academy-maintained contacts and previous message recipients remain preserved. Shared parent numbers are allowed and do not establish student identity or academy access.

An inaccessible old parent number requires the future support process; it does not permit bypassing verification in this scope.

## Connection indicator in student tables

Place a small dot immediately after a linked student's academy record name. A linked student with suspended online access uses a destructive red variant. Suspension includes effective archival or independent staff suspension under the existing access rules. Unlinked students have no dot.

The dot has a deliberately long-delay tooltip: “Account linked” or “Online access suspended”, as applicable, and an accessible equivalent. It indicates connection/access state, never online presence. It does not add account-linking or suspension-management actions.

## Completion and boundaries

Settings require validated forms, pending/success/error feedback and retryable verification states, including resend cooldown, invalid or expired codes, attempt limits, delivery failures and cancellation. Keep mutations authorized to the caller; verification proofs must be scoped to the intended account, action and replacement contact and cannot be replayed. Preserve existing authentication and tenant/history rules.

No helper text is added by default. Functional feedback and the explicitly requested delayed indicator tooltip remain available. Verification must cover unauthorized and cross-account operations, competing/retried changes, stale verification attempts, preserved academy names/contacts/links, image replacement cleanup and the password session policy. Implementation requires relevant cloud verification, not a local database by default.
