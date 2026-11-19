import { useLayoutEffect, useRef, useState } from "react";
import { useImages } from "@/components/shared/assessment/images/context";
import { imageToken, MAX_QUESTION_IMAGES } from "@/components/shared/assessment/images/tokens";
import type { EditorQuestion } from "@/components/shared/assessment/parts/config";
import { Button } from "@/components/ui/button";
import { useAcademyScope, useAuth } from "@/modules/auth";
import type { BankPayload } from "./bank-contract";
import { SavedBank } from "./saved-bank";

type Target = { kind: string; full: boolean; append: (question: EditorQuestion) => boolean };
type Props = Target & { academyId: string; academySlug: string; maxChoices: number };

export function AssessmentQuestionPicker({ academyId, academySlug, ...target }: Props) {
  const { user } = useAuth();
  if (!user) return null;
  return <SavedBank key={JSON.stringify([academyId, user.id, target.kind])} scope={{ academyId, academySlug, accountId: user.id }}
    disabled={target.full} onPick={(question, close) => <AddQuestion {...target} question={question} close={close} academyId={academyId} />} />;
}

function AddQuestion({ question, close, academyId, kind, full, append, maxChoices }: Target & {
  question: BankPayload; close: () => void; academyId: string; maxChoices: number;
}) {
  const [status, setStatus] = useState<"idle" | "adding" | "error">("idle");
  const active = useRef(false);
  const pending = useRef(false);
  useLayoutEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const isCurrent = useAcademyScope();
  const { upload } = useImages();
  const choices = question.choices.map(choice => ({ label: choice.text, isCorrect: choice.key === question.answer }));
  const mismatch = (kind === "question_sheet") !== (choices.length > 0);
  const tooLarge = choices.length > maxChoices || choices.some(choice => choice.label.length > 1000)
    || question.visuals.length > MAX_QUESTION_IMAGES || question.prompt.length + question.visuals.length * (imageToken("0".repeat(36)).length + 1) > 5000;
  const reason = mismatch ? (choices.length ? "Choose a Question Sheet part for this question." : "Choose a Written Work part for this question.")
    : tooLarge ? "This question exceeds the assessment editor’s text, choice, or image limits." : undefined;

  async function add() {
    if (pending.current || full || reason || !isCurrent(academyId)) return;
    pending.current = true;
    setStatus("adding");
    try {
      const files = question.visuals.map((visual, index) => {
        const bytes = Uint8Array.from(atob(visual.image.split(",")[1]), char => char.charCodeAt(0));
        return new File([bytes], `question-figure-${index + 1}.jpg`, { type: "image/jpeg" });
      });
      const uploads = files.map(upload);
      const finished = await Promise.all(uploads.map(item => item?.done ?? false));
      if (!active.current || !isCurrent(academyId)) return;
      if (!finished.every(Boolean)) throw new Error("Upload failed");
      const prompt = [question.prompt, ...uploads.map(item => imageToken(item!.id))].join("\n");
      if (!append({ prompt, choices, maxScore: "1", modelAnswer: question.modelAnswer ?? "" })) throw new Error("Part changed");
      close();
    } catch {
      if (active.current && isCurrent(academyId)) setStatus("error");
    } finally { pending.current = false; }
  }

  return <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3">
    {reason && <p className="text-sm text-muted-foreground">{reason}</p>}
    {status === "error" && <p role="alert" className="text-sm text-destructive">Couldn’t add this question. Check the part and try again.</p>}
    <Button type="button" disabled={full || !!reason || status === "adding"} onClick={() => void add()}>
      {status === "adding" ? "Adding…" : "Add to part"}
    </Button>
  </div>;
}
