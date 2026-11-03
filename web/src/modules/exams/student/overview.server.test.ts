import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ overview: vi.fn(), review: vi.fn(), notFound: vi.fn(() => { throw new Error("not found"); }) }));
vi.mock("@tanstack/react-start/server-only", () => ({}));
vi.mock("@/lib/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("./data", () => ({ getMyExamOverview: mocks.overview, getMyExamReview: mocks.review }));
import { loadStudentExamOverview } from "./overview.server";
import type { StudentExamAcademy } from "./types";
const academy = { id: "academy", access: "active" } as StudentExamAcademy;
beforeEach(() => vi.clearAllMocks());
describe("loadStudentExamOverview", () => {
  it("does not read an exam when access is blocked", async () => {
    expect(await loadStudentExamOverview({ academy: { ...academy, access: "suspended" } as StudentExamAcademy, examId: "exam" })).toEqual({ kind: "access", access: "suspended" });
    expect(mocks.overview).not.toHaveBeenCalled();
  });
  it("preserves not-found, unavailable and notice failures", async () => {
    mocks.overview.mockResolvedValueOnce({ ok: false, code: "not_found" }).mockResolvedValueOnce({ ok: false, code: "unavailable", message: "retry" }).mockResolvedValueOnce({ ok: false, code: "blocked", message: "blocked" });
    await expect(loadStudentExamOverview({ academy, examId: "exam" })).rejects.toThrow("not found");
    await expect(loadStudentExamOverview({ academy, examId: "exam" })).rejects.toThrow("retry");
    expect(await loadStudentExamOverview({ academy, examId: "exam" })).toEqual({ kind: "notice", message: "blocked" });
  });
  const base = {
    examId: "exam", title: "Midterm", instructions: "Bring a pen", timeLimitMinutes: 30, action: "start", serverNow: "2030-01-01T00:00:00Z",
    opensAt: "2029-12-01T00:00:00Z", closesAt: "2030-02-01T00:00:00Z", actualClosesAt: "2030-02-02T00:00:00Z", phase: "open",
    attempt: null, submission: null, result: null,
  };
  const attempt = { startedAt: "s", deadlineAt: "d", cutoffAt: "c", departureCount: 2, finalizedAt: null, finalizationReason: null, superseded: false };
  it("reads review only for a submission", async () => {
    mocks.overview.mockResolvedValueOnce({ ok: true, data: base }).mockResolvedValueOnce({ ok: true, data: { ...base, submission: { submittedAt: "t", reason: "submitted", source: "online", processedAt: "p" } } });
    mocks.review.mockResolvedValue({ ok: true, data: { status: "available" } });
    expect(await loadStudentExamOverview({ academy, examId: "exam" })).toMatchObject({ kind: "exam", review: null });
    expect(mocks.review).not.toHaveBeenCalled();
    await loadStudentExamOverview({ academy, examId: "exam" });
    expect(mocks.review).toHaveBeenCalledWith({ academyId: "academy", examId: "exam" });
  });
  it("projects the exam to the rendered fields and derived state", async () => {
    mocks.overview.mockResolvedValue({ ok: true, data: { ...base, action: "resume", attempt } });
    const loaded = await loadStudentExamOverview({ academy, examId: "exam" });
    expect(loaded).toEqual({
      kind: "exam", processing: false, awaiting: false, failure: false, review: null, closing: "2030-02-02T00:00:00Z",
      exam: {
        examId: "exam", title: "Midterm", instructions: "Bring a pen", timeLimitMinutes: 30, action: "resume", serverNow: "2030-01-01T00:00:00Z",
        availability: { opensAt: "2029-12-01T00:00:00Z", label: "Closes", at: "2030-02-01T00:00:00Z" },
        attempt: { startedAt: "s", deadline: "c" }, submission: null, result: null,
      },
    });
    expect(JSON.stringify(loaded)).not.toMatch(/deadlineAt|departureCount|finalizationReason|finalizedAt|superseded|phase|actualClosesAt/);
  });
  it("derives processing and drops the deadline outside an attempt in progress", async () => {
    mocks.overview.mockResolvedValue({ ok: true, data: { ...base, action: "submitted", attempt, phase: "closed" } });
    expect(await loadStudentExamOverview({ academy, examId: "exam" })).toMatchObject({
      processing: true, awaiting: true, exam: { attempt: { deadline: null }, availability: { label: "Closed", at: "2030-02-02T00:00:00Z" } },
    });
  });
  it("projects the submission, result and review states", async () => {
    const submission = { submittedAt: "t", reason: "timer", source: "online", processedAt: "p" };
    const result = { total: "8", maxScore: "10", publishedAt: "pub", corrected: true, correctedAt: "cor" };
    mocks.overview.mockResolvedValue({ ok: true, data: { ...base, action: "submitted", phase: "headroom", attempt, submission, result } });
    mocks.review.mockResolvedValue({ ok: true, data: { status: "unavailable", accountId: "acct", serverNow: "n", reason: "awaiting_closure" } });
    const loaded = await loadStudentExamOverview({ academy, examId: "exam" });
    expect(loaded).toMatchObject({
      awaiting: true, failure: false,
      exam: { submission: { submittedAt: "t", reason: "timer", source: "online" }, result: { total: "8", maxScore: "10", corrected: true, when: { label: "Corrected", value: "cor" } }, availability: { label: "Closed to new starts" } },
      review: { status: "unavailable", reason: "awaiting_closure", closesAt: "2030-02-02T00:00:00Z" },
    });
    expect(JSON.stringify(loaded)).not.toMatch(/processedAt|acct|publishedAt|"pub"/);
    mocks.review.mockResolvedValue({ ok: true, data: { status: "unavailable", accountId: "acct", serverNow: "n", reason: "awaiting_result" } });
    expect(await loadStudentExamOverview({ academy, examId: "exam" })).toMatchObject({ review: { status: "unavailable", reason: "awaiting_result", closesAt: null } });
    mocks.review.mockResolvedValue({ ok: true, data: { status: "unavailable", accountId: "acct", serverNow: "n", reason: "not_submitted" } });
    expect(await loadStudentExamOverview({ academy, examId: "exam" })).toMatchObject({ review: null });
  });
  it("keeps the whole available review, which the client component renders, and hides a failure's code and message", async () => {
    const data = { status: "available", accountId: "acct", serverNow: "n", source: "online", notes: "", parts: [] };
    mocks.overview.mockResolvedValue({ ok: true, data: { ...base, action: "submitted", submission: { submittedAt: "t", reason: "timer", source: "online", processedAt: "p" } } });
    mocks.review.mockResolvedValue({ ok: true, data });
    expect(await loadStudentExamOverview({ academy, examId: "exam" })).toMatchObject({ review: { status: "available", data }, awaiting: true });
    mocks.review.mockResolvedValue({ ok: false, code: "throttled", message: "internal detail" });
    const failed = await loadStudentExamOverview({ academy, examId: "exam" });
    expect(failed).toMatchObject({ failure: true, review: null });
    expect(JSON.stringify(failed)).not.toMatch(/throttled|internal detail/);
  });
});
