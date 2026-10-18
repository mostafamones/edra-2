# Edra — native companion workflows

Approved by the owner, 2026-10-11. Confirmed MVP direction is separated from later workflow decisions; enhancement interactions remain provisional.

## Classroom work

The iPhone companion serves Owners, Head Admins, Admins and Instructors within their academy permissions. Staff select an academy, move between teaching and marking, and work on the same academic records used by the web application.

Staff can select a schedule, start or open a live session, record attendance, end the session and finalize attendance. Ending and finalizing remain separate actions. Unexpected and replacement attendance follow the shared attendance rules.

Students can be selected manually or identified through supported student-code scanning. Camera identification finds the student; it does not itself record attendance or marks. Manual selection remains available when scanning is unavailable.

## App shell and navigation — EDRA-124

Confirmed by the owner, 2026-10-18. Follow the supplied iPhone Photos navigation reference: a floating bottom pill on the left contains Sessions and Assessments, each with an icon and label; a separate circular academy button on the right replaces Photos' search button and displays the selected academy's icon. Keep the two controls visually separate. Use native glass on supported systems and a native material fallback on earlier supported iOS versions. Ordinary icons remain bundled Tabler assets.

The academy button opens the academy menu with academy names, the current selection and sign-out. Do not move the switcher to the top or retain the old wide bottom academy card. Keep the selected academy's name readable in the page context and available to accessibility; the icon alone may be shared by several academies.

Sessions is the initial destination. Each destination has its own navigation history within the current academy. Tab changes preserve that history; academy changes reset both histories and pending presentations, returning to Sessions. Account changes or lost membership invalidate affected work and stale responses under the existing account/academy authority rules. Existing session start, attendance and scanner behavior remains intact; scanning is a contextual action rather than a third tab.

EDRA-124 supplies the shell and integrates the existing session workflows. Assessments has an honest placeholder until EDRA-79 supplies its assignment screens; no assignment API work is required for the shell. The bottom controls remain available during ordinary navigation, while presented sheets and the full-screen scanner own their presentation and return to the originating context. Respect keyboard and safe areas, preserve accessible targets, and keep the attendance action button and final scroll rows clear of the dock. Future dirty-edit guards remain owned by their feature integration, including EDRA-79.

## Physical marking

Staff find assignments needing review, identify a student, enter physical answers or marks, save private work and announce complete results. Standalone assignments remain markable before online content is released.

Question Sheet and Answer Sheet use the same compact instructor answer-entry flow. Written Work uses manual marking. Native entry follows the shared assessment rules rather than defining a separate marking model.

### Assignment marking interaction — EDRA-79

Settled during shaping, 2026-10-18. The web assignment marking sheet is the interaction reference, adapted to native phone controls. Deliver question-by-question entry and fast part totals together. Navigation shell ownership stays with EDRA-124; this feature supplies its assignment destination. Assignment creation, availability management and shared answer-key corrections remain web workflows.

Show active and closed assignments, including overdue work; due dates never hide markable work. Closed assignments permit marking and announcement of received work but no new physical work. Archived assignments and closed years are read-only. Standalone and attached assignments use the same marking flow. The assignment workspace offers student name/code search and All, Not received, Needs marking, Marked and Unannounced filters; distinguish complete private work, announced results and pending corrections.

Present a full-height native marking sheet with visible student identity, a part selector, By question / Fast mark controls, scrollable entry, feedback and a keyboard-safe Save action. Use five questions per page, as on web; allow rows and answer buttons to wrap for accessibility. Choice entry uses numbered questions and choice letters plus explicit Blank; Blank records an unanswered question, while Clear restores not entered. Written Work uses decimal question marks with maxima and a quick toolbar: Previous, Next, Zero, Full marks and Clear. Toolbar actions stay on the current question; navigation is explicit. Show progress and part totals. Fast totals support the shared excused adjustment and required reason. Scores use exact decimals within the shared maxima.

Name search, typed code and camera identification select a student into that same sheet. Code lookup is server-authoritative and saves remain bound to the previewed permanent student record. Scanning opens the sheet directly with no separate identity confirmation and writes nothing by itself. Pause recognition during entry; suppress repeated recognition until the handled code leaves the camera view. Camera denial or disabled codes never removes manual selection.

After an acknowledged save, prepare selection for the next student; a camera run resumes scanning. Keep the selected part and entry mode within the current assignment run, but reset question position and student-specific inputs. Existing saved work stays visible and is never replaced by defaults. If the retained mode differs from the saved representation, show that representation and require an explicit replacement choice before saving over it. Changing modes alone never changes saved work. Preserve the shared replacement/history semantics rather than mixing fast totals and question-derived marks. Leaving a dirty sheet or changing students asks Save, Discard or Keep editing. A voluntary academy change uses the same guard; sign-out or lost membership clears the affected state immediately.

Keep failed or uncertain requests and their inputs in memory in the current account/academy/assignment context. Retry the identical mutation with its original key and payload; prevent duplicate submissions and edits to an unresolved request until its outcome is reconciled. Advance only after acknowledgment. There is no offline queue or promise of recovery after app termination. A conflict preserves attempted inputs, displays current server work and requires explicit review/reapplication against the latest version before a new save; never silently merge or overwrite. Refresh after returning to the app, reconciling pending requests before replacing local edits. Ignore late responses from obsolete account/academy contexts.

Announce remains outside the save flow, available for one student or explicitly selected students. Selection is limited to loaded, visible rows; no hidden selection across filters and no implicit select-all across pages. Confirmation lists names, counts and current totals, and identifies corrections. Only complete, saved and currently permitted results qualify; an ineligible selection explains the reason and cannot be announced. Submit the selected student versions atomically with a stable retry key. Any conflict refreshes the selection for review without partial announcement. Previously announced results stay official until changed private work is announced; unchanged announcement produces no duplicate result event.

The backend must enforce the approved assessment audience, work-source, closure, completeness, scoring and history rules. An online draft blocks a separate physical submission; online takeover preserves earlier physical draft history without mixing it into online work. Review of received online work remains subject to the shared rules. Mobile must expose authoritative permitted actions and source/read-only explanations rather than inventing a second policy. Source inspection found answer reads/writes and announcement missing from the bearer API and other approved assignment rules still outstanding; these are explicit backend delivery/dependency work, not evidence of deployed support. Parent delivery and content/solution integrations remain separate and must not be claimed from an announcement receipt alone.

## Later milestones

Content preparation, broader student management, notes, reports and team follow-up belong to the provisional enhancements direction. Their native interactions and permissions must be reviewed against the app built by then before implementation planning.

Android uses native Kotlin and achieves functional parity with the iPhone companion at the time of the port. Parity means equivalent academic capabilities and rules; it does not require copying the iPhone interface.

## Recommendation and open decisions

Keep this as the companion's product reference. Detailed implementation plans must preserve the settled assignment interactions above; other workflows still need their own interruption, academy-switching, camera and collaborative-edit decisions.

Do not imply offline finalization or automatic answer-sheet recognition. Review any such capability separately. Enhancement workflows remain provisional; the student portal has no new scope in this review.
