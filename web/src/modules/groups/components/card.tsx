"use client";
import { format } from "date-fns";
import { HugeiconsIcon } from "@hugeicons/react";
import { Archive02Icon, Calendar03Icon, MoreHorizontalIcon, PencilEdit02Icon, RestoreBinIcon, UserGroupIcon } from "@hugeicons/core-free-icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Group } from "../queries";

type Props = {
  group: Group;
  levelName: string;
  trackName?: string;
  scheduled: boolean;
  /** Any student record (active or archived) is placed in this group. */
  hasStudents: boolean;
  /** Active students placed in this group. */
  activeStudents: number;
  /** Highlights the card whose roster is showing. */
  selected?: boolean;
  /** Clicking the card shows the group's roster. */
  onOpen: () => void;
  /** Actions are offered only when the matching handler is set. */
  onEdit?: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
};

export function GroupCard({ group, levelName, trackName, scheduled, hasStudents, activeStudents, selected = false, onOpen, onEdit, onArchive, onRestore }: Props) {
  const archived = Boolean(group.archived_at);
  const archiveBlocker = archiveBlockReason(scheduled, hasStudents);
  const hasActions = Boolean(onEdit || onArchive || onRestore);

  return (
    <Card size="sm" className={cn("relative gap-0 rounded-lg py-0 transition-colors hover:bg-muted/30", selected && "bg-muted/50 ring-2 ring-primary")}>
      {/* Stretched over the card so the whole card shows the roster; the actions menu sits above it. */}
      <button type="button" className="absolute inset-0 rounded-lg focus-visible:outline-2 focus-visible:outline-ring" aria-label={`Show roster for ${group.name}`} aria-pressed={selected} onClick={onOpen} />
      <div className="flex items-start gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-foreground">{group.name}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {levelName}{trackName && ` · ${trackName}`}
          </p>
        </div>
        {hasActions && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="relative -mr-1.5 -mt-1 text-muted-foreground" aria-label={`Actions for ${group.name}`}>
                <HugeiconsIcon icon={MoreHorizontalIcon} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onEdit && <DropdownMenuItem onSelect={onEdit}><HugeiconsIcon icon={PencilEdit02Icon} />Edit group</DropdownMenuItem>}
              {onRestore && <DropdownMenuItem onSelect={onRestore}><HugeiconsIcon icon={RestoreBinIcon} />Unarchive</DropdownMenuItem>}
              {onArchive && (
                <>
                  {onEdit && <DropdownMenuSeparator />}
                  <Tooltip open={archiveBlocker ? undefined : false}>
                    <TooltipTrigger asChild>
                      <span className="block">
                        <DropdownMenuItem variant="destructive" disabled={Boolean(archiveBlocker)} onSelect={onArchive}><HugeiconsIcon icon={Archive02Icon} />Archive</DropdownMenuItem>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="left">{archiveBlocker}</TooltipContent>
                  </Tooltip>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {group.notes && <p className="-mt-1 line-clamp-2 px-4 pb-3 text-xs leading-relaxed text-muted-foreground">{group.notes}</p>}

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border/70 px-4 py-2.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <HugeiconsIcon icon={UserGroupIcon} className="size-3.5" aria-hidden="true" />
          <span className="font-medium tabular-nums text-foreground">{activeStudents}</span>
          <span aria-hidden="true">/</span>
          {group.capacity === null
            ? <span className="text-sm leading-none text-foreground" title="No capacity limit"><span aria-hidden="true">∞</span><span className="sr-only">no capacity limit</span></span>
            : <span className="tabular-nums">{group.capacity}</span>}
          <span className="sr-only"> students</span>
        </span>
        {archived ? (
          <span>Archived {format(new Date(group.archived_at!), "MMM d, yyyy")}</span>
        ) : scheduled ? (
          <Badge variant="secondary" className="gap-1 rounded-md bg-primary/10 font-normal text-primary dark:bg-primary/25 dark:text-primary-foreground">
            <HugeiconsIcon icon={Calendar03Icon} aria-hidden="true" />Scheduled
          </Badge>
        ) : (
          <span>Not scheduled</span>
        )}
      </div>
    </Card>
  );
}

/** Explains why a group cannot be archived, or returns undefined when it can. */
function archiveBlockReason(scheduled: boolean, hasStudents: boolean) {
  if (scheduled && hasStudents) return "Archive this group’s schedules and move its students (including archived ones) to another group first.";
  if (scheduled) return "Archive this group’s schedules before archiving it.";
  if (hasStudents) return "Move this group’s students, including archived ones, to another group before archiving it.";
  return undefined;
}
