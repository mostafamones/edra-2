import { useState } from "react";
import { IconBook, IconCalendar, IconClipboardCheck, IconFileText, IconPlayerPlay, IconSchool } from "@/components/shared/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const steps = [
  { id: "attendance", label: "Attendance", icon: IconCalendar },
  { id: "lessons", label: "Lessons", icon: IconBook },
  { id: "results", label: "Results", icon: IconClipboardCheck },
];

const students = [
  { id: "mariam", name: "Mariam Hassan", initials: "MH", score: 18 },
  { id: "omar", name: "Omar Nasser", initials: "ON", score: 16 },
  { id: "youssef", name: "Youssef Ali", initials: "YA", score: 17 },
] as const;

const lessons = [
  { name: "Worked examples", type: "Video", icon: IconPlayerPlay },
  { name: "Practice problems", type: "Assignment", icon: IconFileText },
  { name: "Quadratics recap", type: "Quiz", icon: IconClipboardCheck },
];

const statuses = [
  { value: "unmarked", label: "Unmarked", color: "bg-muted-foreground" },
  { value: "present", label: "Present", color: "bg-emerald-600 dark:bg-emerald-400" },
  { value: "late", label: "Late", color: "bg-amber-600 dark:bg-amber-400" },
  { value: "absent", label: "Absent", color: "bg-destructive" },
];

const initialAttendance = { mariam: "present", omar: "late", youssef: "unmarked" };

const panelClass = "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";
const panelBodyClass = "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-200";
const panelHeaderClass = "flex min-h-20 items-center justify-between gap-3 border-b px-3 py-3 sm:px-5";
const rowClass = "flex min-h-14 items-center gap-2 py-2 sm:gap-3";
const avatarClass = "hidden size-8 shrink-0 place-items-center rounded-lg bg-muted text-xs font-semibold text-foreground/75 sm:grid";

export function WorkflowPreview() {
  const [activeStep, setActiveStep] = useState(steps[0].id);
  const [attendance, setAttendance] = useState(initialAttendance);
  const marked = Object.values(attendance).filter(status => status !== "unmarked").length;
  const activeIndex = steps.findIndex(step => step.id === activeStep);

  return (
    <section
      id="workflow"
      aria-labelledby="workspace-heading"
      className="min-w-0 scroll-mt-5 rounded-[1.75rem] border border-primary/15 bg-primary/[0.06] p-2.5 sm:p-5 xl:p-6 dark:border-primary/40 dark:bg-primary/10"
    >
      <Card className="gap-0 rounded-[1.25rem] bg-card py-0 shadow-sm ring-1">
        <header className="flex min-h-17 flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b px-3 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="hidden size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-emerald-800 sm:grid dark:bg-primary/25 dark:text-emerald-300">
              <IconSchool className="size-5" aria-hidden="true" />
            </span>
            <h2 id="workspace-heading" className="font-sans font-semibold sm:text-base">Grade 10 Mathematics</h2>
          </div>
          <Badge variant="outline" className="rounded-full text-foreground/75">Sample workspace</Badge>
        </header>

        <Tabs value={activeStep} onValueChange={setActiveStep} className="gap-0">
          <TabsList
            aria-label="Sample workspace"
            className="group-data-horizontal/tabs:h-12 relative mx-3 my-3 grid w-auto grid-cols-3 rounded-xl p-1 sm:mx-5"
          >
            <div aria-hidden="true" className="pointer-events-none absolute inset-1 grid grid-cols-3">
              <span
                className="rounded-lg bg-card shadow-xs ring-1 ring-foreground/10 motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out"
                style={{ transform: `translateX(${100 * activeIndex}%)` }}
              />
            </div>
            {steps.map(({ id, label, icon: Icon }) => (
              <TabsTrigger
                key={id}
                value={id}
                className="h-full rounded-lg px-0.5 text-xs text-foreground/75 data-active:border-transparent data-active:bg-transparent data-active:shadow-none group-data-[variant=default]/tabs-list:data-active:shadow-none motion-reduce:transition-none sm:text-sm dark:data-active:border-transparent dark:data-active:bg-transparent"
              >
                <Icon className="hidden size-4 min-[420px]:block" aria-hidden="true" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="attendance" className={panelClass}>
            <div className={panelBodyClass}>
              <div className={panelHeaderClass}>
                <div className="min-w-0 flex-1">
                  <h3 className="font-sans font-semibold">Tuesday class</h3>
                  <p role="status" className="mt-0.5 text-xs tabular-nums text-muted-foreground">{marked} of {students.length} marked</p>
                  <Progress
                    aria-label="Attendance marked"
                    value={100 * marked / students.length}
                    className="mt-2 h-1 max-w-32 motion-reduce:[&>*]:transition-none"
                  />
                </div>
                <Button type="button" variant="ghost" size="sm" className="motion-reduce:transition-none" onClick={() => setAttendance(initialAttendance)}>
                  Reset sample
                </Button>
              </div>
              <ul className="divide-y px-3 sm:px-5">
                {students.map(({ id, name, initials }) => (
                  <li key={id} className={rowClass}>
                    <span className={avatarClass} aria-hidden="true">{initials}</span>
                    <span className="min-w-0 flex-1 font-medium">{name}</span>
                    <Select value={attendance[id]} onValueChange={value => setAttendance(current => ({ ...current, [id]: value }))}>
                      <SelectTrigger aria-label={`Attendance for ${name}`} className="w-28 shrink-0 bg-muted text-xs motion-reduce:transition-none sm:w-32 sm:text-sm">
                        <SelectValue>{statuses.find(status => status.value === attendance[id])?.label}</SelectValue>
                      </SelectTrigger>
                      <SelectContent position="popper" align="end">
                        {statuses.map(({ value, label, color }) => (
                          <SelectItem key={value} value={value}>
                            <span className={`size-1.5 shrink-0 rounded-full ${color}`} aria-hidden="true" />
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </li>
                ))}
              </ul>
            </div>
          </TabsContent>

          <TabsContent value="lessons" className={panelClass}>
            <div className={panelBodyClass}>
              <div className={panelHeaderClass}>
                <h3 className="font-sans font-semibold">Quadratic equations</h3>
                <Badge variant="secondary" className="rounded-full">Released</Badge>
              </div>
              <ul className="divide-y px-3 sm:px-5">
                {lessons.map(({ name, type, icon: Icon }) => (
                  <li key={name} className={rowClass}>
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-foreground/75">
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1 font-medium">{name}</span>
                    <Badge variant="secondary" className="rounded-full">{type}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          </TabsContent>

          <TabsContent value="results" className={panelClass}>
            <div className={panelBodyClass}>
              <div className={panelHeaderClass}>
                <h3 className="font-sans font-semibold">Practice problems</h3>
                <Badge variant="secondary" className="rounded-full">Announced</Badge>
              </div>
              <ul className="divide-y px-3 sm:px-5">
                {students.map(({ id, name, initials, score }) => (
                  <li key={id} className={rowClass}>
                    <span className={avatarClass} aria-hidden="true">{initials}</span>
                    <span className="min-w-0 flex-1 font-medium">{name}</span>
                    <Progress
                      aria-hidden="true"
                      value={100 * score / 20}
                      className="hidden h-1 max-w-16 sm:flex motion-reduce:[&>*]:transition-none"
                    />
                    <span className="w-14 text-right font-semibold tabular-nums">{score} / 20</span>
                  </li>
                ))}
              </ul>
            </div>
          </TabsContent>
        </Tabs>
      </Card>
    </section>
  );
}
