# Assignments integration

Current staff implementation. Intended behavior is in [product assessments](../../../docs/product/domains/assessments.md); [OpenAPI](../../../docs/api/assignments.openapi.yaml) describes the current bearer surface.

## State and recipients

The standalone lifecycle migration 20261009100000_assignment_standalone_lifecycle.sql and types.ts use active/closed/archived. There is no assignment Publish/Unpublish action. ready indicates every part is complete; active/closed ready assignments can receive the applicable marking/announcement actions. A closed year is read-only.

Task 4 separates immutable required-cohort revisions (`assignment_cohorts` / `assignment_cohort_members`) from live matching placement. Existing stored recipients become the required cohort without rewriting work/results or inferring a historical roster. Valid empty cohorts are initialized; incomplete group preparation remains uninitialized. New first valid audiences capture once. Equivalent group order and routine title/text saves preserve that capture. A deliberate pre-work target change captures another revision; prior provenance remains. Legacy published_at is provenance, not visibility.

Late matching active annual records appear automatically in staff lists/search/code resolution as optional. Reads create no rows. An authorized physical-work/mark command lazily creates the existing recipient aggregate, without required membership. Leaving the configured target ends unfinished requirements while preserving work, private marks and official results; returning placement does not reinstate an ended requirement. New physical work requires current placement; received work remains markable/announceable when submissions are closed.

Compatibility: `recipient_count` remains the captured required count, including ended requirements. It never becomes a live roster/work-row count. `current_required_count`, `eligible_count` (current placement, before delivery gates), `optional_eligible_count`, cohort revision/capture/source/basis and per-student `required`, `requirement_ended_at`, `requirement_source`, `cohort_revision`, `eligible` are additive. The `not_received` filter includes only current required work; optional/ended non-submission is excluded. Legacy payloads default to required. Official result payloads/hashes are unchanged by cohort/placement updates.

Owner/Head Admin/Admin close, reopen and archive; all active staff create/edit pre-activity setup and mark/announce received work. Closed blocks newly received work, not already received marking. A suspended member has no assignment authority in that academy. permissions.ts controls UI; database RPCs enforce authority/state/version.

## Parts, images and marks

Source kinds are online_questions, answer_sheet and file_upload, labeled Question Sheet, Answer Sheet and Written Work in product rules. Typed questions have stable IDs/positions, exact-decimal maxima, and 2–10 choice entries where applicable. Staff documents include correctness; the student-safe internal projection must not be exposed as the staff contract. Legacy null-kind parts remain readable/physically markable, not new online-ready parts.

Question images use the private assignment-images bucket and stored inline image references. Storage/transaction checks protect academy folders and saved references; students receive 60-second URLs only for images in their current editing document. Orphan image cleanup is not completed by this module.

Staff may enter per-question answers/manual scores or a fast part total. Answers derive part marks; fast/excused marks replace that part's answer entry. Totals use exact decimal strings and maxima checks. v1 returns saved answers with part marks, accepts answers (choice, explicit blank, Written Work score or clear), part marks and feedback, and searches the whole cohort (name fragment or code prefix) before paging.

## Public services and concurrency

server.ts exports createAssignment, updateAssignment, changeAssignmentState, getAssignment, listAssignments, previewAudience, listMarks, saveMarks, recordWork, publishResults, resolveStudent, studentCodesEnabled and assignmentAcademy plus v1 builders. actions.ts exposes web actions; routes remain composition/adapters.

Authoring uses expectedVersion and a create identity; marking uses per-student expectedVersion and stable retry keys. Code saves bind the previewed record where supplied. Lifecycle/authoring lock assignment then year; marking/code operations follow the SQL lock graph before recipient writes. First work locks the annual record before the recipient; placement writers update only targeted cohort membership and never take assignment or recipient locks in reverse. Do not reverse lock order or replace existing part IDs during an edit.

Result announcement (web action and `POST .../results/publications`) validates complete work, snapshots official marks and records result_published/result_corrected effects. Changed private marks remain pending corrections until announcement; unchanged announcement creates no duplicate effect. Effects currently have no consumer here: recording one is not parent delivery or solution access.

## Student web journey — EDRA-81

Migration 20261022190051_student_assignment_journey.sql and `student/` add the cookie-session student flow at `/learn/academy/<slug>/assignments[/<id>]`. The bearer v1 API has no student scope.

- **Authority.** `list_my_assignments`/`get_my_assignment` and `assignment_student_command` resolve the ordinary-session account's open-year annual record, suspension, offering, readiness and audience inside the database; ids only locate work. Projections are allowlisted metadata (no questions, keys, private marks, files or media URLs). Reads create no drafts or recipients. Visible-but-blocked reasons: `submitted`, `result_announced`, `assignment_closed`, `online_unavailable` (legacy untyped parts), `not_recipient`, `in_person_disabled`, `entitlement_required`.
- **Units.** An assignment belongs to a unit only when that published revision contains it (working attachments are not authority). Attached work requires a current or expired, unrevoked explanation grant: the ledger's current grant head decides; a revoked head never falls back. Unit pages link the attached assignment.
- **Editor.** `claim` creates the draft row and an expiring (90 s) per-tab generation; another live editor gets `busy` until the student explicitly transfers. Every write carries token, generation and a retry key; save/submit also carry the acknowledged answers version. Exact retries replay the stored receipt; a lost submit recovers receipt metadata only. The browser keeps pending choices and the one uncertain command per account in localStorage and discards them when newer server work or another generation exists.
- **Sources.** The first accepted answer or file selects online work: earlier unannounced physical marks/answers move to `assignment_physical_history`, and staff can no longer record physical work, mark choice parts or announce until submission. File bytes alone never select a source.
- **Written Work.** Private `assignment-work` bucket, 8 MB per file, PDF/JPEG/PNG/WebP, 20 files per part (`student/files.ts` shares the limits). Uploads use signed fresh-object URLs; the server reads the bytes, detects the real type, attests the SHA-256 with the service role, then the student's fenced `finish` accepts the file. Accepted files are immutable; removed and >24 h unfinished objects are deleted in bounded per-student batches. HEIC is not supported.
- **Submission.** One atomic accepted operation: immutable choices + file manifest, choices graded with the current key (blanks score 0), recipient marked submitted/late, and — when there is no Written Work part — the complete result announced once (`result_published` effect). Manual work waits for ordinary staff marking/announcement; staff open accepted files from the marking form through short-lived signed URLs.
- **Answer videos.** An accepted online submission, or an announced physical result received as submitted/late, qualifies all the unit's answer videos for the assignment; playback reuses `authorize_content_material` and Mux signing, independent of explanation access.
- **Setting.** `assignment_online_setting` (Owner/Head Admin/Admin) enables online submission for in-person students; off by default.

Not delivered here: answer-access revocation/restoration, mutation quotas for student commands, quiz/exam consumer work (EDRA-156 remainder). Student account linking lives in the students/enrollment module.

## Task 4 verification — G06, 2026-10-19

`assignment_eligibility.sql` exercises the actual restricted backfill helper on legacy rows (including a recipient outside current placement, an official publication, valid empty and invalid preparation), routine/equivalent saves, target reset, optional physical/code work and retry receipts, required-only filters, placement history and year/archive/closure guards. Concurrency scenarios 34–39 cover capture/enrollment, target change/first work, placement/first work and optional marks, and projection/start; scenario 26 also rejects late assignment work after year closure. The cohort migration composes with prior scoring projections/commands; Task 3 retains scoring/result ownership. The historical audit is preserved; CI evidence and deployment must be reported separately.
