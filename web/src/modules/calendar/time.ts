import { formatClock, type TimeFormat } from "@/modules/account";

/** Calendar clock text: 12-hour drops ":00" ("4 PM", "4:30 PM"); 24-hour keeps "16:00". */
export const clockLabel = (value: number, format: TimeFormat) => formatClock(value, format).replace(":00 ", " ");
