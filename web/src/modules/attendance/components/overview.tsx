import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { AttendanceSheet } from "../types";
import { STATUS_DOTS, statusName } from "./labels";

const RECORDED = ["present", "late", "excused", "absent"] as const;

/** How far along the sheet is: recorded out of the roster, the attendance rate, and a bar split by status. */
export function AttendanceOverview({ counts, action }: { counts: AttendanceSheet["counts"]; action?: ReactNode }) {
  const recorded = counts.total - counts.unknown;
  const attended = counts.present + counts.late;
  const percent = (value: number) => counts.total ? Math.round((value / counts.total) * 100) : 0;
  const summary = RECORDED.map((status) => `${counts[status]} ${statusName(status).toLowerCase()}`).join(", ");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">Recorded</span>
            <span className="font-heading text-2xl font-semibold tabular-nums">
              {recorded}<span className="text-base font-normal text-muted-foreground"> / {counts.total}</span>
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">Attended</span>
            <span className="font-heading text-2xl font-semibold tabular-nums">
              {percent(attended)}<span className="text-base font-normal text-muted-foreground">%</span>
            </span>
          </div>
        </div>
        {action}
      </div>
      <div
        role="img"
        aria-label={`${recorded} of ${counts.total} recorded: ${summary}.`}
        className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-muted"
      >
        {RECORDED.map((status) => counts[status] > 0 && (
          <span key={status} className={cn("h-full transition-[width] duration-500", STATUS_DOTS[status])} style={{ width: `${(counts[status] / counts.total) * 100}%` }} />
        ))}
      </div>
    </div>
  );
}
