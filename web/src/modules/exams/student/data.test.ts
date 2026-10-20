import { beforeEach, describe, expect, it, vi } from "vitest";

const ACADEMY = "11111111-1111-4111-8111-111111111111";
const EXAM = "22222222-2222-4222-8222-222222222222";

type Rpc = { data: unknown; error: { code?: string; message?: string; details?: string } | null };
const state = vi.hoisted(() => ({
  signedIn: true,
  response: { data: null, error: null } as Rpc,
  calls: [] as { name: string; args: unknown }[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/authority", () => ({
  cookieAuthority: async () => state.signedIn ? {
    userId: "student-1",
    db: { rpc: async (name: string, args: unknown) => { state.calls.push({ name, args }); return state.response; } },
  } : null,
}));

const { getMyExamOverview, listMyExams, startMyExam } = await import("./data");

const attempt = {
  started_at: "2026-10-20T08:00:00Z", deadline_at: "2026-10-20T08:30:00Z", cutoff_at: "2026-10-20T08:30:00Z",
  departure_count: 1, finalized_at: null, finalization_reason: null, superseded: false,
};
const overview = {
  exam_id: EXAM, title: "Midterm", instructions: "Bring a pen", time_limit_minutes: 30,
  opens_at: "2026-10-20T07:00:00Z", closes_at: "2026-10-20T09:00:00Z", actual_closes_at: "2026-10-20T09:02:00Z",
  server_now: "2026-10-20T08:10:00Z", phase: "open", action: "resume", attempt, submission: null, result: null,
};

beforeEach(() => {
  state.signedIn = true;
  state.response = { data: null, error: null };
  state.calls = [];
});

describe("student exam boundary", () => {
  it("rejects malformed ids and pages before calling the database", async () => {
    expect(await listMyExams({ academyId: "not-a-uuid", page: 1 })).toMatchObject({ ok: false, code: "validation" });
    expect(await listMyExams({ academyId: ACADEMY, page: 0 })).toMatchObject({ ok: false, code: "validation" });
    expect(await getMyExamOverview({ academyId: ACADEMY, examId: "../x" })).toMatchObject({ ok: false, code: "not_found" });
    expect(await startMyExam({ academyId: ACADEMY, examId: "nope" })).toMatchObject({ ok: false, code: "validation" });
    expect(state.calls).toEqual([]);
  });

  it("requires a signed-in cookie session", async () => {
    state.signedIn = false;
    expect(await listMyExams({ academyId: ACADEMY, page: 1 })).toMatchObject({ ok: false, code: "forbidden" });
    expect(state.calls).toEqual([]);
  });

  it("pages with bounded offsets", async () => {
    state.response = { data: { total: 0, items: [], server_now: "2026-10-20T08:00:00Z" }, error: null };
    await listMyExams({ academyId: ACADEMY, page: 3 });
    expect(state.calls).toEqual([{ name: "list_my_exams", args: { p_academy_id: ACADEMY, p_limit: 20, p_offset: 40 } }]);
  });

  it("forwards only allowlisted overview fields", async () => {
    state.response = {
      data: {
        ...overview,
        parts: [{ questions: [{ prompt: "secret" }] }],
        attempt: { ...attempt, answers: [{ question_id: "q", choice_id: "c" }], departures: [{ question_id: "q" }] },
        result: { total: "7.50", max_score: "10.00", published_at: "2026-10-20T09:05:00Z", corrected: true,
          corrected_at: "2026-10-21T10:00:00Z", items: [{ score: "1" }], feedback: "private" },
      },
      error: null,
    };
    const result = await getMyExamOverview({ academyId: ACADEMY, examId: EXAM });
    expect(result.ok).toBe(true);
    const text = JSON.stringify(result);
    for (const leaked of ["parts", "secret", "answers", "departures", "items", "feedback", "private"]) expect(text).not.toContain(leaked);
    expect(result).toMatchObject({ ok: true, data: { action: "resume", result: { total: "7.50", corrected: true } } });
  });

  it("fails closed on an unexpected response shape", async () => {
    state.response = { data: { ...overview, action: "teleport" }, error: null };
    expect(await getMyExamOverview({ academyId: ACADEMY, examId: EXAM })).toMatchObject({ ok: false, code: "unavailable" });
  });

  it("acknowledges the attempt from the start response without question material", async () => {
    state.response = { data: { attempt, parts: [{ questions: [{ prompt: "secret" }] }] }, error: null };
    const result = await startMyExam({ academyId: ACADEMY, examId: EXAM });
    expect(result).toEqual({ ok: true, active: true, attempt: {
      startedAt: attempt.started_at, deadlineAt: attempt.deadline_at, cutoffAt: attempt.cutoff_at,
      departureCount: 1, finalizedAt: null, finalizationReason: null, superseded: false,
    } });
    expect(state.calls).toEqual([{ name: "start_my_exam", args: { p_academy_id: ACADEMY, p_exam_id: EXAM } }]);
  });

  it("reports a finalized attempt as inactive", async () => {
    state.response = { data: { attempt: { ...attempt, finalized_at: "2026-10-20T08:20:00Z", finalization_reason: "kicked" } }, error: null };
    expect(await startMyExam({ academyId: ACADEMY, examId: EXAM })).toMatchObject({ ok: true, active: false });
  });

  it("maps database codes to student messages and hides unknown errors", async () => {
    state.response = { data: null, error: { code: "P0001", message: "not_open" } };
    expect(await startMyExam({ academyId: ACADEMY, examId: EXAM })).toMatchObject({ ok: false, code: "not_open", message: "This exam isn’t open for new attempts." });
    state.response = { data: null, error: { code: "P0001", message: "throttled", details: "12" } };
    expect(await startMyExam({ academyId: ACADEMY, examId: EXAM })).toMatchObject({ ok: false, code: "throttled", retryAfter: 12 });
    state.response = { data: null, error: { code: "42501", message: "permission denied for function" } };
    expect(await startMyExam({ academyId: ACADEMY, examId: EXAM })).toMatchObject({ ok: false, code: "unavailable" });
  });
});
