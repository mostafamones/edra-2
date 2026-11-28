// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ post: vi.fn(), leave: vi.fn(), invalidate: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: api.invalidate }),
  useQuery: vi.fn(() => ({ data: undefined })),
}));
vi.mock("@/modules/auth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("./client", () => ({
  postPreview: api.post, leaveForIdentity: api.leave, PREVIEW_STATUS_KEY: ["development"],
  fetchPreviewStatus: vi.fn(), previewErrorMessage: vi.fn(), viewAsStudentRequest: vi.fn(),
}));

import { useLeaveDeletedAcademy, usePreviewAction } from "./use-preview";
import type { PreviewStatus } from "./types";

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

describe("leaving a deleted preview academy", () => {
  const preview = (academies: { id: string; academySlug: string }[]) => ({
    available: true, active: true, run: { id: "run-a", academySlug: "dev-a" }, academies, revision: 4, expiresAt: "",
    current: { kind: "staff", logicalId: "account:staff:owner", displayName: "Owner", role: "owner" },
    priorStaff: null, staffTargets: [], students: [],
  }) as PreviewStatus;

  it("switches to the next registered academy as its Owner", async () => {
    api.post.mockResolvedValue({ ok: true, destination: "/next" });
    const { result } = renderHook(() => useLeaveDeletedAcademy());
    let left = false;
    await act(async () => { left = await result.current("dev-a", preview([{ id: "run-a", academySlug: "dev-a" }, { id: "run-b", academySlug: "dev-b" }])); });
    expect(left).toBe(true);
    expect(api.post).toHaveBeenCalledWith("switch", expect.objectContaining({
      runId: "run-a", targetRunId: "run-b", logicalId: "account:staff:owner", expectedRevision: 4, returnTo: null }));
    expect(api.leave).toHaveBeenCalledWith("/next");
  });

  it("exits when no other academy is left, or when the switch fails", async () => {
    api.post.mockResolvedValue({ ok: true, destination: "/staff" });
    const { result } = renderHook(() => useLeaveDeletedAcademy());
    await act(async () => { await result.current("dev-a", preview([{ id: "run-a", academySlug: "dev-a" }])); });
    expect(api.post.mock.calls).toEqual([["exit", { runId: "run-a" }]]);

    api.post.mockReset();
    api.post.mockResolvedValueOnce({ ok: false, error: "run_unavailable" }).mockResolvedValueOnce({ ok: true, destination: "/staff" });
    // A successful exit keeps the hook busy while the browser leaves, so the second case gets a fresh hook.
    const fresh = renderHook(() => useLeaveDeletedAcademy()).result;
    await act(async () => { await fresh.current("dev-a", preview([{ id: "run-b", academySlug: "dev-b" }])); });
    expect(api.post.mock.calls.map((call) => call[0])).toEqual(["switch", "exit"]);
  });

  it("does nothing outside a preview of that academy", async () => {
    const { result } = renderHook(() => useLeaveDeletedAcademy());
    let left = true;
    await act(async () => { left = await result.current("other", preview([])); });
    expect(left).toBe(false);
    await act(async () => { left = await result.current("dev-a", { available: false }); });
    expect(left).toBe(false);
    expect(api.post).not.toHaveBeenCalled();
  });
});
