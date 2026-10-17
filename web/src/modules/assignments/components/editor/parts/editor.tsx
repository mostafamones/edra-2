"use client";

import { useFormContext, useWatch } from "react-hook-form";

import { PartFrame } from "@/components/shared/assessment/part-frame";
import { PartEditor as SharedPartEditor, type PartStash } from "@/components/shared/assessment/parts/editor";
import { Badge } from "@/components/ui/badge";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatScore } from "../../../score";
import { formPartMax, type AssignmentFormValues } from "../../../validation";
import { PART_KIND_LABELS } from "../../shared/labels";
import { ASSIGNMENT_PARTS } from "./config";
import { JsonImport } from "./import";

export type { PartStash };

type Props = { locked: boolean; index: number; stash: PartStash; onSelect: (index: number) => void; onClose: () => void };

/** One part, edited on its own page. A legacy part only takes a maximum mark; every other part uses the shared editor. */
export function PartEditor({ locked, index, stash, onSelect, onClose }: Props) {
  const { control } = useFormContext<AssignmentFormValues>();
  const kind = useWatch({ control, name: `parts.${index}.kind` });
  if (kind === "legacy") return <LegacyPart locked={locked} index={index} onSelect={onSelect} onClose={onClose} />;
  return (
    <SharedPartEditor config={ASSIGNMENT_PARTS} locked={locked} index={index} stash={stash} onSelect={onSelect} onClose={onClose}
      tools={({ kind: value, setQuestions }) => (value === "online_questions" && process.env.NODE_ENV !== "production"
        ? <JsonImport onImport={(questions) => setQuestions(questions)} /> : null)} />
  );
}

function LegacyPart({ locked, index, onSelect, onClose }: Omit<Props, "stash">) {
  const { control, register, formState: { errors } } = useFormContext<AssignmentFormValues>();
  const parts = useWatch({ control, name: "parts" }) ?? [];
  const part = parts[index];
  if (!part) return null;
  const error = errors.parts?.[index];
  const max = formPartMax(part);
  return (
    <PartFrame index={index} count={parts.length} onSelect={onSelect} onClose={onClose}
      type={(
        <Field className="w-auto">
          <FieldLabel>Type</FieldLabel>
          <Badge variant="outline" className="h-9">{PART_KIND_LABELS.legacy}</Badge>
        </Field>
      )}>
      <Field data-invalid={Boolean(error?.maxScore) || undefined} className="sm:max-w-48">
        <FieldLabel htmlFor="part-max">Maximum mark</FieldLabel>
        <Input id="part-max" inputMode="decimal" autoComplete="off" readOnly={locked}
          {...register(`parts.${index}.maxScore`)} aria-invalid={Boolean(error?.maxScore) || undefined} />
        <FieldError>{error?.maxScore?.message}</FieldError>
      </Field>
      <p className="text-right text-sm">
        Part total <span className="font-semibold tabular-nums">{max === null ? "—" : formatScore(max)}</span> marks
      </p>
    </PartFrame>
  );
}
