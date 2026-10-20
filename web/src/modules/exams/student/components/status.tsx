import { Badge } from "@/components/ui/badge";

import type { StudentExamAction } from "../types";

const STATUS: Record<StudentExamAction, { label: string; variant: "default" | "secondary" | "outline" }> = {
  start: { label: "Open", variant: "default" },
  resume: { label: "In progress", variant: "default" },
  not_yet_open: { label: "Upcoming", variant: "secondary" },
  submitted: { label: "Submitted", variant: "secondary" },
  no_new_starts: { label: "Closed", variant: "outline" },
  ineligible: { label: "Not available", variant: "outline" },
  unavailable: { label: "Unavailable", variant: "outline" },
};

/** The student's own status for an exam, from the server-derived entry state. */
export function StudentExamStatus({ action }: { action: StudentExamAction }) {
  const status = STATUS[action];
  return <Badge variant={status.variant} className="shrink-0">{status.label}</Badge>;
}
