# Current staff HTTP API

- [Sessions and attendance OpenAPI](sessions-attendance.openapi.yaml).
- [Assignments OpenAPI](assignments.openapi.yaml).
- [Quizzes OpenAPI](quizzes.openapi.yaml).
- [Exams OpenAPI](exams.openapi.yaml).

Contracts were checked against current route handlers, v1 builders, shared HTTP authority/errors and relevant domain types. This is source verification, not deployment or cloud verification. Bearer authentication is separate from cookie web actions; mixed cookie/bearer requests are rejected. Native clients do not need CORS; browser callers use configured origins.

Sessions v1 includes starting a session from a schedule (`POST /api/v1/academies/{academyId}/sessions`, idempotent by start key) and listing startable schedules (`GET /api/v1/academies/{academyId}/schedules`, offset-paged). Ending, archiving and restoring sessions remain web actions.

Assignment source uses active/closed/archived and ready, with no assignment Publish step. Current v1 supports staff reads with server-decided `actions` and `student_codes_enabled`, full-cohort marks search, per-question answers and part marks, code resolution and atomic selected result announcement (`POST /api/v1/assignments/{assignmentId}/results/publications`, `409 PUBLICATION_REJECTED` with per-student failures). Student submissions are not part of this contract. Part kinds retain source identifiers online_questions/answer_sheet/file_upload while product labels are Question Sheet/Answer Sheet/Written Work.

Current role enforcement uses owner/head_admin/admin/instructor; Head Admin has the Owner/Admin authority of these endpoints. Every request requires an active membership: a suspended or removed staff member is denied in that academy (403/404) with an otherwise valid token, and `/api/v1/academies` omits suspended memberships. Late optional eligibility and controlled exclusions/key corrections require their implementation work. Read [product assessments](../product/domains/assessments.md) for intended behavior and [module integration](../../src/modules/assignments/README.md) for current source limits.

Quizzes v1 is staff reads only (list, detail with key, students with work and result state). Staff quiz commands are cookie web actions. The student quiz contract is deployed in the database but denied (`student_link_unavailable`, `content_unavailable`) and has no HTTP route; see [quiz module integration](../../src/modules/quizzes/README.md).

Exams v1 is staff reads only (list, detail with key, students with work, departures and result state). Staff exam commands are cookie web actions. The student exam contract is deployed in the database but denied (`student_link_unavailable`) and has no HTTP route; exams are standalone and need no released content. File/photo evidence and solution videos are deferred; see [exam module integration](../../src/modules/exams/README.md).
