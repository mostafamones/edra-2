import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ user: { id: "user" } as { id: string } | null, rows: [] as unknown[], filters: [] as unknown[] }));
vi.mock("server-only", () => ({}));
vi.mock("../../lib/supabase/server", () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
  from: () => ({ select: () => ({ eq: (name: string, value: string) => {
    state.filters.push([name, value]);
    return { is: (column: string, value: null) => { state.filters.push([column, value]); return { order: async () => ({ data: state.rows, error: null }) }; } };
  } }) }),
}) }));
import { resolveStaffAcademy } from "./server";
beforeEach(() => { state.user = { id: "user" }; state.rows = []; state.filters = []; });
describe("URL academy authorization", () => {
  it("does not resolve an academy for an anonymous caller", async () => {
    state.user = null;
    expect(await resolveStaffAcademy("magd")).toBeNull();
    expect(state.filters).toEqual([]);
  });
  it("returns null for an inaccessible slug without selecting another membership", async () => {
    state.rows = [{ academy_id: "a", role: "owner", academies: { name: "A", slug: "magd", icon: "school" } }];
    expect(await resolveStaffAcademy("private")).toBeNull();
    expect(state.filters).toEqual([["user_id", "user"], ["suspended_at", null]]);
    expect(await resolveStaffAcademy("magd")).toMatchObject({ id: "a", slug: "magd", role: "owner" });
  });
  it("resolves a Head Admin membership", async () => {
    state.rows = [{ academy_id: "a", role: "head_admin", academies: { name: "A", slug: "magd", icon: "school" } }];
    expect(await resolveStaffAcademy("magd")).toMatchObject({ id: "a", role: "head_admin" });
  });
  it("does not treat unrelated roles as staff authority", async () => {
    state.rows = [{ academy_id: "a", role: "student", academies: { name: "A", slug: "magd", icon: "school" } }];
    expect(await resolveStaffAcademy("magd")).toBeNull();
  });
});
