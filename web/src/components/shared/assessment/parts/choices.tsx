"use client";

import type { ReactNode } from "react";
import { Controller, useFieldArray, useFormContext, useWatch, type FieldValues } from "react-hook-form";
import { IconPlus, IconX } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { PlainTextField } from "./text";
import type { EditorChoice, PartsConfig } from "./config";

const letter = (index: number) => String.fromCharCode(65 + index);
const REMOVE_CLASS = "text-destructive hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20";

type Props = { config: PartsConfig; partIndex: number; questionIndex: number; room: number; readOnly?: boolean; trailing?: ReactNode };

/** A question's choices: a letter square per choice (green is correct) beside its text. */
export function ChoicesEditor({ config, partIndex, questionIndex, room, readOnly, trailing }: Props) {
  const { control, setValue } = useFormContext<FieldValues>();
  const name = `parts.${partIndex}.questions.${questionIndex}.choices`;
  const { fields, append, remove } = useFieldArray({ control, name, keyName: "key" });
  const choices = (useWatch({ control, name }) ?? []) as EditorChoice[];
  const Text = config.TextField ?? PlainTextField;

  function select(chosen: number) {
    choices.forEach((_, index) => setValue(`${name}.${index}.isCorrect`, index === chosen, { shouldDirty: true }));
  }

  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" aria-label={`Correct choice for question ${questionIndex + 1}`} className="flex flex-col gap-2">
        {fields.map((field, index) => {
          const selected = choices[index]?.isCorrect === true;
          return (
            <div key={field.key} className="group/choice flex items-center gap-2">
              <Button type="button" role="radio" aria-checked={selected} aria-label={`Choice ${letter(index)} is correct`} disabled={readOnly}
                variant={selected ? "default" : "outline"} size="icon" className="shrink-0 font-semibold disabled:opacity-100" onClick={() => select(index)}>
                {letter(index)}
              </Button>
              <div className="relative flex-1">
                <Controller control={control} name={`${name}.${index}.label`}
                  render={({ field: label }) => (
                    <Text room={room} readOnly={readOnly} placeholder={`Choice ${letter(index)}`} aria-label={`Choice ${letter(index)} text`}
                      className={`pr-9 ${selected ? "border-primary/60" : ""}`} value={label.value} onChange={label.onChange} onBlur={label.onBlur} />
                  )} />
                {!readOnly && (
                  <Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove choice ${letter(index)}`} disabled={fields.length <= 2}
                    className={`${REMOVE_CLASS} absolute top-1/2 right-1.5 -translate-y-1/2 opacity-0 transition-opacity group-hover/choice:opacity-100 focus-visible:opacity-100`} onClick={() => remove(index)}>
                    <IconX />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        {!readOnly ? (
          <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" disabled={fields.length >= config.maxChoices}
            onClick={() => append(config.newChoice(fields.length))}>
            <IconPlus />Add choice
          </Button>
        ) : <span />}
        {trailing}
      </div>
    </div>
  );
}
