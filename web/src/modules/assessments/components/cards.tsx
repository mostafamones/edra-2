"use client";

import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";

import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatScore } from "@/lib/score";
import { itemKey, TYPE_LABELS } from "../types";
import { AssessmentDate, AssessmentStatus, AudienceLine, MarkedCount, PartsSummary, TYPE_ICONS } from "./facts";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { GroupToggle, type RowGroup } from "./groups";

/** Card view of the same rows, in the same order, as the table. Each card opens its workspace. */
type Props = { groups: RowGroup[]; collapsed: ReadonlySet<string>; onToggle: (key: string) => void };

export function AssessmentCards({ groups, collapsed, onToggle }: Props) {
  if (!groups[0]?.type) return <Cards rows={groups[0]?.rows ?? []} />;
  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => {
        const open = !collapsed.has(group.key);
        return (
          <Collapsible key={group.key} open={open} onOpenChange={() => onToggle(group.key)} className="flex flex-col gap-2">
            <h2><CollapsibleTrigger asChild><GroupToggle group={group} open={open} /></CollapsibleTrigger></h2>
            <CollapsibleContent><Cards rows={group.rows} /></CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}

function Cards({ rows }: { rows: RowGroup["rows"] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map(({ item, href, audience }) => (
        <li key={itemKey(item)} className="min-w-0">
          {/* Same stretched-link pattern as the existing assessment cards: the whole card is one target. */}
          <Card size="sm" className="relative h-full gap-0 rounded-lg py-0 ring-0 transition-colors focus-within:ring-3 focus-within:ring-ring/50 hover:bg-muted/30">
            <div className="flex items-start gap-3 p-4">
              <Tooltip delayDuration={500}>
                {/* Above the stretched link so it can be hovered. */}
                <TooltipTrigger asChild>
                  <span className="relative z-10 flex size-10 shrink-0 cursor-default items-center justify-center rounded-lg bg-muted text-foreground">
                    <HugeiconsIcon icon={TYPE_ICONS[item.type]} strokeWidth={1.5} className="size-5" aria-hidden="true" />
                    <span className="sr-only">{TYPE_LABELS[item.type]}</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent>{TYPE_LABELS[item.type]}</TooltipContent>
              </Tooltip>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <Link href={href} className="block truncate font-medium text-foreground outline-none after:absolute after:inset-0 after:rounded-lg">{item.title}</Link>
                <AudienceLine audience={item.audience} name={audience} />
              </div>
              <AssessmentStatus item={item} />
            </div>
            <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/70 px-4 py-2.5 text-xs text-muted-foreground">
              <PartsSummary item={item} />
              <span><MarkedCount item={item} /> marked</span>
              <span className="tabular-nums">{formatScore(item.maxScore)} marks</span>
            </div>
            <div className="border-t border-border/70 px-4 py-2.5 text-xs text-muted-foreground">
              <AssessmentDate item={item} />
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}
