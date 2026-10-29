"use client";

import { forwardRef, type ComponentProps } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { cn } from "cn";

import type { AssessmentListParams } from "../params";
import { TYPE_PLURALS, type AssessmentRow, type AssessmentType } from "../types";
import { statusLabel, TYPE_ICONS } from "./facts";

export type RowGroup = { key: string; type?: AssessmentType; status?: string; rows: AssessmentRow[] };

/**
 * Rows by group, in order of first appearance. The database orders each group together, but while a
 * new grouping loads the previous results are still shown, so rows of one group need not be adjacent.
 * Without grouping there is one unnamed group.
 */
export function groupRows(rows: AssessmentRow[], group: AssessmentListParams["group"]): RowGroup[] {
  if (group === "none") return [{ key: "all", rows }];
  const groups = new Map<string, RowGroup>();
  for (const row of rows) {
    const { type, status } = row.item;
    const key = group === "type" ? type : status;
    const existing = groups.get(key);
    if (existing) existing.rows.push(row);
    else groups.set(key, { key, type, status: group === "status" ? status : undefined, rows: [row] });
  }
  return [...groups.values()];
}

/** "Quizzes", or a status word shared by every type in the group ("Closed"). */
export function GroupHeading({ group }: { group: RowGroup }) {
  if (!group.type) return null;
  return (
    <span className="flex items-center gap-2 text-sm font-medium">
      {!group.status && <HugeiconsIcon icon={TYPE_ICONS[group.type]} strokeWidth={1.5} className="size-4 text-muted-foreground" aria-hidden="true" />}
      {group.status ? statusLabel(group.type, group.status) : TYPE_PLURALS[group.type]}
    </span>
  );
}

/** The heading as a button that shows or hides the group; also used as a Collapsible trigger. */
export const GroupToggle = forwardRef<HTMLButtonElement, ComponentProps<"button"> & { group: RowGroup; open: boolean }>(
  function GroupToggle({ group, open, className, ...props }, ref) {
    return (
      <button ref={ref} type="button" aria-expanded={open} {...props}
        className={cn("flex items-center gap-1.5 rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50", className)}>
        <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={1.5} aria-hidden="true"
          className={cn("size-4 text-muted-foreground transition-transform motion-reduce:transition-none", !open && "-rotate-90")} />
        <GroupHeading group={group} />
      </button>
    );
  },
);
