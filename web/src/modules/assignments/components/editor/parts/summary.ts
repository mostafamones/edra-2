import type { PartSummary } from "@/components/shared/assessment/parts-list";
import { formPartIssues } from "../../../readiness";
import { formPartMax, type FormPart } from "../../../validation";
import { countLabel, PART_KIND_ICONS, PART_KIND_LABELS } from "../../shared/labels";

/** How a part reads in the parts list and on the review step. */
export function summarizePart(part: FormPart, index: number): PartSummary {
  return {
    title: part.title.trim() || `Part ${index + 1}`,
    subtitle: `${PART_KIND_LABELS[part.kind]}${part.kind !== "legacy" ? ` · ${countLabel(part.kind, part.questions.length)}` : ""}`,
    max: formPartMax(part),
    unfinished: formPartIssues(part).length > 0,
    icon: PART_KIND_ICONS[part.kind],
  };
}
