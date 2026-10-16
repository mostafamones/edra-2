"use client";

import { useFieldArray, useFormContext, useWatch, type FieldValues } from "react-hook-form";
import { IconPlus } from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { formatScore } from "@/lib/score";
import { PartFrame } from "../part-frame";
import { QuestionEditor } from "./question";
import { sheetPartMax, type SheetConfig, type SheetValues } from "./types";

type Props = {
  config: SheetConfig;
  index: number;
  /** Parts, questions, choices and marks are read-only once answers or marks exist. */
  locked: boolean;
  onSelect: (index: number) => void;
  onClose: () => void;
};

/** One part of a quiz or exam, edited on its own page: its questions with choices, marks and model answers. */
export function SheetPartEditor({ config, index, locked, onSelect, onClose }: Props) {
  const { control, formState: { errors } } = useFormContext<FieldValues>();
  const parts = (useWatch({ control, name: "parts" }) ?? []) as SheetValues["parts"];
  const { fields, append, remove } = useFieldArray({ control, name: `parts.${index}.questions`, keyName: "key" });
  const part = parts[index];
  if (!part) return null;
  const max = sheetPartMax(part);
  // Question numbers run across the assessment: each part starts after the questions of the parts before it.
  const first = 1 + parts.slice(0, index).reduce((sum, previous) => sum + previous.questions.length, 0);
  const partErrors = (errors.parts as { questions?: { message?: string; root?: { message?: string } } }[] | undefined)?.[index];

  return (
    <PartFrame index={index} count={parts.length} onSelect={onSelect} onClose={onClose} locked={locked}
      type={(
        <Field className="w-auto">
          <FieldLabel>Type</FieldLabel>
          <Badge variant="outline" className="h-9" title={config.kindHints[part.kind]}>{config.kindLabels[part.kind]}</Badge>
        </Field>
      )}>
      <div className="flex flex-col gap-3">
        {fields.map((field, position) => (
          <QuestionEditor key={field.key} config={config} partIndex={index} index={position} number={first + position} kind={part.kind} locked={locked}
            onRemove={fields.length > 1 ? () => remove(position) : undefined} />
        ))}
        <FieldError>{partErrors?.questions?.message ?? partErrors?.questions?.root?.message}</FieldError>
      </div>
      <div className="flex items-center justify-between gap-3">
        {!locked && fields.length < config.maxQuestionsPerPart
          ? <Button type="button" variant="outline" size="sm" onClick={() => append(config.newQuestion(part.kind))}><IconPlus />Add question</Button>
          : <span />}
        <p className="text-right text-sm">
          Part total <span className="font-semibold tabular-nums">{max === null ? "—" : formatScore(max)}</span> marks
        </p>
      </div>
    </PartFrame>
  );
}
