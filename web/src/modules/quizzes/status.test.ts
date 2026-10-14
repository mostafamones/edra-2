import { describe, expect, it } from "vitest";

import { matchesSearch, studentStatus } from "./status";
import type { QuizStudent } from "./types";

const student = (change: Partial<QuizStudent>): QuizStudent => ({
  recordId: "r", fullName: "Amal Hassan", archived: false, groupName: null, studentCode: "0042", eligible: true, version: 1,
  attempt: null, physicalDraft: null, submission: null, result: null, feedback: "", publication: null, publicationState: "unpublished",
  solutionsQualified: false, updatedAt: null, ...change,
});
const attempt = { startedAt: "", deadlineAt: null, departureCount: 0, answersVersion: 0, lastSavedAt: null, finalizedAt: null, finalizationReason: null, superseded: false };
const submission = { id: "s", source: "online" as const, reason: "window_closed" as const, submittedAt: "", processedAt: "", originalDeadlineAt: null, scoringRevision: 1 };

describe("studentStatus", () => {
  it("separates not started, answering and physical drafts", () => {
    expect(studentStatus(student({}))).toBe("not_started");
    expect(studentStatus(student({ attempt }))).toBe("answering");
    expect(studentStatus(student({ attempt: { ...attempt, superseded: true }, physicalDraft: { version: 1, updatedAt: "", answered: 1 } }))).toBe("physical_draft");
  });

  it("treats window_closed work as ordinary accepted work, not a zero", () => {
    expect(studentStatus(student({ submission, result: { complete: false, total: "0", maxScore: "6", marked: 0, required: 1 } }))).toBe("needs_marking");
    expect(studentStatus(student({ submission, result: { complete: true, total: "6", maxScore: "6", marked: 1, required: 1 } }))).toBe("ready_to_announce");
  });

  it("shows announced results and pending corrections", () => {
    const result = { complete: true, total: "4", maxScore: "6", marked: 1, required: 1 };
    expect(studentStatus(student({ submission, result, publicationState: "published" }))).toBe("announced");
    expect(studentStatus(student({ submission, result, publicationState: "pending_correction" }))).toBe("pending_correction");
  });
});

describe("matchesSearch", () => {
  it("matches names anywhere and codes by prefix", () => {
    expect(matchesSearch(student({}), "hass")).toBe(true);
    expect(matchesSearch(student({}), "004")).toBe(true);
    expect(matchesSearch(student({}), "42")).toBe(false);
    expect(matchesSearch(student({}), "  ")).toBe(true);
  });
});
