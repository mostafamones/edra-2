import { beforeEach, describe, expect, it, vi } from "vitest";

const ACADEMY = "11111111-1111-4111-8111-111111111111";
const GROUP = "22222222-2222-4222-8222-222222222222";

const state = vi.hoisted(() => ({ role: null as string | null, recovery: false, writes: [] as string[] }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/supabase/authority", () => ({
  // cookieAuthority refuses recovery (phone-code) sessions.
  cookieAuthority: async () => state.recovery ? null : {
    userId: "u",
    db: {
      from: (table: string) => {
        const chain: Record<string, unknown> = {
          select: () => chain, eq: () => chain, is: () => chain, not: () => chain,
          update: () => { state.writes.push(table); return chain; },
          maybeSingle: async () => ({ data: table === "academy_memberships" && state.role ? { role: state.role } : null, error: null }),
          single: async () => ({ data: { id: GROUP }, error: null }),
        };
        return chain;
      },
    },
  },
}));

import { archiveGroup } from "./actions";

beforeEach(() => { state.role = null; state.recovery = false; state.writes = []; });

describe("group management authority", () => {
  it("lets every manager role archive", async () => {
    for (const role of ["owner", "head_admin", "admin"]) {
      state.role = role;
      expect(await archiveGroup(ACADEMY, GROUP)).toEqual({ ok: true });
    }
  });

  it("denies an Instructor, a non-member and a recovery session before writing", async () => {
    state.role = "instructor";
    expect(await archiveGroup(ACADEMY, GROUP)).toEqual({ ok: false, message: "You do not have permission to archive groups." });
    state.role = null;
    expect((await archiveGroup(ACADEMY, GROUP)).ok).toBe(false);
    state.role = "owner"; state.recovery = true;
    expect((await archiveGroup(ACADEMY, GROUP)).ok).toBe(false);
    expect(state.writes).toEqual([]);
  });
});
