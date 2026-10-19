import { beforeEach, describe, expect, it, vi } from "vitest";

const ACADEMY = "11111111-1111-4111-8111-111111111111";
const SCHEDULE = "22222222-2222-4222-8222-222222222222";

const state = vi.hoisted(() => ({
  role: null as string | null,
  schedule: { kind: "recurring", archived_at: null as string | null, created_by: "u" },
  writes: 0,
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/supabase/authority", () => ({
  cookieAuthority: async () => ({
    userId: "u",
    db: {
      from: (table: string) => {
        let updating = false;
        const chain: Record<string, unknown> = {
          select: () => chain, eq: () => chain, is: () => chain,
          update: () => { updating = true; state.writes++; return chain; },
          maybeSingle: async () => ({
            data: table === "academy_memberships" ? (state.role ? { role: state.role } : null)
              : updating ? { id: SCHEDULE } : state.schedule,
            error: null,
          }),
        };
        return chain;
      },
    },
  }),
}));

import { archiveSchedule } from "./actions";

beforeEach(() => {
  state.role = null; state.writes = 0;
  state.schedule = { kind: "recurring", archived_at: null, created_by: "u" };
});

describe("schedule archive authority", () => {
  it("keeps recurring schedules manager-only", async () => {
    state.role = "instructor";
    expect((await archiveSchedule(ACADEMY, SCHEDULE)).ok).toBe(false);
    state.role = "admin";
    expect(await archiveSchedule(ACADEMY, SCHEDULE)).toEqual({ ok: true });
    expect(state.writes).toBe(1);
  });

  it("lets an Instructor archive only their own one-off schedule", async () => {
    state.role = "instructor";
    state.schedule = { kind: "one_off", archived_at: null, created_by: "u" };
    expect(await archiveSchedule(ACADEMY, SCHEDULE)).toEqual({ ok: true });
    state.schedule = { kind: "one_off", archived_at: null, created_by: "someone-else" };
    expect((await archiveSchedule(ACADEMY, SCHEDULE)).ok).toBe(false);
    expect(state.writes).toBe(1);
  });

  it("denies a caller without an active membership", async () => {
    expect(await archiveSchedule(ACADEMY, SCHEDULE)).toEqual({ ok: false, message: "You do not have permission to archive this schedule." });
    expect(state.writes).toBe(0);
  });
});
