import { newUuid } from "@/lib/uuid";
import { browserScopeGeneration } from "@/lib/browser-scope";
import type { useConcernMedia } from "../commands";
import { CONCERN_LIMITS, type ConcernAttachment } from "../contracts";
import { uploadToSignedUrl } from "../upload";

type Media = ReturnType<typeof useConcernMedia>;
export type ConcernUpload = {
  /** The attachment id: reused by retries while the server may hold the bytes, renewed after a definite refusal. */
  id: string; kind: "file" | "voice"; name: string; bytes: number; blob: Blob; durationSeconds: number | null;
  /** `staged` is local only: nothing is uploaded until the message is sent. */
  status: "staged" | "uploading" | "verifying" | "ready" | "failed"; progress: number; error: string | null; reuseId: boolean;
  attachment: ConcernAttachment | null;
  /** Local preview of an image, released with `releasePreviews` once the file is removed or sent. */
  previewUrl: string | null;
};

export function releasePreviews(files: ConcernUpload[]) { for (const file of files) if (file.previewUrl) URL.revokeObjectURL(file.previewUrl); }

/** Browser pre-checks for files picked for a message; the server checks the stored bytes again. */
export function stageUploads(files: { blob: Blob; name: string; kind: "file" | "voice"; durationSeconds?: number }[], count: number): { error: string } | { items: ConcernUpload[] } {
  if (count + files.length > CONCERN_LIMITS.attachmentsPerMessage) return { error: `Up to ${CONCERN_LIMITS.attachmentsPerMessage} attachments per message.` };
  const tooLarge = files.find((file) => file.blob.size > CONCERN_LIMITS.attachmentBytes);
  if (tooLarge) return { error: `${tooLarge.name} is larger than 25 MB.` };
  const empty = files.find((file) => file.blob.size === 0);
  if (empty) return { error: `${empty.name} is empty.` };
  return { items: files.map((file): ConcernUpload => ({
    id: newUuid(), kind: file.kind, name: file.name.trim().replace(/[/\\\p{Cc}]/gu, "_").slice(0, 255) || "file",
    bytes: file.blob.size, blob: file.blob, durationSeconds: file.durationSeconds ?? null,
    status: "staged", progress: 0, error: null, reuseId: true, attachment: null,
    previewUrl: file.kind === "file" && file.blob.type.startsWith("image/") && typeof URL.createObjectURL === "function" ? URL.createObjectURL(file.blob) : null,
  })) };
}

/**
 * Uploads one file with real progress and reports each change through `patch`. A late result after
 * an abort or a browser scope change reports nothing.
 */
export async function transferUpload(media: Media, item: ConcernUpload, signal: AbortSignal, patch: (change: Partial<ConcernUpload>) => void): Promise<"ready" | "failed" | "aborted"> {
  const generation = browserScopeGeneration();
  const alive = () => !signal.aborted && generation === browserScopeGeneration();
  const fail = (error: string, reuseId: boolean) => { if (!alive()) return "aborted" as const; patch({ status: "failed", error, reuseId }); return "failed" as const; };
  patch({ status: "uploading", progress: 0, error: null });
  const started = await media.start({ attachmentId: item.id, kind: item.kind, name: item.name, bytes: item.bytes });
  if (!alive()) return "aborted";
  if (!started.ok) return fail(started.message, started.code === "unavailable");
  if (started.url) {
    const outcome = await uploadToSignedUrl(started.url, item.blob, signal, (progress) => { if (alive()) patch({ progress }); });
    if (outcome === "aborted" || !alive()) return "aborted";
    if (outcome === "failed") return fail("Upload failed. Check your connection and retry.", true);
  }
  patch({ status: "verifying", progress: 1 });
  const finished = await media.finish(item.id);
  if (!alive()) return "aborted";
  if (!finished.ok) return fail(finished.message, finished.code === "unavailable");
  patch({ status: "ready", attachment: finished.attachment, error: null });
  return "ready";
}
