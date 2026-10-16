"use client";

import { IconArrowDown, IconArrowUp, IconPlus, IconTrash } from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatScore } from "@/lib/score";
import { MAX_QUESTIONS_PER_PART, newQuestion, type FormPart } from "../../validation";
import { KIND_HINTS, KIND_LABELS } from "../shared/labels";
import { QuestionEditor } from "./question";

type Props = {
  index: number;
  part: FormPart;
  /** Number of the part's first question across the exam. */
  firstNumber: number;
  count: number;
  onChange: (part: FormPart) => void;
  onMove: (offset: -1 | 1) => void;
  onRemove: () => void;
  errors: Record<string, string>;
  locked: boolean;
};

/** One ordered part and its questions. Kinds are fixed per part: Question Sheet or Written Work. */
export function PartEditor({ index, part, firstNumber, count, onChange, onMove, onRemove, errors, locked }: Props) {
  const prefix = `parts.${index}`;
  const total = part.questions.reduce((sum, question) => sum + (Number(question.maxScore) || 0), 0);
  return (
    <section aria-labelledby={`exam-part-${index}`} className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id={`exam-part-${index}`} className="font-heading font-semibold">Part {index + 1}</h3>
        <Badge variant="secondary" title={KIND_HINTS[part.kind]}>{KIND_LABELS[part.kind]}</Badge>
        <span className="text-xs text-muted-foreground tabular-nums">{formatScore(total.toFixed(2))} marks</span>
        {!locked && (
          <div className="ml-auto flex gap-1">
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Move part up" disabled={index === 0} onClick={() => onMove(-1)}><IconArrowUp /></Button>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Move part down" disabled={index === count - 1} onClick={() => onMove(1)}><IconArrowDown /></Button>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove part ${index + 1}`} onClick={onRemove}><IconTrash /></Button>
          </div>
        )}
      </div>
      <Field data-invalid={Boolean(errors[`${prefix}.title`]) || undefined}>
        <FieldLabel htmlFor={`exam-part-${index}-title`}>Title</FieldLabel>
        <Input id={`exam-part-${index}-title`} value={part.title} disabled={locked} maxLength={200} onChange={(event) => onChange({ ...part, title: event.target.value })} />
        <FieldError>{errors[`${prefix}.title`]}</FieldError>
      </Field>
      <Field>
        <FieldLabel htmlFor={`exam-part-${index}-instructions`}>Instructions <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel>
        <Textarea id={`exam-part-${index}-instructions`} value={part.instructions} disabled={locked} rows={2} maxLength={5000}
          onChange={(event) => onChange({ ...part, instructions: event.target.value })} />
      </Field>
      <div className="flex flex-col gap-3">
        {part.questions.map((question, questionIndex) => (
          <QuestionSlot key={question.id ?? `new-${questionIndex}`} part={part} index={index} questionIndex={questionIndex} number={firstNumber + questionIndex}
            onChange={onChange} error={errors[`${prefix}.questions.${questionIndex}.maxScore`]} locked={locked} />
        ))}
      </div>
      {!locked && part.questions.length < MAX_QUESTIONS_PER_PART && (
        <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => onChange({ ...part, questions: [...part.questions, newQuestion(part.kind)] })}>
          <IconPlus />Add question
        </Button>
      )}
    </section>
  );
}


function QuestionSlot({ part, index, questionIndex, number, onChange, error, locked }: {
  part: FormPart; index: number; questionIndex: number; number: number; onChange: (part: FormPart) => void; error?: string; locked: boolean;
}) {
  return (
    <QuestionEditor id={`exam-${index}-${questionIndex}`} number={number} kind={part.kind} question={part.questions[questionIndex]} error={error} locked={locked}
      onChange={(next) => onChange({ ...part, questions: part.questions.map((entry, position) => position === questionIndex ? next : entry) })}
      onRemove={part.questions.length > 1 ? () => onChange({ ...part, questions: part.questions.filter((_, position) => position !== questionIndex) }) : undefined} />
  );
}
