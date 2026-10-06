# Edra workspace rules

These rules apply to the entire repository. Also follow `web/AGENTS.md` for the web application/API and `mobile/AGENTS.md` for the mobile application.

## Repository and application boundaries

- Edra supports two applications in one repository: `web/` is the Next.js web application and trusted API; `mobile/` is the planned native iOS instructor companion application, using Swift and SwiftUI. Each application has its own dependencies, build, verification, and release process.
- The backend remains a modular monolith in `web/` with cloud Supabase. The mobile application consumes the documented authenticated API and Supabase Auth; it must not duplicate attendance rules, import web server internals, or introduce a second backend.
- Do not add root workspace orchestration, shared packages, or migrate the existing web toolchain merely because both applications share a repository. Add shared contracts/tooling only when a concrete need justifies them.
- The owner has authorized mobile setup planning and repository guidance for the instructor companion scope. This clarification supersedes older product-document exclusions of native mobile for that scope only. It does not authorize implementing an app in a Master thread or expanding it into the full staff/student product.
- Keep app-specific rules scoped to the relevant folder. Next.js/shadcn web rules do not require native components to use browser-only primitives. Preserve shared tenant authority, history, cloud migration approval, and planning-only rules.
- The repository-root `plans.md` remains restricted deferred context: do not read, search, or use it unless the owner directs you.

## Database environment

- Edra uses a cloud-hosted Supabase database. A local Supabase database is not the default development or verification environment.
- Use the configured cloud project through the available Supabase connection or tools. Do not look for a running local database, start a local Supabase/Docker stack, or require local database setup unless the owner explicitly requests it.
- Repository migration files and Supabase configuration do not imply that a local database exists. Preserve the cloud migration approval and verification rules in `web/AGENTS.md`.

## Table empty states

- All tables must have an empty state that replaces the table and does not sit inside it. This applies both to datasets with no records and to filters or searches with no results.
- Render the empty state instead of the entire table, including its headers and body. Do not place empty-state content inside a table row, cell, or table scroll container. Keep relevant surrounding controls available, such as search, clear filters, or a permitted create action.

## Master threads

- A thread whose title contains `Master` (case-insensitive), or which the owner explicitly identifies as a Master thread, is a planning-only thread. If the title is unavailable, use the owner's declaration; do not infer the thread title from a branch or file name.
- In a Master thread, discuss requirements, inspect relevant existing code without changing it, and export concrete implementation plans for agents working in separate implementation threads.
- Do not implement application code, change dependencies or configuration, run migrations, or execute implementation work through subagents from a Master thread. Requests for features in that thread are requests to plan them.
- Planning documents and explicitly requested `AGENTS.md` guidance may be created or updated in a Master thread. These documentation changes are permitted; application implementation belongs in a separate thread.
- Keep confirmed requirements separate from proposals and unresolved decisions. A plan is not authorization to execute it.

## Icons

- Use Tabler for every application UI icon, including navigation, actions, status indicators, loading indicators, and brand icons where available. Web uses `@tabler/icons-react`; the SwiftUI iOS app uses bundled native-compatible assets derived from Tabler icons, with source/version attribution. Do not use the React DOM icon package in native code.
- Do not introduce or retain Lucide or other icon libraries in application source. Use Tabler icon types for icon component contracts.
- Preserve the web shadcn rules in `web/AGENTS.md` and the native UI boundaries in `mobile/AGENTS.md`; the icon requirement does not authorize manual edits to protected primitives or design-system configuration.
