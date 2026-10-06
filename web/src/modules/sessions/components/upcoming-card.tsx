"use client";

import { IconClock, IconPlayerPlay } from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { audienceLabel, formatTime, type AudienceLookup } from "@/modules/schedules";
import type { Upcoming } from "../upcoming";

type Props = {
  item: Upcoming;
  lookup: AudienceLookup | null;
  starting: boolean;
  disabled: boolean;
  onStart: (scheduleId: string) => void;
};

/** A planned class today with no session yet, until it is started. */
export function UpcomingCard({ item, lookup, starting, disabled, onStart }: Props) {
  const { schedule } = item;
  return (
    <Card size="sm" className="gap-0 rounded-lg py-0 opacity-70 transition-opacity hover:opacity-100">
      <div className="flex items-start gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-foreground">{schedule.title}</p>
          {lookup ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{audienceLabel(schedule, lookup)}</p> : null}
        </div>
        <Badge variant="outline" className="text-[11px]">Upcoming</Badge>
      </div>
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border/70 px-4 py-2.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <IconClock className="size-3.5" aria-hidden="true" />
          <span className="tabular-nums text-foreground">{formatTime(item.startsAt)} – {formatTime(item.endsAt)}</span>
        </span>
        <Button size="sm" variant="outline" onClick={() => onStart(schedule.id)} disabled={disabled}>
          <IconPlayerPlay />{starting ? "Starting…" : "Start"}
        </Button>
      </div>
    </Card>
  );
}
