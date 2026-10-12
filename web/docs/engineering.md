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

Current source still contains non-Tabler imports. That is a separate implementation gap; this documentation update does not migrate components or remove dependencies.

## Verification

Use the applicable web scripts: npm run lint, npm run typecheck, npm run test, npm run build and npm run test:edge. Run required checks appropriate to the changed behavior; do not mistake script presence for a pass.

Verify affected database behavior against an authorized cloud development/isolated test target, including permissions, tenant isolation and relevant concurrency/retry rules. test:db currently starts and resets local Supabase through scripts/db-test.sh; it is not the default cloud verification command. A cloud-compatible harness is an implementation follow-up, not a requirement to install local Docker.

Report source, test, cloud and deployed-flow evidence separately. Documentation edits do not establish runtime readiness.
