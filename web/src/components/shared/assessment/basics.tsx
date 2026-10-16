"use client";

import type { ReactNode } from "react";
import { useFormContext } from "react-hook-form";

import { Field, FieldError, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

type BasicsValues = { title: string; instructions: string };

/** A labelled rule that splits the basics step into sections. */
export function SectionDivider({ label }: { label: string }) {
  return (
    <div role="separator" aria-label={label} className="mx-auto flex w-[70%] items-center gap-3">
      <Separator className="flex-1" />
      <span className="text-sm text-muted-foreground">{label}</span>
      <Separator className="flex-1" />
    </div>
  );
}

type Props = {
  /** Prefix of the field ids, such as "quiz". */
  idPrefix: string;
  titlePlaceholder: string;
  /** Sits beside the title, such as a due date. */
  aside?: ReactNode;
  /** Further sections below the details, each introduced by a divider. */
  sections: { label: string; content: ReactNode }[];
};

/** The first step: title, instructions, then the noun-specific sections (audience, timer, solutions…). */
export function BasicsStep({ idPrefix, titlePlaceholder, aside, sections }: Props) {
  const { register, formState: { errors } } = useFormContext<BasicsValues>();
  const titleError = errors.title?.message;
  return (
    <div className="flex flex-col gap-8">
      <FieldSet className="gap-5">
        <FieldGroup className="gap-5">
          <div className={aside ? "grid grid-cols-[3fr_2fr] gap-4" : undefined}>
            <Field data-invalid={Boolean(titleError) || undefined}>
              <FieldLabel htmlFor={`${idPrefix}-title`}>Title</FieldLabel>
              <Input id={`${idPrefix}-title`} maxLength={200} placeholder={titlePlaceholder} {...register("title")} aria-invalid={Boolean(titleError) || undefined} />
              <FieldError>{titleError}</FieldError>
            </Field>
            {aside}
          </div>
          <Field data-invalid={Boolean(errors.instructions) || undefined}>
            <FieldLabel htmlFor={`${idPrefix}-instructions`}>Instructions<span className="text-muted-foreground">(optional)</span></FieldLabel>
            <Textarea id={`${idPrefix}-instructions`} rows={6} maxLength={10000} {...register("instructions")} />
            <FieldError>{errors.instructions?.message}</FieldError>
          </Field>
        </FieldGroup>
      </FieldSet>
      {sections.map((section) => (
        <div key={section.label} className="flex flex-col gap-8">
          <SectionDivider label={section.label} />
          <FieldSet className="gap-4">{section.content}</FieldSet>
        </div>
      ))}
    </div>
  );
}
