# Exams integration

Current staff implementation of EDRA-78. Intended behavior is in [product assessments](../../../docs/product/domains/assessments.md) (**Quizzes and exams**, **Marking and announcement**, **Corrections and history**, **Exam staff delivery boundary — EDRA-78**); [OpenAPI](../../../docs/api/exams.openapi.yaml) describes the bearer reads and the not-yet-operational student contract (EDRA-83 handoff).

Exams are their own domain. They follow the final quiz rules (including the 20261014 quiz refinements) but share no rows, functions or history with quizzes, and nothing here imports quiz internals.

## Schema and migrations

- `20261014120811_exams.sql`: exams, audience groups, parts (Question Sheet / Written Work), questions, choices with one correct choice, readiness issues (including `timer`), derived phase, preparation and availability commands, exam quota buckets.
- `20261014120814_exam_work.sql`: per-student work aggregate, the single online attempt, saved answers, question-aware departures, physical drafts, the single accepted submission, private marks, immutable corrections and official result revisions, deduplicated result/solution effects, closure settlement, staff reads, the student domain and the year-close guard (`academic_years_settle_exams`).
- `20261014120817_exam_deadline_worker.sql`: Supabase Cron job `edra-exam-deadlines` (every 30 seconds) running `edra_private.run_exam_deadlines`.

Students never read exam tables (RLS allows active academy staff only; departures, answers, marks, effects and request replays have no client grant). The student projection is `edra_private.exam_student_state`, built field by field. Every write is a security definer command that rechecks live role, suspension, academy, open year, archive, locks, window and versions. Effects in `exam_result_effects` have no consumer yet: recording one is not parent delivery, content release or video playback.

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

Exact decimal helpers live in `src/lib/score.ts` and academy-time helpers in `src/lib/academy-time.ts`.

## Integration dependencies (not implemented here)

- **Student accounts:** `edra_private.exam_caller_record` resolves the caller through `edra_private.student_caller_record` (EDRA-80): the account's connected, non-archived, not independently suspended annual record in the exam's academy and open year. Unconnected or suspended callers fail with `student_link_unavailable`. Never replace it with a caller-supplied record id or phone match. Standalone exams are therefore reachable by connected students through the trusted wrappers; the student exam UI (EDRA-83) is still not built.
- **Content release:** exams have no content attachment column yet, so every exam is standalone and `edra_private.exam_content_access` needs no release (identity, audience, window and timer rules still apply). When content releases exist, the attachment (at most one, same academy/year release covering the whole audience, locked once work begins, never first attached after work) and its authorization belong to that integration.
- **EDRA-83:** the student exam screens, autosave/recovery, departure signal detection and deduplication, and fullscreen/unsupported-platform behavior call the trusted functions through those wrappers. No student HTTP route exists.
- **Media (deferred by the owner):** written answers are text and physical written work is marked by hand. Document/photo evidence, answer-document assets, file storage and solution videos are not implemented; solution release covers the key, model answers and solution notes.
- **Effects consumers:** parent notifications, reports and playback grants read `exam_result_effects` in their own modules.

## Verification

`supabase/tests/exams.sql` covers grants, authority (including suspended and cross-academy staff), the mandatory timer, preparation and locks, availability, attempts and recovery, departures (warnings, next question, excluded skip, duplicates, kick, deadline precedence), first-final-submission-wins, physical entry before any window, deadlines (timer, headroom, tie, empty attempt, window_closed, delayed worker), marks, announcement, corrections, exclusions, solution qualification, live eligibility, archive and year closure. `supabase/tests/concurrency.sh` scenarios 26–33 cover concurrent starts, physical-vs-online acceptance in both orders, correction-vs-announcement, placement move vs confirmation, worker vs late departure, preparation vs first confirmation and year closure vs worker/staff commands. Pure helpers have Vitest coverage.
