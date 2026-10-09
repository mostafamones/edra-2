"use client";

import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { IconArrowDown, IconArrowUp, IconChevronRight, IconCopy, IconDots, IconTrash } from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FieldError } from "@/components/ui/field";
import { formPartIssues } from "../../../readiness";
import { formatScore } from "../../../score";
import { PART_KINDS } from "../../../types";
import { formMaxScore, formPartMax, MAX_PARTS, newPart, type AssignmentFormValues, type FormPart } from "../../../validation";
import { countLabel, PART_KIND_ICONS, PART_KIND_LABELS } from "../../shared/labels";

type Props = { locked: boolean; onEdit: (index: number) => void };

/** A part without stored ids, so it saves as a new part (an autosave may already have removed the original). */
const withoutIds = (part: FormPart): FormPart => ({
  title: part.title, instructions: part.instructions, kind: part.kind, maxScore: part.maxScore,
  questions: part.questions.map((question) => ({
    prompt: question.prompt, maxScore: question.maxScore,
    choices: question.choices.map((choice) => ({ label: choice.label, isCorrect: choice.isCorrect })),
  })),
});

/**
 * The parts of the assignment as cards; opening one edits it. New parts are added by type and open
 * straight away. With `locked` (published) nothing is added, removed or reordered.
 */
export function PartsList({ locked, onEdit }: Props) {
  const { control, formState: { errors } } = useFormContext<AssignmentFormValues>();
  const { fields, append, insert, remove, move } = useFieldArray({ control, name: "parts", keyName: "key" });
  const parts = useWatch({ control, name: "parts" }) ?? [];
  const total = formMaxScore(parts);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-muted-foreground">{fields.length} {fields.length === 1 ? "part" : "parts"}</p>
        <p className="text-sm text-muted-foreground">
          Total <span className="text-base font-semibold text-foreground tabular-nums">{total === null ? "—" : formatScore(total)}</span> marks
        </p>
      </div>

      <ol className="flex flex-col gap-2">
        {fields.map((field, index) => {
          const part = parts[index];
          if (!part) return null;
          const max = formPartMax(part);
          const unfinished = formPartIssues(part).length > 0;
          const Icon = PART_KIND_ICONS[part.kind];
          return (
            <li key={field.key}>
              <Card className="group relative flex-row items-center gap-4 p-3 pr-2 transition-colors hover:bg-muted/40 has-[[data-part-link]:focus-visible]:ring-3 has-[[data-part-link]:focus-visible]:ring-ring/50">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <button type="button" data-part-link onClick={() => onEdit(index)}
                  className="flex min-w-0 flex-1 flex-col items-start text-left outline-none after:absolute after:inset-0 after:rounded-xl">
                  <span className="flex w-full min-w-0 items-center gap-2">
                    <span className="truncate font-medium">{part.title.trim() || `Part ${index + 1}`}</span>
                    {unfinished && <Badge variant="outline" className="shrink-0 border-destructive/40 text-destructive">Unfinished</Badge>}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {PART_KIND_LABELS[part.kind]}{part.kind !== "legacy" && ` · ${countLabel(part.kind, part.questions.length)}`}
                  </span>
                </button>
                <span className="shrink-0 text-right">
                  <span className="block font-semibold tabular-nums">{max === null ? "—" : formatScore(max)}</span>
                  <span className="block text-xs text-muted-foreground">marks</span>
                </span>
                {!locked && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="ghost" size="icon-sm" className="relative z-10" aria-label={`Actions for part ${index + 1}`}><IconDots /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem disabled={index === 0} onSelect={() => move(index, index - 1)}><IconArrowUp />Move up</DropdownMenuItem>
                      <DropdownMenuItem disabled={index === fields.length - 1} onSelect={() => move(index, index + 1)}><IconArrowDown />Move down</DropdownMenuItem>
                      <DropdownMenuItem disabled={fields.length >= MAX_PARTS} onSelect={() => insert(index + 1, { ...withoutIds(part), title: `${part.title} (copy)`.slice(0, 200) })}><IconCopy />Duplicate</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" disabled={fields.length === 1} onSelect={() => {
                        remove(index);
                        toast(`${part.title.trim() || `Part ${index + 1}`} removed`, { action: { label: "Undo", onClick: () => insert(index, withoutIds(part)) } });
                      }}><IconTrash />Remove</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <IconChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Card>
            </li>
          );
        })}
      </ol>
      <FieldError>{errors.parts?.message ?? errors.parts?.root?.message}</FieldError>

      {!locked && fields.length < MAX_PARTS && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">Add a part</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {PART_KINDS.map((kind) => {
              const Icon = PART_KIND_ICONS[kind];
              return (
                <Button key={kind} type="button" variant="outline" className="h-auto flex-col gap-2 border-dashed py-4"
                  onClick={() => { append(newPart(`Part ${fields.length + 1}`, kind)); onEdit(fields.length); }}>
                  <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
                  {PART_KIND_LABELS[kind]}
                </Button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
