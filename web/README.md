# Edra web

Next.js staff/student application and the modular backend using cloud Supabase. Native clients use its authenticated HTTP API.

## Development

From web/, install the locked dependencies with npm ci, copy .env.example to .env.local, set the configured cloud project's public values and development origins, then run npm run dev. Keep secrets server-side. No local database is required.

Development hosts use lvh.me, app.lvh.me and learn.lvh.me on port 3000; see [routing](docs/technical/routing.md). Check available commands in package.json. test:db runs the database assertions against an explicitly configured, marked isolated test target; it never starts a local stack, resets a database or applies migrations. CI runs it against a disposable database on the GitHub runner (scripts/db-ci.sh). See [database assertions](docs/engineering.md#database-assertions).

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
