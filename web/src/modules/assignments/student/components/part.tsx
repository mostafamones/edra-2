"use client";

import { IconAlertTriangle } from "@tabler/icons-react";

import { RichText } from "@/components/shared/assessment/images/text";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

import type { Answers, EditorPart } from "../types";

const letter = (position: number) => String.fromCharCode(64 + position);
const choiceLetter = (question: EditorPart["questions"][number], choiceId: string | null) => {
  const choice = question.choices.find((entry) => entry.id === choiceId);
  return choice ? letter(choice.position) : "blank";
};

/** Clicking an image chip inside a choice opens the viewer without selecting the choice. */
function keepImageClicks(event: React.MouseEvent) {
  if ((event.target as HTMLElement).closest("[data-image-id]")) event.preventDefault();
}

/**
 * One Question Sheet or Answer Sheet part with all its questions. Excluded questions are absent
 * and nothing is renumbered. Answer Sheet questions show their number and letters only.
 */
type Props = {
  part: EditorPart; answers: Answers;
  /** This device's differing choices, awaiting the student's decision. */
  conflicts: Answers;
  onChoose: (questionId: string, choiceId: string | null) => void;
  onResolve: (questionId: string, keep: "saved" | "mine") => void;
};

export function StudentAssignmentPart({ part, answers, conflicts, onChoose, onResolve }: Props) {
  return (
    <section aria-labelledby={`part-${part.id}`} className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 id={`part-${part.id}`} className="text-lg font-semibold">{part.title}</h2>
        {part.instructions && <p className="whitespace-pre-wrap text-sm">{part.instructions}</p>}
      </div>
      <ol className="flex flex-col gap-6">
        {part.questions.map((question) => {
          const heading = `question-${question.id}`;
          const value = answers[question.id] ?? null;
          return (
            <li key={question.id} className="flex flex-col gap-3 rounded-lg border p-4">
              <h3 id={heading} className="font-medium">Question {question.number}</h3>
              {question.prompt && <div className="whitespace-pre-wrap leading-7"><RichText value={question.prompt} /></div>}
              {question.id in conflicts && (
                <Alert>
                  <IconAlertTriangle aria-hidden="true" />
                  <AlertTitle>Saved answer: {choiceLetter(question, value)} · This device: {choiceLetter(question, conflicts[question.id])}</AlertTitle>
                  <AlertDescription className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => onResolve(question.id, "saved")}>Use saved answer</Button>
                    <Button type="button" size="sm" onClick={() => onResolve(question.id, "mine")}>Use this device’s answer</Button>
                  </AlertDescription>
                </Alert>
              )}
              <RadioGroup value={value ?? ""} aria-labelledby={heading} onValueChange={(choiceId) => onChoose(question.id, choiceId)}
                className={part.kind === "answer_sheet" ? "flex flex-wrap gap-4" : "gap-2"}>
                {question.choices.map((choice) => (
                  <FieldLabel key={choice.id} htmlFor={`choice-${choice.id}`} onClick={keepImageClicks}>
                    <Field orientation="horizontal">
                      <RadioGroupItem value={choice.id} id={`choice-${choice.id}`} />
                      <span className="font-medium tabular-nums">{letter(choice.position)}{choice.label ? "." : ""}</span>
                      {choice.label && <span className="min-w-0 flex-1 whitespace-pre-wrap"><RichText value={choice.label} /></span>}
                    </Field>
                  </FieldLabel>
                ))}
              </RadioGroup>
              {value && <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => onChoose(question.id, null)}>Clear answer</Button>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
