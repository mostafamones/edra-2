import { signStudentExamImages, signStudentExamReviewImages } from "../actions";
import type { ImageSource } from "@/components/shared/assessment/images/context";

type Sign = (imageIds: string[]) => Promise<Record<string, string>>;

/** Batch same-tick requests (20 per call); never keep URLs or sign while `active` is false. */
function batchedImageSource(scope: string, sign: Sign, active: () => boolean, inactive: string): ImageSource {
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
          const signed = await sign(imageIds);
          if (active()) urls = signed;
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
      if (!active()) { reject(new Error(inactive)); return; }
      pending.set(id, [...(pending.get(id) ?? []), { resolve, reject }]);
      if (!scheduled) { scheduled = true; queueMicrotask(() => void flush()); }
    }),
  };
}

/** Answering images: signed for the current editor claim only, never beyond this session. */
export function studentImageSource(scope: string, academyId: string, examId: string, token: () => string, active: () => boolean): ImageSource {
  return batchedImageSource(scope, async (imageIds) => {
    const result = await signStudentExamImages({ academyId, examId, token: token(), imageIds });
    return result.ok && result.kind === "urls" ? result.urls : {};
  }, active, "The exam editor is unavailable.");
}

/** Qualified review images (EDRA-235): no editor token; each batch is reauthorized by the database. */
export function reviewImageSource(scope: string, academyId: string, examId: string, active: () => boolean): ImageSource {
  return batchedImageSource(scope, async (imageIds) => {
    const result = await signStudentExamReviewImages({ academyId, examId, imageIds });
    return result.ok && result.kind === "urls" ? result.urls : {};
  }, active, "This review is unavailable.");
}
