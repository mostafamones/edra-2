# Assignments module contract

Staff assignments: ordered marked parts, an audience, an advisory due date, a lifecycle with a published recipient snapshot, recorded work, part marks with fast code entry, and per-student result publication. Plan: `planning/assignments/implementation.md`. Schema: `supabase/migrations/20261007100000_assignments.sql` (structure) and `20261007110000_assignment_marks_results.sql` (work, marks, results, outbox). SQL assertions: `supabase/tests/assignments.sql`, `supabase/tests/assignment_marks.sql`. API: `docs/api/assignments.openapi.yaml`; handoff: `planning/assignments/api-handoff.md`.

**Staff side only.** Student submissions (online essays), student endpoints, and Storage attachments are not built: there is no student account ↔ annual-record link or suspension state yet. Multiple-choice submissions arrive with the student side. Quizzes and exams are separate plans; nothing here is a generic assessment framework.

## Rules

- An assignment belongs to one academy and one academic year. Audience is exactly one of: an entire level, a level and track (`program`), or selected groups of that year (`groups`).
- There is no submission mode: one assignment accepts physical work (recorded by staff) and, later, online essays on the same recipient row.
- One or more ordered parts. A part has a submission type and a marking scheme (marks per question, not a rubric): see "Typed parts" below. A legacy part's maximum is an exact decimal string (`"10"`, `"12.5"`), above 0 and at most 1000, with at most two fractional digits; unsupported precision is rejected, never rounded. The assignment maximum and part count are maintained from the parts by a database trigger, never sent by the caller. Totals are added in integer hundredths (`score.ts`).
- The due date is advisory and shown in Cairo time (`due.ts`). Nothing rejects, closes, or marks work because it passed.
- Part ids are permanent. Draft edits keep existing ids (sent back with each part), delete omitted parts, and create parts sent without an id. A part id from another assignment is rejected.

## Typed parts and the marking scheme (migration `20261007120000_assignment_questions.sql`)

- Types: `online_questions` (question text and choices authored in Edra), `answer_sheet` (numbered entries and choice letters, questions are on paper), `file_upload` (numbered entries with marks, no choices). Different parts of one assignment can use different types. The part title is separate from the type.
- Each question/entry has a stable id, a 1-based display number, a positive exact-decimal maximum (≤ 1000, two decimals) and, for multiple choice, 2–10 choices with exactly one correct choice (letters A–J derive from position). At most 100 questions per part; a part totals at most 10 000 marks (raised from the legacy 1000 cap because a part is now a sum). Part maximum = sum of its questions and assignment maximum = sum of its parts, both maintained by triggers.
- Drafts may be incomplete: a typed part may have no questions (maximum 0). Publishing requires every part complete (`part_issues`: `questions`, `choices`, `correct_choice`, `prompt`, `choice_text`, `maximum`), otherwise `incomplete`. The form's review step mirrors this in `readiness.ts`.
- All steps save through one atomic draft command (`create_assignment` / `update_assignment`); question and choice rows are written in the same transaction as the parts. Triggers lock questions, choices and part types once the assignment is published or has activity (`structure_locked`).
- **Legacy parts** (`kind` null) keep their id, maximum, marks and snapshots. They stay readable and physically markable, are never online-ready, and cannot be created or reverted to. An unused draft part converts by choosing a type and entering questions (its maximum becomes the question sum). Used parts stay locked; no conversion strategy exists yet.
- **Answer key privacy:** `assignment_part_questions` and `assignment_question_choices` have RLS enabled and no grants; they are read only through staff security-definer functions. `assignment_json` (the staff contract, used by `getAssignment`) includes `is_correct`. `edra_private.assignment_student_json` is the future student-safe projection (no correctness, no draft marks, no storage keys); it is internal and not exposed by any endpoint yet.

## Question images (migrations `20261007140000`–`20261007160000_assignment_question_images*.sql`)

- Staff paste images into an online question's text or choices. The editor (`components/editor/images/field.tsx`) shows each image as an inline badge: hovering previews it, clicking opens a viewer that can step through the field's images and remove one.
- The field value stores each image inline as `{{image:<id>}}` (`images.ts`). The browser uploads the image directly to the private `assignment-images` bucket at `<academyId>/<id>`. PNG, JPEG, WebP, and GIF only, up to 5 MB each; the bucket enforces both. The editor shows images through signed URLs that last one hour.
- Storage RLS (`is_assignment_image_staff`) lets the academy's staff upload and read its images. Objects cannot be updated or deleted through the API, because saved questions may still reference them. A deferred constraint trigger rejects, at commit, any reference to an image outside the question's academy folder and any question with more than 10 images across its text and choices (`validation`, hint `questions`). The form schema enforces the same cap.
- Not built yet: student read access to images, and cleanup of uploads that no question references (such as an image removed before saving).

## Per-question answers and fast marks (migration `20261007170000_assignment_question_answers.sql`)

- Staff enter a student's work in the student sheet (the Mark sheet beside Edit, or the student list → Edit). Each typed part is entered **by question**, five questions at a time: the letter chosen (or Blank) for Edra-questions and answer-key parts, a mark for manual-marking parts. Choice answers are scored from the answer key: the question's full marks when correct, 0 when wrong or blank.
- `assignment_question_answers` stores one row per (recipient, question): `choice_id` (null = left blank, or a manual part) and `score`. RLS on, no grants; read through `assignment_recipient_rows` (`answers`). `save_assignment_marks` accepts `p_changes.answers` (`{question_id, choice_id}`, `{question_id, score}`, or `{question_id, clear: true}`), checks each answer fits the part type and the question's maximum, and derives the part mark as the sum of the part's answers in the same transaction (`assignment_marks.from_answers = true`). A part whose last answer is cleared loses its derived mark.
- **Fast mark**: a part total typed directly (`p_changes.marks`) is still accepted for every part. It replaces the student's answers for that part and is stored with `from_answers = false`; the sheet and Students table show it as "Fast marked". Excused adjustments also replace the part's answers. One save cannot touch a part both ways. Marks saved before this migration are fast marks.
- Published results still snapshot part marks only. Changing an answer without changing any part mark still bumps the student's version.
- **Analytics** (Overview): average score per question or per part as a share of its maximum (`analytics.ts`), from answers only: fast and excused marks are left out. Bars under 50% are highlighted; "Hardest first" sorts them.
- The v1 API is unchanged: it neither returns nor accepts answers (marks gain `from_answers`).

## Not implemented yet (EDRA-76 checkpoints 2–5)

Staff question/model-answer file uploads and viewer, the in-person-online-submission academy setting, student responses and submission acceptance, automatic grading and automatic result publication, review state and the submissions panel, the separate submission-blocking flag (close/reopen is unchanged and still blocks newly received work only), and source-conflict handling. Students cannot submit online: the account→record link (EDRA-80) and student screens (EDRA-81) do not exist, and no acceptance code exists in this module.

## Roles and lifecycle

| Action | Owner/Admin | Instructor |
|---|---|---|
| Create and edit drafts (structure included) | Yes | Yes |
| Publish (draft → published) | Yes | No |
| Unpublish before activity (published → draft) | Yes | No |
| Close / reopen (published ↔ closed) | Yes | No |
| Archive (draft or closed → archived, terminal) | Yes | No |
| Edit title, instructions, due date, part titles/instructions after publishing | Yes | No |

- **Publish** validates the parts and audience against current data (active groups of the year, the academy's level/track), then snapshots matching **active** annual records as `assignment_recipients` once. Codes are irrelevant to targeting; uncoded students are recipients. An audience with no active students fails with `empty_audience`. Later enrollment or group moves do not change recipients.
- After publishing, audience, part ids, order, count, types, questions, choices, and maxima are locked (`structure_locked`).
- **Unpublish** deletes the snapshot and is only allowed while `edra_private.assignment_has_activity` is false. It is true once any work status is recorded, any mark exists, or any result was published.
- A closed academic year makes every command fail with `year_unavailable`.
- Assignments are archived, never deleted (trigger).

## Concurrency and retries

- Every edit and lifecycle action carries the `expectedVersion` the user saw; a stale version writes nothing (`assignment_conflict`). The edit page never refetches under an open form.
- Create takes a client-generated `assignmentId` per create action. A retry by the same creator returns the same draft (`replayed: true`); the id reused by anyone else is `idempotency_conflict`.
- Lock order for lifecycle commands: assignment row (`for update`), then academic year (`for share`); publication additionally share-locks the named groups. Marking commands: student-code settings (share, code path) → assignment (share) → annual record (share, code path) → academic year (share) → recipient rows (update). Lifecycle commands take the assignment for update, so close/archive serialize with marking and publication.
- Commands charge the server-owned `op:assignment_author` quota (120 per minute per user).

## Errors

Commands raise SQLSTATE `P0001` with a stable message, mapped in `errors.ts`: `validation`, `forbidden`, `not_found`, `year_unavailable`, `assignment_conflict`, `invalid_audience`, `empty_audience`, `invalid_state`, `structure_locked`, `incomplete`, `has_activity`, `idempotency_conflict`, `throttled`; marking adds `not_recipient`, `invalid_score`, `unknown_part`, `assignment_closed`, `has_marks`, `student_codes_disabled`, `student_code_not_found`, `student_code_retired`, `student_code_ambiguous`, `student_changed`.

## Work, marks, and results

- **Work status** per recipient: `expected` (not received), `submitted`, `late`, `missing`, `excused`, set by staff with the actor and received time (`record_assignment_work`). Never inferred from the due date. `missing`/`excused`/`expected` are refused while ordinary marks exist (`has_marks`).
- **Marks**: one row per (recipient, part); no row = unmarked, `0` = confirmed mark. A row is an ordinary mark or an excused adjustment with a reason (never both, so a part is never counted twice). Scores are decimal strings, `0 ≤ score ≤ part maximum`, two decimals; anything else is `invalid_score`. The first ordinary mark for a student whose work is not received records it as `submitted` in the same transaction. Closed assignments accept marks only for already received work.
- **Fast entry**: `save_assignment_marks` takes either the permanent record id or a code (exact normalized match, `student_code_assignments`, ambiguity counted over distinct profiles, retired refused, revalidated under the record lock; migration `20261007130000_assignment_code_binding.sql` adds `p_expected_record_id`, so a code save is bound to the previewed student and fails with `student_changed` if the code now names someone else; the API still supports code saves, the web Mark sheet picks students from the list and sends the permanent record id). Saves carry the student's `expectedVersion`; a stale one returns the current row (`conflict`) and writes nothing. Retries reuse an idempotency key per distinct payload (`assignment_requests`).
- **Publication**: any staff role, per student or in bulk (1–500). Validation is all-or-nothing (`rejected` with a reason per student: `not_recipient`, `stale`, `incomplete`). Each publication is an immutable snapshot (`assignment_result_publications`) with the previous official values. Marks changed after publication leave the student `pending_correction`, reads stay on the last snapshot, and republishing creates a new revision and one `result_corrected` effect. Republishing an unchanged result creates nothing.
- **Outbox**: `assignment_result_effects` (`result_published`, `result_corrected`) is written with the publication. Nothing consumes it yet; notification delivery is a later slice.

## Public API

Client-safe (`index.ts`): server actions `createNewAssignment`, `saveAssignment`, `changeAssignment`, `saveStudentMarks`, `recordStudentWork`, `announceStudentResults`, `lookUpStudent`; browser reads `loadAssignments`, `loadAssignment`, `loadMarks`, `loadRecipients`, `loadAudiencePreview`, `loadYears` and their query keys; `assignmentPermissions`; score helpers; types.

Server (`server.ts`): `createAssignment`, `updateAssignment`, `changeAssignmentState`, `getAssignment`, `previewAudience`, `listAssignments`, `listMarks`, `saveMarks`, `recordWork`, `publishResults`, `resolveStudent`, `assignmentAcademy`, and the `/api/v1` responses (`v1.ts`). Each takes an optional `Authority` (default: the cookie session) so the future bearer API runs the same operations.

Database: `create_assignment`, `update_assignment`, `change_assignment_state` (commands); `save_assignment_marks`, `record_assignment_work`, `publish_assignment_results` (commands, quota-charged); `get_assignment`, `list_assignment_recipients`, `preview_assignment_audience`, `list_assignment_marks`, `resolve_assignment_student` (member reads). Tables are readable by academy members through RLS; authenticated users have no direct writes.

## Web

- `/app/assignments`: search, year/state/audience filters (archived hidden by default), Create. Assignments show as cards (`components/list/card.tsx`); the whole card opens the workspace. Empty and no-results states replace the grid.
- `/app/assignments/new`, `/app/assignments/<id>/edit`: the form (`components/editor/form.tsx`), with a live advisory recipient preview and the derived maximum.
- `/app/assignments/<id>`: the workspace, without tabs: stat cards and the marks chart on top, then parts (left) beside the top five students by total (right). The top students' **View all** opens the full student list (work status, marks, totals, result state, the per-student sheet, select-and-publish), with a back button to the overview. The state badge shows only for draft and closed assignments. Also a **Mark** button beside Edit: a sheet with a student search (name or code) above the marks form; saving resets the search for the next student. Saving from a student’s own sheet (student list) closes it. The student sheet has marks and feedback only: work is recorded as received automatically by the first mark, and the web UI no longer sets other work statuses (missing, late, excused); `record_assignment_work` and the server action remain. Student submissions will join it later.

## Implementation defaults (not owner-confirmed product rules)

- Snapshot at publication; no add-recipient or audience-sync workflow.
- One assignment-wide optional due date, entered as Cairo date + time; a new assignment pre-fills the same time one week later.
- The form orders Details, Parts, Audience; audience uses the schedule form's Groups / Level and track pattern.
- Every part is scored and required; up to 50 parts; see "Typed parts" for the question and part bounds.
- Archived student records are excluded from the snapshot. Participation type (in-person/online-only) does not filter the audience.
- Reopen (closed → published) is offered so an accidental close can be undone.
