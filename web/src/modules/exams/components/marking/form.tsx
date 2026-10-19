"use client";

import { useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { IconAlertCircle, IconInfoCircle } from "@tabler/icons-react";

import { MarksForm } from "@/components/shared/assessment/marking/form";
import { markSnapshot, scoringBasis } from "@/components/shared/assessment/marking/snapshot";
import { physicalSave } from "@/components/shared/assessment/marking/physical-save";
import { BLANK } from "@/components/shared/assessment/marking/draft";
import type { SaveOutcome, SavePayload } from "@/components/shared/assessment/marking/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import type { AcademyEntry } from "@/modules/academies";
import { useAcademyScope } from "@/modules/auth";
import { confirmPhysicalWork, saveExamMarks, savePhysicalAnswers } from "../../actions";
import { examPermissions } from "../../permissions";
import { loadExam, examQueryKey, loadExamStudent, examStudentQueryKey, examsRootKey } from "../../queries";
import type { Exam, ExamStudent, StudentDetail } from "../../types";
import { markParts, savedValues } from "./parts";

type Props = { academy: AcademyEntry; exam: Exam; student: ExamStudent; onSaved: () => void };

/**
 * One student's exam work on the shared marking sheet. Before work is accepted, saving records the
 * physical answers and confirms them as the student's final work; afterwards only Written Work marks and
 * feedback change. Key it by the student's version so it always starts from the saved values.
 */
export function ExamMarks({ academy, exam, student, onSaved }: Props) {
  const query = useQuery({
    queryKey: examStudentQueryKey(academy.id, exam.id, student.recordId),
    queryFn: () => loadExamStudent(academy.id, exam.id, student.recordId),
  });
  if (query.isPending) return <div role="status" aria-label="Loading student work" className="flex flex-col gap-3 px-4"><Skeleton className="h-10" /><Skeleton className="h-64" /></div>;
  if (query.isError || !query.data) {
    return (
      <div className="px-4">
        <Alert variant="destructive"><IconAlertCircle /><AlertTitle>Couldn’t load this student’s work</AlertTitle><AlertDescription>Close the sheet and try again.</AlertDescription></Alert>
      </div>
    );
  }
  return <Loaded academy={academy} exam={exam} student={query.data.student} detail={query.data.detail} onSaved={onSaved} />;
}

function Loaded({ academy, exam, student, detail, onSaved }: Props & { detail: StudentDetail }) {
  const queryClient = useQueryClient();
  const isCurrentAcademy = useAcademyScope();
  const permissions = examPermissions(academy.role, exam);
  const accepted = student.submission !== null;
  const physical = !accepted && permissions.enterWork && student.eligible;
  const editable = useMemo(() => ({ choices: physical, marks: permissions.mark && (accepted || physical) }), [physical, permissions.mark, accepted]);
  const parts = useMemo(() => markParts(exam, student, detail, editable), [exam, student, detail, editable]);
  const saved = useMemo(() => savedValues(exam, student, detail), [exam, student, detail]);
  const answering = student.attempt && !student.attempt.finalizedAt && !student.attempt.superseded;
  const choiceIds = useMemo(() => new Set(exam.parts.filter((part) => part.kind === "question_sheet").flatMap((part) => part.questions.map((question) => question.id))), [exam]);

  const currentStudent = useRef(student);
  const request = useRef<{ payload: SavePayload; run: () => Promise<SaveOutcome> } | null>(null);
  const basis = scoringBasis(parts, exam.scoringRevision);
  const baseline = { version: JSON.stringify([student.version, student.physicalDraft?.version ?? 0]), basis, snapshot: markSnapshot(parts, saved, student.feedback) };

  async function save(draft: SavePayload): Promise<SaveOutcome> {
    if (accepted && draft.answers.some((edit) => choiceIds.has(edit.questionId))) return { ok: false, message: "Choice entries changed after final submission. Keep the accepted work and discard these later choice edits before saving marks." };
    if (request.current?.payload !== draft) {
      const latest = await loadExam(academy.id, exam.id);
      if (!isCurrentAcademy(academy.id)) return { ok: true, saved: false };
      if (!latest) return { ok: false, message: "Could not load the current scoring basis. Your entries are kept." };
      if (latest.scoringRevision !== exam.scoringRevision) {
        queryClient.setQueryData(examQueryKey(academy.id, exam.id), latest);
        return { ok: true, saved: false, message: "The scoring basis changed. Review the latest key, exclusions and maxima before saving." };
      }
      const initial = currentStudent.current.version > student.version || (currentStudent.current.version === student.version && (currentStudent.current.physicalDraft?.version ?? 0) > (student.physicalDraft?.version ?? 0)) ? currentStudent.current : student;
      const run = physicalSave(draft, {
        initial, choiceIds, current: () => isCurrentAcademy(academy.id),
        draft: (expectedVersion, answers, key) => savePhysicalAnswers({ academyId: academy.id, examId: exam.id, recordId: student.recordId, expectedVersion, answers, key }),
        confirm: (expectedVersion, key) => confirmPhysicalWork({ academyId: academy.id, examId: exam.id, recordId: student.recordId, expectedVersion, key }),
        marks: (expectedVersion, marks, feedback, key) => saveExamMarks({ academyId: academy.id, examId: exam.id, recordId: student.recordId, expectedVersion, marks, ...(feedback !== undefined ? { feedback } : {}), key }),
        acknowledged: (next) => { currentStudent.current = next; },
        done: (next, payload) => {
          const values = { ...payload.values };
          for (const id of choiceIds) values[id] = initial.submission ? saved[id] ?? BLANK : values[id] || BLANK;
          toast.success("Work and marks saved privately.");
          return { ok: true, saved: true, baseline: { version: JSON.stringify([next.version, next.physicalDraft?.version ?? 0]), basis, snapshot: markSnapshot(parts, values, next.feedback) } };
        },
      });
      request.current = { payload: draft, run };
    }
    const result = await request.current.run();
    if (isCurrentAcademy(academy.id)) void queryClient.invalidateQueries({ queryKey: examsRootKey(academy.id) });
    return result;
  }

  return (
    <MarksForm
      parts={parts} baseline={baseline} feedback={student.feedback} readOnly={!editable.choices && !editable.marks} onSave={save} onDone={onSaved}
      saveLabel={accepted ? "Save marks" : "Confirm and save"} allowEmpty={!accepted}
      confirm={accepted ? undefined : {
        title: `Confirm ${student.fullName}’s physical work?`, action: "Confirm",
        body: `This becomes the student’s final submission${answering ? " and stops their online attempt" : ""}. The result isn’t announced until you announce it. Choice questions left empty count as unanswered.`,
      }}
      notice={<Notices physical={physical} answering={Boolean(answering)} />}
    />
  );
}

function Notices({ physical, answering }: { physical: boolean; answering: boolean }) {
  return (
    <>
      {physical && answering && (
        <Alert>
          <IconInfoCircle />
          <AlertTitle>Also answering online</AlertTitle>
          <AlertDescription>The first final submission wins: if you confirm physical work first, the online attempt stops and its answers are kept as history.</AlertDescription>
        </Alert>
      )}
      {physical && <p className="text-sm text-muted-foreground">Saving records these answers as the student’s final physical work. Written questions are marked in the same save, or afterwards.</p>}
    </>
  );
}
