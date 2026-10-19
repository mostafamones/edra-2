import type { Assignment, StudentWork } from "./types";

/** One bar: the average score of a part or question as a share of its maximum, over `count` students. */
export type MarkBar = { id: string; label: string; title: string; percent: number; count: number };

const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

/**
 * Average marks per part and per question. Only marks entered question by question count: fast
 * (typed) part marks and excused adjustments carry no per-question detail, so they are left out.
 * Bars without any such mark are omitted.
 */
export function markBars(assignment: Assignment, students: StudentWork[]): { parts: MarkBar[]; questions: MarkBar[] } {
  const parts: MarkBar[] = [];
  const questions: MarkBar[] = [];
  for (const part of assignment.parts) {
    const max = Number(part.maxScore);
    const scores = students.flatMap((student) =>
      student.marks.filter((mark) => mark.partId === part.id && mark.fromAnswers).map((mark) => Number(mark.score)));
    if (scores.length > 0 && max > 0) {
      parts.push({ id: part.id, label: `P${part.position}`, title: part.title, percent: (average(scores) / max) * 100, count: scores.length });
    }
    for (const question of part.questions) {
      if (question.excluded) continue;
      const questionMax = Number(question.maxScore);
      const answers = students.flatMap((student) =>
        student.answers.filter((answer) => answer.questionId === question.id).map((answer) => Number(answer.score)));
      if (answers.length === 0 || questionMax <= 0) continue;
      questions.push({
        id: question.id, label: `${part.position}.${question.position}`, title: `${part.title} · Question ${question.position}`,
        percent: (average(answers) / questionMax) * 100, count: answers.length,
      });
    }
  }
  return { parts, questions };
}
