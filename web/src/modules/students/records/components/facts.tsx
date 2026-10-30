import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Call02Icon, Mortarboard01Icon, UserAccountIcon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { Card, CardContent } from "@/components/ui/card";
import type { StudentRecord } from "../types";
import { formatPhone } from "../validation";

function Fact({ icon, label, children }: { icon: typeof Call02Icon; label: string; children: ReactNode }) {
  return <Card size="sm" className="bg-card/40 shadow-sm"><CardContent className="relative min-h-14 gap-1 pr-14">
    <span className="absolute right-3 top-0 flex size-9 items-center justify-center rounded-lg bg-muted text-chart-2"><HugeiconsIcon icon={icon} size={20} strokeWidth={1.5} aria-hidden="true" /></span>
    <dl className="space-y-1"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="min-w-0 break-words text-sm font-semibold">{children}</dd></dl>
  </CardContent></Card>;
}

export function StudentFacts({ student, grade, track, group }: { student: StudentRecord; grade: string; track?: string; group?: string }) {
  return <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
    <Fact icon={Mortarboard01Icon} label="Placement">{grade}{track && <span className="mt-1 block text-xs font-normal text-muted-foreground">{track}</span>}</Fact>
    {student.participationType === "in_person" && <Fact icon={UserGroupIcon} label="Group">{group}</Fact>}
    <Fact icon={Call02Icon} label="Student phone"><a dir="ltr" href={`tel:${student.studentPhone}`} className="rounded text-xs hover:underline focus-visible:ring-2 focus-visible:ring-ring sm:text-sm" aria-label={`Call student: ${formatPhone(student.studentPhone)}`}>{formatPhone(student.studentPhone)}</a></Fact>
    <Fact icon={Call02Icon} label="Parent phone"><a dir="ltr" href={`tel:${student.parentPhone}`} className="rounded text-xs hover:underline focus-visible:ring-2 focus-visible:ring-ring sm:text-sm" aria-label={`Call parent: ${formatPhone(student.parentPhone)}`}>{formatPhone(student.parentPhone)}</a></Fact>
    {student.participationType === "online_only" && <Fact icon={UserAccountIcon} label="Online account">{{ connected: "Connected", suspended: "Suspended", not_connected: "Not connected" }[student.onlineAccount]}</Fact>}
  </div>;
}
