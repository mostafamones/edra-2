"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ScoringCorrection, type CorrectionQuestion } from "@/components/shared/assessment/correction";
import { useAcademyScope } from "@/modules/auth";
import { correctExamKey, excludeExamQuestion } from "../../actions";
import { examsRootKey } from "../../queries";
import type { Exam } from "../../types";

type Props = { exam: Exam; question: CorrectionQuestion; mode: "key" | "exclude"; onClose: () => void };

export function CorrectionDialog({ exam, question, mode, onClose }: Props) {
  const queryClient = useQueryClient();
  const isCurrent = useAcademyScope();
  return <ScoringCorrection question={question} mode={mode} revision={exam.scoringRevision ?? 1}
    current={() => isCurrent(exam.academyId)} onClose={onClose}
    exclusionBlocked={exam.parts.flatMap((p) => p.questions).filter((q) => !q.excluded).length <= 1}
    refresh={() => queryClient.invalidateQueries({ queryKey: examsRootKey(exam.academyId) })}
    run={async (request) => {
      const base = { academyId: exam.academyId, examId: exam.id, questionId: request.questionId, expectedScoringRevision: request.expectedScoringRevision, key: request.key };
      return request.mode === "key" ? correctExamKey({ ...base, choiceId: request.choiceId }) : excludeExamQuestion(base);
    }} />;
}
