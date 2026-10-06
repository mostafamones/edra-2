"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { useRouter } from "next/navigation";
import { IconAlertCircle, IconBroadcast, IconHistory, IconPlayerPlay, IconSearch, IconSearchOff } from "@tabler/icons-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import type { AcademyEntry } from "@/modules/academies";
import { AcademyGate } from "@/modules/auth";
import { useCanonicalHref } from "@/modules/navigation";
import { HistorySessionCard } from "./history-card";
import { HistoryRange } from "./history-range";
import { LiveSessionCard } from "./live-card";
import { StartSessionDialog } from "./start-dialog";
import { UpcomingCard } from "./upcoming-card";
import { useSessionsData } from "./use-start-data";
import { useStartSession } from "./use-start-session";

/** `startOpen` opens the start dialog on load (the /sessions/new route). */
export function SessionsPage({ startOpen = false }: { startOpen?: boolean }) {
  return <AcademyGate>{(academy) => <SessionsContent academy={academy} startOpen={startOpen} />}</AcademyGate>;
}

/** The search text, applied after the user pauses typing. */
function useDebounced(value: string, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function SectionHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return <h2 id={id} className="text-sm font-semibold">{children}</h2>;
}

function SessionsContent({ academy, startOpen }: { academy: AcademyEntry; startOpen: boolean }) {
  const router = useRouter();
  const href = useCanonicalHref();
  const [dialogOpen, setDialogOpen] = useState(startOpen);
  const [searchText, setSearchText] = useState("");
  const search = useDebounced(searchText.trim());
  const [range, setRange] = useState<DateRange | undefined>();
  const filter = useMemo(() => ({
    search,
    from: range?.from ? format(range.from, "yyyy-MM-dd") : null,
    to: range?.from ? format(range.to ?? range.from, "yyyy-MM-dd") : null,
  }), [search, range]);
  const filtered = search !== "" || filter.from !== null;
  const { live, liveSessions, liveBySchedule, history, pastSessions, upcoming, options } = useSessionsData(academy.id, filter);
  const { start, pendingId } = useStartSession(academy.id);

  const startButton = <Button size="sm" onClick={() => setDialogOpen(true)}><IconPlayerPlay />Start session</Button>;
  const onDialogChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open && startOpen) router.replace(href("/app/sessions"));
  };

  return (
    <main className="page-shell">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold tracking-tight">Sessions</h1>
        {startButton}
      </div>
      <StartSessionDialog academyId={academy.id} open={dialogOpen} onOpenChange={onDialogChange} liveBySchedule={liveBySchedule} />

      {!(live.data && liveSessions.length === 0 && upcoming.length > 0) && (
      <section aria-labelledby="live-heading" className="flex flex-col gap-2.5">
        <SectionHeading id="live-heading">Live now</SectionHeading>

        {live.isError && (
          <Alert variant="destructive">
            <IconAlertCircle />
            <AlertTitle>{live.data ? "Couldn’t refresh live sessions" : "Couldn’t load live sessions"}</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-3">
              {live.data ? "Showing the last loaded sessions." : "Check your connection and try again."}
              <Button variant="outline" size="sm" onClick={() => void live.refetch()} disabled={live.isFetching}>
                {live.isFetching ? "Retrying…" : "Retry"}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {live.isPending && (
          <div role="status" aria-label="Loading live sessions" className="grid gap-2">
            {[0, 1].map((index) => <Skeleton key={index} className="h-16 rounded-xl" />)}
          </div>
        )}

        {live.data && (liveSessions.length === 0 ? (
          <Empty className="min-h-40 rounded-xl border border-dashed border-border bg-card/20 py-10">
            <EmptyHeader className="gap-1">
              <EmptyMedia variant="icon"><IconBroadcast aria-hidden="true" /></EmptyMedia>
              <EmptyTitle>No live sessions</EmptyTitle>
              <EmptyDescription>Start one to take attendance.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid gap-2">
            {liveSessions.map((session) => <LiveSessionCard key={session.id} session={session} />)}
            {live.hasNextPage && (
              <Button variant="ghost" size="sm" className="justify-self-center" onClick={() => void live.fetchNextPage()} disabled={live.isFetchingNextPage}>
                {live.isFetchingNextPage ? "Loading…" : "Show more"}
              </Button>
            )}
          </div>
        ))}
      </section>
      )}

      {upcoming.length > 0 && (
        <section aria-labelledby="upcoming-heading" className="flex flex-col gap-2.5">
          <SectionHeading id="upcoming-heading">Upcoming today</SectionHeading>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {upcoming.map((item) => (
              <UpcomingCard
                key={item.schedule.id}
                item={item}
                lookup={options.lookup}
                starting={pendingId === item.schedule.id}
                disabled={pendingId !== null}
                onStart={(id) => void start(id)}
              />
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="history-heading" className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeading id="history-heading">History</SectionHeading>
          <div className="flex items-center gap-2">
            <HistoryRange value={range} onChange={setRange} />
            <InputGroup className="sm:w-72">
            <InputGroupInput
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search by class, group, or teacher"
              aria-label="Search session history"
            />
            <InputGroupAddon><IconSearch /></InputGroupAddon>
            </InputGroup>
          </div>
        </div>

        {history.isError && (
          <Alert variant="destructive">
            <IconAlertCircle />
            <AlertTitle>Couldn’t load history</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-3">
              Check your connection and try again.
              <Button variant="outline" size="sm" onClick={() => void history.refetch()} disabled={history.isFetching}>
                {history.isFetching ? "Retrying…" : "Retry"}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {history.isPending && (
          <div role="status" aria-label="Loading history" className="grid gap-2">
            {[0, 1, 2].map((index) => <Skeleton key={index} className="h-16 rounded-xl" />)}
          </div>
        )}

        {history.data && (pastSessions.length === 0 ? (
          filtered ? (
            <Empty className="min-h-40 rounded-xl border border-dashed border-border py-10">
              <EmptyHeader className="gap-1">
                <EmptyMedia variant="icon"><IconSearchOff aria-hidden="true" /></EmptyMedia>
                <EmptyTitle>No matching sessions</EmptyTitle>
                <EmptyDescription>Try a different search or dates.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent><Button size="sm" variant="outline" onClick={() => { setSearchText(""); setRange(undefined); }}>Clear filters</Button></EmptyContent>
            </Empty>
          ) : (
            <Empty className="min-h-40 rounded-xl border border-dashed border-border bg-card/20 py-10">
              <EmptyHeader className="gap-1">
                <EmptyMedia variant="icon"><IconHistory aria-hidden="true" /></EmptyMedia>
                <EmptyTitle>No past sessions</EmptyTitle>
                <EmptyDescription>Finished sessions appear here.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )
        ) : (
          <div className="grid gap-2">
            {pastSessions.map((session) => <HistorySessionCard key={session.id} session={session} canDelete={academy.role === "owner" || academy.role === "admin"} />)}
            {history.hasNextPage && (
              <Button variant="ghost" size="sm" className="justify-self-center" onClick={() => void history.fetchNextPage()} disabled={history.isFetchingNextPage}>
                {history.isFetchingNextPage ? "Loading…" : "Show more"}
              </Button>
            )}
          </div>
        ))}
      </section>
    </main>
  );
}
