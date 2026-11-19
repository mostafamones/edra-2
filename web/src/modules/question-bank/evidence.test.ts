// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cropSource } from "./evidence";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("renders only the requested rectangle at the source resolution", async () => {
  const close = vi.fn();
  const drawImage = vi.fn();
  const bitmap = { width: 1000, height: 2000, close };
  const source = new Blob(["page"]);
  const cropped = new Blob(["crop"], { type: "image/jpeg" });
  vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, callback) {
    expect([this.width, this.height]).toEqual([600, 500]);
    callback(cropped);
  });
  await expect(cropSource(source, { left: 0.2, right: 0.8, top: 0.25, bottom: 0.5 })).resolves.toBe(cropped);
  expect(drawImage).toHaveBeenCalledWith(bitmap, 200, 500, 600, 500, 0, 0, 600, 500);
  expect(close).toHaveBeenCalledOnce();
});
