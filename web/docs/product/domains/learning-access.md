# Edra — learning access, coupons and playback

Approved by the owner, 2026-10-11; unit access updated 2026-10-21; track/type coupons and prerequisites confirmed 2026-10-24; manager-controlled year learning start confirmed 2026-10-25. Product requirements do not imply implemented delivery.

## Learning access

Students browse the released content available to their current academy placement. A visible unit may still have locked explanation or answer videos. Academy entry, content visibility, explanation access and answer access each have their own purpose.

Confirmed 2026-10-25: student learning in the academy's single open year remains unavailable until an Owner, Head Admin or Admin explicitly starts that year. Booking and verified account connection can happen beforehand; connected students can see the academy and their registration. This applies to all students in that year, regardless of entry through booking or an ordinary invite. The pre-start state is separate from suspension and must be enforced by trusted learning operations, not only by hidden controls.

Starting the year enables only learning otherwise permitted by publication, placement, grants, assessment rules and effective suspension. It does not issue grants, remove suspensions or start, pause or reset grant periods. Staff preparation and grant issuance retain their existing rules and timing; students cannot redeem learning coupons or use protected learning before the year starts. Existing open years retain current availability when the preparation state is introduced; new years begin in preparation. Calendar dates do not automatically start learning.

Explanation access belongs to the student's annual record and the annual content release. It covers the release's explanation videos, so replacing a video asset does not require issuing access again. Reusing material in a later year does not carry over the previous year's access.

## Explanation access and duration

Qualifying finalized attendance, finalized replacement attendance, coupon redemption and manual grants can provide explanation access.

Each unit has a configurable default explanation-access duration, initially seven days. The editor offers 7-, 14- and 30-day presets plus a custom positive number of days; unlimited access is not included. Instructors may configure their own units under the unit-editing rules; managers may configure academy units. Direct staff grants and coupon redemptions use the unit's published default duration; code generation has no duration override. Individual additional time is provided through the separate extension action.

Direct access starts when issued; code-based access starts at redemption. Each issued grant records its duration and expiry so later default-duration edits do not silently rewrite existing access. Confirmed 2026-10-21: unused codes use the current published unit default at redemption, including when it has changed since generation. A later default edit never changes an already redeemed grant's expiry.

Supporting documents require the same active explanation access as the unit's explanation videos, confirmed 2026-10-21. Eligible browsing alone does not authorize document retrieval. Private document links must be issued after current student, publication and effective-access checks; answer material retains its distinct rules.

An attached assignment shows an open action only after the student has current or expired, unrevoked unit entitlement and the assignment's own student visibility checks pass. A never-unlocked or revoked unit shows the assignment as locked. An assignment that cannot be opened under its own visibility/readiness rules remains unavailable even when unit access exists. Expired explanation access does not by itself prevent finishing an otherwise eligible assignment; assessment windows and online participation rules still apply.

The existing attendance-access policy remains seven days from qualifying attendance finalization. Saving draft attendance does not start access. Applying configurable unit durations to attendance-generated grants has not been agreed and is outside the current direct-grant/code delivery slice.

Each grant retains its source, issue time, duration and revocation history. The latest issued grant controls access. Durations are not added together. When that grant expires or is revoked, an older grant does not become active again, even if its original expiry was later.

Issuing a new full-access grant starts its own period rather than adding time to the existing period. A shorter new grant can therefore replace a longer remaining period; staff must be able to see that effect before issuing it. An explicit instructor/manager extension follows the additive rule below instead of resetting the period.

## Extensions and manual grants

A student may activate one self-service 48-hour extension per academy per academic year, applied to one unit they choose. This replaces the earlier allowance of one extension per content release. The selected unit must have previously granted explanation access that has expired; this action cannot unlock a never-accessed unit, extend still-active access or bypass revocation or suspension. The period starts at activation. The annual allowance is shared across that academy's units, not across different academies. Concurrent requests and retries must not consume or issue the allowance more than once.

Owners, Head Admins, Admins and active Instructors may issue direct explanation access and instructor/manager extensions. Full access uses the unit's configured default duration. For an extension, staff choose the additional period: add it to the current expiry when access is active, or start the period at issuance when prior access has expired. Retain the actor, additional duration, original expiry and resulting expiry. An extension is not a new first-access route for a never-accessed unit and does not restore revoked access implicitly.

Instructors may inspect access and issue grants, extensions and unit codes. General access revocation and academy-wide online suspension remain manager permissions; granting these new instructor actions does not grant those administrative powers.

Neither staff nor student extensions reopen assessments or extend their submission and attempt windows. Explanation grants and extensions do not unlock assessment answer material.

## Answer materials

Answer-video access is separate from explanation access. Attendance, coupons and explanation extensions do not unlock solutions.

For assignments, an accepted final online submission unlocks the associated answer videos without waiting for marking. Physical work unlocks them when the student's complete result is announced. All answer videos associated with that assignment unlock together.

An earned answer grant remains available for the rest of the academic year, even after explanation access expires. A qualifying event may be recorded before the content is released; it does not expose draft content.

Quiz solutions release automatically when the quiz's availability window closes; an individual submission does not release them earlier. Released quiz solutions are available only to students with a final quiz submission. Eligibility alone or a saved draft does not grant solution access. Exam solutions follow the same release rule: automatically at availability-window closure, only to students with a final submission. Timer-expired, kicked and window_closed attempts qualify when their saved answers were finally submitted, including automatic submission at actual closure. Students who never started an attempt do not gain solution access merely from eligibility. Neither assignment submission timing nor result announcement releases exam solutions earlier. For physical quizzes and exams, solutions require both an announced physical result and a closed availability window. If the result is announced after closure, solution eligibility starts then; an announcement before closure still waits for the window to close. Staff cannot grant answer access without qualifying work; restoration after exceptional revocation requires that the qualifying work remains valid.

For quiz and exam solutions, availability closure means actual closure after the approved two-minute completion period, not the scheduled closing time. New attempts stop at the scheduled close; existing attempts and coincident individual-timer expiry follow the [assessment headroom rules](assessments.md#quizzes-and-exams). Solutions remain locked throughout that completion period.

## Coupons

A coupon type belongs to one academy and academic year and covers every grade and track. There are no grade- or track-specific types or selectors. Managers (Owner, Head Admin and Admin) create, rename, change prefixes and remove types. Instructors may generate codes from existing types. Types can distinguish differently priced Regular and Revision content without introducing a wallet or payments. A unit accepts its selected academy type; students still need the unit's audience eligibility.

A new unit inherits the coupon type from the most recently published unit in the same academy, academic year, grade and exact track. Drafts and other programs do not affect it. If that publication has no usable active academy type, or no publication exists, use the academy Regular default. Existing units keep their selection.

The editor offers an optional coupon suggestion when the unit title and selected coupon type disagree about revision content. Recognize English revision/review/recap terms and Arabic patterns such as مراجعة and ملخص, comparing coupon names as well as the title. Suggest an available matching type without changing it automatically; the editor may apply the suggestion or keep the current choice.

Each coupon is used once on one eligible unit the student chooses, using that unit's current published default access duration at redemption. Two coupons can unlock two chosen units. Generate coupons from the academy Coupons page rather than binding each new code to a unit. Code generation has no duration override. Preserve the existing academy staff generation/distribution and manager-only unused-code revocation permissions.

New codes contain eight unambiguous uppercase letters/digits with the type's editable two-to-four-letter prefix, such as `REG-AB7K-9M3R`. Regular starts with REG; managers may enter custom prefixes when creating types and edit prefixes later. Each generated batch retains its original prefix, so editing a type does not invalidate printed codes. Redemption accepts lowercase, ignores spaces/hyphens, and accepts the eight-character code without its prefix. When supplied, the prefix must match the original batch. Generate unpredictable codes with collision protection and enforce server-side throttling; denied attempts consume no coupon and disclose no owner.

The owner explicitly approved retiring the old unit-specific code system on 2026-10-24, including deleting all old codes and redemption history. Remove its generation/redemption endpoints, code batches, codes, redemption tables and code-operation retry receipts. Existing access grants, revocations and annual extensions remain intact. Academy invitation and student identity codes are separate and unaffected. This supersedes the earlier decision to leave existing codes untouched. The owner also approved clearing development track/grade coupon batches, codes, redemption history and code-operation retry receipts on 2026-10-25 when switching to academy-only types. Back up these rows first. Preserve existing access grants and immutable publication snapshots; retire their legacy type identities solely for history, and accept academy Regular for those legacy selections until republished.

Redemption requires the student's academy access, current-year participation and audience eligibility. Suspended online access prevents redemption. Academy joining invites/codes and unit-access codes are separate workflows: a unit code neither joins an academy nor creates annual participation. The current academy invite flow remains the existing integration; an additional short joining-code interface is not claimed implemented by this requirement.

Each code can be redeemed once and becomes permanently associated with the redeeming annual student record. A student can redeem only one coupon for a release, including after its access has expired. Further access uses extensions or manual grants rather than another coupon.

Owners, Head Admins, Admins and active Instructors may generate and distribute coupons and inspect redemption state. Manager authority to revoke unused codes remains unchanged; this update does not infer instructor code-revocation authority. Students redeem their own codes; staff do not redeem on their behalf or reassign redeemed coupons. Raw codes and exports remain restricted to authorized academy staff and are not exposed through student browsing.

## Unit prerequisites

An instructor can require that a student previously unlocked a selected unit, and can additionally select specific assignments/quizzes from it. Every selected assessment must have an official submission and also requires previous activation of its source unit; submissions alone cannot bypass that activation. Expired source access counts, while revoked access does not qualify. A unit-only requirement needs no assessment. Draft answers and a score threshold do not satisfy submission requirements. Follow the existing unit ownership and manager-publication workflow: saving working requirements does not change published requirements.

Show only chosen prerequisite units in settings, with their unlock and selected-assessment badges. Add/Edit opens a searchable picker grouped by unit; assessment choices stay collapsed until their unit is opened or an assessment search matches. Units without assessments remain selectable for prior activation. Removing a unit removes its associated assessment requirements. Keep the existing same-academy/year/grade/track eligibility and cycle checks.

The target unit remains visible with its unmet requirements. Block coupon redemption without consuming the code, and apply the prerequisite gate to every new access source, including staff and attendance grants. There is no manager bypass in this version. Preserve separate assessment-window and answer-material authority.

Publishing new or changed requirements preserves already-active access until its recorded expiry. Subsequent grants, redemptions and extensions use the current published requirements. Preserve publication, submission and access history. Dependencies must remain in compatible academy/year/audience scope; self-dependencies and dependency cycles are invalid.

Revoking an unused code prevents redemption. Removing access already granted by redemption is a separate recorded access action. Period coupons, subscriptions and payment-managed access are outside this MVP flow.

## Suspension and revocation

Owners, Head Admins and Admins may suspend or restore a student's online access within their academy. Suspension preserves the student record, participation type, academic history and parent reporting. It does not suspend the student's Edra account or access to another academy.

Archiving annual participation also adds online-access suspension caused by archival. Restoring that participation removes only the archival suspension; an independent staff suspension applied before or during archival remains until explicitly removed by staff. Removing an independent suspension does not remove the archival suspension while the record remains archived. Both actions preserve the account connection and history.

Suspension prevents protected learning access and coupon redemption. Restoring access does not restart grant periods or reset coupon and extension usage; the student's grants retain their original timing.

Managers may revoke explanation access and, for invalid qualifying work, answer access. These actions retain their reason and history. Ordinary attendance corrections do not silently decide revocation; the correction policy must be settled before that workflow is implemented.

Session archival follows the confirmed session rules: already issued learning access remains intact, while pending unprocessed access effects from the archived session are stopped. Restoring the session does not reissue a grant or restart its period. This archival policy does not settle the separate ordinary attendance-correction revocation policy.

Closing the academic year ends its learning access while preserving academic history.

## Video playback

Students watch provider-hosted streamed video through Edra. Playback checks current academy eligibility and the access required by that video, using short-lived authorization. Explanation videos use explanation grants; answer videos use answer grants.

Playback records resume position and learning progress. Video processing and replacement preserve the content release's identity and existing access history. Expired or revoked access and online suspension prevent further playback authorization.

Development provider confirmed by the owner, 2026-10-16: use Mux with signed playback authorization. Store provider asset/playback identifiers and processing status on the trusted backend; authorization is issued after Edra checks the viewer's current access. Provider credentials and playback-signing secrets remain server-only. This is a selected integration, not a claim of implemented or verified delivery.

Production provider economics and DRM remain for review before launch. Signed playback is access control, not DRM or a guarantee against downloading, screen recording or rebroadcasting. Simultaneous-playback behavior and watermark details still require decisions before those protections are implemented. Those decisions must work consistently across the student surfaces that support playback.
