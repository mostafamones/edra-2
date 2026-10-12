# Student account onboarding function

This function verifies the parent contact during global student account setup. Academy invite/enrollment behavior is owned by [product students](../../../docs/product/domains/students.md), not by this parent-challenge endpoint.

## Authority and actions

Keep gateway JWT verification enabled. Source validates the caller with getUser, requires a verified account phone and refuses recovery-only phone-code sessions. It derives the user ID from that authority; caller-supplied student identity is not accepted.

Actions are status, request, verify and complete. Parent challenges use six-digit codes, ten-minute expiry, five verification attempts, a one-minute request interval and five sends per hour per account. Ordinary clients cannot read challenge rows or directly set a verified parent contact. Completing setup does not change the account's login phone.

## Configuration and delivery

SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are backend-only. Current source hashes parent challenges using the service-role key directly; it does not read a separate parent-code secret. Rotation affects outstanding challenges. Delivery shares META_WHATSAPP_ACCESS_TOKEN, sender ID, template language/version and development-routing variables with the auth hook.

Development mode logs EDRA_DEV_PARENT_CODE and may send to the configured test recipient. Production requires the actual entered parent number, the approved Authentication template and successful delivery, without code logging. Read index.ts and the shared provider helper for exact payload/errors rather than applying the signed-hook flags to this JWT-authenticated endpoint.

Using the configured project, deploy with JWT verification enabled:

```sh
npx supabase functions deploy student-onboarding --project-ref <project-ref> --use-api
```

Then follow [deployment](../../../docs/technical/deployment.md) for controlled-phone verification. Source checks do not establish deployment or provider readiness.
