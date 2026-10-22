import { Badge } from "@/components/ui/badge";

import type { StudentAssignmentSummary } from "../types";

/** One status for the caller's work. Optional work is never labelled missing or overdue. */
export function studentAssignmentStatus(item: StudentAssignmentSummary): { label: string; tone: "default" | "secondary" | "outline" } {
  if (item.result) return { label: "Result announced", tone: "default" };
  if (item.receipt) return { label: item.receipt.late ? "Submitted late" : "Submitted", tone: "secondary" };
  if (item.blockedReason === "assignment_closed") return { label: "Closed", tone: "outline" };
  if (item.blockedReason === "entitlement_required") return { label: "Unit access needed", tone: "outline" };
  if (item.blockedReason) return { label: "Unavailable online", tone: "outline" };
  return { label: item.started ? "In progress" : "Not started", tone: "outline" };
}

export function StudentAssignmentStatus({ item }: { item: StudentAssignmentSummary }) {
  const status = studentAssignmentStatus(item);
  return <Badge variant={status.tone}>{status.label}</Badge>;
}
