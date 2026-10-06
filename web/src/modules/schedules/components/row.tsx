"use client";

import {
  IconArchive, IconClock, IconDotsVertical, IconEdit, IconGitBranch, IconMapPin, IconSchool, IconUsersGroup,
} from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Schedule } from "../queries";
import { formatDate, formatTime } from "../time";

type Props = {
  schedule: Schedule;
  startsAt: string;
  /** Shown above the time for one-offs. */
  date?: string;
  /** Weekly slots in the whole schedule; recurring rows only. */
  slotCount?: number;
  /** Dated sessions in the whole schedule; one-off rows only. */
  sessionCount?: number;
  level?: string;
  group?: string;
  track?: string;
  /** Actions are offered only when the matching handler is set. */
  onEdit?: () => void;
  onArchive?: () => void;
};

/** One schedule row: start time on the left, name, badges and details in the middle, actions on the right. */
export function ScheduleRow({ schedule, startsAt, date, slotCount, sessionCount, level, group, track, onEdit, onArchive }: Props) {
  const archived = Boolean(schedule.archived_at);
  const oneOff = schedule.kind === "one_off";

  return (
    <Card
      size="sm"
      className={`border-l-3 ${oneOff ? "border-foreground/20" : "border-primary"} ring-0 bg-card/40 shadow-sm transition-colors hover:bg-muted/30 ${archived ? "opacity-60" : ""}`}
    >
      <CardContent className="flex flex-row items-center gap-2 py-1">
        <div className="flex flex-col items-center gap-0 px-2 pr-4">
          {date ? <span className="text-xs text-muted-foreground">{formatDate(date)}</span> : null}
          <span className="flex items-center gap-1.5 text-[15px]">
            <IconClock className="size-4 text-muted-foreground" />
            {formatTime(startsAt)}
          </span>
        </div>

        <div className="flex flex-col items-start gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-medium">{schedule.title}</h3>
            <Badge variant="secondary" className="text-[11px]">{schedule.mandatory ? "Mandatory" : "Optional"}</Badge>
            {oneOff ? <Badge variant="secondary" className="text-[11px]">One-off</Badge> : null}
            {slotCount !== undefined && slotCount > 1 && !oneOff ? (
              <Badge variant="secondary" className="text-[11px]">{slotCount} days/wk</Badge>
            ) : null}
            {sessionCount !== undefined && sessionCount > 1 ? (
              <Badge variant="secondary" className="text-[11px]">{sessionCount} dates</Badge>
            ) : null}
            {archived ? <Badge variant="outline" className="text-[11px] text-muted-foreground">Archived</Badge> : null}
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            {level ? (
              <span className="flex items-center gap-1"><IconSchool className="size-3" />{level}</span>
            ) : null}
            {group ? (
              <span className="flex items-center gap-1"><IconUsersGroup className="size-3" />{group}</span>
            ) : track ? (
              <span className="flex items-center gap-1"><IconGitBranch className="size-3" />{track}</span>
            ) : null}
            {schedule.location ? (
              <span className="flex items-center gap-1"><IconMapPin className="size-3" />{schedule.location}</span>
            ) : null}
          </div>
        </div>

        {(onEdit || onArchive) && (
          <div className="ml-auto">
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={`Actions for ${schedule.title}`}>
                    <IconDotsVertical className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {onEdit && <DropdownMenuItem onSelect={onEdit}><IconEdit className="size-4" />Edit</DropdownMenuItem>}
                  {onArchive && (
                    <DropdownMenuItem variant="destructive" onSelect={onArchive}><IconArchive className="size-4" />Archive</DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
