import { describe, expect, it } from "vitest";

import { clampOffset, cropRect, imageLayout, zoomOffset } from "./crop";

const V = 280;

describe("avatar crop geometry", () => {
  it("centres a landscape image on its shorter side", () => {
    expect(cropRect({ width: 1200, height: 800 }, V, 1, { x: 0, y: 0 })).toEqual({ x: 200, y: 0, side: 800 });
  });

  it("centres a portrait image and zooms into its middle", () => {
    const rect = cropRect({ width: 600, height: 900 }, V, 2, { x: 0, y: 0 });
    expect(rect.side).toBe(300);
    expect(rect.x).toBe(150);
    expect(rect.y).toBe(300);
  });

  it("never leaves the image edges, even for small images", () => {
    const image = { width: 64, height: 40 };
    expect(clampOffset({ x: 9999, y: 9999 }, image, V, 1)).toEqual({ x: (64 * 7 - V) / 2, y: 0 });
    const rect = cropRect(image, V, 1, { x: -9999, y: 0 });
    expect(rect.x + rect.side).toBeCloseTo(64);
    expect(rect.y).toBe(0);
    expect(rect.side).toBe(40);
  });

  it("matches what the preview shows", () => {
    const image = { width: 1000, height: 700 };
    const offset = clampOffset({ x: 40, y: -30 }, image, V, 1.7);
    const layout = imageLayout(image, V, 1.7, offset);
    const rect = cropRect(image, V, 1.7, offset);
    const scale = layout.width / image.width;
    // The viewport's top-left corner maps to the crop's top-left corner in image pixels.
    expect(-layout.left / scale).toBeCloseTo(rect.x);
    expect(-layout.top / scale).toBeCloseTo(rect.y);
    expect(V / scale).toBeCloseTo(rect.side);
  });

  it("keeps the centred point when zooming and clamps when zooming out", () => {
    const image = { width: 800, height: 800 };
    expect(zoomOffset({ x: 50, y: -20 }, image, V, 2, 3)).toEqual({ x: 75, y: -30 });
    expect(zoomOffset({ x: 100, y: 100 }, image, V, 2, 1)).toEqual({ x: 0, y: 0 });
  });
});
