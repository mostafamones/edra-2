# Account contact function

Replaces the signed-in user's verified login phone, or a completed student's verified parent phone, after codes to both the current and the new number. Product rules: [account settings](../../../docs/product/domains/account-settings.md); integration and commit design: [account module](../../../src/modules/account/README.md).

## Authority and actions

Keep gateway JWT verification enabled. Source validates the caller with getUser, refuses phone-code (recovery) sessions and reads the verified token's `session_id`. The account and the old contact come from Auth and `student_profiles`, never from the request. No academy membership is required.

- `status`: the verified `loginPhone` (E.164), `parentPhone` (completed student profiles only) and this session's unfinished operations. A commit left in flight is settled first.
- `start` (`purpose`: `login_phone` | `parent_phone`, `phone`): normalizes the replacement with the Egyptian phone rule, refuses an equal, taken or conflicting number, supersedes the previous operation and sends a code to the current number.
- `resend` (`operationId`): a new code for the current stage.
- `verify` (`operationId`, `code`): the old code moves to the new stage and sends its code (`sendError` reports a failed send; resend stays available). The new code commits a parent change atomically, or claims and performs the login change through Auth's admin user update.
- `complete` (`operationId`): retries a verified login commit after `commit_failed`.
- `cancel` (`operationId`): ends the operation unless its commit is in flight (`busy`).

Errors include `invalid_phone`, `same_phone`, `phone_taken`, `parent_phone`, `account_phone`, `not_student`, `phone_unverified`, `cooldown`/`rate_limited` (with `retryAt`), `delivery_failed`, `delivery_unavailable`, `invalid_code`, `expired`, `locked`, `unsent`, `stale`, `used`, `invalid`, `busy`, `commit_failed`, `ended`, `uncertain` and `session_inactive`. Limits: six-digit codes, ten-minute expiry, five attempts per code, one-minute resend interval and five sends per hour per stage (kept across superseded operations), ten minutes and three attempts to commit.

## Configuration and delivery

Uses SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (backend-only; the service-role key is also the code HMAC secret, as in the other account functions) plus the shared WhatsApp variables. Development mode logs EDRA_DEV_CONTACT_CODE (last four digits and code) and sends to the development recipient; production sends the approved Authentication template to the actual number and fails the request when delivery fails.

Requires migration `20261018210000_account_contact_changes.sql`. Deploy with JWT verification enabled:

```sh
npx supabase functions deploy account-contact --project-ref <project-ref> --use-api
```

## Limits

The `auth.users` guard trigger makes the old-number proof apply to every writer of a confirmed phone, including Auth's own phone change API and dashboard edits. A future support process for unreachable old numbers needs its own deliberate path through that guard.
