import { formatAcademyDateTime } from "@/lib/academy-time";

/** An academy-time instant as a <time> element. */
export function StudentExamTime({ value }: { value: string }) {
  return <time dateTime={value}>{formatAcademyDateTime(value)}</time>;
}

export function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}
