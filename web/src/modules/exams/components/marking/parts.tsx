import type { ReactNode } from "react";

import { BLANK } from "@/components/shared/assessment/marking/draft";
import type { MarkPart } from "@/components/shared/assessment/marking/types";
import { plainText } from "@/components/shared/assessment/images/tokens";
import { formatScore, sumScores } from "@/lib/score";
import type { Exam, ExamStudent, StudentDetail } from "../../types";

/** What the viewer may change on this student's sheet. */
export type Editable = {
  /** Choice answers: only before work is accepted, and only while physical entry is open. */
  choices: boolean;
  /** Written Work marks: once work is accepted, or together with confirming physical work. */
  marks: boolean;
};

function Note({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-1 pl-12 text-xs text-muted-foreground">{children}</div>;
}

/** The exam's parts as the marking sheet shows them, for one student. */
export function markParts(exam: Exam, student: ExamStudent, detail: StudentDetail, editable: Editable): MarkPart[] {
  const details = new Map(detail.questions.map((entry) => [entry.questionId, entry]));
  return exam.parts.map((part) => {
    const choice = part.kind === "question_sheet";
    const scored = part.questions.filter((question) => !question.excluded);
    return {
      id: part.id, position: part.position, title: part.title, entry: choice ? "choice" : "manual",
      maxScore: sumScores(scored.map((question) => question.maxScore)) ?? "0",
      questions: part.questions.map((question) => {
        const entry = details.get(question.id);
        const text = entry?.submittedAnswer?.textAnswer;
        return {
          id: question.id, position: question.number, prompt: plainText(question.prompt), maxScore: question.maxScore,
          choices: question.choices.map((option) => ({ id: option.id, position: option.position, isCorrect: option.isCorrect })),
          excluded: question.excluded,
          locked: question.excluded || !(choice ? editable.choices : editable.marks),
          note: choice || !text ? undefined : <Note><p className="rounded-md bg-muted/50 p-2 text-sm whitespace-pre-wrap text-foreground">{text}</p></Note>,
        };
      }),
    };
  });
}

/**
 * The saved value of each question: before work is accepted the physical draft's choices; afterwards
 * the accepted answers (unanswered counts as blank) and the Written Work marks.
 */
export function savedValues(exam: Exam, student: ExamStudent, detail: StudentDetail): Record<string, string> {
  const kinds = new Map(exam.parts.flatMap((part) => part.questions.map((question) => [question.id, part.kind] as const)));
  const values: Record<string, string> = {};
  for (const entry of detail.questions) {
    if (kinds.get(entry.questionId) === "written_work") {
      if (entry.mark !== null) values[entry.questionId] = formatScore(entry.mark);
    } else if (student.submission) {
      values[entry.questionId] = entry.submittedAnswer?.choiceId ?? BLANK;
    } else if (entry.physicalAnswer) {
      values[entry.questionId] = entry.physicalAnswer.choiceId ?? BLANK;
    }
  }
  return values;
}
