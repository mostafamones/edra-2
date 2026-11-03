import { readFileSync } from "node:fs";
import sharp from "sharp";
import { afterAll, describe, expect, it, vi } from "vitest";

import { JpegImage } from "pdfjs-dist/image_decoders/pdf.image_decoders.mjs";

import { AVATAR_SIZE, encodeAvatar } from "./image.server";
import { readImageHeader } from "./image-header";
import { decodeImage } from "./image-codecs.server";
import { imageProfile } from "./image-color.server";
import { manyScanCmyk } from "../../../workers-test/image-scans.mjs";

// Counts constructions of the real PDF.js JpegImage; its decoding logic stays untouched.
const pdf = vi.hoisted(() => ({ constructed: 0 }));
vi.mock("pdfjs-dist/image_decoders/pdf.image_decoders.mjs", async importOriginal => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actual = await importOriginal<any>();
  return { ...actual, JpegImage: class extends actual.JpegImage { constructor(...args: unknown[]) { pdf.constructed++; super(...args); } } };
});

// Only precompiled Wasm resources are adapted for Node; all production codec logic stays real.
const wasm = vi.hoisted(() => ({ compile: async (path: string) => {
  const { readFile } = await import("node:fs/promises");
  return WebAssembly.compile(await readFile(`node_modules/@jsquash/${path}`));
} }));
vi.mock("@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm?module", async () => ({ default: await wasm.compile("jpeg/codec/dec/mozjpeg_dec.wasm") }));
vi.mock("@jsquash/png/codec/pkg/squoosh_png_bg.wasm?module", async () => ({ default: await wasm.compile("png/codec/pkg/squoosh_png_bg.wasm") }));
vi.mock("@jsquash/webp/codec/dec/webp_dec.wasm?module", async () => ({ default: await wasm.compile("webp/codec/dec/webp_dec.wasm") }));
vi.mock("@jsquash/webp/codec/enc/webp_enc_simd.wasm?module", async () => ({ default: await wasm.compile("webp/codec/enc/webp_enc_simd.wasm") }));
vi.mock("./profiles/lcms/lcms.wasm?module", async () => {
  const { readFile } = await import("node:fs/promises");
  return { default: await WebAssembly.compile(await readFile("src/modules/account/profiles/lcms/lcms.wasm")) };
});
vi.mock("./profiles/cmyk.icm?url&inline", async () => {
  const { readFile } = await import("node:fs/promises");
  return { default: `data:application/octet-stream;base64,${(await readFile("src/modules/account/profiles/cmyk.icm")).toString("base64")}` };
});
vi.mock("./profiles/srgb.icm?url&inline", async () => {
  const { readFile } = await import("node:fs/promises");
  return { default: `data:application/octet-stream;base64,${(await readFile("src/modules/account/profiles/srgb.icm")).toString("base64")}` };
});
vi.mock("./profiles/p3.icm?url&inline", async () => {
  const { readFile } = await import("node:fs/promises");
  return { default: `data:application/octet-stream;base64,${(await readFile("src/modules/account/profiles/p3.icm")).toString("base64")}` };
});

const square = (size: number, format: "png" | "jpeg" | "webp" | "gif", alpha = false) =>
  sharp({ create: { width: size, height: size, channels: alpha ? 4 : 3, background: alpha ? { r: 0, g: 0, b: 0, alpha: 0 } : "#3366ff" } })
    .withMetadata({ exif: { IFD0: { Copyright: "secret" } } })
    .toFormat(format).toBuffer();

const REFERENCE = { limitInputPixels: 2048 * 2048, failOn: "error", animated: false } as const;
const deltas: { name: string; max: number; mean: number }[] = [];
// Measured maxima/means (sharp 0.35.4 reference) with headroom: ordinary codecs, soft-edged non-uniform CMYK, solid CMYK colours.
const TIGHT = { max: 4, mean: 1.5 }, NON_UNIFORM = { max: 48, mean: 5 };
afterAll(() => console.info(`avatar oracle delta table (max / mean RGB vs sharp)\n${deltas.map(d => `${d.name.padEnd(46)} ${String(d.max).padStart(3)} / ${d.mean.toFixed(3)}`).join("\n")}`));

const sharpAvatar = (input: Uint8Array) => sharp(input, REFERENCE).rotate().flatten({ background: "#ffffff" }).resize(512, 512).webp({ quality: 82 }).toBuffer();

/**
 * Encodes with ours and with the original sharp pipeline, and measures the RGB difference of the two WebPs.
 * Fixture bounds are maintained in this module’s README, Profile picture section.
 */
async function compare(name: string, input: Uint8Array, bounds?: { max: number; mean: number }) {
  const actual = await encodeAvatar(input);
  expect(actual, name).not.toBeNull();
  const expected = await sharp(await sharpAvatar(input)).removeAlpha().raw().toBuffer();
  const a = await sharp(actual!).removeAlpha().raw().toBuffer();
  let max = 0, sum = 0;
  for (let i = 0; i < a.length; i++) { const delta = Math.abs(a[i] - expected[i]); max = Math.max(max, delta); sum += delta; }
  const result = { name, max, mean: sum / a.length, expected };
  deltas.push(result);
  if (bounds) {
    expect(max, `${name}: max RGB delta`).toBeLessThanOrEqual(bounds.max);
    expect(result.mean, `${name}: mean RGB delta`).toBeLessThanOrEqual(bounds.mean);
  }
  return result;
}

/** The original acceptance rule: sharp decodes it, it is a square JPEG/PNG/WebP within the size limits, and the result fits. */
async function sharpAccepts(input: Uint8Array) {
  try {
    const meta = await sharp(input, REFERENCE).metadata();
    if (!meta.width || meta.width !== meta.height || meta.width < 128 || meta.width > 2048 || !["jpeg", "png", "webp"].includes(meta.format ?? "")) return false;
    return (await sharpAvatar(input)).length <= 256 * 1024;
  } catch { return false; }
}
const verdict = (accepts: boolean) => (accepts ? "accepts" : "rejects");

/**
 * Non-uniform test image: gradients plus feathered blocks, so channel mix-ups and flips are visible
 * while the resampler difference at hard edges (about 65 on plain RGB) does not mask colour error.
 */
function art(width: number, height = width) {
  const data = Buffer.alloc(width * height * 3);
  const feather = Math.max(4, width * 0.05);
  const cover = (x: number, y: number, x0: number, y0: number, x1: number, y1: number) =>
    Math.min(1, Math.max(0, Math.min(x - x0 * width, x1 * width - x, y - y0 * height, y1 * height - y) / feather));
  const blocks: [number[], number[]][] = [
    [[0.1, 0.1, 0.3, 0.35], [220, 30, 40]], [[0.6, 0.15, 0.85, 0.4], [20, 180, 60]],
    [[0.2, 0.6, 0.5, 0.9], [15, 15, 20]], [[0.65, 0.65, 0.95, 0.95], [250, 220, 20]],
  ];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const rgb = [(x / width) * 255, (y / height) * 255, ((x + y) / (width + height)) * 255];
      for (const [box, color] of blocks) {
        const weight = cover(x, y, box[0], box[1], box[2], box[3]);
        for (let channel = 0; channel < 3; channel++) rgb[channel] += (color[channel] - rgb[channel]) * weight;
      }
      data.set(rgb, (y * width + x) * 3);
    }
  }
  return data;
}

const cmykJpeg = (width: number, height = width, options: { progressive?: boolean } = {}) =>
  sharp(art(width, height), { raw: { width, height, channels: 3 } }).toColourspace("cmyk").jpeg(options).toBuffer();

const segment = (marker: number, payload: Buffer) => Buffer.concat([Buffer.from([0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 255]), payload]);
const insertAfterSoi = (jpeg: Buffer, ...segments: Buffer[]) => Buffer.concat([jpeg.subarray(0, 2), ...segments, jpeg.subarray(2)]);
const exifOrientation = (orientation: number) => {
  const tiff = Buffer.from([0x49, 0x49, 42, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, orientation, 0, 0, 0, 0, 0, 0, 0]);
  return segment(0xe1, Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]));
};
const iccProfile = (path = "node_modules/pdfjs-dist/iccs/CGATS001Compat-v2-micro.icc") =>
  segment(0xe2, Buffer.concat([Buffer.from("ICC_PROFILE\0", "latin1"), Buffer.from([1, 1]), readFileSync(path)]));

const adobeAt = (jpeg: Buffer) => jpeg.indexOf("Adobe");
/** Adobe APP14 transform: 0 = CMYK, 2 = YCCK. */
const withTransform = (jpeg: Buffer, transform: number) => { const copy = Buffer.from(jpeg); copy[adobeAt(jpeg) + 11] = transform; return copy; };
const withoutAdobe = (jpeg: Buffer) => {
  const from = adobeAt(jpeg) - 4;
  return Buffer.concat([jpeg.subarray(0, from), jpeg.subarray(from + 2 + jpeg.readUInt16BE(from + 2))]);
};
/** Offset of the Start-of-Frame marker; every segment before it is length-prefixed. */
function sofAt(jpeg: Buffer) {
  for (let at = 2; at + 4 <= jpeg.length; at += 2 + jpeg.readUInt16BE(at + 2)) {
    if (jpeg[at + 1] >= 0xc0 && jpeg[at + 1] <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(jpeg[at + 1])) return at;
  }
  throw new Error("no SOF");
}
const cornersOpaque = async (webp: Uint8Array) => {
  const { data } = await sharp(webp).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return [0, AVATAR_SIZE - 1, AVATAR_SIZE * (AVATAR_SIZE - 1), AVATAR_SIZE * AVATAR_SIZE - 1].every(index => data[index * 4 + 3] === 255);
};

// Wasm compilation on first use is slow on a busy machine.
describe("avatar encoding", { timeout: 60_000 }, () => {
  it("re-encodes a square crop as an opaque 512 px WebP without metadata", async () => {
    const output = await encodeAvatar(await square(600, "png", true));
    const meta = await sharp(output!).metadata();
    expect(meta).toMatchObject({ format: "webp", width: AVATAR_SIZE, height: AVATAR_SIZE });
    expect(meta.exif).toBeUndefined();
    const { data } = await sharp(output!).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    // Every corner pixel is fully opaque: no circular mask or transparency is stored.
    for (const index of [0, AVATAR_SIZE - 1, AVATAR_SIZE * (AVATAR_SIZE - 1), AVATAR_SIZE * AVATAR_SIZE - 1]) {
      expect(data[index * 4 + 3]).toBe(255);
    }
  });

  it("accepts JPEG and WebP crops", async () => {
    expect(await encodeAvatar(await square(512, "jpeg"))).not.toBeNull();
    expect(await encodeAvatar(await square(256, "webp"))).not.toBeNull();
  });

  it("compares additional codec variants with the original sharp pipeline", async () => {
    const source = sharp({ create: { width: 128, height: 128, channels: 4, background: { r: 40, g: 120, b: 210, alpha: 0.5 } } });
    const cases: [string, Buffer][] = [
      ["transparent png", await source.clone().png().toBuffer()],
      ["transparent webp", await source.clone().webp({ lossless: true }).toBuffer()],
      ["grayscale png", await source.clone().greyscale().png().toBuffer()],
      ["paletted png", await source.clone().png({ palette: true }).toBuffer()],
      ["16-bit png", await source.clone().toColourspace("rgb16").png().toBuffer()],
      ["progressive jpeg", await source.clone().jpeg({ progressive: true }).toBuffer()],
      ["CMYK jpeg", await source.clone().toColourspace("cmyk").jpeg().toBuffer()],
    ];
    expect((await sharp(cases.find(([name]) => name === "16-bit png")![1]).metadata()).depth).toBe("ushort");
    for (const [name, input] of cases) {
      await compare(name, input, TIGHT);
    }
    expect((await sharp(cases.find(([name]) => name === "CMYK jpeg")![1]).metadata()).space).toBe("cmyk");
  });

  it("preserves saturated CMYK colors and truly embedded CMYK profiles against sharp", async () => {
    for (const color of ["#3377cc", "#ff0000", "#00ff00", "#0000ff", "#000000", "#ffffff"]) {
      for (const embedded of [false, true]) {
        const plain = await sharp({ create: { width: 128, height: 128, channels: 3, background: color } }).toColourspace("cmyk").jpeg().toBuffer();
        // sharp's withIccProfile() on RGB data writes a 3-component JPEG, so the CMYK profile is inserted as APP2.
        const input = embedded ? insertAfterSoi(plain, iccProfile()) : plain;
        expect(input.indexOf("ICC_PROFILE") > 0, `${color} carries a profile`).toBe(embedded);
        expect((await sharp(input).metadata()).channels, color).toBe(4);
        await compare(`CMYK ${color} embedded=${embedded}`, input, TIGHT);
      }
    }
  });

  it("matches the native CMYK conversion before resizing or encoding", async () => {
    for (const color of ["#ff0000", "#000000", "#3377cc"]) {
      const input = await sharp({ create: { width: 128, height: 128, channels: 3, background: color } }).toColourspace("cmyk").jpeg().toBuffer();
      const decoded = await decodeImage("jpeg", input);
      const native = await sharp(input).removeAlpha().raw().toBuffer();
      let max = 0;
      for (let pixel = 0; pixel < native.length / 3; pixel++) for (let channel = 0; channel < 3; channel++) max = Math.max(max, Math.abs(decoded.data[pixel * 4 + channel] - native[pixel * 3 + channel]));
      expect(max, `${color} raw ICC conversion`).toBe(0);
    }
  });

  it("converts embedded sRGB and P3 profiles in RGB JPEG, PNG and WebP", async () => {
    for (const profile of ["srgb", "p3"]) for (const format of ["jpeg", "png", "webp"] as const) {
      const input = await sharp({ create: { width: 512, height: 512, channels: 3, background: "#c03070" } }).withIccProfile(profile).toFormat(format).toBuffer();
      expect((await sharp(input).metadata()).icc, `${format} ${profile} fixture is tagged`).toBeDefined();
      expect(await imageProfile(input, format), "container profile is read").not.toBeNull();
      await compare(`${format} RGB ${profile}`, input, TIGHT);
    }
    const transparent = await sharp({ create: { width: 512, height: 512, channels: 4, background: { r: 190, g: 40, b: 100, alpha: 0.5 } } }).withIccProfile("p3").png().toBuffer();
    await compare("PNG P3 with alpha", transparent, TIGHT);
    for (const profile of ["srgb", "p3"]) {
      const input = await sharp({ create: { width: 512, height: 512, channels: 3, background: "#c03070" } }).withIccProfile(profile).toColourspace("rgb16").png().toBuffer();
      expect((await sharp(input).metadata()).depth, "real 16-bit profile fixture").toBe("ushort");
      expect(input[24]).toBe(16);
      await expect(decodeImage("png", input)).resolves.toBeDefined();
      await compare(`PNG 16-bit ${profile}`, input, TIGHT);
    }
  });

  it("assembles split RGB and CMYK ICC segments and ignores an invalid RGB profile", async () => {
    for (const cmyk of [false, true]) {
      const profile = readFileSync(cmyk ? "node_modules/pdfjs-dist/iccs/CGATS001Compat-v2-micro.icc" : "src/modules/account/profiles/srgb.icm");
      const total = Math.ceil(profile.length / 200);
      const parts = Array.from({ length: total }, (_, index) => segment(0xe2, Buffer.concat([Buffer.from("ICC_PROFILE\0", "latin1"), Buffer.from([index + 1, total]), profile.subarray(index * 200, (index + 1) * 200)])));
      const builder = sharp({ create: { width: 128, height: 128, channels: 3, background: "#ff0000" } });
      const plain = await (cmyk ? builder.toColourspace("cmyk") : builder).jpeg().toBuffer();
      const input = insertAfterSoi(plain, ...parts.reverse());
      expect(await imageProfile(input, "jpeg")).toEqual(new Uint8Array(profile));
      await compare(`split ICC ${cmyk ? "CMYK" : "RGB"}`, input, TIGHT);
    }
    const plain = await sharp({ create: { width: 128, height: 128, channels: 3, background: "#c03070" } }).jpeg().toBuffer();
    const input = insertAfterSoi(plain, segment(0xe2, Buffer.concat([Buffer.from("ICC_PROFILE\0", "latin1"), Buffer.from([1, 1]), Buffer.alloc(132)])));
    await expect(decodeImage("jpeg", input)).resolves.toBeDefined();
    await compare("RGB invalid profile fallback", input, TIGHT);
  });

  it("rejects non-square, tiny, unsupported, SVG and malformed input", async () => {
    expect(await encodeAvatar(await sharp({ create: { width: 600, height: 400, channels: 3, background: "#fff" } }).png().toBuffer())).toBeNull();
    expect(await encodeAvatar(await square(64, "png"))).toBeNull();
    expect(await encodeAvatar(await square(300, "gif"))).toBeNull();
    expect(await encodeAvatar(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"/>'))).toBeNull();
    expect(await encodeAvatar(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]))).toBeNull();
    expect(await encodeAvatar(new Uint8Array(0))).toBeNull();
  });

  it("rejects truncated and corrupt input that a decoder would otherwise accept", async () => {
    for (const format of ["jpeg", "png", "webp"] as const) {
      const whole = await square(300, format);
      expect(await encodeAvatar(whole.subarray(0, Math.floor(whole.length * 0.6)))).toBeNull();
    }
    const png = Buffer.from(await square(300, "png"));
    png[20] ^= 0xff;
    expect(await encodeAvatar(png)).toBeNull();
  });

  it("checks malformed containers against the original sharp acceptance rule", async () => {
    const png = await square(128, "png");
    const webp = await square(128, "webp");
    const badCrc = Buffer.from(png); badCrc[29] ^= 1;
    const zero = Buffer.from(png); zero.writeUInt32BE(0, 16);
    let crc = 0xffffffff;
    for (const byte of zero.subarray(12, 29)) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    zero.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 29);
    const extended = await sharp(await square(128, "webp")).withMetadata().webp().toBuffer();
    expect(extended.toString("ascii", 12, 16)).toBe("VP8X");
    extended.writeUIntLE(128, 24, 3);
    const overrun = Buffer.from(webp); overrun.writeUInt32LE(overrun.length + 20, 4);
    const cases: [string, Uint8Array][] = [
      ["non-image", new Uint8Array([1, 2, 3])], ["zero width valid CRC", zero], ["bad IHDR CRC", badCrc], ["VP8X canvas mismatch", extended],
      ["truncated PNG", png.subarray(0, png.length - 8)], ["RIFF overrun", overrun],
      ["non-square", await sharp({ create: { width: 128, height: 129, channels: 3, background: "#fff" } }).png().toBuffer()],
      ["under minimum", await square(127, "png")], ["over maximum", await square(2049, "png")],
    ];
    for (const [name, input] of cases) {
      let accepted = false;
      try {
        const image = sharp(input, { limitInputPixels: 2048 * 2048, failOn: "error", animated: false });
        const meta = await image.metadata();
        if (meta.width && meta.height && meta.width === meta.height && meta.width >= 128 && meta.width <= 2048 && ["jpeg", "png", "webp"].includes(meta.format ?? "")) {
          accepted = (await image.rotate().flatten({ background: "#ffffff" }).resize(512, 512).webp({ quality: 82 }).toBuffer()).length <= 256 * 1024;
        }
      } catch { /* The original rejects decoder errors. */ }
      if (name === "zero width valid CRC" || name === "VP8X canvas mismatch") expect(accepted, name).toBe(false);
      const actual = await encodeAvatar(input);
      console.info(`avatar oracle malformed ${name}: sharp=${accepted}, new=${actual !== null}`);
      expect(actual, name).toBeNull();
    }
  });

  it("rejects dimensions above the limit from the header, before decoding", async () => {
    const big = await sharp({ create: { width: 2049, height: 2049, channels: 3, background: "#fff" } }).png({ compressionLevel: 9 }).toBuffer();
    expect(big.length).toBeLessThan(900 * 1024);
    expect(await encodeAvatar(big)).toBeNull();
  });

  it("matches sharp's first animation frame, including an offset frame", async () => {
    for (const [lossless, alpha] of [[false, 128], [true, 128], [false, 255], [true, 255]] as const) {
      const pixels = Buffer.alloc(128 * 256 * 4);
      for (let i = 0; i < pixels.length; i += 4) {
        pixels[i] = i < pixels.length / 2 ? 200 : 20;
        pixels[i + 1] = 60; pixels[i + 2] = 120; pixels[i + 3] = alpha;
      }
      const animated = await sharp(pixels, { raw: { width: 128, height: 256, channels: 4, pageHeight: 128 } }).webp({ lossless, delay: [100, 100] }).toBuffer();
      expect((await sharp(animated).metadata()).pages).toBe(2);
      const reserved = Buffer.from(animated);
      reserved[reserved.indexOf("ANMF") + 23] |= 0xfc;
      await expect(sharp(reserved, { animated: false, failOn: "error" }).rotate().flatten({ background: "#ffffff" }).resize(512, 512).webp().toBuffer()).resolves.toBeTruthy();
      expect(await encodeAvatar(reserved)).not.toBeNull();
      const variants = [animated];
      // Enlarge the canvas and offset the first frame; ANIM background is deliberately non-white.
      const offset = Buffer.from(animated);
      offset.writeUIntLE(255, 24, 3); offset.writeUIntLE(255, 27, 3);
      const anim = offset.indexOf("ANIM"), anmf = offset.indexOf("ANMF");
      offset.set([30, 80, 220, 255], anim + 8);
      offset.writeUIntLE(16, anmf + 8, 3); offset.writeUIntLE(24, anmf + 11, 3);
      variants.push(offset);
      for (const input of variants) {
        const expected = await sharp(input, { animated: false, failOn: "error", limitInputPixels: 2048 * 2048 }).rotate().flatten({ background: "#ffffff" }).resize(512, 512).webp({ quality: 82 }).toBuffer();
        const output = await encodeAvatar(input);
        expect(output).not.toBeNull();
        const a = await sharp(output!).removeAlpha().raw().toBuffer();
        const b = await sharp(expected).removeAlpha().raw().toBuffer();
        let max = 0, sum = 0;
        for (let i = 0; i < a.length; i++) { const delta = Math.abs(a[i] - b[i]); max = Math.max(max, delta); sum += delta; }
        console.info(`avatar oracle animated ${lossless ? "lossless" : "lossy"} alpha=${alpha} ${input === offset ? "offset" : "full"}: max RGB delta ${max}, mean ${sum / a.length}`);
        // Resizer and WebP encoder differ most at sharp frame boundaries.
        expect(max).toBeLessThanOrEqual(96);
        expect(sum / a.length).toBeLessThanOrEqual(2);
      }
      const invalid = Buffer.from(animated);
      invalid.writeUIntLE(127, invalid.indexOf("ANMF") + 8, 3);
      expect(await encodeAvatar(invalid)).toBeNull();
      const mismatch = Buffer.from(animated);
      mismatch.writeUIntLE(126, mismatch.indexOf("ANMF") + 14, 3);
      expect(await encodeAvatar(mismatch)).toBeNull();
      expect(await encodeAvatar(animated.subarray(0, animated.length - 2))).toBeNull();
    }
  });

  it("composes EXIF orientation as sharp's rotate() does", async () => {
    // Left half red, right half blue; orientation 6 stores the image rotated, so upright is red on top.
    const half = await sharp({ create: { width: 150, height: 300, channels: 3, background: "#ff0000" } }).png().toBuffer();
    const base = await sharp({ create: { width: 300, height: 300, channels: 3, background: "#0000ff" } }).composite([{ input: half, left: 0, top: 0 }]);
    for (const format of ["jpeg", "png", "webp"] as const) {
      for (const orientation of [1, 2, 3, 4, 5, 6, 7, 8]) {
        const input = await base.clone().withMetadata({ orientation }).toFormat(format).toBuffer();
        const expected = await sharp(input).rotate().resize(16, 16).removeAlpha().raw().toBuffer();
        const actual = await sharp((await encodeAvatar(input))!).resize(16, 16).removeAlpha().raw().toBuffer();
        for (let at = 0; at < actual.length; at++) expect(Math.abs(actual[at] - expected[at])).toBeLessThan(48);
      }
    }
  });

  it("matches sharp for non-uniform CMYK at 128 and 2048 within the upload limit", async () => {
    for (const size of [128, 2048]) {
      const input = await cmykJpeg(size);
      expect(input.length, `CMYK ${size} fixture`).toBeLessThanOrEqual(900 * 1024);
      expect(await sharp(input).metadata()).toMatchObject({ space: "cmyk", channels: 4 });
      await compare(`non-uniform CMYK ${size}`, input, NON_UNIFORM);
    }
  });

  it("matches sharp for Adobe transform 0, YCCK, no-Adobe and progressive CMYK", async () => {
    const base = await cmykJpeg(256);
    expect(base[adobeAt(base) + 11]).toBe(0);
    const progressive = await cmykJpeg(256, 256, { progressive: true });
    expect(progressive[sofAt(progressive) + 1], "sharp emits progressive CMYK").toBe(0xc2);
    const variants: [string, Buffer][] = [
      ["transform 0 (explicit)", withTransform(base, 0)], ["YCCK", withTransform(base, 2)], ["no Adobe", withoutAdobe(base)], ["progressive", progressive],
    ];
    expect(variants[2][1].indexOf("Adobe")).toBe(-1);
    for (const [name, input] of variants) {
      expect((await sharp(input).metadata()).channels, name).toBe(4);
      await compare(`CMYK 256 ${name}`, input, NON_UNIFORM);
    }
  });

  it("applies all eight EXIF orientations to CMYK as sharp's rotate() does", async () => {
    const base = await cmykJpeg(160);
    let upright: Buffer | undefined;
    for (const orientation of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const input = insertAfterSoi(base, exifOrientation(orientation));
      expect((await sharp(input).metadata()).orientation).toBe(orientation);
      const { expected } = await compare(`CMYK 160 orientation ${orientation}`, input, NON_UNIFORM);
      if (!upright) upright = expected;
      else {
        // The fixture must tell orientations apart, or matching sharp proves nothing.
        let difference = 0;
        for (let i = 0; i < expected.length; i++) difference += Math.abs(expected[i] - upright[i]);
        expect(difference / expected.length, `orientation ${orientation} is distinguishable`).toBeGreaterThan(10);
      }
    }
  });

  it("outputs an opaque 512 px WebP without exif or icc for CMYK input that carries both", async () => {
    const input = insertAfterSoi(await cmykJpeg(256), exifOrientation(6), iccProfile());
    const source = await sharp(input).metadata();
    expect(source).toMatchObject({ channels: 4, orientation: 6 });
    expect(source.icc).toBeDefined();
    const output = (await encodeAvatar(input))!;
    const meta = await sharp(output).metadata();
    expect(meta).toMatchObject({ format: "webp", width: AVATAR_SIZE, height: AVATAR_SIZE });
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(await cornersOpaque(output)).toBe(true);
    await compare("CMYK 256 exif+icc", input, NON_UNIFORM);
  });

  it("keeps three-component and grayscale JPEG off the PDF.js CMYK path", async () => {
    const rgb = await sharp(art(256), { raw: { width: 256, height: 256, channels: 3 } }).jpeg().toBuffer();
    const gray = await sharp(art(256), { raw: { width: 256, height: 256, channels: 3 } }).toColourspace("b-w").jpeg().toBuffer();
    expect([rgb[sofAt(rgb) + 9], gray[sofAt(gray) + 9]], "SOF component counts").toEqual([3, 1]);
    const before = pdf.constructed;
    expect(await encodeAvatar(rgb)).not.toBeNull();
    expect(await encodeAvatar(gray)).not.toBeNull();
    expect(pdf.constructed).toBe(before);
    expect(await encodeAvatar(await cmykJpeg(128))).not.toBeNull();
    expect(pdf.constructed, "positive control: CMYK does use PDF.js").toBeGreaterThan(before);
  });

  it("rejects corrupt and out-of-range CMYK like an invalid image", async () => {
    const base = await cmykJpeg(128);
    const sof = sofAt(base);
    const badSof = Buffer.from(base); badSof.writeUInt16BE(17, sof + 2);
    const zeroOne = Buffer.from(base); zeroOne[sof + 11] = 0;
    const zeroAll = Buffer.from(base); for (const at of [11, 14, 17, 20]) zeroAll[sof + at] = 0;
    const oversize = await cmykJpeg(2049);
    expect(oversize.length, "2049 fixture reaches the dimension check").toBeLessThanOrEqual(900 * 1024);
    const cases: [string, Uint8Array][] = [
      ["truncated", base.subarray(0, Math.floor(base.length * 0.6))], ["missing EOI", base.subarray(0, base.length - 2)],
      ["SOF length for 4 components wrong", badSof], ["2049 square", oversize],
      ["non-square 256x128", await cmykJpeg(256, 128)], ["non-square 128x129", await cmykJpeg(128, 129)],
      ["one zero sampling factor", zeroOne], ["all zero sampling factors", zeroAll],
    ];
    for (const [name, input] of cases) {
      console.info(`avatar oracle CMYK corruption ${name}: sharp=${verdict(await sharpAccepts(input))}, new=${verdict(!!(await encodeAvatar(input)))}`);
      expect(await encodeAvatar(input), name).toBeNull();
    }
  });

  it("rejects a hidden huge SOF behind a DQT with a too-short declared length", { timeout: 15_000 }, async () => {
    const base = await cmykJpeg(128);
    const sof = sofAt(base);
    const frame = base.subarray(sof, sof + 2 + base.readUInt16BE(sof + 2));
    const hidden = Buffer.from(frame); hidden.writeUInt16BE(65535, 7);
    const comment = Buffer.alloc(64 - frame.length, 0x20); // brings visible SOF + comment to exactly one 8-bit table
    const trick = Buffer.concat([Buffer.from([0xff, 0xdb, 0, 3, 0]), frame, segment(0xfe, comment.subarray(2)), hidden]);
    const input = Buffer.concat([base.subarray(0, sof), trick, base.subarray(sof + frame.length)]);
    // The header scan sees the visible frame, but PDF.js (which reads a whole table past the declared length) lands on the hidden one.
    expect(readImageHeader(input)).toMatchObject({ width: 128, height: 128 });
    const parsed = new JpegImage({}); parsed.parse(input, { dnlScanLines: 128 });
    expect(parsed.width, "unguarded PDF.js allocates for the hidden frame").toBe(65535);
    const started = performance.now(), constructed = pdf.constructed;
    expect(await encodeAvatar(input)).toBeNull();
    console.info(`avatar oracle hidden SOF: sharp=${verdict(await sharpAccepts(input))}, new rejected in ${Math.round(performance.now() - started)} ms, PDF.js constructions ${pdf.constructed - constructed}`);
  });

  it("rejects CMYK that could desynchronize PDF.js before it allocates", async () => {
    const base = await cmykJpeg(128);
    const sof = sofAt(base);
    const frame = base.subarray(sof, sof + 2 + base.readUInt16BE(sof + 2));
    const sampling = (value: number) => { const copy = Buffer.from(base); copy[sof + 11] = value; return copy; };
    const raw = (...bytes: number[]) => Buffer.from(bytes);
    const scan = base.indexOf(raw(0xff, 0xda));
    const shortScan = Buffer.from(base); shortScan.writeUInt16BE(base.readUInt16BE(scan + 2) - 2, scan + 2);
    const cases: [string, Uint8Array][] = [
      ["short DHT", insertAfterSoi(base, raw(0xff, 0xc4, 0, 3, 0))], ["short 16-bit DQT", insertAfterSoi(base, raw(0xff, 0xdb, 0, 3, 0x10))],
      ["DHT counts past its payload", insertAfterSoi(base, segment(0xc4, Buffer.from([0, 255, ...new Array(15).fill(0)])))],
      ["short DRI", insertAfterSoi(base, raw(0xff, 0xdd, 0, 2))], ["long DRI", insertAfterSoi(base, raw(0xff, 0xdd, 0, 5, 0, 0, 0))],
      ["sampling 0x51", sampling(0x51)], ["sampling 0x15", sampling(0x15)], ["duplicate frame", insertAfterSoi(base, frame)],
      ["APP ending on a fill byte", insertAfterSoi(base, segment(0xe0, Buffer.from([0])), raw(0xff))],
      ["unsupported pre-scan DNL", insertAfterSoi(base, raw(0xff, 0xdc, 0, 4, 0, 128))], ["first SOS length", shortScan],
    ];
    for (const [name, input] of cases) {
      const before = pdf.constructed;
      expect(await encodeAvatar(input), name).toBeNull();
      expect(pdf.constructed, `${name} never reaches PDF.js`).toBe(before);
    }
    const valid = await encodeAvatar(insertAfterSoi(base, raw(0xff, 0xdd, 0, 4, 0, 0)));
    expect(valid, "a correct empty DRI stays accepted").not.toBeNull();
  });

  it("accepts real 101 and 10,001-scan CMYK like Sharp, retaining late allocation guards", async () => {
    for (const scans of [101, 10001]) {
      const input = manyScanCmyk(2048, scans);
      expect(input.length).toBeLessThanOrEqual(900 * 1024);
      expect(await sharp(input, REFERENCE).metadata()).toMatchObject({ width: 2048, height: 2048, format: "jpeg" });
      // compare runs the baseline pipeline to completion; do not decode the
      // deliberately expensive reference twice merely to assert acceptance.
      await compare(`CMYK ${scans} scans`, input, TIGHT);
    }
    const input = manyScanCmyk(128, 10001);
    const late = (marker: Buffer) => Buffer.concat([input.subarray(0, -2), marker, input.subarray(-2)]);
    const base = await cmykJpeg(128), at = sofAt(base);
    const hidden = Buffer.from(base.subarray(at, at + 2 + base.readUInt16BE(at + 2)));
    hidden.writeUInt16BE(65535, 7);
    for (const marker of [hidden, Buffer.from([255, 219, 0, 3, 0]), Buffer.from([255, 196, 0, 3, 0]), Buffer.from([255, 221, 0, 2])]) {
      const before = pdf.constructed;
      expect(await encodeAvatar(late(marker))).toBeNull();
      expect(pdf.constructed, "unsafe marker after 10,001 scans rejected before allocation").toBe(before);
    }
  });

  it("counts real scans and skips marker-shaped metadata after entropy data", async () => {
    const base = await cmykJpeg(128);
    const markers = Buffer.from(new Array(120).fill([0xff, 0xda]).flat());
    for (const marker of [0xfe, 0xed]) {
      const input = Buffer.concat([base.subarray(0, base.length - 2), segment(marker, markers), base.subarray(base.length - 2)]);
      expect(await sharpAccepts(input), "metadata does not add scans").toBe(true);
      expect(await encodeAvatar(input), "marker-shaped APP/COM payload stays accepted").not.toBeNull();
    }
    const hiddenTable = Buffer.from([0xff, 0xdb, 0, 3, 0]);
    const input = Buffer.concat([base.subarray(0, base.length - 2), hiddenTable, base.subarray(base.length - 2)]);
    const before = pdf.constructed;
    expect(await encodeAvatar(input)).toBeNull();
    expect(pdf.constructed, "malformed tables after scans never reach PDF.js").toBe(before);
  });

  it("records sharp's and our verdict on corrupted CMYK scan data", async () => {
    const input = await cmykJpeg(256);
    const scan = input.indexOf(Buffer.from([0xff, 0xda])) + 2 + input.readUInt16BE(input.indexOf(Buffer.from([0xff, 0xda])) + 2);
    const end = input.length - 2;
    for (const [name, at, count] of [["1 byte at 50%", 0.5, 1], ["16 bytes at 50%", 0.5, 16], ["1 byte at 5%", 0.05, 1], ["1 byte at 95%", 0.95, 1]] as const) {
      const copy = Buffer.from(input);
      const from = scan + Math.floor((end - scan) * at);
      for (let i = from; i < from + count; i++) if ((copy[i] ^ 0x5a) !== 0xff && copy[i] !== 0xff && copy[i - 1] !== 0xff) copy[i] ^= 0x5a;
      const theirs = await sharpAccepts(copy);
      const ours = await encodeAvatar(copy);
      let detail = "";
      if (theirs && ours) { const { max, mean } = await compare(`corrupt scan ${name}`, copy); detail = `, delta max ${max} mean ${mean.toFixed(3)}`; }
      console.info(`avatar oracle corrupt CMYK scan ${name}: sharp=${verdict(theirs)}, new=${verdict(!!ours)}${detail}`);
    }
  });

  it("rejects oversized uploads before decoding", async () => {
    expect(await encodeAvatar(new Uint8Array(901 * 1024))).toBeNull();
  });
});
