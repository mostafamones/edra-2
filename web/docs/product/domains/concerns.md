# Concern threads

Owner decisions recorded 2026-11-04. This document defines the agreed web delivery and shared domain rules. Linear EDRA-291 tracks this scope under EDRA-262. Implementation belongs in separate implementation threads.

## Purpose and platforms

Concern threads support focused academy staff discussion and an explicit recorded outcome. They are a shared web/mobile feature with the same conversations, permissions and history. The current delivery is the web experience; native interfaces follow separately.

Academic notes, parent messaging, general social chat and task management are separate features. Audio/video calls are outside this delivery.

## Authority and participants

Owners, Head Admins and Admins can create and manage concerns. Instructors participate in concerns they are added to. Only participants can read a concern, including leadership; leadership's management view lists only concerns they can access.

The academy Owner can explicitly recover access to any concern. This is an exception to participant-only access, not automatic access for Head Admins or Admins. Record the Owner's recovery action in concern history.

Participating leadership can add or remove staff while a concern is ongoing. New participants see the full history. Removed participants lose access. Membership changes remain recorded. Suspended or removed academy staff cannot access concerns.

Selecting the whole team captures the current active staff. Future staff are added explicitly, rather than automatically becoming participants.

## Settlement and reopening

Settlement requires a written outcome and makes the concern read-only. Participants retain access to its discussion and outcome subject to current participation and active academy membership.

A participating Owner, Head Admin or Admin can reopen a concern with a recorded reason. Preserve settlement and reopening history.

## Conversation capabilities

The first web delivery includes:

- Text messages and image/file attachments, with previews and downloads.
- Voice-note recording, sending and playback.
- Replies to specific messages, emoji reactions and participant @mentions.
- Live messages and typing indicators.
- Unread counts, message search and reliable sending with retry.
- Editing an author's own messages within five minutes, and deleting their own messages anytime while the concern is ongoing. Settled concerns do not allow editing or deletion.
- Read receipts showing participant avatars at their latest viewed message, with names and read times on demand. Participants cannot disable receipts.

Edited messages show an “Edited” marker. Deletion leaves a “Message deleted” placeholder and removes the text/media from conversation views, search and quoted reply previews. Replies stay attached to the placeholder. There is no participant-facing edit-history viewer. Deletion cannot recall content already seen, downloaded or delivered in a push preview.

Allow up to 10 attachments per message, each up to 25 MB. Provide image previews, PDF viewing and downloads for other file types. Voice notes run up to five minutes and support preview before sending, seeking and playback at 1×, 1.5× and 2× speed.

## Creation and academy context

A concern has a required title, opening message and selected participants. The creator is automatically included. Links belong in messages rather than only on the whole concern. Staff can include arbitrary URLs, including links to academy records. Do not require a thread-level record association. Linked records retain their own access permissions.

## Web surface

Use a floating chat panel accessible across web pages. It contains the conversation list and chat experience, Ongoing/Settled filters, unread indicators and search across permitted concerns/messages. A dedicated sidebar destination is not the selected surface.

Keep the panel open while staff navigate within an academy. Notifications open the relevant concern. On small screens, expand to a full-screen chat. Switching academies changes the panel scope and clears the previous academy's visible conversation.

## Notifications

Include in-app and browser push notifications for being added, new messages, mentions, settlement and reopening. Per-concern mute suppresses ordinary message alerts while preserving mentions and lifecycle alerts. Unread counts remain available.

Browser push requires explicit opt-in per browser/device. Include sender and message previews, rather than the previously proposed generic activity-only content. Suppress ordinary message push while the relevant concern is visibly open and focused. Notification activation rechecks current access before opening the concern. Delivery must respect current academy membership and concern access; external delivery failures do not undo a successful concern action.

Email and native mobile push belong to separate delivery. Coordinate the shared notification and delivery infrastructure with EDRA-263; browser push is part of the current web concern scope.

## Implementation boundaries

Links must remain usable as message content. Link presentation must not expose academy-record details the viewer cannot otherwise access. Arbitrary external website metadata fetching is not required by this scope.

Stored messages, media, search results, read receipts, live channels and notifications follow the same academy and concern authority. Handle retries and reconnects without duplicate messages or missed history, and enforce the five-minute edit deadline on the server. A settled concern permits reading and read-state updates, while conversation writes remain disabled until reopening.

The implementation breakdown is authority/lifecycle (EDRA-292), messaging/live state (EDRA-293), media/voice notes (EDRA-294), floating web panel (EDRA-295) and in-app/browser push (EDRA-296). Preserve shared domain rules for later native clients without implementing native screens or a second backend now.
