# Web engineering

## Structure

Follow the [shared boundaries](../../docs/engineering/application-boundaries.md). Next.js routes/layouts compose features; src/modules/<domain>/ owns validation, authorization, data/services and feature UI. Modules use small public APIs, not another module's internals. Small infrastructure lives in src/lib/; external providers use adapters.

Default to Server Components and use Client Components for browser interaction. Trusted operations remain server-authorized. Read the installed Next.js guide for the affected feature; module READMEs and [HTTP contracts](api/README.md) describe current integration.

## Data and migrations

Use trusted academy context, live role checks, RLS, constraints and transactions. Client visibility cannot grant access. Preserve used records, official snapshots and correction history; keep generated database types aligned with schema changes. Backend/provider secrets stay off clients.

The database is cloud Supabase. Routine non-destructive migrations are pre-approved during authorized implementation. Destructive or hard-to-reverse changes need explicit owner approval and preservation/rollback planning. Committed/shared-applied migrations receive corrective migrations; preserve the legacy baseline. Do not make undocumented dashboard-only changes or reset shared projects for verification. Master threads remain planning-only.

## UI

Use Tabler for ordinary application icons and existing shadcn foundations for UI. Official brand logos retain their brand colors unless a different variant is explicitly specified. Feature UI stays in its module; reusable Edra UI lives in src/components/shared/. Protected primitives in src/components/ui/, components.json and theme tokens retain the existing owner-controlled rules. Compose behavior outside protected files. Follow the [shared brand](../../docs/engineering/brand.md) when its final identity is supplied.

Keep accessible loading/error/keyboard states. Empty tables are replaced entirely, including headers/body/scroll container; surrounding filters/search/permitted actions stay available. Use small focused components and avoid duplicate foundations.

Application source uses Tabler icons only; `lucide-react` and `react-icons` are no longer dependencies.

## Verification

Use the applicable web scripts: npm run lint, npm run typecheck, npm run test, npm run build, npm run test:edge and npm run test:edge:runtime. Run required checks appropriate to the changed behavior; do not mistake script presence for a pass.

`npm run typecheck` generates Next.js route types before running TypeScript, so a clean CI checkout can resolve `PageProps` and `LayoutProps`. `npm run test:edge` checks each Edge Function with its own `deno.json` dependency map and frozen `deno.lock`; it does not rely on the web application's installed npm dependencies. When changing a function's dependencies, update its lockfile with Deno before running the frozen check.

Verify affected database behavior against an authorized cloud development/isolated test target, including permissions, tenant isolation and relevant concurrency/retry rules. The full assertion suite runs only on an isolated test target, as described below.

During implementation, changes affecting database behavior, authorization, tenant isolation or concurrency require relevant cloud database verification; use selected suites where sufficient. Documentation-only and presentation-only changes do not require manual database testing. The full database suite remains an automated CI check on every PR and push to `main`, run against a disposable database built from that checkout (see [CI database](#ci-database)). It does not replace the selected cloud verification above or hosted integration and release checks. Do not manually repeat a passing CI run unless subsequent changes or unresolved concerns justify it.

Report source, test, cloud and deployed-flow evidence separately. Documentation edits do not establish runtime readiness.

### Edge Function checks

From `web/`, with Deno 2 on PATH:

```sh
npm run test:edge          # Static entrypoint checks
npm run test:edge:runtime  # Deno entrypoint/boundary behavior
npm test                  # Node unit tests, including _shared/whatsapp-auth.test.ts
```

The runtime command explicitly runs `send-whatsapp-auth`, `account-contact`, `account-password` and `student-onboarding` in separate Deno processes, each with its existing dependency map and frozen lockfile. The co-located `index_test.ts` suites capture `Deno.serve` before importing the real entrypoint once, then call its handler directly. No listening ports, Supabase instance, credentials, provider requests or paid services are needed. Dependency downloads/cache population may need network; runtime execution denies network, allows only each function's named configuration variables, and grants no file or subprocess access. Tests clear those variables before using dummy values, restore process state, intercept provider fetch and suppress captured development OTP logs. Unexpected fetches fail even when production catches delivery errors. Operation/resource sanitizers remain enabled.

The signed WhatsApp suite verifies Deno environment wiring, signature rejection, provider routing/default version, development mode normalization/logging and existing HTTP/JSON error contracts. The other three suites cover only preflight/CORS, unsupported methods, missing bearer and missing required configuration before network access. These do not establish JWT authenticity, RPC/RLS behavior, password changes, challenge persistence, hosted gateway behavior or actual delivery. The existing 13-case WhatsApp Vitest suite remains in `npm test`; only Deno `*_test.ts` files are excluded from Node discovery. The web TypeScript program excludes those files and Deno-only helpers. Deno still typechecks its tests and entrypoints.

The independent `CI / edge` job runs static checks followed by the same `scripts/edge-test.sh` runtime command on PRs and pushes to `main`, with Deno 2 and a ten-minute timeout. Assertion failures fail the job. Local implementation verification on 2026-10-20 used Deno 2.9.6; this is not evidence of a hosted CI run or Supabase's deployed runtime version. Hosted delivery remains a separate controlled release check. Test tooling has no paid-service requirement; GitHub Actions minutes remain quota-limited.

References: [Supabase function testing](https://supabase.com/docs/guides/functions/unit-test), [Deno test command](https://docs.deno.com/runtime/reference/cli/test/).

### Browser smoke tests

From `web/`, install with `npm ci` and `npx playwright install --with-deps chromium`, then run `npm run test:e2e`. Use `npm run test:e2e:ui` for interactive runs and `npx playwright show-report` to inspect the HTML report. Reports never open automatically; failure screenshots and traces are retained in `test-results/`. Open a trace with `npx playwright show-trace <path-to-trace.zip>`. Generated `playwright-report/`, `test-results/` and `blob-report/` are ignored.

Keep port 3100 free; stop any server on that port before running the suite. Playwright always starts its own Next.js development server on `127.0.0.1:3100` and refuses to reuse an existing server. The harness sets `EDRA_E2E=1` to select the ignored `.next-e2e` output directory; normal development still uses port 3000 and `.next`. Do not run two smoke suites in the same checkout simultaneously. Chromium maps `lvh.me` and `*.lvh.me` to loopback without public DNS; canonical hosts remain marketing `lvh.me`, staff `app.lvh.me` and student `learn.lvh.me`. All three test origins use port 3100. The server runner warms `/auth/login` using Node HTTP transport to `127.0.0.1:3100` with `Host: app.lvh.me:3100`, then signals readiness to Playwright. This avoids DNS while retaining canonical host validation; a bare loopback Host on port 3100 remains rejected. Readiness has a 120-second timeout, separate from each 30-second browser test.

The harness explicitly supplies matching public/server development origins and `lvh.me` cookie domain, clears the development tunnel alias, and overrides inherited or `.env.local` public Supabase values with `http://127.0.0.1:54321` and a nonsecret placeholder key. No database or auth service should listen there. Every test starts with empty cookies/storage and fails on attempted browser requests to that endpoint; authentication is never mocked. No real credentials, accounts or database infrastructure are needed.

The three Chromium scenarios cover login rendering/client validation, signed-out staff/student redirects (including the exact return path/query), and a public marketing 404. They establish development-runtime behavior only. The separate production build check remains required; production HTTPS/cookie behavior, authenticated journeys, API/database integrations, visual/accessibility checks, other browsers and native apps are outside this suite. Google font downloads during compilation still require network; a download/startup failure is separate from a browser assertion failure.

The independent `CI / e2e` job runs on PRs and pushes to `main`, with one worker, no retries, a five-minute suite timeout and a ten-minute job timeout. Only superseded browser jobs are cancelled by PR/ref concurrency. Failures fail CI and upload the HTML report and `test-results` as `playwright-failure` for seven days. Existing web, database and Edge Function checks remain independent. Tooling has no license cost; private-repository Actions minutes/storage remain quota-limited. Branch protection and billing settings are separate owner actions.

### Database assertions

`npm run test:db` (scripts/db-test.sh) runs the SQL suites in supabase/tests/ and then concurrency.sh against one explicitly configured isolated target: a prepared cloud target for manual runs, or the CI database below. It never starts Docker or a local stack, defaults to a connection, resets a database or applies migrations. It needs `psql` 10 or newer and:

- `EDRA_DB_TEST_URL`: a `postgres://` URL for a privileged role (Supabase `postgres`) on the isolated target. Use the direct connection or the session pooler (port 5432); the transaction pooler (port 6543) is rejected because races need stable sessions. The runner moves the password into the environment, never passes it as an argument, and masks the host, user and password in any reported error.
- `EDRA_DB_TEST_TARGET`: the expected name of the target. A target is isolated only when its `edra_db_test.target` table holds exactly that name.

Manual runs need a prepared cloud target (lifecycle below). The `edra-ci` cloud project (`msnjxvnblgkdeigctbhk`) and its repository secret `EDRA_DB_TEST_URL` and variable `EDRA_DB_TEST_TARGET` are no longer used by CI; removing them is a separate owner action. Only one runner may use a shared cloud target at a time. Credentials belong in secrets or the local environment, never in source files.

Run `npm run test:db -- --check` for the read-only preflight alone, or name suites to run a subset, e.g. `npm run test:db -- attendance concurrency`. Exit status 2 means the configuration, target or prerequisites were rejected before any write; 1 means a suite failed.

The read-only preflight rejects a missing or different marker, the app's configured Supabase project, a read-only replica, any repository migration absent from `supabase_migrations.schema_migrations`, any applied migration absent from the checkout, missing fixture privileges (insert into `auth.users`, `set role authenticated`, `authenticated` usage on `public` and `auth`) and existing rows that collide with the SQL suites' fixed fixture ids or auth phones.

Target lifecycle and limits:

- Use a dedicated Supabase project or branch for tests, never production or the shared development project. Its owner marks it once, on that target only: `create schema edra_db_test; create table edra_db_test.target (name text primary key); revoke all on schema edra_db_test from public, anon, authenticated; insert into edra_db_test.target values ('<name>');`.
- Apply migrations to the target with the normal migration workflow before running the suite; the runner only reports what is missing. Replaying all migrations from scratch is a separate, explicitly authorized operation on a clean target, never part of test:db.
- Every SQL suite runs in one transaction that is rolled back, but suites use fixed fixture ids, take strong locks (sessions.sql disables a trigger inside its transaction) and insert auth users. Do not run them concurrently with other activity on the target.
- concurrency.sh commits its fixtures because races need separate sessions. Each run creates a fresh academy (`race-<run>` slug), admin and ids, prints them, and retains them: preserved session, attendance and code history cannot be removed through normal flows. Reruns do not collide. Worker output is kept in a temporary directory, with connection details masked, only when the harness fails. Disposing of accumulated fixtures means disposing of the whole test target through its own authorized lifecycle.
- In CI, these fixtures are destroyed with the whole disposable instance; on cloud targets they are retained as above.
- Races wait until the lock holder is in its transaction and keep it open until the contender is observed waiting on a lock or has finished, instead of relying on fixed sleeps. Every worker's status is checked: a failed lock holder or a lost connection fails the run instead of counting as an expected rejection.

### CI database

The `CI / database` job (scripts/db-ci.sh) runs on every PR and push to `main`. It refuses to run outside a GitHub-hosted Actions runner and is not a local developer command. Each run:

1. installs Supabase CLI `2.117.0` (pinned to match `package-lock.json`; upgrade it deliberately, with a full CI run) and `psql`;
2. creates a fresh workspace under `RUNNER_TEMP` containing only scripts/ci/supabase.toml (PostgreSQL 17, seeding off, Auth/Storage/Realtime schema initialization on, other services off), scripts/ci/roles.sql and the timestamped migrations. The unnumbered legacy foundation.sql, developer `.temp`/linked state, env files and seeds are never copied;
3. runs `supabase db start` with a run-specific project id. The CLI initializes the managed schemas, runs roles.sql, then applies the migrations;
4. runs scripts/ci/prepare.sql, which checks PostgreSQL 17, the managed schemas, roles, columns and extensions (`pgcrypto`, `pg_cron`), the default-privilege baseline and both deadline cron jobs. It then pauses those cron jobs so they cannot race the explicit worker assertions, and creates the `edra_db_test.target` marker;
5. runs `npm run test:db`'s full suite against `127.0.0.1:54322`. Supplied cloud connection variables are ignored;
6. on success or failure, prints the last database log lines on failure, then runs `supabase stop --project-id <run> --no-backup`. The job keeps the first failing exit status, and a cleanup failure also fails the run.

roles.sql restores the cloud default privileges in `public` for `anon`, `authenticated` and `service_role` (tables, sequences, functions) that CLI 2.117.0 revokes when `api.auto_expose_new_tables` is unset. Early migrations rely on these defaults. It changes defaults only, before any application object exists; recheck it if the application changes its grant policy. The comment in supabase/config.toml that says the unset flag defaults to `true` does not match this CLI version.

The job needs no cloud credentials or concurrency group, since each runner has its own database. It has a 30-minute timeout and uses GitHub Actions minutes. These checks cover database behavior, grants, RLS, constraints and concurrency on real Supabase-managed schemas. They do not cover hosted OTP delivery, Storage file transfer, Realtime delivery, deployed Edge Functions or scheduled cron execution; keep those in cloud and release checks. When a run fails, the log names the failed phase, migration or suite.

### Task 4 verification configuration — 2026-10-19

The owner directed Task 4 to use only the disposable GitHub-hosted database runs, superseding this task’s earlier cloud-test-target requirement. No Task 4 migration or suite is run against shared/cloud projects. The database job exports `database-types` from its isolated schema before running suites; retrieve that artifact to update `src/lib/supabase/database.types.ts`. Generation never reads a linked cloud schema. This task-scoped verification decision does not establish a hosted production deployment.
