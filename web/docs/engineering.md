# Web engineering

## Structure

Follow the [shared boundaries](../../docs/engineering/application-boundaries.md). Next.js routes/layouts compose features; src/modules/<domain>/ owns validation, authorization, data/services and feature UI. Modules use small public APIs, not another module's internals. Small infrastructure lives in src/lib/; external providers use adapters.

Default to Server Components and use Client Components for browser interaction. Trusted operations remain server-authorized. Read the installed Next.js guide for the affected feature; module READMEs and [HTTP contracts](api/README.md) describe current integration.

## Data and migrations

Use trusted academy context, live role checks, RLS, constraints and transactions. Client visibility cannot grant access. Preserve used records, official snapshots and correction history; keep generated database types aligned with schema changes. Backend/provider secrets stay off clients.

The database is cloud Supabase. Routine non-destructive migrations are pre-approved during authorized implementation. Destructive or hard-to-reverse changes need explicit owner approval and preservation/rollback planning. Committed/shared-applied migrations receive corrective migrations; preserve the legacy baseline. Do not make undocumented dashboard-only changes or reset shared projects for verification. Master threads remain planning-only.

## UI

Use Hugeicons at stroke width 1.5 for ordinary application icons and existing shadcn foundations for UI. Official brand logos retain their brand colors unless a different variant is explicitly specified. Feature UI stays in its module; reusable Edra UI lives in src/components/shared/. Protected primitives in src/components/ui/, components.json and theme tokens retain the existing owner-controlled rules. Compose behavior outside protected files. Follow the [shared brand](../../docs/engineering/brand.md) when its final identity is supplied. Use the [UI implementation guide](ui/README.md) for component references, interaction patterns, cache behavior and verification.

Keep accessible loading/error/keyboard states. Empty tables are replaced entirely, including headers/body/scroll container; surrounding filters/search/permitted actions stay available. Use small focused components and avoid duplicate foundations.

Legacy icon imports and dependencies still exist; their presence does not override the Hugeicons rule. Migrate them deliberately without manually editing protected primitives or configuration.

## Verification

Use the applicable web scripts: npm run lint, npm run typecheck, npm run test, npm run build, npm run test:edge and npm run test:edge:runtime. Run required checks appropriate to the changed behavior; do not mistake script presence for a pass.

`npm run typecheck` generates Next.js route types before running TypeScript, so a clean CI checkout can resolve `PageProps` and `LayoutProps`. `npm run test:edge` checks each Edge Function with its own `deno.json` dependency map and frozen `deno.lock`; it does not rely on the web application's installed npm dependencies. When changing a function's dependencies, update its lockfile with Deno before running the frozen check.

Verify database behavior, permissions, tenant isolation and concurrency through the disposable GitHub Actions database job described below.

During implementation, run checks appropriate to the changed behavior. Verify database behavior, authorization, tenant isolation, and concurrency through the disposable GitHub Actions database job. Documentation-only and presentation-only changes do not require manual database testing. Hosted integration checks use the configured application development project when relevant and authorized; they do not require a separate cloud test database. Do not manually repeat a passing CI run unless subsequent changes or unresolved concerns justify it. The full database suite remains an automated CI check on every PR and push to `main`.

Report source, test, cloud and deployed-flow evidence separately. Documentation edits do not establish runtime readiness.

### Jobs fail before starting

When every job fails with no steps or logs, inspect the check annotations on the run's summary. The message "The job was not started because recent account payments have failed or your spending limit needs to be increased" means GitHub did not allocate runners; application checks have not executed.

The repository owner must resolve the payment or Actions spending limit in GitHub's Billing & plans settings. After that, rerun the failed jobs from the run summary, or use `gh run rerun <run-id> --failed`. A new pull request also triggers CI. Confirm that all required jobs actually run and pass before merging; local checks do not replace the disposable database and authenticated attendance jobs.

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

Database fixture and concurrency suites run only in the disposable GitHub-hosted `CI / database` job. Do not find or provision a separate cloud test project or branch, configure a worktree test connection, or run these suites against the shared application database. Local Supabase stacks remain outside the development workflow.

`scripts/db-ci.sh` creates and migrates the runner's database, marks it, then calls `npm run test:db` (`scripts/db-test.sh`). The internal runner requires GitHub-hosted Actions, a run-specific `edra-db-check-<run>-<attempt>-<suffix>` marker and the loopback database at `127.0.0.1:54322/postgres`. It rejects cloud hosts, connection overrides, missing/mismatched markers, migration drift, missing fixture privileges and existing fixture collisions before suite writes. Connection passwords stay out of arguments and are masked in diagnostics.

Within that job, `npm run test:db -- --check` runs only the read-only preflight; naming suites selects a subset. The normal job runs every suite and concurrency. Exit status 2 means the environment, configuration or prerequisites were rejected before writes; 1 means a suite failed.

Each SQL suite rolls its transaction back. Concurrency tests commit run-specific fixtures for separate sessions; the whole disposable instance is removed afterward. Strong locks, trigger changes and Auth fixtures must never be exercised on the shared development database. Races wait for observed lock contention and check every worker's status so lost connections and holder failures fail the job.

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

### Database types and hosted evidence

The database job exports `database-types` from its disposable schema before running suites; retrieve that artifact to update `src/lib/supabase/database.types.ts` when the schema changes. Do not seek a separate cloud test connection for generation. CI evidence does not establish hosted production deployment or provider integration readiness.

### Authenticated attendance integration

`CI / attendance-e2e` is an independent, failing-on-assertion job on every PR and push to `main`. It uses Ubuntu, Node 22, Chromium, PostgreSQL client and Supabase CLI **2.117.0**. It has a 30-minute job budget, a bounded 15-minute stack startup and a ten-minute browser suite. It has no cancel-in-progress group. Configuring it as a required branch-protection check remains an owner settings action; the workflow cannot enforce that setting.

`bash scripts/attendance-e2e-ci.sh` is **GitHub-hosted CI only**. It refuses local execution. Unlike the database-only job above, it starts actual Auth, API gateway/PostgREST, Realtime and Storage alongside PostgreSQL 17. Storage remains enabled for managed-schema initialization. Studio, analytics, SMTP and Edge runtime are disabled; seeding is off. No cloud project, paid branch, linked state, developer seeds, env files or legacy foundation are used. The fresh workspace copies only its dedicated config, bootstrap roles and timestamped migrations. Existing `prepare.sql` asserts the baseline, pauses unrelated deadline workers and marks the target. Setup verifies the complete migration history and proves the PostgREST live-session hook rejects a genuinely revoked password token.

The wrapper obtains status as private JSON, validates loopback API **54321** / database **54322**, and records a unique project identity under `RUNNER_TEMP`. Fixture writes and assertions require the matching database marker. Generated admin settings and DB credentials stay in private setup/assertion helpers; Next receives only the public URL/key. Two synthetic confirmed phone/password users are created with Auth admin, then real password sessions invoke the domain commands. Bootstrap SQL creates three academies with current Cairo academic years, levels and groups. A/B grant the instructor access; C has no membership. Fixtures commit for HTTP connections and are destroyed with the whole instance, preserving ordinary history guards.

`npm run test:e2e:attendance` is the guarded Playwright entrypoint, invoked by the wrapper after setup. It requires the private generated manifests and services and refuses missing settings; use `npm run test:e2e` for the existing secret-free smoke suite. Both use the dedicated development server on **3100**, `.next-e2e`, the three `lvh.me` hosts and parent-cookie domain. Never run them together or concurrently with another process generating that build directory. The normal port-3000 process is never reused.

The authenticated scenario signs in through the UI, switches to B through the existing menu, starts a session, checks in one student with Late-after 0, then reloads and checks the fresh cookie API result and database persistence. The control stays Unknown; attendance remains unpublished. A fresh signed-out context must preserve the exact login return path; a cookie-free v1 mutation must return `401 UNAUTHENTICATED`. A genuine instructor login cannot see C in the switcher or through its direct page; separate public-key password bearer requests require `404 NOT_FOUND` for C and a successful B read. Full attendance, sheet and receipt snapshots prove denial changes nothing.

Teardown is registered before startup, retains the first failure, stops only this run's project without backup and deletes temporary files. An `always()` Actions step retries cleanup; destruction of the GitHub runner is the final boundary after forced cancellation. No local Docker execution is required or permitted for implementation verification. Guard tests exercise rejected targets and startup failure/cleanup with fake executables only.

For failures, first inspect the named phase and exit code in `artifacts/attendance/phases.log`; browser failures also have the scoped HTML report and screenshots/traces. The `attendance-e2e` artifact is retained for seven days. Raw service/startup/status output, credential manifests, auth state, env files and database dumps are deliberately excluded. Traces can contain disposable synthetic login credentials; never use this suite against real accounts. Compilation/readiness failure is distinct from an assertion failure. Tooling requires no paid service, but Actions minutes/storage are quota-limited.

Acceptance requires observed GitHub-hosted evidence: two independent passing authenticated jobs, a deliberately broken persistence/authorization expectation failing before restoration, cleanup/artifacts on that failed run, and the existing database CI suite passing. Record observed results in the pull request; source review and local guard tests do not establish this evidence. Selected hosted integration verification remains separate and uses the configured application development project when relevant and authorized. A runner pass proves browser → Next cookie action/API → real Auth/PostgREST/database persistence; it does not prove hosted configuration, production HTTPS/cookies, scheduled services, realtime collaboration, scanning, offline/retry UI, finalization, notifications or SMS/WhatsApp delivery.

References: [CLI lifecycle](https://supabase.com/docs/reference/cli/supabase-start), [CLI configuration](https://supabase.com/docs/guides/local-development/cli/config), [Auth admin createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser), [Playwright authentication](https://playwright.dev/docs/auth).
