import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Authority } from "@/lib/supabase/authority";

const A = "11111111-1111-4111-8111-111111111111", S = "22222222-2222-4222-8222-222222222222", U = "33333333-3333-4333-8333-333333333333", K = "44444444-4444-4444-8444-444444444444";
const state = vi.hoisted(() => ({ allowed: true, calls: [] as { name: string; args: Record<string, unknown> }[], error: null as { message: string } | null, pages: [] as unknown[][] }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/membership", () => ({ academyMember: async () => state.allowed ? { db: { rpc: async (name: string, args: Record<string, unknown>) => {
  state.calls.push({ name, args });
  return { error: state.error, data: name === "save_session_content" ? { outcome: "saved", revision: 3, replayed: true } : name === "session_content_options" ? state.pages.shift() ?? [] : { revision: 0, items: [], lockReason: null, history: [] } };
} } } : null }));
import { readTaught, readTaughtOptions, writeTaught } from "./data";
import { sameSelection, saveTaughtSchema, taughtQueryKey } from "./types";

beforeEach(() => { state.allowed = true; state.calls = []; state.error = null; state.pages = []; });
const target = { academyId: A, sessionId: S };
const input = { ...target, expectedRevision: 2, items: [{ unitId: U, revision: 1 }], key: K };
describe("session content authority and boundaries", () => {
  it("denies reads and writes without membership before touching an RPC", async () => {
    state.allowed = false;
    await expect(readTaught(target, null)).rejects.toThrow("permission");
    await expect(readTaughtOptions(target, null)).rejects.toThrow("permission");
    await expect(writeTaught(input, null)).rejects.toThrow("permission");
    expect(state.calls).toEqual([]);
  });
  it("accepts persisted PostgreSQL identifiers used by generated academies and units", async () => {
    const generated = "4eba77f8-870f-c7c7-4bb9-fcf3ddebb0fc";
    const devTarget = { academyId: generated, sessionId: S };
    await expect(readTaught(devTarget)).resolves.toMatchObject({ revision: 0, items: [] });
    state.pages = [[{ unitId: generated, revision: 1, title: "Generated unit" }]];
    await expect(readTaughtOptions(devTarget)).resolves.toEqual([{ unitId: generated, revision: 1, title: "Generated unit" }]);
    await expect(writeTaught({ ...input, ...devTarget, items: [{ unitId: generated, revision: 1 }] })).resolves.toMatchObject({ outcome: "saved" });
    expect(state.calls.every(call => call.args.p_academy_id === generated)).toBe(true);
  });
  it("still rejects malformed identifiers and denies generated targets without membership", async () => {
    await expect(readTaught({ ...target, academyId: "not-an-id" })).rejects.toThrow();
    await expect(writeTaught({ ...input, items: [{ unitId: "not-an-id", revision: 1 }] })).rejects.toThrow();
    expect(state.calls).toEqual([]);
    state.allowed = false;
    await expect(readTaught({ academyId: "4eba77f8-870f-c7c7-4bb9-fcf3ddebb0fc", sessionId: S })).rejects.toThrow("permission");
    expect(state.calls).toEqual([]);
  });
  it("preserves the reviewed version, selected publication and retry key", async () => {
    const result = await writeTaught(input, {} as Authority);
    expect(result.replayed).toBe(true);
    expect(state.calls).toEqual([{ name: "save_session_content", args: { p_academy_id: A, p_session_id: S, p_expected_revision: 2, p_items: input.items, p_key: K } }]);
  });
  it("rejects duplicate selections and unknown metadata before a database call", async () => {
    await expect(writeTaught({ ...input, items: [...input.items, ...input.items] })).rejects.toThrow();
    await expect(writeTaught({ ...input, items: [{ ...input.items[0], academyId: A }] })).rejects.toThrow();
    expect(saveTaughtSchema.safeParse({ ...input, expectedRevision: -1 }).success).toBe(false);
    expect(state.calls).toEqual([]);
  });
  it("loads every page, including more than 500 available units", async () => {
    const row = { unitId: U, revision: 1, title: "Published" };
    state.pages = [...Array.from({ length: 6 }, () => Array.from({ length: 100 }, () => row)), []];
    expect(await readTaughtOptions(target)).toHaveLength(600);
    expect(state.calls.map(c => c.args.p_offset)).toEqual([0,100,200,300,400,500,600]);
  });
  it.each([
    ["content_conflict", "Reload"], ["content_finalized", "locked"], ["content_unavailable", "Refresh"], ["session_archived", "archived"], ["year_unavailable", "closed"], ["secret provider failure", "Please retry"],
  ])("maps %s to actionable safe feedback", async (message, expected) => {
    state.error = { message }; await expect(writeTaught(input)).rejects.toThrow(expected);
  });
  it("separates account/session caches and detects a changed publication", () => {
    expect(taughtQueryKey("alice", A, S)).not.toEqual(taughtQueryKey("bob", A, S));
    const a = [{ unitId: U, revision: 1, title: "Unit" }];
    expect(sameSelection(a, [{ ...a[0], title: "Changed display title" }])).toBe(true);
    expect(sameSelection(a, [{ ...a[0], revision: 2 }])).toBe(false);
  });
});
