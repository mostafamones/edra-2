"use client";

import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { MarksForm } from "@/components/shared/assessment/marking/form";
import type { SaveOutcome, SavePayload } from "@/components/shared/assessment/marking/types";
import { useAttemptKey } from "@/lib/attempt-key";
import { useAcademyScope } from "@/modules/auth";
import { saveStudentMarks } from "../../actions";
import { markParts, savedAnswers, toAnswerChanges } from "../../answers";
import { assignmentsRootKey } from "../../queries";
import type { Assignment, StudentWork } from "../../types";

type Props = {
  assignment: Assignment;
  student: StudentWork;
  onChanged: (student: StudentWork) => void;
  /** Called after marks were saved (not on a conflict). */
  onSaved: () => void;
};

/**
 * One student's marks: typed parts are entered question by question or fast-marked with a part total.
 * Work is recorded as received by the first mark. Key it by the student's version so it always starts
 * from the saved values.
 */
export function AssignmentMarks({ assignment, student, onChanged, onSaved }: Props) {
  const queryClient = useQueryClient();
  const isCurrentAcademy = useAcademyScope();
  const attempt = useAttemptKey();
  const parts = useMemo(() => markParts(assignment), [assignment]);
  const saved = useMemo(() => savedAnswers(assignment.parts, student.answers), [assignment.parts, student.answers]);

  async function save(draft: SavePayload): Promise<SaveOutcome> {
    const academyId = assignment.academyId;
    const payload = { marks: draft.marks, answers: toAnswerChanges(draft.answers, assignment.parts), feedback: draft.feedback };
    const result = await saveStudentMarks({
      academyId, assignmentId: assignment.id, expectedVersion: student.version, recordId: student.recordId, code: null,
      ...payload, key: attempt.keyFor(JSON.stringify([student.version, payload])),
    });
    if (!isCurrentAcademy(academyId)) return { ok: true, saved: false };
    if (!result.ok) return { ok: false, message: result.message };
    attempt.reset();
    onChanged(result.student);
    void queryClient.invalidateQueries({ queryKey: assignmentsRootKey(academyId) });
    if (result.outcome === "conflict") {
      toast.warning("This student was changed elsewhere. The latest values are shown; review and save again.");
      return { ok: true, saved: false };
    }
    toast.success(result.outcome === "unchanged" ? "Nothing to change." : "Marks saved.");
    return { ok: true, saved: true };
  }

  return <MarksForm parts={parts} saved={saved} feedback={student.feedback} fast={{ saved: student.marks }} onSave={save} onDone={onSaved} />;
}
