import { IconAlertCircle } from "@tabler/icons-react";

import { Alert, AlertTitle } from "@/components/ui/alert";

import type { StudentExamAccess } from "../types";

const ACCESS: Record<Exclude<StudentExamAccess, "active">, string> = {
  suspended: "Online access is suspended",
  no_current_year: "No participation this year",
  not_started: "Learning hasn’t started yet",
};

/** Access or read failure in place of exam content; never reveals exam metadata. */
export function StudentExamNotice({ access, message }: { access?: Exclude<StudentExamAccess, "active">; message?: string }) {
  return (
    <Alert variant={access === "suspended" ? "destructive" : "default"}>
      <IconAlertCircle aria-hidden="true" />
      <AlertTitle>{access ? ACCESS[access] : message}</AlertTitle>
    </Alert>
  );
}
