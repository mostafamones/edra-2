"use client";

import { ToggleBadge } from "@/components/shared/toggle-badge";
import { FieldLegend, FieldSet } from "@/components/ui/field";
import type { Label } from "../types";
import { LabelSwatch } from "./badge";

export type LabelSelection = { labels: string[]; unlabeled: boolean };
type Props = LabelSelection & { options: readonly Label[]; onChange: (selection: LabelSelection) => void };

/** Label selection for a filter panel: any of the pressed labels, or Unlabeled instead of them. */
export function LabelFilter({ options, labels, unlabeled, onChange }: Props) {
  const toggle = (id: string, checked: boolean) =>
    onChange({ labels: checked ? [...labels, id] : labels.filter((item) => item !== id), unlabeled: false });
  return (
    <FieldSet className="gap-2">
      <FieldLegend variant="label" className="mb-2 text-xs text-muted-foreground">Labels</FieldLegend>
      <div className="flex max-h-48 flex-wrap gap-1 overflow-y-auto">
        {options.map((label) => (
          <ToggleBadge key={label.id} pressed={labels.includes(label.id)} onPressedChange={(pressed) => toggle(label.id, pressed)}>
            <LabelSwatch color={label.color} className="size-1.5" /><span className="truncate">{label.name}</span>
          </ToggleBadge>
        ))}
        <ToggleBadge pressed={unlabeled} onPressedChange={(pressed) => onChange({ labels: [], unlabeled: pressed })}>Unlabeled</ToggleBadge>
      </div>
    </FieldSet>
  );
}
