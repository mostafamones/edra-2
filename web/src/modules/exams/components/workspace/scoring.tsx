"use client";

import { ScoringPanel } from "@/components/shared/assessment/scoring";
import type { AcademyRole } from "@/modules/academies/roles";
import { examPermissions } from "../../permissions";
import type { Exam } from "../../types";
import { CorrectionDialog } from "./correction";

export function ExamScoring({ exam, role }: { exam: Exam; role: AcademyRole }) {
  const questions = exam.parts.flatMap((part) => part.questions.map((q) => ({ id: q.id, number: q.number, excluded: Boolean(q.excluded), choices: q.choices })));
  if (questions.length === 0) return null;
  return <ScoringPanel questions={questions} canCorrect={examPermissions(role, exam).correct}
    history={exam.corrections.map((c) => ({ revision: c.revision, label: c.kind === "key" ? "Key corrected" : "Question excluded" }))}
    dialog={(question, mode, close) => <CorrectionDialog key={`${question.id}:${mode}`} exam={exam} question={question} mode={mode} onClose={close} />} />;
}
