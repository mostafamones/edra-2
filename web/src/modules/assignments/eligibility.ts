import type { StudentWork } from "./types";

/** Legacy payloads retain required status; ended requirements are never reinstated by a read. */
export function isRequiredWork(row: Pick<StudentWork, "required" | "requirementEndedAt">) {
  return row.required !== false && !row.requirementEndedAt;
}

export function isRequiredNotReceived(row: Pick<StudentWork, "required" | "requirementEndedAt" | "workStatus">) {
  return isRequiredWork(row) && (row.workStatus === "expected" || row.workStatus === "missing");
}

export function requirementLabel(row: Pick<StudentWork, "required" | "requirementEndedAt">) {
  return row.requirementEndedAt ? "Requirement ended" : row.required === false ? "Optional" : "Required";
}
