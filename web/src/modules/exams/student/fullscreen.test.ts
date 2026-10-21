// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { enterFullscreen, exitFullscreen, fullscreenSupported } from "./fullscreen";
const element = (value: Element | null) => Object.defineProperty(document, "fullscreenElement", { configurable: true, value });
beforeEach(() => {
  element(null);
  Object.defineProperty(document, "fullscreenEnabled", { configurable: true, value: true });
  document.documentElement.requestFullscreen = vi.fn(async () => { element(document.documentElement); });
  document.exitFullscreen = vi.fn(async () => { element(null); });
});
describe("element fullscreen adapter", () => {
  it("calls the actual request synchronously and verifies the resulting element", async () => {
    const entered = enterFullscreen();
    expect(document.documentElement.requestFullscreen).toHaveBeenCalledOnce();
    expect(await entered).toBe(true);
    await exitFullscreen(); expect(document.exitFullscreen).toHaveBeenCalledOnce();
  });
  it("rejects unsupported, policy denied, rejected and canceled acquisition", async () => {
    Object.defineProperty(document, "fullscreenEnabled", { configurable: true, value: false });
    expect(fullscreenSupported()).toBe(false); expect(await enterFullscreen()).toBe(false);
    Object.defineProperty(document, "fullscreenEnabled", { configurable: true, value: true });
    document.documentElement.requestFullscreen = vi.fn(async () => { throw Error("permission denied"); });
    expect(await enterFullscreen()).toBe(false);
    document.documentElement.requestFullscreen = vi.fn(async () => {});
    expect(await enterFullscreen()).toBe(false);
  });
  it("does not exit fullscreen belonging to another element", async () => {
    await enterFullscreen(); element(document.body); await exitFullscreen();
    expect(document.exitFullscreen).not.toHaveBeenCalled();
  });
  it("cancels an acquisition that completes after cleanup", async () => {
    let done!: () => void;
    document.documentElement.requestFullscreen = vi.fn(() => new Promise<void>((resolve) => { done = resolve; }));
    const acquisition = enterFullscreen(); await exitFullscreen();
    element(document.documentElement); done(); expect(await acquisition).toBe(false);
    expect(document.fullscreenElement).toBeNull();
  });
  it("blocks another acquisition while intentional exit is still pending", async () => {
    await enterFullscreen(); let done!: () => void;
    document.exitFullscreen = vi.fn(() => new Promise<void>((resolve) => { done = resolve; }));
    const exiting = exitFullscreen(); expect(await enterFullscreen()).toBe(false);
    expect(document.documentElement.requestFullscreen).toHaveBeenCalledOnce();
    element(null); done(); await exiting; expect(fullscreenSupported()).toBe(true);
  });

});
