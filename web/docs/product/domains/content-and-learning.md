# Edra — content units and learning releases

Approved by the owner, 2026-10-11. Detailed workflow decisions remain in the separate planning review notes.

## Content units

A content unit organizes a portion of learning material. It brings together explanation videos, assignments, quizzes, homework and quiz answer videos, and supporting resources such as PDFs.

Content units belong to a program in an academy. Staff can prepare material before it is ready for students. Reuse across programs or academic years is an explicit copy operation, not automatic carry-over or shared editing of the same unit.

Creation details confirmed by the owner, 2026-10-16: a unit requires a title; its description is optional. Staff can save a unit before adding any learning material. The existing track-removal and historical-preservation rules still apply.

Program scope clarified by the owner, 2026-10-18: the academic year, one grade (level) and optional track within that grade are specified in program scope. A unit resides in that program and inherits all three; staff do not select them separately for each unit. This defines the product context, not a requirement for a particular database table or storage design.

## Learning releases

A release is the explicit publication of a unit within its program's academic year and grade/track scope. A level-wide program serves eligible students across that level's tracks and groups. Creating a unit inside the program establishes its draft context directly; staff do not perform a separate yearly-release setup action.

The release holds that year’s student progress, learning-access relationships and assessment activity. Reusing material in another year does not reset or rewrite the earlier students’ work.

Staff prepare a release as a draft, then release it when it is ready. Students cannot see draft releases. A release requires at least one ready explanation video before it becomes student-visible.

## Preparing and organizing material

Owners, Head Admins, Admins and Instructors can create content units, prepare draft releases, add videos and resources, and prepare attached assessments and answer material.

Owners, Head Admins and Admins release content, manage its published audience and archive units or releases. Instructors prepare learning material but do not release it to students.

Ownership and review updated by the owner, 2026-10-21: instructors may edit their own units, including units that have already been published. Their edits remain in the working draft until a manager explicitly publishes them; the existing published snapshot stays visible to students. Instructors may continue editing while review is pending and submit their changes for manager review. Managers may edit academy units, leave feedback, request changes and publish. Instructors cannot edit another instructor's units or publish changes. These content-unit permissions do not change assessment preparation, marking or announcement permissions. This replaces the earlier restriction to never-published instructor drafts; implementation must enforce the updated rule on the server and in the database.

Materials can be arranged in a teaching order within the unit. Adding an assignment or quiz makes it part of the unit’s learning experience; assessment rules still govern submissions, marking and results.

Confirmed by the owner, 2026-10-16: the unit editor supports adding explanation videos, attaching assessments and their answer videos, and attaching documents and supporting resources. Staff can both select an existing assessment and create a new assessment from the unit editor. Both paths follow the same assessment ownership, audience, attachment and history rules.

## Assessments within content

Assignments may be created independently and attached to new or existing content later. Attaching them preserves work and marks already recorded. Once an already attached assessment has work in progress or recorded work, its attachment cannot be removed or moved to another unit. First attachment of a standalone assignment with existing work remains allowed.

Assignments, quizzes and exams can be attached to content units, with at most one content-unit attachment per assessment in its academy and academic year. Assessments may remain unattached. Exams can also be fully standalone and available to students through their own assessment flow. An exam following a revision unit is an example of optional attachment.

Students reach attached online assessments through the released unit, subject to their assessment availability rules. Assignment visibility does not require a separate assignment-release action. Results are announced separately and become part of the student’s performance.

An attached assessment and its annual content release must share academy and academic year. The release's audience must cover the entire configured assessment audience; attachment cannot broaden assessment eligibility. Standalone exams remain available through their own assessment flow.

Answer material belongs to the assessment it explains. A release’s explanation access does not by itself unlock homework or quiz answer videos.

## Student experience

Current delivery scope confirmed by the owner, 2026-10-21: students enter their connected academy and see published content units matching their current academic year, level and optional track directly. There is no separate student program/course enrollment step in this slice. Program-versus-course redesign and optional academic terms are deferred; existing year/level/track scope remains in use. Eligible released units are shown with their access state, including when locked; draft working changes are not exposed. Units are ordered newest published first. An academy with no eligible published units shows an empty state.

Within a unit, students watch available explanation videos, open resources, complete assignments and quizzes, and view answer material when eligible. They can follow their progress and resume video playback where they left off.

Unit progress and announced assessment performance describe different parts of the student’s learning. Watching a lesson does not create an assessment result.

Access duration, answer unlocks, playback restrictions and assessment attempt limits are defined in their own rules.

## Teaching in sessions

Staff record which released material was taught in a session. A session may cover several units, and a unit may be taught across several sessions or to different groups at different times.

The association records the material actually covered. Finalized attendance and replacement attendance use that information to determine the corresponding explanation access and resolved missed material.

Initial session-linking implementation scope, 2026-10-19, under the owner's delegated implementation direction: all active staff, including instructors, may record taught units in a live or ended session while its year is open, the session is not archived and attendance has never been finalized. Select published units in the same academy/year whose grade and optional track cover the session's captured audience. Links are optional; attendance can be finalized without any. The first finalization locks the links for this slice, including an empty list. Post-finalization content corrections remain separate work and do not establish the unresolved access-revocation policy.

Each saved association preserves the selected published content revision and title. Subsequent unit edits, republication, archival and track removal do not rewrite what was recorded as taught. Changes before finalization retain their own versioned history and invalidate an older attendance review. Recording taught units alone does not grant student access; the access consumer remains a separate integration.

## Changes and history

Staff may revise draft material. Once students have activity on a release, changes preserve their submissions, results, progress and the material needed to explain that history.

Confirmed by the owner, 2026-10-16, and extended to instructor-owned units on 2026-10-21: edits to a published unit remain unpublished until a manager explicitly publishes the changes. Saving edits alone does not change what students see. The currently published material remains the student-visible version while edits are being prepared. Publishing changes still obeys assessment locks and academic-history preservation. Editing or replacing material does not reset student access periods.

Confirmed 2026-10-25: managers can publish their current editor changes directly without first pressing Save draft. Save and publication execute atomically with the current version check and all readiness/history validation. Failed publication changes neither the stored draft nor the live snapshot, and the editor retains unsaved changes for correction. The separate Save draft action remains available; instructors still require manager publication.

Archiving a unit removes its published release from active student learning while retaining its records. Managers can archive and restore units. Restoration returns a unit to a draft, not directly to student visibility; a manager must explicitly publish it again under the usual readiness and history rules. This does not authorize deleting stored video assets, resetting access periods or rewriting earlier academic history. Closed-year records remain read-only under the academic-year rules.

When a track is removed, affected content units and their current released audiences become level-wide under the approved track-removal rules. Earlier activity and snapshots retain their historical identity.

## Academic-year reuse

Confirmed by the owner, 2026-10-16: a program starts with no units in a new academic year. Opening the year does not automatically carry over old units or create drafts from them. New content and new units are prepared for that year; earlier academic history is preserved.

An academy can explicitly reuse earlier material for a new year by copying it into the destination program and preparing its release. New-year student progress and access are established for that release; the previous year’s activity remains separate.

Optional cross-program reuse confirmed by the owner, 2026-10-16: instructors and managers can explicitly choose to reuse a whole unit or individual learning material from another program within the same academy, including during the term. Reuse creates an independent copy, not a linked instance: edits to either copy do not change the other. Instructors may reuse published material only, not other instructors' unfinished drafts. Reuse is an available action, not the default or an automatic carry-over, and does not grant instructors permission to publish content. Manager source-draft reuse permissions remain to be agreed; existing assessment attachment, audience and historical-record rules remain in force. Logical independence does not require duplicating stored video/document binaries; asset storage is an engineering detail that must preserve that independence.

Whole-unit copying confirmed by the owner, 2026-10-16: copy all of the unit's learning material as a starting point, including explanation videos, documents, attached assessments and their answer videos. Copied assessments are fresh assessment definitions with their questions and settings, not another attachment to the source assessment; student answers, marks, results, progress and access are not copied. Clear copied assessment dates, including deadlines and opening/closing dates, so staff set new ones. Copied assessments target the whole destination program by default, using its grade and optional track; source group selections are not carried over. An instructor can edit their copied draft before submitting it for manager review, and managers can edit it before publication. The normal draft/review/publication and assessment compatibility rules apply. Copying does not authorize retaining an incompatible source audience or academic year.

Closing a year ends its learning access and preserves its academic history. Student and parent visibility of historical results is governed by the reporting rules.
