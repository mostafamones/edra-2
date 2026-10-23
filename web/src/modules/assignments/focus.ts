import type { Assignment, StudentWork } from "./types";

/**
 * A narrowing of the student list to one part or question: the students who lost marks on it, or
 * those who got full marks, or those with no question-level mark. Like the marks chart,
 * lost/full outcomes only count marks entered question by question.
 */
export type MarkFocus = { kind: "part" | "question"; id: string; outcome: "lost" | "unmarked" | "full" };

export type FocusTarget = { label: string; title: string; max: number };

/** The focused part or question: its short label ("1.3", "P2"), full title, and maximum. */
export function focusTarget(assignment: Assignment, focus: Pick<MarkFocus, "kind" | "id">): FocusTarget | null {
  for (const part of assignment.parts) {
    if (focus.kind === "part" && part.id === focus.id) {
      return { label: `P${part.position}`, title: `Part ${part.position} · ${part.title}`, max: Number(part.maxScore) };
    }
    const question = focus.kind === "question" ? part.questions.find((entry) => entry.id === focus.id) : undefined;
    if (question && !question.excluded) {
      return { label: `${part.position}.${question.position}`, title: `Question ${part.position}.${question.position} · ${part.title}`, max: Number(question.maxScore) };
    }
  }
  return null;
}

/** The student's score on the focused part (fast marks included) or question, or null while it has none. */
export function focusScore(student: StudentWork, focus: Pick<MarkFocus, "kind" | "id">): number | null {
  if (focus.kind === "question") {
    const answer = student.answers.find((entry) => entry.questionId === focus.id);
    return answer ? Number(answer.score) : null;
  }
  const mark = student.marks.find((entry) => entry.partId === focus.id && entry.kind === "mark");
  return mark ? Number(mark.score) : null;
}

/** Unmarked means no question-level score; scored outcomes compare that score with the maximum. */
export function matchesFocus(student: StudentWork, focus: MarkFocus, max: number): boolean {
  const score = focusScore(student, focus);
  if (focus.outcome === "unmarked") return score === null;
  if (score === null) return false;
  return focus.outcome === "lost" ? score < max : score >= max;
}
