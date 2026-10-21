import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  role: "owner" as string | null,
  rpc: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: state.rpc }) }));
vi.mock("../server", () => ({ resolveStaffAcademy: async (slug: string) => state.role && slug === "academy-a"
  ? { id: "12900000-0000-4000-8000-000000000001", slug, role: state.role } : null }));

import { getStructure, maintainOffering, previewOfferingChange, structureResult } from "./server";

const academyId = "12900000-0000-4000-8000-000000000001";
const accountId = "12900000-0000-4000-8000-000000000002";
const change = { operation: "add_track", levelId: "secondary-2", name: " Scientific " };
const normalized = { ...change, name: "Scientific" };
const structure = { academyId, accountId, canManage: true, revision: 2, levels: [] };
const preview = { change: normalized, revision: 1, fingerprint: "a".repeat(32), changes: {}, preserved: {}, blockers: {}, dependencies: {}, academicYearId: null };
const request = { change, revision: 1, fingerprint: preview.fingerprint, requestKey: "12900000-0000-4000-8000-000000000003" };

beforeEach(() => { state.role = "owner"; state.rpc.mockReset(); });

describe("structure server boundaries", () => {
  it.each(["owner", "head_admin", "admin"])("allows %s to maintain offerings with the resolved academy", async role => {
    state.role = role;
    state.rpc.mockResolvedValue({ data: { outcome: "committed", structure, replayed: false, trackId: null }, error: null });
    expect(await maintainOffering("academy-a", request)).toMatchObject({ outcome: "committed", structure });
    expect(state.rpc).toHaveBeenCalledWith("maintain_academy_offering", {
      p_academy_id: academyId, p_change: normalized, p_expected_revision: 1, p_fingerprint: preview.fingerprint,
      p_request_key: request.requestKey,
    });
  });
  it("allows instructor reads and refuses instructor mutation/preview before the RPC", async () => {
    state.role = "instructor";
    state.rpc.mockResolvedValue({ data: { ...structure, canManage: false }, error: null });
    expect(await getStructure("academy-a")).toMatchObject({ canManage: false });
    state.rpc.mockClear();
    await expect(previewOfferingChange("academy-a", change)).rejects.toThrow("forbidden");
    await expect(maintainOffering("academy-a", request)).rejects.toThrow("forbidden");
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("denies inaccessible academy scope without selecting another academy", async () => {
    expect(await getStructure("academy-b")).toBeNull();
    await expect(maintainOffering("academy-b", request)).rejects.toThrow("forbidden");
    state.role = null;
    await expect(previewOfferingChange("academy-a", change)).rejects.toThrow("forbidden");
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("returns stale previews without committing or automatically retrying", async () => {
    state.rpc.mockResolvedValue({ data: { outcome: "conflict", preview }, error: null });
    expect(await maintainOffering("academy-a", request)).toEqual({ outcome: "conflict", preview });
    expect(state.rpc).toHaveBeenCalledOnce();
  });
  it("preserves retry identity and surfaces payload conflicts", async () => {
    state.rpc.mockResolvedValue({ data: { outcome: "committed", structure, replayed: true, trackId: null }, error: null });
    expect(await maintainOffering("academy-a", request)).toMatchObject({ replayed: true });
    state.rpc.mockResolvedValue({ data: null, error: { message: "idempotency_conflict" } });
    expect(await structureResult(() => maintainOffering("academy-a", request))).toMatchObject({ ok: false, code: "retry_conflict" });
  });
  it("validates before invoking the database and fails closed on malformed database data", async () => {
    await expect(maintainOffering("academy-a", { ...request, change: { ...change, academyId: "foreign" } })).rejects.toThrow();
    expect(state.rpc).not.toHaveBeenCalled();
    state.rpc.mockResolvedValue({ data: { outcome: "committed" }, error: null });
    expect(await structureResult(() => maintainOffering("academy-a", request))).toMatchObject({ ok: false });
  });
});
