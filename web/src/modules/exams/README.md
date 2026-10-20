# Exams integration

Current staff implementation of EDRA-78. Intended behavior is in [product assessments](../../../docs/product/domains/assessments.md) (**Quizzes and exams**, **Marking and announcement**, **Corrections and history**, **Exam staff delivery boundary — EDRA-78**); [OpenAPI](../../../docs/api/exams.openapi.yaml) describes the bearer reads and the not-yet-operational student contract (EDRA-83 handoff).

Exams are their own domain. They follow the final quiz rules (including the 20261014 quiz refinements) but share no rows, functions or history with quizzes, and nothing here imports quiz internals.

## Schema and migrations

- `20261014120811_exams.sql`: exams, audience groups, parts (Question Sheet / Written Work), questions, choices with one correct choice, readiness issues (including `timer`), derived phase, preparation and availability commands, exam quota buckets.
- `20261014120814_exam_work.sql`: per-student work aggregate, the single online attempt, saved answers, question-aware departures, physical drafts, the single accepted submission, private marks, immutable corrections and official result revisions, deduplicated result/solution effects, closure settlement, staff reads, the student domain and the year-close guard (`academic_years_settle_exams`).
- `20261014120817_exam_deadline_worker.sql`: Supabase Cron job `edra-exam-deadlines` (every 30 seconds) running `edra_private.run_exam_deadlines`.

Students never read exam tables (RLS allows active academy staff only; departures, answers, marks, effects and request replays have no client grant). The student projection is `edra_private.exam_student_state`, built field by field; the student overview is `edra_private.my_exam_overview_json` (EDRA-232). Every write is a security definer command that rechecks live role, suspension, academy, open year, archive, locks, window and versions. Effects in `exam_result_effects` have no consumer yet: recording one is not parent delivery, content release or video playback.

## Rules in force

- Preparation may be incomplete (no audience, timer or parts). Readiness is derived and requires the individual timer: there is no untimed online exam. Availability is a separate Owner/Head Admin/Admin setting. Actual closure is the scheduled close plus two minutes; nothing reopens afterwards, and once work exists the close only moves later.
- Eligibility is live (current placement); the student list adds every historical participant. New physical answers, physical confirmation, online starts, answer saves and explicit submission require current eligibility; leaving the audience keeps drafts and received work, and timer/window/departure settlement of saved work still happens. Target and timer lock when work begins; the structure locks on the first saved answer, departure, physical answer or mark, and at any accepted submission. Model answers, title, instructions and solution notes stay editable.
- Physical drafts and confirmation work once the exam is ready, before opening or without any window, and stop at actual closure.
- Online and physical drafts coexist. The first online final submission or physical confirmation is the single accepted submission; the other draft stays as history.
- Deadlines: `deadline_at = started_at + timer`, never reset. Timer when the deadline is at or before actual closure (a tie included), otherwise `window_closed`. `submitted_at` is the effective time, `processed_at` the settlement time. Never-started students get nothing.
- Departures (`record_exam_departure_for(exam, record, event_id, question_id)`): stored once per event with the question, its original number, ordinal and outcome. First and second warn and return the next non-excluded question (null after the last); the third submits the saved answers as `kicked`. A repeated event returns its original departure (`duplicate`); the same event id for another question is `idempotency_conflict`. A due deadline is settled first and wins. Kicked is graded normally.
- Scoring, announcement, corrections, exclusions and solution qualification match quizzes: automatic online work (including timer, kicked and window_closed) is announced in its acceptance transaction; everything else by staff, all-or-nothing per batch, against the expected scoring revision. Online solutions qualify at actual closure; physical at closure plus an announced result, in either order.

## Concurrency and deadlines

Lock order for every entry point: academic year (share), exam row (`for update` for exam-wide commands: preparation, window, archive, corrections, closure settlement; `for key share` for per-student commands), the student's annual record (share, for the placement check), `exam_work` rows in record order, attempt rows. The year comes first because a direct `academic_years.closed_at` update holds the year row before its trigger settles exams. Database time is read after the locks. Every command and the detail/student reads settle due work first; the paginated list is a read-only snapshot reporting `processing_pending` and `closure_settled_at`. Late saves, confirmations and departures return `finalized` / `source_conflict` outcomes rather than errors so the settlement commits.

Year closure settles due exam work in the same transaction and is refused with `exam_work_pending` while an attempt is still running. Archive is refused for the same reason and never resets work.

Worker monitoring: `edra_private.exam_deadline_runs` (counts, failures, largest cutoff-to-processing lag), `edra_private.exam_deadline_health()` and `cron.job_run_details` for `edra-exam-deadlines`.

## Public services

`server.ts` exports the domain operations (`data.ts`) and the v1 builders (`v1.ts`); `actions.ts` exposes cookie web actions; `queries.ts` holds browser reads. Routes: `/app/exams`, `/app/exams/new`, `/app/exams/<id>`, `/app/exams/<id>/edit`, and the bearer reads `GET /api/v1/academies/{academyId}/exams`, `/api/v1/exams/{examId}`, `/api/v1/exams/{examId}/students`. Staff commands are web actions only.

Student code lives in `student/` (cookie web boundary only; no bearer API): `server.ts` exports `listMyExams`, `getMyExamOverview`, `startMyExam` and the `StudentExamList` / `StudentExamOverviewPage` server components; `index.ts` exports the `startStudentExam` server action, the route loading/error states, the entry integration types and the student DTO types. Student routes are `/<slug>/exams` and `/<slug>/exams/<examId>` on the student host.

Exact decimal helpers live in `src/lib/score.ts` and academy-time helpers in `src/lib/academy-time.ts`.

## Integration dependencies (not implemented here)

- **Student accounts:** `edra_private.exam_caller_record` resolves the caller through `edra_private.student_caller_record` (EDRA-80): the account's connected, non-archived, not independently suspended annual record in the exam's academy and open year, from an ordinary (not recovery/revoked) session. Unconnected or suspended callers fail with `student_link_unavailable`. Never replace it with a caller-supplied record id or phone match.
- **Content attachment:** attachments live in `public.content_assessments` (`kind = 'exam'`). Since EDRA-232, `edra_private.exam_content_access` denies attached exams on every student entry path (`content_unavailable`) and discovery excludes them; standalone exams need no release. Authorizing attached exams against their release belongs to the content integration.
- **EDRA-83 remaining slices:** EDRA-233 (answering, editor ownership, recovery, pending answers, submission UI, question images), EDRA-234 (fullscreen capability/acquisition and departure detection) and EDRA-235 (post-qualification review and solutions) call the trusted functions. No student HTTP route exists.
- **Media (deferred by the owner):** written answers are text and physical written work is marked by hand. Document/photo evidence, answer-document assets, file storage and solution videos are not implemented; solution release covers the key, model answers and solution notes.
- **Effects consumers:** parent notifications, reports and playback grants read `exam_result_effects` in their own modules.

## Student discovery, overview and entry — EDRA-232

Migration `20261020000456_student_exam_entry.sql`:

- `list_my_exams(academy, limit, offset)` and `get_my_exam_overview(academy, exam)` resolve the caller's record of the academy's open year in the database (`edra_private.my_exam_record`); the academy id only locates. Discoverable (`edra_private.my_exam_discoverable`): own participation (attempt, accepted submission or entered physical answers; an empty work row is not participation) or an unarchived ready exam that is scheduled or open and matches the current audience. Attached exams are excluded. Headroom never offers a fresh start. Wrong academy, other year or undiscoverable exams are `not_found`. The list is a read-only snapshot; the overview settles due work after authorization and returns normally so the settlement commits.
- `action` (`edra_private.my_exam_action`): `start`, `resume`, `submitted`, `not_yet_open`, `no_new_starts`, `ineligible`, `unavailable`. A moved student keeps their history (`ineligible` for an unfinished attempt) but cannot start or save.
- `start_my_exam(academy, exam)` (and the unscoped `start_exam_attempt`) run `edra_private.start_my_exam_for`: settle due work, lock the year (share) and the exam row (for update, so a concurrent content attachment — which holds the exam for share — serializes with the standalone check), deny attached exams, then call `start_exam_attempt_for`. Retries and concurrent calls return the one attempt with its original deadline.
- `exam_student_state` is tightened (owner decision, Student web exam flow): parts, excluded ids, saved answers and departure details only during the active own attempt or after solution qualification; results are total-only (`edra_private.exam_official_result_json`: total, max, first publication, corrected and correction date). Quizzes are unchanged.

Web: `startStudentExam` returns the acknowledged attempt only (no question material). The overview's `StudentExamEntry` requests fullscreen from the click before calling it, and hands the attempt to `examEntryIntegration` (`student/integration.ts`). That integration is `null` on this branch, so Start/Resume renders disabled: real students cannot start a timer until EDRA-233 (`Answering`, editor ownership) and EDRA-234 (`fullscreenSupported`, `enterFullscreen`, `exitFullscreen`, departures) register it. Finalized-work review beyond status and the official total is EDRA-235.

## Verification

`supabase/tests/exams.sql` covers grants, authority (including suspended and cross-academy staff), the mandatory timer, preparation and locks, availability, attempts and recovery, departures (warnings, next question, excluded skip, duplicates, kick, deadline precedence), first-final-submission-wins, physical entry before any window, deadlines (timer, headroom, tie, empty attempt, window_closed, delayed worker), marks, announcement, corrections, exclusions, solution qualification, live eligibility, archive and year closure. `supabase/tests/concurrency.sh` scenarios 26–33 cover concurrent starts, physical-vs-online acceptance in both orders, correction-vs-announcement, placement move vs confirmation, worker vs late departure, preparation vs first confirmation and year closure vs worker/staff commands. Pure helpers have Vitest coverage. `supabase/tests/student_exams.sql` covers the EDRA-232 discovery, overview, start and projection rules; `student/data.test.ts` covers the web boundary allowlist and error mapping.

## Task 4 question exposure — R01, 2026-10-19

The private `exam_student_state` projection returns `parts: []` and `excluded_question_ids: []` until that record has genuinely started its own single online attempt or `exam_solutions_available` qualifies it. Physical draft/confirmed/announced work alone before actual closure does not reveal questions. The same predicate drives solution qualification and question release: accepted online work at actual closure; physical work only at actual closure plus announcement. Reads never start/reset an attempt, extend its deadline or create a retake. Keys/model answers remain in `solutions` only; private marks stay absent. Inline image references follow the question gate; Storage signing/reading remains staff-only in the current image integration. EDRA-232 narrows this gate: once the attempt is finalized (or superseded) and before qualification, material, saved answers and departure details are hidden again.

Connected ownership uses the shared ordinary-session student resolver. `assessment_exposure.sql` checks field-by-field leaks, own versus unrelated attempts, physical ordering, closure/announcement, storage denial and actual public standalone-exam wrappers. Quiz public wrappers still require the unavailable content integration; tests exercise the authorized internal projection without weakening it. No student answering UI or media product is added. CI tests establish isolated-schema behavior, not hosted deployment.
