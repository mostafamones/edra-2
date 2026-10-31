import { describe, expect, it } from "vitest";
import { canEditUnit, documentSchema, arrangeUnits, isUnitInReview, matchesLabels, matchesStatuses, materialSummary, prerequisiteName, unattachedUploads, type ContentItem } from "./types";

describe("content trust boundaries", () => {
  it("matches any selected label, or only unlabeled units instead", () => {
    expect(matchesLabels([], { labels: [], unlabeled: false })).toBe(true);
    expect(matchesLabels(["a", "b"], { labels: ["b", "c"], unlabeled: false })).toBe(true);
    expect(matchesLabels(["a"], { labels: ["c"], unlabeled: false })).toBe(false);
    expect(matchesLabels(["a"], { labels: [], unlabeled: true })).toBe(false);
    expect(matchesLabels([], { labels: [], unlabeled: true })).toBe(true);
  });
  it("matches a published unit awaiting review under either status", () => {
    const pending = { state: "published" as const, review_requested_at: "2026-10-01" };
    expect(matchesStatuses(pending, ["review"])).toBe(true);
    expect(matchesStatuses(pending, ["published"])).toBe(true);
    expect(matchesStatuses(pending, ["draft"])).toBe(false);
    expect(matchesStatuses({ state: "draft", review_requested_at: null }, [])).toBe(false);
  });
  it("arranges units by group and order, keeping newest first by default", () => {
    const unit = (title: string, state: "draft" | "published", program: string) => ({ state, program, draft: { title, description: "", accessDays: 7, items: [] } });
    const units = [unit("Unit 10", "published", "Grade 10"), unit("Unit 2", "draft", "Grade 2"), unit("Unit 1", "published", "Grade 2")];
    const titles = (group: { units: typeof units }) => group.units.map(u => u.draft.title);
    const arrange = (view: Parameters<typeof arrangeUnits>[1]) => arrangeUnits(units, view, u => u.program);
    expect(arrange({ group: "none", sort: "updated" }).map(titles)).toEqual([["Unit 10", "Unit 2", "Unit 1"]]);
    expect(arrange({ group: "none", sort: "title" }).map(titles)).toEqual([["Unit 1", "Unit 2", "Unit 10"]]);
    expect(arrange({ group: "status", sort: "updated" }).map(g => g.label)).toEqual(["Draft", "Published"]);
    expect(arrange({ group: "program", sort: "title" }).map(g => [g.label, ...titles(g)])).toEqual([["Grade 2", "Unit 1", "Unit 2"], ["Grade 10", "Unit 10"]]);
  });
  it("marks an assessment answered once any answer sits under it, and counts attached documents as files", () => {
    const items = [
      { kind: "explanation", title: "Intro" }, { kind: "document", title: "Notes", attached: true },
      { kind: "assessment", title: "Quiz A", assessmentKind: "quiz", assessmentId: "a" }, { kind: "assessment", title: "Quiz B", assessmentKind: "quiz", assessmentId: "b" },
      { kind: "answer", title: "Answer", assessmentKind: "quiz", assessmentId: "a" },
    ] as ContentItem[];
    expect(materialSummary(items)).toEqual({ videos: [{ title: "Intro" }], assignments: [], quizzes: [{ title: "Quiz A", answered: true }, { title: "Quiz B", answered: false }], exams: [], files: [{ title: "Notes" }] });
  });
  it("names prerequisites from the source unit, surviving removed assessments and units", () => {
    const units = [{ id: "u", draft: { title: "Algebra", description: "", accessDays: 7, items: [{ id: "i", kind: "assessment", title: "Quiz A", assessmentKind: "quiz", assessmentId: "a" }] as ContentItem[] } }];
    expect(prerequisiteName({ unitId: "u", kind: "access" }, units)).toBe("Algebra");
    expect(prerequisiteName({ unitId: "u", kind: "quiz", assessmentId: "a" }, units)).toBe("Quiz A · Algebra");
    expect(prerequisiteName({ unitId: "u", kind: "assignment", assessmentId: "gone" }, units)).toBe("Assignment · Algebra");
    expect(prerequisiteName({ unitId: "gone", kind: "access" }, units)).toBe("Unavailable unit");
  });
  it("accepts unit-only requirements and requires assessment IDs only for submissions", () => {
    const base = { title: "Lesson", description: "", items: [] };
    const unitId = crypto.randomUUID();
    expect(documentSchema.safeParse({ ...base, prerequisites: [{ unitId, kind: "access" }] }).success).toBe(true);
    expect(documentSchema.safeParse({ ...base, prerequisites: [{ unitId, kind: "quiz" }] }).success).toBe(false);
    expect(documentSchema.safeParse({ ...base, prerequisites: [{ unitId, kind: "access", assessmentId: crypto.randomUUID() }] }).success).toBe(false);
  });
  it("recovers registered uploads after unsaved material is lost without importing another unit's files", () => {
    const uploaded = { id: crypto.randomUUID(), unit_id: "this-unit", status: "ready" };
    const other = { id: crypto.randomUUID(), unit_id: "another-unit", status: "ready" };
    const item: ContentItem = { id: crypto.randomUUID(), kind: "explanation", title: "Lesson", assetId: uploaded.id };
    expect(unattachedUploads([uploaded, other], "this-unit", [item])).toEqual([]);
    // Reloading the saved empty draft keeps the original provider-backed upload recoverable.
    expect(unattachedUploads([uploaded, other], "this-unit", [])).toEqual([uploaded]);
    expect(unattachedUploads([uploaded, other], "another-unit", [])).toEqual([other]);
  });
  it("accepts empty drafts and optional descriptions, but requires a title", () => {
    expect(documentSchema.safeParse({ title: "Lesson", description: "", items: [] }).success).toBe(true);
    expect(documentSchema.safeParse({ title: " ", description: "", items: [] }).success).toBe(false);
  });
  it("requires media references and assessment identity on answers", () => {
    expect(documentSchema.safeParse({ title: "Lesson", description: "", items: [{ id: crypto.randomUUID(), kind: "answer", title: "Solution", assetId: crypto.randomUUID() }] }).success).toBe(false);
  });
  it("rejects repeated material identities", () => {
    const item = { id: crypto.randomUUID(), kind: "document", title: "Notes", assetId: crypto.randomUUID() };
    expect(documentSchema.safeParse({ title: "Lesson", description: "", items: [item, item] }).success).toBe(false);
  });
  it("instructors edit their own drafts and published units, including in review", () => {
    const unit = { created_by: "owner", published_revision: 0, state: "review" as const };
    expect(canEditUnit(unit, "owner", false)).toBe(true);
    expect(canEditUnit(unit, "other", false)).toBe(false);
    expect(canEditUnit({ ...unit, state: "published", published_revision: 1 }, "owner", false)).toBe(true);
    expect(canEditUnit({ ...unit, published_revision: 1 }, "other", false)).toBe(false);
    expect(canEditUnit({ ...unit, state: "archived" }, "owner", false)).toBe(false);
    expect(canEditUnit({ ...unit, published_revision: 1 }, "manager", true)).toBe(true);
    expect(canEditUnit({ ...unit, state: "archived" }, "manager", true)).toBe(false);
  });
  it("reads legacy units with seven days and retains configured durations", () => {
    const legacy = { title: "Revision", description: "", items: [] };
    expect(documentSchema.parse(legacy).accessDays).toBe(7);
    expect(documentSchema.parse({ ...legacy, accessDays: 45 }).accessDays).toBe(45);
    for (const accessDays of [0, -1, 1.5, null, "30", 2147483648]) {
      expect(documentSchema.safeParse({ ...legacy, accessDays }).success).toBe(false);
    }
  });
  it("includes published changes in review without changing publication visibility", () => {
    expect(isUnitInReview({ state: "published", review_requested_at: "2026-10-21T00:00:00Z" })).toBe(true);
    expect(isUnitInReview({ state: "published", review_requested_at: null })).toBe(false);
    expect(isUnitInReview({ state: "review", review_requested_at: null })).toBe(true);
    expect(isUnitInReview({ state: "draft", review_requested_at: null })).toBe(false);
  });
});
