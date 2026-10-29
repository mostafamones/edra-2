# Student details: shaping record

2026-10-29. This records confirmed scope separately from pending decisions. It is not approval of the entire proposed layout or a claim that analytics exist yet.

## Confirmed

- Staff open a dedicated student page while retaining quick edit. The local first slice links student names to the page and opens the existing editor from it.
- All information belongs to the selected student's academy and annual record. Existing record reads, role rules and trusted commands remain authoritative. Do not combine other academies or silently merge years.
- The intended full page covers student analytics, progress, actions, unit access and attendance for in-person students.
- Mandatory attendance rate: (Present + Late) / (Present + Late + Absent), using official finalized values only and excluding archived sessions. Excused and Unknown remain separate and excluded from the denominator. With no qualifying values, display no rate. This is now confirmed in `../product/domains/report-metrics.md`.
- Existing learning rules remain: tracked videos require 90% watched coverage; documents and answer videos are not completion requirements; attached assessment submissions count. Access and completion are independent. Staff analytics must reuse the existing progress semantics, not introduce another completion engine.
- Grant, extend and revoke must reuse the existing content-access actions and conditions. Prerequisites are not bypassed. Staff cannot redeem student coupons or connect accounts manually. Archive, restore and suspension remain distinct actions with existing permissions.

## Current visual direction

Use the academy's record name, placement, participation and account status as the compact identity header. Keep contact/placement editing secondary. Do not introduce student profile pictures into staff records; the product reference explicitly excludes them.

The owner rejected the initial text-heavy tabbed composition as overwhelming and bland. This page now uses one visual overview: announced-result bars, conditional in-person attendance ring/session strip, followed by unit completion rings and access states. Assessment records, attendance evidence/history and contact/placement details expand in context. Keep contact/placement and the existing quick editor in the header actions. This is a student-page decision, not a ban on tabs in other workflows.

Results show one assessment type at a time, normalized against each announced snapshot's maximum; no cross-type average, private mark or inferred zero enters the chart. Show at most eight results from the loaded records, in announcement order, and state that sample scope. Switching type derives locally without a request. Attendance uses the approved denominator, preserves status labels/counts alongside color, and links its session cells to the source. Unit rings represent completed/required tracked items; access remains independent. A missing denominator renders a dash rather than invented completion.

The intended units view includes published content eligible for the annual placement and retained access/history where appropriate. Exact historical scope and pagination still need implementation design; never infer a full student catalog from one page of the unit-centric staff access panel. Never impersonate the student to power a staff analytics page. A staff-authorized projection must validate academy, annual record and role, and return bounded domain data.

## Confirmed analytics direction

- The owner's subsequent “yes” accepts the recommended direction: private and announced marks remain distinguished; per-unit progress and started/completed counts avoid an academy-wide percentage. No combined marks weighting is approved.
- Insights should use deterministic summaries like unit history: describe observed facts, show their evidence and link to an applicable next action. Do not claim an AI model produced them or infer motivation, ability, causes or future outcomes.

## Insight recipes

- Attendance: describe absences in the latest five finalized mandatory sessions; compare attended counts against the preceding five only when both groups contain five decided Present/Late/Absent values. Unknown/Excused prevent that comparison. Sparse data yields no trend claim. The local implementation includes these rules with expandable session evidence.
- Learning: unfinished unit with expired access → show completed/required counts and recorded expiry. The local view currently links to the unit's staff workspace rather than duplicating its grant/extension controls; direct student-page actions remain to implement. Do not label a student “inactive” without a defined observation window and actual activity timestamps.
- Prerequisites: explain the specific unmet unlock/submission requirement and link its source. Do not equate completed viewing with academic readiness or bypass an existing gate.
- Assessments: distinguish submitted work awaiting marking, a recorded private mark, and an announced result. Compare only compatible measures with an explicitly defined sample. Do not call unmarked or missing work a zero.
- Rank actionable obstacles first, followed by recent changes and positive observed progress. Keep the initial insight set short, avoid repeating the same fact in several cards, and expand evidence in context. A complete, fresh data source with no matching pattern may show no insight; an error must never produce an all-clear summary.

## Staff learning authorization

Automatic approval review initially rejected deployment and requested explicit recipients/year scope. The owner then explicitly approved Owners/Head Admins/Admins/Instructors reading the selected academy/year's student access and progress including retained history. The read-only migration was subsequently applied and its types regenerated. It checks current staff membership and exact academy/record scope, reuses the existing learning-state/progress functions, and returns pages of 24 currently published placement-eligible units plus aggregate counts over that same catalog. This does not claim a complete catalog of previously accessed units outside the current placement or removed publication materials; such history remains a separate projection to implement. Grant/edit permissions are unchanged.

## Current local implementation and verification

The tab navigation has been removed. Learning, announced results and conditional in-person attendance load as independent overview sections. Optional active/archived group-label reads wait for the contact dialog. Learning uses the existing `learning` invalidation root; assessment summaries use `assessments` with zero stale time so returning after marking revalidates. Expanding assessment records or attendance evidence reuses already loaded data. Private marks, incomplete marks, announced snapshots and pending corrections remain distinct. A read-only assessment migration was explicitly approved for all four staff roles and applied to the development database. Both projections validate the academy and annual record and retain existing domain calculations.

The signed-in Edge check loaded Ali's three eligible units (one started, zero completed), his C++ completion (one of five tracked items), 89% official attendance and nine assessment records with private/announced results. The new overview was inspected at desktop and 390px widths in dark mode. Contact details opened, Escape dismissed the dialog and focus returned to its header trigger. The chart shows four announced assignment results; unmarked results do not become zero. Eight focused attendance/assessment/chart-series tests passed, including actual zero versus missing, type separation, chronological sample selection and input preservation. TypeScript, production webpack build and full lint passed (five unrelated existing lint warnings). Database assertions are registered in the disposable CI suite and have not run there. No student values were edited during review. Light-theme, expanded keyboard flows and role coverage remain pending; no visual baseline is approved. Direct unit grant actions, complete out-of-placement history and a dedicated annual-record switcher are not claimed implemented.

## Acceptance before calling the full page implemented

Preserve student-list filters on return; reset data on identity/academy/record/year changes. Isolate failed sections and retain safe cached information. Reuse shared query options and fetch optional sections only when opened. Student histories must remain available under archive/closed-year rules without enabling prohibited actions. Test the attendance denominator, Unknown/Excused and archived-session cases, no-data versus failure, permissions and tenant isolation. Review populated and empty states, keyboard flow, both themes and narrow widths in the owner's running app. Only the specific verification recorded above has been completed.
