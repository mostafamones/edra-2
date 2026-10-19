"use client";

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { IconAlertCircle, IconInfoCircle } from "@tabler/icons-react";

import { MarksForm } from "@/components/shared/assessment/marking/form";
import { BLANK } from "@/components/shared/assessment/marking/draft";
import type { SaveOutcome, SavePayload } from "@/components/shared/assessment/marking/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useAttemptKey } from "@/lib/attempt-key";
import type { AcademyEntry } from "@/modules/academies";
import { useAcademyScope } from "@/modules/auth";
import { confirmPhysicalWork, saveQuizMarks, savePhysicalAnswers } from "../../actions";
import { quizPermissions } from "../../permissions";
import { loadQuizStudent, quizStudentQueryKey, quizzesRootKey } from "../../queries";
import type { Quiz, QuizStudent, StudentDetail, StudentWorkResult } from "../../types";
import { markParts, savedValues } from "./parts";

type Props = { academy: AcademyEntry; quiz: Quiz; student: QuizStudent; onSaved: () => void };

/**
 * One student's quiz work on the shared marking sheet. Before work is accepted, saving records the
 * physical answers and confirms them as the student's final work; afterwards only Written Work marks and
 * feedback change. Key it by the student's version so it always starts from the saved values.
 */
export function QuizMarks({ academy, quiz, student, onSaved }: Props) {
  const query = useQuery({
    queryKey: quizStudentQueryKey(academy.id, quiz.id, student.recordId),
    queryFn: () => loadQuizStudent(academy.id, quiz.id, student.recordId),
  });
  if (query.isPending) return <div role="status" aria-label="Loading student work" className="flex flex-col gap-3 px-4"><Skeleton className="h-10" /><Skeleton className="h-64" /></div>;
  if (query.isError || !query.data) {
    return (
      <div className="px-4">
        <Alert variant="destructive"><IconAlertCircle /><AlertTitle>Couldn’t load this student’s work</AlertTitle><AlertDescription>Close the sheet and try again.</AlertDescription></Alert>
      </div>
    );
  }
  return <Loaded academy={academy} quiz={quiz} student={query.data.student} detail={query.data.detail} onSaved={onSaved} />;
}

function Loaded({ academy, quiz, student, detail, onSaved }: Props & { detail: StudentDetail }) {
  const queryClient = useQueryClient();
  const isCurrentAcademy = useAcademyScope();
  const draftKey = useAttemptKey();
  const confirmKey = useAttemptKey();
  const marksKey = useAttemptKey();
  const permissions = quizPermissions(academy.role, quiz);
  const accepted = student.submission !== null;
  const physical = !accepted && permissions.enterWork && student.eligible;
  const editable = useMemo(() => ({ choices: physical, marks: permissions.mark && (accepted || physical) }), [physical, permissions.mark, accepted]);
  const parts = useMemo(() => markParts(quiz, student, detail, editable), [quiz, student, detail, editable]);
  const saved = useMemo(() => savedValues(quiz, student, detail), [quiz, student, detail]);
  const answering = student.attempt && !student.attempt.finalizedAt && !student.attempt.superseded;
  const hasWritten = quiz.parts.some((part) => part.kind === "written_work");
  const choiceIds = useMemo(() => new Set(quiz.parts.filter((part) => part.kind === "question_sheet").flatMap((part) => part.questions.map((question) => question.id))), [quiz]);

  async function save(draft: SavePayload): Promise<SaveOutcome> {
    const academyId = quiz.academyId;
    const refresh = () => void queryClient.invalidateQueries({ queryKey: quizzesRootKey(academyId) });
    const fail = (result: Extract<StudentWorkResult, { ok: false }>): SaveOutcome => ({ ok: false, message: result.message });
    let current = student;

    if (!accepted) {
      // Physical work: the choices on paper become a draft, then the final work.
      if (draft.answers.some((edit) => choiceIds.has(edit.questionId))) {
        const answers = [...choiceIds].filter((id) => (draft.values[id] ?? "") !== "").map((id) => ({ questionId: id, choiceId: draft.values[id] === BLANK ? null : draft.values[id] }));
        const version = current.physicalDraft?.version ?? 0;
        const result = await savePhysicalAnswers({ academyId, quizId: quiz.id, recordId: student.recordId, expectedVersion: version, answers, key: draftKey.keyFor(JSON.stringify([version, answers])) });
        if (!isCurrentAcademy(academyId)) return { ok: true, saved: false };
        if (!result.ok) return fail(result);
        draftKey.reset();
        current = result.student;
        if (result.outcome === "conflict") { toast.warning("Someone else changed this entry. The latest saved answers are shown; review and save again."); refresh(); return { ok: true, saved: false }; }
      }
      const version = current.physicalDraft?.version ?? 0;
      const confirmed = await confirmPhysicalWork({ academyId, quizId: quiz.id, recordId: student.recordId, expectedVersion: version, key: confirmKey.keyFor(String(version)) });
      if (!isCurrentAcademy(academyId)) return { ok: true, saved: false };
      if (!confirmed.ok) return fail(confirmed);
      confirmKey.reset();
      current = confirmed.student;
      if (confirmed.outcome === "source_conflict") { toast.warning("This student’s online work was accepted first. The physical entry is kept as history."); refresh(); return { ok: true, saved: false }; }
      if (confirmed.outcome === "conflict") { toast.warning("Someone else changed this entry. The latest saved answers are shown; review and save again."); refresh(); return { ok: true, saved: false }; }
    }

    const marks = draft.answers.filter((edit) => !choiceIds.has(edit.questionId)).map((edit) => ({ questionId: edit.questionId, score: edit.value === "" ? null : edit.value }));
    if (marks.length > 0 || draft.feedback !== undefined) {
      const payload = { marks, ...(draft.feedback !== undefined ? { feedback: draft.feedback } : {}) };
      const result = await saveQuizMarks({
        academyId, quizId: quiz.id, recordId: student.recordId, expectedVersion: current.version, ...payload,
        key: marksKey.keyFor(JSON.stringify([current.version, payload])),
      });
      if (!isCurrentAcademy(academyId)) return { ok: true, saved: false };
      if (!result.ok) { refresh(); return fail(result); }
      marksKey.reset();
      refresh();
      if (result.outcome === "conflict") { toast.warning("This student was changed elsewhere. The latest marks are shown; review and save again."); return { ok: true, saved: false }; }
      toast.success(accepted ? "Marks saved privately. Students see them once the result is announced." : "Physical work confirmed and marks saved privately.");
      return { ok: true, saved: true };
    }
    refresh();
    toast.success(hasWritten ? "Physical work confirmed. Mark the written questions, then announce the result." : "Physical work confirmed. Announce the result when ready.");
    return { ok: true, saved: true };
  }

  return (
    <MarksForm
      parts={parts} saved={saved} feedback={student.feedback} readOnly={!editable.choices && !editable.marks} onSave={save} onDone={onSaved}
      saveLabel={accepted ? "Save marks" : "Confirm and save"} allowEmpty={!accepted}
      confirm={accepted ? undefined : {
        title: `Confirm ${student.fullName}’s physical work?`, action: "Confirm",
        body: `This becomes the student’s final submission${answering ? " and stops their online attempt" : ""}. The result isn’t announced until you announce it. Choice questions left empty count as unanswered.`,
      }}
      notice={<Notices quiz={quiz} student={student} accepted={accepted} physical={physical} answering={Boolean(answering)} />}
    />
  );
}

function Notices({ quiz, student, accepted, physical, answering }: { quiz: Quiz; student: QuizStudent; accepted: boolean; physical: boolean; answering: boolean }) {
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
