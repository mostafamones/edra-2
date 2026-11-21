import { IconBook, IconCalendar, IconClipboardCheck, IconDeviceLaptop, IconUsers } from "@/components/shared/icons";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export function MarketingCapabilities() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="gap-5 rounded-2xl bg-emerald-50/65 p-5 shadow-none ring-1 ring-border sm:p-7 dark:bg-emerald-950/25">
        <div>
          <IconUsers className="mb-3 size-6 text-emerald-800 dark:text-emerald-300" aria-hidden="true" />
          <h3 className="font-heading text-xl font-medium tracking-tight">One record per student</h3>
          <p className="mt-2 max-w-[42ch] text-sm leading-relaxed text-foreground/75">
            Keep enrollment, attendance, and marks together, even before a student has an online account.
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4 text-card-foreground">
          <div className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-xs font-semibold" aria-hidden="true">MH</span>
            <div>
              <p className="text-sm font-semibold">Mariam Hassan</p>
              <p className="text-xs text-muted-foreground">Grade 10 Mathematics</p>
            </div>
          </div>
          <ul className="mt-3 divide-y border-t text-sm">
            <li className="flex items-center justify-between gap-2 py-2.5">
              <span>Tuesday class</span>
              <Badge variant="secondary" className="rounded-full">Present</Badge>
            </li>
            <li className="flex items-center justify-between gap-2 pt-2.5">
              <span>Practice problems</span>
              <span className="whitespace-nowrap font-semibold tabular-nums">18 / 20</span>
            </li>
          </ul>
        </div>
      </Card>

      <Card className="gap-5 rounded-2xl bg-card p-5 shadow-none ring-1 ring-border sm:p-7">
        <div>
          <IconDeviceLaptop className="mb-3 size-6 text-emerald-800 dark:text-emerald-300" aria-hidden="true" />
          <h3 className="font-heading text-xl font-medium tracking-tight">Set the rules for lesson access</h3>
          <p className="mt-2 max-w-[42ch] text-sm leading-relaxed text-foreground/75">
            Release protected videos to the students you choose. Give access through attendance, coupons, or a staff grant.
          </p>
        </div>
        <div className="rounded-xl border bg-background p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold">
            <span>Quadratic equations</span>
            <Badge variant="secondary" className="rounded-full">Released</Badge>
          </div>
          <ul className="mt-3 divide-y border-t text-sm">
            <li className="flex items-center gap-2 py-2.5"><IconBook className="size-4 text-muted-foreground" aria-hidden="true" />Explanation video</li>
            <li className="flex items-center gap-2 pt-2.5"><IconClipboardCheck className="size-4 text-muted-foreground" aria-hidden="true" />Assignment and quiz</li>
          </ul>
        </div>
      </Card>

      <Card className="gap-3 rounded-2xl bg-card p-5 shadow-none ring-1 ring-border sm:p-7">
        <IconCalendar className="size-6 text-emerald-800 dark:text-emerald-300" aria-hidden="true" />
        <h3 className="font-heading text-xl font-medium tracking-tight">Make check-in part of class</h3>
        <p className="max-w-[42ch] text-sm leading-relaxed text-foreground/75">
          Set up recurring sessions, check students in by code or by hand, and review the roster before finalizing attendance.
        </p>
      </Card>

      <Card className="gap-3 rounded-2xl bg-card p-5 shadow-none ring-1 ring-border sm:p-7">
        <IconClipboardCheck className="size-6 text-emerald-800 dark:text-emerald-300" aria-hidden="true" />
        <h3 className="font-heading text-xl font-medium tracking-tight">Share marks when they’re ready</h3>
        <p className="max-w-[42ch] text-sm leading-relaxed text-foreground/75">
          Mark classroom and online work in one place. Announce results to individual students or to a group.
        </p>
      </Card>
    </div>
  );
}
