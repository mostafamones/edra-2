# Account password function

Changes the signed-in user's password from account settings after verifying a code sent to their current verified account phone. Product rules: [account settings](../../../docs/product/domains/account-settings.md); integration: [account module](../../../src/modules/account/README.md).

## Authority and actions

Keep gateway JWT verification enabled. Source validates the caller with getUser, refuses phone-code (recovery) sessions and reads the verified token's `session_id`. Every database step is bound to the account, that live Auth session and the account phone at request time; the recipient is never a client field.

Actions, with `challengeId` after `request`:

- `request`: starts (or supersedes) the challenge and sends a six-digit code. Ten-minute expiry, one-minute resend interval, five sends per hour. Returns the challenge ID, the phone's last four digits, `expiresAt` and `retryAt`.
- `verify`: five attempts per code. Success grants ten minutes to set a password.
- `complete`: checks the new-password policy, claims one of three completion attempts (a 30-second lease serializes competing completions), then updates the password through Auth with the caller's own access token. Hosted Auth keeps that session and revokes every other session. A 4xx Auth answer (for example `same_password`) releases the lease for another try; a 5xx or network failure returns `uncertain` and leaves the challenge unconsumed but the attempt counted.
- `cancel`: invalidates the challenge.

## Configuration and delivery

Uses SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY (backend-only; the service-role key is also the code HMAC secret, as in student-onboarding) plus the shared WhatsApp variables. Development mode logs EDRA_DEV_PASSWORD_CODE (last four digits and code) and sends to the development recipient; production sends the approved Authentication template to the account phone and fails the request when delivery fails.

Deploy with JWT verification enabled:

```sh
npx supabase functions deploy account-password --project-ref <project-ref> --use-api
```

## Limits

The function guarantees the Edra settings boundary only. Auth's own `PUT /auth/v1/user` remains callable directly with a valid password session, because the hosted project has `security_update_password_require_reauthentication` off and the PostgREST hook does not intercept Auth. That is the same capability a signed-in session already had before this feature.

## Testing

From `web/`, with Deno 2 on PATH, run `npm run test:edge` for static checks and `npm run test:edge:runtime` for all four isolated entrypoint suites, including this function's `index_test.ts`. Each uses its own dependency map and frozen lockfile; runtime tests are typechecked.

The Deno suite invokes this real entrypoint directly and covers OPTIONS/CORS, unsupported methods, missing bearer and missing required environment configuration before any network call. It does not verify JWT authenticity, database RPCs/RLS, password changes or challenge persistence.

Tests capture `Deno.serve` without opening a listener, clear/restore named configuration, use only dummy values and explicitly intercept fetch; unexpected calls fail. Runtime network is denied, with no Supabase instance, real credentials, messages or paid services. Dependency caching may download packages. Neither static checks, Node unit tests nor these Deno tests establish hosted gateway behavior or actual delivery. See [verification](../../../docs/engineering.md#edge-function-checks) for the CI command and evidence boundaries.
