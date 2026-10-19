import { describe, expect, it } from "vitest";
import { canEditUnit, documentSchema, unattachedUploads, type ContentItem } from "./types";

describe("content trust boundaries", () => {
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
  it("instructors edit only their own never-published drafts, including in review", () => {
    const unit = { created_by: "owner", published_revision: 0, state: "review" as const };
    expect(canEditUnit(unit, "owner", false)).toBe(true);
    expect(canEditUnit(unit, "other", false)).toBe(false);
    expect(canEditUnit({ ...unit, published_revision: 1 }, "owner", false)).toBe(false);
    expect(canEditUnit({ ...unit, state: "archived" }, "manager", true)).toBe(false);
  });
});
