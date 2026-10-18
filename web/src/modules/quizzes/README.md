# Quizzes integration

Current staff implementation of EDRA-77. Intended behavior is in [product assessments](../../../docs/product/domains/assessments.md) (**Quizzes and exams**, **Marking and announcement**, **Corrections and history**); [OpenAPI](../../../docs/api/quizzes.openapi.yaml) describes the bearer reads and the not-yet-operational student contract.

## Schema and migrations

- `20261013210000_quizzes.sql`: quizzes, audience groups, parts (Question Sheet / Written Work), questions, choices with one correct choice, readiness issues, derived phase, preparation and availability commands.
- `20261013220000_quiz_work.sql`: per-student work aggregate, the single online attempt, saved answers, departures, physical drafts, the single accepted submission, private marks, immutable corrections and official result revisions, deduplicated result/solution effects, closure settlement, staff reads, the student domain and the year-close guard.
- `20261013230000_quiz_deadline_worker.sql`: Supabase Cron job `edra-quiz-deadlines` (every 30 seconds) running `edra_private.run_quiz_deadlines`.

Students never read quiz tables (RLS allows active academy staff only); the student projection is `edra_private.quiz_student_state`. Every write is a security definer command that rechecks live role, suspension, academy, open year, archive, locks, window and versions. Effects in `quiz_result_effects` have no consumer yet: recording one is not parent delivery, content release or playback authorization.

## Rules in force

- Preparation may be incomplete (no audience, no parts). Readiness is derived; availability is a separate Owner/Head Admin/Admin setting. Actual closure is the scheduled close plus two minutes; nothing reopens afterwards.
- Eligibility is live (current placement); the student list adds every historical participant. New physical answers, first physical acceptance, online starts, answer saves and explicit submission all require current eligibility, even when a draft exists; leaving the audience never discards drafts or already received work, and timer/window/departure settlement of saved work still happens. Target and timer lock when work begins (an attempt or physical entry); the structure locks on the first saved answer, physical answer or mark, and in any case when a submission is accepted (physical confirmation, explicit submission, timer, departure or window closure), before its result is computed. Model answers, title, instructions and solution notes stay editable.
- Online and physical drafts coexist. The first online final submission or physical confirmation is the single accepted submission; the other draft stays as history (`superseded_at` on the attempt). Physical confirmation stops at actual closure.
- Deadlines: timer when the original deadline is at or before actual closure, otherwise `window_closed`; second departure submits with `departure`. `submitted_at` is the effective time, `processed_at` the settlement time. Never-started students get nothing.
- Question Sheet questions score against the current key (unanswered = 0). Written Work needs a staff mark (blank = unmarked, zero = marked). Fully automatic online work is announced in its acceptance transaction; everything else by staff, per student or selected students, all-or-nothing per batch, against the expected scoring revision. Unchanged results create no revision or effect.
- Key corrections and exclusions (managers, after the structure locks) create a scoring revision, bump every accepted student's version, and leave official revisions untouched until announced. The last scored question cannot be excluded; nothing is reinstated.
- Solutions qualify for accepted online work at actual closure and for physical work at actual closure plus an announced result, in either order.

## Concurrency and deadlines

Lock order: academic year (share), quiz row (`for update` for quiz-wide commands: preparation, window, archive, corrections, closure settlement; `for key share` for per-student commands), the student's annual record (share, for the placement check), `quiz_work` rows in record order, attempt rows. The year comes first because a direct `academic_years.closed_at` update holds the year row before its trigger settles quizzes. Database time is read after the locks. Every command and the detail/student reads settle due work first, so correctness never waits for the worker. The paginated list is a read-only snapshot: it reports `processing_pending` and `closure_settled_at` instead of settling. Phase stays time-derived (a closed quiz is closed even before processing); late saves and confirmations return `finalized` / `source_conflict` outcomes rather than errors so the settlement commits.

Year closure (`academic_years.closed_at`) settles due quiz work in the same transaction and is refused with `quiz_work_pending` while an attempt is still running. Archive is refused for the same reason and never resets work.

Worker monitoring: `edra_private.quiz_deadline_runs` (one row per run with counts, failures and the largest cutoff-to-processing lag), `edra_private.quiz_deadline_health()` (last run, failures and lag in the last hour, oldest overdue attempt) and `cron.job_run_details`.

## Public services

`server.ts` exports the domain operations (`data.ts`) and the v1 builders (`v1.ts`); `actions.ts` exposes cookie web actions; `queries.ts` holds browser reads. Routes: `/app/quizzes`, `/app/quizzes/new`, `/app/quizzes/<id>`, `/app/quizzes/<id>/edit`, and the bearer reads `GET /api/v1/academies/{academyId}/quizzes`, `/api/v1/quizzes/{quizId}`, `/api/v1/quizzes/{quizId}/students`.

Exact decimal helpers live in `src/lib/score.ts` and academy-time helpers in `src/lib/academy-time.ts`, shared with assignments.

## Integration dependencies (not implemented here)

- **Student accounts:** `edra_private.quiz_caller_record` resolves the caller through `edra_private.student_caller_record` (EDRA-80): the account's connected, non-archived, not independently suspended annual record in the quiz's academy and open year. Unconnected or suspended callers fail with `student_link_unavailable`. Never replace it with a caller-supplied record id or phone match.
- **Content release:** quizzes have no content attachment yet and `edra_private.quiz_content_access` denies, so online access fails with `content_unavailable`. Physical work, marking and announcement do not depend on it.
- **EDRA-82:** the student answering UI, autosave/recovery and departure detection call the record-based trusted functions through those wrappers once both dependencies exist.
- **Evidence and solution assets:** written answers are text; file evidence uploads and private solution assets (with ownership, type, size and existence validation) are not implemented. Solution release currently covers the key, model answers and solution notes.
- **Effects consumers:** parent notifications, reports and playback grants read `quiz_result_effects` in their own modules.

## Verification

`supabase/tests/quizzes.sql` covers grants, authority (including suspended and cross-academy staff), preparation and locks, availability, attempts, departures, first-final-submission-wins, deadlines (timer, headroom, tie, window_closed, delayed worker), marks, announcement, corrections, exclusions, solution qualification, archive and year closure. `supabase/tests/concurrency.sh` scenarios 22–25 cover concurrent starts, physical-vs-online acceptance, correction-vs-announcement and worker-vs-late-save races. Pure helpers have Vitest coverage.
