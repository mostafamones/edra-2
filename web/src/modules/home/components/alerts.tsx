import Link from "@/components/shared/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, AssignmentsIcon, BookOpen01Icon, Calendar03Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { LiveSession } from "@/modules/sessions";
import type { Overview } from "../overview";
import { focus, heading } from "./shared";

const kinds = {
  attendance: { label: "Finalize attendance", icon: Calendar03Icon, path: "/attendance/", tone: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  review: { label: "Unit awaiting publication", icon: BookOpen01Icon, path: "/content/", tone: "bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  assignment: { label: "Online assignment submissions to mark", icon: AssignmentsIcon, path: "/assignments/", tone: "bg-violet-500/10 text-violet-700 dark:text-violet-300" },
};

/** Live sessions, then the oldest actionable items. `live` is null while unknown or failed. */
export function HomeAlerts({ data, live, base }: { data: Overview; live: LiveSession[] | null; base: string }) {
  const total = data.attentionCount + (live?.length ?? 0);
  return <Card aria-labelledby="home-alerts" className="min-w-0 gap-0 rounded-xl py-0 shadow-none">
    <div className="flex items-center justify-between gap-2 border-b px-5 py-4"><h2 id="home-alerts" className={heading}>Alerts</h2>{total > 0 && <Badge variant="secondary" className="tabular-nums">{total}</Badge>}</div>
    {total === 0 ? <div className="flex flex-col items-center justify-center gap-2 px-5 py-8 text-center text-sm text-muted-foreground"><HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={1.5} className="size-6" aria-hidden="true" />All caught up</div> : <ul className="divide-y">
      {live?.map(session => <li key={session.id}><Link href={`${base}/attendance/${session.id}`} className={`flex items-center gap-3 px-5 py-3 transition-colors hover:bg-primary/5 ${focus}`}>
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10" aria-hidden="true"><span className="relative flex size-2.5"><span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:hidden" /><span className="relative inline-flex size-2.5 rounded-full bg-primary" /></span></span>
        <span className="min-w-0 flex-1"><span dir="auto" className="block truncate text-sm font-medium">{session.scheduleTitle}</span><span className="block text-xs text-primary">Live now</span></span>
        <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.5} className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link></li>)}
      {data.attention.map(item => {
        const kind = kinds[item.kind];
        return <li key={`${item.kind}:${item.id}`}><Link href={`${base}${kind.path}${item.id}`} className={`flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/40 ${focus}`}>
          <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${kind.tone}`}><HugeiconsIcon icon={kind.icon} strokeWidth={1.5} className="size-4" aria-hidden="true" /></span>
          <span className="min-w-0 flex-1"><span dir="auto" className="block truncate text-sm font-medium">{item.title}</span><span className="block text-xs text-muted-foreground">{kind.label}{item.kind === "assignment" ? ` · ${item.amount}` : ""}</span></span>
          <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.5} className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link></li>;
      })}
    </ul>}
    {data.attentionCount > data.attention.length && <p className="border-t px-5 py-2.5 text-xs text-muted-foreground">Showing the oldest {data.attention.length} of {data.attentionCount} items</p>}
  </Card>;
}
