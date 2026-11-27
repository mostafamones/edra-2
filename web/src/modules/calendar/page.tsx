import Link from "@/components/shared/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, ArrowLeft01Icon, ArrowRight01Icon, PreferenceHorizontalIcon,  } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FilterPopover } from "@/components/shared/filter-popover";
import { ToggleBadge, ToggleBadgeGroup } from "@/components/shared/toggle-badge";
import { AcademyGate } from "@/modules/auth";
import { formatClock, useTimeFormat } from "@/modules/account";
import type { AcademyEntry } from "@/modules/academies";
import { assessmentCalendarOptions } from "@/modules/assessments";
import { groupListQueryKey, loadGroups, loadStructure, structureQueryKey } from "@/modules/groups";
import { academyNow, buildAudienceLookup, loadSchedules, scheduleListQueryKey } from "@/modules/schedules";
import { useStartSession } from "@/modules/sessions";
import { useCanonicalHref } from "@/modules/navigation";
import { calendarEvents, dateLabel, layoutEvents, minutes, shiftDay, weekDays } from "./events";
import { EventButton } from "./event";
import { calendarHistoryOptions, calendarLiveOptions } from "./queries";

const HOUR = 72;

export function StaffCalendarPage() {
  return <AcademyGate>{academy => <CalendarContent key={academy.id} academy={academy} />}</AcademyGate>;
}

function CalendarContent({ academy }: { academy: AcademyEntry }) {
  const href = useCanonicalHref();
  const { format: timeFormat } = useTimeFormat();
  const clock = (value: number) => formatClock(value, timeFormat);
  const [wall, setWall] = useState(academyNow);
  const [selected, setSelected] = useState(() => academyNow().slice(0, 10));
  const [view, setView] = useState("week"), [level, setLevel] = useState("all");
  const [track, setTrack] = useState("all"), [group, setGroup] = useState("all");
  const [sessionsVisible, setSessionsVisible] = useState(true), [assessmentsVisible, setAssessmentsVisible] = useState(true);
  useEffect(() => { const timer = setInterval(() => setWall(academyNow()), 60_000); return () => clearInterval(timer); }, []);
  const today = wall.slice(0, 10), days = weekDays(selected);
  const schedules = useQuery({ queryKey: scheduleListQueryKey(academy.id), queryFn: () => loadSchedules(academy.id) });
  const structure = useQuery({ queryKey: structureQueryKey(academy.id), queryFn: () => loadStructure(academy.id) });
  const groups = useQuery({ queryKey: groupListQueryKey(academy.id, false), queryFn: () => loadGroups(academy.id) });
  const archivedGroups = useQuery({ queryKey: groupListQueryKey(academy.id, true), queryFn: () => loadGroups(academy.id, { archived: true }) });
  const year = schedules.data?.year;
  const assessments = useQuery({ ...assessmentCalendarOptions(academy.id, year?.id ?? ""), enabled: !!year });
  const live = useInfiniteQuery(calendarLiveOptions(academy.id));
  const history = useInfiniteQuery(calendarHistoryOptions(academy.id, shiftDay(days[0], -1), days[6]));
  const { start, pendingId } = useStartSession(academy.id);
  // Complete the existing paginated queries without changing their cache shape or duplicating endpoints.
  const { hasNextPage: liveHasMore, isFetching: liveFetching, isError: liveError, fetchNextPage: fetchMoreLive } = live;
  const { hasNextPage: historyHasMore, isFetching: historyFetching, isError: historyError, fetchNextPage: fetchMoreHistory } = history;
  useEffect(() => { if (liveHasMore && !liveFetching && !liveError) void fetchMoreLive(); }, [liveHasMore, liveFetching, liveError, fetchMoreLive]);
  useEffect(() => { if (historyHasMore && !historyFetching && !historyError) void fetchMoreHistory(); }, [historyHasMore, historyFetching, historyError, fetchMoreHistory]);
  const queries = [schedules, structure, groups, archivedGroups, live, history, ...(year ? [assessments] : [])];
  const failures = queries.filter(query => query.isError);
  const loading = queries.some(query => query.isPending) || (live.hasNextPage && !live.isError) || (history.hasNextPage && !history.isError);
  const events = useMemo(() => {
    if (!schedules.data || !structure.data || !groups.data || !archivedGroups.data) return [];
    return calendarEvents({ days: weekDays(selected), today, ...schedules.data,
      dates: schedules.data.sessions,
      lookup: buildAudienceLookup({ groups: [...groups.data.groups, ...archivedGroups.data.groups], tracks: structure.data.historicalTracks, levelNames: structure.data.levelNames }),
      sessions: [...(history.data?.pages.flatMap(page => page.sessions) ?? []), ...(live.data?.pages.flatMap(page => page.sessions) ?? [])].filter(session => session.academicYearId === schedules.data.year?.id),
      assessments: assessments.data ?? [],
    });
  }, [selected, today, schedules.data, structure.data, groups.data, archivedGroups.data, live.data, history.data, assessments.data]);
  const visible = events.filter(event => (event.kind === "session" ? sessionsVisible : assessmentsVisible)
    && (level === "all" || event.levelIds.includes(level)) && (track === "all" || event.trackIds?.includes(track)) && (group === "all" || event.groupIds?.includes(group)));
  const timed = visible.filter(event => !event.deadline && !event.window);
  const firstHour = 0, lastHour = 24;
  const hourLabel = (hour: number) => `${hour % 12 || 12} ${hour % 24 < 12 ? "AM" : "PM"}`;
  const scroller = useRef<HTMLDivElement>(null);
  const weekStart = days[0];
  // Centre the now line (or 8 AM on other weeks) once the grid exists; the user scrolls freely afterwards.
  useEffect(() => {
    const box = scroller.current; if (!box) return;
    const now = box.querySelector<HTMLElement>("[data-now]");
    const head = box.firstElementChild?.getBoundingClientRect().height ?? 0;
    box.scrollTop = now ? now.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - (box.clientHeight + head) / 2 : 8 * HOUR;
  }, [weekStart, loading, view, year]);
  const height = (lastHour - firstHour) * HOUR;
  const renderEvent = (event: (typeof events)[number], compact = false) => <EventButton key={event.id} event={event} format={timeFormat} compact={compact} today={today} pending={pendingId !== null} onStart={id => void start(id)} />;
  const changeWeek = (delta: number) => setSelected(day => shiftDay(day, delta * 7));

  return <main className="page-shell">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="mr-auto flex flex-col"><h1 className="text-2xl font-semibold tracking-tight">{dateLabel(selected, { month: "long", year: "numeric" })}</h1><span className="text-sm text-muted-foreground">{dateLabel(days[0], { day: "numeric", month: "short" })} – {dateLabel(days[6], { day: "numeric", month: "short" })} · Cairo</span></div>
      <FilterPopover iconOnly icon={PreferenceHorizontalIcon} label="View options" sections={[{ id: "show", active: !sessionsVisible || !assessmentsVisible, onReset: () => { setSessionsVisible(true); setAssessmentsVisible(true); },
        content: <ToggleBadgeGroup legend="Show">{[{ label: "Sessions", checked: sessionsVisible, change: setSessionsVisible }, { label: "Assessments", checked: assessmentsVisible, change: setAssessmentsVisible }].map(toggle => <ToggleBadge key={toggle.label} pressed={toggle.checked} onPressedChange={toggle.change}>{toggle.label}</ToggleBadge>)}</ToggleBadgeGroup> }]} fields={[
        { id: "grade", label: "Grade", value: level, defaultValue: "all", onChange: value => { setLevel(value); setTrack("all"); setGroup("all"); }, options: [{ value: "all", label: "All grades" }, ...(structure.data?.historicalLevels.map(item => ({ value: item.level_id, label: structure.data.levelNames[item.level_id] ?? item.level_id })) ?? [])] },
        { id: "track", label: "Track", value: track, defaultValue: "all", onChange: value => { setTrack(value); setGroup("all"); }, options: [{ value: "all", label: "All tracks" }, ...(structure.data?.historicalTracks.filter(item => level === "all" || item.level_id === level).map(item => ({ value: item.id, label: item.name })) ?? [])] },
        { id: "group", label: "Group", value: group, defaultValue: "all", onChange: setGroup, options: [{ value: "all", label: "All groups" }, ...[...(groups.data?.groups ?? []), ...(archivedGroups.data?.groups ?? [])].filter(item => (level === "all" || item.level_id === level) && (track === "all" || item.track_id === track)).map(item => ({ value: item.id, label: item.name }))] },
      ]} />
      <div className="hidden rounded-lg bg-card p-1 md:flex" role="group" aria-label="Calendar view">{[["week", "Week"], ["agenda", "Agenda"]].map(([value, label]) => <Button key={value} size="sm" variant={view === value ? "secondary" : "ghost"} aria-pressed={view === value} onClick={() => setView(value)}>{label}</Button>)}</div>
      <div className="flex items-center rounded-lg bg-card p-1">
        <Button variant="ghost" size="icon-sm" aria-label="Previous week" onClick={() => changeWeek(-1)}><HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={1.5} /></Button>
        <Button variant="ghost" size="sm" onClick={() => setSelected(today)}>Today</Button>
        <Button variant="ghost" size="icon-sm" aria-label="Next week" onClick={() => changeWeek(1)}><HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.5} /></Button>
      </div>
      <DropdownMenu><DropdownMenuTrigger asChild><Button>Create<HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={1.5} className="size-3.5" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">{[["Schedule", "schedules"], ["Assignment", "assignments"], ["Quiz", "quizzes"], ["Exam", "exams"]].map(([label, path]) => <DropdownMenuItem key={path} asChild><Link href={href(`/app/${path}/new`)}>{label}</Link></DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>
    </div>
    {failures.length > 0 && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 p-4 text-sm"><span>Couldn’t refresh {failures.map(query => query === assessments ? "assessments" : query === live || query === history ? "sessions" : "schedules").filter((name, index, names) => names.indexOf(name) === index).join(" and ")}. Calendar may be incomplete.</span><Button size="sm" variant="outline" onClick={() => failures.forEach(query => void query.refetch())}>Retry</Button></div>}
    {loading && <div role="status" aria-label="Loading calendar"><Skeleton className="h-96 w-full" /></div>}
    {!loading && !year && <div className="rounded-xl bg-card p-8 text-center">No open academic year</div>}
    {!loading && year && <>
      <div className={`space-y-5 ${view === "week" ? "md:hidden" : ""}`}>
        <div className="grid grid-cols-7 gap-1" aria-label="Choose a day">{days.map(day => <Button key={day} variant={selected === day ? "default" : "ghost"} className="h-auto flex-col gap-2 px-1 py-3" aria-pressed={selected === day} onClick={() => setSelected(day)}><span className="text-xs">{dateLabel(day, { weekday: "narrow" })}</span>{Number(day.slice(-2))}</Button>)}</div>
        <h2 className="font-medium">{dateLabel(selected, { weekday: "long", day: "numeric", month: "long" })}</h2>
        {visible.filter(event => event.day === selected).map(event => <div key={event.id} className="min-h-20">{renderEvent(event)}</div>)}
        {!visible.some(event => event.day === selected) && <div className="rounded-xl bg-card p-8 text-center text-sm text-muted-foreground">{failures.length ? "Calendar unavailable" : "No events"}</div>}
      </div>
      {view === "week" && <div ref={scroller} className="hidden max-h-[calc(100svh-15rem)] min-h-96 overflow-y-auto rounded-xl border border-border/60 bg-card/30 md:block">
        <div className="sticky top-0 z-20 grid grid-cols-[4.5rem_repeat(7,minmax(0,1fr))] bg-background">
          <div className="bg-muted/20" />{days.map(day => <button key={day} type="button" aria-label={`Show agenda for ${day}`} onClick={() => { setSelected(day); setView("agenda"); }} className={`flex items-center justify-center gap-2 border-l border-border/40 px-2 py-3 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring ${day === today ? "bg-primary/5" : "bg-muted/20"}`}><span className={`text-xs font-medium uppercase tracking-wide ${day === today ? "text-primary" : "text-muted-foreground"}`}>{dateLabel(day, { weekday: "short" })}</span><span className={`flex size-8 items-center justify-center rounded-full text-base font-semibold tabular-nums ${day === today ? "bg-primary text-primary-foreground" : ""}`}>{Number(day.slice(-2))}</span></button>)}
          <span className="border-t border-border/40 bg-muted/20 px-2 py-2 text-[11px] leading-4 text-muted-foreground">Due &<br />windows</span>{days.map(day => <div key={day} className={`min-h-12 space-y-1 border-l border-t border-border/40 p-1.5 ${day === today ? "bg-primary/5" : "bg-muted/20"}`}>{visible.filter(event => (event.deadline || event.window) && event.day === day).map(event => renderEvent(event, true))}</div>)}
        </div>
        <div className="grid grid-cols-[4.5rem_repeat(7,minmax(0,1fr))]">
          <div className="relative border-t border-border/50" style={{ height }}>{Array.from({ length: lastHour - firstHour }, (_, index) => <span key={index} className="absolute left-2 text-[11px] tabular-nums text-muted-foreground" style={{ top: index * HOUR + 4 }}>{hourLabel(firstHour + index)}</span>)}</div>
          {days.map(day => <div key={day} className={`relative border-l border-border/30 ${day === today ? "bg-primary/5" : ""}`} style={{ height }}>
            {Array.from({ length: lastHour - firstHour }, (_, index) => <div key={index} className="absolute inset-x-0 border-t border-border/40" style={{ top: index * HOUR }} />)}
            {layoutEvents(timed.filter(event => event.day === day)).map(({ event, lane, lanes }) => <div key={event.id} className="absolute z-10 px-1" style={{ top: (event.start / 60 - firstHour) * HOUR + 2, height: Math.max(28, (event.end - event.start) / 60 * HOUR - 4), left: `${lane / lanes * 100}%`, width: `${100 / lanes}%` }}>{renderEvent(event, event.end - event.start < 75 || lanes > 1)}</div>)}
            {day === today && minutes(wall.slice(11)) >= firstHour * 60 && minutes(wall.slice(11)) < lastHour * 60 && <div data-now aria-label={`Current time ${clock(minutes(wall.slice(11)))}`} className="pointer-events-none absolute inset-x-0 border-t border-destructive before:absolute before:-left-0.5 before:-top-1 before:size-1.5 before:rounded-full before:bg-destructive" style={{ top: (minutes(wall.slice(11)) / 60 - firstHour) * HOUR }} />}
          </div>)}
        </div>
        {!visible.length && <p className="pt-4 text-center text-sm text-muted-foreground">{failures.length ? "Calendar unavailable" : "No events this week"}</p>}
      </div>}
    </>}
  </main>;
}
