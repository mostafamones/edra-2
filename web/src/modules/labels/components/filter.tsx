"use client";

import { FieldLegend, FieldSet } from "@/components/ui/field";
import { Toggle } from "@/components/ui/toggle";
import type { Label } from "../types";
import { LabelSwatch } from "./badge";

export type LabelSelection = { labels: string[]; unlabeled: boolean };
const TOGGLE = "h-6 min-w-0 max-w-40 gap-1.5 rounded-sm bg-muted/60 px-2 text-xs font-normal text-muted-foreground aria-pressed:bg-primary/15 aria-pressed:text-foreground aria-pressed:hover:bg-primary/20";
type Props = LabelSelection & { options: readonly Label[]; onChange: (selection: LabelSelection) => void };

/** Label selection for a filter panel: any of the pressed labels, or Unlabeled instead of them. */
export function LabelFilter({ options, labels, unlabeled, onChange }: Props) {
  const toggle = (id: string, checked: boolean) =>
    onChange({ labels: checked ? [...labels, id] : labels.filter((item) => item !== id), unlabeled: false });
  return (
    <FieldSet className="gap-2">
      <FieldLegend variant="label" className="mb-0 text-xs text-muted-foreground">Labels</FieldLegend>
      <div className="flex max-h-48 flex-wrap gap-1 overflow-y-auto">
        {options.map((label) => (
          <Toggle key={label.id} size="sm" className={TOGGLE} pressed={labels.includes(label.id)} onPressedChange={(pressed) => toggle(label.id, pressed)}>
            <LabelSwatch color={label.color} className="size-1.5" /><span className="truncate">{label.name}</span>
          </Toggle>
        ))}
        <Toggle size="sm" className={TOGGLE} pressed={unlabeled} onPressedChange={(pressed) => onChange({ labels: [], unlabeled: pressed })}>Unlabeled</Toggle>
      </div>
    </FieldSet>
  );
}
