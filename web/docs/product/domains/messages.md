# Edra — parent messages

Pre-approved working draft, 2026-10-11. The owner will re-review it with the master thread before implementation planning. Recommendations and open decisions are not final implementation requirements.

Edra proactively communicates important academic events to the primary parent contact on the student's annual record. The parent report provides the continuing academic view; messages bring relevant changes to the parent's attention.

The initial communication flows cover:

- Finalized absence for an expected student in a mandatory session.
- Finalized replacement attendance resolving missed material.
- Announced assessment results and announced corrections.
- Shared parent-visible notes and their corrections.

Draft attendance, private marks and unshared notes do not send messages. Optional-session nonattendance does not generate a mandatory-absence message. Assessment messages follow the announced result rather than every individual saved mark.

### Message content and recipients

Messages identify the relevant academy, student and academic event. Result corrections retain the previously announced and newly announced marks so the parent can understand the change. Message content is preserved for the event rather than rebuilt later from academic data that may have changed again.

Delivery records retain the contact used for each attempt. Updating a parent phone does not rewrite previous messages or delivery history. If a record lacks a usable recipient, staff see the delivery problem; Edra does not invent a recipient or prevent valid academic finalization. This exception does not relax the required contact validation for new student records.

### Delivery and staff visibility

Proactive parent delivery uses WhatsApp through the configured academy communication setup. The provider, sender ownership, templates and recipient/consent policy are confirmed before production integration. Authentication messages remain a separate workflow.

Finalization, result announcement and note sharing establish the official academic state and record the communication event. External delivery proceeds independently. A provider failure does not undo official attendance, results or shared notes.

Staff can see whether delivery is pending, successful, failed or uncertain. Owners, Head Admins and Admins can inspect permitted diagnostics and retry eligible failed deliveries. Instructors see the basic delivery outcome without provider credentials or diagnostic details.

Retries preserve the message's identity rather than creating another academic announcement. Uncertain delivery is reconciled before a resend where possible; it is not treated as proof that the parent received nothing. Unchanged academic finalization or announcement does not create duplicate messages.

Delivery history supports staff operations. It is not a separate parent-facing inbox. Arbitrary broadcasts and SMS fallback are outside this MVP communication scope.

## Recommendation and open decisions

Keep proactive WhatsApp delivery tied to official academic events. Confirm provider and sender ownership before integration; the older direct Meta recommendation is not a final provider choice.

Settle templates, language, consent, retry limits and uncertain-delivery handling (EDRA-172). Define absence corrections and note withdrawals separately from score-correction messages.

Decide when queued messages select recipients and how a verified contact correction affects unsent messages. Preserve the recipient of every attempted delivery. Intentional delivery to a corrected phone needs a recorded policy.

Quiz/exam messages follow their final announcement rules. General academy/student announcements need separate scope review; this draft does not define arbitrary broadcasts.

Evidence: existing communication scope, NTF invariants, permission matrix and Linear EDRA-172/175/179. Attendance and assignment READMEs state their effect outboxes have no consumers yet; working delivery is not verified. No provider setup, runtime or cloud checks.
