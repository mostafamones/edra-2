<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Edra engineering rules

## Workspace planning rules

- Follow the repository-root `../AGENTS.md`: threads with `Master` in their title, or declared Master threads by the owner, are planning-only. Application implementation must happen in a separate implementation thread.
- The repository-root `../plans.md` is restricted deferred context. Do not read, search, or use it unless the owner directs you. `After v1:` authorizes recording the supplied item only; it does not authorize implementation or broader backlog review.

## Source of truth

- Read `docs/MVP-BUILD-CONTRACT.md` before building a feature. Use the relevant detailed files in `docs/` for domain terms, scope, invariants, data relationships, and permissions.
- Treat the detailed product documents as owner-controlled. Do not edit them without the owner's approval.
- If documents conflict, or implementation reveals a decision affecting data integrity, security, permissions, external communication, or irreversible behavior, explain the conflict and ask the owner. Do not silently invent a rule.
- Build the smallest complete vertical slice needed for the current milestone. Do not implement deferred MVP features or model the entire product in one migration.

## Architecture and repository

- This is a single-repository modular monolith, not a monorepo or a collection of microservices. `web/` is the deployable Next.js application; Supabase provides Postgres, Auth, Row Level Security (RLS), Storage where appropriate, and Realtime where useful.
- The database is cloud-hosted Supabase. Use the configured cloud project and available Supabase connection or tools; do not look for a running local database, start a local Supabase/Docker stack, or require local database setup unless the owner explicitly requests it. Local migration files and Supabase configuration are not evidence of a local database.
- Keep related business logic in `src/modules/<domain>/` (for example, `academies`, `students`, `attendance`, and `content`). A module owns its validation, authorization rules, queries, mutations, domain services, and feature-specific components.
- Keep `src/app/` focused on routes, layouts, page composition, and Next.js boundary files. Do not place substantial business rules in pages or route handlers.
- Keep `src/components/ui/` for CLI-added shadcn primitives. Put reusable Edra components in `src/components/shared/`; put feature-specific components inside their owning module.
- Keep small cross-cutting infrastructure in `src/lib/`. Keep external video and messaging providers behind adapters so provider-specific details do not spread through domain code.
- Give each module a small, explicit public API. Do not import another module's internal queries, policies, or components directly. When modules need to collaborate, use their public services or a deliberately shared domain contract.
- Prefer ordinary functions and clear module boundaries over unnecessary abstraction. Do not introduce a new package, service, queue, or framework solely for hypothetical future scale.

## Next.js and application boundaries

- Follow the installed Next.js documentation as required by the preserved block above. Do not rely on remembered APIs or conventions.
- Default to Server Components. Use Client Components only for browser interaction, local state, or browser-only APIs; keep the client boundary as small as practical.
- Perform trusted mutations and sensitive reads on the server. Validate inputs at trust boundaries, authorize each operation, and keep secrets out of client code.
- Do not use a hidden button or client-side filtering as an authorization mechanism.

## Tenant security and data integrity

- Scope every academy-owned operation to a trusted academy context and verify the actor's membership and role. Never trust a browser-supplied academy ID by itself.
- Enforce authorization server-side and through Supabase RLS. Keep the permission matrix default-deny.
- Put permanent invariants in database constraints, transactions, and RLS where appropriate—not only in UI validation.
- Keep multi-write workflows atomic. Make publication and externally retried operations idempotent where the product contract requires it.
- Preserve published academic history. Correct or archive used records instead of casually hard-deleting them.

## Database schema migrations

- Keep schema changes in `supabase/migrations/` as timestamped, descriptive SQL migrations. The existing `foundation.sql` is a preserved legacy baseline; do not rename or rewrite it without the owner's approval.
- Each new migration should cover one coherent schema change or vertical slice. Include the related constraints, indexes, RLS policies, grants, and database functions needed to make that change safe.
- An uncommitted migration used only locally may be edited. Once committed or applied to a shared environment, do not rewrite it; add a corrective migration.
- Never make an undocumented dashboard-only schema change. Never apply a migration to staging or production without the owner's explicit approval.
- Destructive or hard-to-reverse migrations require the owner's approval and a data-preservation or rollback plan.
- Regenerate and commit Supabase TypeScript database types when the schema changes. Keep application types aligned with the actual schema.
- Verify database changes against an authorized cloud development or isolated test database, including relevant constraints, policies, and transactions. Replay migrations only on an explicitly authorized clean test target; never reset a shared cloud database for verification. Use a local database only if the owner explicitly requests it. If a suitable cloud connection or test target is unavailable, report what could not be verified; do not claim verification or default to local setup. Existing approval requirements for cloud migrations still apply.

## shadcn and components

- Use `@tabler/icons-react` for all application UI icons. Use Tabler component types instead of `LucideIcon`; do not introduce Lucide, `react-icons`, or another icon library. `components.json` already selects Tabler; preserve that setting and follow the protected-file rules below.
- For every new or migrated UI component, first identify the applicable shadcn primitives. If shadcn provides a suitable foundation, agents must use it—either an existing primitive or one added with `npx shadcn@latest add <component>`. Agents must not hand-build an equivalent primitive. If no suitable shadcn primitive exists, explain the gap and ask the owner before creating a custom foundation.
- Agents must not manually create, edit, delete, rename, or overwrite files in `src/components/ui/`. Do not use CLI overwrite flags. If the CLI proposes changing an existing primitive or protected design-system file, stop and ask the owner.
- `components.json` and the shadcn theme tokens in `src/app/globals.css` are owner-only. Agents may edit unrelated application CSS without altering those tokens.
- Build Edra-specific behavior, styling, and variants through wrappers or composed components outside `src/components/ui/`; do not fork or patch the shadcn primitive.
- Give each file one clear purpose. A component file should have one primary exported component; small private helpers or inseparable subcomponents are fine.
- Keep filenames as short as the containing path allows. Let folders carry the context: use `src/modules/onboarding/components/footer.tsx` and `src/modules/auth/components/forms/login.tsx`, not `onboarding-footer.tsx` or `login-form.tsx`. Avoid repeating a parent folder name or adding generic filename suffixes such as `-component` or `-form`; add a qualifier only when needed to distinguish sibling files. Keep exported component names descriptive, such as `LoginForm` inside `forms/login.tsx`.
- Before creating another similar component, check whether one reusable component with explicit variants or props can serve the cases cleanly. Do not force unrelated behaviors into a giant configurable component.
- Keep accessibility, loading, empty, error, and responsive states consistent with the chosen primitives.
- All tables must have an empty state that replaces the table and does not sit inside it. For both no records and no matching search/filter results, conditionally render a composed shadcn empty state instead of the entire table, including its headers, body, and table scroll container. Never put the empty state inside a table row or cell. Keep relevant surrounding controls available, including clear filters and permitted create actions.

## Migrating older UI components into Edra

- The owner chooses and provides the older UI elements to reuse. Do not search old projects for candidates or import an old design wholesale.
- For each supplied component, identify its purpose, dependencies, interactions, data assumptions, and where it belongs in the current route/module structure. Discuss any ambiguous behavior or design change with the owner before implementing it.
- Rebuild the component around Edra's current architecture and shadcn primitives. Preserve the approved visual/interaction intent, but do not carry over obsolete data logic, permissions, styling infrastructure, or duplicated components by default.
- Prefer adapting an existing reusable Edra component or adding a variant when multiple old components serve the same purpose.
- Never paste older code into `src/components/ui/` or modify protected shadcn files as part of a UI migration.

## Verification and change safety

- Run `npm run lint`, `npm run build`, and relevant tests for implementation changes. Add an appropriate test setup when the first feature needs one.
- Test security-sensitive paths from an unauthorized and a cross-academy perspective, not only the happy path.
- Report what was tested, what could not be tested, and why.
- Preserve user changes. Do not make unrelated rewrites or edit owner-controlled specifications and design-system files without approval.
- Treat changes to this `AGENTS.md` as sensitive: discuss the proposed wording with the owner and obtain approval before editing it.
