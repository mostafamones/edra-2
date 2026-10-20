"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ScoringCorrection, type CorrectionQuestion } from "@/components/shared/assessment/correction";
import { useAcademyScope } from "@/modules/auth";
import { correctQuizKey, excludeQuizQuestion } from "../../actions";
import { quizzesRootKey } from "../../queries";
import type { Quiz } from "../../types";

type Props = { quiz: Quiz; question: CorrectionQuestion; mode: "key" | "exclude"; onClose: () => void };

export function CorrectionDialog({ quiz, question, mode, onClose }: Props) {
  const queryClient = useQueryClient();
  const isCurrent = useAcademyScope();
  return <ScoringCorrection question={question} mode={mode} revision={quiz.scoringRevision ?? 1}
    current={() => isCurrent(quiz.academyId)} onClose={onClose}
    exclusionBlocked={quiz.parts.flatMap((p) => p.questions).filter((q) => !q.excluded).length <= 1}
    refresh={() => queryClient.invalidateQueries({ queryKey: quizzesRootKey(quiz.academyId) })}
    run={async (request) => {
      const base = { academyId: quiz.academyId, quizId: quiz.id, questionId: request.questionId, expectedScoringRevision: request.expectedScoringRevision, key: request.key };
      return request.mode === "key" ? correctQuizKey({ ...base, choiceId: request.choiceId }) : excludeQuizQuestion(base);
    }} />;
}
