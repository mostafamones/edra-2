# Edra — notes

Pre-approved working draft, 2026-10-11. The owner will re-review it with the master thread before implementation planning. Recommendations and open decisions are not final implementation requirements.

Staff use notes to record observations, feedback and information relevant to a student or their academic activity. A note has one subject: an annual student record, a session, a submission or a result. Its subject provides context; visibility determines who can read it.

Each note has one explicit visibility:

- **Staff-only:** available to authorized academy staff.
- **Student-visible:** shared with the relevant student audience.
- **Parent-visible:** shared with the relevant parent audience and included in the applicable parent report.

Notes default to staff-only. Choosing a subject does not automatically share a note with students or parents. Parent-visible does not implicitly mean student-visible.

### Sharing and corrections

Staff may prepare outward-facing notes privately before sharing them. Sharing a parent-visible note makes its approved text available in the report and creates the applicable parent message. Student-visible notes appear in the relevant student context when shared.

An edit to a previously shared note remains private until the correction is shared. The previous shared version remains visible in the meantime. Sharing a changed note preserves the earlier version and records the correction; sharing unchanged text does not send another message.

Retraction removes a note from its outward-facing view while retaining its history. It cannot erase messages already delivered. A shared note with external effects is not hard-deleted.

### Staff permissions

Owners, Head Admins, Admins and Instructors may create notes with the supported visibility options. Instructors may edit and share corrections to their own notes, and delete their own unused drafts. Managers may manage other staff members' notes and unused drafts.

No role may use note visibility to expose another student's private information. Session-level notes require an explicit audience rule before they can be shared outside staff access.

## Recommendation and open decisions

Keep the three visibility options and explicit sharing for outward-facing notes. For session notes, I recommend explicitly selecting recipients rather than automatically sharing with the whole class.

Settle session-note recipients, whether combined student-and-parent visibility is needed, and who may retract shared notes. The draft retains three separate visibility values; it does not introduce a combined option.

For a withdrawn parent note already delivered, I recommend a short withdrawal message. Its exact wording and retry policy remain open.

Evidence: existing note glossary, PAR invariants, permission matrix and Linear EDRA-164/165. No runtime or cloud verification.
