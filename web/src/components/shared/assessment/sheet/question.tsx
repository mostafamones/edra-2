"use client";

import { Controller, useFieldArray, useFormContext, type FieldValues } from "react-hook-form";
import { IconPlus, IconTrash } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type { SheetConfig, SheetKind } from "./types";

type Props = {
  config: SheetConfig;
  partIndex: number;
  index: number;
  /** The question's number across the whole assessment. */
  number: number;
  kind: SheetKind;
  onRemove?: () => void;
  /** Structure locked: only the model answer stays editable. */
  locked: boolean;
};

type QuestionErrors = { prompt?: { message?: string }; maxScore?: { message?: string }; choices?: { message?: string; root?: { message?: string } } } | undefined;

/** One question: prompt, marks, model answer and, on a Question Sheet, choices with one correct answer. */
export function QuestionEditor({ config, partIndex, index, number, kind, onRemove, locked }: Props) {
  const { control, register, setValue, getValues, formState: { errors } } = useFormContext<FieldValues>();
  const path = `parts.${partIndex}.questions.${index}`;
  const id = `${config.noun}-${partIndex}-${index}`;
  const error = (errors.parts as { questions?: QuestionErrors[] }[] | undefined)?.[partIndex]?.questions?.[index];
  const { fields, append, remove } = useFieldArray({ control, name: `${path}.choices`, keyName: "key" });
  const letter = config.choiceLetter;

  function removeChoice(position: number) {
    const correct = getValues(`${path}.correct`) as number;
    remove(position);
    setValue(`${path}.correct`, correct === position ? -1 : correct > position ? correct - 1 : correct, { shouldDirty: true });
  }

  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <legend className="font-medium">Question {number}</legend>
        {onRemove && !locked && (
          <Button type="button" variant="ghost" size="icon-sm" className="ml-auto" aria-label={`Remove question ${number}`} onClick={onRemove}><IconTrash /></Button>
        )}
      </div>
      <Field>
        <FieldLabel htmlFor={`${id}-prompt`}>Question text <span className="font-normal text-muted-foreground">(optional for paper {config.noun}s)</span></FieldLabel>
        <Textarea id={`${id}-prompt`} rows={2} maxLength={5000} readOnly={locked} {...register(`${path}.prompt`)} />
      </Field>
      <Field data-invalid={Boolean(error?.maxScore) || undefined} className="max-w-40">
        <FieldLabel htmlFor={`${id}-max`}>Marks</FieldLabel>
        <Input id={`${id}-max`} inputMode="decimal" readOnly={locked} aria-invalid={Boolean(error?.maxScore) || undefined} {...register(`${path}.maxScore`)} />
        <FieldError>{error?.maxScore?.message}</FieldError>
      </Field>
      {kind === "question_sheet" && (
        <Field>
          <FieldLabel>Choices <span className="font-normal text-muted-foreground">(select the correct answer)</span></FieldLabel>
          <Controller
            control={control}
            name={`${path}.correct`}
            render={({ field }) => (
              <RadioGroup value={field.value >= 0 ? String(field.value) : ""} disabled={locked}
                onValueChange={(value) => field.onChange(Number(value))} aria-label={`Correct answer for question ${number}`}>
                {fields.map((choice, position) => (
                  <div key={choice.key} className="flex items-center gap-2">
                    <RadioGroupItem value={String(position)} id={`${id}-correct-${position}`} aria-label={`Choice ${letter(position + 1)} is correct`} />
                    <span className="w-5 text-sm font-medium text-muted-foreground">{letter(position + 1)}</span>
                    <Input aria-label={`Choice ${letter(position + 1)} text`} maxLength={1000} readOnly={locked} {...register(`${path}.choices.${position}.label`)} />
                    {!locked && fields.length > 2 && (
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove choice ${letter(position + 1)}`} onClick={() => removeChoice(position)}><IconTrash /></Button>
                    )}
                  </div>
                ))}
              </RadioGroup>
            )}
          />
          <FieldError>{error?.choices?.message ?? error?.choices?.root?.message}</FieldError>
          {!locked && fields.length < config.maxChoices && (
            <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => append({ label: letter(fields.length + 1) })}><IconPlus />Add choice</Button>
          )}
        </Field>
      )}
      <Field>
        <FieldLabel htmlFor={`${id}-model`}>Model answer <span className="font-normal text-muted-foreground">(staff only until solutions release)</span></FieldLabel>
        <Textarea id={`${id}-model`} rows={2} maxLength={10000} {...register(`${path}.modelAnswer`)} />
      </Field>
    </fieldset>
  );
}
