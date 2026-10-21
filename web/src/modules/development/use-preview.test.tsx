// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ post: vi.fn(), leave: vi.fn(), invalidate: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: api.invalidate }),
  useQuery: vi.fn(),
}));
vi.mock("@/modules/auth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("./client", () => ({
  postPreview: api.post, leaveForIdentity: api.leave, PREVIEW_STATUS_KEY: ["development"],
  fetchPreviewStatus: vi.fn(), previewErrorMessage: vi.fn(), viewAsStudentRequest: vi.fn(),
}));

import { usePreviewAction } from "./use-preview";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("preview commands on HTTP development hosts", () => {
  it.each(["switch", "return"] as const)("issues a %s command without crypto.randomUUID", async (action) => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => {
      bytes.fill(42);
      return bytes;
    });
    vi.stubGlobal("crypto", { getRandomValues });
    api.post.mockResolvedValue({ ok: true, destination: "/academy" });
    const { result } = renderHook(() => usePreviewAction());
    expect(getRandomValues).not.toHaveBeenCalled();
    await act(async () => { await result.current.run(action, { runId: "run", expectedRevision: 1 }); });
    expect(api.post).toHaveBeenCalledWith(action, {
      runId: "run", expectedRevision: 1,
      commandId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
    });
    expect(getRandomValues).toHaveBeenCalledTimes(1);
    expect(api.leave).toHaveBeenCalledWith("/academy");
  });
});
