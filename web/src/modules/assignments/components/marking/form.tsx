"use client";

import { useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { MarksForm } from "@/components/shared/assessment/marking/form";
import { markSnapshot, scoringBasis } from "@/components/shared/assessment/marking/snapshot";
import type { SaveOutcome, SavePayload } from "@/components/shared/assessment/marking/types";
import { useAttemptKey } from "@/lib/attempt-key";
import { useAcademyScope } from "@/modules/auth";
import { saveStudentMarks } from "../../actions";
import { markParts, savedAnswers, toAnswerChanges } from "../../answers";
import { assignmentQueryKey, loadAssignment, assignmentsRootKey } from "../../queries";
import type { Assignment, StudentWork } from "../../types";
import { ReceivedFiles } from "./received";

type Props = {
  assignment: Assignment;
  student: StudentWork;
  onChanged: (student: StudentWork) => void;
  /** Called after marks were saved (not on a conflict). */
  onSaved: () => void;
};

/**
 * One student's marks: typed parts are entered question by question or fast-marked with a part total.
 * Work is recorded as received by the first mark. Its draft survives refreshes for the same academy, assessment and annual record.
 */
export function AssignmentMarks({ assignment, student, onChanged, onSaved }: Props) {
  const queryClient = useQueryClient();
  const isCurrentAcademy = useAcademyScope();
  const attempt = useAttemptKey();
  const checked = useRef<SavePayload | null>(null);
  const parts = useMemo(() => markParts(assignment), [assignment]);

  const baselineFor = (row: StudentWork) => ({ version: String(row.version), basis: scoringBasis(parts, row.scoringRevision ?? assignment.scoringRevision ?? 1), snapshot: markSnapshot(parts, savedAnswers(assignment.parts, row.answers), row.feedback, row.marks) });

  async function save(draft: SavePayload): Promise<SaveOutcome> {
    const academyId = assignment.academyId;
    if (checked.current !== draft) {
      const latest = await loadAssignment(academyId, assignment.id);
      if (!isCurrentAcademy(academyId)) return { ok: true, saved: false };
      if (!latest) return { ok: false, message: "Could not load the current scoring basis. Your entries are kept." };
      if ((latest.scoringRevision ?? 1) !== (assignment.scoringRevision ?? 1)) {
        queryClient.setQueryData(assignmentQueryKey(academyId, assignment.id), latest);
        return { ok: true, saved: false, message: "The scoring basis changed. Review the latest key, exclusions and maxima before saving." };
      }
      checked.current = draft;
    }
    const payload = { marks: draft.marks, answers: toAnswerChanges(draft.answers, assignment.parts), feedback: draft.feedback };
    const result = await saveStudentMarks({
      academyId, assignmentId: assignment.id, expectedVersion: student.version, recordId: student.recordId, code: null,
      ...payload, key: attempt.keyFor(JSON.stringify([student.version, payload])),
    });
    if (!isCurrentAcademy(academyId)) return { ok: true, saved: false };
    if (!result.ok) return { ok: false, message: result.message, uncertain: result.code === "unavailable" };
    attempt.reset();
    onChanged(result.student);
    void queryClient.invalidateQueries({ queryKey: assignmentsRootKey(academyId) });
    if (result.outcome === "conflict") {
      toast.warning("This student was changed elsewhere. The latest values are shown; review and save again.");
      return { ok: true, saved: false };
    }
    toast.success(result.outcome === "unchanged" ? "Nothing to change." : "Marks saved.");
    return { ok: true, saved: true, baseline: baselineFor(result.student) };
  }

  return <div className="flex flex-col gap-4"><ReceivedFiles assignment={assignment} recordId={student.recordId} /><MarksForm parts={parts} baseline={baselineFor(student)} feedback={student.feedback} fast={{ saved: student.marks }} onSave={save} onDone={onSaved} /></div>;
}
