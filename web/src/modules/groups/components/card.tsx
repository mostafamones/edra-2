"use client";

import Link from "next/link";
import { format } from "date-fns";
import { Archive, ArchiveRestore, CalendarDays, MoreHorizontal, Pencil, UsersRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Group } from "../queries";
import { IconArchive, IconCalendar, IconClipboardList, IconEdit, IconRestore, IconUsers, IconUsersGroup } from "@tabler/icons-react";

type Props = {
  group: Group;
  levelName: string;
  trackName?: string;
  scheduled: boolean;
  /** Any student record (active or archived) is placed in this group. */
  hasStudents: boolean;
  /** Active students placed in this group. */
  activeStudents: number;
  /** Actions are offered only when the matching handler is set. */
  onEdit?: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
};

export function GroupCard({ group, levelName, trackName, scheduled, hasStudents, activeStudents, onEdit, onArchive, onRestore }: Props) {
  const archived = Boolean(group.archived_at);
  const archiveBlocker = archiveBlockReason(scheduled, hasStudents);
  const hasActions = Boolean(onEdit || onArchive || onRestore);

  return (
    <Card size="sm" className="gap-0 rounded-lg py-0 transition-colors hover:bg-muted/30">
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
              <Button variant="ghost" size="icon-sm" className="-mr-1.5 -mt-1 text-muted-foreground" aria-label={`Actions for ${group.name}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onEdit && <DropdownMenuItem onSelect={onEdit}><IconEdit />Edit group</DropdownMenuItem>}
              {activeStudents > 0 && (
                <DropdownMenuItem asChild>
                  <Link href={`/app/students?group=${group.id}`}><IconClipboardList />Show roster</Link>
                </DropdownMenuItem>
              )}
              {onRestore && <DropdownMenuItem onSelect={onRestore}><IconRestore />Unarchive</DropdownMenuItem>}
              {onArchive && (
                <>
                  {onEdit && <DropdownMenuSeparator />}
                  <Tooltip open={archiveBlocker ? undefined : false}>
                    <TooltipTrigger asChild>
                      <span className="block">
                        <DropdownMenuItem variant="destructive" disabled={Boolean(archiveBlocker)} onSelect={onArchive}><IconArchive />Archive</DropdownMenuItem>
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
          <IconUsers className="size-3.5" aria-hidden="true" />
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
          <Badge variant="secondary" className="gap-1 rounded-full bg-primary/10 font-normal text-primary dark:bg-primary/25 dark:text-primary-foreground">
            <IconCalendar aria-hidden="true" />Scheduled
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
