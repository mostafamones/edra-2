import "@tanstack/react-start/server-only";
import decodeJpeg, { init as initJpeg } from "@jsquash/jpeg/decode";
import decodePng, { init as initPng } from "@jsquash/png/decode";
import decodeWebp, { init as initDecodeWebp } from "@jsquash/webp/decode";
import encodeWebp, { init as initEncodeWebp } from "@jsquash/webp/encode";
import jpegDecodeWasm from "@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm?module";
import pngWasm from "@jsquash/png/codec/pkg/squoosh_png_bg.wasm?module";
import webpDecodeWasm from "@jsquash/webp/codec/dec/webp_dec.wasm?module";
import webpEncodeWasm from "@jsquash/webp/codec/enc/webp_enc_simd.wasm?module";

import { decodeCmykJpeg, fourChannelJpeg } from "./image-cmyk.server";
import { convertColor, imageProfile } from "./image-color.server";
import { jpegSegments } from "./image-header";
import { resizeOpaque } from "./image-resize.server";

export type Pixels = { data: Uint8ClampedArray; width: number; height: number };

// Workers has no ImageData, and the codecs construct it. shortcut: only the fields they read.
(globalThis as { ImageData?: unknown }).ImageData ??= class {
  constructor(public data: Uint8ClampedArray, public width: number, public height: number) {}
};

// Workers forbids compiling Wasm at runtime. Initialize only the codecs a request
// uses, rather than allocating every decoder's heap for each first upload.
let jpegReady: Promise<unknown> | undefined, pngReady: Promise<unknown> | undefined, webpReady: Promise<unknown> | undefined;
let encodeReady: Promise<unknown> | undefined;
const initialize = {
  jpeg: () => jpegReady ??= Promise.resolve(initJpeg(jpegDecodeWasm)),
  png: () => pngReady ??= Promise.resolve(initPng(pngWasm)),
  webp: () => webpReady ??= Promise.resolve(initDecodeWebp(webpDecodeWasm)),
};

const DECODERS = { jpeg: decodeJpeg, png: decodePng, webp: decodeWebp };

export async function decodeImage(format: keyof typeof DECODERS, bytes: Uint8Array): Promise<Pixels> {
  if (format === "jpeg" && fourChannelJpeg(bytes)) {
    return decodeCmykJpeg(bytes);
  }
  await initialize[format]();
  const profile = await imageProfile(bytes, format);
  // Sharp keeps tagged 16-bit RGB PNGs in a 16-bit P3 processing space.
  const sixteen = format === "png" && bytes[24] === 16 && (bytes[25] === 2 || bytes[25] === 6) && profile;
  if (sixteen) {
    const pixels = await decodePng(new Uint8Array(bytes).buffer, { bitDepth: 16 });
    try {
      // The 16-bit decoder exposes a view into its Rust allocation. Copy only the
      // converted eight-bit result, then release that allocation on every path.
      return { width: pixels.width, height: pixels.height, data: convertColor(pixels.data, pixels.width, pixels.height, profile, "RGB", 16).slice() };
    } finally { pixels.free(); }
  }
  const pixels = await DECODERS[format](new Uint8Array(bytes).buffer) as Pixels;
  if (profile && !(format === "png" && bytes[24] === 16 && (bytes[25] === 0 || bytes[25] === 4))) {
    const gray = format === "png" ? bytes[25] === 0 || bytes[25] === 4 : format === "jpeg" && (() => { for (const segment of jpegSegments(bytes)) if ([0xc0, 0xc1, 0xc2].includes(segment.marker)) return bytes[segment.from + 5] === 1; return false; })();
    pixels.data = convertColor(pixels.data, pixels.width, pixels.height, profile, gray ? "GRAY" : "RGB");
  }
  return pixels;
}

export async function resizePixels(pixels: Pixels, size: number): Promise<Pixels> {
  return resizeOpaque(pixels, size);
}

export async function encodeWebpPixels(pixels: Pixels, quality: number): Promise<ArrayBuffer> {
  await (encodeReady ??= Promise.resolve(initEncodeWebp(webpEncodeWasm)));
  return encodeWebp(pixels as ImageData, { quality });
}
