"use client";

import { useFieldArray, useFormContext, useWatch, type FieldValues } from "react-hook-form";
import { toast } from "sonner";
import { IconArrowDown, IconArrowUp, IconChevronRight, IconCopy, IconDots, IconTrash, type Icon } from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FieldError } from "@/components/ui/field";
import { formatScore } from "@/lib/score";

/** How one part is summarised in a list: the card on the parts step and the row on the review step. */
export type PartSummary = { title: string; subtitle: string; max: string | null; unfinished: boolean; icon: Icon };

type Props<P> = {
  locked: boolean;
  onEdit: (index: number) => void;
  maxParts: number;
  /** The fewest parts that may remain; removing is disabled at this count. */
  minParts: number;
  summarize: (part: P, index: number) => PartSummary;
  /** The part types an author can add, each as a button. */
  kinds: { value: string; label: string; icon: Icon }[];
  create: (kind: string, position: number) => P;
  /** A copy without stored ids, so it saves as a new part (an autosave may already have removed the original). */
  detach: (part: P) => P;
  total: (parts: P[]) => string | null;
};

/**
 * The parts of an assessment as cards; opening one edits it. New parts are added by type and open
 * straight away. With `locked` nothing is added, removed or reordered.
 */
export function PartsList<P extends { title: string }>(props: Props<P>) {
  const { locked, onEdit, maxParts, minParts, summarize, kinds, create, detach, total } = props;
  const { control, formState: { errors } } = useFormContext<FieldValues>();
  const { fields, append, insert, remove, move } = useFieldArray({ control, name: "parts", keyName: "key" });
  const parts = (useWatch({ control, name: "parts" }) ?? []) as P[];
  const sum = total(parts);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-muted-foreground">{fields.length} {fields.length === 1 ? "part" : "parts"}</p>
        <p className="text-sm text-muted-foreground">
          Total <span className="text-base font-semibold text-foreground tabular-nums">{sum === null ? "—" : formatScore(sum)}</span> marks
        </p>
      </div>

      <ol className="flex flex-col gap-2">
        {fields.map((field, index) => {
          const part = parts[index];
          if (!part) return null;
          const { title, subtitle, max, unfinished, icon: PartIcon } = summarize(part, index);
          return (
            <li key={field.key}>
              <Card className="group relative flex-row items-center gap-4 p-3 pr-2 transition-colors hover:bg-muted/40 has-[[data-part-link]:focus-visible]:ring-3 has-[[data-part-link]:focus-visible]:ring-ring/50">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <PartIcon className="size-5" aria-hidden="true" />
                </span>
                <button type="button" data-part-link onClick={() => onEdit(index)}
                  className="flex min-w-0 flex-1 flex-col items-start text-left outline-none after:absolute after:inset-0 after:rounded-xl">
                  <span className="flex w-full min-w-0 items-center gap-2">
                    <span className="truncate font-medium">{title}</span>
                    {unfinished && <Badge variant="outline" className="shrink-0 border-destructive/40 text-destructive">Unfinished</Badge>}
                  </span>
                  <span className="text-sm text-muted-foreground">{subtitle}</span>
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
                      <DropdownMenuItem disabled={fields.length >= maxParts} onSelect={() => insert(index + 1, { ...detach(part), title: `${part.title} (copy)`.slice(0, 200) })}><IconCopy />Duplicate</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" disabled={fields.length <= minParts} onSelect={() => {
                        remove(index);
                        toast(`${title} removed`, { action: { label: "Undo", onClick: () => insert(index, detach(part)) } });
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
      <FieldError>{(errors.parts?.message ?? errors.parts?.root?.message) as string | undefined}</FieldError>

      {!locked && fields.length < maxParts && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">Add a part</p>
          <div className={kinds.length > 2 ? "grid gap-2 sm:grid-cols-3" : "grid gap-2 sm:grid-cols-2"}>
            {kinds.map((kind) => (
              <Button key={kind.value} type="button" variant="outline" className="h-auto flex-col gap-2 border-dashed py-4"
                onClick={() => { append(create(kind.value, fields.length + 1)); onEdit(fields.length); }}>
                <kind.icon className="size-5 text-muted-foreground" aria-hidden="true" />
                {kind.label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
