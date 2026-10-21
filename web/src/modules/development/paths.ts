import { staffAcademyPath, validateReturnDestination } from "@/lib/routing";

// Students directory URL parameters (records/list-params.ts); anything else is dropped.
const DIRECTORY_KEYS = ["q", "status", "level", "track", "group", "type", "sort", "page", "size"];

/** The synthetic academy's students directory with allowlisted filters/page, or null. */
export function studentsDirectoryPath(slug: string, value: unknown): string | null {
  const destination = validateReturnDestination(value, "staff");
  if (!destination || destination.platform !== "staff") return null;
  const url = new URL(destination.path, "https://routing.invalid");
  if (url.pathname !== staffAcademyPath(slug, "/students")) return null;
  const query = new URLSearchParams();
  for (const key of DIRECTORY_KEYS) {
    const raw = url.searchParams.get(key);
    if (raw !== null && raw.length <= 120) query.set(key, raw);
  }
  const search = query.toString();
  return search ? `${url.pathname}?${search}` : url.pathname;
}

/** A staff-portal path to return to on exit; student-portal or invalid values fall back to the root. */
export function exitPath(value: unknown): string {
  const destination = validateReturnDestination(value, "staff");
  return destination?.platform === "staff" ? destination.path : "/";
}
