# Edra web

Next.js staff/student application and the modular backend using cloud Supabase. Native clients use its authenticated HTTP API.

## Development

From web/, install the locked dependencies with npm ci, copy .env.example to .env.local, set the configured cloud project's public values and development origins, then run npm run dev. Keep secrets server-side. No local database is required.

Development hosts use lvh.me, app.lvh.me and learn.lvh.me on port 3000; see [routing](docs/technical/routing.md). Check available commands in package.json. test:db runs the database assertions against an explicitly configured, marked isolated test target; it never starts a local stack, resets a database or applies migrations. CI runs it against a disposable database on the GitHub runner (scripts/db-ci.sh). See [database assertions](docs/engineering.md#database-assertions).

## Test commands

From `web/`:

```sh
npm test                  # Node unit tests (includes shared WhatsApp handler)
npm run test:edge          # Deno static checks, per-function frozen lockfiles
npm run test:edge:runtime  # Deno entrypoint and request-boundary tests
npm run lint
npm run typecheck
npm run build
```

Both Edge commands require Deno 2 on PATH. Runtime tests capture the real handlers without listening ports and use synthetic signed requests/configuration with intercepted fetch. They deny runtime network and need no Supabase instance, credentials or paid service. Dependency cache population may need network. The Deno suites stay separate from Vitest discovery. These checks do not verify hosted delivery, gateway authentication or authenticated database workflows; see [Edge verification](docs/engineering.md#edge-function-checks). CI runs static and runtime checks in the same independent Edge job; Actions minutes remain quota-limited.

## Browser smoke tests

From `web/`:

```sh
npm ci
npx playwright install --with-deps chromium
npm run test:e2e
# Interactive runner:
npm run test:e2e:ui
# Inspect the latest report or a retained failure trace:
npx playwright show-report
npx playwright show-trace <path-to-trace.zip>
```

Keep port 3100 free; stop any server using it first. The suite starts and stops its own Next.js development server on `127.0.0.1:3100`, never reuses an existing server, and uses `.next-e2e` to isolate its output. Normal development remains on port 3000 with `.next`. Do not run two smoke suites in the same checkout at once. Chromium routes `lvh.me`, `app.lvh.me` and `learn.lvh.me` on port 3100 to loopback without public DNS. Readiness warms the login page through a Node loopback request with the canonical staff Host header, preserving host validation. The harness supplies dummy Supabase configuration over inherited/`.env.local` public values, matching development origins and cookie domain, and no tunnel alias. No secrets, test accounts or database service are needed; attempted browser Supabase requests fail the suite.

These three scenarios cover login rendering/validation, signed-out redirects and a public 404 in the development runtime. Production builds remain a separate check; this suite does not verify production HTTPS/cookies or authenticated/database flows. Compilation may download Google fonts. See [browser verification](docs/engineering.md#browser-smoke-tests) for scope and troubleshooting.

PR/main CI runs an independent Chromium job and uploads `playwright-failure` (HTML report and `test-results`, including screenshots/traces) on failure, retained for seven days. Generated reports are ignored. Playwright has no license cost; private-repository Actions minutes/storage remain quota-limited.

## References

- [Documentation index](docs/README.md).
- [Engineering](docs/engineering.md), [current API](docs/api/README.md), [deployment](docs/technical/deployment.md).
- [Native app](../mobile/README.md).

Source/API documentation does not establish deployment readiness. Follow AGENTS.md and keep application implementation separate from Master-thread planning.

Authenticated attendance CI uses `bash scripts/attendance-e2e-ci.sh` on a disposable **GitHub-hosted runner only**. It creates its own migrated Supabase Auth/API/PostgREST/Realtime/database instance, synthetic password accounts and three academies, runs `npm run test:e2e:attendance`, and destroys the complete instance. The Playwright command requires private CI-generated manifests; it has no placeholder or cloud fallback. This is separate from secret-free `npm run test:e2e` and the database-only SQL/concurrency job.

Keep 3100 free; the authenticated and smoke suites share `.next-e2e` and must run serially. Test origins remain `lvh.me`, `app.lvh.me`, `learn.lvh.me` on 3100; isolated Supabase API/DB use 54321/54322. No local Supabase/Docker setup is authorized. Failure artifacts include phase logs and scoped Playwright reports/traces for seven days, excluding private manifests/status/env/database dumps. Traces may contain synthetic credentials. See [Verification](docs/engineering.md#authenticated-attendance-integration) for lifecycle, diagnosis, outstanding runner/hosted acceptance evidence and coverage limits. The job verifies persisted draft Present plus signed-out/cross-academy denial; finalization, delivery and production HTTPS/cookies remain separate checks.
