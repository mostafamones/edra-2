"use client";

import { useState, type ReactNode } from "react";
import { useFormContext, type FieldValues } from "react-hook-form";
import { IconArrowLeft, IconChevronDown, IconChevronLeft, IconChevronRight, IconX } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  index: number;
  count: number;
  onSelect: (index: number) => void;
  onClose: () => void;
  /** Title and instructions become read-only. */
  locked?: boolean;
  /** The part-type control, shown beside the title. */
  type: ReactNode;
  /** Extra controls at the top of the advanced options, above the instructions. */
  advanced?: ReactNode;
  children: ReactNode;
};

type PartErrors = { title?: { message?: string }; instructions?: { message?: string } } | undefined;

/** The page one part is edited on: navigation, title, type and advanced options, then the part's own content. */
export function PartFrame({ index, count, onSelect, onClose, locked, type, advanced, children }: Props) {
  const { register, formState: { errors } } = useFormContext<FieldValues>();
  const [open, setOpen] = useState(false);
  const error = (errors.parts as PartErrors[] | undefined)?.[index];

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" size="sm" className="-ml-2.5" onClick={onClose}><IconArrowLeft />All parts</Button>
        <div className="flex items-center gap-1">
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="mr-2 text-muted-foreground">
              Advanced
              <IconChevronDown aria-hidden="true" data-icon="inline-end" className={open ? "rotate-180 transition-transform" : "transition-transform"} />
            </Button>
          </CollapsibleTrigger>
          <span className="mr-1 text-sm text-muted-foreground tabular-nums">Part {index + 1} of {count}</span>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Previous part" disabled={index === 0} onClick={() => onSelect(index - 1)}><IconChevronLeft /></Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Next part" disabled={index === count - 1} onClick={() => onSelect(index + 1)}><IconChevronRight /></Button>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start gap-4">
          <Field data-invalid={Boolean(error?.title) || undefined} className="min-w-48 flex-1">
            <FieldLabel htmlFor="part-title">Part title</FieldLabel>
            <Input id="part-title" maxLength={200} placeholder={`Part ${index + 1}`}
              readOnly={locked} {...register(`parts.${index}.title`)} aria-invalid={Boolean(error?.title) || undefined} />
            <FieldError>{error?.title?.message}</FieldError>
          </Field>
          {type}
        </div>
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
          <div className="relative flex flex-col gap-4 rounded-lg border bg-muted/20 p-4">
            <CollapsibleTrigger asChild>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Close advanced options" className="absolute top-2 right-2 text-muted-foreground! bg-transparent! hover:text-foreground! hover:bg-accent!"><IconX /></Button>
            </CollapsibleTrigger>
            {advanced}
            <Field data-invalid={Boolean(error?.instructions) || undefined}>
              <FieldLabel htmlFor="part-instructions">Instructions</FieldLabel>
              <Textarea id="part-instructions" rows={3} maxLength={5000} readOnly={locked} {...register(`parts.${index}.instructions`)} />
              <FieldError>{error?.instructions?.message}</FieldError>
            </Field>
          </div>
        </CollapsibleContent>
      </div>

      {children}
    </Collapsible>
  );
}
