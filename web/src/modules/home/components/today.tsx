import Link from "@/components/shared/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Overview } from "../overview";
import { focus, heading } from "./shared";

/** Planned occurrences for today's Cairo date; not actual start times. */
export function TodayPlan({ items, base }: { items: Overview["today"]; base: string }) {
  return <Card aria-labelledby="home-today" className="min-w-0 gap-0 rounded-xl py-0 shadow-none">
    <div className="flex items-center justify-between gap-2 border-b px-5 py-3"><h2 id="home-today" className={heading}>Today</h2><Button asChild variant="ghost" size="sm" className="-mr-2"><Link href={`${base}/schedules`}>Schedules</Link></Button></div>
    {items.length ? <ol className="divide-y">{items.map((item, index) => <li key={`${item.id}:${item.startsAt}:${index}`} className="flex gap-4 px-5 py-3">
      <div className="w-12 shrink-0 text-xs tabular-nums"><span className="block font-medium">{item.startsAt.slice(0, 5)}</span><span className="block text-muted-foreground">{item.endsAt.slice(0, 5)}</span></div>
      <div className="min-w-0 border-l pl-4"><p dir="auto" className="truncate text-sm font-medium">{item.title}</p>{item.location && <p dir="auto" className="truncate text-xs text-muted-foreground">{item.location}</p>}</div>
    </li>)}</ol> : <p className="px-5 py-12 text-center text-sm text-muted-foreground">No classes scheduled today</p>}
    {items.length === 12 && <Link href={`${base}/schedules`} className={`block border-t px-5 py-2.5 text-xs ${focus}`}>View full schedule</Link>}
  </Card>;
}
