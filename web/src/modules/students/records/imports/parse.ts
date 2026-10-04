import { IMPORT_LIMITS } from "./limits";
import type { ImportFormat, ParseResult } from "./types";

/**
 * Parses a file in a Web Worker. The worker is terminated after the timeout or when `signal`
 * aborts (the file, format, or academy changed), so a stale parse never reports back.
 */
export function parseInWorker(file: File, format: ImportFormat, sheet: string | null, signal: AbortSignal): Promise<ParseResult | null> {
  if (file.size > IMPORT_LIMITS.fileBytes) {
    return Promise.resolve({ ok: false, error: { code: "too_large", message: `The file is larger than ${IMPORT_LIMITS.fileBytes / 1024 / 1024} MiB. Split it into smaller files.` } });
  }
  return new Promise((resolve) => {
    if (signal.aborted) { resolve(null); return; }
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    const finish = (result: ParseResult | null) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      worker.terminate();
      resolve(result);
    };
    const abort = () => finish(null);
    const timer = setTimeout(() => finish({
      ok: false,
      error: { code: "timeout", message: "Reading the file took too long. Try a smaller file or save it as CSV." },
    }), IMPORT_LIMITS.parseTimeoutMs);
    signal.addEventListener("abort", abort);
    worker.onmessage = (event: MessageEvent<ParseResult>) => finish(event.data);
    worker.onerror = () => finish({ ok: false, error: { code: "unavailable", message: "The file couldn’t be read. Check it and try again." } });
    worker.postMessage({ file, format, sheet });
  });
}
