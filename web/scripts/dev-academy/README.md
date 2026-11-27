# Dev academy scenario builder and cloud tooling

Pure, deterministic generator for the synthetic academy (20-student legacy recipes and the expanded 300-student recipe). `dry-run` makes no network, database or environment calls and needs no credentials. The cloud commands below are the only ones that touch a database.

## Commands (run from `web/`)

```bash
npm run dev:academy -- dry-run --reference-date 2026-10-21 --seed edra-20-v1 --students 20
npm run dev:academy -- dry-run --recipe edra-dev-v1   # the recipe of the existing development run
npm run dev:academy -- dry-run --out scripts/dev-academy/out/scenario.json   # optional local export (gitignored)
npm run test:dev-academy
```

Defaults: `--recipe edra-dev-v3`, `--reference-date 2026-10-21`, `--seed edra-20-v1`, `--students 20`. Unknown actions, options or recipes, `--students` other than 20 or 300, and `--out` outside `scripts/dev-academy/out/` exit with code 2. An invalid or insufficient reference date exits with code 1.

## Expanded statistics dataset

Use an explicit reference date near the intended testing date:

```bash
npm run dev:academy -- dry-run --recipe edra-dev-v4 --students 300 --reference-date 2026-11-27
```

`edra-dev-v4` supplies 300 linked students in 12 groups of 20, 25 and 30. Half start at the academic-year boundary; the rest have seeded enrollment waves through the reference week. Rosters, attendance items, assignment cohorts/recipients and historical exam results contain only students enrolled when that activity started. Recent joiners can have no history; no pre-enrollment absence, missing work or zero is invented.

History remains inside the current academic year. There are two sessions and one historical assignment per group per complete week, a historical paper exam every second week, and one current assignment per group with all five work states. Ability, attendance, submission habits and trajectories vary independently using repeated, shuffled profile templates and individual keyed variation. Programming content and varied assessment maxima use the committed bank. Online practice exams remain available for manual testing; no online attempts are seeded.

The summary includes enrollment months, group sizes, attendance states, work states and per-student histories. These are fixture diagnostics, not new product metric or weighting rules. Marks remain part-level for assignments and question-level for paper exams; assignment question-answer analytics are not populated.

For `create` and baseline `verify`, pass the same recipe, reference date and seed used for the dry-run. The registry scale migration must be applied before creation; preflight refuses missing migrations. Provisioning uses a 30-minute run lock for the larger account set. Existing runs are not expanded in place, deleted or reset. The original CLI defaults remain available for legacy workflows; v4 selects 300 students when `--students` is omitted. Legacy recipes require 20, v4 requires 300, and mismatches fail before provisioning.

## Answer-level statistics dataset

Use `edra-dev-v5` for the richer 300-student dataset:

```bash
npm run dev:academy -- dry-run --recipe edra-dev-v5 --reference-date 2026-11-27 --students 300
```

It retains v4's sizes, enrollment waves and dense history. Each assignment combines the existing written exercises with four authored multiple-choice questions from the course practice bank. Received, graded work has individual question answers/scores; part marks are derived from those answers with `from_answers = true`, so existing question analytics can include them. Current work also includes partial marking. Assignment written work stores per-question scores, not typed student text: the application's physical-assignment contract has no text-answer field.

Every second historical exam per group uses its course's online practice format instead of paper. The JavaScript version is fully automatic; the C++ version combines choices and two typed Written Work responses. Completed online attempts have their original start, timer deadline, saved draft answers and accepted submission answers. Some finish by timer, others by explicit submission. Choice answers include correct selections, multiple wrong distractors and blanks. Typed responses include complete solutions, authored partial/incorrect variants and blanks; manual marks include zero, partial and full credit, and genuinely unmarked answers stay null.

Mixed exams cover received/unmarked, partially marked, complete/private and announced results. Fully automatic online results are announced at acceptance, matching the domain contract. Only Written Work questions have staff exam marks. Question difficulty and stable student strengths by assignment unit or exam part affect the seeded scores, alongside ability and trajectory; this is fixture modeling, not a new topic taxonomy, analytics endpoint or reporting formula. Totals reconcile with question scores. No answers or attempts exist before enrollment, and open/upcoming practice exams remain untouched for manual testing. There are no fabricated attachments, live attempts, departures or quiz records.

The loader inserts the online draft then calls the existing acceptance helper to freeze it and apply automatic scoring/publication. Manual announcements and solution qualification use the existing helpers. All external effects remain suppressed. Read-only verification checks answer counts, derived marks, scoring consistency and frozen submission history. The disposable database CI job loads v3, v4 and v5 separately, checks the baseline and staff/student projections, then rolls each transaction back. This is prepared coverage; a local pure dry-run does not establish a passing database run.

Earlier recipes and their hashes remain unchanged. Explicitly select v5 for creation and pass the same recipe, seed and reference date for baseline verification. It requires the same 300-student registry migration as v4; no additional database schema change is introduced.

## Recipes

A recipe, seed and reference date fix the scenario byte for byte. Recipes never change once a run uses them; new behaviour gets a new recipe ID. Any other ID is refused.

- `edra-dev-v1`: four fixed patterns of five students (consistent, improving, temporary dip, irregular), each tying attendance, hand-ins and marks together. Run `be8db1dc-6eb2-48af-9c0b-c02d531f43ac` uses it.
- `edra-dev-v2`: each student has an independent ability tier (top, strong, middle, struggling), attendance habit (reliable, usual, patchy), submission habit (diligent, usual, careless) and trajectory (`pattern`: steady, improving, temporary-dip). Each seed covers the same 20 combinations, including top students with patchy attendance and struggling students who attend reliably. Marks follow the student's ability, trajectory and a slowly changing week-to-week form, in half points. A dip also lowers attendance and hand-ins for about two weeks. Historical paper exams are sat exactly by students present or late at that session. Current assignments keep the five deliberate states.
- `edra-dev-v3` (default for new runs): the students of `edra-dev-v2` with real programming assessments from the committed question bank (`bank/README.md`). Preparatory 3 groups follow JavaScript Basics and Secondary 2 groups C++ Fundamentals; each group's first assignment comes from Programming Foundations, then the course's units in order (variants are keyed draws). Assignments and paper exams have authored titles, instructions, parts and questions with varied maxima (10 to 100); they stay hand-marked written work with part or question marks only. The open exam (JavaScript, choice questions only) and the upcoming exam (C++, choice questions and typed answers) are playable in the student exam flow; no online answers are seeded. The academy subject is Programming. The dry-run reports marks as percentages of each assessment's maximum.

`create` and `verify` without `--recipe` use the recipe the run was registered with, so the documented commands for an existing run are unchanged; a new run uses the default. An explicit `--recipe` that differs from the registered run fails the scenario-hash check. Check the existing run with:

```bash
npm run dev:academy -- dry-run --recipe edra-dev-v1   # pure, shows the v1 scenario
npm run dev:academy -- verify --project fgbcjlibwgxylfwmocgx --run be8db1dc-6eb2-48af-9c0b-c02d531f43ac --mode integrity
```

The dry-run lists each student by logical key with their profile, attendance, hand-ins, exams sat and marks (average, early and late halves of the history, lowest) to judge realism. It prints no names or contacts.

## Cloud commands

`create`, `inspect` and `verify` act on one allow-listed project: development `fgbcjlibwgxylfwmocgx`. Any other ref is rejected.

```bash
npm run dev:academy -- create --project fgbcjlibwgxylfwmocgx --run <uuid> --developer <uuid> [--recipe ID] [--env FILE]
npm run dev:academy -- inspect --project fgbcjlibwgxylfwmocgx --run <uuid> [--env FILE]
npm run dev:academy -- verify --project fgbcjlibwgxylfwmocgx --run <uuid> --mode baseline|integrity [--recipe ID] [--env FILE]
```

- Run IDs and developer IDs are lowercase UUIDs. The delivery guard probe is required before account provisioning.
- Environment: `VITE_SUPABASE_URL` or legacy `NEXT_PUBLIC_SUPABASE_URL` (must match the project), `SUPABASE_SERVICE_ROLE_KEY`, `EDRA_DEV_ACADEMY_ENCRYPTION_KEY` (base64 32 bytes), `SEND_SMS_HOOK_SECRET`, and `SUPABASE_ACCESS_TOKEN` or `~/.supabase/access-token`. Values come from the process environment, overlaid by `--env` or `./.env.local` when present.
- SQL runs through the Management API query endpoint, because no direct database password or `psql` is provisioned.
- `create` registers the run, reserves contacts, provisions Auth accounts with random passwords, loads the records and marks the run `ready` after baseline verification. Re-running with the same run and inputs resumes only that run's pre-registered accounts. Ready runs are never re-created; use `inspect` or `verify` instead. Different inputs for an existing run are refused.
- A failed `create` records `error_stage` and `error_detail` and leaves Auth and registry state in place for inspection. Nothing is deleted automatically.
- `verify --mode baseline` checks the exact initial scenario counts. `--mode integrity` accepts later legitimate edits and checks references, official history, isolation and effect suppression. Both modes fail if the run was registered from different scenario inputs.
- `inspect` prints the run state, academy, error stage, ready time and counts. It never writes.
- Passwords, phone numbers, ciphertext, tokens and keys are never printed.

## Scenario schema (`schema: "edra-dev-scenario"`, `schemaVersion: 1`)

- `config`: `recipeVersion`, `seed`, `referenceDate`, `timezone`, `academicYear` (`startsOn`, `endsOn`, `startsAt`, `endsBefore` as UTC ISO), `teachingWeeks`, exam timer values.
- `academy`: `{id, key, name, subject?}` (`subject` from `edra-dev-v3`).
- `staff[]`: `{id, key, role, displayName, phone, synthetic, accountKey, placeholder}`. The real owner is `staff:real-owner` with `placeholder: true` and null contact and account fields. Every other person has `synthetic: true`.
- `students[]`: `{id, key, displayName, phone, synthetic, accountKey, pattern, profile?, parentPhone}`. `accountKey` is a logical link only. `profile` (`edra-dev-v2` and later) is `{tier, ability, attendance, submission}`; `ability` is the mid-year level in percent.
- `placements[]`: `{id, key, studentId, groupId, levelKey, track, mode: "in-person", enrolledAt}`.
- `groups[]`: `{id, key, name, levelKey, track}`. `schedules[]`: `{id, key, groupId, slots: [{weekday, startTime, durationMinutes}]}`.
- `sessions[]`: `{id, key, groupId, week, startsAt, endsAt, status: "ended", startedById}`.
- `roster[]`: `{id, key, sessionId, studentId}`.
- `attendancePublications[]`: `{id, key, sessionId, publishedAt, items: [{id, key, rosterId, studentId, status}]}`.
- `assignments[]`: `{id, key, kind: "historical"|"current", groupId, week, deliveryMode: "physical", assignedAt, dueAt, parts: [{id, key, title, maxScore}]}`. From `edra-dev-v3` an assignment also has `title`, `instructions`, `pack`, `unit`, `bankId`, and each part `kind: "file_upload"`, `instructions` and `questions: [{id, key, position, prompt, maxScore}]` summing to the part maximum.
- `assignmentResults[]`: `{id, key, assignmentId, studentId, state, receivedAt, late, gradedAt, announcedAt, gradedById, components: [{partId, score}] | null, total}`. States: `missing`, `received_unmarked`, `marked_private`, `announced`, `late_announced`.
- `exams[]`: `{id, key, kind: "historical"|"open"|"upcoming", format: "paper"|"mcq", groupIds, week, opensAt, scheduledClosesAt, closesAt, timerMinutes: 60, questions: [{id, key, position, maxScore, prompt?, choices?, correctChoice?}]}`. From `edra-dev-v3` an exam also has `title`, `instructions`, `solutionNotes`, `pack`, `bankId` and `parts: [{id, key, position, title, kind: "question_sheet"|"written_work", instructions}]`; each question has `partId` and `modelAnswer`, and only Question Sheet questions have choices. A current exam with a Written Work part has `format: "online"`.

## Timing rules

- `timerMinutes` (60) is the per-attempt limit. `opensAt` to `scheduledClosesAt` is the availability window, which must be at least 60 minutes. `closesAt` = `scheduledClosesAt` + 2 minutes.
- Historical paper exams open at the group's first session of the week and close 60 minutes later, inside the 90-minute session.
- Open preparatory exam: `(referenceDate - 1 day) 16:00` to `(referenceDate + 2 days) 16:00` Cairo. It is open throughout the reference date.
- Upcoming secondary exam: `(referenceDate + 3 days) 16:00` to `(referenceDate + 5 days) 16:00` Cairo.
- Assignments are due Thursday 23:59 Cairo of their week. Every recorded event is before the reference date (Cairo midnight), except the open and upcoming exam windows described above.
- The scenario JSON is fixed by recipe, seed and reference date. The dry-run prints `open exam:` and `upcoming exam:` status lines (`open`, `not yet open`, or `window expired at <closesAt>`) from the current clock, without changing the scenario.
- `examResults[]`: `{id, key, examId, studentId, state, receivedAt, gradedAt, announcedAt, gradedById, components, total}`. Only historical paper exams have results.

Every ID is a UUID derived from the logical `key`, so IDs do not depend on array position. Phones pass the `web/src/lib/phone.ts` rule and are synthetic. Consumers must not deliver messages to them.

## Reset (dry-run only)

```bash
npm run dev:academy -- reset --project fgbcjlibwgxylfwmocgx --run <uuid> --dry-run [--env FILE]
```

Read-only: one SELECT reports the run, its academy, the schema version, scoped and child tables with row counts, generated-user tables, masked accounts, foreign memberships and links, storage objects and active preview controls, then prints an impact hash. Exit 0 when nothing blocks a reset, 1 when refusals apply. Refusals cover an unregistered run, another project, a state other than `ready` or `failed`, no academy, any foreign or cross-academy data, storage objects, active preview controls and foreign key rows that could not be counted.

The impact hash excludes active controls, so ending a preview does not change the reviewed hash.

Execution is refused until a separately approved reset brief exists: `reset` without `--dry-run` exits with code 2 and makes no connection.

## Recipe edra-dev-v6: learning library

Seeds 280-320 students (the count is a keyed draw), 60 of them online-only: no group, no attendance, level-audience online assignments and online exams, loaded with question-level answers. Each level gets ten units (published, published with newer draft edits, in review, draft, archived) with a placeholder explanation video, and some carry an attached online assignment (those units go to online-only students). Access grants cover locked, active, expired, extended and revoked states; synthetic watch progress covers unopened, partial, nearly finished, finished and abandoned lessons. Placeholder videos use the permanent `content_assets.placeholder` flag, so no Mux asset is created. Watch progress is written to `edra_private.content_video_progress`, which the read-only reset dry-run does not list. Database loading is verified only by the disposable CI job.

`create` also accepts `--academy-name TEXT` and `--slug TEXT` (lowercase letters, digits and single hyphens, up to 50 characters; the database still rejects reserved or taken slugs). The defaults remain `Edra Dev Academy` and `edra-dev-<run prefix>`. The name does not change the scenario hash, so baseline verification needs no matching flag.
