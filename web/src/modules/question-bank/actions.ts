import { useQueryClient } from "@tanstack/react-query";
import { useAcademyScope } from "@/modules/auth";
import { archiveQuestionBankQuestions, deleteQuestionBankQuestions, updateQuestionBankQuestion } from "./bank";
import type { BankResult, QuestionEdit } from "./bank-contract";
import { invalidateQuestions, type BankScope } from "./queries";

/**
 * Edit, archive/restore and delete commands. Each resolves to undefined on success, a message on failure,
 * or null when the academy changed meanwhile (the result no longer belongs on screen).
 */
export function useQuestionActions(scope: BankScope) {
  const client = useQueryClient();
  const isCurrent = useAcademyScope();
  const run = async (ids: string[], command: () => Promise<BankResult<unknown>>, failure: string) => {
    const academyId = scope.academyId;
    try {
      const result = await command();
      invalidateQuestions(client, scope, ids);
      if (!isCurrent(academyId)) return null;
      return result.ok ? undefined : result.message;
    } catch {
      invalidateQuestions(client, scope, ids);
      return isCurrent(academyId) ? failure : null;
    }
  };
  const academyId = scope.academyId;
  return {
    update: (id: string, changes: QuestionEdit) =>
      run([id], () => updateQuestionBankQuestion({ data: { academyId, id, changes } }), "Couldn’t save the question. Try again."),
    archive: (questionIds: string[], archived: boolean) =>
      run(questionIds, () => archiveQuestionBankQuestions({ data: { academyId, questionIds, archived } }), "Couldn’t update the question. Try again."),
    remove: (questionIds: string[]) =>
      run(questionIds, () => deleteQuestionBankQuestions({ data: { academyId, questionIds } }), "Couldn’t delete. Try again."),
  };
}
