import { beforeEach, describe, expect, it, vi } from "vitest";

const ACADEMY = "11111111-1111-4111-8111-111111111111";
const SESSION = "22222222-2222-4222-8222-222222222222";
const STUDENT = "33333333-3333-4333-8333-333333333333";
const KEY = "44444444-4444-4444-8444-444444444444";
const TOKEN = "aaa.bbb.ccc";

type Rpc = { data: unknown; error: { code?: string; message?: string; details?: string } | null };
const state = vi.hoisted(() => ({
  authorized: true,
  member: true,
  sessionAcademy: null as string | null,
  quota: { allowed: true, retry_after: 1 } as unknown,
  quotaError: null as { code: string } | null,
  checkIn: { data: null, error: null } as Rpc,
  codeCheckIn: { data: null, error: null } as Rpc,
  calls: [] as { name: string; args: unknown }[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/authority", () => ({
  bearerAuthority: async (token: string) => {
    if (!state.authorized || token !== "aaa.bbb.ccc") return null;
    const membership = { data: state.member ? { role: "instructor" } : null };
    const chain = { select: () => chain, eq: () => chain, is: () => chain, maybeSingle: async () => membership };
    return {
      userId: "user-1",
      db: {
        from: () => chain,
        rpc: async (name: string, args: unknown) => {
          state.calls.push({ name, args });
          if (name === "consume_api_quota") return { data: state.quotaError ? null : state.quota, error: state.quotaError };
          if (name === "session_academy") return { data: state.sessionAcademy, error: null };
          if (name === "check_in_attendance_with_late") return state.checkIn;
          if (name === "check_in_attendance_by_code") return state.codeCheckIn;
          throw new Error(`unexpected rpc ${name}`);
        },
      },
    };
  },
  cookieAuthority: async () => null,
}));

import { OPTIONS, POST } from "./route";

const entry = {
  annual_student_record_id: STUDENT, full_name: "Amal", archived: false, origin: "expected", group_name: "Nine A",
  status: "present", version: 1, source: "check_in", updated_at: "2030-01-01T10:00:00Z", updated_by: "user-1",
  updated_by_name: "Instructor", checked_in_at: "2030-01-01T10:00:00Z", published_status: null, published_at: null,
};

function call(init: { headers?: Record<string, string>; body?: unknown } = {}) {
  const headers = new Headers({ "content-type": "application/json", authorization: `Bearer ${TOKEN}`, "idempotency-key": KEY, ...init.headers });
  const request = new Request(`http://app.lvh.me:3000/api/v1/sessions/${SESSION}/check-ins`, {
    method: "POST", headers, body: JSON.stringify(init.body ?? { annual_student_record_id: STUDENT }),
  });
  return POST(request, { params: Promise.resolve({ sessionId: SESSION }) });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  state.authorized = true;
  state.member = true;
  state.sessionAcademy = ACADEMY;
  state.quota = { allowed: true, retry_after: 1 };
  state.quotaError = null;
  state.checkIn = { data: { outcome: "recorded", entry, revision: 3, correction_pending: false, replayed: false }, error: null };
  state.codeCheckIn = state.checkIn;
  state.calls = [];
});

describe("POST /api/v1/sessions/{id}/check-ins", () => {
  it("records a check-in for a bearer client and answers in snake_case without caching", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    const body = await response.json();
    expect(body).toMatchObject({ outcome: "recorded", revision: 3, correction_pending: false, replayed: false });
    expect(body.entry).toMatchObject({ annual_student_record_id: STUDENT, status: "present", checked_in_at: entry.checked_in_at });
    // The academy comes from the session, never from the request body.
    expect(state.calls.find((c) => c.name === "check_in_attendance_with_late")?.args).toEqual({
      p_academy_id: ACADEMY, p_session_id: SESSION, p_annual_record_id: STUDENT, p_key: KEY, p_late_after_minutes: 0,
    });
  });

  it("requires a valid bearer token and rejects mixed cookie authority", async () => {
    expect((await call({ headers: { authorization: "" } })).status).toBe(401);
    expect((await call({ headers: { authorization: "Bearer not-a-jwt" } })).status).toBe(401);
    state.authorized = false;
    const expired = await call();
    expect(expired.status).toBe(401);
    expect((await expired.json()).error.code).toBe("UNAUTHENTICATED");
    state.authorized = true;
    const mixed = await call({ headers: { cookie: "edra-auth-v1.0=abc" } });
    expect(mixed.status).toBe(400);
    expect((await mixed.json()).error.code).toBe("AMBIGUOUS_AUTHENTICATION");
    expect((await call({ headers: { cookie: "sb-project-auth-token=abc" } })).status).toBe(400);
    expect((await call({ headers: { cookie: "theme=dark" } })).status).toBe(200);
  });

  it("hides sessions outside the caller's academies and rejects removed members", async () => {
    state.sessionAcademy = null;
    const hidden = await call();
    expect(hidden.status).toBe(404);
    expect((await hidden.json()).error).toMatchObject({ code: "NOT_FOUND", request_id: expect.any(String) });
    state.sessionAcademy = ACADEMY;
    state.member = false;
    expect((await call()).status).toBe(403);
  });

  it("requires an Idempotency-Key and exactly one valid identifier", async () => {
    expect((await call({ headers: { "idempotency-key": "" } })).status).toBe(400);
    expect((await call({ body: {} })).status).toBe(400);
    expect((await call({ body: { annual_student_record_id: STUDENT, student_id: "0042" } })).status).toBe(400);
    for (const bad of [42, "", "   ", "00 42", "ÀB12", "A".repeat(21), "A".repeat(65), "AB_1", "AB\u0000"]) {
      expect((await call({ body: { student_id: bad } })).status, String(bad)).toBe(400);
    }
    expect((await call({ body: { student_id: "0042", extra: true } })).status).toBe(400);
    expect((await call({ body: { student_id: "0042", late_after_minutes: 1441 } })).status).toBe(400);
    expect((await call({ body: { student_id: "0042", late_after_minutes: 1.5 } })).status).toBe(400);
    expect((await call({ body: { annual_student_record_id: "not-a-uuid" } })).status).toBe(400);
    expect(state.calls.some((c) => c.name.startsWith("check_in_attendance"))).toBe(false);
  });

  it("submits a normalized student code to the single database command, preserving leading zeroes", async () => {
    const response = await call({ body: { student_id: "  st0042 ", late_after_minutes: 10 } });
    expect(response.status).toBe(200);
    expect((await response.json()).entry.annual_student_record_id).toBe(STUDENT);
    const rpc = state.calls.filter((c) => c.name.startsWith("check_in_attendance"));
    expect(rpc).toEqual([{
      name: "check_in_attendance_by_code",
      args: { p_academy_id: ACADEMY, p_session_id: SESSION, p_code: "ST0042", p_key: KEY, p_late_after_minutes: 10 },
    }]);
    // The omitted option is sent as 0 so omitted and 0 share a fingerprint.
    await call({ body: { student_id: "0042" } });
    expect(state.calls.filter((c) => c.name === "check_in_attendance_by_code").at(-1)?.args).toMatchObject({ p_code: "0042", p_late_after_minutes: 0 });
  });

  it("maps student code failures to stable codes", async () => {
    for (const [message, status, code] of [
      ["student_codes_disabled", 409, "STUDENT_CODES_DISABLED"], ["student_code_retired", 409, "STUDENT_CODE_RETIRED"],
      ["student_code_not_found", 404, "STUDENT_CODE_NOT_FOUND"], ["student_code_ambiguous", 409, "STUDENT_CODE_AMBIGUOUS"],
      ["not_on_roster", 422, "NOT_ON_ROSTER"], ["idempotency_conflict", 409, "IDEMPOTENCY_CONFLICT"],
    ] as const) {
      state.codeCheckIn = { data: null, error: { code: "P0001", message } };
      const response = await call({ body: { student_id: "0042" } });
      expect(response.status).toBe(status);
      expect((await response.json()).error.code).toBe(code);
    }
    state.codeCheckIn = { data: { outcome: "review_required", entry: { ...entry, status: "excused" }, revision: 3, correction_pending: false, replayed: false }, error: null };
    expect((await (await call({ body: { student_id: "0042" } })).json()).error.code).toBe("REVIEW_REQUIRED");
    state.codeCheckIn = { data: null, error: { code: "P0001", message: "throttled", details: "9" } };
    const limited = await call({ body: { student_id: "0042" } });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("9");
  });

  it("maps review, roster, lifecycle, and retry outcomes to stable codes", async () => {
    state.checkIn = { data: { outcome: "review_required", entry: { ...entry, status: "absent" }, revision: 3, correction_pending: false, replayed: false }, error: null };
    const review = await call();
    expect(review.status).toBe(409);
    expect((await review.json()).error).toMatchObject({ code: "REVIEW_REQUIRED", details: { outcome: "review_required" } });

    for (const [message, status, code] of [
      ["not_on_roster", 422, "NOT_ON_ROSTER"], ["student_not_found", 404, "STUDENT_NOT_FOUND"],
      ["session_ended", 409, "SESSION_ENDED"], ["year_unavailable", 409, "YEAR_CLOSED"],
      ["idempotency_conflict", 409, "IDEMPOTENCY_CONFLICT"], ["anything else", 500, "INTERNAL"],
    ] as const) {
      state.checkIn = { data: null, error: { code: "P0001", message } };
      const response = await call();
      expect(response.status).toBe(status);
      expect((await response.json()).error.code).toBe(code);
    }
  });

  it("throttles per user with retry guidance", async () => {
    state.quota = { allowed: false, retry_after: 17 };
    const response = await call();
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("17");
  });

  it("maps database-enforced mutation throttling to 429 with retry guidance", async () => {
    state.checkIn = { data: null, error: { code: "P0001", message: "throttled", details: "23" } };
    const response = await call();
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("23");
    expect((await response.json()).error.code).toBe("THROTTLED");
  });

  it("rejects a token whose session was revoked or is recovery-only", async () => {
    state.quotaError = { code: "EDRA_SESSION_INACTIVE" };
    const response = await call();
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHENTICATED");
    expect(state.calls.some((c) => c.name.startsWith("check_in_attendance"))).toBe(false);
  });

  it("answers preflight without granting access, with CORS only for configured origins", async () => {
    vi.stubEnv("EDRA_API_ALLOWED_ORIGINS", "https://scanner.example");
    const allowed = OPTIONS(new Request("http://app.lvh.me:3000/x", { method: "OPTIONS", headers: { origin: "https://scanner.example" } }));
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("access-control-allow-origin")).toBe("https://scanner.example");
    expect(allowed.headers.get("access-control-allow-headers")).toContain("Idempotency-Key");
    const other = OPTIONS(new Request("http://app.lvh.me:3000/x", { method: "OPTIONS", headers: { origin: "https://evil.example" } }));
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
  });
});
