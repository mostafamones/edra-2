"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import type { Label } from "../types";
import { LabelSwatch } from "./badge";

export type LabelSelection = { labels: string[]; unlabeled: boolean };
type Props = LabelSelection & { options: readonly Label[]; onChange: (selection: LabelSelection) => void };

/** Label selection for a filter panel: any of the checked labels, or Unlabeled instead of them. */
export function LabelFilter({ options, labels, unlabeled, onChange }: Props) {
  const toggle = (id: string, checked: boolean) =>
    onChange({ labels: checked ? [...labels, id] : labels.filter((item) => item !== id), unlabeled: false });
  return (
    <FieldSet className="gap-2">
      <FieldLegend variant="label" className="mb-0 text-xs text-muted-foreground">Labels</FieldLegend>
      <div className="flex max-h-48 flex-col gap-2 overflow-y-auto">
        {options.map((label) => (
          <Field key={label.id} orientation="horizontal" className="gap-2">
            <Checkbox id={`label-filter-${label.id}`} checked={labels.includes(label.id)} onCheckedChange={(checked) => toggle(label.id, checked === true)} />
            <FieldLabel htmlFor={`label-filter-${label.id}`} className="min-w-0 gap-2 font-normal">
              <LabelSwatch color={label.color} /><span className="truncate">{label.name}</span>
            </FieldLabel>
          </Field>
        ))}
        <Field orientation="horizontal" className="gap-2">
          <Checkbox id="label-filter-none" checked={unlabeled} onCheckedChange={(checked) => onChange({ labels: [], unlabeled: checked === true })} />
          <FieldLabel htmlFor="label-filter-none" className="font-normal">Unlabeled</FieldLabel>
        </Field>
      </div>
    </FieldSet>
  );
}
