import { IMPORT_LIMITS } from "../limits";
import type { ImportFormat, ParseResult } from "../types";

/**
 * Parses a file of the chosen format. Each parser is loaded only when its format is used, so
 * Papa Parse and ExcelJS stay out of the page bundle.
 */
export async function parseSource(bytes: Uint8Array, format: ImportFormat, sheet: string | null): Promise<ParseResult> {
  if (bytes.byteLength > IMPORT_LIMITS.fileBytes) {
    return { ok: false, error: { code: "too_large", message: `The file is larger than ${IMPORT_LIMITS.fileBytes / 1024 / 1024} MiB. Split it into smaller files.` } };
  }
  if (format === "csv") return (await import("./csv")).parseCsv(bytes);
  if (format === "json") return (await import("./json")).parseJson(bytes);
  return (await import("./xlsx")).parseXlsx(bytes, sheet);
}
