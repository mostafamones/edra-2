import { FIELD_LABELS } from "./mapping";
import type { ImportIssue, ImportOutcome, ImportRow, ImportStatus } from "./types";

export const STATUS_LABELS: Record<ImportStatus, string> = {
  ready: "Ready",
  invalid: "Invalid",
  duplicate_existing: "Duplicate existing",
  duplicate_file: "Duplicate within file",
  excluded: "Excluded",
};

export const OUTCOME_LABELS: Record<ImportOutcome, string> = {
  pending: "Pending",
  created: "Created",
  skipped: "Skipped",
  failed: "Failed",
};

const PROBLEMS: Record<string, string> = {
  formula: "is a formula. Replace it with the value itself.",
  date: "is a date. Enter it as text.",
  error: "contains a spreadsheet error.",
  nested: "is a nested value. Use plain text.",
  unsupported: "isn’t text or a number.",
};

/** An actionable message for one field issue raised by server-side validation. */
export function issueMessage(issue: ImportIssue): string {
  const label = FIELD_LABELS[issue.field] ?? issue.field;
  switch (issue.code) {
    case "required": return `${label} is required.`;
    case "invalid_phone": return `${label} isn’t a valid Egyptian mobile number.`;
    case "too_long": return `${label} is longer than 200 characters.`;
    case "unknown": return `${label} doesn’t match any ${label.toLowerCase()} in this academy${issue.field === "group" ? " for this level and track" : ""}.`;
    case "ambiguous": return `${label} matches more than one ${label.toLowerCase()}. Choose one.`;
    case "not_offered": return "This level has no tracks; leave the track empty.";
    case "incompatible": return "This group belongs to a different level or track.";
    case "unsupported": return `${label} ${PROBLEMS[issue.detail ?? "unsupported"] ?? PROBLEMS.unsupported}`;
    default: return `${label} needs correction.`;
  }
}

const OUTCOME_MESSAGES: Record<string, string> = {
  duplicate_existing: "A student this year already uses this student phone.",
  invalid_placement: "The level, track, or group changed before this row was created. Correct it and import it again.",
  validation: "The row no longer passes validation. Correct it and import it again.",
};

/** Every message explaining why a row is not Ready, or why it was skipped or failed. */
export function rowMessages(row: Pick<ImportRow, "status" | "issues" | "existingArchived" | "duplicateRows" | "outcome" | "outcomeCode" | "excluded">, rowWord = "row"): string[] {
  const messages: string[] = [];
  if (row.outcome === "failed" || (row.outcome === "skipped" && row.status === "ready")) {
    messages.push(OUTCOME_MESSAGES[row.outcomeCode ?? ""] ?? "The row couldn’t be created.");
  }
  if (row.excluded) messages.push("Excluded from this import.");
  if (row.status === "duplicate_existing") {
    messages.push(row.existingArchived
      ? "An archived student this year already uses this student phone."
      : "A student this year already uses this student phone.");
  }
  if (row.status === "duplicate_file" && row.duplicateRows?.length) {
    const others = row.duplicateRows.slice(0, 5).join(", ");
    messages.push(`Same student phone as ${rowWord}${row.duplicateRows.length > 1 ? "s" : ""} ${others}${row.duplicateRows.length > 5 ? "…" : ""}. Correct or exclude the extra rows.`);
  }
  for (const issue of row.issues) messages.push(issueMessage(issue));
  return messages;
}
