import { describe, expect, it } from "vitest";
import { canEditUnit, documentSchema, isUnitInReview, unattachedUploads, type ContentItem } from "./types";

describe("content trust boundaries", () => {
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
