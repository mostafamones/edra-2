import { HugeiconsIcon } from "@hugeicons/react";
import { SquareArrowUpRightIcon } from "@hugeicons/core-free-icons";
import Link from "@/components/shared/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Overview } from "../overview";
import { focus, heading } from "./shared";

/** Planned occurrences for today's Cairo date; not actual start times. */
export function TodayPlan({ items, base }: { items: Overview["today"]; base: string }) {
  return <Card aria-labelledby="home-today" className="min-w-0 flex-1 gap-0 rounded-xl py-0 shadow-none">
    <div className="flex items-center justify-between gap-2 border-b px-5 py-3"><h2 id="home-today" className={heading}>Today</h2><Button asChild variant="ghost" size="sm" className="-mr-2"><Link href={`${base}/schedules`}>Schedules<HugeiconsIcon icon={SquareArrowUpRightIcon} strokeWidth={1.5} aria-hidden="true" /></Link></Button></div>
    {items.length ? <ol className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3 p-4">{items.map((item, index) => <li key={`${item.id}:${item.startsAt}:${index}`} className="flex min-w-0 flex-col gap-2 rounded-lg border bg-muted/20 p-3">
      <span className="w-fit rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium tabular-nums text-primary">{item.startsAt.slice(0, 5)} – {item.endsAt.slice(0, 5)}</span>
      <div className="min-w-0"><p dir="auto" className="truncate text-sm font-medium">{item.title}</p>{item.location && <p dir="auto" className="truncate text-xs text-muted-foreground">{item.location}</p>}</div>
    </li>)}</ol> : <p className="px-5 py-12 text-center text-sm text-muted-foreground">No classes scheduled today</p>}
    {items.length === 12 && <Link href={`${base}/schedules`} className={`flex items-center gap-1.5 border-t px-5 py-2.5 text-xs ${focus}`}>View full schedule<HugeiconsIcon icon={SquareArrowUpRightIcon} strokeWidth={1.5} className="size-3.5" aria-hidden="true" /></Link>}
  </Card>;
}
