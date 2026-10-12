# Edra — parent reports

Pre-approved working draft, 2026-10-11. The owner will re-review it with the master thread before implementation planning. Recommendations and open decisions are not final implementation requirements.

Parent reports give families a clear view of a student's participation and academic performance within an academy and academic year. They bring together finalized attendance, replacement attendance, announced assessment results and notes shared with parents.

Reports show the student's attendance history and assessment performance, with summaries and graphs that make progress understandable. Assignments, quizzes and exams contribute according to their approved result and reporting rules. Draft marks and unfinished attempts are not presented as official results.

Replacement attendance shows how missed material was recovered while retaining the original absence. Corrections update the official view after attendance is finalized again or revised results are announced; saving private edits does not change the parent's report.

### Report links and permissions

A parent accesses the report through a secret link without creating an Edra account. Each link grants access to one student's report for one academy and academic year. A parent with several children may hold separate links for each child; one link does not expose siblings or other academy records.

Owners, Head Admins and Admins generate, copy, regenerate and revoke report links. Regeneration immediately invalidates the previous link. All staff, including Instructors, can preview the report through their authorized staff access; Instructors cannot reveal or manage the secret link.

Student online suspension does not disable the parent's report. Parent-link revocation is a separate action. Historical academic records remain preserved independently of whether a link remains available.

Reports contain only official academic information and notes explicitly shared with parents. Staff-only notes, student-only notes, private marking and message-provider diagnostics are excluded.

## Recommendation and open decisions

Keep a focused report with attendance, announced assessment results and parent-visible notes, accessed through one child/year link. Metrics and closed-year availability are reviewed separately in report-metrics.md.

Decide whether archiving a student disables their report link or leaves it available for historical reference. Student suspension already preserves parent reporting; archival must not silently be treated as the same action.

Evidence: existing parent glossary/scope, PAR invariants, permission matrix and Linear EDRA-167. No runtime or cloud verification.
