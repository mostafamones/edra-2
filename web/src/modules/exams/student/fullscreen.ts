/** Standard element fullscreen only. Never infer support from a device name or display mode. */
export function fullscreenSupported() {
  return !exiting && typeof document !== "undefined" && document.documentElement.isConnected
    && typeof document.documentElement.requestFullscreen === "function"
    && typeof document.exitFullscreen === "function" && document.fullscreenEnabled !== false;
}
export function examFullscreen() {
  return document.fullscreenElement === document.documentElement;
}
let owned = false;
let exiting = false;
let acquisition = 0;
let observing = false;
export function enterFullscreen(): Promise<boolean> {
  if (!fullscreenSupported()) return Promise.resolve(false);
  if (!observing) {
    document.addEventListener("fullscreenchange", () => { if (!examFullscreen()) owned = false; });
    observing = true;
  }
  const epoch = ++acquisition;
  // Invoke synchronously: the caller is still inside the explicit user gesture.
  try {
    return document.documentElement.requestFullscreen().then(async () => {
      if (epoch !== acquisition) {
        if (!owned && examFullscreen()) await document.exitFullscreen().catch(() => {});
        return false;
      }
      owned = examFullscreen();
      return owned;
    }, () => false);
  } catch { return Promise.resolve(false); }
}
export async function exitFullscreen() {
  ++acquisition;
  const exit = owned && examFullscreen();
  owned = false;
  if (exit) {
    exiting = true;
    try { await document.exitFullscreen(); } catch { /* The browser may already have exited. */ }
    finally { exiting = false; }
  }
}
