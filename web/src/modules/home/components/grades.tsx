import Link from "@/components/shared/link";
import { Card } from "@/components/ui/card";
import type { Overview } from "../overview";
import { focus, heading } from "./shared";

/** Enrollment per grade, split by participation; each row opens the grade's student filter. */
export function StudentsByGrade({ data, base }: { data: Overview; base: string }) {
  const max = Math.max(1, ...data.students.levels.map(level => level.total));
  return <Card aria-labelledby="home-students" className="min-w-0 gap-4 rounded-xl p-5 shadow-none">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id="home-students" className={heading}>Students by grade</h2>
      <span className="flex items-center gap-3 text-xs text-muted-foreground"><span className="flex items-center gap-1.5" aria-hidden="true"><span className="size-2 rounded-full bg-primary" />In person</span><span className="flex items-center gap-1.5" aria-hidden="true"><span className="size-2 rounded-full bg-[var(--chart-2)]" />Online</span><span>{data.year}–{data.year! + 1}</span></span>
    </div>
    {data.students.total ? <ul className="-mx-2 grid gap-x-8 gap-y-1 lg:grid-cols-2">{data.students.levels.map(level => <li key={level.id}>
      <Link href={`${base}/students?level=${encodeURIComponent(level.id)}`} className={`grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/40 ${focus}`}>
        <span dir="auto" className="truncate text-sm font-medium">{level.name}</span>
        <span className="flex h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <span className="bg-primary" style={{ width: `${(level.total - level.online) / max * 100}%` }} />
          <span className="bg-[var(--chart-2)]" style={{ width: `${level.online / max * 100}%` }} />
        </span>
        <span className="text-right text-sm tabular-nums"><span className="font-semibold">{level.total}</span><span className="sr-only"> students, </span><span className="block text-xs text-muted-foreground">{level.total - level.online} in person · {level.online} online</span></span>
      </Link>
    </li>)}</ul> : <p className="py-6 text-sm text-muted-foreground">No active students</p>}
  </Card>;
}
