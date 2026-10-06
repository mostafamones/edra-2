import { afterEach, describe, expect, it, vi } from "vitest";

import { copyInvitationLink } from "./clipboard";

class PendingClipboardItem {
  constructor(readonly data: Record<string, Promise<Blob>>) {}
}

afterEach(() => vi.unstubAllGlobals());

describe("invitation clipboard writes", () => {
  it("requests clipboard access before the invitation response arrives", async () => {
    let resolveLink!: (link: string) => void;
    const link = new Promise<string>((resolve) => { resolveLink = resolve; });
    let copied = "";
    const write = vi.fn(async (items: PendingClipboardItem[]) => {
      copied = await (await items[0].data["text/plain"]).text();
    });
    vi.stubGlobal("window", { isSecureContext: true });
    vi.stubGlobal("navigator", { clipboard: { write } });
    vi.stubGlobal("ClipboardItem", PendingClipboardItem);

    const copying = copyInvitationLink(link, {} as HTMLElement);
    expect(write).toHaveBeenCalledOnce();
    expect(copied).toBe("");
    resolveLink("https://edra.example/invite/staff/token");
    await copying;
    expect(copied).toBe("https://edra.example/invite/staff/token");
  });

  it("does not report a successful copy when invitation creation fails", async () => {
    const error = new Error("Invitation creation failed");
    const write = vi.fn(async (items: PendingClipboardItem[]) => {
      await items[0].data["text/plain"];
    });
    vi.stubGlobal("window", { isSecureContext: true });
    vi.stubGlobal("navigator", { clipboard: { write } });
    vi.stubGlobal("ClipboardItem", PendingClipboardItem);

    await expect(copyInvitationLink(Promise.reject(error), {} as HTMLElement)).rejects.toBe(error);
  });
});
