"use client";

import { IconAlertTriangle, IconX } from "@tabler/icons-react";

import { RichText } from "@/components/shared/assessment/images/text";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";

import type { Answer } from "../answering/drafts";
import type { StudentExamQuestion } from "../types";

type Props = {
  question: StudentExamQuestion;
  part: { title: string; instructions: string } | undefined;
  value: Answer;
  /** The newer acknowledged value when this device's pending answer conflicts with it. */
  conflict: Answer | undefined;
  editable: boolean;
  onChange: (value: Answer) => void;
  onResolve: (choice: "mine" | "saved") => void;
};

const letter = (index: number) => String.fromCharCode(65 + index);

/** Clicking an image chip inside a choice opens the viewer without selecting the choice. */
function keepImageClicks(event: React.MouseEvent) {
  if ((event.target as HTMLElement).closest("[data-image-id]")) event.preventDefault();
}

/** One question: authored text and images, then choices (Question Sheet) or a text answer (Written Work). */
export function StudentExamQuestionView({ question, part, value, conflict, editable, onChange, onResolve }: Props) {
  const heading = `question-${question.id}`;
  return (
    <section aria-labelledby={heading} className="flex flex-col gap-5">
      {part && (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-muted-foreground">{part.title}</p>
          {part.instructions && <p className="whitespace-pre-wrap text-sm">{part.instructions}</p>}
        </div>
      )}
      <div className="flex flex-col gap-2">
        <h2 id={heading} className="text-lg font-semibold">Question {question.number}</h2>
        {question.prompt && <div className="whitespace-pre-wrap leading-7"><RichText value={question.prompt} /></div>}
      </div>
      {conflict && <Conflict question={question} saved={conflict} disabled={!editable} onResolve={onResolve} />}
      {question.kind === "question_sheet" ? (
        <div className="flex flex-col gap-2">
          <RadioGroup value={value.choiceId ?? ""} disabled={!editable} aria-labelledby={heading}
            onValueChange={(choiceId) => onChange({ choiceId, text: null })} className="gap-2">
            {question.choices.map((choice, index) => (
              <FieldLabel key={choice.id} htmlFor={`choice-${choice.id}`} onClick={keepImageClicks}>
                <Field orientation="horizontal">
                  <RadioGroupItem value={choice.id} id={`choice-${choice.id}`} />
                  <span className="font-medium tabular-nums">{letter(index)}.</span>
                  <span className="min-w-0 flex-1 whitespace-pre-wrap"><RichText value={choice.label} /></span>
                </Field>
              </FieldLabel>
            ))}
          </RadioGroup>
          {value.choiceId && editable && (
            <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => onChange({ choiceId: null, text: null })}>
              <IconX aria-hidden="true" />Clear answer
            </Button>
          )}
        </div>
      ) : (
        <Textarea value={value.text ?? ""} disabled={!editable} maxLength={10_000} rows={10} aria-labelledby={heading}
          onChange={(event) => onChange({ choiceId: null, text: event.target.value })} />
      )}
    </section>
  );
}

function Conflict({ question, saved, disabled, onResolve }: {
  question: StudentExamQuestion; saved: Answer; disabled: boolean; onResolve: (choice: "mine" | "saved") => void;
}) {
  const index = question.choices.findIndex((choice) => choice.id === saved.choiceId);
  const savedText = question.kind === "written_work" ? saved.text : index >= 0 ? `Choice ${letter(index)}` : null;
  return (
    <Alert>
      <IconAlertTriangle aria-hidden="true" />
      <AlertTitle>This answer was changed in another tab or device</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <span className="line-clamp-4 whitespace-pre-wrap">Saved answer: {savedText ?? "No answer"}</span>
        <span className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onResolve("mine")}>Keep my answer</Button>
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onResolve("saved")}>Use saved answer</Button>
        </span>
      </AlertDescription>
    </Alert>
  );
}
