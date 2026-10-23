/**
 * Written Work file limits, shared by the browser, the server and the private assignment-work
 * bucket (migrations 20261022190051 and 20261022232925 set the same 8 MB limit and types).
 */
export const WORK_FILE_MAX_BYTES = 8 * 1024 * 1024;
export const WORK_FILE_MAX_COUNT = 20;
export const WORK_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;
export type WorkFileType = (typeof WORK_FILE_TYPES)[number];
export const WORK_FILE_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif";

/** Types browsers display inline; HEIC/HEIF photos are downloaded instead. */
export const PREVIEWABLE_TYPES: readonly string[] = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

export function isWorkFileType(value: string): value is WorkFileType {
  return (WORK_FILE_TYPES as readonly string[]).includes(value);
}

/** HEIC and HEIF name the same container family; browsers label the same photo either way. */
export function sameWorkFileType(a: string, b: string) {
  const family = (type: string) => type === "image/heif" ? "image/heic" : type;
  return family(a) === family(b);
}

/** The declared type, falling back to the extension for HEIC/HEIF photos many browsers leave untyped. */
export function workFileMime(file: { type: string; name: string }): WorkFileType | null {
  if (isWorkFileType(file.type)) return file.type;
  if (file.type && file.type !== "application/octet-stream") return null;
  const extension = file.name.toLowerCase().split(".").pop();
  return extension === "heic" ? "image/heic" : extension === "heif" ? "image/heif" : null;
}

/** Browser pre-check only; the server checks the uploaded bytes again. */
export function workFileProblem(file: { type: string; name: string; size: number }): string | null {
  if (!workFileMime(file)) return "Upload a PDF, JPEG, PNG, WebP or HEIC file.";
  if (file.size < 1) return "This file is empty.";
  if (file.size > WORK_FILE_MAX_BYTES) return "Files can be up to 8 MB.";
  return null;
}
