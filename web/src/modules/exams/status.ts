import type { ExamStudent } from "./types";

/**
 * One student's work state for the staff list, derived from the authoritative row. A status never
 * implies a score: window_closed or departure submissions are ordinary accepted work.
 */
export type StudentStatus =
  | "not_started"
  | "answering"
  | "physical_draft"
  | "needs_marking"
  | "ready_to_announce"
  | "announced"
  | "pending_correction";

export function studentStatus(student: ExamStudent): StudentStatus {
  if (student.submission) {
    if (student.publicationState === "published") return "announced";
    if (student.publicationState === "pending_correction") return student.result?.complete ? "pending_correction" : "needs_marking";
    return student.result?.complete ? "ready_to_announce" : "needs_marking";
  }
  if (student.attempt && !student.attempt.finalizedAt && !student.attempt.superseded) return "answering";
  if (student.physicalDraft) return "physical_draft";
  return "not_started";
}

export const STATUS_FILTERS = ["all", "not_started", "answering", "physical_draft", "needs_marking", "ready_to_announce", "announced", "pending_correction"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

/** Case-insensitive name or exact-prefix code search. */
export function matchesSearch(student: Pick<ExamStudent, "fullName" | "studentCode">, search: string): boolean {
  const text = search.trim().toLowerCase();
  if (!text) return true;
  return student.fullName.toLowerCase().includes(text) || (student.studentCode ?? "").toLowerCase().startsWith(text);
}
