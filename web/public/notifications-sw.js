/* Edra notification service worker: displays browser push and routes clicks. No caching, no fetch handling. */
"use strict";

const OPEN_MESSAGE = "edra-notification-open";

/** Only a well-formed version-1 message is displayed; text is shown as plain notification text. */
function parseMessage(data) {
  if (!data || typeof data !== "object" || data.v !== 1) return null;
  for (const field of ["id", "title", "body", "tag", "url"]) if (typeof data[field] !== "string") return null;
  return { id: data.id.slice(0, 64), title: data.title.slice(0, 120), body: data.body.slice(0, 240), tag: data.tag.slice(0, 80), url: data.url };
}

/** Same-origin path only: a push payload can never open another site. */
function safeUrl(value, origin) {
  try {
    if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return null;
    const url = new URL(value, origin);
    return url.origin === origin ? url : null;
  } catch { return null; }
}

function onPush(event, scope) {
  let message = null;
  try { message = parseMessage(event.data && event.data.json()); } catch { message = null; }
  // Browsers require a visible notification for every push; malformed data shows a generic one.
  const shown = message
    ? scope.registration.showNotification(message.title, { body: message.body, tag: message.tag, data: { url: message.url } })
    : scope.registration.showNotification("Edra", { body: "New activity" });
  event.waitUntil(shown);
}

async function openTarget(data, scope) {
  const target = safeUrl(data && data.url, scope.location.origin);
  const windows = await scope.clients.matchAll({ type: "window", includeUncontrolled: true });
  const sameOrigin = windows.filter((client) => { try { return new URL(client.url).origin === scope.location.origin; } catch { return false; } });
  const client = sameOrigin.find((item) => item.focused) || sameOrigin.find((item) => item.visibilityState === "visible") || sameOrigin[0];
  if (client) {
    // The page routes in-app and rechecks access before showing the concern.
    if (target) client.postMessage({ type: OPEN_MESSAGE, url: target.pathname + target.search });
    return client.focus();
  }
  return scope.clients.openWindow(target ? target.href : "/");
}

function onClick(event, scope) {
  event.notification.close();
  event.waitUntil(openTarget(event.notification.data, scope));
}

if (typeof ServiceWorkerGlobalScope !== "undefined" && self instanceof ServiceWorkerGlobalScope) {
  self.addEventListener("install", () => self.skipWaiting());
  self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
  self.addEventListener("push", (event) => onPush(event, self));
  self.addEventListener("notificationclick", (event) => onClick(event, self));
} else if (typeof module !== "undefined") {
  module.exports = { parseMessage, safeUrl, onPush, onClick, openTarget, OPEN_MESSAGE };
}
