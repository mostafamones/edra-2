"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { IconAlertCircle, IconCheck, IconLoader2, IconX } from "@tabler/icons-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatScore, isValidScoreText } from "@/lib/score";
import { cn } from "@/lib/utils";
import { useAcademyScope } from "@/modules/auth";
import { announceQuizResults, saveQuizMarks } from "../../actions";
import { announceable, type QuizPermissions } from "../../permissions";
import { quizzesRootKey } from "../../queries";
import type { Quiz, QuizQuestion, QuizStudent, StudentDetail } from "../../types";
import { choiceLetter } from "../shared/labels";
import { useAttemptKey } from "../shared/use-attempt-key";

/**
 * The accepted submission: answers by question with automatic scores, private marks for Written
 * Work (blank is unmarked, zero is a mark), feedback, and announcement of this student's result.
 */
export function WorkReview({ quiz, student, detail, permissions }: { quiz: Quiz; student: QuizStudent; detail: StudentDetail; permissions: QuizPermissions }) {
  const queryClient = useQueryClient();
  const isCurrentAcademy = useAcademyScope();
  const marksKey = useAttemptKey();
  const announceKey = useAttemptKey();
  const questions = new Map<string, QuizQuestion>(quiz.parts.flatMap((part) => part.questions).map((question) => [question.id, question]));
  const savedMarks = Object.fromEntries(detail.questions.filter((question) => question.kind === "written_work")
    .map((question) => [question.questionId, question.mark === null ? "" : formatScore(question.mark)]));
  const [marks, setMarks] = useState<Record<string, string>>(savedMarks);
  const [feedback, setFeedback] = useState(student.feedback);
  const [busy, setBusy] = useState<"marks" | "announce" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const changes = Object.entries(marks).filter(([id, value]) => value.trim() !== savedMarks[id])
    .map(([questionId, value]) => ({ questionId, score: value.trim() === "" ? null : value.trim() }));
  const invalid = changes.filter((change) => change.score !== null && !isValidScoreText(change.score, questions.get(change.questionId)?.maxScore ?? "0"));
  const feedbackChanged = feedback !== student.feedback;
  const dirty = changes.length > 0 || feedbackChanged;
  const refresh = () => void queryClient.invalidateQueries({ queryKey: quizzesRootKey(quiz.academyId) });

  async function saveMarks() {
    setBusy("marks");
    setError(null);
    const payload = { marks: changes, ...(feedbackChanged ? { feedback } : {}) };
    try {
      const result = await saveQuizMarks({
        academyId: quiz.academyId, quizId: quiz.id, recordId: student.recordId, expectedVersion: student.version, ...payload,
        key: marksKey.keyFor(JSON.stringify([student.version, payload])),
      });
      if (!isCurrentAcademy(quiz.academyId)) return;
      if (!result.ok) { setError(result.message); return; }
      marksKey.reset();
      if (result.outcome === "conflict") toast.warning("This student was changed elsewhere. The latest marks are shown; review and save again.");
      else toast.success("Marks saved privately. Students see them once the result is announced.");
      refresh();
    } catch {
      if (isCurrentAcademy(quiz.academyId)) setError("Could not reach the server. Your marks are kept; try again.");
    } finally {
      setBusy(null);
    }
  }

  async function announce() {
    setBusy("announce");
    setError(null);
    const items = [{ recordId: student.recordId, expectedVersion: student.version }];
    try {
      const result = await announceQuizResults({
        academyId: quiz.academyId, quizId: quiz.id, expectedScoringRevision: quiz.scoringRevision, items,
        key: announceKey.keyFor(JSON.stringify([quiz.scoringRevision, items])),
      });
      if (!isCurrentAcademy(quiz.academyId)) return;
      if (!result.ok) { setError(result.message); return; }
      if (result.outcome === "rejected") { setError("This result changed or isn’t complete. Refresh and try again."); refresh(); return; }
      announceKey.reset();
      const outcome = result.results[0]?.outcome;
      toast.success(outcome === "corrected" ? "Corrected result announced." : outcome === "unchanged" ? "This result was already announced." : "Result announced.");
      refresh();
    } catch {
      if (isCurrentAcademy(quiz.academyId)) setError("Could not reach the server. Nothing was announced; try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="work-review" className="flex flex-col gap-4">
      <h3 id="work-review" className="font-heading font-semibold">{student.submission?.source === "physical" ? "Physical work" : "Online submission"}</h3>
      {error && <Alert variant="destructive"><IconAlertCircle /><AlertTitle>Not saved</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      <ol className="flex flex-col gap-2">
        {detail.questions.map((entry) => {
          const question = questions.get(entry.questionId);
          const correct = question?.choices.find((choice) => choice.isCorrect);
          const chosen = question?.choices.find((choice) => choice.id === entry.submittedAnswer?.choiceId);
          const markError = entry.kind === "written_work" && invalid.some((change) => change.questionId === entry.questionId)
            ? `Enter 0 to ${formatScore(entry.maxScore)}, with at most two decimals.` : undefined;
          return (
            <li key={entry.questionId} className={cn("flex flex-col gap-2 rounded-lg border p-3", entry.excluded && "opacity-60")}>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium tabular-nums">Q{entry.number}</span>
                {question?.prompt && <span className="min-w-0 flex-1 truncate text-muted-foreground">{question.prompt}</span>}
                {entry.excluded && <Badge variant="outline">Excluded</Badge>}
                <span className="ml-auto tabular-nums">
                  {entry.score === null ? <span className="text-muted-foreground">Unmarked</span> : `${formatScore(entry.score)} / ${formatScore(entry.maxScore)}`}
                </span>
              </div>
              {entry.kind === "question_sheet" ? (
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  {chosen ? (
                    <>
                      {chosen.id === correct?.id ? <IconCheck className="size-4 text-primary" aria-label="Correct" /> : <IconX className="size-4 text-destructive" aria-label="Incorrect" />}
                      Answered {choiceLetter(chosen.position)}{chosen.label ? `: ${chosen.label}` : ""}
                    </>
                  ) : <span className="text-muted-foreground">Unanswered (scores 0)</span>}
                  {correct && <span className="text-muted-foreground">· Key {choiceLetter(correct.position)}</span>}
                </p>
              ) : (
                <>
                  {entry.submittedAnswer?.textAnswer
                    ? <p className="rounded-md bg-muted/50 p-2 text-sm whitespace-pre-wrap">{entry.submittedAnswer.textAnswer}</p>
                    : <p className="text-sm text-muted-foreground">{student.submission?.source === "physical" ? "Written on paper." : "No written answer saved."}</p>}
                  {question?.modelAnswer && <p className="text-xs whitespace-pre-wrap text-muted-foreground">Model answer: {question.modelAnswer}</p>}
                  {!entry.excluded && (
                    <Field data-invalid={Boolean(markError) || undefined} className="max-w-48">
                      <FieldLabel htmlFor={`mark-${entry.questionId}`}>Mark (of {formatScore(entry.maxScore)})</FieldLabel>
                      <Input id={`mark-${entry.questionId}`} inputMode="decimal" placeholder="Unmarked" value={marks[entry.questionId] ?? ""} disabled={!permissions.mark}
                        aria-invalid={Boolean(markError) || undefined} onChange={(event) => setMarks({ ...marks, [entry.questionId]: event.target.value })} />
                      <FieldError>{markError}</FieldError>
                    </Field>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ol>
      <Field>
        <FieldLabel htmlFor="quiz-feedback">Feedback</FieldLabel>
        <Textarea id="quiz-feedback" value={feedback} rows={3} maxLength={5000} disabled={!permissions.mark} onChange={(event) => setFeedback(event.target.value)} />
      </Field>
      {permissions.mark && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" disabled={!dirty || invalid.length > 0 || busy !== null} onClick={() => void saveMarks()}>
            {busy === "marks" && <IconLoader2 className="animate-spin" />}Save marks
          </Button>
          <Button disabled={dirty || !announceable(student) || busy !== null} onClick={() => void announce()}>
            {busy === "announce" && <IconLoader2 className="animate-spin" />}{student.publicationState === "pending_correction" ? "Announce correction" : "Announce result"}
          </Button>
        </div>
      )}
      {permissions.mark && student.result && !student.result.complete && (
        <p className="text-right text-xs text-muted-foreground">Mark every written question to announce.</p>
      )}
    </section>
  );
}
