import "server-only";

import sharp from "sharp";

import type { WorkFileType } from "./files";

const IMAGE_FORMATS: Record<string, WorkFileType> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
// HEVC-coded HEIF brands. AVIF also uses the HEIF container (mif1) and is not accepted.
const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis"]);

/**
 * The actual type of uploaded Written Work bytes, or null when they are not a supported PDF or
 * photo. Extensions and browser MIME types are never trusted.
 */
export async function detectWorkFile(bytes: Uint8Array): Promise<WorkFileType | null> {
  const latin = (from: number, to: number) => Buffer.from(bytes.subarray(from, to)).toString("latin1");
  if (latin(0, 5) === "%PDF-") return latin(Math.max(0, bytes.length - 1024), bytes.length).includes("%%EOF") ? "application/pdf" : null;
  if (latin(4, 8) === "ftyp") return isHeic(bytes) ? "image/heic" : null;
  try {
    const { format, width, height } = await sharp(bytes, { failOn: "error" }).metadata();
    return format && width && height ? IMAGE_FORMATS[format] ?? null : null;
  } catch {
    return null;
  }
}

/**
 * Container check for HEIC photos: a well-formed ftyp box naming an HEVC brand, followed by the
 * top-level meta box every HEIF image file needs.
 * shortcut: the bundled libvips cannot decode HEVC, so pixels are not decoded; upgrade to a full
 * decode if a HEIC-capable decoder is added to the server image.
 */
function isHeic(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const box = (at: number) => at + 8 <= bytes.length ? { size: view.getUint32(at), type: Buffer.from(bytes.subarray(at + 4, at + 8)).toString("latin1") } : null;
  const ftyp = box(0);
  if (!ftyp || ftyp.size < 16 || ftyp.size % 4 !== 0 || ftyp.size > Math.min(bytes.length, 4096)) return false;
  const brands = [];
  for (let at = 8; at + 4 <= ftyp.size; at += at === 8 ? 8 : 4) brands.push(Buffer.from(bytes.subarray(at, at + 4)).toString("latin1"));
  if (!brands.some((brand) => HEIC_BRANDS.has(brand))) return false;
  for (let at = ftyp.size, guard = 0; guard < 64; guard++) {
    const next = box(at);
    if (!next || next.size < 8 || at + next.size > bytes.length) return false;
    if (next.type === "meta") return true;
    at += next.size;
  }
  return false;
}
