"use client";

import { useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCanonicalHref } from "@/modules/navigation";
import { audienceLabel } from "@/modules/schedules";
import { useScheduleOptions } from "./use-schedule-options";
import { useStartSession } from "./use-start-session";

type Props = {
  academyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Live session id by schedule id, so a live schedule opens instead of starting twice. */
  liveBySchedule: Map<string, string>;
};

/** Pick a schedule and start (or open) its session. Any active schedule can start at any time. */
export function StartSessionDialog({ academyId, open, onOpenChange, liveBySchedule }: Props) {
  const href = useCanonicalHref();
  const [scheduleId, setScheduleId] = useState("");
  const { start, pendingId } = useStartSession(academyId);
  const { schedules, lookup, loading, failed } = useScheduleOptions(academyId, open);
  const options = [...(schedules.data?.schedules ?? [])].sort((a, b) => a.title.localeCompare(b.title));
  const selected = options.find((schedule) => schedule.id === scheduleId);
  const liveId = liveBySchedule.get(scheduleId);

  const option = (schedule: (typeof options)[number]) => (
    <div className="flex flex-col items-start gap-0.5 text-left">
      <span className="font-medium">{schedule.title}</span>
      <span className="text-xs text-muted-foreground">
        {[lookup ? audienceLabel(schedule, lookup) : null, liveBySchedule.has(schedule.id) ? "Live now" : null].filter(Boolean).join(" · ")}
      </span>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="gap-0">
          <DialogTitle className="-mt-2 text-lg leading-8 font-semibold">Start a session</DialogTitle>
          <DialogDescription>Pick the class you’re teaching.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Label htmlFor="start-schedule">Schedule</Label>
          <Select value={scheduleId} onValueChange={setScheduleId} disabled={loading || options.length === 0}>
            <SelectTrigger id="start-schedule" className="h-auto min-h-12 w-full py-1.5">
              <SelectValue className="line-clamp-none!" placeholder={failed ? "Couldn’t load schedules" : loading ? "Loading schedules…" : options.length === 0 ? "No schedules yet" : "Select a schedule"}>
                {selected ? option(selected) : null}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {options.map((schedule) => (
                <SelectItem key={schedule.id} value={schedule.id}>
                  {option(schedule)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {schedules.data && !schedules.data.year && (
            <p className="text-sm text-muted-foreground">There is no active academic year. Open one before starting sessions.</p>
          )}
          {schedules.data?.year && options.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Every session starts from a schedule. <Link className="underline" href={href("/app/schedules/new")}>Create one</Link> first.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          {liveId ? (
            <Button asChild><Link href={href(`/app/sessions/${liveId}`)}>Open live session</Link></Button>
          ) : (
            <Button onClick={() => void start(scheduleId)} disabled={!scheduleId || pendingId !== null}>
              {pendingId ? "Starting…" : "Start session"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
