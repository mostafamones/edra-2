import { expect, it, vi } from "vitest";
vi.mock("@/modules/content", () => ({ loadStaffStudentLearning: vi.fn() }));
vi.mock("@/modules/attendance", () => ({ loadStudentAttendance: vi.fn() }));
vi.mock("@/modules/assessments", () => ({ loadStudentAssessments: vi.fn() }));
import { awaitingMarking, expiredUnfinishedUnit, learningPreview, unitCompleted, type StudentAssessmentData, type StudentUnit } from "./overview";

const unit = (id: string, status: StudentUnit["access"]["status"], completed = 0, total = 5): StudentUnit => ({
  id, title: id, access: { status, expiresAt: null, grantId: null }, progress: { completed, total, items: [] },
});

it("keeps completion independent of access, without completing an empty unit", () => {
  expect(unitCompleted(unit("empty", "active", 0, 0))).toBe(false);
  expect(unitCompleted(unit("finished", "revoked", 5))).toBe(true);
  expect(expiredUnfinishedUnit([unit("empty", "expired", 0, 0), unit("done", "expired", 5), unit("partial", "expired", 2)])?.id).toBe("partial");
});

it("prioritizes unfinished expired work within the supplied page and preserves source order", () => {
  const units = [unit("locked", "locked"), unit("complete", "active", 5), unit("active", "active", 2), unit("expired", "expired", 1)];
  const before = units.map(item => item.id);
  const preview = learningPreview(units);
  expect(preview.unfinished.map(item => item.id)).toEqual(["expired", "active"]);
  expect(preview.completed.map(item => item.id)).toEqual(["complete"]);
  expect(units.map(item => item.id)).toEqual(before);
});

it("flags only actually submitted work with incomplete marking", () => {
  const item = (id: string, work: string, complete = false, score: string | null = null): StudentAssessmentData["items"][number] => ({
    id, title: id, kind: "assignment", work, complete, score, maximum: "20", publication: null, publicationState: null,
  });
  expect(awaitingMarking([item("expected", "expected"), item("attempt", "in_progress"), item("unmarked", "submitted"), item("partial", "late", false, "0"), item("marked", "submitted", true, "0")]).map(row => row.id)).toEqual(["unmarked", "partial"]);
});
