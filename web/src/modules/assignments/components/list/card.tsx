"use client";

import Link from "next/link";
import { IconCalendarDue, IconListNumbers, IconUsers } from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatAcademyDateTime, formatDueIn } from "../../due";
import { formatScore } from "../../score";
import type { AssignmentState, PartKind } from "../../types";
import { PART_KIND_ICONS, PART_KIND_LABELS, STATE_BADGE, STATE_LABELS } from "../shared/labels";

type Props = {
  href: string;
  title: string;
  audience: string;
  state: AssignmentState;
  maxScore: number;
  parts: { title: string; kind: PartKind | null; position: number }[];
  students: string;
  dueAt: string | null;
};

/** One assignment in the list; the whole card opens its workspace. */
export function AssignmentCard({ href, title, audience, state, maxScore, parts, students, dueAt }: Props) {
  const ordered = [...parts].sort((a, b) => a.position - b.position);

  return (
    <Card size="sm" className="relative gap-0 rounded-lg ring-0 py-0 transition-colors focus-within:ring-3 focus-within:ring-ring/50 hover:bg-muted/30">
      <div className="flex items-start gap-3 p-4">
        <div className="min-w-0 flex-1">
          {/* The link stretches over the card so the whole card is one target. */}
          <Link href={href} className="block truncate font-medium text-foreground outline-none after:absolute after:inset-0 after:rounded-lg">
            {title}
          </Link>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {audience} · <span className="tabular-nums">{formatScore(maxScore)}</span> marks
          </p>
        </div>
        <Badge variant={STATE_BADGE[state]}>{STATE_LABELS[state]}</Badge>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/70 px-4 py-2.5 text-xs text-muted-foreground">
        <Tooltip>
          {/* Above the stretched link so it can be hovered and focused. */}
          <TooltipTrigger asChild>
            <button type="button" className="relative z-10 flex cursor-default items-center gap-1.5 rounded-sm outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
              <IconListNumbers className="size-3.5" aria-hidden="true" />
              {parts.length} part{parts.length === 1 ? "" : "s"}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="start" className="max-w-72">
            {ordered.length === 0 ? "No parts yet" : (
              <ol className="flex flex-col gap-1">
                {ordered.map((part, index) => {
                  const kind = part.kind ?? "legacy";
                  const Icon = PART_KIND_ICONS[kind];
                  return (
                    <li key={index} className="flex items-center gap-1.5">
                      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">{part.title || `Part ${index + 1}`}</span>
                      <span className="shrink-0 opacity-70">· {PART_KIND_LABELS[kind]}</span>
                    </li>
                  );
                })}
              </ol>
            )}
          </TooltipContent>
        </Tooltip>
        <span className="flex items-center gap-1.5">
          <IconUsers className="size-3.5" aria-hidden="true" />
          <span className="font-medium tabular-nums text-foreground">{students}</span> required
        </span>
        <span className="ml-auto flex items-center gap-1.5 whitespace-nowrap">
          {dueAt ? (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="relative z-10 -m-1 inline-flex p-1 rounded-sm outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50" aria-label={`Due date: ${formatAcademyDateTime(dueAt)}`}>
                    <IconCalendarDue className="size-3.5" aria-hidden="true" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="end">
                  {formatAcademyDateTime(dueAt)}
                </TooltipContent>
              </Tooltip>
              <span>{formatDueIn(dueAt)}</span>
            </>
          ) : (
            <>
              <IconCalendarDue className="size-3.5" aria-hidden="true" />
              <span>No due date</span>
            </>
          )}
        </span>
      </div>
    </Card>
  );
}
