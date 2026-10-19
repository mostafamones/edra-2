import sharp from "sharp";

/** Engineering limits for stored avatars. The source image never leaves the browser. */
export const AVATAR_SIZE = 512;
export const AVATAR_QUALITY = 82;
/** Upload of the browser's final crop; below the 1 MB Server Action body limit. */
export const AVATAR_UPLOAD_MAX_BYTES = 900 * 1024;
const MIN_SIDE = 128;
const MAX_SIDE = 2048;
const FORMATS = new Set(["jpeg", "png", "webp"]);

/**
 * Decodes the uploaded square crop and re-encodes it as an opaque 512 px WebP without metadata.
 * Returns null for anything that is not a decodable JPEG, PNG or WebP square within limits.
 */
export async function encodeAvatar(input: Uint8Array): Promise<Buffer | null> {
  if (input.byteLength === 0 || input.byteLength > AVATAR_UPLOAD_MAX_BYTES) return null;
  try {
    const image = sharp(input, { limitInputPixels: MAX_SIDE * MAX_SIDE, failOn: "error", animated: false });
    const { format, width, height } = await image.metadata();
    if (!format || !FORMATS.has(format) || !width || !height) return null;
    if (width !== height || width < MIN_SIDE || width > MAX_SIDE) return null;
    // sharp drops source metadata unless asked to keep it; flatten keeps all four corners opaque.
    const output = await image.rotate().flatten({ background: "#ffffff" })
      .resize(AVATAR_SIZE, AVATAR_SIZE).webp({ quality: AVATAR_QUALITY }).toBuffer();
    return output.byteLength <= 256 * 1024 ? output : null;
  } catch {
    return null;
  }
}
