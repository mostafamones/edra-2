"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { IconAlertCircle, IconLoader2 } from "@tabler/icons-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useAcademyScope } from "@/modules/auth";
import { correctQuizKey, excludeQuizQuestion } from "../../actions";
import { quizzesRootKey } from "../../queries";
import type { Quiz, QuizQuestion } from "../../types";
import { choiceLetter } from "../shared/labels";
import { useAttemptKey } from "../shared/use-attempt-key";

type Props = { quiz: Quiz; question: QuizQuestion | null; mode: "key" | "exclude"; onClose: () => void };

/**
 * Owner/Head Admin/Admin corrections after the structure locks. A key correction changes only which
 * choice is correct; an exclusion keeps the question, its number, answers and marks but removes its
 * weight. Both recalculate privately: official results change only when the correction is announced.
 */
export function CorrectionDialog({ quiz, question, mode, onClose }: Props) {
  const queryClient = useQueryClient();
  const isCurrentAcademy = useAcademyScope();
  const attempt = useAttemptKey();
  const current = question?.choices.find((choice) => choice.isCorrect)?.id ?? "";
  const [choice, setChoice] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remaining = quiz.parts.flatMap((part) => part.questions).filter((entry) => !entry.excluded).length;

  async function submit() {
    if (!question) return;
    setBusy(true);
    setError(null);
    try {
      const base = { academyId: quiz.academyId, quizId: quiz.id, questionId: question.id, expectedScoringRevision: quiz.scoringRevision };
      const result = mode === "key"
        ? await correctQuizKey({ ...base, choiceId: choice, key: attempt.keyFor(`key:${question.id}:${choice}:${quiz.scoringRevision}`) })
        : await excludeQuizQuestion({ ...base, key: attempt.keyFor(`exclude:${question.id}:${quiz.scoringRevision}`) });
      if (!isCurrentAcademy(quiz.academyId)) return;
      if (!result.ok) { setError(result.message); return; }
      attempt.reset();
      toast.success(mode === "key"
        ? "Key corrected. Results were recalculated privately; announce the corrections when ready."
        : "Question excluded. Results were recalculated privately; announce the corrections when ready.");
      void queryClient.invalidateQueries({ queryKey: quizzesRootKey(quiz.academyId) });
      onClose();
    } catch {
      if (isCurrentAcademy(quiz.academyId)) setError("The connection dropped, so we couldn’t confirm whether this was saved. Reload to see the current state before trying again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={question !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        {question && (
          <>
            <DialogHeader>
              <DialogTitle>{mode === "key" ? `Correct the key of question ${question.number}` : `Exclude question ${question.number}?`}</DialogTitle>
              <DialogDescription>
                {mode === "key"
                  ? "Prompts, choices and students’ saved answers stay as they are. Every accepted answer is rescored against the new key."
                  : "The question keeps its number, answers and marks, but no longer counts toward scores or needs marking. Students still answering skip it. Exclusions can’t be undone."}
              </DialogDescription>
            </DialogHeader>
            {error && <Alert variant="destructive"><IconAlertCircle /><AlertTitle>Not changed</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
            {mode === "key" ? (
              <RadioGroup value={choice} onValueChange={setChoice} aria-label="Correct choice">
                {question.choices.map((entry) => (
                  <div key={entry.id} className="flex items-center gap-2">
                    <RadioGroupItem value={entry.id} id={`correct-${entry.id}`} />
                    <Label htmlFor={`correct-${entry.id}`} className="font-normal">
                      <span className="font-medium">{choiceLetter(entry.position)}.</span> {entry.label}
                      {entry.isCorrect && <span className="text-muted-foreground"> (current key)</span>}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            ) : remaining <= 1 ? (
              <Alert><IconAlertCircle /><AlertTitle>This is the last scored question</AlertTitle><AlertDescription>At least one question must keep counting.</AlertDescription></Alert>
            ) : null}
            <p className="text-sm text-muted-foreground">Official results stay unchanged until you announce the corrections from the Students tab.</p>
            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
              <Button variant={mode === "exclude" ? "destructive" : "default"} onClick={() => void submit()}
                disabled={busy || (mode === "key" ? !choice || choice === current : remaining <= 1)}>
                {busy && <IconLoader2 className="animate-spin" />}{mode === "key" ? "Correct key" : "Exclude question"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
