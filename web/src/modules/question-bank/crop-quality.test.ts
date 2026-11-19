import { expect, it } from "vitest";
import { cropQuality } from "./crop-quality";

const canvas = () => new Uint8ClampedArray(100 * 100 * 4).fill(255);
const dot = (pixels: Uint8ClampedArray, x: number, y: number) => pixels.set([0, 0, 0, 255], (y * 100 + x) * 4);

it("rejects blank suggestions and detects ink cut by a crop boundary", () => {
  const pixels = canvas();
  expect(cropQuality(pixels, 100, 100)).toBe("empty");
  for (let y = 30; y < 60; y++) for (let x = 0; x < 30; x++) dot(pixels, x, y);
  expect(cropQuality(pixels, 100, 100)).toBe("clipped");
});

it("accepts an inset figure and a complete continuous panel frame", () => {
  const pixels = canvas();
  for (let y = 30; y < 60; y++) for (let x = 30; x < 60; x++) dot(pixels, x, y);
  expect(cropQuality(pixels, 100, 100)).toBe("clear");
  for (let p = 0; p < 100; p++) { dot(pixels, p, 0); dot(pixels, p, 99); dot(pixels, 0, p); dot(pixels, 99, p); }
  expect(cropQuality(pixels, 100, 100)).toBe("clear");
});
