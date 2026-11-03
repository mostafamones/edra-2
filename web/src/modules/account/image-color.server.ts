import "@tanstack/react-start/server-only";
import wasm from "./profiles/lcms/lcms.wasm?module";
import fallbackUrl from "./profiles/cmyk.icm?url&inline";
import srgbUrl from "./profiles/srgb.icm?url&inline";
import p3Url from "./profiles/p3.icm?url&inline";
import { jpegSegments, type ImageFormat } from "./image-header";

interface Cms extends WebAssembly.Exports {
  memory: WebAssembly.Memory;
  _initialize(): void;
  malloc(size: number): number;
  free(pointer: number): void;
  cmsOpenProfileFromMem(pointer: number, size: number): number;
  cmsCloseProfile(profile: number): void;
  cmsGetColorSpace(profile: number): number;
  cmsIsIntentSupported(profile: number, intent: number, direction: number): number;
  cmsGetHeaderRenderingIntent(profile: number): number;
  cmsCreateTransform(source: number, inputFormat: number, destination: number, outputFormat: number, intent: number, flags: number): number;
  cmsDoTransform(transform: number, input: number, output: number, count: number): void;
  cmsDeleteTransform(transform: number): void;
}

let ready: Cms | undefined;
function colorManager() {
  if (ready) return ready;
  // WASI libc probes for preopened descriptors at initialization. No descriptors
  // or filesystem are provided. All file operations return EBADF, without I/O.
  const unavailable = () => 8;
  const cms: Cms = new WebAssembly.Instance(wasm, { wasi_snapshot_preview1: {
    fd_close: unavailable, fd_fdstat_get: unavailable, fd_fdstat_set_flags: unavailable,
    fd_prestat_get: unavailable, fd_prestat_dir_name: unavailable, fd_read: unavailable,
    fd_seek: unavailable, fd_write: unavailable, path_open: unavailable,
    path_remove_directory: unavailable, path_unlink_file: unavailable,
    // LCMS dates its temporary profiles; the date does not affect transforms.
    clock_time_get(_clock: number, _precision: bigint, pointer: number) { new DataView(cms.memory.buffer).setBigUint64(pointer, 0n, true); return 0; },
    proc_exit() { throw new Error("LittleCMS exited"); },
  } }).exports as Cms;
  cms._initialize();
  return ready = cms;
}

const fromUrl = (url: string) => Uint8Array.from(atob(url.slice(url.indexOf(",") + 1)), value => value.charCodeAt(0));
const spaces = { CMYK: { signature: 0x434d594b, channels: 4, type: 6 }, RGB: { signature: 0x52474220, channels: 3, type: 4 }, GRAY: { signature: 0x47524159, channels: 1, type: 3 } };

/** Apply the original perceptual ICC transform, in bounded batches. Input has four samples per pixel. */
export function convertColor(data: Uint8ClampedArray | Uint16Array, width: number, height: number, profile: Uint8Array | null, space: keyof typeof spaces, depth: 8 | 16 = 8) {
  const output = depth === 8 ? data as Uint8ClampedArray : new Uint8ClampedArray(data.buffer, data.byteOffset, width * height * 4);
  const unchanged = () => { if (depth === 16) for (let i = 0; i < output.length; i++) output[i] = data[i] >>> 8; return output; };
  if (!profile && space !== "CMYK") return unchanged();
  const cms = colorManager(), info = spaces[space], sampleBytes = depth / 8;
  const allocate = (size: number) => { const pointer = cms.malloc(size); if (!pointer) throw new Error("LittleCMS memory limit"); return pointer; };
  const open = (bytes: Uint8Array) => {
    const pointer = allocate(bytes.length);
    try { new Uint8Array(cms.memory.buffer, pointer, bytes.length).set(bytes); return cms.cmsOpenProfileFromMem(pointer, bytes.length); }
    finally { cms.free(pointer); }
  };
  let source = 0, destination = 0, transform = 0, inputPointer = 0, outputPointer = 0;
  try {
    if (profile) source = open(profile);
    if (source && cms.cmsGetColorSpace(source) !== info.signature) { cms.cmsCloseProfile(source); source = 0; }
    if (!source && space === "CMYK") source = open(fromUrl(fallbackUrl));
    if (!source && depth === 16) source = open(fromUrl(srgbUrl));
    if (!source) return unchanged();
    destination = open(fromUrl(depth === 16 ? p3Url : srgbUrl));
    // libvips selects the profile's suggested intent when perceptual is unsupported.
    const intent = cms.cmsIsIntentSupported(destination, 0, 1) ? 0 : cms.cmsGetHeaderRenderingIntent(destination);
    transform = cms.cmsCreateTransform(source, (info.type << 16) | (info.channels << 3) | sampleBytes, destination, (4 << 16) | (3 << 3) | sampleBytes, intent, 64);
    if (!transform) throw new Error("Could not convert avatar color profile");
    const batch = width * Math.min(32, height);
    inputPointer = allocate(batch * info.channels * sampleBytes);
    outputPointer = allocate(batch * 3 * sampleBytes);
    const alpha = depth === 16 ? new Uint8Array(batch) : null;
    for (let offset = 0; offset < width * height; offset += batch) {
      const count = Math.min(batch, width * height - offset);
      const input = depth === 8 ? new Uint8Array(cms.memory.buffer, inputPointer, count * info.channels) : new Uint16Array(cms.memory.buffer, inputPointer, count * info.channels);
      if (info.channels === 4) input.set(data.subarray(offset * 4, (offset + count) * 4));
      else for (let pixel = 0; pixel < count; pixel++) for (let channel = 0; channel < info.channels; channel++) input[pixel * info.channels + channel] = data[(offset + pixel) * 4 + channel];
      cms.cmsDoTransform(transform, inputPointer, outputPointer, count);
      const rgb = depth === 8 ? new Uint8Array(cms.memory.buffer, outputPointer, count * 3) : new Uint16Array(cms.memory.buffer, outputPointer, count * 3);
      // Read alpha before overwriting each batch's 16-bit source samples.
      if (alpha) for (let pixel = 0; pixel < count; pixel++) alpha[pixel] = data[(offset + pixel) * 4 + 3] >>> 8;
      for (let pixel = 0; pixel < count; pixel++) {
        const at = (offset + pixel) * 4;
        for (let channel = 0; channel < 3; channel++) output[at + channel] = depth === 8 ? rgb[pixel * 3 + channel] : rgb[pixel * 3 + channel] >>> 8;
        output[at + 3] = space === "CMYK" ? 255 : alpha ? alpha[pixel] : data[at + 3];
      }
    }
    return output;
  } finally {
    if (inputPointer) cms.free(inputPointer);
    if (outputPointer) cms.free(outputPointer);
    if (transform) cms.cmsDeleteTransform(transform);
    if (destination) cms.cmsCloseProfile(destination);
    if (source) cms.cmsCloseProfile(source);
  }
}

const ascii = (bytes: Uint8Array, from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));

/** Read ICC chunks without decoding pixels; malformed profiles fall back like libvips. */
export async function imageProfile(bytes: Uint8Array, format: ImageFormat): Promise<Uint8Array | null> {
  if (format === "jpeg") {
    const parts = new Map<number, Uint8Array>();
    let count = 0;
    for (const { marker, from, to } of jpegSegments(bytes)) {
      if (marker !== 0xe2 || to - from < 14 || ascii(bytes, from, from + 12) !== "ICC_PROFILE\0") continue;
      const index = bytes[from + 12], total = bytes[from + 13];
      if (!index || index > total || (count && count !== total) || parts.has(index)) return null;
      count = total; parts.set(index, bytes.subarray(from + 14, to));
    }
    if (!count || parts.size !== count) return null;
    const output = new Uint8Array([...parts.values()].reduce((size, part) => size + part.length, 0));
    let at = 0;
    for (let index = 1; index <= count; index++) { const part = parts.get(index)!; output.set(part, at); at += part.length; }
    return output;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let at = format === "png" ? 8 : 12; at + 12 <= bytes.length;) {
    const size = view.getUint32(format === "png" ? at : at + 4, format === "webp");
    const from = at + 8, to = from + size;
    if (to > bytes.length) return null;
    const name = ascii(bytes, format === "png" ? at + 4 : at, format === "png" ? from : at + 4);
    if (format === "webp" && name === "ICCP") return bytes.subarray(from, to);
    if (format === "png" && name === "iCCP") {
      let start = from;
      while (start < to && bytes[start] !== 0) start++;
      if (start === from || start - from > 79 || bytes[start + 1] !== 0) return null;
      const reader = new Blob([bytes.slice(start + 2, to)]).stream().pipeThrough(new DecompressionStream("deflate")).getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          length += value.length;
          if (length > 8 * 1024 * 1024) { await reader.cancel(); return null; }
          chunks.push(value);
        }
      } catch { return null; }
      const output = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
      return output;
    }
    if (format === "png" && name === "IDAT") return null;
    at = to + (format === "png" ? 4 : size & 1);
  }
  return null;
}
