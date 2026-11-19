import type { ConcernAttachment } from "./contracts";
import type { ConcernMediaSummary } from "./validation";

/** Same-origin media route: each request rechecks access, so the URL itself grants nothing. */
export function concernMediaUrl(academyId: string, concernId: string, attachmentId: string, download = false) {
  return `/api/concerns/${academyId}/${concernId}/${attachmentId}${download ? "?download=1" : ""}`;
}

export function concernMediaSummary(attachments: ConcernAttachment[]): ConcernMediaSummary {
  return attachments.length ? { count: attachments.length, voice: attachments.some((item) => item.kind === "voice") } : null;
}

/** Preview text for a live message with no text: its media, never a deletion placeholder. */
export function concernMediaLabel(media: ConcernMediaSummary) {
  if (!media) return "";
  if (media.count === 1) return media.voice ? "Voice note" : "Attachment";
  return media.voice ? `Voice note and ${media.count - 1} more` : `${media.count} attachments`;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDuration(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
