import Link from "@/components/shared/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import type { Overview } from "../overview";
import { focus, heading } from "./shared";

const initials = (name: string) => name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();

/** Students with two or more official absences in the last 28 days. */
export function StudentsToWatch({ students, base }: { students: NonNullable<Overview["watch"]>; base: string }) {
  return <Card aria-labelledby="home-watch" className="min-w-0 gap-0 rounded-xl py-0 shadow-none">
    <div className="flex items-center justify-between gap-2 border-b px-5 py-4"><h2 id="home-watch" className={heading}>Students to watch</h2><span className="text-xs text-muted-foreground">Absences · 28 days</span></div>
    {students.length ? <ul className="divide-y">{students.map(student => <li key={student.id}>
      <Link href={`${base}/students/${student.id}`} className={`flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/40 ${focus}`}>
        <Avatar className="size-8"><AvatarFallback className="text-xs">{initials(student.name)}</AvatarFallback></Avatar>
        <span className="min-w-0 flex-1"><span dir="auto" className="block truncate text-sm font-medium">{student.name}</span><span dir="auto" className="block truncate text-xs text-muted-foreground">{student.level}</span></span>
        <span className="shrink-0 text-right tabular-nums"><span className="block text-sm font-semibold text-destructive">{student.absent}</span><span className="block text-xs text-muted-foreground">of {student.counted}</span></span>
        <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.5} className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </li>)}</ul> : <p className="px-5 py-12 text-center text-sm text-muted-foreground">No repeated absences</p>}
  </Card>;
}
