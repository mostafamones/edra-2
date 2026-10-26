"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, ArrowRight01Icon, Calendar03Icon, PlayIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Kbd } from "@/components/ui/kbd";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import { academyNow, audienceLabel, formatTime, weekdayName } from "@/modules/schedules";
import { ANY_AUDIENCE, audienceChoices, filterSchedules, selectAudience, todayTime, type AudienceFacet } from "../command";
import { fetchLiveSessions, liveSessionsQueryKey } from "../queries";
import { AudienceFilterPicker } from "./audience-filter";
import { useScheduleOptions } from "./use-schedule-options";
import { useStartSession } from "./use-start-session";

type Props = {
  academyId: string; onBack: () => void; onComplete: () => void; onBusyChange: (busy: boolean) => void;
  ref?: Ref<{ back: () => void }>;
};
const labels = { grade: "Grade", track: "Track", group: "Group" };

/** Filters choose schedules, never a narrower roster. Only confirmation starts a class. */
export function StartSessionCommand({ academyId, onBack, onComplete, onBusyChange, ref }: Props) {
  const [review, setReview] = useState(false);
  const [filter, setFilter] = useState(ANY_AUDIENCE);
  const [search, setSearch] = useState("");
  const [highlighted, setHighlighted] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [wall, setWall] = useState(academyNow);
  const busy = useRef(false), inputRef = useRef<HTMLInputElement>(null);
  const { start } = useStartSession(academyId);
  const { schedules, lookup, loading, failed, retry } = useScheduleOptions(academyId);
  useEffect(() => { const timer = setInterval(() => setWall(academyNow()), 60_000); return () => clearInterval(timer); }, []);
  const live = useQuery({ queryKey: [...liveSessionsQueryKey(academyId), "command"], staleTime: 0, retry: false,
    queryFn: async ({ signal }) => {
      const ids = new Set<string>();
      let cursor: string | null = null;
      do {
        const page = await fetchLiveSessions(academyId, cursor, signal);
        page.sessions.forEach(session => ids.add(session.scheduleId));
        cursor = page.nextCursor;
      } while (cursor);
      return ids;
    },
  });
  const options = schedules.data?.schedules ?? [];
  const year = schedules.data?.year;
  const yearLabel = year ? `${year.start_year}–${year.start_year + 1}` : "";
  const selected = options.find(schedule => schedule.id === selectedId && !schedule.archived_at);
  const available = lookup ? filterSchedules(options, lookup, filter, search) : [];
  const times = new Map(available.map(schedule => [schedule.id, todayTime(schedule.id, schedules.data?.slots ?? [], schedules.data?.sessions ?? [], wall)]));
  const liveSchedules = available.filter(schedule => live.data?.has(schedule.id));
  const todaySchedules = available.filter(schedule => !live.data?.has(schedule.id) && times.get(schedule.id))
    .sort((a, b) => Number(times.get(a.id)!.passed) - Number(times.get(b.id)!.passed) || times.get(a.id)!.startsAt.localeCompare(times.get(b.id)!.startsAt));
  const otherSchedules = available.filter(schedule => !live.data?.has(schedule.id) && !times.get(schedule.id));
  const sections = search.trim() ? [{ label: `Matches · ${available.length}`, schedules: available }] : [
    { label: "Live now", schedules: liveSchedules }, { label: "Today", schedules: todaySchedules },
    { label: liveSchedules.length || todaySchedules.length ? "Other schedules" : "Schedules", schedules: otherSchedules },
  ];
  const ordered = sections.flatMap(section => section.schedules);
  const highlightedId = ordered.some(schedule => schedule.id === highlighted) ? highlighted : ordered[0]?.id ?? "";
  const isLive = !!selected && !!live.data?.has(selected.id);
  const filtering = !!(search || filter.grade || filter.track || filter.group);
  function back() { if (busy.current) return; if (review) setReview(false); else onBack(); }
  useImperativeHandle(ref, () => ({ back }));
  function chooseFacet(facet: AudienceFacet, id: string) {
    if (!lookup) return;
    setFilter(selectAudience(filter, facet, id, lookup)); setHighlighted("");
  }
  function clear() { setFilter(ANY_AUDIENCE); setSearch(""); setHighlighted(""); inputRef.current?.focus(); }
  async function confirm() {
    if (busy.current || !selected || failed || loading || !year) return;
    busy.current = true; setSubmitting(true); onBusyChange(true);
    try { if (await start(selected.id)) onComplete(); }
    finally { busy.current = false; setSubmitting(false); onBusyChange(false); }
  }
  const status = failed ? "Could not load schedules." : loading ? "Loading schedules…" : !year ? "No open academic year" : options.length === 0 ? "No active schedules" : null;
  return <div>
    <div className="flex items-center justify-between gap-2 px-3 pb-2">
      <Button type="button" variant="ghost" size="sm" aria-label={review ? "Back to schedules" : "Back to search"} disabled={submitting} onClick={back} className="gap-1.5 px-2 text-muted-foreground">
        <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={1.5} className="size-3.5" />{review ? "Schedules" : "Search"}
      </Button>
      <span className="pr-1 text-xs text-muted-foreground">{yearLabel}</span>
    </div>
    {review ? <div className="max-h-[55dvh] space-y-4 overflow-y-auto px-4 pb-4">
      {selected && lookup ? <>
        <div className="rounded-xl border p-4">
          <div className="mb-5 flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><HugeiconsIcon icon={isLive ? PlayIcon : Calendar03Icon} strokeWidth={1.5} className="size-5" /></div>
            <div className="min-w-0 flex-1"><p className="mb-1 text-xs text-muted-foreground">Review session</p><p dir="auto" className="font-medium">{selected.title}</p></div>
            {isLive && <Badge>Live now</Badge>}
          </div>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-3 text-sm">
            <dt className="text-muted-foreground">Audience</dt><dd dir="auto">{audienceLabel(selected, lookup)}</dd>
            <dt className="text-muted-foreground">Attendance</dt><dd>{selected.mandatory ? "Mandatory" : "Optional"} · In-person</dd>
            <dt className="text-muted-foreground">Schedule</dt><dd>{selected.kind === "recurring" ? "Recurring" : "One-off"}</dd>
            {selected.location && <><dt className="text-muted-foreground">Location</dt><dd dir="auto">{selected.location}</dd></>}
          </dl>
          <div className="mt-4 space-y-1 border-t pt-3 text-xs text-muted-foreground">
            {schedules.data?.slots.filter(slot => slot.schedule_id === selected.id).map(slot => <p key={slot.id}>{weekdayName(slot.weekday)} · {formatTime(slot.starts_at)}–{formatTime(slot.ends_at)}</p>)}
            {schedules.data?.sessions.filter(session => session.schedule_id === selected.id).map(session => <p key={session.id}>{session.occurs_on} · {formatTime(session.starts_at)}–{formatTime(session.ends_at)}</p>)}
          </div>
        </div>
        {failed && <p role="alert" className="text-sm text-destructive">Could not refresh schedules.</p>}
        <Button autoFocus type="button" className="w-full gap-2" disabled={submitting || failed || loading || !year} onClick={() => void confirm()}>{submitting ? "Opening session…" : isLive ? "Open live session" : "Start session"}<Kbd aria-hidden="true" className="border-0 bg-primary-foreground/10 text-primary-foreground">↵</Kbd></Button>
      </> : <p role="alert" className="py-5 text-sm text-destructive">This schedule is no longer available.</p>}
    </div> : <Command shouldFilter={false} label="Search schedules" value={highlightedId} onValueChange={setHighlighted} className="rounded-t-none!">
      <CommandInput ref={inputRef} autoFocus placeholder="Find a class, group or audience…" value={search} maxLength={100} onValueChange={value => { setSearch(value); setHighlighted(""); }}
        onKeyDown={event => { if (event.key === "Backspace" && !search && !event.nativeEvent.isComposing) { event.preventDefault(); back(); } }} />
      {lookup && !status && <div className="flex flex-wrap items-center gap-1.5 px-2 py-2" role="group" aria-label="Audience filters" onKeyDown={event => event.stopPropagation()}>
        {(["grade", "track", "group"] as const).map(facet => <AudienceFilterPicker key={facet} label={labels[facet]} value={filter[facet]}
          selectedLabel={filter[facet] ? facet === "grade" ? lookup.levelNames[filter.grade] : facet === "track" ? lookup.tracks.get(filter.track)?.name : lookup.groups.get(filter.group)?.name : undefined}
          choices={audienceChoices(options, lookup, filter, facet)} onSelect={id => chooseFacet(facet, id)} onDone={() => inputRef.current?.focus()} />)}
        {(filter.grade || filter.track || filter.group) && <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={clear}>Clear filters</Button>}
      </div>}
      <CommandList className="max-h-[42dvh]">
        {status ? <div className="flex min-h-32 items-center justify-center gap-3 px-4 py-6 text-sm text-muted-foreground" role={failed ? "alert" : "status"}>{status}{failed && <Button variant="outline" size="sm" onClick={retry}>Retry</Button>}</div> : <>
          {sections.filter(section => section.schedules.length).map(section => <CommandGroup key={section.label} heading={section.label}>
            {section.schedules.map(schedule => {
              const time = times.get(schedule.id), running = !!live.data?.has(schedule.id);
              return <CommandItem key={schedule.id} value={schedule.id} onSelect={() => { setSelectedId(schedule.id); setReview(true); }} className="min-h-16 cursor-pointer gap-3 px-3">
                <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${running ? "bg-primary/10 text-primary" : "bg-muted/70 text-muted-foreground"}`}><HugeiconsIcon icon={running ? PlayIcon : Calendar03Icon} strokeWidth={1.5} className="size-4" /></div>
                <div className="min-w-0 flex-1"><p dir="auto" className="truncate font-medium">{schedule.title}</p><p dir="auto" className="truncate text-xs text-muted-foreground">{audienceLabel(schedule, lookup!)}</p></div>
                {running ? <Badge variant="secondary" className="shrink-0 text-primary">Live</Badge> : time ? <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatTime(time.startsAt)}</span> : null}
                <CommandShortcut className="shrink-0 tracking-normal opacity-0 group-data-selected/command-item:opacity-100"><HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.5} className="size-3.5" /></CommandShortcut>
              </CommandItem>;
            })}
          </CommandGroup>)}
          {!available.length && <div className="py-10 text-center text-sm text-muted-foreground"><p role="status">No matching schedules</p>{filtering && <Button variant="ghost" size="sm" onClick={clear}>Clear search and filters</Button>}</div>}
        </>}
      </CommandList>
      <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground"><span><Kbd>Tab</Kbd> Filters</span><span><Kbd>↵</Kbd> Review</span><span><Kbd>Esc</Kbd> Back</span></div>
    </Command>}
    {live.isError && <div role="alert" className="flex items-center justify-between gap-2 px-4 pb-3 text-xs text-destructive"><span>Live session status unavailable</span><Button size="sm" variant="ghost" onClick={() => void live.refetch()}>Retry</Button></div>}
  </div>;
}
