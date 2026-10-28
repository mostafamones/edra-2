const MINUTE = 60_000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;

/** Compact time until `iso`: "6d", "12h", "45m"; null once it has passed. Rounds down, so it never overstates. */
export function timeLeft(iso: string, now: number): { label: string; urgent: boolean } | null {
  const left = new Date(iso).getTime() - now;
  if (!(left > 0)) return null;
  const label = left >= 2 * DAY ? `${Math.floor(left / DAY)}d` : left >= HOUR ? `${Math.floor(left / HOUR)}h` : `${Math.max(1, Math.floor(left / MINUTE))}m`;
  return { label, urgent: left < DAY };
}
