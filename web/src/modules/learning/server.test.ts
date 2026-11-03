import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start/server-only", () => ({}));
const mocks = vi.hoisted(() => ({ academies: vi.fn(), assignments: vi.fn(), exams: vi.fn(), units: vi.fn(), now: vi.fn() }));
vi.mock("@/modules/students/server", () => ({ listMyStudentAcademies: mocks.academies }));
vi.mock("./data", () => ({ readMyAssignments: mocks.assignments, readMyExams: mocks.exams, readMyUnits: mocks.units, readNow: mocks.now }));
import { loadLearningAssignments, loadLearningExams, loadLearningHome, loadLearningUnits } from "./server";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.academies.mockResolvedValue([{ id: "a", slug: "academy", name: "Academy" }]);
  mocks.units.mockResolvedValue([]); mocks.assignments.mockResolvedValue([]); mocks.exams.mockResolvedValue([]); mocks.now.mockResolvedValue(42);
});
it("keeps failed and empty academy branches in the list DTO", async () => {
  const groups = [{ academy: { id: "a", slug: "academy", name: "Academy" }, items: null, hasMore: false }, { academy: { id: "b", slug: "other", name: "Other" }, items: [], hasMore: false }];
  mocks.assignments.mockResolvedValue(groups);
  const scope = { slug: "academy", page: 2 };
  expect(await loadLearningAssignments({ scope, unit: "unit" })).toMatchObject({ groups, scope, unit: "unit" });
  expect(mocks.assignments).toHaveBeenCalledWith(scope, "unit");
  await loadLearningAssignments({ unit: "unit" });
  expect(mocks.assignments).toHaveBeenLastCalledWith(undefined, undefined);
});
it("loads home, courses and exam data with their academy options", async () => {
  expect(await loadLearningHome()).toEqual({ resume: [], due: [], upcoming: [] });
  expect(await loadLearningUnits({ started: true, search: "" })).toMatchObject({ groups: [], now: 42, academies: [{ id: "a" }] });
  expect(await loadLearningExams({})).toMatchObject({ groups: [], academies: [{ id: "a" }] });
});

const academy = { id: "a", slug: "academy", name: "Academy" };
const unit = (id: string, completed: number) => ({ id, title: `Unit ${id}`, access: { grantId: "grant", status: "active" }, progress: { completed, total: 3, items: [{ completed: completed > 0 }] } });
const assignment = (id: string, over = {}) => ({ id, title: `Work ${id}`, dueAt: null, unit: { id: "u", title: "Course" }, blockedReason: null, canEdit: true, required: true, started: false, receipt: null, result: null, ...over });
const exam = (examId: string, action: string) => ({ examId, title: `Exam ${examId}`, timeLimitMinutes: 30, opensAt: "2030-01-01T00:00:00Z", closesAt: "2030-02-01T00:00:00Z", actualClosesAt: "2030-02-02T00:00:00Z", phase: "open", action });

it("filters, cuts and projects the home lists to the rendered fields", async () => {
  mocks.units.mockResolvedValue([{ academy, hasMore: false, items: [...Array.from({ length: 6 }, (_, index) => unit(`s${index}`, 1)), unit("done", 3), unit("fresh", 0)] }]);
  mocks.assignments.mockResolvedValue([{ academy, hasMore: false, items: [
    assignment("late", { dueAt: "2030-03-01T00:00:00Z" }), assignment("soon", { dueAt: "2030-01-01T00:00:00Z" }), assignment("undated"),
    assignment("sent", { receipt: { submittedAt: "x", late: false } }), assignment("graded", { result: { total: "1", maxScore: "2", feedback: "f", publishedAt: "x" } }), assignment("blocked", { blockedReason: "assignment_closed" }),
  ] }]);
  mocks.exams.mockResolvedValue([{ academy, hasMore: false, items: [exam("open", "start"), exam("soon", "not_yet_open"), exam("done", "submitted")] }]);
  const home = await loadLearningHome();
  expect(home.resume.map((row) => row.id)).toEqual(["s0", "s1", "s2", "s3", "s4"]);
  expect(home.resume[0]).toEqual({ id: "s0", title: "Unit s0", academy: { name: "Academy", slug: "academy" }, completed: 1, total: 3 });
  const order = home.due.map((row) => row.id);
  expect([...order].sort()).toEqual(["late", "soon", "undated"]);
  expect(order.indexOf("soon")).toBeLessThan(order.indexOf("late"));
  expect(home.due.find((row) => row.id === "soon")).toEqual({ id: "soon", title: "Work soon", academy: { name: "Academy", slug: "academy" }, dueAt: "2030-01-01T00:00:00Z", status: { label: "Not started", tone: "outline" } });
  expect(home.upcoming).toEqual([
    { examId: "open", title: "Exam open", academy: { name: "Academy", slug: "academy" }, action: "start", opensAt: null },
    { examId: "soon", title: "Exam soon", academy: { name: "Academy", slug: "academy" }, action: "not_yet_open", opensAt: "2030-01-01T00:00:00Z" },
  ]);
  const wire = JSON.stringify(home);
  for (const dropped of ["grant", "actualClosesAt", "phase", "publishedAt", "feedback", "canEdit", "receipt", "\"a\""]) expect(wire).not.toContain(dropped);
});
it("projects assignment and exam lists, keeping the course title for a filtered page", async () => {
  mocks.assignments.mockResolvedValue([{ academy, hasMore: false, items: [assignment("w", { result: { total: "1", maxScore: "2", feedback: "f", publishedAt: "x" }, dueAt: "2030-01-01T00:00:00Z" })] }]);
  mocks.exams.mockResolvedValue([{ academy, hasMore: false, items: [exam("e", "no_new_starts"), exam("r", "resume")] }]);
  const scoped = await loadLearningAssignments({ scope: { slug: "academy", page: 1 }, unit: "u" });
  expect(scoped.course).toBe("Course");
  expect(scoped.groups[0].items).toEqual([{ id: "w", title: "Work w", dueAt: "2030-01-01T00:00:00Z", required: true, unitTitle: null, status: { label: "Result announced", tone: "default" } }]);
  expect((await loadLearningAssignments({})).groups[0].items![0]).toMatchObject({ unitTitle: "Course" });
  const exams = (await loadLearningExams({})).groups[0].items!;
  expect(exams).toEqual([
    { examId: "e", title: "Exam e", action: "no_new_starts", timeLimitMinutes: 30, opensAt: null, closesAt: null },
    { examId: "r", title: "Exam r", action: "resume", timeLimitMinutes: 30, opensAt: null, closesAt: "2030-02-01T00:00:00Z" },
  ]);
  expect(JSON.stringify([scoped, exams])).not.toMatch(/publishedAt|feedback|canEdit|actualClosesAt|phase/);
});
