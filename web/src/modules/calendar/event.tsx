"use client";

import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Clock01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCanonicalHref } from "@/modules/navigation";
import { ACADEMY_TIME_ZONE } from "@/modules/schedules";
import { formatClock, type TimeFormat } from "@/modules/account";
import { dateLabel, type CalendarEvent } from "./events";

export function EventButton({ event, today, format, compact = false, pending, onStart }: {
  event: CalendarEvent; today: string; format: TimeFormat; compact?: boolean; pending: boolean; onStart: (id: string) => void;
}) {
  const href = useCanonicalHref();
  const clock = (value: number) => formatClock(value, format);
  const time = event.deadline ? `Due ${clock(event.start)}` : event.openOnly ? `Opens ${clock(event.start)}` : `${clock(event.start)}–${clock(event.end)}`;
  const route = event.kind === "assignment" ? "assignments" : event.kind === "quiz" ? "quizzes" : "exams";
  const banner = event.deadline || event.window;
  const fullTime = (value: string) => new Intl.DateTimeFormat("en-GB", { timeZone: ACADEMY_TIME_ZONE, day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: format === "12h" }).format(new Date(value));
  return <Popover>
    <PopoverTrigger asChild>
      <button type="button" aria-label={`${event.title}, ${event.window ? "assessment window" : time}${event.live ? ", live" : ""}`} className={`relative flex h-full w-full min-w-0 flex-col gap-1 overflow-hidden rounded-lg bg-card px-3 py-2 text-left text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring ${event.live ? "ring-1 ring-primary" : event.kind !== "session" ? "ring-1 ring-border" : ""} ${banner ? "text-xs" : ""}`}>
        {!event.deadline && <span aria-hidden="true" className={`absolute inset-y-2 left-0 w-0.5 ${event.kind === "session" ? "bg-primary" : "bg-muted-foreground"}`} />}
        {!event.deadline && <span className="text-xs tabular-nums text-muted-foreground">{event.window ? `${event.kind} window` : event.live ? `${clock(event.start)} · Live` : time}</span>}
        <span className={`min-w-0 font-medium ${compact ? "line-clamp-2" : ""}`}>{event.title}</span>
        {event.deadline ? <span className="flex items-center gap-1 tabular-nums text-muted-foreground"><HugeiconsIcon icon={Clock01Icon} strokeWidth={1.5} className="size-3 shrink-0" />{clock(event.start)}</span> : !compact && <span className="text-xs text-muted-foreground">{event.location || event.audience || event.kind}</span>}
      </button>
    </PopoverTrigger>
    <PopoverContent className="w-80 max-w-[calc(100vw-2rem)] gap-3 p-5" side="right" align="start">
      <span className={`text-xs capitalize ${event.live ? "text-primary" : "text-muted-foreground"}`}>{event.live ? "Live session" : event.recorded ? "Recorded session" : event.deadline ? "Submission deadline" : event.kind === "session" ? "Planned session" : event.kind}</span>
      <h2 className="text-lg font-semibold">{event.title}</h2>
      <p>{dateLabel(event.day, { weekday: "long", day: "numeric", month: "long" })}</p>
      <p className="text-sm tabular-nums">{event.window && event.opensAt ? `${fullTime(event.opensAt)} – ${event.closesAt ? fullTime(event.closesAt) : "Open-ended"}` : time} · Cairo</p>
      {event.audience && <p className="border-t pt-3 text-sm">{event.audience}</p>}
      {(event.location || event.expected !== undefined) && <p className="text-sm text-muted-foreground">{[event.location, event.expected !== undefined ? `${event.expected} expected` : null].filter(Boolean).join(" · ")}</p>}
      {event.sessionId ? <Button asChild><Link href={href(`/app/attendance/${event.sessionId}`)}>Open attendance</Link></Button>
        : event.assessmentId ? <Button asChild><Link href={href(`/app/${route}/${event.assessmentId}`)}>Open {event.kind}</Link></Button>
          : event.scheduleId && event.day === today ? <Button disabled={pending} onClick={() => onStart(event.scheduleId!)}>{pending ? "Starting…" : "Start session"}</Button> : null}
      {event.scheduleId && <Button asChild variant="ghost"><Link href={href("/app/schedules")}>View schedules</Link></Button>}
    </PopoverContent>
  </Popover>;
}
