import "@tanstack/react-start/server-only";
import { JpegImage } from "pdfjs-dist/image_decoders/pdf.image_decoders.mjs";
import type { Pixels } from "./image-codecs.server";
import { jpegSegments, readImageHeader } from "./image-header";
import { convertColor, imageProfile } from "./image-color.server";

export function fourChannelJpeg(bytes: Uint8Array) {
  for (const { marker, from, to } of jpegSegments(bytes)) {
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return to - from >= 6 && bytes[from + 5] === 4;
  }
  return false;
}

/** Walk every marker, including between scans, before PDF.js allocates frame buffers.
 * Scan count does not size those buffers: PDF.js reuses one frame's coefficients.
 * Keep table/segment alignment, sampling and single-frame checks for ALL scans.
 * The caller's 900 KiB upload bound limits marker/table work; decoding many scans
 * still costs CPU proportional to scans × frame blocks (a deployed resource gate).
 */
function safeCmykJpeg(bytes: Uint8Array) {
  let at = 2, frame = false, scans = 0;
  while (at + 1 < bytes.length) {
    if (bytes[at++] !== 0xff) return false;
    while (bytes[at] === 0xff) at++;
    const marker = bytes[at++];
    if (marker === 0xd9) return frame && scans > 0;
    if (at + 2 > bytes.length) return false;
    const length = (bytes[at] << 8) | bytes[at + 1];
    const from = at + 2, to = at + length;
    if (length < 2 || to > bytes.length) return false;
    if (marker === 0xdb || marker === 0xc4) {
      let pos = from;
      while (pos < to) {
        if (marker === 0xdb) {
          const precision = bytes[pos] >> 4;
          if (precision > 1) return false;
          pos += 1 + (precision ? 128 : 64);
        } else {
          if (pos + 17 > to) return false;
          let count = 0;
          for (let i = 1; i <= 16; i++) count += bytes[pos + i];
          pos += 17 + count;
        }
      }
      if (pos !== to) return false;
    } else if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      if (frame || to - from !== 18) return false;
      for (let i = 0; i < 4; i++) {
        const sampling = bytes[from + 7 + i * 3], h = sampling >> 4, v = sampling & 15;
        if (h < 1 || h > 4 || v < 1 || v > 4) return false;
      }
      frame = true;
    } else if (marker === 0xdd) {
      if (to - from !== 2) return false;
    } else if ((marker >= 0xe0 && marker <= 0xef) || marker === 0xfe) {
      // PDF.js searches backwards inside APP/COM when the next marker is invalid.
      const next = (bytes[to] << 8) | bytes[to + 1];
      if (next < 0xffc0 || next > 0xfffe) return false;
    } else if (marker === 0xda) {
      const components = bytes[from];
      if (!frame || components < 1 || components > 4 || length !== 6 + 2 * components) return false;
      scans++;
    } else return false;
    at = to;
    if (marker !== 0xda) continue;
    // Entropy bytes use FF00 stuffing and standalone restart markers. APP/COM
    // payloads are skipped by their declared lengths on the next outer iteration,
    // so marker-shaped metadata cannot count as scans or hide oversized frames.
    while (at + 1 < bytes.length) {
      if (bytes[at] !== 0xff) { at++; continue; }
      let next = at + 1;
      while (bytes[next] === 0xff) next++;
      if (bytes[next] === 0 || (bytes[next] >= 0xd0 && bytes[next] <= 0xd7)) { at = next + 1; continue; }
      break;
    }
  }
  return false;
}

/** Decode CMYK/YCCK without losing the fourth component before ICC conversion. */
export async function decodeCmykJpeg(bytes: Uint8Array): Promise<Pixels> {
  const header = readImageHeader(bytes);
  if (!header || header.format !== "jpeg" || header.width !== header.height || header.width < 128 || header.width > 2048 || !safeCmykJpeg(bytes)) throw new Error("Invalid CMYK crop");
  const image = new JpegImage({});
  // Pin the prevalidated height: the decoder's DNL repair must not reparse an
  // untrusted scan with larger dimensions after the allocation guard.
  image.parse(bytes, { dnlScanLines: header.height });
  const { width, height } = image;
  // Defense in depth: callers also check the header before reaching any decoder.
  if (image.numComponents !== 4 || width !== header.width || height !== header.height) throw new Error("Invalid CMYK crop");
  const data = image.getData({ width, height }) as Uint8ClampedArray;
  return { data: convertColor(data, width, height, await imageProfile(bytes, "jpeg"), "CMYK"), width, height };
}
