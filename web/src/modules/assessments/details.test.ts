import { beforeEach, describe, expect, it, vi } from "vitest";

const save = vi.hoisted(() => ({ assignment: vi.fn(), quiz: vi.fn(), exam: vi.fn() }));
vi.mock("@/modules/assignments", async () => ({ ...await import("../assignments/permissions"), saveAssignment: save.assignment }));
vi.mock("@/modules/quizzes", async () => ({ ...await import("../quizzes/permissions"), saveQuiz: save.quiz }));
vi.mock("@/modules/exams", async () => ({ ...await import("../exams/permissions"), saveExam: save.exam }));

import { assignmentDetailsDraft, detailsPermissions, localDate, quickErrors, quickValues, savedInstant, saveDetails, timedDetailsDraft, type AssessmentDetails } from "./details";
import { assignmentFixture, examFixture, quizFixture } from "./details.fixture";

beforeEach(() => { vi.clearAllMocks(); });

describe("assessment quick edit", () => {
  it("preserves assignment questions, keys, instructions, authored legacy maxima and untouched due instants", () => {
    const value = assignmentFixture();
    const record = { type: "assignment", value } as const;
    const values = quickValues(record);
    values.title = "New name";
    values.parts[0].title = "New part";
    const draft = assignmentDetailsDraft(value, values);
    expect(draft).toMatchObject({ title: "New name", instructions: value.instructions, dueAt: value.dueAt });
    expect(draft.parts[0]).toMatchObject({ id: "part-1", title: "New part", instructions: value.parts[0].instructions });
    expect(draft.parts[0].questions).toEqual([{ id: "question-1", prompt: "Keep the question.", maxScore: "2.50", choices: [{ id: "choice-1", label: "Answer", isCorrect: true }] }]);
    const legacy = assignmentFixture({ parts: [{ ...value.parts[0], kind: null, questions: [], authoredMaxScore: "10.00", maxScore: "8.00" }] });
    expect(assignmentDetailsDraft(legacy, quickValues({ type: "assignment", value: legacy })).parts[0].maxScore).toBe("10.00");
  });

  it.each(["quiz", "exam"] as const)("changes %s details without rewriting question content or removing excluded questions", (type) => {
    const value = type === "quiz" ? quizFixture() : examFixture();
    const values = quickValues({ type, value } as AssessmentDetails);
    values.timeLimit = "45";
    values.audience = "groups";
    values.groupIds = ["group-1"];
    const draft = timedDetailsDraft(value, values);
    expect(draft).toMatchObject({ timeLimitMinutes: 45, audience: "groups", levelId: null, trackId: null, groupIds: ["group-1"], instructions: value.instructions, solutionNotes: value.solutionNotes });
    expect(draft.parts[0].questions).toEqual([{ id: "question-1", prompt: "Keep the question.", modelAnswer: "Keep model answer.", maxScore: "2.50", choices: [{ id: "choice-1", label: "Answer", isCorrect: true }] }]);
  });

  it("uses academy time, rejects a skipped hour, and preserves a repeated-hour instant and seconds", () => {
    expect(savedInstant("2026-04-24T00:30", null)).toBeNull();
    const repeated = "2026-10-29T21:30:35Z";
    expect(savedInstant(localDate(repeated), repeated)).toBe(repeated);
    expect(savedInstant("2026-11-01T12:00", null)).toBe("2026-11-01T10:00:00.000Z");
    expect(savedInstant("", repeated)).toBeNull();
  });

  it("validates only the exposed fields, accepting incomplete preparation and rejecting invalid names, audience, timer and dates", () => {
    const record = { type: "quiz", value: quizFixture({ audience: null, ready: false, parts: [] }) } as const;
    expect(quickErrors(record, quickValues(record))).toEqual({});
    const values = { ...quickValues(record), title: " ", audience: "groups" as const, timeLimit: "2.5" };
    expect(quickErrors(record, values)).toMatchObject({ title: expect.any(String), groupIds: expect.any(String), timeLimit: expect.any(String) });
    const assignment = { type: "assignment", value: assignmentFixture() } as const;
    expect(quickErrors(assignment, { ...quickValues(assignment), dueAt: "2026-04-24T00:30" })).toHaveProperty("dueAt");
  });

  it("keeps the owning type's role, year, audience, timer and part locks", () => {
    const assignment = { type: "assignment", value: assignmentFixture({ hasActivity: true }) } as const;
    expect(detailsPermissions("instructor", assignment).edit).toBe(false);
    expect(detailsPermissions("head_admin", assignment)).toMatchObject({ edit: true, audience: false, parts: true });
    const quiz = { type: "quiz", value: quizFixture({ workStartedAt: "now", structureLockedAt: "now" }) } as const;
    expect(detailsPermissions("instructor", quiz)).toMatchObject({ edit: true, audience: false, timer: false, parts: false, availability: false });
    expect(detailsPermissions("owner", quiz).availability).toBe(true);
    expect(detailsPermissions("owner", { type: "exam", value: examFixture({ yearOpen: false }) }).edit).toBe(false);
    expect(detailsPermissions("owner", { type: "quiz", value: quizFixture({ archivedAt: "now" }) }).edit).toBe(false);
  });

  it.each(["assignment", "quiz", "exam"] as const)("saves %s through its existing versioned server action", async (type) => {
    const value = type === "assignment" ? assignmentFixture() : type === "quiz" ? quizFixture() : examFixture();
    const record = { type, value } as AssessmentDetails;
    save[type].mockResolvedValue({ ok: false, code: `${type}_conflict`, message: "Review latest." });
    await expect(saveDetails(record, quickValues(record))).resolves.toMatchObject({ ok: false, code: `${type}_conflict` });
    expect(save[type]).toHaveBeenCalledWith(expect.objectContaining({ academyId: "academy-id", [`${type}Id`]: value.id, expectedVersion: 7 }));
  });

  it.each(["quiz", "exam"] as const)("sends %s dates and details together with the reviewed version", async (type) => {
    const value = type === "quiz" ? quizFixture() : examFixture();
    save[type].mockResolvedValue({ ok: true, [type]: { ...value, version: 9 } });
    const record = type === "quiz" ? { type, value: quizFixture() } as const : { type, value: examFixture() } as const;
    expect(await saveDetails(record, quickValues(record), { opensAt: null, closesAt: null })).toMatchObject({ ok: true, record: { type, value: { version: 9 } } });
    expect(save[type]).toHaveBeenCalledWith(expect.objectContaining({ academyId: "academy-id", [`${type}Id`]: value.id, expectedVersion: 7, availability: { opensAt: null, closesAt: null } }));
  });
});
