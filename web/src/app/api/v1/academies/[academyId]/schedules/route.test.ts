import { beforeEach, describe, expect, it, vi } from "vitest";

const ACADEMY = "11111111-1111-4111-8111-111111111111";
const YEAR = "66666666-6666-4666-8666-666666666666";
const TOKEN = "aaa.bbb.ccc";

type Filter = [string, ...unknown[]];
const state = vi.hoisted(() => ({
  role: "instructor" as string | null,
  year: null as { id: string; start_year: number } | null,
  tables: {} as Record<string, Record<string, unknown>[]>,
  queries: [] as { table: string; filters: Filter[] }[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/authority", () => ({
  bearerAuthority: async (token: string) => {
    if (token !== "aaa.bbb.ccc") return null;
    const from = (table: string) => {
      const query = { table, filters: [] as Filter[] };
      state.queries.push(query);
      let range: [number, number] | null = null;
      const rows = () => {
        const all = state.tables[table] ?? [];
        return range ? all.slice(range[0], range[1] + 1) : all;
      };
      const chain: Record<string, unknown> = {};
      for (const name of ["select", "eq", "is", "in", "gt", "ilike", "order"]) {
        chain[name] = (...args: unknown[]) => { query.filters.push([name, ...args]); return chain; };
      }
      chain.range = (from: number, to: number) => { range = [from, to]; return chain; };
      chain.maybeSingle = async () => ({
        data: table === "academy_memberships" ? (state.role ? { role: state.role } : null) : table === "academic_years" ? state.year : null,
        error: null,
      });
      chain.then = (resolve: (value: unknown) => unknown) => resolve({ data: rows(), error: null });
      return chain;
    };
    return {
      userId: "user-1",
      db: {
        // Startable schedules are read through the offering-aware set-returning RPC.
        rpc: (name: string) => name === "offering_startable_schedules" ? from("schedules") : Promise.resolve({ data: { allowed: true }, error: null }),
        from,
      },
    };
  },
  cookieAuthority: async () => null,
}));

import { GET } from "./route";

function call(query = "") {
  const url = `http://app.lvh.me:3000/api/v1/academies/${ACADEMY}/schedules${query}`;
  const request = Object.assign(new Request(url, { headers: { authorization: `Bearer ${TOKEN}` } }), { nextUrl: new URL(url) });
  return GET(request as never, { params: Promise.resolve({ academyId: ACADEMY }) });
}

const schedule = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id, title, kind: "recurring", audience: "level", group_id: null, level_id: "preparatory-3", track_id: null, mandatory: true, location: null, ...extra,
});

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  state.role = "instructor";
  state.year = { id: YEAR, start_year: 2030 };
  state.queries = [];
  state.tables = {
    schedules: [
      schedule("a", "Algebra", { audience: "group", group_id: "g1", level_id: null }),
      schedule("b", "Biology", { kind: "one_off", audience: "program", track_id: "t1" }),
      schedule("c", "Chemistry"),
    ],
    schedule_slots: [{ id: "s1", schedule_id: "a", weekday: 6, starts_at: "16:00:00", ends_at: "17:30:00" }],
    schedule_sessions: [{ id: "m1", schedule_id: "b", occurs_on: "2099-01-01", starts_at: "10:00:00", ends_at: "11:00:00" }],
    groups: [{ id: "g1", name: "Nine A", level_id: "preparatory-3", track_id: "t1" }],
    global_levels: [{ id: "preparatory-3", name: "Third Preparatory" }],
    academy_tracks: [{ id: "t1", name: "Science" }],
    sessions: [{ id: "live-1", schedule_id: "c" }],
  };
});

describe("GET /api/v1/academies/{id}/schedules", () => {
  it("lists active schedules of the open year with audience, plans and live state", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ time_zone: "Africa/Cairo", academic_year: { id: YEAR, start_year: 2030 }, next_offset: null });
    expect(body.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.schedules).toHaveLength(3);
    expect(body.schedules[0]).toMatchObject({
      id: "a", kind: "recurring", audience: "group", group_name: "Nine A", level_id: "preparatory-3", level_name: "Third Preparatory",
      track_name: "Science", slots: [{ weekday: 6, starts_at: "16:00:00", ends_at: "17:30:00" }], meetings: [],
      live_session_id: null, can_start: true,
    });
    // Future-dated one-offs are listed: planned times never restrict starting.
    expect(body.schedules[1]).toMatchObject({ id: "b", kind: "one_off", meetings: [{ occurs_on: "2099-01-01" }], meets_today: false, track_name: "Science" });
    expect(body.schedules[2]).toMatchObject({ id: "c", live_session_id: "live-1" });

    const schedules = state.queries.find((q) => q.table === "schedules")!;
    expect(schedules.filters).toContainEqual(["eq", "academy_id", ACADEMY]);
    expect(schedules.filters).toContainEqual(["eq", "academic_year_id", YEAR]);
    expect(schedules.filters).toContainEqual(["is", "archived_at", null]);
    const live = state.queries.find((q) => q.table === "sessions")!;
    expect(live.filters).toContainEqual(["eq", "state", "live"]);
    expect(live.filters).toContainEqual(["is", "archived_at", null]);
  });

  it("pages with offset and reports the next offset instead of truncating", async () => {
    const first = await (await call("?limit=2")).json();
    expect(first.schedules.map((s: { id: string }) => s.id)).toEqual(["a", "b"]);
    expect(first.next_offset).toBe(2);
    const second = await (await call("?limit=2&offset=2")).json();
    expect(second.schedules.map((s: { id: string }) => s.id)).toEqual(["c"]);
    expect(second.next_offset).toBeNull();
  });

  it("searches titles literally", async () => {
    await call("?q=50%25_off");
    const schedules = state.queries.find((q) => q.table === "schedules")!;
    expect(schedules.filters).toContainEqual(["ilike", "title", "%50\\%\\_off%"]);
  });

  it("returns nothing startable when no academic year is open", async () => {
    state.year = null;
    const body = await (await call()).json();
    expect(body).toMatchObject({ academic_year: null, schedules: [], next_offset: null });
  });

  it("rejects suspended or removed members", async () => {
    state.role = null;
    const response = await call();
    expect(response.status).toBe(403);
    expect(state.queries.some((q) => q.table === "schedules")).toBe(false);
  });

  it("validates paging and search", async () => {
    for (const query of ["?limit=0", "?limit=101", "?limit=x", "?offset=-1", "?offset=1.5", `?q=${"a".repeat(101)}`]) {
      expect((await call(query)).status, query).toBe(400);
    }
  });
});
