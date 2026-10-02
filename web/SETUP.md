# Local setup and checks

Prerequisites: Node 22, Docker (running), the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started), `psql`, and Deno 2 (edge checks only).

```bash
npm ci
npm run lint && npm run typecheck && npm test && npm run build
npm run test:db     # replays every migration on a clean local DB, runs SQL assertions + race harness
npm run test:edge   # deno check for supabase/functions/*/index.ts (not covered by tsconfig)
```

`npm run test:db` destroys and recreates the local Supabase database. It exits non-zero on any
migration error, failed assertion (`psql -v ON_ERROR_STOP=1`), or race-harness failure, and exits
with code 2 if Docker, the Supabase CLI, or `psql` is missing. Never point `DB_URL` at a shared
or production database: the concurrency harness commits fixtures.

## Local phone auth

`supabase/config.toml` enables phone signup with confirmation and fixed test OTPs
(`201000000001`, `201000000002` → `123456`), so no WhatsApp message is sent. These values are for the
local stack only; production Auth settings are managed in the Supabase project and are not changed
by this repository. Minimum password length is 8 for new passwords; sign-in accepts any existing
password the provider supports.

## Password recovery

Recovery is completed on the server (`POST /auth/recover`): the OTP is exchanged for a session that
exists only in that request, is used once to set the password, and is revoked with a global sign-out.
The browser never receives a recovery session. Already-issued access tokens on other devices remain
valid until they expire (`jwt_expiry`, 3600 s locally); their refresh tokens are revoked immediately.

## Not yet automated

Browser tests (signup, recovery, student setup, academy switching, group/schedule flows) are not
set up yet; they need a seeded local identity set and an approved browser-test runner.
