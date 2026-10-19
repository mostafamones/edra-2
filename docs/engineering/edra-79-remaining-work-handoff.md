# EDRA-79 — remaining implementation handoff

Prepared 2026-10-18 after the initial iOS marking implementation and included in the subsequent owner-requested commit run. This is a handoff for unfinished work, not a claim of full EDRA-79 acceptance or authorization to deploy applications.

## Starting point and required reading

The `mobile-marking` implementation was initially prepared as uncommitted web/API, migration, native feature, test and documentation changes. The owner subsequently requested committing and pushing this delivery, including this handoff, after rebasing on `main`. Use the complete delivery commits when continuing in another checkout, and preserve any additional local work.

Read root `AGENTS.md`, `web/AGENTS.md`, `mobile/AGENTS.md`, `docs/engineering/application-boundaries.md`, `web/docs/engineering.md`, `mobile/docs/engineering.md`, `mobile/README.md`, `mobile/docs/api.md`, `web/docs/api/README.md`, `web/docs/api/assignments.openapi.yaml` and `web/src/modules/assignments/README.md`. Do not read root `plans.md`.

Assigned final product sections in `web/docs/product/domains/assessments.md`: Required work and late eligibility; Physical and online assignment work; Assignment parts and scoring; Locked structure and question exclusions; Work and submission; Marking and announcement; Corrections and history; Staff permissions. For native behavior, read Physical marking and Assignment marking interaction — EDRA-79 in `mobile/docs/product/workflows.md`, and Physical assignment marking and Scope boundaries in `mobile/docs/product/goals.md`. Quiz/exam-specific requirements do not silently extend assignment scope.

The original `docs/engineering/edra-79-implementation-plan.md` was available in the main checkout at handoff time but is absent from this worktree. This handoff records the remaining requirements without requiring access to that separate checkout.

## What already exists in source

- Bearer assignment reads expose question answers, assignment action flags and student-code capability. Marks PATCH accepts question answers, explicit Blank, Clear, Written Work scores, part totals and feedback. Publication has a separate idempotent, atomic selected-student endpoint.
- Marks search runs across the recipient cohort before pagination, using literal name fragments or normalized code prefixes. Existing marks filters remain available.
- `mobile/EdraInstructor/Features/Assignments/` contains the assignment list, workspace, marking sheet/model, API DTOs/service and code/camera flow. The shell replaces its Assessments placeholder and guards academy switching with dirty work.
- Native private-save retry/conflict handling, individual/batch announcement, five-question pages, By question/Fast mark and Written Work toolbar are present in source. They still require Xcode and runtime verification.

The current recipient snapshot behavior is explicitly an implementation gap. The approved rules below remain authoritative; do not redefine them to match the existing database. Assignment-wide action flags are not a substitute for per-student eligibility, work-source or scoring authority.

## 1. Establish required students and optional late eligibility

Owner: trusted assignment domain/database, with API/native projection updates.

Current evidence: `web/supabase/migrations/20261009100000_assignment_standalone_lifecycle.sql`, especially `edra_private.snapshot_assignment_recipients`, `create_assignment` and `update_assignment`, refreshes recipients on pre-activity saves and freezes them after activity. The module README documents this difference from the approved first-save cohort.

Implement a durable initial required cohort when the first valid target audience is saved. Incomplete preparation without a valid audience does not establish it. Later matching students are automatically eligible but optional; staff must not have to add them manually. Optional noncompletion must not appear as missing or overdue. Keep requiredness distinct from current eligibility and content access.

Use one authoritative eligibility rule for marks lists/search, manual selection, exact code lookup, code-bound saves, work recording and announcement. Recheck authority and eligibility in the mutation transaction. Preserve target locking after activity and existing assignment/year lock order.

Before migrating existing assignments, inspect available historical evidence. Do not guess a historical first-save cohort from today's membership or erase prior work. If original requiredness cannot be recovered, present that specific backfill decision to the owner before converting historical records. This is the remaining data decision, not an invitation to reopen the approved new-assignment behavior.

Acceptance: first valid save fixes requiredness; a later matching joiner can be found and marked through manual/code paths without becoming required; unrelated and cross-academy records are rejected; filtered totals include all eligible matches before paging; optional noncompletion is absent from missing/overdue counts.

## 2. End unfinished requirements after placement changes

Owner: student placement public service plus assignment domain/database. Build on the requiredness/eligibility model above.

Authorized moves out of a targeted group or track end the student's unfinished-work requirement. Preserve answers, marks, physical history and announced results. Continued submission still requires current audience/content access; ending a requirement must not itself grant access. Students cannot change their own academy track.

Inspect `web/src/modules/students/` public placement operations and the authoritative `update_student_record` / `set_student_records_group` paths. Cover single changes, bulk group moves and other actual placement entry points rather than patching one screen. Track-removal behavior is separately specified: active assignments become level-wide, closed assignments retain their identity. Preserve that distinction.

Make placement effects and assignment mutations consistent under concurrent operations. Publish/source/version checks must not allow a stale preview to bypass the changed eligibility. Preserve historical rows instead of deleting recipients to make a list look current.

Acceptance: moving a student out ends unfinished required work; saved and official history survives; unrelated assignments stay unchanged; stale marks/work/publication attempts receive a deliberate conflict or eligibility rejection; unauthorized and cross-academy moves fail.

## 3. Integrate online/physical work source authority

Owner: assignment work/submission backend, coordinated with authoritative student identity and content integrations. Student screens, content release UI and delivery remain outside this handoff.

Inspect current student identity/enrollment support before declaring it missing: repository enrollment migrations exist, but that alone does not prove an assignment submission integration. Establish the exact assignment-specific missing service/contract and implement trusted state plus fixtures independently of a student UI.

- Opening an assignment does not claim a work source. Saving an online answer draft does: it blocks a separate staff physical submission, while the online draft remains unsubmitted.
- If an online draft follows unannounced physical draft answers/marks, preserve the physical draft as history and make online work active. Never blend inactive physical answers/marks into an online result.
- Explicit online final submission records received work, once per student. Draft saving does not expose results. In-person online submissions are disabled by default unless the academy enables them; participation type remains in-person.
- Closed blocks new online final submission and new physical work, including finalizing an earlier online draft. Preserve the draft for reopening. Already received work remains markable and announceable. Archived assignments and closed years remain read-only.
- Announced results lock online answering/submission. Private physical saves alone do not. Fully automatically marked accepted online work announces automatically; work requiring manual review stays private until complete announcement.

Expose server-owned student source/lock state and actionable restrictions in marks, lookup, save and conflict projections. Define and document the actual field/error names in OpenAPI before native consumption; this handoff does not invent already-existing fields. Make source revisions participate in conflict detection or equivalent transactional rejection. Retry an uncertain mutation with the original key/payload before permitting a different operation.

Acceptance: opening versus draft saving differs; online takeover retains physical history; source races reject stale physical saves; closure/reopening preserves draft semantics; received online work supports staff review; announcement locks the student flow; identity/content denial cannot be bypassed with a supplied annual-record UUID. Native UI consumes authority without duplicating source rules.

## 4. Add controlled assignment key corrections and exclusions

Owner: assignment scoring backend and web management workflow; mobile consumes effective scoring and restrictions. Do not add native correction/exclusion management UI.

Current assignment answer storage/scoring is in `20261007170000_assignment_question_answers.sql`; lifecycle structure guards are in `20261009100000_assignment_standalone_lifecycle.sql`. Inspect the quiz/exam implementation for reusable patterns through deliberate public contracts, without importing another module's internal services or applying quiz-only rules to assignments.

After work begins, only Owner/Head Admin/Admin may correct a shared answer key or exclude a question. Instructors retain ordinary marking/announcement, including complete recalculated corrections. Ordinary editing cannot change locked question text, choices, identities, numbering, part types or structure.

Key corrections recalculate stored answers privately. Exclusions preserve question identity/position, answers and recorded marks, contribute no effective score or maximum, and require no mark for completeness. Student answering skips excluded questions without renumbering. Staff marking displays them as excluded. Prior official scores, maxima and scoring basis remain official until explicit correction announcement; recalculation must not announce automatically.

Keep fast/excused totals and question-derived scores as alternative representations. Inspect existing totals before changing maxima; do not invent proportional rescaling or silently discard historic marks where the approved rules do not define it. Escalate any concrete unresolved historical-total case with evidence and a proposed treatment.

Include transactional scoring revision checks, idempotent retries, exact decimal recalculation, permissions and version propagation to all reads/conflicts. Selected correction announcement remains all-or-nothing; unchanged announcement creates no duplicate event. Preserve existing result snapshots/outbox semantics; an event is not delivered parent communication or solution access.

Acceptance: manager correction/exclusion succeeds and instructor correction fails; stored answers remain intact; numbering is stable; effective maxima/completeness ignore exclusions; old official snapshots remain unchanged until announcement; stale scoring saves/announcements are rejected; replay is safe. Update both web and native projections so stale scoring cannot silently overwrite current work.

## Verification and completion sequence

Implement requiredness and placement handling first, then source integration and controlled scoring. Make each shared backend change with additive/corrective migrations, appropriate RLS/grants/constraints and regenerated database types. Update services, OpenAPI, native DTOs and module integration notes together. Do not rewrite migrations already committed or applied to either cloud target.

Run web lint, typecheck, relevant contract/domain tests and build. Exercise tenant isolation, suspended membership, archived/closed-year restrictions, concurrent placement/source/scoring changes, stale versions, stable retry receipts and atomic publication. Run assignment SQL suites and relevant concurrency checks only on marked isolated `edra-ci`, never on shared `edra-1`; do not start a local Supabase stack or reset cloud data.

On macOS with Xcode, compile the app and run `AssignmentMarkingTests.swift` plus applicable auth/academy tests. Fix compile failures before claiming native delivery. Verify manual/code/camera selection, Blank/Clear/zero, exact decimals, fast/question replacement confirmation, uncertain retry, conflict review, batch rejection, foreground reconciliation, dirty-work academy switching, membership loss, Dynamic Type, VoiceOver and keyboard handling. Simulator build, simulator runtime, physical-camera evidence and signed distribution are separate evidence. Test an authenticated deployed API round trip after an authorized web deployment.

The owner-requested commit run on 2026-10-18 reran web lint (15 existing warnings in unchanged files, zero errors), typecheck, production build and all 492 unit tests across 87 test files; all passed. Both new Tabler SVGs match the installed upstream assets and their catalog JSON/XML parses. Xcode build/tests, device checks and deployed API round trips remain unverified because Xcode/Swift and iOS runtimes are unavailable here. `psql` is absent, so the multi-session concurrency harness remains unrun.

Full acceptance remains open until the missing invariants and native verification above pass. Keep application deployment, signing and distribution separate from schema application. The subsequent owner-requested commit/push makes the source available for local testing; it does not establish full acceptance.

## Cloud migration receipt — 2026-10-18

Scope: the sole new EDRA-79 migration in this worktree, `web/supabase/migrations/20261018160000_assignment_marks_search.sql`. Other shared-project migration receipts outside this branch were left alone.

- Shared `edra-1` (`fgbcjlibwgxylfwmocgx`): applied the exact file through Supabase `apply_migration`, name `assignment_marks_search`. The MCP recorded version **20261018110415**. Verified one six-argument function with default-null `p_search`, authenticated execution, no anonymous execution, empty search path and unauthenticated rejection. The replaced five-argument overload is absent; calls omitting search remain supported through defaults. No application data was migrated.
- Isolated `edra-ci` (`msnjxvnblgkdeigctbhk`): this migration was already recorded as **20261018160000**; it was not reapplied. Confirmed the test marker, no matching auth fixture collisions and no active `edra-db-test` sessions before serially running `assignment_marks.sql` and `assignments.sql` through the cloud SQL tool. Both returned their success assertions and rolled back fixtures. This includes literal name/code-prefix search, pagination/filter checks, marks authority and publication behavior.
- Migration history caveat: the MCP-generated shared-project receipt differs from the repository/CI timestamp for the same migration. Both are documented here; no applied history or migration filename was rewritten. The deployed function definitions match across both projects (MD5 `7a37dd01a22673ac09d51c5756f8cd55`), and the final fixture check found no retained test auth users. Compare names, SQL and receipts before future CLI reconciliation; do not blindly replay this file or use a reset to reconcile version numbers. This is not a claim that version-based migration histories are identical.
- Ran the shared-project security advisors. They flag authenticated callable SECURITY DEFINER functions (including this deliberately authenticated RPC), an anonymous-callable `is_assignment_image_staff` function, policy-less RLS tables and disabled leaked-password protection. This migration changes no tables or Auth settings; these notices were not treated as a clean security audit or changed in this follow-up.

The web application has not been deployed by this follow-up. The new bearer route and native app remain source changes until their respective deployments/builds are verified.
