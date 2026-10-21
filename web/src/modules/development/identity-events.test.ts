import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/lib/query-client", () => ({ clearBrowserQueryCache: vi.fn() }));
vi.mock("@/modules/exams/browser", () => ({ setExamJournalAccount: vi.fn() }));

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

it("reloads other tabs without reloading the tab navigating to the student host", async () => {
  const channels = new Set<Channel>();
  class Channel {
    onmessage: ((event: { data: unknown }) => void) | null = null;
    constructor(public name: string) { channels.add(this); }
    postMessage(data: unknown) {
      for (const channel of channels) {
        if (channel !== this && channel.name === this.name) channel.onmessage?.({ data });
      }
    }
    close() { channels.delete(this); }
  }
  vi.stubGlobal("BroadcastChannel", Channel);
  const assign = vi.fn();
  vi.stubGlobal("window", { location: { assign } });
  vi.resetModules();
  const currentTab = await import("./client");
  vi.resetModules();
  const otherTab = await import("./client");
  const currentReload = vi.fn();
  const otherReload = vi.fn();
  const stopCurrent = currentTab.onIdentityChange(currentReload);
  const stopOther = otherTab.onIdentityChange(otherReload);
  await currentTab.leaveForIdentity("http://learn.lvh.me:3000/edra-dev-be8db1dc");
  expect(currentReload).not.toHaveBeenCalled();
  expect(otherReload).toHaveBeenCalledTimes(1);
  expect(assign).toHaveBeenLastCalledWith("http://learn.lvh.me:3000/edra-dev-be8db1dc");
  await currentTab.leaveForIdentity("http://app.lvh.me:3000/edra-dev-be8db1dc/students");
  expect(currentReload).not.toHaveBeenCalled();
  expect(otherReload).toHaveBeenCalledTimes(2);
  expect(assign).toHaveBeenLastCalledWith("http://app.lvh.me:3000/edra-dev-be8db1dc/students");
  stopCurrent();
  stopOther();
});
