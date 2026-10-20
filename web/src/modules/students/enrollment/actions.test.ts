import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), deleteCookie: vi.fn() }));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "A".repeat(43) }), delete: mocks.deleteCookie }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));

import { completeStudentInvite, previewStudentInvite } from "./actions";

describe("completeStudentInvite", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends explicit null choices when confirming an existing record", async () => {
    mocks.rpc.mockResolvedValue({ data: {
      result: "connected", academy: {
        id: "11111111-1111-4111-8111-111111111111", name: "Academy", slug: "academy", icon: "school",
      },
    }, error: null });

    expect(await completeStudentInvite(null)).toMatchObject({ kind: "connected" });
    expect(mocks.rpc).toHaveBeenCalledWith("complete_student_invite", {
      p_token: "A".repeat(43), p_track_id: null, p_group_id: null,
    });
    expect(mocks.deleteCookie).toHaveBeenCalled();
  });

  it("retains pending context when completion fails so the student can retry", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "unavailable" } });
    expect(await completeStudentInvite(null)).toEqual({ kind: "error" });
    expect(mocks.deleteCookie).not.toHaveBeenCalled();
  });

  it("rejects client-supplied school levels and annual record identities", async () => {
    for (const extra of [{ levelId: "secondary-1" }, { recordId: "11111111-1111-4111-8111-111111111111" }]) {
      expect(await completeStudentInvite({ trackId: null, groupId: null, ...extra })).toEqual({ kind: "error" });
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.deleteCookie).not.toHaveBeenCalled();
  });

  it("clears a revoked invitation on read-only preview without completing enrollment", async () => {
    mocks.rpc.mockResolvedValue({ data: { result: "invalid" }, error: null });
    expect(await previewStudentInvite()).toEqual({ kind: "invalid" });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("preview_student_invite", { p_token: "A".repeat(43) });
    expect(mocks.deleteCookie).toHaveBeenCalledExactlyOnceWith({ name: "edra_pending_student_invite", path: "/" });
  });

  it("keeps an invitation after a retryable placement outcome", async () => {
    mocks.rpc.mockResolvedValue({ data: {
      result: "invalid_choice", academy: {
        id: "11111111-1111-4111-8111-111111111111", name: "Academy", slug: "academy", icon: "school",
      },
    }, error: null });
    expect(await completeStudentInvite({ trackId: null, groupId: null })).toMatchObject({ kind: "invalid_choice" });
    expect(mocks.deleteCookie).not.toHaveBeenCalled();
  });
});
