import { useCallback, useRef, useState } from "react";
import { browserScopeGeneration } from "@/lib/browser-scope";
import type { useConcernMedia } from "../commands";
import { CONCERN_LIMITS, type ConcernAttachment } from "../contracts";
import { uploadToSignedUrl } from "../upload";

type Media = ReturnType<typeof useConcernMedia>;
export type ConcernUpload = {
  /** The attachment id: reused by retries while the server may hold the bytes, renewed after a definite refusal. */
  id: string; kind: "file" | "voice"; name: string; bytes: number; blob: Blob; durationSeconds: number | null;
  status: "uploading" | "verifying" | "ready" | "failed"; progress: number; error: string | null; reuseId: boolean;
  attachment: ConcernAttachment | null;
};

/**
 * Unsent attachments for one composer. Each item uploads independently with real progress, can be
 * canceled (aborting the transfer and discarding the reservation) and retried. Late results for a
 * removed item, a superseded attempt or a previous browser scope change nothing.
 */
export function useConcernUploads(media: Media) {
  const [items, setItems] = useState<ConcernUpload[]>([]);
  const attempts = useRef(new Map<string, AbortController>());
  const update = useCallback((id: string, patch: Partial<ConcernUpload>) =>
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item)), []);

  const transfer = useCallback(async (item: ConcernUpload) => {
    const controller = new AbortController();
    attempts.current.get(item.id)?.abort();
    attempts.current.set(item.id, controller);
    const generation = browserScopeGeneration();
    const alive = () => !controller.signal.aborted && attempts.current.get(item.id) === controller && generation === browserScopeGeneration();
    const fail = (error: string, reuseId: boolean) => { if (alive()) update(item.id, { status: "failed", error, reuseId }); };
    update(item.id, { status: "uploading", progress: 0, error: null });
    const started = await media.start({ attachmentId: item.id, kind: item.kind, name: item.name, bytes: item.bytes });
    if (!alive()) return;
    if (!started.ok) return fail(started.message, started.code === "unavailable");
    if (started.url) {
      const outcome = await uploadToSignedUrl(started.url, item.blob, controller.signal, (progress) => { if (alive()) update(item.id, { progress }); });
      if (outcome === "aborted" || !alive()) return;
      if (outcome === "failed") return fail("Upload failed. Check your connection and retry.", true);
    }
    update(item.id, { status: "verifying", progress: 1 });
    const finished = await media.finish(item.id);
    if (!alive()) return;
    if (!finished.ok) return fail(finished.message, finished.code === "unavailable");
    attempts.current.delete(item.id);
    update(item.id, { status: "ready", attachment: finished.attachment, error: null });
  }, [media, update]);

  /** Adds files after browser pre-checks; the server checks the stored bytes again. Returns a problem, if any. */
  const add = useCallback((files: { blob: Blob; name: string; kind: "file" | "voice"; durationSeconds?: number }[], count: number) => {
    if (count + files.length > CONCERN_LIMITS.attachmentsPerMessage) return `Up to ${CONCERN_LIMITS.attachmentsPerMessage} attachments per message.`;
    const tooLarge = files.find((file) => file.blob.size > CONCERN_LIMITS.attachmentBytes);
    if (tooLarge) return `${tooLarge.name} is larger than 25 MB.`;
    const empty = files.find((file) => file.blob.size === 0);
    if (empty) return `${empty.name} is empty.`;
    const created = files.map((file): ConcernUpload => ({
      id: crypto.randomUUID(), kind: file.kind, name: file.name.trim().replace(/[/\\\p{Cc}]/gu, "_").slice(0, 255) || "file",
      bytes: file.blob.size, blob: file.blob, durationSeconds: file.durationSeconds ?? null,
      status: "uploading", progress: 0, error: null, reuseId: true, attachment: null,
    }));
    setItems((current) => [...current, ...created]);
    for (const item of created) void transfer(item);
    return null;
  }, [transfer]);

  const retry = useCallback((item: ConcernUpload) => {
    const next = item.reuseId ? item : { ...item, id: crypto.randomUUID() };
    if (next.id !== item.id) setItems((current) => current.map((entry) => entry.id === item.id ? next : entry));
    void transfer(next);
  }, [transfer]);

  const remove = useCallback((item: ConcernUpload) => {
    attempts.current.get(item.id)?.abort();
    attempts.current.delete(item.id);
    setItems((current) => current.filter((entry) => entry.id !== item.id));
    void media.discard(item.id);
  }, [media]);

  /** After a successful send: the items now belong to the message, so nothing is discarded. */
  const clear = useCallback(() => { attempts.current.clear(); setItems([]); }, []);

  return { items, add, retry, remove, clear };
}
