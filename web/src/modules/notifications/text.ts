import { concernMediaLabel } from "@/modules/concerns";
import type { NotificationItem } from "./validation";

/**
 * The words for one notification, from the CURRENT message the server returned: its text, else
 * its media label. A deleted message is described only as deleted, never by its old content.
 */
export function notificationText(item: Pick<NotificationItem, "kind" | "actorName" | "body" | "media" | "deleted">) {
  const actor = item.actorName ?? "Staff";
  const preview = item.deleted ? "Message deleted" : item.body ?? concernMediaLabel(item.media) ?? "";
  switch (item.kind) {
    case "concern_added": return { action: `${actor} added you`, preview: null };
    case "concern_settled": return { action: `${actor} settled this concern`, preview: null };
    case "concern_reopened": return { action: `${actor} reopened this concern`, preview: null };
    case "concern_mention": return { action: `${actor} mentioned you`, preview };
    default: return { action: actor, preview };
  }
}
