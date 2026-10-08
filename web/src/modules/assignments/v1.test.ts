import { beforeEach, describe, expect, it, vi } from "vitest";

const ACADEMY = "11111111-1111-4111-8111-111111111111";
const ASSIGNMENT = "22222222-2222-4222-8222-222222222222";
const STUDENT = "33333333-3333-4333-8333-333333333333";
const PART = "55555555-5555-4555-8555-555555555555";
const KEY = "44444444-4444-4444-8444-444444444444";

const state = vi.hoisted(() => ({ result: { data: null as unknown, error: null as unknown }, calls: [] as { name: string; args: unknown }[] }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/authority", () => ({ cookieAuthority: async () => null }));

import type { StaffApiContext } from "@/lib/api/handler";
import { patchMarksResponse, resolutionResponse } from "./v1";

const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: { role: "instructor" } }) };
const context = {
  requestId: "req-1", origin: null, methods: "PATCH",
  authority: {
    userId: "user-1",
    db: { from: () => chain, rpc: async (name: string, args: unknown) => { state.calls.push({ name, args }); return state.result; } },
  },
} as unknown as StaffApiContext;

const recipient = (version: number, score = "7.50") => ({
  annual_student_record_id: STUDENT, full_name: "Amal", archived: false, group_name: "Nine A", student_code: "0001",
  work_status: "submitted", received_at: "2030-01-01T10:00:00Z", work_note: "", feedback: "", version,
  marks: [{ part_id: PART, kind: "mark", score, reason: null }], marked_parts: 1, total: score, marking: "partial",
  publication: null, publication_state: "unpublished",
});

const request = (body: unknown, key: string | null = KEY) => new Request("http://app.lvh.me:3000/x", {
  method: "PATCH", headers: { "content-type": "application/json", ...(key ? { "idempotency-key": key } : {}) }, body: JSON.stringify(body),
});

beforeEach(() => { state.calls = []; state.result = { data: null, error: null }; });

describe("assignment marks API", () => {
  it("saves marks by student code and reports that the work was recorded", async () => {
    state.result = { data: { outcome: "saved", recipient: recipient(2), work_recorded: true, replayed: false }, error: null };
    const response = await patchMarksResponse(context, request({ student_id: " 0001 ", expected_version: 1, marks: [{ part_id: PART, score: "7.5" }] }), ACADEMY, ASSIGNMENT);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ outcome: "saved", work_recorded: true, replayed: false, student: { version: 2, total: "7.50" } });
    expect(state.calls.at(-1)).toMatchObject({
      name: "save_assignment_marks",
      args: { p_code: "0001", p_record_id: null, p_expected_version: 1, p_key: KEY, p_changes: { marks: [{ part_id: PART, score: "7.5" }] } },
    });
  });

  it("returns the current row on a stale save and never overwrites it", async () => {
    state.result = { data: { outcome: "conflict", recipient: recipient(3, "9.00"), work_recorded: false, replayed: false }, error: null };
    const response = await patchMarksResponse(context, request({ annual_student_record_id: STUDENT, expected_version: 1, marks: [{ part_id: PART, score: "1" }] }), ACADEMY, ASSIGNMENT);
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("MARKS_CONFLICT");
    expect(body.error.details.current).toMatchObject({ version: 3, total: "9.00" });
  });

  it("requires an idempotency key and exactly one identifier", async () => {
    const marks = [{ part_id: PART, score: "1" }];
    expect((await patchMarksResponse(context, request({ annual_student_record_id: STUDENT, expected_version: 1, marks }, null), ACADEMY, ASSIGNMENT)).status).toBe(400);
    expect((await patchMarksResponse(context, request({ expected_version: 1, marks }), ACADEMY, ASSIGNMENT)).status).toBe(400);
    expect((await patchMarksResponse(context, request({ student_id: "0001", annual_student_record_id: STUDENT, expected_version: 1, marks }), ACADEMY, ASSIGNMENT)).status).toBe(400);
    expect((await patchMarksResponse(context, request({ annual_student_record_id: STUDENT, expected_version: 1, marks: [] }), ACADEMY, ASSIGNMENT)).status).toBe(400);
    expect((await patchMarksResponse(context, request({ annual_student_record_id: STUDENT, expected_version: 1, marks, extra: true }), ACADEMY, ASSIGNMENT)).status).toBe(400);
    expect(state.calls).toHaveLength(0);
  });

  it("maps domain errors to stable API codes", async () => {
    const cases: [string, number, string][] = [
      ["invalid_score", 422, "INVALID_SCORE"],
      ["unknown_part", 422, "UNKNOWN_PART"],
      ["not_recipient", 422, "NOT_A_RECIPIENT"],
      ["invalid_state", 409, "ASSIGNMENT_NOT_OPEN"],
      ["year_unavailable", 409, "YEAR_CLOSED"],
      ["student_code_not_found", 404, "STUDENT_CODE_NOT_FOUND"],
      ["idempotency_conflict", 409, "IDEMPOTENCY_CONFLICT"],
    ];
    for (const [message, status, code] of cases) {
      state.result = { data: null, error: { code: "P0001", message } };
      const response = await patchMarksResponse(context, request({ annual_student_record_id: STUDENT, expected_version: 1, marks: [{ part_id: PART, score: "1" }] }), ACADEMY, ASSIGNMENT);
      expect(response.status).toBe(status);
      expect((await response.json()).error.code).toBe(code);
    }
  });
});

describe("assignment student resolution", () => {
  it("resolves a code to its recipient without changing anything", async () => {
    state.result = { data: recipient(1), error: null };
    const response = await resolutionResponse(context, request({ student_id: "0001" }), ACADEMY, ASSIGNMENT);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ student: { annual_student_record_id: STUDENT, student_code: "0001", full_name: "Amal" } });
    expect(state.calls.at(-1)?.name).toBe("resolve_assignment_student");
  });

  it("refuses ambiguous and retired codes", async () => {
    state.result = { data: null, error: { code: "P0001", message: "student_code_ambiguous" } };
    expect((await resolutionResponse(context, request({ student_id: "0001" }), ACADEMY, ASSIGNMENT)).status).toBe(409);
    expect((await resolutionResponse(context, request({}), ACADEMY, ASSIGNMENT)).status).toBe(400);
  });
});
