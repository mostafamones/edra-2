import { useEffect, useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { AcademyEntry } from "@/modules/academies";
import { academyNow } from "@/modules/schedules";
import { useStartSession } from "@/modules/sessions";
import { EventDetails } from "./details";
import { minutes } from "./events";
import { useCalendarEvents } from "./use-events";

/** Minutes since midnight as "4 PM" or "4:30 PM". */
const time = (value: number) => { const hour = Math.floor(value / 60) % 24, minute = value % 60; return `${hour % 12 || 12}${minute ? `:${String(minute).padStart(2, "0")}` : ""} ${hour < 12 ? "AM" : "PM"}`; };

/** Header ticker over today's sessions; each opens the calendar's event popover. */
export function TodayEvents({ academy }: { academy: AcademyEntry }) {
  const [wall, setWall] = useState(academyNow);
  useEffect(() => { const timer = setInterval(() => setWall(academyNow()), 60_000); return () => clearInterval(timer); }, []);
  const today = wall.slice(0, 10), now = minutes(wall.slice(11));
  const days = useMemo(() => [today], [today]);
  const { events } = useCalendarEvents(academy.id, days, today);
  const sessions = events.filter(event => event.kind === "session");
  const { start, pendingId } = useStartSession(academy.id);
  const [index, setIndex] = useState<number | null>(null);
  const [open, setOpen] = useState(false), [hover, setHover] = useState(false);
  // Open on the live or next session, then rotate unless the viewer is reading one.
  const current = index ?? Math.max(0, sessions.findIndex(event => event.live || event.end > now));
  const event = sessions[current % Math.max(1, sessions.length)];
  if (!event) return null;
  const past = !event.live && event.end <= now, position = current % sessions.length;
  const status = event.live ? `Live · until ${time(event.end)}` : past ? `Ended ${time(event.end)}` : `${time(event.start)} – ${time(event.end)}`;
  const next = () => setIndex((position + 1) % sessions.length);
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <button type="button" aria-label={`Today, session ${position + 1} of ${sessions.length}: ${event.title}, ${status}`}
        onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onFocus={() => setHover(true)} onBlur={() => setHover(false)}
        className="flex h-9 max-w-md min-w-0 items-center gap-3 rounded-lg bg-muted/50 px-3 outline-none transition-colors duration-200 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
        {/* One line keeps the pill roomy inside the header; the title truncates first. */}
        <span key={event.id} className="flex min-w-0 items-center gap-2.5 text-sm duration-300 animate-in fade-in slide-in-from-bottom-1 motion-reduce:animate-none">
          {event.live && <span aria-hidden="true" className="size-1.5 shrink-0 animate-pulse rounded-full bg-primary" />}
          <span dir="auto" className="min-w-0 truncate font-medium">{event.title}</span>
          <span className={`shrink-0 text-xs tabular-nums ${event.live ? "font-medium text-primary" : "text-muted-foreground"}`}>{status}</span>
          {sessions.length > 1 && <span className="shrink-0 text-xs text-muted-foreground tabular-nums opacity-70">{position + 1}/{sessions.length}</span>}
        </span>
        {/* The pill fills over one turn; its animation end advances the ticker, so pausing it pauses rotation. */}
        {sessions.length > 1 && <span aria-hidden="true" className="h-4 w-0.5 shrink-0 overflow-hidden rounded-full bg-foreground/10">
          <span key={event.id} onAnimationEnd={next} className={`block size-full rounded-full bg-foreground/50 duration-[5000ms] ease-linear animate-in slide-in-from-bottom-full ${open || hover ? "[animation-play-state:paused]" : ""}`} />
        </span>}
      </button>
    </PopoverTrigger>
    <PopoverContent className="w-80 max-w-[calc(100vw-2rem)] p-5" align="end">
      <EventDetails event={event} today={today} now={now} past={past} format="12h" academyId={academy.id} role={academy.role} pending={pendingId !== null} onStart={id => void start(id)} />
    </PopoverContent>
  </Popover>;
}
