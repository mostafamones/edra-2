# Edra — assessments, marking and results

Approved by the owner, 2026-10-11. Unresolved type-specific rules and implementation follow-ups are in the separate planning review notes.

## Assessments

Assignments, quizzes and exams let an academy set student work, review it and record performance. Each belongs to an academy and academic year and targets a level, a level and track, or selected groups.

Assessments have their own instructions, required work, marking scheme and student results. Quizzes and exams retain their own availability and attempt rules; assignment behavior is not automatically applied to them.

Once work begins, the assessment's configured target level, track or groups are locked. Staff cannot change that target audience through ordinary editing. The approved optional late-joining assignment eligibility, end of unfinished requirements after individual placement changes, and academy-wide track-removal rules still apply; those do not grant a general audience-edit override.

## Assessments and content

Assignments, quizzes and exams may each be attached to at most one content unit in their academy and academic year, or remain unattached. Multiple units cannot simultaneously reference the same assessment. Attached assessments become part of the released unit's learning experience. Staff can record physical work, mark and announce results independently of when its online content is released.

Assignments can also stand alone and be attached later without losing recorded work or marks. Once an attached assessment has work in progress or recorded work, its existing content-unit attachment is locked: staff cannot detach it or move it to another unit. This does not prevent the approved first attachment of a standalone assignment that already has work or marks.

Exams can be fully standalone and available to students through their own assessment flow, without a content unit or content release. Attachment to a content unit is optional; an exam after a revision unit is one example of that use.

Attachment compatibility, confirmed 2026-10-13: an assessment and its content-unit release must belong to the same academy and academic year, and the released unit's audience must cover the assessment's entire configured audience. Attachment does not broaden assessment eligibility or remove its availability rules. Standalone exam access remains supported.

## Required work and late eligibility

An assignment's initial required-student list is established when staff first save a valid target audience. It does not wait for content release or a separate assignment Publish action, so standalone physical work can proceed. Saving incomplete preparation without a valid audience does not establish that list.

Required-cohort maintenance, confirmed by the owner, 2026-10-19: routine saves do not refresh that list. If staff deliberately change the configured target audience before any work begins, reset the required-student list to the students matching the new audience at that change. Subsequent matching students are optionally eligible under the late-joining rule. Once work begins, the ordinary audience lock still applies.

Existing-assignment transition, confirmed by the owner, 2026-10-19: preserve each existing assignment's currently stored recipients as its required cohort rather than attempting to reconstruct an earlier first-save roster. Later matching students are optional unless an allowed deliberate audience change resets the required cohort. Preserve all recorded work, marks and official results.

Students who join the targeted level, track or group after the initial required-student list was established are automatically eligible to submit that work, but it is optional for them. Staff do not need to add them individually. The academy may encourage completion; not submitting does not count as missing or overdue work for those students.

Eligibility to submit is distinct from being expected to complete the assignment. Late eligibility still follows content visibility and submission blocking. This rule does not convert the original students' expected work into optional work.

If an authorized staff placement change moves a student out of the assignment's targeted group or track, their unfinished-work requirement ends. Preserve any answers, marks and announced results. Continued submission still requires the applicable audience/content access. Students cannot change their own academy track.

## Physical and online assignment work

An assignment can accept both physical and online work. How questions are distributed does not determine how answers are submitted.

In-person students' online submissions are disabled by default. An academy setting may enable them. Their participation type remains in-person when they submit online.

## Assignment parts and scoring

An assignment contains one or more ordered parts. Different parts may use different submission types:

- **Question Sheet:** questions and choices are included in Edra. Online students answer them in the app; instructors can enter selections from the corresponding physical work.
- **Answer Sheet:** questions are supplied separately. Online students or instructors enter selections for the numbered questions configured in Edra.
- **Written Work:** students supply written answers as documents, photos or physical work, which instructors review and mark manually.

Each part has a marking scheme specifying marks per question. The effective part maximum is the sum of its non-excluded question marks; the effective assignment maximum is the sum of its parts. Marks cannot exceed the applicable maximum.

Multiple-choice answers can be marked automatically. Work needing judgment is marked by staff. Staff can refer to model answers, answer documents and solution videos while reviewing work.

## Locked structure and question exclusions

For assignments, quizzes and exams, once student answering or staff answer/mark entry begins, the assessment's question and part structure is locked. Staff cannot add, remove or replace questions, change part types, or rewrite question/answer content through an ordinary edit. Scoring corrections use a controlled correction flow rather than structural editing. A mistaken correct-answer key can be corrected without changing question text, choices or student answers. These correction and exclusion rules apply to all three assessment types. The backend recalculates affected scores from the stored answers using the corrected key; instructors do not need to reopen and manually remark each student's work. Staff marking views use the corrected key.

Key corrections recalculate results privately, preserving prior official results until staff announce the corrections. Staff may announce affected complete corrections as a batch without a mandatory student-by-student review. Automatic recalculation is distinct from automatic result announcement.

A question may be excluded when it should not contribute to the assignment. Exclusion preserves the question, its position, submitted answers and recorded marks; it does not delete them. The marking scheme displays the question as excluded and faded. Original question numbers remain unchanged; excluding question 13 does not renumber question 14.

Excluded questions carry no scoring weight: their marks and maxima do not contribute to effective part or assignment totals. They do not require marking for result completeness. Exclusion is a scoring correction, not permission to alter the remaining structure. Preserve the prior scoring basis in existing official result history.

For quizzes and exams, reject an exclusion that would leave the assessment with no scored questions. Do not create an all-excluded assessment, fabricate a percentage or announce an invalid result. This guard does not authorize question reinstatement or arbitrary scoring-weight edits.

The online student answering flow skips excluded questions and does not allow them to be answered. For example, Next from question 12 goes to question 14 when question 13 is excluded. This changes participation in the assessment, not the numbering or retained historical answers.

Exclusion recalculates affected marks and effective maxima privately. Previously announced scores and maxima remain official until staff review and announce the correction. Exclusion does not automatically announce revised results, including results originally announced by automatic grading.

Assignment fast-mark corrections, confirmed by the owner, 2026-10-19: when an exclusion changes a part's maximum and its current mark was entered only as a fast part total, that part requires manual re-marking. Do not infer per-question scores, prorate the total or silently clamp it to the new maximum. Preserve the earlier official result and the prior private mark as history. The affected revised result cannot be announced until the required re-marking is complete.

## Instructor entry of physical answers

Students may complete the same assignment online in Edra or physically in a workbook. For physical multiple-choice work, the instructor enters the answers the student selected, and Edra scores and records them using the configured correct answers and question marks.

The instructor's answer-entry flow is the same whether the questions were authored in Edra or supplied separately. It presents question numbers and answer options for entry; the instructor does not need to open the question text or read the full choices to transcribe answers from the workbook.

The distinction between those part types matters to authoring and the online student experience, not to physical answer entry. Online students see the authored questions and choices when those are included in Edra. Instructors entering physical work use the same compact answer-entry interface for both types.

Written physical work is reviewed by the instructor, who enters its marks. Recording physical answers or marks does not itself announce the student's result; the result follows the reviewed announcement rules.

## Work and submission

Students can prepare online answers as drafts. Explicit final submission records the received work. Saving a draft does not submit it or expose a result.

Staff can record and mark physical work without an online submission. Recording work and recording its result are distinct from releasing learning content.

An assignment may have an optional due date. Passing it makes later submissions late; it does not automatically reject them or close marking. Staff may block new work deliberately. Blocking prevents new student online submissions and new staff-recorded physical work. Work already received remains available for marking, complete result announcement and corrections. Blocking also prevents final submission of an online draft saved before the block; preserve that draft so the student can resume and submit after reopening. Do not treat a saved draft as received final work merely to bypass the block.

For assignments, Closed means submissions are blocked under these rules, not that received work becomes unmarkable. It is the same control, not a separate Blocked state. Staff may still mark received work, announce complete results and issue corrections. Reopening permits submissions again while preserving existing drafts, received work and official history; per-student result/source locks still apply.

The assignment flow supports one final online submission per student, rather than repeated attempts. Retakes belong to the separately defined quiz or exam rules.

Once the student's result for the assignment is announced, the student's online answering/submission interface is locked or faded and cannot accept further online work. Saving physical draft answers or marks does not by itself lock that student interface.

Once the student saves an online answer draft, staff cannot make a separate instructor submission of physical work for that student and assignment. Opening the assignment without saving answers does not create this restriction. The student can leave and return to continue the same online draft, including after several days, while submissions remain permitted and no result has been announced.

A saved online draft is not a final submission or an announced result. Staff review and marking of received online work remain governed by the assessment rules. Result/interface locking does not itself revoke earned answer-video access.

If staff have already saved physical draft answers or marks without announcing a result, and the student then saves an online draft, the online work becomes the active work source. Preserve the earlier physical draft as history; do not mix its answers or marks into the online result. Staff can review and mark the received online work under the normal rules.

The saved-draft and announced-result rules replace the earlier route commitment at online opening or first physical save. Source transitions preserve history rather than silently overwriting work.

## Marking and announcement

A blank mark means the work is not marked yet. Zero is a recorded mark.

Staff may save and revise marks and feedback privately. A manually reviewed result is announced only when all its required parts are complete. Results can be announced for one student or a selected group without waiting for every student in the assessment.

When an accepted online submission is fully automatically marked, its complete result is announced automatically. If any part needs manual review, none of that student's part results is exposed until the required review is complete.

Announced results are the official marks shown in student performance and parent reports, with the applicable parent communication. Answer-material access follows its own submission/result rules and does not imply that draft marks are visible.

## Corrections and history

Staff may mark more students and correct existing marks after results have been announced. Saved corrections remain private until announced; the previous result stays official in the meantime.

Announcing a changed result preserves the earlier official record and produces the applicable correction communication. Announcing unchanged information does not create another result event.

Assessment changes preserve recorded work, scoring meaning and official results. Archival retains academic history. A closed academic year makes academic work read-only.

Active assignments targeting a removed track become level-wide; closed assignments retain their original identity. Recipient changes and submission eligibility follow the reviewed audience workflow.

## Staff permissions

Owners, Head Admins, Admins and Instructors may prepare assignments, record work, mark, add feedback and announce complete results.

Owners, Head Admins and Admins manage submission availability and archival. Locked structure applies to all roles. Only Owners, Head Admins and Admins may correct the shared answer key or exclude questions after work has begun, for assignments, quizzes and exams. Instructors retain ordinary marking and announcement permissions, including announcing complete recalculated corrections; they cannot change the shared answer key or exclusion rules. No role may bypass scoring maxima, result completeness or history-preservation rules.

## Labels

Confirmed by the owner, 2026-10-29. These are approved requirements, not a statement of implementation or deployment. The UI reference is the current `ui/unified-assessments-view` Assessments area, including its row/card context menus and existing Filters and View options controls.

Assessments are the first integration of the shared [Labels](labels.md) feature. Assignments, quizzes and exams use the academy's label catalog; each assessment may have multiple labels. The shared reference owns label definitions, management permissions, global changes, deletion and palette behavior. Labels for students and other modules are planned for later deliveries.

All active academy staff, including Instructors, may apply and remove existing labels through a Labels submenu in each assessment row/card context menu. This remains permitted for archived assessments and assessments in closed academic years. Labels are organizational metadata: their changes do not change assessment preparation, audience, availability, submissions, marking, official results or academic history. Other academic read-only rules remain in force.

Only Owners, Head Admins and Admins may create, rename, recolor or delete label definitions. Managers open the same label editor popover from either a label-icon button beside the existing Filters and View options buttons or a Manage labels entry in the context menu's Labels submenu. Both management entry points and the editor itself are hidden from Instructors. The toolbar entry remains available when there are no assessments. Label assignment does not require opening an assessment form or quick-edit sheet.

Global label changes also update archived and closed-year assessments. Deletion and its conditional confirmation follow the shared [label rules](labels.md#changes-and-deletion), preserving all assessments, academic work and results.

Display colored labels in both Table and Cards views. Add label filtering to the existing Filters popover; multiple selected labels match any selected label, with an Unlabeled option. Label filtering combines with the current type, search, audience and status filters and preserves the unified list's URL state, reset, return navigation, sorting, grouping and pagination behavior. Label changes apply across years without expanding which academic years the unified list displays.

## Student web assignment flow — EDRA-81

Confirmed during owner shaping, 2026-10-22, with conflict and photo-format decisions settled 2026-10-23. These are approved product requirements, not a statement of deployment.

### Discovery and authority

Each connected academy's student area has an Assignments page and assignment detail pages. List standalone assignments and assignments attached to a published content unit the student's placement matches; attached assignments are also reachable from that unit. Unpublished unit attachments are not exposed, and a working attachment does not change a standalone assignment's access. Listing or opening an assignment does not create a draft, select the online work source or start any timer, and exposes metadata and action state only.

Saving or submitting attached work requires a current or expired, unrevoked explanation grant for that unit; current playable explanation access is not required. A revoked current grant does not fall back to an older grant. Standalone assignments have no unit-access requirement. Ordinary session authority, linked unsuspended annual participation, the open academic year, the assignment's current audience, readiness, closure and source/result locks are enforced at the trusted boundary. Optional late eligibility and placement exits follow the rules above. In-person students submit online only when the academy's manager setting enables it (off by default); their participation type is unchanged.

### Answering and drafts

Show the instructions and one part at a time with all of that part's questions, and a part navigator. Question Sheet parts show authored prompts, choices and images; Answer Sheet parts show question numbers and choice letters. Written Work parts accept files only. Excluded questions are skipped without renumbering. No keys, correctness or private marks are shown while drafting.

Choices autosave. Distinguish pending, saving, saved and failed states. Pending choices and an uncertain save stay on the device for the signed-in account, annual record and assignment until the server acknowledges them, and recover after refresh. Local data never bypasses closure, revocation, suspension, source locks or year closure, and is cleared on sign-out, account change and final submission.

Only one tab or device edits at a time. A second one sees that the assignment is open elsewhere and may explicitly continue there, which moves editing authority and stops the earlier editor's writes. Pending work from a stale editor is never replayed automatically under the new editor. When this device's unsaved choices differ from newer saved work, each affected question shows both answers with "Use saved answer" and "Use this device's answer"; choices that match are dropped. Unresolved differences stay on the device until resolved, sign-out or final submission, and block final submission.

### Written Work files

Each Written Work part accepts up to 20 files of up to 8 MB each: PDF, JPEG, PNG, WebP and HEIC/HEIF photos. Files are checked by their content, not their name or browser type. Uploads show individual progress and failures with retry and remove; only files the server has accepted count. A file whose upload did not finish must be removed or selected again. Accepted files stay private; staff open them from the marking view through short-lived links, with PDF, JPEG, PNG and WebP previewed in the browser and HEIC/HEIF downloaded.

### Submission, results and answer videos

One Submit assignment action opens a confirmation with the unanswered-question count and late status. Blank choices are allowed. Every Written Work part needs at least one accepted file, and unfinished uploads and unresolved answer differences must be dealt with first. Submission is one atomic, retry-safe operation; a lost response recovers the receipt without reopening editing.

After submission the student sees the receipt (submission time, late status) and, once announced, the official total, maximum and feedback, without submitted answers, files or per-part marks. Fully automatic work announces its result immediately; work with Written Work waits for staff review and announcement.

An accepted online submission unlocks the assignment's answer videos immediately; physical work unlocks them when its complete result is announced. Answer videos stay available after explanation access expires. Owners, Head Admins and Admins may revoke answer access for invalid qualifying work and restore it while that work remains valid, each with a reason kept in history.

## Quizzes and exams

Question visibility, confirmed by the owner, 2026-10-19: a student may receive quiz or exam questions and choices only after starting their own online attempt or qualifying for released solutions. Before either condition, return overview and timing information without question material. Physical draft work or a confirmed physical submission alone does not reveal questions before solution qualification. This visibility rule does not start a timer on a read, create another attempt, extend a deadline, release answer keys early or expose private marks. Normal identity, academy/year, suspension and content-access authority still applies.

Question marks and written-work shortcuts, confirmed 2026-10-17: quiz and exam question maxima use whole or half marks only, such as 2 or 2.5, not 2.25. Awarded written-work marks may include quarter marks: half credit for a question worth 2.5 is exactly 1.25, with no rounding.

Each non-excluded written-work question in the web marking view offers quick actions for zero (cross), half credit (½) and full credit (tick), alongside manual mark entry. These actions fill the question's mark field; they do not save or announce it. Normal private saving, explicit announcement, permissions and mark limits still apply. These requirements apply to quizzes and exams only.

Web editing reliability, confirmed 2026-10-17: an answer-key correction or exclusion stays tied to the scoring information the manager reviewed. If that information changes elsewhere, retain their selection and require deliberate review of the latest information before a new correction. Successful private mark/feedback saves clear the saved changes, including equivalent decimal spellings such as 2.00 and 2, while preserving edits made during the save. A changed scoring basis requires deliberate review. Background refresh must preserve unsaved availability entries; staff may explicitly discard them and load the latest window. Reopening a clean availability dialog shows the latest saved window. Retrying an uncertain correction or private mark save repeats the original operation rather than silently creating a new one. These rules do not bypass current permissions, year closure, archival or actual availability closure.

Confirmed by the owner, 2026-10-13: Owners, Head Admins and Admins control quiz and exam availability windows and archival. Instructors may prepare assessments, record physical work, mark and announce complete results, but cannot manage availability or archival. All roles remain subject to structure locks, closed-year read-only rules and history preservation.

Quiz and exam submission eligibility follows the student's current matching academy/year placement while the availability window is open. Students joining the configured level, track or groups during that window are eligible; there is no assignment-style required/optional cohort. Moving out of the configured audience ends eligibility for new work without deleting existing answers, accepted work or official results. The configured target audience itself remains locked once work begins, and attached online work still requires the applicable released-content access.

Availability headroom, confirmed 2026-10-13: use a two-minute completion period after the scheduled closing time. Stop new online attempts at the scheduled closing time; already started attempts may continue until their original individual timer expires or the completion period ends. The actual availability window closes, and solutions release, at the end of that completion period. Individual timer expiry at the scheduled close, within the completion period, or exactly at actual closure wins and automatically finally submits the saved answers. Otherwise actual closure automatically finally submits whatever answers the unfinished online attempt has saved and marks the submission as window_closed. Preserve the attempt and saved work; do not discard them. Record and display actual window closure and final submission times plus the finalization reason. This is accepted submitted work for normal grading and solution eligibility, not an automatic zero or invalidation. An eligible student who never started an attempt does not acquire a submission merely because the window closed. The original individual deadline is never extended; an untimed quiz may continue only until actual closure. Recovery resumes the same unfinished attempt under those deadlines. Stop new physical final submissions at actual closure while retaining marking and correction of accepted work. References below to availability-window closure mean this actual closure, not the scheduled closing time; this headroom rule supersedes the earlier strict timer-before-closure wording at a coincident deadline.

Quizzes and exams support Question Sheet and Written Work parts only; they do not support Answer Sheet parts. Physical instructor entry and student online work use a simple first-final-submission-wins rule. Both routes may remain available until the student finally submits online or the instructor confirms completed physical entry. That first final submission locks the other route, even while manual marking or result announcement is pending. Do not use the assignment-specific online-draft/physical-draft source-transition workflow or a competing-source selection process for quizzes or exams. Marking and corrections of the accepted work remain available under their normal rules. Once a quiz or exam availability window closes and solutions are released, that assessment cannot reopen for new submissions. A later sitting uses a separate assessment; the original attempts, work and results remain preserved. For physical quiz/exam work, solution access requires both announcement of the student's result and closure of the assessment availability window. Satisfying either condition alone does not release solutions. Their physical questions are handed out to students and the completed work is returned for instructor correction/entry, or students answer online in Edra. Assignments retain all three part types.

The Answer Sheet part type (questions supplied separately with numbered answer entry) is distinct from the internal correct-answer key used to grade a Question Sheet. Correct-answer keys and their approved correction/regrading rules remain supported.

Quizzes provide shorter checks of learning. Online quizzes allow exactly one attempt per student, with no ordinary retakes. Staff may configure an individual time limit before students begin. When configured, the attempt deadline is the earlier of the student's individual deadline and the quiz availability-window closure; a time limit is optional, not required for every quiz. Quiz solutions, including correct answers and answer videos, release automatically when the quiz's availability window closes, rather than immediately after an individual submission. Solution release is separate from result announcement. Only students with a final quiz submission receive the released solutions; students who did not finally submit do not gain solution access merely because they were eligible for the quiz. At actual availability-window closure, Edra finally submits the unfinished attempt using whatever answers were saved and flags the submission as window_closed. Preserve saved work and display the actual closure/submission timestamps and reason. Grade the submitted work normally; the flag does not assign zero or invalidate it. The final submission qualifies for solutions at actual closure. If the configured individual timer expires at or before actual availability closure, Edra automatically makes the final submission using the saved answers, including when the deadlines coincide. This counts as a final submission for solution access when the window later closes; it does not release solutions early. Result calculation and announcement follow the applicable quiz grading rules. After refresh or connection loss, the student may resume the same unfinished quiz attempt while its deadline remains open. Restore saved answers and preserve the original deadline and departure/warning count. The clock continues through interruption; reconnection does not create another attempt or grant extra time. Expired or already finalized attempts cannot be reopened by reconnecting. Exams provide formal assessment with their own student availability and attempt flow. Online exams allow exactly one attempt per student, with no ordinary retakes. Every online exam requires a staff-configured individual time limit, set before students begin. The attempt ends at the earlier of the individual deadline and the exam availability-window closure. If the individual timer expires at or before actual availability closure, Edra automatically submits the saved answers, including when the deadlines coincide. If actual availability closure ends unfinished work, Edra finally submits whatever answers the attempt has saved and flags it as window_closed. Preserve the work and show actual closure/submission times and reason. Grade the accepted submission normally; window closure is not an automatic zero or invalidation. Exam solutions release automatically when the availability window closes and only to students with a final submission, independently of result announcement. Timer-expired, kicked and window_closed attempts whose saved answers were finally submitted qualify. Students who never started an attempt do not gain solution access merely from eligibility. This rule does not authorize staff to reset or reopen a finalized attempt; any makeup-exam flow requires its own scope. Staff can prepare them, review physical or online work and announce results.

After refresh or connection loss, the student may resume the same unfinished exam while its deadline remains open. Restore saved answers and retain the original deadline and departure count; the clock continues through interruption. Reconnection gives no extra time or new attempt and cannot reopen submitted, expired or kicked work.

Online exams use strict attempt conditions intended to keep students within the assessment experience. Web exams require fullscreen where the platform supports it. Exiting fullscreen counts as an exam departure under the same first-two-warnings and third-departure submission/kicked policy; it is not a separate violation allowance. Unsupported-platform behavior must be verified and specified during implementation planning. Online quizzes also use controlled attempt conditions, with a less strict policy than exams. Leaving the assessment tab or switching away from the app gives a warning first rather than immediately ending the attempt. For online quizzes, the second departure ends the attempt and automatically submits the saved answers; it does not discard the work or create another attempt. That final submission qualifies for quiz solutions when availability later closes. Exams use their own departure policy. A departure that does not yet end the attempt logs the current question and advances to the next non-excluded question. On return, the student continues there and may revisit the skipped question; departure does not erase its saved answers or permanently lock it. The first two departures warn and apply this log-and-advance behavior. The third departure reaches the ending limit.

On the third exam departure, Edra ends the attempt, submits saved answers for marking and flags the attempt as kicked. The flag is distinct from its score: it does not automatically invalidate submitted work or assign zero. The finalized attempt is not reopened by returning to the tab/app.

Staff can distinguish completed attempts from attempts ended or invalidated under those conditions when reviewing work and results. Attempt status does not silently become an announced numerical score; the scoring and result policy determines how it is treated.

For quizzes and exams whose final submission can be fully graded automatically, the complete score is announced immediately on final submission. This includes automatic submissions caused by individual-timer expiry, the applicable departure limit or actual window closure. Correct answers and solution videos remain locked until the availability window closes. A submission requiring manual marking remains private until complete staff review and announcement. Later answer-key corrections and exclusions still follow private recalculation and explicit staff correction announcement.

The exam-specific student web flow is confirmed in the following section. These controls do not change the separation between received work, private marking and official results.

## Student web quiz flow — EDRA-82

Confirmed during owner shaping, 2026-10-23: each connected academy has a student Quizzes page covering standalone and eligible attached quizzes. Published units also link to their attached quizzes through the same quiz flow. Reuse the unit browsing/detail integration rather than creating a second unit browser. Normal account, academy/year, audience, publication, suspension and quiz availability rules still apply.

Starting, saving and explicitly submitting an attached quiz require a current or expired, unrevoked explanation entitlement for its published unit. Current video access is not required; published-unit visibility alone is insufficient. Standalone quizzes do not require unit entitlement. These participation gates do not prevent authoritative deadline/departure settlement of already saved work under the quiz rules.

Show one question at a time with Previous/Next and a numbered navigator. Students may revisit questions; skip excluded questions without renumbering or deleting their historical answers. The existing first-departure warning logs the current question and advances to the next non-excluded question; the second departure finally submits saved work.

Online Written Work supports typed answers plus PDF/photo uploads, with at most two files per Written Work question and 8 MB per file. A question may have text, files or both. Automatic timer, departure-limit or actual-closure finalization preserves server-accepted work; unfinished uploads must not delay finalization or add files to an already accepted submission.

Quizzes do not require fullscreen. Count a departure when the active quiz becomes hidden through tab/app switching or minimizing, or on a detected refresh/page close. Visible window-focus loss alone does not count. Correlate lifecycle signals from the same departure instead of counting them separately. Browser lifecycle detection is best effort; network loss or an unreported crash alone must not invent a departure. A warning preserves answers and the original cutoff; returning after the second-departure finalization cannot reopen work.

Only one tab/device may actively answer an attempt. A second editor is blocked while the first is active, with no takeover action. Legitimate refresh/reconnect recovery after the previous editor is gone resumes the same attempt and retains its original timer/cutoff and departure count. Enforce editor ownership on trusted answer/upload/submission operations.

Autosave choices and typed answers, retain pending changes locally across refresh for the authenticated account and attempt, reconcile them against the latest acknowledged work, and retry before cutoff while authorized. Clearly distinguish pending local edits from server-saved work. Do not overwrite newer acknowledged answers, replay another account's pending data or extend the original cutoff. Only server-accepted answers and completed, acknowledged uploads count at finalization.

Submit quiz opens explicit confirmation with a warning about unanswered questions; blanks do not prevent submission. Before explicit submission, acknowledge pending answer saves and either complete the pending uploads or let the student explicitly cancel those uploads. Cancellation must not silently discard an already acknowledged answer/file. A running timer/cutoff remains authoritative during confirmation and uploading; automatic finalization never waits for pending work.

After final submission, show the receipt and officially published total/max and feedback only, without submitted-answer review before solution qualification. Once solutions qualify at actual closure under the existing online/physical rules, add review of the winning immutable submission's answers and files, correct/model answers and eligible answer videos. Do not reveal a losing online draft when physical work won. Student results remain total-only, without per-part/per-question mark breakdowns or private/unannounced corrections, including after solution release.

EDRA-82 includes actual protected quiz answer-video access and playback through the existing media system, alongside key/model/text solutions. Publication, academic-year, suspension and answer-revocation rules still apply. Earned answer access is distinct from explanation entitlement expiry; eligibility for or receipt of a quiz is not early access to solutions. These are agreed product requirements, not implemented or deployed capabilities.

## Student web exam flow — EDRA-83

Confirmed during owner shaping: deliver standalone exams first, independently of content-unit delivery. Content-attached exam access remains a separate coordinated integration. These are approved product requirements, not a statement of implementation or deployment.

### Discovery and entry

Each connected academy's student area has an Exams page. Show available and upcoming exams matching the student's audience, plus exams the student previously participated in; hide closed exams they never participated in. This discovery rule does not bypass identity, suspension or other access authority. Upcoming exams expose overview and timing information, never question material.

The exam overview shows instructions, duration and availability. One explicit Start exam action requests fullscreen and starts the server-timed attempt only after fullscreen succeeds; no additional start-confirmation dialog is required. Opening the overview never starts the timer. An unfinished attempt offers Resume exam, preserving the original deadline and departure count.

### Answering and recovery

Show one question at a time with Previous/Next and a numbered question navigator. Students may freely revisit questions. Skip excluded questions without renumbering. Submit exam opens a confirmation showing the unanswered count with actions to return or submit; unanswered questions do not block submission.

During connection loss, students may edit already loaded questions. Clearly distinguish pending local answers from server-acknowledged saved answers. Persist pending answers for the authenticated account and attempt across refresh or accidental page close in the same browser, recover and retry while authorized, and clear acknowledged entries or remaining pending data on finalization or sign-out. Recovery must not overwrite newer acknowledged work. The original timer continues; only answers accepted by the server before finalization count. Local persistence does not extend deadlines or reopen work.

Only one tab/device may actively answer an attempt. Block a second editor while the active editor exists; there is no takeover flow. Enforce editor ownership at the trusted mutation boundary. Legitimate recovery after refresh, closure or connection loss resumes the same unfinished attempt without allowing competing editors or stale-editor writes.

### Fullscreen and departures

Browsers/devices without the required fullscreen capability cannot start or resume answering; show an actionable unsupported-browser status while keeping the overview and permitted results accessible. Verify actual browser capabilities during implementation. Failed or cancelled initial fullscreen acquisition must not start an attempt.

Count a departure when the active exam becomes hidden through tab/app switching or minimizing, or when fullscreen is exited. Window focus loss alone while the page remains visible does not count. Count a detected refresh or page close once, deduplicating associated fullscreen and visibility signals from the same departure. Browser lifecycle signals are best effort; an unreported crash or network outage alone must not manufacture a penalty on recovery.

Preserve the existing first-two-warnings, question logging/advancement and third-departure submission rules. After a counted fullscreen exit below the ending limit, pause answer editing behind an explicit Return to fullscreen action while the original timer continues. Recovery retains the same attempt and departure count; it does not create a fresh allowance.

### Submission, results and solutions

Use the same exam detail page for submission status, published results and eligible solutions. After final submission and before that student qualifies for released solutions, show submission status and any officially published result only; do not expose question/answer review. This narrows post-submission review beyond the general own-attempt question gate above. Enforce the review restriction in trusted projections as well as the UI.

Once solutions are available to the student under the existing qualification rules, reveal the answer-review view and eligible solutions. Result announcement and solution release remain separate. Show the officially announced total score only, without per-part or per-question awarded/max mark breakdowns, including after solution release. Private marks and unannounced corrections remain hidden.

When a corrected total is officially announced, show the current total with a Corrected status and correction date. Do not add a student result-revision-history view; preserve official history in storage. Timer, kicked and window_closed submissions retain their normal grading and solution qualification; their flags do not automatically assign zero or invalidate work.

## Exam staff delivery boundary — EDRA-78

Confirmed by the owner, 2026-10-14: EDRA-78 delivers the staff exam workspace and trusted exam backend. Student account-to-annual-record linking, content releases and video delivery remain separate integrations. The exam backend defines their integration contracts; their absence must not prevent staff physical entry, marking or announcement. Standalone online exams do not require content release, but still require authoritative student identity and the separately implemented student flow.

The initial staff delivery supports text answers and physical marking. Document/photo evidence, answer-document assets and solution-video integration are deferred; these remain product requirements rather than implemented capabilities. Do not describe text-only review as document/photo support or a solution-qualification event as delivered video access.

Staff may save physical drafts and confirm physical work once exam preparation is ready, including before the online opening time or before an online window has been configured. Actual closure stops new physical work and final confirmations; accepted work remains available for marking, announcement and corrections. Physical entry remains subject to current academy/year audience eligibility, authority, source acceptance and the normal preparation/history locks.
