# Edra workspace rules

These rules apply to the entire repository. Also follow `web/AGENTS.md` for the web application/API and `mobile/AGENTS.md` for the mobile application.

## Repository and application boundaries

- Edra supports two applications in one repository: `web/` is the TanStack Start web application and trusted API; `mobile/` contains the native Swift/SwiftUI instructor companion; future Android support is native Kotlin under its approved milestone. Each application has its own dependencies, build, verification, and release process.
- The backend remains a modular monolith in `web/` with cloud Supabase. The mobile application consumes the documented authenticated API and Supabase Auth; it must not duplicate attendance rules, import web server internals, or introduce a second backend.
- Do not add root workspace orchestration, shared packages, or migrate the existing web toolchain merely because both applications share a repository. Add shared contracts/tooling only when a concrete need justifies them.
- The owner has authorized mobile setup planning and repository guidance for the instructor companion scope. This clarification supersedes older product-document exclusions of native mobile for that scope only. It does not authorize implementing an app in a Master thread or expanding it into the full staff/student product.
- Keep app-specific rules scoped to the relevant folder. TanStack Start/shadcn web rules do not require native components to use browser-only primitives. Preserve shared tenant authority, history, verification, destructive-change approval, and planning-only rules.
- The repository-root `plans.md` remains restricted deferred context: do not read, search, or use it unless the owner directs you.

## Database environment

- Edra uses a cloud-hosted Supabase database. A local Supabase database is not the default development or verification environment.
- Use the configured cloud project through the available Supabase connection or tools. Do not look for a running local database, start a local Supabase/Docker stack, or require local database setup unless the owner explicitly requests it.
- Automated GitHub Actions database tests create, migrate, verify, and discard a fresh Supabase instance on the GitHub runner. Use these disposable CI databases for SQL assertions, RLS, constraints, transactions, concurrency, and migration replay. Do not seek, provision, or require a separate cloud test project or branch. This does not authorize local developer stacks, shared-database resets, or changes to shared cloud databases. Hosted integration checks use the configured application development project when relevant and authorized.
- Repository migration files and Supabase configuration do not imply that a local database exists. Routine non-destructive migrations are pre-approved during authorized implementation; only destructive or hard-to-reverse migrations require explicit owner approval. Preserve verification and history rules in `web/AGENTS.md`.

## Documentation and planning

- Deliver requested plans as complete, self-contained copy-paste text in the chat by default, including in Master threads. Do not create or update a plan file unless the owner explicitly requests one. Plans must be usable to start an implementation thread in a different worktree without relying on an uncommitted plan file. An explicitly requested plan file remains unstaged and uncommitted unless the owner explicitly asks to commit it.
- Use `web/docs/README.md` and `mobile/docs/README.md` for references; shared constraints live in `docs/engineering/`. Preserve the existing setup and agreed product rules. Review worksheets and temporary plans are not new development requirements.
- Master threads use product context and current technical evidence. Before exporting an implementation plan, settle relevant open decisions with the owner and update the affected documentation to the latest agreed terms. Do not invent restrictions or workflows to fill gaps.
- Implementation plans are self-contained. Implementation agents read the engineering/API references and only the final product sections assigned by their plan; unresolved discussions and review queues are not requirements. Ask about genuine consequential conflicts, not routine factual documentation corrections.
- Assume implementation plans will run in a separate worktree. Include the intended branch and, when configurable, worktree folder name using the naming rules below. State the required base commits and include all instructions needed without relying on the Master thread's working tree.

## Worktrees and branch names

- Name worktree branches `type/short-hyphenated-title`, using a lowercase conventional type such as `feat`, `fix`, `docs`, `refactor`, `test`, `ci`, or `chore`. The title must be lowercase and hyphenated, normally one to three words and never more than four; for example, `feat/student-suspension` or `fix/access-filter`.
- When the worktree folder name is configurable, use only the title portion, such as `student-suspension` for `feat/student-suspension`.

## Commit runs

- Never mark plan files with Git's intent-to-add flag (`git add -N` or `git add --intent-to-add`). Keep plans unstaged unless the owner explicitly asks to commit them; creating, updating, or exporting a plan does not authorize staging it.
- When the owner requests a "commit run", review the current changes, run the relevant verification checks, and create Git commits for the requested scope.
- Group related changes into focused, coherent commits. Stage each group separately, using partial staging when a file contains changes belonging to different groups. Create as many commits as needed to represent the work clearly.
- Give each commit a clear subject and a detailed message explaining what changed and why. Include relevant verification results and material limitations.
- When working in a separate worktree on a non-`main` branch, every completed prompt run that changes files automatically includes reviewing the changes, running relevant verification, committing the authorized task changes, and pushing to that branch's remote. Do not wait for an explicit commit run or another push request. Set the upstream on the first push when needed. Runs with no changes do not require an empty commit.
- Automatic worktree commits follow the focused-commit, detailed-message, verification and plan-file rules above. Leave unrelated changes untouched and report verification failures or unavailable evidence accurately.
- Outside the automatic worktree workflow, push only when the owner explicitly requests it or invokes "Commit docs" below.

### Commit docs

- When the owner requests "Commit docs" (case-insensitive), that is explicit approval to review, commit all pending documentation changes, and push them directly to `main` without further confirmation. This includes `AGENTS.md`, product and engineering documentation, and module READMEs. Preserve restricted-file access rules and any explicit file exclusions.
- Verify that both the staged changes and the full outgoing commit range contain only documentation changes. Check the actual content, not just file extensions; do not include application code, dependencies, configuration, migrations or generated application files. Leave unrelated non-documentation changes untouched, and do not push existing non-documentation commits under this authorization.
- Follow the focused-commit and detailed-message rules above. Include `[skip ci]` in every documentation commit subject created by this command.
- Run documentation-appropriate checks, including `git diff --check` and checking affected references. Application tests/builds are not required for documentation-only changes. Push normally to `main`; this command does not authorize force-pushing or rewriting shared history.

## Pull request titles

- Name every pull request `type(scope): summary`. Both the type and scope are required, for example `fix(ci): stabilize database runner tests` or `docs(assessments): clarify submission rules`.
- Use a lowercase conventional type such as `feat`, `fix`, `docs`, `refactor`, `test`, `ci`, or `chore`, and a short lowercase scope identifying the affected application, domain, or component. Keep the summary concise, imperative, and accurate for the final changes in the pull request.
- Check the title before creating or updating a pull request, and revise it when the final scope changes.

## UI copy and helper text

- Do not add helper text by default anywhere in either application. This includes descriptions under fields, page subtitles, section introductions, card descriptions, and explanatory text beside controls. Add helper text only when the owner explicitly requests it.
- Use clear, concise labels and self-explanatory controls instead of explaining each field or part of a screen. Do not replace omitted helper text with unsolicited info icons or placeholder instructions.
- Tooltips for buttons and actions, and where useful for icons that communicate a state, are encouraged. Show them after a short, consistent delay. These tooltips are permitted without an explicit request for helper text; preserve accessible labels independently of tooltips.
- Keep actionable validation errors, required status feedback, and accessible labels available; these are functional UI feedback, not optional helper text.

## Table empty states

- All tables must have an empty state that replaces the table and does not sit inside it. This applies both to datasets with no records and to filters or searches with no results.
- Render the empty state instead of the entire table, including its headers and body. Do not place empty-state content inside a table row, cell, or table scroll container. Keep relevant surrounding controls available, such as search, clear filters, or a permitted create action.

## Master threads

- If the owner explicitly instructs you to implement, proceed with the requested implementation without checking whether the thread is a Master thread or asking for confirmation on that basis. This instruction overrides the planning-only restrictions below for the requested work; all other repository rules still apply.
- Otherwise, a thread whose title contains `Master` (case-insensitive), or which the owner explicitly identifies as a Master thread, is a planning-only thread. If the title is unavailable, use the owner's declaration; do not infer the thread title from a branch or file name.
- In a Master thread, discuss requirements, inspect relevant existing code without changing it, and export concrete implementation plans for agents working in separate implementation threads.
- Do not implement application code, change dependencies or configuration, run migrations, or execute implementation work through subagents from a Master thread. Requests for features in that thread are requests to plan them.
- Planning documents and explicitly requested `AGENTS.md` guidance may be created or updated in a Master thread. These documentation changes are permitted; application implementation belongs in a separate thread.
- Keep confirmed requirements separate from proposals and unresolved decisions. A plan is not authorization to execute it.
- When reviewing or planning a feature, Master threads identify contradictions between the relevant documentation, current implementation and the owner's agreed requirements. List each contradiction with file/section references, explain the difference, and recommend a resolution: plan implementation to match the agreed documentation, or propose exact edits to the affected documentation to match the agreed behavior. Settle the choice with the owner before treating it as an implementation requirement, then update the affected documentation and plan. Existing code does not automatically override an agreed product decision.

## Icons

- Use Hugeicons for every application UI icon, including navigation, actions, status indicators and loading indicators. Use a stroke width of `1.5` for application icons. Web uses `@hugeicons/react` with `@hugeicons/core-free-icons`; the SwiftUI iOS app uses bundled native-compatible assets derived from Hugeicons, with source/version/license attribution. Do not use the React DOM icon package in native code.
- Brand logos are an exception to the Hugeicons requirement. Use official brand assets and their brand colors by default, such as the multicolor Google logo for Google sign-in. Use a monochrome, filled or other variant only when explicitly specified. Brand assets do not need to fit a Hugeicons icon contract.
- Do not introduce or retain Tabler, Lucide or other general UI icon libraries in application source. Use Hugeicons-compatible types for ordinary UI icon contracts.
- Preserve the web shadcn rules in `web/AGENTS.md` and the native UI boundaries in `mobile/AGENTS.md`; the icon requirement does not authorize manual edits to protected primitives or design-system configuration.
