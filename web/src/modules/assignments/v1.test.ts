import { beforeEach, describe, expect, it, vi } from "vitest";

const ACADEMY = "11111111-1111-4111-8111-111111111111";
const ASSIGNMENT = "22222222-2222-4222-8222-222222222222";
const STUDENT = "33333333-3333-4333-8333-333333333333";
const PART = "55555555-5555-4555-8555-555555555555";
const QUESTION = "66666666-6666-4666-8666-666666666666";
const CHOICE = "77777777-7777-4777-8777-777777777777";
const KEY = "44444444-4444-4444-8444-444444444444";

const state = vi.hoisted(() => ({ result: { data: null as unknown, error: null as unknown }, calls: [] as { name: string; args: unknown }[] }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/authority", () => ({ cookieAuthority: async () => null }));

import type { StaffApiContext } from "@/lib/api/handler";
import { marksResponse, patchMarksResponse, publicationResponse, resolutionResponse } from "./v1";

const chain = { select: () => chain, eq: () => chain, is: () => chain, maybeSingle: async () => ({ data: { role: "instructor" } }) };
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
  marks: [{ part_id: PART, kind: "mark", score, reason: null, from_answers: true }], marked_parts: 1, total: score, marking: "partial",
  answers: [{ question_id: QUESTION, part_id: PART, choice_id: null, score: "0" }],
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

describe("assignment answers, search and announcement API", () => {
  it("saves per-question answers without part marks and returns saved answers", async () => {
    state.result = { data: { outcome: "saved", recipient: recipient(2), work_recorded: true, replayed: false }, error: null };
    const response = await patchMarksResponse(context, request({
      annual_student_record_id: STUDENT, expected_version: 1,
      answers: [{ question_id: QUESTION, choice_id: null }, { question_id: CHOICE, score: "1.5" }, { question_id: PART, clear: true }],
    }), ACADEMY, ASSIGNMENT);
    expect(response.status).toBe(200);
    expect((await response.json()).student.answers).toEqual([{ question_id: QUESTION, part_id: PART, choice_id: null, score: "0" }]);
    expect(state.calls.at(-1)?.args).toMatchObject({ p_changes: { marks: [], answers: [
      { question_id: QUESTION, choice_id: null }, { question_id: CHOICE, score: "1.5" }, { question_id: PART, clear: true },
    ] } });
  });

  it("preserves optional eligibility and ended requirements in the native-facing rows", async () => {
    state.result = { data: { total: 2, items: [
      { ...recipient(1), required: false, eligible: true, requirement_ended_at: null, requirement_source: "late_eligibility", cohort_revision: null },
      { ...recipient(2), required: true, eligible: false, requirement_ended_at: "2026-10-19T10:00:00Z", requirement_source: "required_cohort", cohort_revision: 1 },
    ] }, error: null };
    const response = await marksResponse(context, ACADEMY, ASSIGNMENT, new URLSearchParams());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.students).toMatchObject([
      { required: false, eligible: true, requirement_source: "late_eligibility", cohort_revision: null },
      { required: true, eligible: false, requirement_ended_at: "2026-10-19T10:00:00Z", cohort_revision: 1 },
    ]);
  });

  it("refuses mixed or duplicate answer edits before the database", async () => {
    const bad = [
      [{ question_id: QUESTION, choice_id: CHOICE, score: "1" }],
      [{ question_id: QUESTION, clear: false }],
      [{ question_id: QUESTION, choice_id: CHOICE }, { question_id: QUESTION, clear: true }],
    ];
    for (const answers of bad) {
      expect((await patchMarksResponse(context, request({ annual_student_record_id: STUDENT, expected_version: 1, answers }), ACADEMY, ASSIGNMENT)).status).toBe(400);
    }
    expect(state.calls).toHaveLength(0);
  });

  it("passes the search to the database so totals cover every match", async () => {
    state.result = { data: { total: 120, items: [recipient(1)] }, error: null };
    const response = await marksResponse(context, ACADEMY, ASSIGNMENT, new URLSearchParams({ search: "am", limit: "1", offset: "50" }));
    expect(response.status).toBe(200);
    expect((await response.json()).total).toBe(120);
    expect(state.calls.at(-1)?.args).toMatchObject({ p_search: "am", p_limit: 1, p_offset: 50 });
  });

  it("announces a selection and rejects the whole selection with per-student reasons", async () => {
    const items = [{ annual_student_record_id: STUDENT, expected_version: 2 }];
    state.result = { data: { outcome: "published", results: [{ annual_student_record_id: STUDENT, outcome: "corrected", revision: 2 }], replayed: true }, error: null };
    const published = await publicationResponse(context, request({ items }), ACADEMY, ASSIGNMENT);
    expect(published.status).toBe(200);
    expect(await published.json()).toEqual({ outcome: "published", replayed: true, results: [{ annual_student_record_id: STUDENT, outcome: "corrected", revision: 2 }] });
    expect(state.calls.at(-1)).toMatchObject({ name: "publish_assignment_results", args: { p_key: KEY, p_items: items } });

    state.result = { data: { outcome: "rejected", failures: [{ annual_student_record_id: STUDENT, reason: "stale" }] }, error: null };
    const rejected = await publicationResponse(context, request({ items }), ACADEMY, ASSIGNMENT);
    expect(rejected.status).toBe(409);
    expect((await rejected.json()).error).toMatchObject({ code: "PUBLICATION_REJECTED", details: { failures: [{ annual_student_record_id: STUDENT, reason: "stale" }] } });
  });

  it("requires a key and unique items to announce", async () => {
    state.calls = [];
    const items = [{ annual_student_record_id: STUDENT, expected_version: 2 }];
    expect((await publicationResponse(context, request({ items }, null), ACADEMY, ASSIGNMENT)).status).toBe(400);
    expect((await publicationResponse(context, request({ items: [...items, ...items] }), ACADEMY, ASSIGNMENT)).status).toBe(400);
    expect((await publicationResponse(context, request({ items: [] }), ACADEMY, ASSIGNMENT)).status).toBe(400);
    expect(state.calls).toHaveLength(0);
  });
});
