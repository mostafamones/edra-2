# Assignments integration

Current staff implementation. Intended behavior is in [product assessments](../../../docs/product/domains/assessments.md); [OpenAPI](../../../docs/api/assignments.openapi.yaml) describes the current bearer surface.

## State and recipients

The standalone lifecycle migration 20261009100000_assignment_standalone_lifecycle.sql and types.ts use active/closed/archived. There is no assignment Publish/Unpublish action. ready indicates every part is complete; active/closed ready assignments can receive the applicable marking/announcement actions. A closed year is read-only.

Task 4 separates immutable required-cohort revisions (`assignment_cohorts` / `assignment_cohort_members`) from live matching placement. Existing stored recipients become the required cohort without rewriting work/results or inferring a historical roster. Valid empty cohorts are initialized; incomplete group preparation remains uninitialized. New first valid audiences capture once. Equivalent group order and routine title/text saves preserve that capture. A deliberate pre-work target change captures another revision; prior provenance remains. Legacy published_at is provenance, not visibility.

Late matching active annual records appear automatically in staff lists/search/code resolution as optional. Reads create no rows. An authorized physical-work/mark command lazily creates the existing recipient aggregate, without required membership. No new online submission surface is introduced. Leaving the configured target ends unfinished requirements while preserving work, private marks and official results; returning placement does not reinstate an ended requirement. New physical work requires current placement; received work remains markable/announceable when submissions are closed.

Compatibility: `recipient_count` remains the captured required count, including ended requirements. It never becomes a live roster/work-row count. `current_required_count`, `eligible_count` (current placement, before delivery gates), `optional_eligible_count`, cohort revision/capture/source/basis and per-student `required`, `requirement_ended_at`, `requirement_source`, `cohort_revision`, `eligible` are additive. The `not_received` filter includes only current required work; optional/ended non-submission is excluded. Legacy payloads default to required. Official result payloads/hashes are unchanged by cohort/placement updates.

Owner/Head Admin/Admin close, reopen and archive; all active staff create/edit pre-activity setup and mark/announce received work. Closed blocks newly received work, not already received marking. A suspended member has no assignment authority in that academy. permissions.ts controls UI; database RPCs enforce authority/state/version.

## Parts, images and marks

Source kinds are online_questions, answer_sheet and file_upload, labeled Question Sheet, Answer Sheet and Written Work in product rules. Typed questions have stable IDs/positions, exact-decimal maxima, and 2–10 choice entries where applicable. Staff documents include correctness; the student-safe internal projection must not be exposed as the staff contract. Legacy null-kind parts remain readable/physically markable, not new online-ready parts.

Question images use the private assignment-images bucket and stored inline image references. Storage/transaction checks protect academy folders and saved references; student image reads and orphan cleanup are not completed by this module.

Staff may enter per-question answers/manual scores or a fast part total. Answers derive part marks; fast/excused marks replace that part's answer entry. Totals use exact decimal strings and maxima checks. v1 returns saved answers with part marks, accepts answers (choice, explicit blank, Written Work score or clear), part marks and feedback, and searches the whole cohort (name fragment or code prefix) before paging.

## Public services and concurrency

server.ts exports createAssignment, updateAssignment, changeAssignmentState, getAssignment, listAssignments, previewAudience, listMarks, saveMarks, recordWork, publishResults, resolveStudent, studentCodesEnabled and assignmentAcademy plus v1 builders. actions.ts exposes web actions; routes remain composition/adapters.

Authoring uses expectedVersion and a create identity; marking uses per-student expectedVersion and stable retry keys. Code saves bind the previewed record where supplied. Lifecycle/authoring lock assignment then year; marking/code operations follow the SQL lock graph before recipient writes. First work locks the annual record before the recipient; placement writers update only targeted cohort membership and never take assignment or recipient locks in reverse. Do not reverse lock order or replace existing part IDs during an edit.

Result announcement (web action and `POST .../results/publications`) validates complete work, snapshots official marks and records result_published/result_corrected effects. Changed private marks remain pending corrections until announcement; unchanged announcement creates no duplicate effect. Effects currently have no consumer here: recording one is not parent delivery or solution access.

## Product work still outstanding

Student submissions, content integration, automatic result announcement and source locks require their respective implementation. Controlled key corrections/exclusions are present in the staff implementation (`20261019172557_assignment_scoring_corrections.sql`); do not rebuild them as student-submission work. Student account linking is implemented in the students/enrollment module; it does not itself grant submission/content access. EDRA-81's confirmed student scope is in the product assessments reference, including its separate entitlement and answer-video rules. Do not describe that planned student flow as implemented by the staff HTTP API. Check SQL/TypeScript/handlers again when updating a slice; no deployment/cloud status is asserted here.

## Task 4 verification — G06, 2026-10-19

`assignment_eligibility.sql` exercises the actual restricted backfill helper on legacy rows (including a recipient outside current placement, an official publication, valid empty and invalid preparation), routine/equivalent saves, target reset, optional physical/code work and retry receipts, required-only filters, placement history and year/archive/closure guards. Concurrency scenarios 34–39 cover capture/enrollment, target change/first work, placement/first work and optional marks, and projection/start; scenario 26 also rejects late assignment work after year closure. The cohort migration composes with prior scoring projections/commands; Task 3 retains scoring/result ownership. The historical audit is preserved; CI evidence and deployment must be reported separately.
