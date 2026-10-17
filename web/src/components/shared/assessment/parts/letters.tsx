"use client";

import type { KeyboardEvent } from "react";
import { useFieldArray, useFormContext, useWatch, type FieldValues } from "react-hook-form";
import { IconPlus, IconX } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import type { EditorChoice, PartsConfig } from "./config";

const letter = (index: number) => String.fromCharCode(65 + index);

/** An answer-sheet entry: one square per choice letter; the green one is the correct answer. Typing a letter picks it. */
export function LetterBoxes({ config, partIndex, questionIndex }: { config: PartsConfig; partIndex: number; questionIndex: number }) {
  const { control, setValue } = useFormContext<FieldValues>();
  const name = `parts.${partIndex}.questions.${questionIndex}.choices`;
  const { fields, append, remove } = useFieldArray({ control, name, keyName: "key" });
  const choices = (useWatch({ control, name }) ?? []) as EditorChoice[];

  function select(chosen: number) {
    choices.forEach((_, index) => setValue(`${name}.${index}.isCorrect`, index === chosen, { shouldDirty: true }));
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.metaKey || event.ctrlKey || event.altKey || event.key.length !== 1) return;
    const chosen = event.key.toUpperCase().charCodeAt(0) - 65;
    if (chosen < 0 || chosen >= fields.length) return;
    event.preventDefault();
    select(chosen);
    event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=radio]")[chosen]?.focus();
  }

  return (
    <div role="radiogroup" aria-label={`Correct choice for entry ${questionIndex + 1}`} onKeyDown={onKeyDown} className="flex items-center gap-1.5">
      {fields.map((field, index) => {
        const selected = choices[index]?.isCorrect === true;
        return (
          <div key={field.key} className="group/letter relative">
            <Button type="button" role="radio" aria-checked={selected} variant={selected ? "default" : "outline"} size="icon"
              className="font-semibold" onClick={() => select(index)}>
              {letter(index)}
            </Button>
            {fields.length > 2 && (
              <Button type="button" variant="secondary" size="icon-xs" aria-label={`Remove choice ${letter(index)}`}
                className="absolute -top-1.5 -right-1.5 size-4 rounded-full opacity-0 shadow-sm transition-opacity group-hover/letter:opacity-100 focus-visible:opacity-100 [&_svg]:size-2.5!"
                onClick={() => remove(index)}>
                <IconX />
              </Button>
            )}
          </div>
        );
      })}
      {fields.length < config.maxChoices && (
        <Button type="button" variant="ghost" size="icon" aria-label="Add choice"
          className="text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100"
          onClick={() => append(config.newChoice(fields.length))}>
          <IconPlus />
        </Button>
      )}
    </div>
  );
}
