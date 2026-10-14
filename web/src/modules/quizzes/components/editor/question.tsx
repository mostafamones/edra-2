"use client";

import { IconPlus, IconTrash } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type { QuizPartKind } from "../../types";
import { MAX_CHOICES, type FormQuestion } from "../../validation";
import { choiceLetter } from "../shared/labels";

type Props = {
  id: string;
  number: number;
  kind: QuizPartKind;
  question: FormQuestion;
  onChange: (question: FormQuestion) => void;
  onRemove?: () => void;
  error?: string;
  /** Structure locked: only the model answer stays editable. */
  locked: boolean;
};

/** One question: prompt, marks, model answer and, on a Question Sheet, choices with one correct answer. */
export function QuestionEditor({ id, number, kind, question, onChange, onRemove, error, locked }: Props) {
  const set = (change: Partial<FormQuestion>) => onChange({ ...question, ...change });
  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <legend className="font-medium">Question {number}</legend>
        {onRemove && !locked && (
          <Button type="button" variant="ghost" size="icon-sm" className="ml-auto" aria-label={`Remove question ${number}`} onClick={onRemove}><IconTrash /></Button>
        )}
      </div>
      <Field>
        <FieldLabel htmlFor={`${id}-prompt`}>Question text <span className="font-normal text-muted-foreground">(optional for paper quizzes)</span></FieldLabel>
        <Textarea id={`${id}-prompt`} value={question.prompt} disabled={locked} rows={2} maxLength={5000} onChange={(event) => set({ prompt: event.target.value })} />
      </Field>
      <Field data-invalid={Boolean(error) || undefined} className="max-w-40">
        <FieldLabel htmlFor={`${id}-max`}>Marks</FieldLabel>
        <Input id={`${id}-max`} inputMode="decimal" value={question.maxScore} disabled={locked} aria-invalid={Boolean(error) || undefined}
          onChange={(event) => set({ maxScore: event.target.value })} />
        <FieldError>{error}</FieldError>
      </Field>
      {kind === "question_sheet" && (
        <Field>
          <FieldLabel>Choices <span className="font-normal text-muted-foreground">(select the correct answer)</span></FieldLabel>
          <RadioGroup value={question.correct >= 0 ? String(question.correct) : ""} disabled={locked}
            onValueChange={(value) => set({ correct: Number(value) })} aria-label={`Correct answer for question ${number}`}>
            {question.choices.map((choice, index) => (
              <div key={choice.id ?? `new-${index}`} className="flex items-center gap-2">
                <RadioGroupItem value={String(index)} id={`${id}-correct-${index}`} aria-label={`Choice ${choiceLetter(index + 1)} is correct`} />
                <span className="w-5 text-sm font-medium text-muted-foreground">{choiceLetter(index + 1)}</span>
                <Input value={choice.label} disabled={locked} aria-label={`Choice ${choiceLetter(index + 1)} text`} maxLength={1000}
                  onChange={(event) => set({ choices: question.choices.map((entry, position) => position === index ? { ...entry, label: event.target.value } : entry) })} />
                {!locked && question.choices.length > 2 && (
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove choice ${choiceLetter(index + 1)}`}
                    onClick={() => set({
                      choices: question.choices.filter((_, position) => position !== index),
                      correct: question.correct === index ? -1 : question.correct > index ? question.correct - 1 : question.correct,
                    })}><IconTrash /></Button>
                )}
              </div>
            ))}
          </RadioGroup>
          {!locked && question.choices.length < MAX_CHOICES && (
            <Button type="button" variant="outline" size="sm" className="w-fit"
              onClick={() => set({ choices: [...question.choices, { label: choiceLetter(question.choices.length + 1) }] })}><IconPlus />Add choice</Button>
          )}
        </Field>
      )}
      <Field>
        <FieldLabel htmlFor={`${id}-model`}>Model answer <span className="font-normal text-muted-foreground">(staff only until solutions release)</span></FieldLabel>
        <Textarea id={`${id}-model`} value={question.modelAnswer} rows={2} maxLength={10000} onChange={(event) => set({ modelAnswer: event.target.value })} />
      </Field>
    </fieldset>
  );
}
