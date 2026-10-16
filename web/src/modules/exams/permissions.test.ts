import { describe, expect, it } from "vitest";

import { announceable, examPermissions } from "./permissions";

const base = { yearOpen: true, archivedAt: null, phase: "open" as const, ready: true, workStartedAt: null, structureLockedAt: null };

describe("examPermissions", () => {
  it("lets every role prepare, enter work and mark, but only managers manage the window, archive and corrections", () => {
    const instructor = examPermissions("instructor", { ...base, structureLockedAt: "2026-10-13T00:00:00Z", workStartedAt: "2026-10-13T00:00:00Z" });
    expect(instructor).toMatchObject({ edit: true, enterWork: true, mark: true, availability: false, archive: false, correct: false });
    for (const role of ["owner", "head_admin", "admin"] as const) {
      expect(examPermissions(role, { ...base, structureLockedAt: "2026-10-13T00:00:00Z" })).toMatchObject({ availability: true, archive: true, correct: true });
    }
  });

  it("locks the target once work starts and the structure once answers or marks exist", () => {
    expect(examPermissions("admin", base)).toMatchObject({ editTarget: true, editStructure: true, correct: false });
    expect(examPermissions("admin", { ...base, workStartedAt: "x" })).toMatchObject({ editTarget: false, editStructure: true });
    expect(examPermissions("admin", { ...base, workStartedAt: "x", structureLockedAt: "x" })).toMatchObject({ editStructure: false, correct: true });
  });

  it("stops new physical work and window changes after closure but keeps marking", () => {
    expect(examPermissions("owner", { ...base, phase: "closed" })).toMatchObject({ enterWork: false, availability: false, mark: true });
    expect(examPermissions("owner", { ...base, ready: false, phase: "preparing" })).toMatchObject({ enterWork: false, availability: false });
  });

  it("makes closed years and archived exams read-only", () => {
    expect(Object.values(examPermissions("owner", { ...base, yearOpen: false })).some(Boolean)).toBe(false);
    expect(Object.values(examPermissions("owner", { ...base, archivedAt: "x", phase: "archived" })).some(Boolean)).toBe(false);
  });
});

describe("announceable", () => {
  const submission = { id: "s", source: "physical" as const, reason: "physical" as const, submittedAt: "", processedAt: "", originalDeadlineAt: null, scoringRevision: 1 };
  const result = { complete: true, total: "4.00", maxScore: "4.00", marked: 0, required: 0 };
  it("needs accepted work, a complete result and something not yet announced", () => {
    expect(announceable({ submission, result, publicationState: "unpublished" })).toBe(true);
    expect(announceable({ submission, result, publicationState: "pending_correction" })).toBe(true);
    expect(announceable({ submission, result, publicationState: "published" })).toBe(false);
    expect(announceable({ submission, result: { ...result, complete: false }, publicationState: "unpublished" })).toBe(false);
    expect(announceable({ submission: null, result: null, publicationState: "unpublished" })).toBe(false);
  });
});
