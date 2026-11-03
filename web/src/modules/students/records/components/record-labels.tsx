import { useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { LabelIcon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import type { AcademyEntry } from "@/modules/academies";
import { canManageLabels, LabelBadges, LabelManager, LabelsMenuItems, useLabels } from "@/modules/labels";
import { useStudentLabels } from "../use-labels";

type Props = { academy: AcademyEntry; recordId: string; labelIds: string[] };

/** A student page's labels for its annual record, with the control that changes them. Works on archived and closed-year records too. */
export function StudentRecordLabels({ academy, recordId, labelIds }: Props) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [managing, setManaging] = useState(false);
  const [opener, setOpener] = useState<HTMLElement | null>(null);
  const catalog = useLabels(academy.id, "students");
  const { applyToRecord, definitionChanges } = useStudentLabels(academy.id);
  const manager = canManageLabels(academy.role);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {catalog.isPending && labelIds.length > 0 ? <Skeleton className="h-5 w-16" /> : <LabelBadges labels={catalog.data?.filter((label) => labelIds.includes(label.id)) ?? []} />}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button ref={trigger} variant="ghost" size="sm" className="h-7 text-muted-foreground">
            <HugeiconsIcon icon={LabelIcon} strokeWidth={1.5} aria-hidden="true" />Labels
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-80 max-w-64 min-w-44 overflow-y-auto">
          <LabelsMenuItems menu="dropdown" academyId={academy.id} domain="students" applied={labelIds}
            onApply={(labelId, applied) => void applyToRecord(recordId, labelId, applied)}
            // Open after the menu has closed, so its dismissal cannot close the editor.
            onManage={manager ? () => requestAnimationFrame(() => { setOpener(trigger.current); setManaging(true); }) : undefined} />
        </DropdownMenuContent>
      </DropdownMenu>
      {manager && <LabelManager hideTrigger academyId={academy.id} domain="students" open={managing} opener={opener} onOpenChange={setManaging} {...definitionChanges} />}
    </div>
  );
}
