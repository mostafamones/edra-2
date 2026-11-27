import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { Calendar03Icon, Location01Icon, UserGroupIcon, UserMultiple02Icon } from "@hugeicons/core-free-icons";
import Link from "@/components/shared/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AcademyRole } from "@/modules/academies";
import { formatClock, type TimeFormat } from "@/modules/account";
import { useCanonicalHref } from "@/modules/navigation";
import { ACADEMY_TIME_ZONE, canEditSchedule, nameOccurrence, schedulesRootKey } from "@/modules/schedules";
import { dateLabel, type CalendarEvent } from "./events";

export const ACCENTS = { session: "bg-primary", assignment: "bg-amber-500", quiz: "bg-sky-500", exam: "bg-rose-500" } as const;

/** Popover body for one calendar event: status, editable session name, details and the next action. */
export function EventDetails({ event, today, past, format, academyId, role, pending, onStart }: {
  event: CalendarEvent; today: string; past: boolean; format: TimeFormat; academyId: string; role: AcademyRole;
  pending: boolean; onStart: (id: string) => void;
}) {
  const href = useCanonicalHref();
  const clock = (value: number) => formatClock(value, format);
  const fullTime = (value: string) => new Intl.DateTimeFormat("en-GB", { timeZone: ACADEMY_TIME_ZONE, day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: format === "12h" }).format(new Date(value));
  const route = event.kind === "assignment" ? "assignments" : event.kind === "quiz" ? "quizzes" : "exams";
  const status = event.live ? "Live" : event.kind === "session" ? event.recorded ? "Ended" : past ? "Not started" : "Planned"
    : event.deadline ? "Assignment due" : event.window ? `${event.kind} window` : event.kind;
  const day = `${dateLabel(event.day, { weekday: "long" })}, ${dateLabel(event.day, { day: "numeric", month: "short" })}`;
  const hours = event.deadline ? `Due ${clock(event.start)}` : event.openOnly ? `Opens ${clock(event.start)}` : `${clock(event.start)} — ${clock(event.end)}`;
  // A quiet rule separates the date from the time; assessment windows already read as a range.
  const when = event.window && event.opensAt ? `${fullTime(event.opensAt)} — ${event.closesAt ? fullTime(event.closesAt) : "Open-ended"}`
    : <>{day}<span aria-hidden="true" className="mx-2 inline-block h-3 w-px translate-y-px bg-border" />{hours}</>;
  const canName = event.kind === "session" && !!event.scheduleKind && canEditSchedule(role, { kind: event.scheduleKind, archived_at: null });
  const details = [
    { icon: Calendar03Icon, text: when },
    { icon: UserGroupIcon, text: event.audience },
    { icon: Location01Icon, text: event.location },
    { icon: UserMultiple02Icon, text: event.expected !== undefined ? `${event.expected} expected` : null },
  ].filter(item => item.text);

  return <div className="flex flex-col gap-4">
    <div className="flex flex-col gap-1">
      <span className={`flex items-center gap-1.5 text-xs font-medium capitalize ${event.live ? "text-primary" : "text-muted-foreground"}`}>
        <span aria-hidden="true" className={`size-2 rounded-full ${ACCENTS[event.kind]} ${event.live ? "animate-pulse" : ""}`} />{status}
      </span>
      {canName ? <NameField key={`${event.title}:${event.named}`} event={event} academyId={academyId} />
        : <h2 className="text-lg font-semibold leading-snug">{event.title}</h2>}
    </div>
    <ul className="flex flex-col gap-2 text-sm">{details.map((item, index) => <li key={index} className="flex items-start gap-2.5">
      <HugeiconsIcon icon={item.icon} strokeWidth={1.5} className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span className="min-w-0 tabular-nums">{item.text}</span>
    </li>)}</ul>
    <div className="flex flex-wrap gap-2 border-t pt-4">
      {event.sessionId ? <Button asChild size="sm"><Link href={href(`/app/attendance/${event.sessionId}`)}>Open attendance</Link></Button>
        : event.assessmentId ? <Button asChild size="sm"><Link href={href(`/app/${route}/${event.assessmentId}`)}>Open {event.kind}</Link></Button>
          : event.scheduleId && event.day === today ? <Button size="sm" disabled={pending} onClick={() => onStart(event.scheduleId!)}>{pending ? "Starting…" : "Start session"}</Button> : null}
      {event.scheduleId && <Button asChild size="sm" variant="ghost"><Link href={href("/app/schedules")}>View schedules</Link></Button>}
    </div>
  </div>;
}

/** Inline name for one schedule occurrence; saves on Enter or blur, Escape reverts, empty clears. */
function NameField({ event, academyId }: { event: CalendarEvent; academyId: string }) {
  const queryClient = useQueryClient();
  const saved = event.named ? event.title : "";
  const [value, setValue] = useState(saved);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() {
    const name = value.trim();
    if (name === saved || saving) return;
    setSaving(true); setError("");
    try {
      const result = await nameOccurrence({ academyId, scheduleId: event.scheduleId!, occursOn: event.occursOn!, name });
      if (!result.ok) { setError(result.message); return; }
      await queryClient.invalidateQueries({ queryKey: schedulesRootKey(academyId) });
    } catch {
      setError("Could not save the name. Check your connection and try again.");
    } finally { setSaving(false); }
  }
  return <div className="flex flex-col gap-1">
    <Input variant="line" aria-label="Session name" aria-invalid={!!error || undefined} maxLength={120} value={value} placeholder={event.scheduleTitle}
      disabled={saving} className="-mx-1 h-auto text-lg font-semibold md:text-lg"
      onChange={change => setValue(change.target.value)} onBlur={() => void save()}
      onKeyDown={key => { if (key.key === "Enter") key.currentTarget.blur(); if (key.key === "Escape") { key.stopPropagation(); setValue(saved); setError(""); } }} />
    {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
  </div>;
}
