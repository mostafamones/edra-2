import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

// Loads public/notifications-sw.js as a plain script (it exports its handlers outside a worker).
const source = readFileSync(join(__dirname, "../../../public/notifications-sw.js"), "utf8");
const sw = (() => { const module = { exports: {} as Record<string, unknown> }; new Function("module", source)(module); return module.exports; })() as {
  parseMessage: (data: unknown) => unknown; safeUrl: (value: unknown, origin: string) => URL | null;
  onPush: (event: unknown, scope: unknown) => void; onClick: (event: unknown, scope: unknown) => void; OPEN_MESSAGE: string;
};
const origin = "https://app.edra.test";
const message = { v: 1, id: "11111111-1111-4111-8111-111111111111", title: "Late fees", body: "Mona: Please check", tag: "concern:c", url: "/north?concern=c" };

function scope(clients: { url: string; focused?: boolean; visibilityState?: string }[] = []) {
  const windows = clients.map((client) => ({ ...client, postMessage: vi.fn(), focus: vi.fn(async () => client) }));
  return {
    windows,
    location: { origin },
    registration: { showNotification: vi.fn(async () => undefined) },
    clients: { matchAll: vi.fn(async () => windows), openWindow: vi.fn(async () => null) },
  };
}
const waiting = () => { const promises: Promise<unknown>[] = []; return { promises, waitUntil: (promise: Promise<unknown>) => promises.push(promise) }; };

describe("notification service worker", () => {
  it("shows a valid message as plain text with a same-origin target", async () => {
    const target = scope(); const event = { ...waiting(), data: { json: () => message } };
    sw.onPush(event, target);
    await Promise.all(event.promises);
    expect(target.registration.showNotification).toHaveBeenCalledWith("Late fees", { body: "Mona: Please check", tag: "concern:c", data: { url: "/north?concern=c" } });
  });

  it("shows a generic notification for malformed or unparsable data", async () => {
    for (const data of [{ json: () => ({ ...message, v: 2 }) }, { json: () => { throw new Error("bad"); } }, null]) {
      const target = scope(); const event = { ...waiting(), data };
      sw.onPush(event, target);
      await Promise.all(event.promises);
      expect(target.registration.showNotification).toHaveBeenCalledWith("Edra", { body: "New activity" });
    }
  });

  it("accepts only same-origin paths", () => {
    expect(sw.safeUrl("/north?concern=c", origin)?.href).toBe(`${origin}/north?concern=c`);
    for (const bad of ["https://evil.test/x", "//evil.test/x", "javascript:alert(1)", "north", 5]) expect(sw.safeUrl(bad, origin)).toBeNull();
  });

  it("focuses an open Edra window and asks it to route in-app", async () => {
    const target = scope([{ url: `${origin}/south`, visibilityState: "hidden" }, { url: `${origin}/north/students`, focused: true }, { url: "https://other.test/" }]);
    const event = { ...waiting(), notification: { close: vi.fn(), data: { url: "/north?concern=c" } } };
    sw.onClick(event, target);
    await Promise.all(event.promises);
    expect(event.notification.close).toHaveBeenCalled();
    expect(target.windows[1].postMessage).toHaveBeenCalledWith({ type: sw.OPEN_MESSAGE, url: "/north?concern=c" });
    expect(target.windows[1].focus).toHaveBeenCalled();
    expect(target.clients.openWindow).not.toHaveBeenCalled();
  });

  it("opens a new window when none is open, and never opens another origin", async () => {
    const target = scope([{ url: "https://other.test/" }]);
    const event = { ...waiting(), notification: { close: vi.fn(), data: { url: "/north?concern=c" } } };
    sw.onClick(event, target);
    await Promise.all(event.promises);
    expect(target.clients.openWindow).toHaveBeenCalledWith(`${origin}/north?concern=c`);
    const hostile = scope(); const click = { ...waiting(), notification: { close: vi.fn(), data: { url: "https://evil.test/" } } };
    sw.onClick(click, hostile);
    await Promise.all(click.promises);
    expect(hostile.clients.openWindow).toHaveBeenCalledWith("/");
  });
});
