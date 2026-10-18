import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { AVATAR_SIZE, encodeAvatar } from "./image";

const square = (size: number, format: "png" | "jpeg" | "webp" | "gif", alpha = false) =>
  sharp({ create: { width: size, height: size, channels: alpha ? 4 : 3, background: alpha ? { r: 0, g: 0, b: 0, alpha: 0 } : "#3366ff" } })
    .withMetadata({ exif: { IFD0: { Copyright: "secret" } } })
    .toFormat(format).toBuffer();

describe("avatar encoding", () => {
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

  it("rejects non-square, tiny, unsupported, SVG and malformed input", async () => {
    expect(await encodeAvatar(await sharp({ create: { width: 600, height: 400, channels: 3, background: "#fff" } }).png().toBuffer())).toBeNull();
    expect(await encodeAvatar(await square(64, "png"))).toBeNull();
    expect(await encodeAvatar(await square(300, "gif"))).toBeNull();
    expect(await encodeAvatar(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"/>'))).toBeNull();
    expect(await encodeAvatar(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]))).toBeNull();
    expect(await encodeAvatar(new Uint8Array(0))).toBeNull();
  });

  it("rejects oversized uploads before decoding", async () => {
    expect(await encodeAvatar(new Uint8Array(901 * 1024))).toBeNull();
  });
});
