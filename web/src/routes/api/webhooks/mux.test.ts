import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), sync: vi.fn() }));
vi.mock("@/lib/video/mux", () => ({ validMuxWebhook: mocks.verify }));
vi.mock("@/modules/content/server", () => ({ synchronizeProviderUpload: mocks.sync }));
import { POST } from "@/lib/api/adapters/webhooks/mux/handler.server";

afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

describe("Mux webhook HTTP boundary", () => {
  it("requires configuration and rejects declared oversized requests", async () => {
    vi.stubEnv("MUX_WEBHOOK_SECRET", "");
    expect((await POST(new Request("https://example.test/api/webhooks/mux", { method: "POST" }))).status).toBe(503);
    vi.stubEnv("MUX_WEBHOOK_SECRET", "secret");
    expect((await POST(new Request("https://example.test/api/webhooks/mux", { method: "POST", headers: { "content-length": "1048577" } }))).status).toBe(413);
  });

  it("verifies the unmodified body before parsing and synchronizing", async () => {
    vi.stubEnv("MUX_WEBHOOK_SECRET", "secret");
    const body = '{ "type":"video.upload.ready", "data":{"id":"upload"} }';
    mocks.verify.mockReturnValueOnce(false).mockReturnValueOnce(true);
    const request = () => new Request("https://example.test/api/webhooks/mux", { method: "POST", headers: { "mux-signature": "signature" }, body });
    expect((await POST(request())).status).toBe(401);
    expect(mocks.sync).not.toHaveBeenCalled();
    expect((await POST(request())).status).toBe(204);
    expect(mocks.verify).toHaveBeenCalledWith(body, "signature", "secret");
    expect(mocks.sync).toHaveBeenCalledWith("upload");
  });
});
