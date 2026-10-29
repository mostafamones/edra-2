import type { Assignment } from "@/modules/assignments";
import type { Exam } from "@/modules/exams";
import type { Quiz } from "@/modules/quizzes";

const common = {
  academyId: "academy-id", academicYearId: "year", title: "Assessment", instructions: "Keep instructions exactly.",
  audience: "level" as const, levelId: "preparatory-3", trackId: null, groupIds: [],
  maxScore: "2.50", version: 7, createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-01T10:00:00Z",
  archivedAt: null, yearOpen: true, ready: true,
};
const choices = [{ id: "choice-1", position: 1, label: "Answer", isCorrect: true }];

export const assignmentFixture = (overrides: Partial<Assignment> = {}): Assignment => ({
  ...common, id: "a1", title: "Unit homework", dueAt: "2026-10-30T10:30:27Z", state: "active", partCount: 1, recipientCount: 5,
  createdBy: "staff", updatedBy: "staff", publishedAt: null, closedAt: null, hasActivity: false,
  parts: [{
    id: "part-1", position: 1, title: "Homework", instructions: "Keep part instructions.", kind: "online_questions", maxScore: "2.50", issues: [],
    questions: [{ id: "question-1", position: 1, prompt: "Keep the question.", maxScore: "2.50", choices }],
  }], ...overrides,
});

export const quizFixture = (overrides: Partial<Quiz> = {}): Quiz => ({
  ...common, id: "q1", title: "Weekly quiz", solutionNotes: "Keep solutions.", timeLimitMinutes: 20,
  opensAt: null, closesAt: null, actualClosesAt: null, effectiveMaxScore: "2.50", questionCount: 1, scoringRevision: 3,
  workStartedAt: null, structureLockedAt: null, closureSettledAt: null, processingPending: false, issues: [], phase: "ready",
  serverNow: "2026-10-29T10:00:00Z", fullyAutomatic: true,
  counts: { eligible: 5, started: 0, inProgress: 0, submitted: 0, announced: 0 }, corrections: [],
  parts: [{
    id: "part-1", position: 1, title: "Choices", instructions: "Keep part instructions.", kind: "question_sheet",
    questions: [{ id: "question-1", position: 1, number: 1, prompt: "Keep the question.", modelAnswer: "Keep model answer.", maxScore: "2.50", excluded: true, excludedAt: "2026-10-02T10:00:00Z", choices }],
  }], ...overrides,
});

export const examFixture = (overrides: Partial<Exam> = {}): Exam => ({ ...quizFixture(), id: "e1", title: "Term exam", timeLimitMinutes: 60, issues: [], ...overrides });
