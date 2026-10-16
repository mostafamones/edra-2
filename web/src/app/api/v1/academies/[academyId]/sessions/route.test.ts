import { beforeEach, describe, expect, it, vi } from "vitest";

const ACADEMY = "11111111-1111-4111-8111-111111111111";
const SESSION = "22222222-2222-4222-8222-222222222222";
const SCHEDULE = "55555555-5555-4555-8555-555555555555";
const KEY = "44444444-4444-4444-8444-444444444444";
const TOKEN = "aaa.bbb.ccc";

type Rpc = { data: unknown; error: { code?: string; message?: string } | null };
const state = vi.hoisted(() => ({
  role: "instructor" as string | null,
  start: { data: null, error: null } as Rpc,
  archivedAt: null as string | null,
  detail: { data: null, error: null } as Rpc,
  calls: [] as { name: string; args: unknown }[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/authority", () => ({
  bearerAuthority: async (token: string) => {
    if (token !== "aaa.bbb.ccc") return null;
    return {
      userId: "user-1",
      db: {
        from: (table: string) => {
          const row = table === "sessions" ? { archived_at: state.archivedAt } : state.role ? { role: state.role } : null;
          const chain = { select: () => chain, eq: () => chain, is: () => chain, maybeSingle: async () => ({ data: row }) };
          return chain;
        },
        rpc: async (name: string, args: unknown) => {
          state.calls.push({ name, args });
          if (name === "consume_api_quota") return { data: { allowed: true }, error: null };
          if (name === "start_session") return state.start;
          if (name === "get_session") return state.detail;
          throw new Error(`unexpected rpc ${name}`);
        },
      },
    };
  },
  cookieAuthority: async () => null,
}));

import { OPTIONS, POST } from "./route";

const detail = (session: Record<string, unknown> = {}) => ({
  session: {
    id: SESSION, academy_id: ACADEMY, academic_year_id: "y", schedule_id: SCHEDULE, schedule_title: "Nine A", schedule_kind: "recurring",
    audience: "group", group_id: "g", group_name: "Nine A", level_id: "preparatory-3", level_name: "Third Preparatory", track_id: null, track_name: null,
    mandatory: true, location: null, state: "live", started_at: "2030-01-01T10:00:00Z", started_by: "user-1", started_by_name: "U",
    auto_end_at: "2030-01-01T12:00:00Z", metadata_version: 1, ended_at: null, ended_by: null, ended_by_name: null,
    end_reason: null, archived_at: null, archived_by_name: null, archive_note: null, year_open: true, can_manage_archive: false,
    ...session,
  },
  roster: [{
    annual_student_record_id: "r", academy_student_profile_id: "p", full_name: "Amal", archived: false, origin: "expected",
    student_phone: "+201001234567", parent_phone: "+201001234568", level_id: "preparatory-3", level_name: null, track_id: null,
    track_name: null, primary_group_id: "g", group_name: "Nine A", participation_type: "in_person",
  }],
});

function call(init: { headers?: Record<string, string>; body?: unknown; academyId?: string } = {}) {
  const academyId = init.academyId ?? ACADEMY;
  const headers = new Headers({ "content-type": "application/json", authorization: `Bearer ${TOKEN}`, "idempotency-key": KEY, ...init.headers });
  const request = new Request(`http://app.lvh.me:3000/api/v1/academies/${academyId}/sessions`, {
    method: "POST", headers, body: typeof init.body === "string" ? init.body : JSON.stringify(init.body ?? { schedule_id: SCHEDULE }),
  });
  return POST(request as never, { params: Promise.resolve({ academyId }) });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  state.role = "instructor";
  state.start = { data: [{ session_id: SESSION, outcome: "started" }], error: null };
  state.archivedAt = null;
  state.detail = { data: detail(), error: null };
  state.calls = [];
});

describe("POST /api/v1/academies/{id}/sessions", () => {
  it("starts with the Idempotency-Key as the start key and returns the session without roster contacts", async () => {
    const response = await call();
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body).toMatchObject({ outcome: "started", replayed: false, session: { id: SESSION, state: "live", roster_count: 1, session_archived_at: null } });
    expect(body.session).not.toHaveProperty("roster");
    expect(JSON.stringify(body)).not.toContain("+20100");
    expect(state.calls.find((c) => c.name === "start_session")?.args).toEqual({
      p_academy_id: ACADEMY, p_schedule_id: SCHEDULE, p_start_key: KEY,
    });
  });

  it.each(["owner", "head_admin", "admin", "instructor"])("lets an active %s start", async (role) => {
    state.role = role;
    expect((await call()).status).toBe(201);
  });

  it("opens the existing live session with 200", async () => {
    state.start = { data: [{ session_id: SESSION, outcome: "existing" }], error: null };
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ outcome: "existing", replayed: false, session: { id: SESSION } });
  });

  it("replays the original session with its current lifecycle, even after it ended and was archived", async () => {
    state.start = { data: [{ session_id: SESSION, outcome: "replayed" }], error: null };
    state.archivedAt = "2030-01-02T09:00:00Z";
    state.detail = { data: detail({ state: "ended", ended_at: "2030-01-01T11:00:00Z", end_reason: "manual", archived_at: "2030-01-02T09:00:00Z" }), error: null };
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      outcome: "replayed", replayed: true, session: { id: SESSION, state: "ended", session_archived_at: "2030-01-02T09:00:00Z" },
    });
  });

  it("rejects suspended or removed members before starting", async () => {
    state.role = null;
    const response = await call();
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("FORBIDDEN");
    expect(state.calls.some((c) => c.name === "start_session")).toBe(false);
  });

  it.each([
    ["forbidden", 403, "FORBIDDEN"],
    ["not_found", 404, "NOT_FOUND"],
    ["schedule_unavailable", 409, "SCHEDULE_UNAVAILABLE"],
    ["year_unavailable", 409, "YEAR_CLOSED"],
    ["idempotency_conflict", 409, "IDEMPOTENCY_CONFLICT"],
  ])("maps the database's %s to %i %s", async (message, status, code) => {
    state.start = { data: null, error: { code: "P0001", message } };
    const response = await call();
    expect(response.status).toBe(status);
    expect((await response.json()).error.code).toBe(code);
  });

  it("reports other database failures as retryable INTERNAL", async () => {
    state.start = { data: null, error: { code: "40001", message: "serialization_failure" } };
    const response = await call();
    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe("INTERNAL");
  });

  it("requires a UUID Idempotency-Key and a strict body", async () => {
    expect((await call({ headers: { "idempotency-key": "" } })).status).toBe(400);
    expect((await call({ headers: { "idempotency-key": "not-a-uuid" } })).status).toBe(400);
    expect((await call({ body: {} })).status).toBe(400);
    expect((await call({ body: { schedule_id: "x" } })).status).toBe(400);
    expect((await call({ body: { schedule_id: SCHEDULE, academy_id: ACADEMY } })).status).toBe(400);
    expect((await call({ body: "{not json" })).status).toBe(400);
    expect((await call({ academyId: "not-a-uuid" })).status).toBe(400);
    expect(state.calls.some((c) => c.name === "start_session")).toBe(false);
  });

  it("requires a bearer token and rejects mixed cookie authority", async () => {
    expect((await call({ headers: { authorization: "" } })).status).toBe(401);
    expect((await call({ headers: { cookie: "edra-auth-v1.0=abc" } })).status).toBe(400);
  });

  it("advertises POST in preflight", () => {
    const response = OPTIONS(new Request("http://app.lvh.me:3000/api/v1/academies/x/sessions", { method: "OPTIONS" }));
    expect(response.status).toBe(204);
  });
});
