# Development tools implementation plan

Final scoped plan, 2026-10-21. Prepared in a Master thread. Execute only when the owner starts/authorizes implementation in an implementation thread. These files remain unstaged unless the owner requests their commit.

## Outcome and order

Deliver a 20-student synthetic academy with current-year history, followed by real-session developer preview across staff/student portals. Keep destructive reset separate.

Run these tasks sequentially, each in a bounded implementation context:

1. [Pure scenario builder](01-scenario.md).
2. [Registry, no-delivery and credentials](02-support.md).
3. [Cloud historical loader](03-loader.md).
4. [Developer session backend](04-sessions.md).
5. [Preview frame and navigation](05-interface.md).
6. [Acceptance walkthrough](06-acceptance.md).

[Destructive reset](07-reset.md) is a separate procedure work item. Its preparation can follow the data loader; execution requires a reviewed, explicitly selected run. It is never an automatic test or generation retry.

## Shared execution rules

- Read root and web AGENTS.md, web/docs/engineering.md, then **only** the final product sections and source references assigned by your task. Do not read root plans.md, old discussion drafts, unrelated product domains or every SQL test.
- Product source: web/docs/product/domains/development-tools.md. Task 1 locks the recipe below; subsequent agents consume its manifest/schema rather than re-inventing it.
- Existing web dependencies and architecture remain. No root orchestration, local Supabase/Docker, backend migration, UI redesign, or general impersonation of real users.
- Work only within the listed files/areas. Equivalent helper naming is routine; expanding into another domain or changing a specified contract is not.
- Keep generation, identity credentials and destructive reset distinct. Never use seeded randomness for secrets, print credentials, emit raw connection URLs, or dump environment files.
- Use explicit cloud project matching. Existing non-destructive implementation migrations are pre-approved under repository rules; destructive execution retains owner approval.
- Preserve user changes. Do not stage plans, use intent-to-add, commit or push unless requested.
- Do not add speculative tests. Run meaningful checks for the actual task; lint/build are required for implementation changes. Do not repeat a passing full CI database suite without changed evidence.
- Stop the affected task with exact file/invariant evidence if it requires weakening ordinary auth/history rules, touching unrelated academy data, changing protected shadcn primitives/theme, sending real messages, or implementing excluded product features.
- Before declaring Done, list changed files, completed acceptance IDs, actual checks/results and any blocked verification. Existing coverage is not a new test run. Missing cloud access means blocked cloud verification, never a local-stack substitution.

## Fixed recipe and counts

Default recipe version `edra-dev-v1`, seed `edra-20-v1`, reference date `2026-10-21`, timezone Africa/Cairo. The CLI accepts an explicit reference date for reproducible future runs; do not silently replace it with the execution date on retry.

One academy, one current open academic year, 20 Auth-linked students, 20 annual records, four groups of five, six generated staff (Owner, Head Admin, Admin, three Instructors), plus the real owner as Instructor. Two levels: `preparatory-3` with two level-only groups, and `secondary-2` with Scientific/Literature tracks and one group per track. All first-run student records are in-person.

Use complete Monday–Sunday teaching weeks within the current academic year and ending before the reference date. August 17–October 18 gives nine weeks. Two sessions per group per week yield 72 ended sessions, 360 roster entries, 72 initial attendance publications and 360 publication items. Four recurring schedules have two slots each. No historical session is live, and no future session row is inserted.

Per group: an assignment every second completed week and an exam every fourth completed week. Default totals: 16 historical assignments + four current assignments = 20; eight historical standalone exams + one open preparatory-level exam + one upcoming secondary-level exam = 10.

Historical assignments use physical work and two Written Work parts worth 50 each. Historical exams use recorded paper work with five Written Work questions worth 20 each. Current exams use five text MCQs worth 20 each with four choices and one correct choice. No media or content links.

Five students per performance pattern: consistent, improving, temporary dip, irregular attendance. Each student gets a stable logical identity, compatible placement and chronological event plan. Missing work, unmarked received work and private unannounced marks are deliberate cases, not inconsistent publication rows.

If a reference date has no complete teaching week, dry-run reports insufficient history rather than inventing dates outside the year. Current examples must also fit the year; if insufficient days remain for the upcoming exam window, fail validation with a request for a different reference date.

## Resolved evidence conflicts

- Three months crossed August 16; owner chose shorter current-year history. Do not add previous-year records or alter generated year dates.
- Magic-link/OTP sessions are recovery-only in Edra. Use password sessions without removing existing guards.
- Normal session-start commands timestamp now. Historical fixtures insert complete aggregates with constraints/triggers active, using the mapping in task 3.
- Reset conflicts with protected-history deletion. Owner chose a separate reviewed destructive procedure; normal app deletion remains forbidden.
- Instructor authorship is varied for realistic data, but existing staff permissions are unchanged. Do not invent instructor/group authorization restrictions.
- Student assignments and other incomplete portal surfaces are not implemented by the generator.
