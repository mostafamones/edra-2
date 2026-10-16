"use client";

import { formatAcademyDateTime } from "@/lib/academy-time";

/** An academy-time instant, or a dash. Rendered as a <time> element for assistive technology. */
export function ExamTime({ value, fallback = "—" }: { value: string | null; fallback?: string }) {
  if (!value) return <span className="text-muted-foreground">{fallback}</span>;
  return <time dateTime={value}>{formatAcademyDateTime(value)}</time>;
}
