"use client";

import { ScoringPanel } from "@/components/shared/assessment/scoring";
import type { AcademyRole } from "@/modules/academies/roles";
import { assignmentPermissions } from "../../permissions";
import type { Assignment } from "../../types";
import { CorrectionDialog } from "./correction";

export function AssignmentScoring({ assignment, role }: { assignment: Assignment; role: AcademyRole }) {
  const questions = assignment.parts.flatMap((part) => part.questions.map((q) => ({ id: q.id, number: `${part.position}.${q.position}`, excluded: Boolean(q.excluded), choices: q.choices })));
  if (questions.length === 0) return null;
  return <ScoringPanel questions={questions} canCorrect={assignmentPermissions(role, assignment).correct}
    history={(assignment.corrections ?? []).map((c) => ({ revision: c.revision, label: c.operation === "key" ? "Key corrected" : "Question excluded" }))}
    dialog={(question, mode, close) => <CorrectionDialog key={`${question.id}:${mode}`} assignment={assignment} question={question} mode={mode} onClose={close} />} />;
}
