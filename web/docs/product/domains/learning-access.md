# Edra — learning access, coupons and playback

Approved by the owner, 2026-10-11; unit access updated 2026-10-21; track/type coupons and prerequisites confirmed 2026-10-24. Product requirements do not imply implemented delivery.

## Learning access

Students browse the released content available to their current academy placement. A visible unit may still have locked explanation or answer videos. Academy entry, content visibility, explanation access and answer access each have their own purpose.

Explanation access belongs to the student's annual record and the annual content release. It covers the release's explanation videos, so replacing a video asset does not require issuing access again. Reusing material in a later year does not carry over the previous year's access.

## Explanation access and duration

Qualifying finalized attendance, finalized replacement attendance, coupon redemption and manual grants can provide explanation access.

Each unit has a configurable default explanation-access duration, initially seven days. Instructors may configure their own units under the unit-editing rules; managers may configure academy units. Longer durations, such as a month for revision material, are supported product requirements rather than a fixed seven-day limit. Direct staff grants and generated unit codes use the unit's default duration; staff do not choose a different duration when issuing a direct grant or generating codes. Individual additional time is provided through the separate extension action.

Direct access starts when issued; code-based access starts at redemption. Each issued grant records its duration and expiry so later default-duration edits do not silently rewrite existing access. Confirmed 2026-10-21: unused codes use the current published unit default at redemption, including when it has changed since generation. A later default edit never changes an already redeemed grant's expiry.

Supporting documents require the same active explanation access as the unit's explanation videos, confirmed 2026-10-21. Eligible browsing alone does not authorize document retrieval. Private document links must be issued after current student, publication and effective-access checks; answer material retains its distinct rules.

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

A coupon belongs to an academy, academic year, grade, exact optional track and instructor-defined coupon type. Types can distinguish Regular and Revision material with different prices; this does not introduce a wallet, monetary balance or payment processing. A unit accepts one coupon type from its own scope. A track-specific coupon does not also cover grade-wide units; grades without tracks use their grade-only scope.

Each coupon is used once on one eligible unit the student chooses, using that unit's current published default access duration at redemption. Two coupons can unlock two chosen units. Generate coupons from the academy Coupons page rather than binding each new code to a unit. Code generation has no duration override. Preserve the existing academy staff generation/distribution and manager-only unused-code revocation permissions.

New codes contain eight unambiguous uppercase letters/digits, displayed as `XXXX-XXXX`. Redemption accepts lowercase and ignores spaces and hyphens. Generate unpredictable codes with collision protection and enforce server-side redemption throttling. A denied attempt must not consume a coupon or disclose its owner.

The owner explicitly approved retiring the old unit-specific code system on 2026-10-24, including deleting all old codes and redemption history. Remove its generation/redemption endpoints, code batches, codes, redemption tables and code-operation retry receipts. Existing access grants, revocations and annual extensions remain intact. Academy invitation and student identity codes are separate and unaffected. This supersedes the earlier decision to leave existing codes untouched.

Redemption requires the student's academy access, current-year participation and audience eligibility. Suspended online access prevents redemption. Academy joining invites/codes and unit-access codes are separate workflows: a unit code neither joins an academy nor creates annual participation. The current academy invite flow remains the existing integration; an additional short joining-code interface is not claimed implemented by this requirement.

Each code can be redeemed once and becomes permanently associated with the redeeming annual student record. A student can redeem only one coupon for a release, including after its access has expired. Further access uses extensions or manual grants rather than another coupon.

Owners, Head Admins, Admins and active Instructors may generate and distribute coupons and inspect redemption state. Manager authority to revoke unused codes remains unchanged; this update does not infer instructor code-revocation authority. Students redeem their own codes; staff do not redeem on their behalf or reassign redeemed coupons. Raw codes and exports remain restricted to authorized academy staff and are not exposed through student browsing.

## Unit prerequisites

An instructor selects specific assignments/quizzes from prerequisite units; every selected assessment must have an official submission. Draft answers, merely holding access, or a score threshold do not satisfy this first-version rule. Follow the existing unit ownership and manager-publication workflow: saving working requirements does not change published requirements.

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
