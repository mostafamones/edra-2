import "server-only";

import sharp from "sharp";

import type { WorkFileType } from "./files";

const IMAGE_FORMATS: Record<string, WorkFileType> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

/**
 * The actual type of uploaded Written Work bytes, or null when they are not a supported PDF or
 * photo. Extensions and browser MIME types are never trusted.
 */
export async function detectWorkFile(bytes: Uint8Array): Promise<WorkFileType | null> {
  if (Buffer.from(bytes.subarray(0, 5)).toString("latin1") === "%PDF-") {
    return Buffer.from(bytes.subarray(Math.max(0, bytes.length - 1024))).toString("latin1").includes("%%EOF") ? "application/pdf" : null;
  }
  try {
    const { format, width, height } = await sharp(bytes, { failOn: "error" }).metadata();
    return format && width && height ? IMAGE_FORMATS[format] ?? null : null;
  } catch {
    return null;
  }
}
