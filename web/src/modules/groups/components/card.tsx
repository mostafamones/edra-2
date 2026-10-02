"use client";

import { format } from "date-fns";
import { Archive, ArchiveRestore, CalendarDays, MoreHorizontal, Pencil, UsersRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Group } from "../queries";

type Props = {
  group: Group;
  levelName: string;
  trackName?: string;
  scheduled: boolean;
  /** Actions are offered only when the matching handler is set. */
  onEdit?: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
};

export function GroupCard({ group, levelName, trackName, scheduled, onEdit, onArchive, onRestore }: Props) {
  const archived = Boolean(group.archived_at);
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
            <DropdownMenuContent align="end" className="w-56">
              {onEdit && <DropdownMenuItem onSelect={onEdit}><Pencil />Edit group</DropdownMenuItem>}
              {onRestore && <DropdownMenuItem onSelect={onRestore}><ArchiveRestore />Unarchive</DropdownMenuItem>}
              {onArchive && (
                <>
                  {onEdit && <DropdownMenuSeparator />}
                  <DropdownMenuItem variant="destructive" disabled={scheduled} onSelect={onArchive}><Archive />Archive</DropdownMenuItem>
                  {scheduled && (
                    <DropdownMenuLabel className="text-xs font-normal leading-snug text-muted-foreground">
                      Archive this group&apos;s schedules before archiving it.
                    </DropdownMenuLabel>
                  )}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {group.notes && <p className="-mt-1 line-clamp-2 px-4 pb-3 text-xs leading-relaxed text-muted-foreground">{group.notes}</p>}

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border/70 px-4 py-2.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <UsersRound className="size-3.5" aria-hidden="true" />
          {group.capacity === null
            ? <span className="text-sm leading-none text-foreground" title="No capacity limit"><span aria-hidden="true">∞</span><span className="sr-only">No capacity limit</span></span>
            : <span><span className="font-medium tabular-nums text-foreground">{group.capacity}</span> seats</span>}
        </span>
        {archived ? (
          <span>Archived {format(new Date(group.archived_at!), "MMM d, yyyy")}</span>
        ) : scheduled ? (
          <Badge variant="secondary" className="gap-1 rounded-full bg-primary/10 font-normal text-primary dark:bg-primary/25 dark:text-primary-foreground">
            <CalendarDays aria-hidden="true" />Scheduled
          </Badge>
        ) : (
          <span>Not scheduled</span>
        )}
      </div>
    </Card>
  );
}
