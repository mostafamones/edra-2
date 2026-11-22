import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co"));

const ACADEMY = "11111111-1111-4111-8111-111111111111";
const OTHER = "99999999-9999-4999-8999-999999999999";
const RECORD = "22222222-2222-4222-8222-222222222222";
const YEAR = "33333333-3333-4333-8333-333333333333";
const TOKEN = "aaa.bbb.ccc";

type Result = { data: unknown; error: { message: string; code?: string } | null; count?: number };
const state = vi.hoisted(() => ({
  role: "instructor" as string | null,
  tables: {} as Record<string, unknown>,
  rpc: {} as Record<string, Result>,
  calls: [] as { name: string; args: unknown }[],
  filters: [] as { table: string; column: string; value: unknown }[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/authority", () => ({
  bearerAuthority: async (token: string) => token !== "aaa.bbb.ccc" ? null : {
    userId: "user-1",
    db: {
      from: (table: string) => {
        const eqs: Record<string, unknown> = {};
        let range: [number, number] | null = null;
        const value = (): Result => {
          if (table === "academy_memberships") return { data: state.role ? { role: state.role } : null, error: null };
          // Records belong to one academy only: a foreign academy finds nothing.
          if (table === "annual_student_records" && eqs.academy_id !== ACADEMY) return { data: null, error: null, count: 0 };
          const data = state.tables[table];
          if (Array.isArray(data) && range) return { data: data.slice(range[0], range[1] + 1), error: null };
          return { data: data ?? null, error: null, count: 3 };
        };
        const chain: Record<string, unknown> = {
          select: () => chain, is: () => chain, in: () => chain, order: () => chain,
          eq: (column: string, v: unknown) => { eqs[column] = v; state.filters.push({ table, column, value: v }); return chain; },
          range: (from: number, to: number) => { range = [from, to]; return chain; },
          maybeSingle: async () => value(),
          then: (resolve: (v: unknown) => unknown) => Promise.resolve(value()).then(resolve),
        };
        return chain;
      },
      rpc: async (name: string, args: unknown) => {
        state.calls.push({ name, args });
        if (name === "consume_api_quota") return { data: { allowed: true }, error: null };
        if (state.rpc[name]) return state.rpc[name];
        throw new Error(`unexpected rpc ${name}`);
      },
    },
  },
  cookieAuthority: async () => { throw new Error("bearer handlers must never read cookies"); },
}));

import { GET as list } from "@/lib/api/adapters/v1/academies/[academyId]/students/handler.server";
import { GET as detail } from "@/lib/api/adapters/v1/academies/[academyId]/students/[recordId]/handler.server";
import { GET as attendance } from "@/lib/api/adapters/v1/academies/[academyId]/students/[recordId]/attendance/handler.server";
import { GET as assessments } from "@/lib/api/adapters/v1/academies/[academyId]/students/[recordId]/assessments/handler.server";

const request = (path: string, headers: Record<string, string> = { authorization: `Bearer ${TOKEN}` }) =>
  new Request(`http://app.lvh.me:3000/api/v1/academies/${path}`, { headers }) as never;
const params = (academyId = ACADEMY, recordId = RECORD) => ({ params: Promise.resolve({ academyId, recordId }) });

const listRow = {
  id: RECORD, academy_student_profile_id: "p", full_name: "Amal", student_phone: "+201001234567", parent_phone: "+201001234568",
  level_id: "preparatory-3", level_name: "Third Preparatory", track_id: null, track_name: null, primary_group_id: "g", group_name: "Nine A",
  participation_type: "online_only", archived_at: null, created_at: "x", updated_at: "x", version: 1, online_account: "not_connected",
  manually_suspended: true, suspension_revision: 1, account_name: null, label_ids: [],
};
const attendanceRow = (status: string, index: number, mandatory = true) =>
  ({ session_id: `s${String(index).padStart(3, "0")}`, session_started_at: `2030-01-${String(30 - (index % 28)).padStart(2, "0")}T10:00:00Z`, status, mandatory });

beforeEach(() => {
  state.role = "instructor";
  state.calls = [];
  state.filters = [];
  state.rpc = {
    list_student_records: { data: { rows: [listRow], total: 120 }, error: null },
    get_student_access_suspension: { data: { connected: false, suspended: true, revision: 1, latest: null }, error: null },
  };
  state.tables = {
    academic_years: { id: YEAR, start_year: 2030, closed_at: null },
    annual_student_records: {
      id: RECORD, academy_id: ACADEMY, academic_year_id: YEAR, academy_student_profile_id: "p", full_name: "Amal",
      student_phone: "+201001234567", parent_phone: "+201001234568", level_id: "preparatory-3", track_id: null, primary_group_id: "g",
      participation_type: "online_only", archived_at: "2030-03-01T00:00:00Z", created_at: "x", updated_at: "x", version: 2,
    },
    annual_student_record_labels: [],
    global_levels: { name: "Third Preparatory" },
    groups: { name: "Nine A" },
    sessions: [],
  };
});

describe("bearer authentication and membership", () => {
  it("requires a valid bearer token", async () => {
    expect((await list(request(`${ACADEMY}/students`, {}), params())).status).toBe(401);
    expect((await list(request(`${ACADEMY}/students`, { authorization: "Bearer x.y.z" }), params())).status).toBe(401);
  });

  it.each([
    ["directory", () => list(request(`${ACADEMY}/students`), params())],
    ["detail", () => detail(request(`${ACADEMY}/students/${RECORD}`), params())],
    ["attendance", () => attendance(request(`${ACADEMY}/students/${RECORD}/attendance`), params())],
    ["assessments", () => assessments(request(`${ACADEMY}/students/${RECORD}/assessments`), params())],
  ])("denies a suspended, removed or non-staff caller the %s", async (_, call) => {
    state.role = null;
    const response = await call();
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.stringify(await response.json())).not.toContain("+20100");
  });

  it("does not find another academy's record or its contacts", async () => {
    for (const call of [detail, attendance, assessments]) {
      const response = await call(request(`${OTHER}/students/${RECORD}`), params(OTHER));
      expect(response.status).toBe(404);
      expect(JSON.stringify(await response.json())).not.toContain("+20100");
    }
  });
});

describe("GET students", () => {
  it("pages the open year's active records by default and returns the year context", async () => {
    const response = await list(request(`${ACADEMY}/students?search=%20Amal&page=2&page_size=20`), params());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ academic_year: { id: YEAR, start_year: 2030 }, total: 120, page: 2, page_size: 20 });
    expect(body.students[0]).toEqual({
      id: RECORD, full_name: "Amal", level_name: "Third Preparatory", track_name: null, group_name: "Nine A",
      participation_type: "online_only", archived: false, online_account: "not_connected",
    });
    expect(body.students[0]).not.toHaveProperty("student_phone");
    expect(state.calls.find((c) => c.name === "list_student_records")?.args).toMatchObject({
      p_academy_id: ACADEMY, p_academic_year_id: YEAR, p_search: "Amal", p_status: "active", p_page_index: 2, p_page_size: 20,
      p_sorts: [{ id: "name", desc: false }],
    });
  });

  it.each(["archived", "all"])("passes the %s filter", async (status) => {
    await list(request(`${ACADEMY}/students?status=${status}`), params());
    expect(state.calls.find((c) => c.name === "list_student_records")?.args).toMatchObject({ p_status: status });
  });

  it("reports an academy without an open year explicitly", async () => {
    state.tables.academic_years = null;
    const body = await (await list(request(`${ACADEMY}/students`), params())).json();
    expect(body).toMatchObject({ academic_year: null, total: 0, students: [] });
  });

  it.each(["status=deleted", "page_size=30", "page_size=500", "page=-1", `search=${"x".repeat(101)}`])("rejects %s", async (query) => {
    expect((await list(request(`${ACADEMY}/students?${query}`), params())).status).toBe(400);
  });

  it("rejects a malformed academy id", async () => {
    expect((await list(request("nope/students"), params("nope"))).status).toBe(400);
  });
});

describe("GET student", () => {
  it("returns contacts, resolved placement, year and an unconnected manual suspension", async () => {
    const response = await detail(request(`${ACADEMY}/students/${RECORD}`), params());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: RECORD, full_name: "Amal", student_phone: "+201001234567", parent_phone: "+201001234568",
      academic_year: { id: YEAR, start_year: 2030, closed: false }, level_name: "Third Preparatory", group_name: "Nine A", track_name: null,
      participation_type: "online_only", archived: true, online_account: "not_connected", manually_suspended: true,
    });
  });
});

describe("GET student attendance", () => {
  it("summarizes the full counted history, independent of the page", async () => {
    const rows = [
      ...Array.from({ length: 60 }, (_, i) => attendanceRow(i % 3 === 0 ? "absent" : i % 3 === 1 ? "late" : "present", i)),
      attendanceRow("excused", 60), attendanceRow("unknown", 61), attendanceRow("absent", 62, false), attendanceRow("present", 63, false),
    ];
    state.tables.counted_attendance = rows;
    state.tables.sessions = [{ id: "s000", schedule_title: "Algebra", group_name: "Nine A" }];
    const body = await (await attendance(request(`${ACADEMY}/students/${RECORD}/attendance?limit=10`), params())).json();
    expect(body).toMatchObject({
      academic_year_id: YEAR, total: 64, limit: 10, offset: 0,
      mandatory: { present: 20, late: 20, absent: 20, excused: 1, unknown: 1 },
      optional: { present: 1, absent: 1, attended: 1 },
    });
    expect(body.mandatory.rate).toBeCloseTo(200 / 3);
    expect(body.items).toHaveLength(10);
    expect(body.items[0]).toEqual({ session_id: "s000", started_at: rows[0].session_started_at, title: "Algebra", group_name: "Nine A", status: "absent", mandatory: true });
    expect(state.filters).toContainEqual({ table: "counted_attendance", column: "academic_year_id", value: YEAR });
  });

  it("returns a null rate without qualifying records, and 0 for only absences", async () => {
    state.tables.counted_attendance = [attendanceRow("excused", 0), attendanceRow("unknown", 1)];
    expect((await (await attendance(request(`${ACADEMY}/students/${RECORD}/attendance`), params())).json()).mandatory.rate).toBeNull();
    state.tables.counted_attendance = [attendanceRow("absent", 0)];
    expect((await (await attendance(request(`${ACADEMY}/students/${RECORD}/attendance`), params())).json()).mandatory.rate).toBe(0);
  });

  it.each(["limit=0", "limit=101", "offset=-1"])("rejects %s", async (query) => {
    expect((await attendance(request(`${ACADEMY}/students/${RECORD}/attendance?${query}`), params())).status).toBe(400);
  });
});

describe("GET student assessments", () => {
  const item = (overrides: Record<string, unknown>) => ({
    id: "a", title: "Homework", kind: "assignment", createdAt: "2030-01-01T00:00:00Z", work: "submitted", complete: true,
    score: "8", maximum: "10", publicationState: "unpublished", publication: null, ...overrides,
  });

  it("filters by kind before paging and shows the announced snapshot, not the private correction", async () => {
    state.rpc.staff_student_assessment_history = { data: { total: 31, items: [
      item({ publicationState: "pending_correction", score: "9", publication: { total: "7.50", max_score: "12", published_at: "2030-01-02T00:00:00Z" } }),
      item({ id: "b", score: "0", publicationState: "published", publication: { total: "0", max_score: "10", published_at: "2030-01-03T00:00:00Z" } }),
      item({ id: "c", work: "missing", complete: false, score: null }),
      item({ id: "d", work: "expected", complete: false, score: null }),
      item({ id: "e", complete: true, score: "5" }),
      item({ id: "f", publicationState: "published", publication: { total: "3", max_score: "0", published_at: "2030-01-03T00:00:00Z" } }),
      item({ id: "g", kind: "quiz", work: "submitted", complete: false, score: null, maximum: null }),
    ] }, error: null };
    const body = await (await assessments(request(`${ACADEMY}/students/${RECORD}/assessments?kind=assignment&limit=10&offset=20`), params())).json();
    expect(state.calls.find((c) => c.name === "staff_student_assessment_history")?.args).toEqual({
      p_academy_id: ACADEMY, p_record_id: RECORD, p_kind: "assignment", p_limit: 10, p_offset: 20,
    });
    expect(body).toMatchObject({ total: 31, kind: "assignment", academic_year_id: YEAR });
    const [corrected, zero, missing, awaiting, unannounced, zeroMax, quiz] = body.items;
    expect(corrected).toMatchObject({ status: "correction_pending", result: { score: "7.5", maximum: "12", percentage: "62.5" }, marking: { score: "9" } });
    expect(zero).toMatchObject({ status: "announced", result: { score: "0", percentage: "0" } });
    expect(missing).toMatchObject({ status: "missing", result: null, marking: { score: null } });
    expect(awaiting).toMatchObject({ status: "awaiting_submission", result: null });
    expect(unannounced).toMatchObject({ status: "unannounced", result: null, marking: { score: "5" } });
    expect(zeroMax.result).toMatchObject({ score: "3", maximum: "0", percentage: null });
    expect(quiz).toMatchObject({ status: "marking_incomplete", result: null });
  });

  it("rejects an unknown kind and maps database refusals", async () => {
    expect((await assessments(request(`${ACADEMY}/students/${RECORD}/assessments?kind=essay`), params())).status).toBe(400);
    state.rpc.staff_student_assessment_history = { data: null, error: { message: "forbidden" } };
    expect((await assessments(request(`${ACADEMY}/students/${RECORD}/assessments`), params())).status).toBe(403);
  });
});
