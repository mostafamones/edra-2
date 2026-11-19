import { useEffect, useEffectEvent } from "react";

import { usePathname, useRouter, useSearchParams } from "@/lib/navigation";
import { useConcernPanel, type ConcernScope } from "@/modules/concerns";
import { useMarkNotificationsRead } from "../queries";

export const OPEN_MESSAGE = "edra-notification-open";
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A same-origin `/<academy>?concern=…` target, or null. Never trusts the push payload beyond this shape. */
export function parseTarget(href: string, origin: string) {
  try {
    if (!href.startsWith("/") || href.startsWith("//")) return null;
    const url = new URL(href, origin);
    const slug = /^\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(url.pathname)?.[1];
    const concernId = url.searchParams.get("concern");
    const messageId = url.searchParams.get("message");
    const notificationId = url.searchParams.get("notification");
    if (url.origin !== origin || !slug || !concernId || !GUID.test(concernId) || (messageId && !GUID.test(messageId)) || (notificationId && !GUID.test(notificationId))) return null;
    return { slug, path: url.pathname + url.search, concernId, messageId, notificationId };
  } catch { return null; }
}

/**
 * Routes notification activation into the access-rechecking panel API. A push click either reaches
 * an open page (service worker message) or loads `/<academy>?concern=…`. Same academy: open the
 * panel without leaving the current page. Another academy: navigate there first; the new academy
 * layout handles the query. The query is removed once consumed, so the same target can repeat.
 */
export function NotificationActivation({ scope, slug }: { scope: ConcernScope; slug: string }) {
  const panel = useConcernPanel();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const markRead = useMarkNotificationsRead(scope);
  const concern = params.get("concern");
  const message = params.get("message");
  const notification = params.get("notification");

  const open = useEffectEvent((target: { concernId: string; messageId: string | null; notificationId: string | null }) => {
    if (!panel) return;
    if (target.notificationId) void markRead([target.notificationId]);
    void panel.openConcern({ academyId: scope.academyId, concernId: target.concernId, ...(target.messageId && { messageId: target.messageId }) });
  });

  useEffect(() => {
    const target = concern ? parseTarget(`${pathname}?${params}`, window.location.origin) : null;
    if (!target) return;
    const rest = new URLSearchParams(params);
    for (const name of ["concern", "message", "notification"]) rest.delete(name);
    router.replace(`${pathname}${rest.size ? `?${rest}` : ""}`);
    if (target.slug === slug) open(target);
    // Consumes each target once; other query changes on the page are not activations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [concern, message, notification]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== OPEN_MESSAGE || typeof event.data.url !== "string") return;
      const target = parseTarget(event.data.url, window.location.origin);
      if (!target) return;
      if (target.slug === slug) open(target);
      else router.push(target.path);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router, slug]);
  return null;
}
