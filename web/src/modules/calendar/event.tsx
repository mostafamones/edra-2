import { HugeiconsIcon } from "@hugeicons/react";
import { Clock01Icon } from "@hugeicons/core-free-icons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { AcademyRole } from "@/modules/academies";
import type { TimeFormat } from "@/modules/account";
import { clockLabel } from "./time";
import { ACCENTS, EventDetails } from "./details";
import type { CalendarEvent } from "./events";

const TONES = {
  session: "border-l-primary bg-primary/10 text-foreground",
  assignment: "border-l-amber-500 bg-amber-500/15 text-foreground",
  quiz: "border-l-sky-500 bg-sky-500/15 text-foreground",
  exam: "border-l-rose-500 bg-rose-500/15 text-foreground",
} as const;

export function EventButton({ event, today, now, format, academyId, role, compact = false, chip = false, row = false, pending, onStart }: {
  event: CalendarEvent; today: string; now: number; format: TimeFormat; academyId: string; role: AcademyRole;
  compact?: boolean; chip?: boolean; row?: boolean; pending: boolean; onStart: (id: string) => void;
}) {
  // Anything already behind the current time reads as history; a live session never does.
  const past = !event.live && (event.day < today || (event.day === today && (event.deadline ? event.start : event.end) <= now));
  const muted = past ? "opacity-60" : "";
  const clock = (value: number) => clockLabel(value, format);
  const time = event.deadline ? `Due ${clock(event.start)}` : event.openOnly ? `Opens ${clock(event.start)}` : `${clock(event.start)}–${clock(event.end)}`;
  return <Popover>
    <PopoverTrigger asChild>
      {row ? <button type="button" aria-label={`${event.title}, ${event.window ? "assessment window" : time}${event.live ? ", live" : ""}`} className={`grid w-full min-w-0 grid-cols-[6.5rem_auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring ${muted}`}>
        <span className="text-sm tabular-nums text-muted-foreground">{event.window ? "Window" : event.deadline ? `Due ${clock(event.start)}` : event.openOnly ? `Opens ${clock(event.start)}` : <>{clock(event.start)}<span className="block text-xs">{clock(event.end)}</span></>}</span>
        <span aria-hidden="true" className={`h-9 w-1 rounded-full ${ACCENTS[event.kind]}`} />
        <span className="min-w-0"><span className="block truncate text-sm font-medium text-foreground">{event.title}</span><span className="block truncate text-xs text-muted-foreground">{[event.kind === "session" ? event.named ? event.scheduleTitle : null : event.kind[0].toUpperCase() + event.kind.slice(1), event.audience, event.location].filter(Boolean).join(" · ")}</span></span>
        {event.live ? <span className="flex items-center gap-1.5 text-xs font-medium text-primary"><span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-primary" />Live</span> : event.recorded ? <span className="text-xs">Recorded</span> : <span />}
      </button> : chip ? <button type="button" aria-label={`${event.title}, ${event.window ? "assessment window" : time}${event.live ? ", live" : ""}`} className={`flex w-full min-w-0 items-center gap-1.5 rounded px-1.5 py-0.5 text-left text-xs outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring ${event.live ? "bg-primary/10" : ""} ${muted}`}>
        <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${ACCENTS[event.kind]}`} />
        {!event.deadline && !event.window && <span className="shrink-0 tabular-nums text-muted-foreground">{clock(event.start)}</span>}
        <span className="truncate font-medium">{event.title}</span>
      </button> :
      <button type="button" aria-label={`${event.title}, ${event.window ? "assessment window" : time}${event.live ? ", live" : ""}`} className={`relative flex h-full w-full min-w-0 flex-col gap-0.5 overflow-hidden rounded-md border-l-[3px] px-2 py-1.5 text-left text-xs leading-snug outline-none transition-[filter,box-shadow] hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring dark:hover:brightness-125 ${TONES[event.kind]} ${event.live ? "ring-2 ring-primary" : ""} ${muted}`}>
        {!event.deadline && <span className="flex items-center gap-1 tabular-nums opacity-75">{event.live && <span aria-hidden="true" className="size-1.5 shrink-0 animate-pulse rounded-full bg-primary" />}{event.window ? `${event.kind} window` : event.live ? `${clock(event.start)} · Live` : time}</span>}
        <span className={`min-w-0 text-[13px] font-semibold ${compact ? "line-clamp-2" : "line-clamp-3"}`}>{event.title}</span>
        {event.deadline ? <span className="flex items-center gap-1 tabular-nums opacity-75"><HugeiconsIcon icon={Clock01Icon} strokeWidth={1.5} className="size-3 shrink-0" />Due {clock(event.start)}</span> : !compact && <span className="truncate opacity-75">{event.location || event.audience || event.kind}</span>}
      </button>}
    </PopoverTrigger>
    <PopoverContent className="w-80 max-w-[calc(100vw-2rem)] p-5" side="right" align="start">
      <EventDetails event={event} today={today} now={now} past={past} format={format} academyId={academyId} role={role} pending={pending} onStart={onStart} />
    </PopoverContent>
  </Popover>;
}
