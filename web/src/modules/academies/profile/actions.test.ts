import { beforeEach, describe, expect, it, vi } from "vitest";

const BASELINE = "2026-10-21T10:00:00.000001+00:00";
const NEWER = "2026-10-21T10:05:00.000001+00:00";
const row = (change: Record<string, unknown> = {}) => ({
  id: "academy-a", slug: "magd", name: "Magd", icon: "school", subject: "Math", phone: null, whatsapp: null, updated_at: BASELINE, ...change,
});

const state = vi.hoisted(() => ({
  claims: true,
  role: "owner" as string | null,
  /** Result of the guarded UPDATE … RETURNING. */
  updated: { data: null as unknown, error: null as unknown },
  reread: { data: null as unknown, error: null as unknown },
  updates: [] as { values: unknown; filters: [string, unknown][] }[],
  refresh: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: state.refresh }));
vi.mock("../server", () => ({
  resolveStaffAcademy: async (slug: string) => (state.role && slug === "magd" ? { id: "academy-a", slug, name: "Magd", icon: "school", role: state.role } : null),
}));
vi.mock("../../../lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: state.claims ? { claims: { sub: "user" } } : null }) },
    from: () => ({
      update: (values: unknown) => {
        const call = { values, filters: [] as [string, unknown][] };
        state.updates.push(call);
        const chain = {
          eq: (column: string, value: unknown) => { call.filters.push([column, value]); return chain; },
          select: () => ({ maybeSingle: async () => state.updated }),
        };
        return chain;
      },
      select: () => ({ eq: () => ({ maybeSingle: async () => state.reread }) }),
    }),
  }),
}));

const { saveAcademyProfile } = await import("./actions");
const input = { name: "Magd 2", icon: "science", subject: "Physics", phone: "01012345678", whatsapp: "" };

beforeEach(() => {
  Object.assign(state, { claims: true, role: "owner", updated: { data: null, error: null }, reread: { data: null, error: null }, updates: [] });
  state.refresh.mockReset();
});

describe("saveAcademyProfile", () => {
  it("saves all five normalized fields in one guarded update and refreshes the shell", async () => {
    state.updated = { data: row({ name: "Magd 2", icon: "science", subject: "Physics", phone: "+201012345678", updated_at: NEWER }), error: null };
    const result = await saveAcademyProfile("magd", BASELINE, input);
    expect(result).toMatchObject({ ok: true, profile: { name: "Magd 2", phone: "+201012345678", whatsapp: null, updatedAt: NEWER, canEdit: true } });
    expect(state.updates).toEqual([{ values: { name: "Magd 2", icon: "science", subject: "Physics", phone: "+201012345678", whatsapp: null },
      filters: [["id", "academy-a"], ["updated_at", BASELINE]] }]);
    expect(state.refresh).toHaveBeenCalledOnce();
  });

  it("reports a committed save even if the shell refresh fails", async () => {
    state.updated = { data: row({ name: "Magd 2", updated_at: NEWER }), error: null };
    state.refresh.mockImplementation(() => { throw new Error("refresh failed"); });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await saveAcademyProfile("magd", BASELINE, input)).ok).toBe(true);
  });

  it("returns field errors without writing", async () => {
    const result = await saveAcademyProfile("magd", BASELINE, { ...input, phone: "0223456789", slug: "other" });
    expect(result).toMatchObject({ ok: false, code: "invalid" });
    expect(state.updates).toEqual([]);
  });

  it("does not write for Admin, Instructor, inaccessible academies or expired sessions", async () => {
    for (const role of ["admin", "instructor", null]) {
      state.role = role;
      expect(await saveAcademyProfile("magd", BASELINE, input)).toEqual({ ok: false, code: "forbidden" });
    }
    state.role = "head_admin";
    expect(await saveAcademyProfile("other", BASELINE, input)).toEqual({ ok: false, code: "forbidden" });
    state.claims = false;
    expect(await saveAcademyProfile("magd", BASELINE, input)).toEqual({ ok: false, code: "sessionExpired" });
    expect(state.updates).toEqual([]);
  });

  it("returns the newer profile when another manager saved first", async () => {
    state.reread = { data: row({ name: "Someone else", updated_at: NEWER }), error: null };
    const result = await saveAcademyProfile("magd", BASELINE, input);
    expect(result).toMatchObject({ ok: false, code: "conflict", current: { name: "Someone else", updatedAt: NEWER } });
    expect(state.refresh).not.toHaveBeenCalled();
  });

  it("does not report an RLS-filtered zero-row write as success", async () => {
    state.reread = { data: row(), error: null };
    expect(await saveAcademyProfile("magd", BASELINE, input)).toEqual({ ok: false, code: "forbidden" });
    state.reread = { data: null, error: null };
    expect(await saveAcademyProfile("magd", BASELINE, input)).toEqual({ ok: false, code: "forbidden" });
  });

  it("treats already-persisted values as saved after a lost response or a repeat", async () => {
    const persisted = row({ name: "Magd 2", icon: "science", subject: "Physics", phone: "+201012345678", updated_at: NEWER });
    state.updated = { data: null, error: { message: "timeout" } };
    state.reread = { data: persisted, error: null };
    expect(await saveAcademyProfile("magd", BASELINE, input)).toMatchObject({ ok: true, profile: { updatedAt: NEWER } });
    state.reread = { data: row(), error: null };
    expect(await saveAcademyProfile("magd", BASELINE, input)).toEqual({ ok: false, code: "saveFailed" });
  });
});
