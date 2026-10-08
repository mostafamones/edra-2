import { ACADEMY_TIME_ZONE } from "@/modules/schedules";
import type { AttendanceStatus } from "../types";

export const STATUS_LABELS: Record<AttendanceStatus, string> = {
  unknown: "—",
  present: "Present",
  late: "Late",
  absent: "Absent",
  excused: "Excused",
};

/** Statuses staff can choose for a student; Unknown is the starting value and can be restored. */
export const INPUT_STATUSES = ["present", "late", "absent", "excused", "unknown"] as const satisfies readonly AttendanceStatus[];

const clock = new Intl.DateTimeFormat("en-US", { timeZone: ACADEMY_TIME_ZONE, hour: "numeric", minute: "2-digit" });
const moment = new Intl.DateTimeFormat("en-US", { timeZone: ACADEMY_TIME_ZONE, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Academy-clock time, e.g. "4:52 PM". */
export const formatClock = (iso: string) => clock.format(new Date(iso));
/** Academy-clock day and time, e.g. "Mon, Oct 5, 4:52 PM". */
export const formatMoment = (iso: string) => moment.format(new Date(iso));

/** Readable status names where the bare "—" of an unrecorded student would be unclear, such as filters and legends. */
export const statusName = (status: AttendanceStatus) => status === "unknown" ? "Untracked" : STATUS_LABELS[status];

/** The color that marks each status in dots, legends, and the progress bar. */
export const STATUS_DOTS: Record<AttendanceStatus, string> = {
  present: "bg-primary", late: "bg-amber-500", absent: "bg-destructive", excused: "bg-sky-500", unknown: "bg-muted-foreground/30",
};
