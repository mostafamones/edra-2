export type TimeFormat = "12h" | "24h";
export function parseTimeFormat(value: unknown): TimeFormat {
  return value === "12h" ? "12h" : "24h";
}

/** Calendar wall-clock minutes; 1440 is the following midnight. */
export function formatClock(value: number, format: TimeFormat) {
  const hour = Math.floor(value / 60) % 24, minute = String(value % 60).padStart(2, "0");
  return format === "12h" ? `${hour % 12 || 12}:${minute} ${hour < 12 ? "AM" : "PM"}` : `${String(hour).padStart(2, "0")}:${minute}`;
}
