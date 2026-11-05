# Notifications

Product authority: [concern threads → Notifications](../../../docs/product/domains/concerns.md#notifications)
(EDRA-296). Shared delivery infrastructure for EDRA-263: one in-app inbox table, per-browser push
subscriptions, an outbox with leased dispatch, and a Worker-native Web Push adapter. Only concern
activity produces notifications today; other sources add their own kinds and creation path.

## Data and authority (migration `20261105062945_concern_notifications.sql`)

- `notifications`: one row per (source event, recipient), `unique(event_id, recipient_id)`. Created
  by an `after insert` trigger on `concern_events`, in the same transaction as the concern action,
  so nothing is backfilled for older events. Recipients come from `edra_private.concern_recipients`
  (current active participants with matching membership identity, share-locked): being added → the
  added person; message → every other participant, `concern_mention` instead for mentioned people,
  muted participants skip ordinary messages; settled/reopened → every other participant. Never the
  actor; Owner recovery, removals, edits, deletions, reactions and receipts notify nobody. The opening
  message notifies only mentions (being added covers it). Advancing a participant's read receipt
  marks their message/mention notifications up to that seq read.
- `push_subscriptions`: endpoint restricted by a check constraint (and again in TypeScript) to
  `fcm.googleapis.com`, `updates.push.services.mozilla.com`, `*.push.apple.com`,
  `*.notify.windows.com` over HTTPS; `p256dh` 65-byte uncompressed point, `auth` 16 bytes. An
  endpoint moves to another account only when the identical keys are presented (possession of the
  browser's subscription secret); its queued deliveries are dropped.
- `notification_deliveries`: outbox, `unique(notification_id, subscription_id)`, `expires_at` 1 h.
- `edra_private.concern_focus`: per-tab heartbeats; ignored after 45 s.
- Browsers have no table grants. Functions (all recheck the session; reads recheck
  `concern_has_access` per row): `notification_inbox` (keyset pages), `notification_unread` (server
  total), `mark_notifications_read` (own, ids ≤ 100 or all in the academy), `set_concern_muted`,
  `set_concern_focus`, `register_push_subscription`, `push_subscription_state` / `release_push_subscription`
  (need the auth secret), `forget_push_subscriptions` (global sign-out). Service role only:
  `claim_notification_deliveries` and `complete_notification_delivery`.

## Dispatch

`claim_notification_deliveries(limit)` leases due rows (`for update skip locked`, 2 min) and judges
each against CURRENT state: subscription still the recipient's, notification unread, recipient still
an active participant with the same membership identity, message not deleted, and for ordinary
messages not muted and no fresh focus heartbeat. Others finish `skipped` (or `failed` after five
attempts). The payload carries the current concern title, actor name and message text or media
summary; deleted messages and removed media are never described. `dispatch.server.ts` encrypts and
sends (`webpush.ts`: RFC 8291 aes128gcm + RFC 8292 VAPID ES256 on WebCrypto, no redirects, 10 s
timeout, TTL 1 h, `Urgency: high` except ordinary messages) and reports: 2xx `sent`; 404/410 `gone`
(subscription deleted); 429/5xx/network `retry` (30 s doubling, at least Retry-After, ≤ 15 min);
anything else `failed`. Nothing is logged. Concern commands that can notify schedule
`runNotificationDispatch` after their response (`src/lib/server/after-response.ts`, `waitUntil`);
the Worker Cron Trigger runs it every minute for retries and anything missed. A delivery failure
cannot affect the concern action, which committed first. A push already delivered cannot be recalled.

Configuration: `SUPABASE_SERVICE_ROLE_KEY`, `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`,
`WEB_PUSH_SUBJECT` Worker secrets (see `docs/technical/deployment.md`). Only the public key reaches
the browser (`loadPushPublicKey` server function). Without them push shows "Unavailable" and nothing
is sent; in-app notifications are unaffected.

## Browser

- `NotificationCenter` (public, mounted inside `ConcernPanelProvider` in the academy layout, keyed by
  academy/account/browser scope) renders the header bell into `HeaderActions` and the activation
  handler. Query keys live under `concernKeys.scope(scope)` + `notifications`, so concern live activity
  refreshes them and `forgetConcernScope` removes them on academy/account/preview switches.
- Popover (shadcn Popover/Tooltip/Badge/Empty/Switch): server unread total on the bell (also a 2 min
  fallback refresh), list loaded only while open (20 per page, Load more), loading/empty/error
  states, Mark all read with failure feedback. Each item shows the action, concern title, current
  preview ("Message deleted" for deleted messages) and time. Activation marks it read and calls the
  panel's access-rechecking `openConcern`; payload text is never presented as conversation content.
- Push switch ("Browser notifications"): detection never prompts; permission is requested only from
  the switch. States: unsupported, Unavailable (not configured), Blocked in browser settings (Check
  again), error (Try again), off, on. On every academy-layout load a subscription this browser holds
  for another account, expired on the server, or made with an old key is released and its displayed
  previews closed. Global sign-out deletes the account's subscriptions before revoking sessions.
- `public/notifications-sw.js` (scope `/`, staff host, no caching/fetch handler): shows only a
  well-formed v1 message as plain text (generic "New activity" otherwise, as browsers require);
  clicks accept only same-origin paths, focus an open Edra window and post the target to it, or open
  a new window. The page (`components/activation.tsx`) opens same-academy targets in place, navigates
  to another academy first (whose layout then consumes `?concern=&message=&notification=` and removes
  it), and ignores malformed targets. Signed-out cold opens follow normal login with `next`. The
  script path bypasses the sign-in redirect in the session middleware and router rewrite.

Suppression semantics: per account. While any of the account's tabs has the concern open in the
panel with the document visible and window focused (heartbeat ≤ 45 s old), ordinary message push
for that concern is skipped on all of the account's browsers; mentions and lifecycle alerts still
push; in-app notifications are still created. Nothing suppresses permanently.

## Feature contract (EDRA-296)

- Actor/task: staff participant in the academy web layout reviews concern activity and opts this
  browser into push. Composition: header icon popover (compact list + footer switch) chosen over a
  panel tab because notifications must be reachable while the panel is collapsed and span concerns;
  the panel remains the only content surface. Mute sits with the conversation's other header actions.
- States: loading, empty, read failure with Retry, load-more failure, mark failure, count unavailable
  (icon + tooltip), push states above, mute failure ("Could not change notifications").
- Data: unread is a server total; list keyset-paginated; mark read/all invalidates notification keys;
  late results after a scope switch are dropped by keyed remount and browser-scope generation. Push
  detection, opt-in and opt-out check that generation after asynchronous browser operations before
  registering or releasing a subscription; an old operation cannot register for the next account.
- Evidence (local, 2026-11-05): `webpush.test.ts` (RFC 8291 Appendix A vector reproduced exactly,
  receiver-side decryption, key/size validation, endpoint allowlist incl. SSRF hosts, VAPID JWT
  verified with ephemeral test keys, response classification, no redirect/foreign host);
  `dispatch.server.test.ts` (current previews/media/deleted text, same-origin URL, outcomes per
  delivery, unconfigured/claim failure idle, no clear text in requests); `service-worker.test.ts`;
  `components/center.test.tsx` (popover reads/request budget, previews, mark/mark-all, activation,
  academy switch, query/SW activation and refusal, push unsupported/unconfigured/denied/recheck/
  enable/disable/error/other-account release/own subscription, interrupted opt-in during worker
  readiness and subscription creation, and stale detection never releasing another account’s subscription); concerns `panel.test.tsx` (mute and
  focus heartbeat), `actions.test.ts` (dispatch only after successful notifying commands), sign-out
  and middleware tests. SQL `concern_notifications.sql` and races CN17–CN18 are registered for the
  disposable CI database and have not run yet.
- Unverified: real browser push per engine (Chrome/FCM, Firefox, Safari, Edge/WNS) and service-worker
  behaviour, hosted Cron/`waitUntil` dispatch, multi-user/multi-device journeys, visual review (both
  themes, 360/1440 px). No push was sent to a real person; no credentials were created.

Types: the notification RPC entries in `src/lib/supabase/database.types.ts` are provisional
handwritten signatures until the next CI `database-types` artifact replaces them (tables are not
listed because browsers never read them directly).
