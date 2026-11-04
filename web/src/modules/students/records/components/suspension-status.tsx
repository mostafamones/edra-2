import { HugeiconsIcon } from "@hugeicons/react";
import { UserBlock01Icon, UserCheck01Icon } from "@hugeicons/core-free-icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatAcademyDateTime } from "@/lib/academy-time";
import type { StudentRecord } from "../types";

type Props = {
  student: StudentRecord;
  /** Opens the shared confirmation; set only for managers. */
  onChange?: (suspend: boolean) => void;
};

/**
 * Current online-access causes and the latest manual change, with the manager's action. Manual
 * suspension belongs to the academy profile, so it shows on every annual record of the student.
 */
export function SuspensionStatus({ student, onChange }: Props) {
  const latest = student.latestSuspensionChange;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      {student.manuallySuspended && <Badge variant="destructive">Online access suspended</Badge>}
      {student.archivedAt && <Badge variant="outline">Suspended by archival</Badge>}
      {latest && (
        <span className="min-w-0 break-words text-muted-foreground" dir="auto">
          {latest.action === "suspended" ? "Suspended" : "Restored"} {formatAcademyDateTime(latest.at)}
          {latest.actorName && <> by <span dir="auto">{latest.actorName}</span></>}
          {latest.reason && <> · <span dir="auto">{latest.reason}</span></>}
        </span>
      )}
      {onChange && (
        <Button variant="outline" size="sm" onClick={() => onChange(!student.manuallySuspended)}>
          <HugeiconsIcon icon={student.manuallySuspended ? UserCheck01Icon : UserBlock01Icon} strokeWidth={1.5} data-icon="inline-start" />
          {student.manuallySuspended ? "Restore online access" : "Suspend online access"}
        </Button>
      )}
    </div>
  );
}
