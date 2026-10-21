import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/query-client", () => ({ clearBrowserQueryCache: vi.fn() }));
vi.mock("@/modules/exams/browser", () => ({ setExamJournalAccount: vi.fn() }));

import { previewErrorMessage, viewAsStudentRequest } from "./client";
import type { PreviewStatus } from "./types";

const runId = "12345678-1234-4123-8123-123456789012";
const student = { logicalId: "account:student:ana", displayName: "Ana", recordId: "rec-1" };
const identity = { kind: "original" as const, logicalId: null, displayName: "Dev", role: "instructor" as const };
const active = (patch: Partial<Extract<PreviewStatus, { active: true }>> = {}): PreviewStatus => ({
  available: true, active: true, run: { id: runId, academySlug: "edra" }, revision: 4, expiresAt: "2026-10-21T10:00:00Z",
  current: identity, priorStaff: null, staffTargets: [], students: [student], ...patch,
});

describe("viewAsStudentRequest", () => {
  it("returns null when Developer mode is unavailable", () => {
    expect(viewAsStudentRequest({ available: false }, "rec-1", "/back")).toBeNull();
  });

  it("returns null when the record is not a generated student of this run", () => {
    const status: PreviewStatus = { available: true, active: false, run: { id: runId, academySlug: "edra" }, students: [student] };
    expect(viewAsStudentRequest(status, "other-academy-rec", "/back")).toBeNull();
  });

  it("enters the student directly while inactive", () => {
    const status: PreviewStatus = { available: true, active: false, run: { id: runId, academySlug: "edra" }, students: [student] };
    expect(viewAsStudentRequest(status, "rec-1", "/back")).toEqual({
      action: "enter", body: { runId, studentLogicalId: "account:student:ana", returnTo: "/back" },
    });
  });

  it("resolves an active staff switch without generating a command during rendering", () => {
    const uuid = vi.spyOn(crypto, "randomUUID");
    const request = viewAsStudentRequest(active(), "rec-1", "/back");
    expect(request).toEqual({
      action: "switch",
      body: { runId, logicalId: "account:student:ana", expectedRevision: 4, returnTo: "/back" },
    });
    expect(uuid).not.toHaveBeenCalled();
    uuid.mockRestore();
  });

  it("returns null while a student is already current", () => {
    const current = { kind: "student" as const, logicalId: "account:student:ana", displayName: "Ana", role: "student" as const };
    expect(viewAsStudentRequest(active({ current }), "rec-1", "/back")).toBeNull();
  });
});

describe("previewErrorMessage", () => {
  it("maps stale and inactive codes and falls back for others", () => {
    expect(previewErrorMessage("stale")).toBe("Preview changed in another tab. Try again.");
    expect(previewErrorMessage("inactive")).toBe("Preview ended. Sign in again.");
    expect(previewErrorMessage("unavailable")).toBe("Couldn't switch identity.");
  });
});
