# Dev academy scenario builder and cloud tooling

Pure, deterministic generator for the synthetic 20-student academy. `dry-run` makes no network, database or environment calls and needs no credentials. The cloud commands below are the only ones that touch a database.

## Commands (run from `web/`)

```bash
npm run dev:academy -- dry-run --reference-date 2026-10-21 --seed edra-20-v1 --students 20
npm run dev:academy -- dry-run --out scripts/dev-academy/out/scenario.json   # optional local export (gitignored)
npm run test:dev-academy
```

Defaults: `--reference-date 2026-10-21`, `--seed edra-20-v1`, `--students 20`. Unknown actions or options, `--students` other than 20, and `--out` outside `scripts/dev-academy/out/` exit with code 2. An invalid or insufficient reference date exits with code 1.

## Cloud commands

`create`, `inspect` and `verify` act on one allow-listed project: development `fgbcjlibwgxylfwmocgx` or isolated-test `msnjxvnblgkdeigctbhk`. Any other ref is rejected.

```bash
npm run dev:academy -- create --project fgbcjlibwgxylfwmocgx --run <uuid> --developer <uuid> [--env FILE] [--skip-delivery-probe]
npm run dev:academy -- inspect --project fgbcjlibwgxylfwmocgx --run <uuid> [--env FILE]
npm run dev:academy -- verify --project fgbcjlibwgxylfwmocgx --run <uuid> --mode baseline|integrity [--env FILE]
```

- Run IDs and developer IDs are lowercase UUIDs. `--skip-delivery-probe` is accepted only on the isolated-test project.
- Environment: `NEXT_PUBLIC_SUPABASE_URL` (must match the project), `SUPABASE_SERVICE_ROLE_KEY`, `EDRA_DEV_ACADEMY_ENCRYPTION_KEY` (base64 32 bytes), `SEND_SMS_HOOK_SECRET`, and `SUPABASE_ACCESS_TOKEN` or `~/.supabase/access-token`. Values come from the process environment, overlaid by `--env` or `./.env.local` when present.
- SQL runs through the Management API query endpoint, because no direct database password or `psql` is provisioned.
- `create` registers the run, reserves contacts, provisions Auth accounts with random passwords, loads the records and marks the run `ready` after baseline verification. Re-running with the same run and inputs resumes only that run's pre-registered accounts. Ready runs are never re-created; use `inspect` or `verify` instead. Different inputs for an existing run are refused.
- A failed `create` records `error_stage` and `error_detail` and leaves Auth and registry state in place for inspection. Nothing is deleted automatically.
- `verify --mode baseline` checks the exact initial scenario counts. `--mode integrity` accepts later legitimate edits and checks references, official history, isolation and effect suppression. Both modes fail if the run was registered from different scenario inputs.
- `inspect` prints the run state, academy, error stage, ready time and counts. It never writes.
- Passwords, phone numbers, ciphertext, tokens and keys are never printed.

## Scenario schema (`schema: "edra-dev-scenario"`, `schemaVersion: 1`)

- `config`: `recipeVersion`, `seed`, `referenceDate`, `timezone`, `academicYear` (`startsOn`, `endsOn`, `startsAt`, `endsBefore` as UTC ISO), `teachingWeeks`, exam timer values.
- `academy`: `{id, key, name}`.
- `staff[]`: `{id, key, role, displayName, phone, synthetic, accountKey, placeholder}`. The real owner is `staff:real-owner` with `placeholder: true` and null contact and account fields. Every other person has `synthetic: true`.
- `students[]`: `{id, key, displayName, phone, parentPhone, synthetic, accountKey, pattern}`. `accountKey` is a logical link only.
- `placements[]`: `{id, key, studentId, groupId, levelKey, track, mode: "in-person", enrolledAt}`.
- `groups[]`: `{id, key, name, levelKey, track}`. `schedules[]`: `{id, key, groupId, slots: [{weekday, startTime, durationMinutes}]}`.
- `sessions[]`: `{id, key, groupId, week, startsAt, endsAt, status: "ended", startedById}`.
- `roster[]`: `{id, key, sessionId, studentId}`.
- `attendancePublications[]`: `{id, key, sessionId, publishedAt, items: [{id, key, rosterId, studentId, status}]}`.
- `assignments[]`: `{id, key, kind: "historical"|"current", groupId, week, deliveryMode: "physical", assignedAt, dueAt, parts: [{id, key, title, maxScore}]}`.
- `assignmentResults[]`: `{id, key, assignmentId, studentId, state, receivedAt, late, gradedAt, announcedAt, gradedById, components: [{partId, score}] | null, total}`. States: `missing`, `received_unmarked`, `marked_private`, `announced`, `late_announced`.
- `exams[]`: `{id, key, kind: "historical"|"open"|"upcoming", format: "paper"|"mcq", groupIds, week, opensAt, scheduledClosesAt, closesAt, timerMinutes: 60, questions: [{id, key, position, maxScore, prompt?, choices?, correctChoice?}]}`.

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
