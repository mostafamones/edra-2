/** Bounds-checked image container parsing; no pixels are decoded. Shared with Written Work detection. */
export type ImageFormat = "jpeg" | "png" | "webp";
export type ImageHeader = { format: ImageFormat; width: number; height: number; animated: boolean };

const ascii = (bytes: Uint8Array, from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_DEPTHS: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };

function pngHeader(bytes: Uint8Array): ImageHeader | null {
  if (bytes.length < 33 || !PNG_SIGNATURE.every((byte, at) => bytes[at] === byte)) return null;
  const data = view(bytes);
  if (data.getUint32(8) !== 13 || ascii(bytes, 12, 16) !== "IHDR") return null;
  if (data.getUint32(29) !== crc32(bytes.subarray(12, 29))) return null;
  const width = data.getUint32(16);
  const height = data.getUint32(20);
  if (!width || !height || width > 0x7fffffff || height > 0x7fffffff) return null;
  if (!PNG_DEPTHS[bytes[25]]?.includes(bytes[24]) || bytes[26] !== 0 || bytes[27] !== 0 || bytes[28] > 1) return null;
  return { format: "png", width, height, animated: false };
}

/** The Start-of-Frame markers; 0xc4, 0xc8 and 0xcc share the range but are not frames. */
const isJpegFrame = (marker: number) => marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

export function* jpegSegments(bytes: Uint8Array) {
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return;
    while (bytes[at + 1] === 0xff) at += 1;
    const marker = bytes[at + 1];
    if (marker === 0xd9 || marker === 0xda) return;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) { at += 2; continue; }
    const size = (bytes[at + 2] << 8) | bytes[at + 3];
    if (size < 2 || at + 2 + size > bytes.length) return;
    yield { marker, from: at + 4, to: at + 2 + size };
    at += 2 + size;
  }
}

function jpegHeader(bytes: Uint8Array): ImageHeader | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  for (const { marker, from, to } of jpegSegments(bytes)) {
    if (!isJpegFrame(marker)) continue;
    if (to - from < 6) return null;
    const height = (bytes[from + 1] << 8) | bytes[from + 2];
    const width = (bytes[from + 3] << 8) | bytes[from + 4];
    const components = bytes[from + 5];
    if (!width || !height || ![1, 3, 4].includes(components) || to - from !== 6 + 3 * components) return null;
    return { format: "jpeg", width, height, animated: false };
  }
  return null;
}

function webpHeader(bytes: Uint8Array): ImageHeader | null {
  if (bytes.length < 30 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 12) !== "WEBP") return null;
  const data = view(bytes);
  if (data.getUint32(4, true) + 8 > bytes.length) return null;
  const chunk = ascii(bytes, 12, 16);
  if (chunk === "VP8X") {
    const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
    const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
    return { format: "webp", width, height, animated: (bytes[20] & 0x02) !== 0 };
  }
  if (chunk === "VP8 ") {
    if ((bytes[20] & 1) !== 0 || bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null;
    const width = data.getUint16(26, true) & 0x3fff;
    const height = data.getUint16(28, true) & 0x3fff;
    return width && height ? { format: "webp", width, height, animated: false } : null;
  }
  if (chunk === "VP8L") {
    if (bytes[20] !== 0x2f) return null;
    const bits = data.getUint32(21, true);
    return { format: "webp", width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1, animated: false };
  }
  return null;
}

/** Format and dimensions from the file's own bytes, or null when they are not a well-formed JPEG, PNG or WebP header. */
export function readImageHeader(bytes: Uint8Array): ImageHeader | null {
  return pngHeader(bytes) ?? jpegHeader(bytes) ?? webpHeader(bytes);
}

/** Match metadata reads: PNG/JPEG must reach their image-data header, without decoding pixels. */
export function readImageMetadata(bytes: Uint8Array): ImageHeader | null {
  const header = readImageHeader(bytes);
  if (!header) return null;
  if (header.format === "webp") return header;
  const data = view(bytes);
  if (header.format === "png") {
    let palette = false;
    for (let at = 8; at + 8 <= bytes.length;) {
      const size = data.getUint32(at), name = ascii(bytes, at + 4, at + 8);
      if (name === "IDAT") return bytes[25] !== 3 || palette ? header : null;
      if (name === "IEND" || at + 12 + size > bytes.length) return null;
      if (name === "PLTE") palette = size >= 3 && size <= 768 && size % 3 === 0;
      at += 12 + size;
    }
    return null;
  }
  for (let at = 2; at + 4 <= bytes.length;) {
    if (bytes[at] !== 0xff) return null;
    while (bytes[at + 1] === 0xff) at += 1;
    const marker = bytes[at + 1];
    if (marker === 0xd9) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) { at += 2; continue; }
    const size = (bytes[at + 2] << 8) | bytes[at + 3];
    if (size < 2 || at + 2 + size > bytes.length) return null;
    if (marker === 0xda) {
      const components = bytes[at + 4];
      return components >= 1 && components <= 4 && size === 6 + 2 * components ? header : null;
    }
    at += 2 + size;
  }
  return null;
}

/** Whether the data reaches its end marker; decoders otherwise paper over truncation. WebP's RIFF size is checked by its header. */
export function imageIsComplete(bytes: Uint8Array, format: ImageFormat) {
  if (format === "jpeg") {
    let end = bytes.length;
    // Encoders may pad after EOI; only zero padding is tolerated.
    while (end > 0 && bytes[end - 1] === 0) end -= 1;
    return end >= 4 && bytes[end - 2] === 0xff && bytes[end - 1] === 0xd9;
  }
  if (format === "png") {
    const data = view(bytes);
    for (let at = 8; at + 12 <= bytes.length;) {
      const size = data.getUint32(at);
      if (at + 12 + size > bytes.length) return false;
      if (ascii(bytes, at + 4, at + 8) === "IEND") return true;
      at += 12 + size;
    }
    return false;
  }
  return true;
}

function tiffOrientation(tiff: Uint8Array) {
  if (tiff.length < 8) return 1;
  const order = ascii(tiff, 0, 2);
  if (order !== "II" && order !== "MM") return 1;
  const little = order === "II";
  const data = view(tiff);
  if (data.getUint16(2, little) !== 42) return 1;
  const ifd = data.getUint32(4, little);
  if (ifd + 2 > tiff.length) return 1;
  const entries = data.getUint16(ifd, little);
  for (let index = 0; index < entries; index++) {
    const at = ifd + 2 + index * 12;
    if (at + 12 > tiff.length) return 1;
    if (data.getUint16(at, little) !== 0x0112) continue;
    const value = data.getUint16(at + 8, little);
    return value >= 1 && value <= 8 ? value : 1;
  }
  return 1;
}

const withoutExifPrefix = (exif: Uint8Array) => ascii(exif, 0, Math.min(6, exif.length)) === "Exif\0\0" ? exif.subarray(6) : exif;

/** The EXIF orientation (1-8) the container declares; 1 when absent or malformed. */
export function readOrientation(bytes: Uint8Array, format: ImageFormat) {
  if (format === "jpeg") {
    for (const { marker, from, to } of jpegSegments(bytes)) {
      if (marker === 0xe1 && ascii(bytes, from, Math.min(from + 6, to)) === "Exif\0\0") return tiffOrientation(bytes.subarray(from + 6, to));
    }
    return 1;
  }
  const data = view(bytes);
  if (format === "png") {
    for (let at = 8; at + 12 <= bytes.length;) {
      const size = data.getUint32(at);
      const type = ascii(bytes, at + 4, at + 8);
      if (type === "IDAT" || at + 12 + size > bytes.length) return 1;
      if (type === "eXIf") return tiffOrientation(bytes.subarray(at + 8, at + 8 + size));
      at += 12 + size;
    }
    return 1;
  }
  for (let at = 12; at + 8 <= bytes.length;) {
    const size = data.getUint32(at + 4, true);
    if (at + 8 + size > bytes.length) return 1;
    if (ascii(bytes, at, at + 4) === "EXIF") return tiffOrientation(withoutExifPrefix(bytes.subarray(at + 8, at + 8 + size)));
    at += 8 + size + (size & 1);
  }
  return 1;
}
