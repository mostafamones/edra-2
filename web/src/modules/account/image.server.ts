import "@tanstack/react-start/server-only";

import { decodeImage, encodeWebpPixels, resizePixels, type Pixels } from "./image-codecs.server";
import { imageIsComplete, readImageHeader, readOrientation } from "./image-header";
import { convertColor, imageProfile } from "./image-color.server";

/** Engineering limits for stored avatars. The source image never leaves the browser. */
export const AVATAR_SIZE = 512;
export const AVATAR_QUALITY = 82;
/** Upload of the browser's final crop. */
export const AVATAR_UPLOAD_MAX_BYTES = 900 * 1024;
const MIN_SIDE = 128;
const MAX_SIDE = 2048;

/** Source pixel for a destination pixel of a square image under each EXIF orientation. */
const ORIENT: Record<number, (x: number, y: number, last: number) => [number, number]> = {
  2: (x, y, last) => [last - x, y],
  3: (x, y, last) => [last - x, last - y],
  4: (x, y, last) => [x, last - y],
  5: (x, y) => [y, x],
  6: (x, y, last) => [y, last - x],
  7: (x, y, last) => [last - y, last - x],
  8: (x, y, last) => [last - y, x],
};

function orient({ data, width, height }: Pixels, orientation: number): Pixels {
  const map = ORIENT[orientation];
  if (!map) return { data, width, height };
  const output = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [sourceX, sourceY] = map(x, y, width - 1);
      const from = (sourceY * width + sourceX) * 4;
      output.set(data.subarray(from, from + 4), (y * width + x) * 4);
    }
  }
  return { data: output, width, height };
}

/** Composites over white so all four corners stay opaque. */
function flatten({ data, width, height }: Pixels): Pixels {
  for (let at = 0; at < data.length; at += 4) {
    const alpha = data[at + 3];
    for (let channel = 0; channel < 3; channel++) data[at + channel] = Math.floor((data[at + channel] * alpha + 255 * (255 - alpha)) / 255);
    data[at + 3] = 255;
  }
  return { data, width, height };
}

function codedWebpHeader(bytes: Uint8Array, start: number, end: number) {
  const coded = new Uint8Array(12 + end - start);
  coded.set([82, 73, 70, 70], 0);
  new DataView(coded.buffer).setUint32(4, coded.length - 8, true);
  coded.set([87, 69, 66, 80], 8);
  coded.set(bytes.subarray(start, end), 12);
  return readImageHeader(coded);
}

function staticWebpMatches(bytes: Uint8Array, width: number, height: number) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = view.getUint32(4, true) + 8;
  let found = false;
  for (let at = 12; at < end;) {
    if (at + 8 > end) return false;
    const size = view.getUint32(at + 4, true);
    const next = at + 8 + size + (size & 1);
    if (next > end) return false;
    const type = String.fromCharCode(...bytes.subarray(at, at + 4));
    if (type === "VP8 " || type === "VP8L") {
      if (found) return false;
      const header = codedWebpHeader(bytes, at, next);
      if (!header || header.width !== width || header.height !== height) return false;
      found = true;
    }
    at = next;
  }
  return found;
}

/** Extract the first animation frame as a standalone WebP without allocating its pixels. */
function firstWebpFrame(bytes: Uint8Array, canvas: number) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = view.getUint32(4, true) + 8;
  const name = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  const u24 = (at: number) => bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16);
  let frame: { x: number; y: number; width: number; height: number; data: Uint8Array } | undefined;
  let animation = false;
  for (let at = 12; at < end;) {
    if (at + 8 > end) return null;
    const size = view.getUint32(at + 4, true);
    const next = at + 8 + size + (size & 1);
    if (next > end) return null;
    const type = name(at);
    if (type === "VP8X" && (at !== 12 || size !== 10)) return null;
    if (type === "ANIM") {
      if (size !== 6 || animation || frame) return null;
      animation = true;
    }
    if (type === "ANMF") {
      if (!animation || size < 24) return null;
      const x = u24(at + 8) * 2, y = u24(at + 11) * 2;
      const width = u24(at + 14) + 1, height = u24(at + 17) + 1;
      if (x + width > canvas || y + height > canvas) return null;
      let alpha = false, image = false;
      const chunksStart = at + 24, chunksEnd = at + 8 + size;
      for (let pos = chunksStart; pos < chunksEnd;) {
        if (pos + 8 > chunksEnd) return null;
        const length = view.getUint32(pos + 4, true);
        const after = pos + 8 + length + (length & 1);
        if (after > chunksEnd) return null;
        const chunk = name(pos);
        if (chunk === "ALPH" && !alpha && !image) alpha = true;
        else if ((chunk === "VP8 " || chunk === "VP8L") && !image && !(alpha && chunk === "VP8L")) {
          // The frame header can lie about the coded dimensions. Check the bitstream
          // header too, before asking the decoder to allocate any pixels.
          const codedHeader = codedWebpHeader(bytes, pos, after);
          if (!codedHeader || codedHeader.width !== width || codedHeader.height !== height) return null;
          image = true;
        }
        else return null;
        pos = after;
      }
      if (!image) return null;
      if (!frame) {
        const chunks = bytes.subarray(chunksStart, chunksEnd);
        // ALPH requires an extended header when moved out of ANMF.
        const prefix = alpha ? 18 : 0;
        const data = new Uint8Array(12 + prefix + chunks.length);
        data.set([82, 73, 70, 70], 0);
        new DataView(data.buffer).setUint32(4, data.length - 8, true);
        data.set([87, 69, 66, 80], 8);
        if (alpha) {
          data.set([86, 80, 56, 88, 10, 0, 0, 0, 16, 0, 0, 0], 12);
          const write24 = (pos: number, value: number) => { data[pos] = value; data[pos + 1] = value >> 8; data[pos + 2] = value >> 16; };
          write24(24, width - 1); write24(27, height - 1);
        }
        data.set(chunks, 12 + prefix);
        frame = { x, y, width, height, data };
      }
    }
    at = next;
  }
  return animation ? frame ?? null : null;
}

/**
 * Decodes the uploaded square crop and re-encodes it as an opaque 512 px WebP without metadata.
 * Returns null for anything that is not a decodable JPEG, PNG or WebP square within limits.
 */
export async function encodeAvatar(input: Uint8Array): Promise<Uint8Array | null> {
  if (input.byteLength === 0 || input.byteLength > AVATAR_UPLOAD_MAX_BYTES) return null;
  // Dimensions are checked from the header so an oversized image is rejected before any decode allocates pixels.
  const header = readImageHeader(input);
  if (!header) return null;
  const { format, width, height } = header;
  if (width !== height || width < MIN_SIDE || width > MAX_SIDE) return null;
  if (!imageIsComplete(input, format)) return null;
  if (format === "webp" && !header.animated && !staticWebpMatches(input, width, height)) return null;
  try {
    const frame = header.animated ? firstWebpFrame(input, width) : null;
    if (header.animated && !frame) return null;
    let decoded = await decodeImage(format, frame?.data ?? input);
    if (frame) {
      if (decoded.width !== frame.width || decoded.height !== frame.height) return null;
      decoded.data = convertColor(decoded.data, decoded.width, decoded.height, await imageProfile(input, format), "RGB");
      const canvas = new Uint8ClampedArray(width * height * 4);
      for (let row = 0; row < frame.height; row++) {
        canvas.set(decoded.data.subarray(row * frame.width * 4, (row + 1) * frame.width * 4), ((frame.y + row) * width + frame.x) * 4);
      }
      decoded = { data: canvas, width, height };
    }
    if (decoded.width !== width || decoded.height !== height) return null;
    const opaque = flatten(orient(decoded, readOrientation(input, format)));
    const sized = width === AVATAR_SIZE ? opaque : await resizePixels(opaque, AVATAR_SIZE);
    const output = new Uint8Array(await encodeWebpPixels(sized, AVATAR_QUALITY));
    return output.byteLength <= 256 * 1024 ? output : null;
  } catch {
    return null;
  }
}
