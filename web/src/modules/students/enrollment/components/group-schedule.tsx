import { HugeiconsIcon } from "@hugeicons/react";
import { Calendar03Icon } from "@hugeicons/core-free-icons";

import { describeGroupSchedule } from "../schedule";
import type { EnrollmentProgram } from "../types";

/** A small, muted schedule recap under a group's name; nothing for unscheduled groups. */
export function GroupSchedule({ slots }: { slots: EnrollmentProgram["groups"][number]["slots"] }) {
  const text = describeGroupSchedule(slots);
  if (!text) return null;
  return <span className="flex items-center gap-1.5 text-xs opacity-80"><HugeiconsIcon icon={Calendar03Icon} strokeWidth={1.5} aria-hidden="true" className="size-3.5 shrink-0" />{text}</span>;
}

/** "12 seats left" for a capacity-limited group, the number emphasized. */
export function SeatsLeft({ count }: { count: number }) {
  return <span className="shrink-0 text-xs font-normal text-muted-foreground"><b className="font-semibold text-foreground">{count}</b> {count === 1 ? "seat" : "seats"} left</span>;
}
