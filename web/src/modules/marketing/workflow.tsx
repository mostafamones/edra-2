import { IconBook, IconCalendar, IconClipboardCheck } from "@/components/shared/icons";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const workflow = [
  {
    id: "attendance",
    label: "Attendance",
    icon: IconCalendar,
    title: "Grade 10 Mathematics",
    detail: "Tuesday class",
    rows: [
      { name: "Mariam Hassan", status: "Present", color: "green" },
      { name: "Omar Nasser", status: "Present", color: "green" },
      { name: "Youssef Ali", status: "Late", color: "amber" },
    ],
  },
  {
    id: "lessons",
    label: "Lessons",
    icon: IconBook,
    title: "Quadratic equations",
    detail: "Grade 10 Mathematics",
    rows: [
      { name: "Worked examples", status: "Video", color: "neutral" },
      { name: "Practice problems", status: "Assignment", color: "neutral" },
      { name: "Quadratics recap", status: "Quiz", color: "neutral" },
    ],
  },
  {
    id: "results",
    label: "Results",
    icon: IconClipboardCheck,
    title: "Practice problems",
    detail: "Announced results",
    rows: [
      { name: "Mariam Hassan", status: "18 / 20", color: "neutral" },
      { name: "Omar Nasser", status: "16 / 20", color: "neutral" },
      { name: "Youssef Ali", status: "17 / 20", color: "neutral" },
    ],
  },
] as const;

const statusColors = {
  neutral: "",
  green: "bg-primary/10 text-emerald-800 dark:bg-primary/25 dark:text-emerald-300",
  amber: "bg-amber-500/10 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
};

export function WorkflowPreview() {
  return (
    <Tabs defaultValue="attendance" className="min-w-0 gap-3">
      <TabsList aria-label="Example academy workflow" className="grid h-auto min-h-11 w-full grid-cols-3">
        {workflow.map(({ id, label, icon: Icon }) => (
          <TabsTrigger key={id} value={id} className="px-1">
            <Icon className="hidden size-4 min-[360px]:block" aria-hidden="true" />
            {label}
          </TabsTrigger>
        ))}
      </TabsList>

      {workflow.map(({ id, title, detail, icon: Icon, rows }) => (
        <TabsContent key={id} value={id} className="rounded-2xl focus-visible:ring-2 focus-visible:ring-ring">
          <Card className="gap-0 overflow-hidden rounded-2xl py-0 shadow-none">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b px-4 py-4 sm:px-5">
              <div>
                <h3 className="font-sans text-base font-semibold">{title}</h3>
                <p className="mt-0.5 text-sm text-muted-foreground">{detail}</p>
              </div>
              <Badge variant="outline" className="rounded-full text-muted-foreground">Sample data</Badge>
            </div>
            <ul className="divide-y px-4 sm:px-5">
              {rows.map(({ name, status, color }) => (
                <li key={name} className="flex min-h-14 items-center gap-3 py-2.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-foreground/75" aria-hidden="true">
                    {id === "lessons" ? <Icon className="size-4" /> : name.split(" ").map(part => part[0]).join("")}
                  </span>
                  <span className="flex-1 font-medium">{name}</span>
                  <Badge variant="secondary" className={`rounded-full tabular-nums ${statusColors[color]}`}>{status}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </TabsContent>
      ))}
    </Tabs>
  );
}
