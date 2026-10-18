# Edra — sessions and attendance

Approved by the owner, 2026-10-11. Session archival decisions confirmed 2026-10-13. Other access-correction and cancellation/rescheduling policies remain for their separate reviews.

## Sessions

A session is an actual class started from a schedule. Staff start it when the class takes place; sessions are not created automatically in advance.

Owners, Head Admins, Admins and Instructors may start a session from an active recurring or one-off schedule. The planned weekday and time do not restrict when staff can start it.

A schedule has at most one live session. Starting it again opens the existing live session. After that session ends, staff may start another; there is no one-session-per-day limit.

Session-start retry decisions confirmed 2026-10-17: every successful start or open binds the caller's start key to that academy, schedule and session. Keys are scoped to the actor across academies and retained indefinitely; reusing a bound key for another academy or schedule conflicts. Another actor may use the same key independently.

Retrying returns the original session identity with its current lifecycle, including after manual or automatic ending, archival, restoration, schedule archival or academic-year closure. Current authentication, active staff membership and academy scope still apply. A replay never reopens or restores a session, captures another roster, or opens a newer session. Fresh actions use new keys and remain subject to the ordinary active-schedule and open-year requirements.

Existing original-start keys can be preserved. Keys used only to open an existing session before successful opens were recorded cannot be reconstructed; the retry guarantee for those previously unrecorded actions cannot be restored retroactively.

## Student roster

Starting a session captures the non-archived in-person students who match its group, level or track audience in that academic year. Online-only students do not enter the initial roster automatically.

For mandatory sessions these students are expected to attend. For optional sessions they are eligible to attend.

The roster preserves placement and audience information from the session start. Later student moves, schedule edits or track removal do not rewrite that session's roster.

Authorized staff may add an unexpected attendee from the same academy and academic year, including an online-only student attending in person. This does not change the student's normal participation type or primary group.

## Attendance states

Each student begins as Unknown. Staff can record Present, Late, Absent or Excused, or return an entry to Unknown while reviewing it.

Check-in records positive attendance. A student already Present or Late is not recorded again. An existing Absent or Excused mark requires staff review before it is changed by a check-in.

Staff can check students in manually or using their current academy student code. An optional late threshold marks a check-in Late when it occurs after the configured interval from session start.

Unknown is not an absence. Staff explicitly choose whether to mark unrecorded expected students Absent in a mandatory session.

## Ending a session

Any authorized staff member may end a live session. Ending stops check-ins, but staff can continue reviewing and finalizing attendance while the academic year is open.

Ending does not mark anyone Absent and does not finalize attendance. An ended session is not reopened. Sessions may also end automatically under the session-expiry rules.

## Finalizing attendance

Saving attendance keeps it under review. Finalizing makes the reviewed attendance official and updates attendance reporting, qualifying explanation access and applicable parent communication.

- Present and Late count as attendance and qualify for explanation access to the material recorded as taught.
- Absent counts as an absence for an expected student in a mandatory session and creates the applicable parent absence notification.
- Excused does not qualify for attendance-based access, creates no absence notification and is excluded from attendance-percentage calculations.
- Unknown remains unrecorded and creates no absence notification or attendance-based access.
- Non-attendance at an optional session has no negative attendance consequence or parent absence notification.

Finalization may retain Unknown entries; it does not convert them to Absent automatically. Attendance-based access begins when the attendance becomes official, not when a draft check-in is saved.

## Corrections

Staff may correct finalized attendance while the academic year remains open. The earlier finalized values remain official until the reviewed correction is finalized.

Each finalization preserves the official record it established. Reports reflect the latest official attendance, with its correction history retained. Finalizing unchanged attendance does not repeat the same official effects or messages.

Changes that withdraw an earlier qualification for learning access follow the separately reviewed access-correction policy.

## Replacement attendance

A student may attend another session to cover material missed in their expected session. Staff record the attendance and the material covered by the replacement.

Finalized replacement attendance resolves only the missed material actually covered. It qualifies for the corresponding explanation access and produces the applicable parent update.

The original absence and both attendance events remain in history. “Attended through replacement” is the status of the resolved missed material, rather than a replacement for the original session's absence mark.

## Permissions and history

Owners, Head Admins, Admins and Instructors can review attendance, record it, finalize it and make ordinary corrections within the academy.

Closed-year attendance is read-only. Sessions, roster snapshots and official attendance are preserved rather than deleted. Cancellation, rescheduling and exceptional repair require their separately agreed workflow rules.

## Session archival and restoration

Owners, Head Admins and Admins may archive a mistaken session or one whose attendance should not count. Instructors may inspect its preserved history but do not archive or restore sessions. Archival and restoration are current-year management actions; closed-year academic records remain read-only.

Archiving a live session ends and archives it together. It stops check-ins without marking anyone Absent or finalizing draft attendance. Archiving an ended session preserves its original end information. The academy may start a new session from the schedule using the ordinary start flow.

An archived session is excluded from ordinary live/history lists by default. Staff can find it through an archived-session filter and inspect its roster, attendance and finalization history. Archival never deletes those records or changes stored attendance marks.

Archived sessions do not contribute to attendance totals, rates, absence counts or derived attendance summaries, including when their attendance was already finalized. Historical inspection identifies the session as archived and excluded; it must not present its marks as counted attendance.

Archived sessions are read-only for attendance entry, check-ins, finalization and corrections. Restoring a session removes its archive exclusion and makes its existing finalized attendance count again. Its drafts remain drafts, and ordinary ended-session attendance review becomes available while the year is open. Restoration does not reopen the session or permit check-ins.

Archival preserves learning access already issued from that session and the history of parent messages already sent. Pending, unprocessed access or parent-message effects from the archived session are stopped rather than delivered later by a background consumer. An external request already sent to a provider cannot be recalled; its actual outcome remains in delivery history.

Restoration is not another attendance finalization. It does not issue the same access again, restart an existing access period or resend previous messages. Any future processing of effects must retain their original identity and honor the session's current archival status. Archive/restore actions retain who performed them and when, independently of the preserved attendance history.
