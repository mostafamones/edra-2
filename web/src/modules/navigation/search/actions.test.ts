import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ authority: vi.fn(), member: vi.fn(), academy: vi.fn(), year: vi.fn(), students: vi.fn(), content: vi.fn(), assignments: vi.fn(), quizzes: vi.fn(), exams: vi.fn(), studentAcademy: vi.fn(), learning: vi.fn(), studentAssignments: vi.fn() }));
vi.mock("@/lib/supabase/authority", () => ({ cookieAuthority: mocks.authority }));
vi.mock("@/lib/supabase/membership", () => ({ academyMember: mocks.member }));
vi.mock("@/modules/students/server", () => ({ listStudentRecords: mocks.students, readListParams: () => ({ params: {} }), getMyStudentAcademy: mocks.studentAcademy }));
vi.mock("@/modules/content/server", () => ({ searchStaffContent: mocks.content, readLearningList: mocks.learning }));
vi.mock("@/modules/assignments/server", () => ({ searchStaffAssignments: mocks.assignments, listMyAssignments: mocks.studentAssignments }));
vi.mock("@/modules/quizzes/server", () => ({ listQuizzes: mocks.quizzes }));
vi.mock("@/modules/exams/server", () => ({ listExams: mocks.exams }));
import { searchAcademy } from "./actions";
const academyId = "10000000-0000-4000-8000-000000000001", yearId = "10000000-0000-4000-8000-000000000002";
beforeEach(() => {
  vi.clearAllMocks();
  const chain = (result: unknown) => ({ select: () => ({ eq: () => ({ is: () => ({ maybeSingle: async () => result }), maybeSingle: async () => result }) }) });
  mocks.authority.mockResolvedValue({ userId: "user", db: { from: (name: string) => chain(name === "academies" ? { data: { id: academyId, name: "Academy" } } : { data: { id: yearId, start_year: 2026 } }) } });
  mocks.member.mockResolvedValue({ role: "admin" });
  mocks.students.mockResolvedValue({ ok: true, data: { rows: [{ id: "record", fullName: "Nour", studentPhone: "private-phone", parentPhone: "private-parent", levelName: "Secondary", trackName: "Science", groupName: null }] } });
  mocks.content.mockResolvedValue([]); mocks.assignments.mockResolvedValue([]);
  mocks.quizzes.mockResolvedValue({ ok: true, data: { quizzes: [] } }); mocks.exams.mockResolvedValue({ ok: true, data: { exams: [] } });
});
it("does not read academy records for signed-out callers", async () => {
  mocks.authority.mockResolvedValue(null);
  expect(await searchAcademy({ platform: "staff", slug: "academy", query: "Nour" })).toEqual({ ok: false, message: "Sign in to search." });
  expect(mocks.students).not.toHaveBeenCalled();
});
it("denies a guessed academy before querying its domains", async () => {
  mocks.member.mockResolvedValue(null);
  expect(await searchAcademy({ platform: "staff", slug: "academy", query: "Nour" })).toMatchObject({ ok: false });
  expect(mocks.content).not.toHaveBeenCalled(); expect(mocks.students).not.toHaveBeenCalled();
});
it("returns bounded metadata and a record link without exposing contacts", async () => {
  const result = await searchAcademy({ platform: "staff", slug: "academy", query: "Nour" });
  expect(result).toMatchObject({ ok: true, value: { userId: "user", academyId, scope: "Academy · 2026–2027" } });
  expect(JSON.stringify(result)).not.toContain("private-phone"); expect(JSON.stringify(result)).not.toContain("private-parent");
  expect(JSON.stringify(result)).toContain("students?record=record");
  expect(mocks.content).toHaveBeenCalledWith(academyId, yearId, "Nour");
});
it("preserves successful groups when one domain is unavailable", async () => {
  mocks.content.mockRejectedValue(new Error("provider failure"));
  const result = await searchAcademy({ platform: "staff", slug: "academy", query: "Nour" });
  expect(result).toMatchObject({ ok: true, value: { unavailable: ["Content units"] } });
  expect(JSON.stringify(result)).toContain("Nour"); expect(JSON.stringify(result)).not.toContain("provider failure");
});
it("uses only student eligibility projections for a student search", async () => {
  mocks.studentAcademy.mockResolvedValue({ academy: { id: academyId, name: "Academy" } });
  mocks.learning.mockResolvedValue({ page: { units: [{ id: "unit", title: "Lesson", access: { status: "locked" } }] } });
  mocks.studentAssignments.mockResolvedValue({ ok: true, data: { items: [] } });
  expect(await searchAcademy({ platform: "student", slug: "academy", query: "Lesson" })).toMatchObject({ ok: true });
  expect(mocks.students).not.toHaveBeenCalled(); expect(mocks.content).not.toHaveBeenCalled();
  expect(mocks.learning).toHaveBeenCalledWith({ academyId, search: "Lesson" });
});
