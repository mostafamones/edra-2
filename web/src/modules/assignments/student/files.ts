/**
 * Written Work file limits, shared by the browser, the server and the private assignment-work
 * bucket (migration 20261022190051 sets the same 8 MB limit and types).
 */
export const WORK_FILE_MAX_BYTES = 8 * 1024 * 1024;
export const WORK_FILE_MAX_COUNT = 20;
export const WORK_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export type WorkFileType = (typeof WORK_FILE_TYPES)[number];
export const WORK_FILE_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp";

export function isWorkFileType(value: string): value is WorkFileType {
  return (WORK_FILE_TYPES as readonly string[]).includes(value);
}

/** Browser pre-check only; the server checks the uploaded bytes again. */
export function workFileProblem(file: { type: string; size: number }): string | null {
  if (!isWorkFileType(file.type)) {
    return /hei[cf]/i.test(file.type)
      ? "HEIC photos aren’t supported. Save the photo as JPEG and upload it again."
      : "Upload a PDF, JPEG, PNG or WebP file.";
  }
  if (file.size < 1) return "This file is empty.";
  if (file.size > WORK_FILE_MAX_BYTES) return "Files can be up to 8 MB.";
  return null;
}
