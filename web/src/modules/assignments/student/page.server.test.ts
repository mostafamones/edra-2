import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ read: vi.fn(), authority: vi.fn(), notFound: vi.fn(() => { throw new Error("not found"); }) }));
vi.mock("@tanstack/react-start/server-only", () => ({}));
vi.mock("@/lib/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/lib/supabase/authority", () => ({ cookieAuthority: mocks.authority }));
vi.mock("./data", () => ({ getMyAssignment: mocks.read }));
import { loadStudentAssignment } from "./page.server";
import type { StudentAssignmentAcademy } from "./types";
const academy = { id: "academy" } as StudentAssignmentAcademy;
beforeEach(() => { vi.clearAllMocks(); mocks.authority.mockResolvedValue({ userId: "user" }); });
describe("loadStudentAssignment", () => {
  it("preserves not-found, unavailable and notice failures", async () => {
    mocks.read.mockResolvedValueOnce({ ok: false, code: "validation" }).mockResolvedValueOnce({ ok: false, code: "unavailable", message: "retry" }).mockResolvedValueOnce({ ok: false, code: "blocked", message: "blocked" });
    await expect(loadStudentAssignment({ academy, assignmentId: "assignment" })).rejects.toThrow("not found");
    await expect(loadStudentAssignment({ academy, assignmentId: "assignment" })).rejects.toThrow("retry");
    expect(await loadStudentAssignment({ academy, assignmentId: "assignment" })).toEqual({ kind: "notice", message: "blocked" });
  });
  it("returns only the rendered assignment fields and the caller identity for the editor", async () => {
    const full = {
      id: "assignment", title: "Essay", instructions: "Write", dueAt: null, required: true, started: true, canEdit: true, blockedReason: null,
      unit: { id: "unit", title: "Course" }, receipt: null, result: null, answerVideos: [{ id: "video", title: "Answers" }],
    };
    mocks.read.mockResolvedValue({ ok: true, data: full });
    expect(await loadStudentAssignment({ academy, assignmentId: "assignment" })).toEqual({
      kind: "assignment", userId: "user",
      assignment: { id: "assignment", title: "Essay", instructions: "Write", dueAt: null, required: true, status: { label: "In progress", tone: "outline" }, unit: full.unit, receipt: null, result: null, answerVideos: full.answerVideos, blockedReason: null },
    });
  });
  it("drops result and receipt metadata the page does not render, and the id when nothing is editable", async () => {
    const data = {
      id: "assignment", title: "Essay", instructions: "", dueAt: null, required: false, started: true, canEdit: false, blockedReason: "result_announced", unit: null,
      receipt: { submittedAt: "2030-01-01T00:00:00Z", late: true, internal: "x" }, result: { total: "1", maxScore: "2", feedback: "ok", publishedAt: "2030-01-02T00:00:00Z" }, answerVideos: [],
    };
    mocks.read.mockResolvedValue({ ok: true, data });
    const loaded = await loadStudentAssignment({ academy, assignmentId: "assignment" });
    expect(loaded).toMatchObject({ userId: null, assignment: { receipt: { submittedAt: "2030-01-01T00:00:00Z", late: true }, result: { total: "1", maxScore: "2", feedback: "ok" }, blockedReason: null, status: { label: "Result announced" } } });
    expect(JSON.stringify(loaded)).not.toMatch(/publishedAt|internal|canEdit|started|result_announced/);
    mocks.read.mockResolvedValue({ ok: true, data: { ...data, blockedReason: "assignment_closed", result: null } });
    expect(await loadStudentAssignment({ academy, assignmentId: "assignment" })).toMatchObject({ assignment: { blockedReason: "assignment_closed" } });
  });
});
