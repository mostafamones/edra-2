import { signStudentExamImages } from "../actions";
import type { ImageSource } from "@/components/shared/assessment/images/context";

/** Batch same-tick requests; never keep URLs or renew beyond this answering session. */
export function studentImageSource(scope: string, academyId: string, examId: string, token: () => string, active: () => boolean): ImageSource {
  let pending = new Map<string, { resolve: (url: string) => void; reject: (error: Error) => void }[]>();
  let scheduled = false;
  async function flush() {
    scheduled = false;
    const batch = pending;
    pending = new Map();
    const ids = [...batch.keys()];
    for (let offset = 0; offset < ids.length; offset += 20) {
      const imageIds = ids.slice(offset, offset + 20);
      let urls: Record<string, string> = {};
      if (active()) {
        try {
          const result = await signStudentExamImages({ academyId, examId, token: token(), imageIds });
          if (result.ok && result.kind === "urls" && active()) urls = result.urls;
        } catch { /* Individual consumers expose Retry. */ }
      }
      for (const id of imageIds) for (const waiter of batch.get(id) ?? []) {
        if (urls[id]) waiter.resolve(urls[id]);
        else waiter.reject(new Error("This image is unavailable."));
      }
    }
  }
  return {
    scope, lifetimeSeconds: 60,
    resolve: (id) => new Promise<string>((resolve, reject) => {
      if (!active()) { reject(new Error("The exam editor is unavailable.")); return; }
      pending.set(id, [...(pending.get(id) ?? []), { resolve, reject }]);
      if (!scheduled) { scheduled = true; queueMicrotask(() => void flush()); }
    }),
  };
}
