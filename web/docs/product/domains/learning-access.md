# Edra — learning access, coupons and playback

Approved by the owner, 2026-10-11. Unresolved policies and implementation follow-ups are in the separate planning review notes.

## Learning access

Students browse the released content available to their current academy placement. A visible unit may still have locked explanation or answer videos. Academy entry, content visibility, explanation access and answer access each have their own purpose.

Explanation access belongs to the student's annual record and the annual content release. It covers the release's explanation videos, so replacing a video asset does not require issuing access again. Reusing material in a later year does not carry over the previous year's access.

## Explanation access and duration

Qualifying finalized attendance, finalized replacement attendance, coupon redemption and manual grants can provide explanation access.

Standard access lasts seven days. Attendance access starts when the qualifying attendance is finalized; coupon access starts at redemption; manual access starts when issued. Saving draft attendance does not start access.

Each grant retains its source, issue time, duration and revocation history. The latest issued grant controls access. Durations are not added together. When that grant expires or is revoked, an older grant does not become active again, even if its original expiry was later.

Issuing a new grant starts its own period rather than adding time to the existing period. A shorter new grant can therefore replace a longer remaining period; staff must be able to see that effect before issuing it.

## Extensions and manual grants

A student may activate one self-service 48-hour extension per content release after standard explanation access expires. The period starts when activated. Expiry qualifies for this extension; revocation does not. The extension does not reopen assessments or extend their submission and attempt windows.

Owners, Head Admins and Admins may issue either 48-hour Extension or seven-day Full access. They may issue further grants when needed; arbitrary dates and durations are outside this MVP flow.

Instructors can inspect a student's effective access and its source but cannot issue or revoke manual grants.

## Answer materials

Answer-video access is separate from explanation access. Attendance, coupons and explanation extensions do not unlock solutions.

For assignments, an accepted final online submission unlocks the associated answer videos without waiting for marking. Physical work unlocks them when the student's complete result is announced. All answer videos associated with that assignment unlock together.

An earned answer grant remains available for the rest of the academic year, even after explanation access expires. A qualifying event may be recorded before the content is released; it does not expose draft content.

Quiz solutions release automatically when the quiz's availability window closes; an individual submission does not release them earlier. Released quiz solutions are available only to students with a final quiz submission. Eligibility alone or a saved draft does not grant solution access. Exam solutions follow the same release rule: automatically at availability-window closure, only to students with a final submission. Timer-expired, kicked and window_closed attempts qualify when their saved answers were finally submitted, including automatic submission at actual closure. Students who never started an attempt do not gain solution access merely from eligibility. Neither assignment submission timing nor result announcement releases exam solutions earlier. For physical quizzes and exams, solutions require both an announced physical result and a closed availability window. If the result is announced after closure, solution eligibility starts then; an announcement before closure still waits for the window to close. Staff cannot grant answer access without qualifying work; restoration after exceptional revocation requires that the qualifying work remains valid.

For quiz and exam solutions, availability closure means actual closure after the approved two-minute completion period, not the scheduled closing time. New attempts stop at the scheduled close; existing attempts and coincident individual-timer expiry follow the [assessment headroom rules](assessments.md#quizzes-and-exams). Solutions remain locked throughout that completion period.

## Coupons

A coupon grants one eligible student seven days of explanation access to one content release. Coupons are generated in batches for a release and its eligible level or track audience, and can be exported for printing or distribution.

Redemption requires the student's academy access, current-year participation and audience eligibility. Suspended online access prevents redemption. A coupon does not enroll the student or replace an academy invite.

Each code can be redeemed once and becomes permanently associated with the redeeming annual student record. A student can redeem only one coupon for a release, including after its access has expired. Further access uses extensions or manual grants rather than another coupon.

Owners, Head Admins and Admins manage batches, view redemption state, export codes and revoke unused codes. Instructors can see the student's resulting access but cannot inspect raw codes or manage batches. Students redeem their own codes; staff do not redeem on their behalf or reassign redeemed coupons.

Revoking an unused code prevents redemption. Removing access already granted by redemption is a separate recorded access action. Period coupons, subscriptions and payment-managed access are outside this MVP flow.

## Suspension and revocation

Owners, Head Admins and Admins may suspend or restore a student's online access within their academy. Suspension preserves the student record, participation type, academic history and parent reporting. It does not suspend the student's Edra account or access to another academy.

Suspension prevents protected learning access and coupon redemption. Restoring access does not restart grant periods or reset coupon and extension usage; the student's grants retain their original timing.

Managers may revoke explanation access and, for invalid qualifying work, answer access. These actions retain their reason and history. Ordinary attendance corrections do not silently decide revocation; the correction policy must be settled before that workflow is implemented.

Session archival follows the confirmed session rules: already issued learning access remains intact, while pending unprocessed access effects from the archived session are stopped. Restoring the session does not reissue a grant or restart its period. This archival policy does not settle the separate ordinary attendance-correction revocation policy.

Closing the academic year ends its learning access while preserving academic history.

## Video playback

Students watch provider-hosted streamed video through Edra. Playback checks current academy eligibility and the access required by that video, using short-lived authorization. Explanation videos use explanation grants; answer videos use answer grants.

Playback records resume position and learning progress. Video processing and replacement preserve the content release's identity and existing access history. Expired or revoked access and online suspension prevent further playback authorization.

Development provider confirmed by the owner, 2026-10-16: use Mux with signed playback authorization. Store provider asset/playback identifiers and processing status on the trusted backend; authorization is issued after Edra checks the viewer's current access. Provider credentials and playback-signing secrets remain server-only. This is a selected integration, not a claim of implemented or verified delivery.

Production provider economics and DRM remain for review before launch. Signed playback is access control, not DRM or a guarantee against downloading, screen recording or rebroadcasting. Simultaneous-playback behavior and watermark details still require decisions before those protections are implemented. Those decisions must work consistently across the student surfaces that support playback.
