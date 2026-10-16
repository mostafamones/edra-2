"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { IconAlertCircle, IconInfoCircle, IconLoader2 } from "@tabler/icons-react";

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { useAcademyScope } from "@/modules/auth";
import { confirmPhysicalWork, savePhysicalAnswers } from "../../actions";
import type { QuizPermissions } from "../../permissions";
import { quizzesRootKey } from "../../queries";
import type { Quiz, QuizStudent, StudentDetail, StudentWorkResult } from "../../types";
import { choiceLetter } from "../shared/labels";
import { useAttemptKey } from "../shared/use-attempt-key";

const BLANK = "blank";

/**
 * Physical entry: the student's selections on paper, as compact numbered choices (question text is
 * optional while transcribing). Saving a draft never chooses a source; confirming records the work as
 * received and final, even with written questions still to mark. It never announces a result.
 */
export function PhysicalEntry({ quiz, student, detail, permissions }: { quiz: Quiz; student: QuizStudent; detail: StudentDetail; permissions: QuizPermissions }) {
  const queryClient = useQueryClient();
  const isCurrentAcademy = useAcademyScope();
  const draftKey = useAttemptKey();
  const confirmKey = useAttemptKey();
  const sheetQuestions = quiz.parts.filter((part) => part.kind === "question_sheet").flatMap((part) => part.questions);
  const hasWritten = quiz.parts.some((part) => part.kind === "written_work");
  const saved = Object.fromEntries(detail.questions.filter((question) => question.physicalAnswer)
    .map((question) => [question.questionId, question.physicalAnswer?.choiceId ?? BLANK]));
  const incoming = { version: student.physicalDraft?.version ?? 0, entries: saved };
  const [base, setBase] = useState(incoming);
  const [entries, setEntries] = useState<Record<string, string>>(saved);
  const sameEntries = (left: Record<string, string>, right: Record<string, string>) => JSON.stringify(Object.entries(left).sort()) === JSON.stringify(Object.entries(right).sort());
  const newerAvailable = base.version !== incoming.version;
  if (newerAvailable && (sameEntries(entries, base.entries) || sameEntries(entries, incoming.entries))) {
    setBase(incoming); setEntries(incoming.entries);
  }
  const [busy, setBusy] = useState<"save" | "confirm" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const version = base.version;
  const dirty = !sameEntries(entries, base.entries);
  const answering = student.attempt && !student.attempt.finalizedAt && !student.attempt.superseded;

  const refresh = () => void queryClient.invalidateQueries({ queryKey: quizzesRootKey(quiz.academyId) });
  function report(result: StudentWorkResult, success: string) {
    if (!result.ok) { setError(result.message); return false; }
    if (result.outcome === "source_conflict") {
      toast.warning("This student’s online work was accepted first. The physical entry is kept as history.");
    } else if (result.outcome === "conflict") {
      toast.warning("Someone else changed this entry. The latest saved answers are shown; review and save again.");
    } else toast.success(success);
    refresh();
    return true;
  }

  async function save() {
    setBusy("save");
    setError(null);
    const answers = Object.entries(entries).map(([questionId, value]) => ({ questionId, choiceId: value === BLANK ? null : value }));
    try {
      const result = await savePhysicalAnswers({
        academyId: quiz.academyId, quizId: quiz.id, recordId: student.recordId, expectedVersion: version, answers,
        key: draftKey.keyFor(JSON.stringify([version, answers])),
      });
      if (!isCurrentAcademy(quiz.academyId)) return;
      if (report(result, "Physical answers saved as a draft.")) draftKey.reset();
    } catch {
      if (isCurrentAcademy(quiz.academyId)) setError("The connection dropped, so we couldn’t confirm whether this saved. Your entries are kept; trying again repeats the same request.");
    } finally {
      setBusy(null);
    }
  }

  async function confirm() {
    setBusy("confirm");
    setError(null);
    try {
      const result = await confirmPhysicalWork({
        academyId: quiz.academyId, quizId: quiz.id, recordId: student.recordId, expectedVersion: version, key: confirmKey.keyFor(String(version)),
      });
      if (!isCurrentAcademy(quiz.academyId)) return;
      if (report(result, hasWritten ? "Physical work confirmed. Mark the written questions, then announce the result." : "Physical work confirmed. Announce the result when ready.")) confirmKey.reset();
    } catch {
      if (isCurrentAcademy(quiz.academyId)) setError("The connection dropped, so we couldn’t confirm whether this was saved. Reload to see the current state before trying again.");
    } finally {
      setBusy(null);
    }
  }

  if (!permissions.enterWork) {
    return (
      <Alert>
        <IconInfoCircle />
        <AlertTitle>No accepted work</AlertTitle>
        <AlertDescription>
          {quiz.phase === "closed" ? "The quiz has closed, so no new physical work can be recorded." : quiz.ready ? "Physical work can’t be recorded for this quiz now." : "Finish the quiz setup before recording physical work."}
        </AlertDescription>
      </Alert>
    );
  }
  if (!student.eligible) {
    return (
      <Alert>
        <IconInfoCircle />
        <AlertTitle>Not in the audience now</AlertTitle>
        <AlertDescription>
          This student is no longer in the quiz audience, so new physical answers can’t be saved or confirmed.
          {student.physicalDraft ? " The saved draft is kept for the record." : ""}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <section aria-labelledby="physical-entry" className="flex flex-col gap-4">
      <h3 id="physical-entry" className="font-heading font-semibold">Physical work</h3>
      {answering && (
        <Alert>
          <IconInfoCircle />
          <AlertTitle>Also answering online</AlertTitle>
          <AlertDescription>The first final submission wins: if you confirm physical work first, the online attempt stops and its answers are kept as history.</AlertDescription>
        </Alert>
      )}
      {newerAvailable && (
        <Alert>
          <IconAlertCircle />
          <AlertTitle>This entry changed elsewhere</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            Your unsaved answers are kept and checked against the version you started from.
            <Button variant="outline" size="sm" onClick={() => { setBase(incoming); setEntries(incoming.entries); setError(null); }}>Discard mine and load latest</Button>
          </AlertDescription>
        </Alert>
      )}
      {error && <Alert variant="destructive"><IconAlertCircle /><AlertTitle>Not saved</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      {sheetQuestions.length === 0 ? (
        <p className="text-sm text-muted-foreground">This quiz has no choice questions to transcribe. Confirm when the written work is received, then mark it.</p>
      ) : (
        <ol className="flex flex-col divide-y rounded-lg border">
          {sheetQuestions.map((question) => (
            <li key={question.id} className={cn("flex flex-wrap items-center gap-3 px-3 py-2", question.excluded && "opacity-60")}>
              <span className="w-10 font-medium tabular-nums" title={question.prompt || undefined}>Q{question.number}</span>
              <RadioGroup value={entries[question.id] ?? ""} onValueChange={(value) => setEntries({ ...entries, [question.id]: value })}
                className="flex flex-wrap gap-3" aria-label={`Question ${question.number} answer`}>
                {question.choices.map((choice) => (
                  <label key={choice.id} className="flex items-center gap-1.5 text-sm">
                    <RadioGroupItem value={choice.id} aria-label={`${choiceLetter(choice.position)}${choice.label ? `: ${choice.label}` : ""}`} />
                    {choiceLetter(choice.position)}
                  </label>
                ))}
                <label className="flex items-center gap-1.5 text-sm text-muted-foreground"><RadioGroupItem value={BLANK} aria-label="Left blank" />Blank</label>
              </RadioGroup>
            </li>
          ))}
        </ol>
      )}
      {hasWritten && <p className="text-sm text-muted-foreground">Written questions are marked after you confirm the work.</p>}
      <div className="flex flex-wrap justify-end gap-2">
        {sheetQuestions.length > 0 && (
          <Button variant="outline" disabled={busy !== null || !dirty} onClick={() => void save()}>{busy === "save" && <IconLoader2 className="animate-spin" />}Save draft</Button>
        )}
        <AlertDialog>
          <AlertDialogTrigger asChild><Button disabled={busy !== null || dirty}>{busy === "confirm" && <IconLoader2 className="animate-spin" />}Confirm received work</Button></AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm {student.fullName}’s physical work?</AlertDialogTitle>
              <AlertDialogDescription>
                This becomes the student’s final submission{answering ? " and stops their online attempt" : ""}. The result isn’t announced until you announce it.
                {sheetQuestions.length > 0 ? ` ${Object.keys(saved).length} of ${sheetQuestions.length} choice questions are entered; the rest count as unanswered.` : ""}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void confirm()}>Confirm</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {dirty && <p className="text-right text-xs text-muted-foreground">Save the draft before confirming.</p>}
    </section>
  );
}
