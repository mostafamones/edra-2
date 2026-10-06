"use client";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { cn } from "@/lib/utils";
import type { AttendanceStatus } from "../types";
import { INPUT_STATUSES, STATUS_LABELS } from "./labels";

type Props = {
  studentName: string;
  value: AttendanceStatus;
  /** A status waiting for the server; shown selected and pulsing until it is confirmed. */
  pending?: AttendanceStatus;
  disabled: boolean;
  onChange: (status: AttendanceStatus) => void;
};

/** Selected-state colors per status. Every segment stays `outline`; selection never changes the border so shared edges stay intact. */
const SELECTED: Record<AttendanceStatus, string> = {
  present: "bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 hover:text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 dark:hover:bg-emerald-500/30 dark:hover:text-emerald-300",
  late: "bg-amber-500/15 text-amber-700 hover:bg-amber-500/25 hover:text-amber-700 dark:bg-amber-500/20 dark:text-amber-300 dark:hover:bg-amber-500/30 dark:hover:text-amber-300",
  absent: "bg-red-500/15 text-red-700 hover:bg-red-500/25 hover:text-red-700 dark:bg-red-500/20 dark:text-red-300 dark:hover:bg-red-500/30 dark:hover:text-red-300",
  excused: "bg-sky-500/15 text-sky-700 hover:bg-sky-500/25 hover:text-sky-700 dark:bg-sky-500/20 dark:text-sky-300 dark:hover:bg-sky-500/30 dark:hover:text-sky-300",
  unknown: "bg-muted text-foreground hover:bg-muted dark:bg-muted",
};

/** One student's draft status as a segmented button group. */
export function StatusInput({ studentName, value, pending, disabled, onChange }: Props) {
  const shown = pending ?? value;
  return (
    <ButtonGroup aria-label={`Attendance for ${studentName}`} className="flex-wrap">
      {INPUT_STATUSES.map((status) => {
        const selected = shown === status;
        return (
          <Button
            key={status}
            type="button"
            size="xs"
            variant="outline"
            aria-pressed={selected}
            aria-busy={selected && Boolean(pending)}
            disabled={disabled || Boolean(pending)}
            className={cn(!selected && "text-muted-foreground", selected && SELECTED[status], selected && pending && "animate-pulse disabled:opacity-100")}
            onClick={() => onChange(status)}
          >
            {STATUS_LABELS[status]}
          </Button>
        );
      })}
    </ButtonGroup>
  );
}
