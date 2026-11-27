import Link from "@/components/shared/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatAcademyRelative } from "@/lib/academy-time";
import type { Overview } from "../overview";
import { focus, heading } from "./shared";

/** Latest ended sessions with their attendance; drafts are labelled rather than mixed with official results. */
export function RecentSessions({ sessions, base }: { sessions: NonNullable<Overview["recent"]>; base: string }) {
  return <Card aria-labelledby="home-recent" className="min-w-0 gap-0 rounded-xl py-0 shadow-none">
    <div className="flex items-center justify-between gap-2 border-b px-5 py-3"><h2 id="home-recent" className={heading}>Recent sessions</h2><Button asChild variant="ghost" size="sm" className="-mr-2"><Link href={`${base}/attendance`}>All sessions</Link></Button></div>
    {sessions.length ? <ul className="divide-y">{sessions.map(session => {
      const percent = session.counted ? Math.round(session.attended / session.counted * 100) : null;
      return <li key={session.id}><Link href={`${base}/attendance/${session.id}`} className={`block space-y-2 px-5 py-3 transition-colors hover:bg-muted/40 ${focus}`}>
        <span className="flex items-center gap-2">
          <span dir="auto" className="min-w-0 flex-1 truncate text-sm font-medium">{session.title}</span>
          {!session.finalized && <Badge variant="outline">Draft</Badge>}
          <span className="shrink-0 text-sm font-semibold tabular-nums">{percent === null ? "—" : `${percent}%`}</span>
        </span>
        <span className="flex items-center gap-3">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true"><span className="block h-full rounded-full bg-[var(--chart-2)]" style={{ width: `${percent ?? 0}%` }} /></span>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{session.attended}/{session.counted} · <time dateTime={session.startedAt}>{formatAcademyRelative(session.startedAt)}</time></span>
        </span>
      </Link></li>;
    })}</ul> : <p className="px-5 py-12 text-center text-sm text-muted-foreground">No ended sessions yet</p>}
  </Card>;
}
