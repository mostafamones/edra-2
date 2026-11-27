import Link from "@/components/shared/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Clock01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCanonicalHref } from "@/modules/navigation";
import { ACADEMY_TIME_ZONE } from "@/modules/schedules";
import { formatClock, type TimeFormat } from "@/modules/account";
import { dateLabel, type CalendarEvent } from "./events";

const TONES = {
  session: "border-l-primary bg-primary/10 text-foreground",
  assignment: "border-l-amber-500 bg-amber-500/15 text-foreground",
  quiz: "border-l-sky-500 bg-sky-500/15 text-foreground",
  exam: "border-l-rose-500 bg-rose-500/15 text-foreground",
} as const;
const ACCENTS = { session: "bg-primary", assignment: "bg-amber-500", quiz: "bg-sky-500", exam: "bg-rose-500" } as const;

export function EventButton({ event, today, format, compact = false, chip = false, row = false, pending, onStart }: {
  event: CalendarEvent; today: string; format: TimeFormat; compact?: boolean; chip?: boolean; row?: boolean; pending: boolean; onStart: (id: string) => void;
}) {
  const href = useCanonicalHref();
  const clock = (value: number) => formatClock(value, format);
  const time = event.deadline ? `Due ${clock(event.start)}` : event.openOnly ? `Opens ${clock(event.start)}` : `${clock(event.start)}–${clock(event.end)}`;
  const route = event.kind === "assignment" ? "assignments" : event.kind === "quiz" ? "quizzes" : "exams";
  const banner = event.deadline || event.window;
  const fullTime = (value: string) => new Intl.DateTimeFormat("en-GB", { timeZone: ACADEMY_TIME_ZONE, day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: format === "12h" }).format(new Date(value));
  return <Popover>
    <PopoverTrigger asChild>
      {row ? <button type="button" aria-label={`${event.title}, ${event.window ? "assessment window" : time}${event.live ? ", live" : ""}`} className={`grid w-full min-w-0 grid-cols-[6.5rem_auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring ${event.recorded && !event.live ? "text-muted-foreground" : ""}`}>
        <span className="text-sm tabular-nums text-muted-foreground">{event.window ? "Window" : event.deadline ? `Due ${clock(event.start)}` : event.openOnly ? `Opens ${clock(event.start)}` : <>{clock(event.start)}<span className="block text-xs">{clock(event.end)}</span></>}</span>
        <span aria-hidden="true" className={`h-9 w-1 rounded-full ${ACCENTS[event.kind]}`} />
        <span className="min-w-0"><span className="block truncate text-sm font-medium text-foreground">{event.title}</span><span className="block truncate text-xs text-muted-foreground">{[event.kind === "session" ? null : event.kind[0].toUpperCase() + event.kind.slice(1), event.audience, event.location].filter(Boolean).join(" · ")}</span></span>
        {event.live ? <span className="flex items-center gap-1.5 text-xs font-medium text-primary"><span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-primary" />Live</span> : event.recorded ? <span className="text-xs">Recorded</span> : <span />}
      </button> : chip ? <button type="button" aria-label={`${event.title}, ${event.window ? "assessment window" : time}${event.live ? ", live" : ""}`} className={`flex w-full min-w-0 items-center gap-1.5 rounded px-1.5 py-0.5 text-left text-xs outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring ${event.live ? "bg-primary/10" : ""}`}>
        <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${ACCENTS[event.kind]}`} />
        {!event.deadline && !event.window && <span className="shrink-0 tabular-nums text-muted-foreground">{clock(event.start)}</span>}
        <span className="truncate font-medium">{event.title}</span>
      </button> :
      <button type="button" aria-label={`${event.title}, ${event.window ? "assessment window" : time}${event.live ? ", live" : ""}`} className={`relative flex h-full w-full min-w-0 flex-col gap-0.5 overflow-hidden rounded-md border-l-[3px] px-2 py-1.5 text-left text-xs leading-snug outline-none transition-[filter,box-shadow] hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring dark:hover:brightness-125 ${TONES[event.kind]} ${event.live ? "ring-2 ring-primary" : ""} ${event.recorded && !event.live ? "opacity-80" : ""}`}>
        {!event.deadline && <span className="flex items-center gap-1 tabular-nums opacity-75">{event.live && <span aria-hidden="true" className="size-1.5 shrink-0 animate-pulse rounded-full bg-primary" />}{event.window ? `${event.kind} window` : event.live ? `${clock(event.start)} · Live` : time}</span>}
        <span className={`min-w-0 text-[13px] font-semibold ${compact ? "line-clamp-2" : "line-clamp-3"}`}>{event.title}</span>
        {event.deadline ? <span className="flex items-center gap-1 tabular-nums opacity-75"><HugeiconsIcon icon={Clock01Icon} strokeWidth={1.5} className="size-3 shrink-0" />Due {clock(event.start)}</span> : !compact && <span className="truncate opacity-75">{event.location || event.audience || event.kind}</span>}
      </button>}
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
