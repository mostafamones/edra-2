# Assignments integration

Current staff implementation. Intended behavior is in [product assessments](../../../docs/product/domains/assessments.md); [OpenAPI](../../../docs/api/assignments.openapi.yaml) describes the current bearer surface.

## State and recipients

The standalone lifecycle migration 20261009100000_assignment_standalone_lifecycle.sql and types.ts use active/closed/archived. There is no assignment Publish/Unpublish action. ready indicates every part is complete; active/closed ready assignments can receive the applicable marking/announcement actions. A closed year is read-only.

Current pre-activity saves refresh the recipient snapshot from matching active annual records; activity freezes recipients and structure. Empty audiences are allowed. This differs from the newly approved first-save required cohort and optional late-student eligibility, which still need implementation. Legacy published_at is provenance, not visibility.

Owner/Head Admin/Admin close, reopen and archive; all active staff create/edit pre-activity setup and mark/announce received work. Closed blocks newly received work, not already received marking. A suspended member has no assignment authority in that academy. permissions.ts controls UI; database RPCs enforce authority/state/version.

## Parts, images and marks

Source kinds are online_questions, answer_sheet and file_upload, labeled Question Sheet, Answer Sheet and Written Work in product rules. Typed questions have stable IDs/positions, exact-decimal maxima, and 2–10 choice entries where applicable. Staff documents include correctness; the student-safe internal projection must not be exposed as the staff contract. Legacy null-kind parts remain readable/physically markable, not new online-ready parts.

Question images use the private assignment-images bucket and stored inline image references. Storage/transaction checks protect academy folders and saved references; student image reads and orphan cleanup are not completed by this module.

Staff may enter per-question answers/manual scores or a fast part total. Answers derive part marks; fast/excused marks replace that part's answer entry. Totals use exact decimal strings and maxima checks. v1 returns saved answers with part marks, accepts answers (choice, explicit blank, Written Work score or clear), part marks and feedback, and searches the whole cohort (name fragment or code prefix) before paging.

## Public services and concurrency

server.ts exports createAssignment, updateAssignment, changeAssignmentState, getAssignment, listAssignments, previewAudience, listMarks, saveMarks, recordWork, publishResults, resolveStudent, studentCodesEnabled and assignmentAcademy plus v1 builders. actions.ts exposes web actions; routes remain composition/adapters.

Authoring uses expectedVersion and a create identity; marking uses per-student expectedVersion and stable retry keys. Code saves bind the previewed record where supplied. Lifecycle/authoring lock assignment then year; marking/code operations follow the SQL lock graph before recipient writes. Do not reverse lock order or replace existing part IDs during an edit.

Result announcement (web action and `POST .../results/publications`) validates complete work, snapshots official marks and records result_published/result_corrected effects. Changed private marks remain pending corrections until announcement; unchanged announcement creates no duplicate effect. Effects currently have no consumer here: recording one is not parent delivery or solution access.

## Product work still outstanding

Student submissions/account-to-record academy links, content integration, automatic result announcement, optional late eligibility, controlled key corrections/exclusions and source locks require their respective implementation. Do not describe these approved rules as implemented by the staff HTTP API. Check SQL/TypeScript/handlers again when updating a slice; no deployment/cloud status is asserted here.
