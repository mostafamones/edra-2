"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ScoringCorrection, type CorrectionQuestion } from "@/components/shared/assessment/correction";
import { useAcademyScope } from "@/modules/auth";
import { correctAssignmentKey, excludeAssignmentQuestion } from "../../actions";
import { assignmentsRootKey } from "../../queries";
import type { Assignment } from "../../types";

type Props = { assignment: Assignment; question: CorrectionQuestion; mode: "key" | "exclude"; onClose: () => void };

export function CorrectionDialog({ assignment, question, mode, onClose }: Props) {
  const queryClient = useQueryClient();
  const isCurrent = useAcademyScope();
  return <ScoringCorrection question={question} mode={mode} revision={assignment.scoringRevision ?? 1}
    current={() => isCurrent(assignment.academyId)} onClose={onClose}
    
    refresh={() => queryClient.invalidateQueries({ queryKey: assignmentsRootKey(assignment.academyId) })}
    run={async (request) => {
      const base = { academyId: assignment.academyId, assignmentId: assignment.id, questionId: request.questionId, expectedScoringRevision: request.expectedScoringRevision, key: request.key };
      return request.mode === "key" ? correctAssignmentKey({ ...base, choiceId: request.choiceId }) : excludeAssignmentQuestion(base);
    }} />;
}
