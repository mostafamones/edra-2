"use client";

import { detachDraft } from "@/components/shared/assessment/authoring";
import { PartsList as SharedPartsList } from "@/components/shared/assessment/parts-list";
import { PART_KINDS } from "../../../types";
import { formMaxScore, MAX_PARTS, newPart, type FormPart } from "../../../validation";
import { PART_KIND_ICONS, PART_KIND_LABELS } from "../../shared/labels";
import { summarizePart } from "./summary";

type Props = { locked: boolean; onEdit: (index: number) => void };

const KINDS = PART_KINDS.map((value) => ({ value, label: PART_KIND_LABELS[value], icon: PART_KIND_ICONS[value] }));

/** A part without stored ids, so it saves as a new part (an autosave may already have removed the original). */
const withoutIds = (part: FormPart): FormPart => detachDraft(part);

/** The assignment's parts as cards; with `locked` (marking started) nothing is added, removed or reordered. */
export function PartsList({ locked, onEdit }: Props) {
  return (
    <SharedPartsList<FormPart> locked={locked} onEdit={onEdit} maxParts={MAX_PARTS} minParts={1} summarize={summarizePart} kinds={KINDS}
      create={(kind, position) => newPart(`Part ${position}`, kind as (typeof PART_KINDS)[number])} detach={withoutIds} total={formMaxScore} />
  );
}
