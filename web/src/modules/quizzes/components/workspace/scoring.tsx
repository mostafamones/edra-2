"use client";

import { ScoringPanel } from "@/components/shared/assessment/scoring";
import type { AcademyRole } from "@/modules/academies/roles";
import { quizPermissions } from "../../permissions";
import type { Quiz } from "../../types";
import { CorrectionDialog } from "./correction";

export function QuizScoring({ quiz, role }: { quiz: Quiz; role: AcademyRole }) {
  const questions = quiz.parts.flatMap((part) => part.questions.map((q) => ({ id: q.id, number: q.number, excluded: Boolean(q.excluded), choices: q.choices })));
  if (questions.length === 0) return null;
  return <ScoringPanel questions={questions} canCorrect={quizPermissions(role, quiz).correct}
    history={quiz.corrections.map((c) => ({ revision: c.revision, label: c.kind === "key" ? "Key corrected" : "Question excluded" }))}
    dialog={(question, mode, close) => <CorrectionDialog key={`${question.id}:${mode}`} quiz={quiz} question={question} mode={mode} onClose={close} />} />;
}
