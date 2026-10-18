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

Use the applicable web scripts: npm run lint, npm run typecheck, npm run test, npm run build and npm run test:edge. Run required checks appropriate to the changed behavior; do not mistake script presence for a pass.

`npm run typecheck` generates Next.js route types before running TypeScript, so a clean CI checkout can resolve `PageProps` and `LayoutProps`. `npm run test:edge` checks each Edge Function with its own `deno.json` dependency map and frozen `deno.lock`; it does not rely on the web application's installed npm dependencies. When changing a function's dependencies, update its lockfile with Deno before running the frozen check.

Verify affected database behavior against an authorized cloud development/isolated test target, including permissions, tenant isolation and relevant concurrency/retry rules. The full assertion suite runs only on an isolated test target, as described below.

During implementation, changes affecting database behavior, authorization, tenant isolation or concurrency require relevant cloud database verification; use selected suites where sufficient. Documentation-only and presentation-only changes do not require manual database testing. The full database suite remains an automated CI check on every PR and push to `main`. Do not manually repeat a passing CI run unless subsequent changes or unresolved concerns justify it.

Report source, test, cloud and deployed-flow evidence separately. Documentation edits do not establish runtime readiness.

### Database assertions

`npm run test:db` (scripts/db-test.sh) runs the SQL suites in supabase/tests/ and then concurrency.sh against one explicitly configured cloud target. It never starts Docker or a local stack, defaults to a connection, resets a database or applies migrations. It needs `psql` 10 or newer and:

- `EDRA_DB_TEST_URL`: a `postgres://` URL for a privileged role (Supabase `postgres`) on the isolated target. Use the direct connection or the session pooler (port 5432); the transaction pooler (port 6543) is rejected because races need stable sessions. The runner moves the password into the environment, never passes it as an argument, and masks the host, user and password in any reported error.
- `EDRA_DB_TEST_TARGET`: the expected name of the target. A target is isolated only when its `edra_db_test.target` table holds exactly that name.

GitHub Actions uses the dedicated Free-plan `edra-ci` project (`msnjxvnblgkdeigctbhk`), separate from the application's `edra-1` project. The connection is stored in the repository secret `EDRA_DB_TEST_URL`, and the repository variable `EDRA_DB_TEST_TARGET` is `edra-ci`. The database job installs `psql`, checks the target, then runs the suites. Its concurrency group serializes CI runs against this target; coordinate manual runs with CI as well. Apply new repository migrations to this test project before the corresponding CI run. Credentials belong in secrets or the local environment, never in source files.

Run `npm run test:db -- --check` for the read-only preflight alone, or name suites to run a subset, e.g. `npm run test:db -- attendance concurrency`. Exit status 2 means the configuration, target or prerequisites were rejected before any write; 1 means a suite failed.

The read-only preflight rejects a missing or different marker, the app's configured Supabase project, a read-only replica, any repository migration absent from `supabase_migrations.schema_migrations`, missing fixture privileges (insert into `auth.users`, `set role authenticated`, `authenticated` usage on `public` and `auth`) and existing rows that collide with the SQL suites' fixed fixture ids or auth phones.

Target lifecycle and limits:

- Use a dedicated Supabase project or branch for tests, never production or the shared development project. Its owner marks it once, on that target only: `create schema edra_db_test; create table edra_db_test.target (name text primary key); revoke all on schema edra_db_test from public, anon, authenticated; insert into edra_db_test.target values ('<name>');`.
- Apply migrations to the target with the normal migration workflow before running the suite; the runner only reports what is missing. Replaying all migrations from scratch is a separate, explicitly authorized operation on a clean target, never part of test:db.
- Every SQL suite runs in one transaction that is rolled back, but suites use fixed fixture ids, take strong locks (sessions.sql disables a trigger inside its transaction) and insert auth users. Do not run them concurrently with other activity on the target.
- concurrency.sh commits its fixtures because races need separate sessions. Each run creates a fresh academy (`race-<run>` slug), admin and ids, prints them, and retains them: preserved session, attendance and code history cannot be removed through normal flows. Reruns do not collide. Worker output is kept in a temporary directory, with connection details masked, only when the harness fails. Disposing of accumulated fixtures means disposing of the whole test target through its own authorized lifecycle.
- Races wait until the lock holder is in its transaction and keep it open until the contender is observed waiting on a lock or has finished, instead of relying on fixed sleeps. Every worker's status is checked: a failed lock holder or a lost connection fails the run instead of counting as an expected rejection.
