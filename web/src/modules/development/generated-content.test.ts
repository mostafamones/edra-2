import { describe, expect, it } from "vitest";

import { assignmentDraftSchema } from "@/modules/assignments/validation";
import { draftIssues, examDraftSchema } from "@/modules/exams/validation";
import { splitImages } from "@/components/shared/assessment/images/tokens";

import { buildScenario } from "../../../scripts/dev-academy/scenario.mjs";

// The edra-dev-v3 authored content, written the way the authoring editors would submit it.
const scenario = buildScenario({ recipeVersion: "edra-dev-v3" });
const GROUP = "00000000-0000-4000-8000-000000000001";
const score = (value: number) => String(value);

type Question = { partId?: string; prompt: string; modelAnswer?: string; maxScore: number; choices?: string[]; correctChoice?: string };
type Part = { id: string; title: string; instructions: string; kind: string; maxScore: number; questions?: Question[] };

const examDraft = (exam: { title: string; instructions: string; solutionNotes: string; parts: Part[]; questions: Question[] }) => ({
  title: exam.title, instructions: exam.instructions, solutionNotes: exam.solutionNotes, audience: "groups", levelId: null, trackId: null,
  groupIds: [GROUP], timeLimitMinutes: 60,
  parts: exam.parts.map((part) => ({
    title: part.title, instructions: part.instructions, kind: part.kind,
    questions: exam.questions.filter((q) => q.partId === part.id).map((q) => ({
      prompt: q.prompt, modelAnswer: q.modelAnswer ?? "", maxScore: score(q.maxScore),
      choices: (q.choices ?? []).map((label, i) => ({ label, isCorrect: "ABCDEFGHIJ"[i] === q.correctChoice })),
    })),
  })),
});

const assignmentDraft = (assignment: { title: string; instructions: string; parts: Part[] }) => ({
  title: assignment.title, instructions: assignment.instructions, audience: "groups", levelId: null, trackId: null, groupIds: [GROUP],
  dueAt: null,
  parts: assignment.parts.map((part) => ({
    title: part.title, instructions: part.instructions, kind: part.kind, maxScore: "",
    questions: (part.questions ?? []).map((q) => ({ prompt: q.prompt, maxScore: score(q.maxScore), choices: [] })),
  })),
});

describe("edra-dev-v3 generated content", () => {
  it("passes the assignment authoring schema", () => {
    for (const assignment of scenario.assignments) {
      expect(assignmentDraftSchema.safeParse(assignmentDraft(assignment)).error?.issues ?? []).toEqual([]);
    }
  });

  it("passes the exam authoring schema, and current exams are ready to start", () => {
    for (const exam of scenario.exams) {
      const parsed = examDraftSchema.safeParse(examDraft(exam));
      expect(parsed.error?.issues ?? []).toEqual([]);
      if (exam.kind !== "historical") expect(draftIssues(parsed.data!)).toEqual([]);
    }
  });

  it("renders as plain text: no image tokens and preserved code indentation", () => {
    const texts = [
      ...scenario.assignments.flatMap((a: { parts: Part[] }) => a.parts.flatMap((p) => (p.questions ?? []).map((q) => q.prompt))),
      ...scenario.exams.flatMap((e: { questions: Question[] }) => e.questions.flatMap((q) => [q.prompt, ...(q.choices ?? [])])),
    ];
    for (const text of texts) expect(splitImages(text).every((segment) => segment.type === "text")).toBe(true);
    expect(texts.some((text) => /\n {2,}\S/.test(text))).toBe(true);
  });
});
