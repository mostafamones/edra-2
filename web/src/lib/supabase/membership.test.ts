import { beforeEach, describe, expect, it, vi } from "vitest";

const ACADEMY = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

const state = vi.hoisted(() => ({
  cookie: null as unknown,
  cookieCalls: 0,
}));
vi.mock("server-only", () => ({}));
vi.mock("./authority", () => ({ cookieAuthority: async () => { state.cookieCalls++; return state.cookie; } }));

import type { Authority } from "./authority";
import { academyMember } from "./membership";

type Row = { academy_id: string; user_id: string; role: string; suspended_at: string | null };

/** A caller whose client answers the membership query from `rows`, recording the filters it was given. */
function caller(userId: string, rows: Row[], error: unknown = null) {
  const filters: Record<string, unknown> = {};
  const chain = {
    select: () => chain,
    eq: (column: string, value: unknown) => { filters[column] = value; return chain; },
    is: (column: string, value: unknown) => { filters[`${column} is`] = value; return chain; },
    maybeSingle: async () => {
      if (error) return { data: null, error };
      const row = rows.find((r) => r.academy_id === filters.academy_id && r.user_id === filters.user_id
        && (filters["suspended_at is"] === null ? r.suspended_at === null : true));
      return { data: row ? { role: row.role } : null, error: null };
    },
  };
  const from = vi.fn(() => chain);
  return { authority: { userId, db: { from } } as unknown as Authority, from, filters };
}

const active = (role: string, academy = ACADEMY, user = "u"): Row => ({ academy_id: academy, user_id: user, role, suspended_at: null });

beforeEach(() => { state.cookie = null; state.cookieCalls = 0; });

describe("academyMember", () => {
  it("rejects a malformed academy before resolving any caller or querying", async () => {
    const { authority, from } = caller("u", [active("owner")]);
    expect(await academyMember("not-a-uuid", authority)).toBeNull();
    expect(await academyMember("not-a-uuid")).toBeNull();
    expect(from).not.toHaveBeenCalled();
    expect(state.cookieCalls).toBe(0);
  });

  it("returns every active staff role with the caller's own client", async () => {
    for (const role of ["owner", "head_admin", "admin", "instructor"]) {
      const { authority, filters } = caller("u", [active(role)]);
      expect(await academyMember(ACADEMY, authority)).toEqual({ db: authority.db, userId: "u", role });
      expect(filters).toEqual({ academy_id: ACADEMY, user_id: "u", "suspended_at is": null });
    }
  });

  it("uses a supplied bearer authority without consulting cookies", async () => {
    state.cookie = caller("cookie-user", [active("owner", ACADEMY, "cookie-user")]).authority;
    const { authority } = caller("bearer-user", []);
    expect(await academyMember(ACADEMY, authority)).toBeNull();
    expect(state.cookieCalls).toBe(0);
  });

  it("treats an explicit null authority as denied, never as the cookie session", async () => {
    state.cookie = caller("u", [active("owner")]).authority;
    expect(await academyMember(ACADEMY, null)).toBeNull();
    expect(state.cookieCalls).toBe(0);
  });

  it("resolves the cookie session when no authority is supplied", async () => {
    state.cookie = caller("u", [active("admin")]).authority;
    expect(await academyMember(ACADEMY)).toMatchObject({ userId: "u", role: "admin" });
    expect(state.cookieCalls).toBe(1);
  });

  it("denies a missing caller, including a refused recovery-only cookie session", async () => {
    state.cookie = null; // cookieAuthority refuses phone-code (recovery) sessions
    expect(await academyMember(ACADEMY)).toBeNull();
  });

  it("denies no membership, a suspended membership, another academy and another user", async () => {
    const cases: Row[][] = [
      [],
      [{ ...active("owner"), suspended_at: "2030-01-01T00:00:00Z" }],
      [active("owner", OTHER)],
      [active("owner", ACADEMY, "someone-else")],
    ];
    for (const rows of cases) expect(await academyMember(ACADEMY, caller("u", rows).authority)).toBeNull();
  });

  it("denies an unknown or non-staff role", async () => {
    for (const role of ["student", "guardian", "", "OWNER"]) {
      expect(await academyMember(ACADEMY, caller("u", [active(role)]).authority)).toBeNull();
    }
  });

  it("denies on a query error", async () => {
    const { authority } = caller("u", [active("owner")], { message: "boom" });
    expect(await academyMember(ACADEMY, authority)).toBeNull();
  });

  it("re-queries on every call instead of caching a decision", async () => {
    const rows = [active("owner")];
    const { authority, from } = caller("u", rows);
    expect(await academyMember(ACADEMY, authority)).not.toBeNull();
    rows[0] = { ...rows[0], suspended_at: "2030-01-01T00:00:00Z" };
    expect(await academyMember(ACADEMY, authority)).toBeNull();
    expect(from).toHaveBeenCalledTimes(2);
  });
});
