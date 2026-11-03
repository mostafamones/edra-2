import Link from "@/components/shared/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";

import { Badge } from "@/components/ui/badge";
import { formatAcademyDateTime } from "@/lib/academy-time";
import { studentAcademyPath, studentListPath } from "@/lib/routing";

import type { LearningAssignmentsData } from "../server";
import { AcademySections, ItemRow } from "./section";

/**
 * Assignments across the student's academies, or one academy's when scoped, each in server order.
 * A page scoped to one academy can narrow to one course (`unit`), as the course card's Assignments link does.
 */
export function LearningAssignments({ data: { scope, unit, course, groups, academies } }: { data: LearningAssignmentsData }) {
  const unitId = scope && unit ? unit : undefined;
  return (
    <AcademySections title="Assignments" section="assignments" empty={unitId ? "No assignments in this course" : "No assignments"} groups={groups} scope={scope} academies={academies}
      query={unitId ? { unit: unitId } : undefined}
      filter={unitId && scope && (
        <Badge variant="secondary" className="h-7 gap-1.5 self-start pl-3 pr-1 text-sm">
          {course ?? "One course"}
          <Link href={studentListPath("assignments", scope.slug)} aria-label="Show all assignments" className="grid size-5 place-items-center rounded-full hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.5} className="size-3.5" aria-hidden="true" />
          </Link>
        </Badge>
      )}
>
      {(item, slug) => (
        <ItemRow key={item.id} href={studentAcademyPath(slug, `assignments/${item.id}`)} title={item.title} badge={<Badge variant={item.status.tone}>{item.status.label}</Badge>}
          meta={<>
            {item.unitTitle && <span>{item.unitTitle}</span>}
            {item.dueAt && <span>Due <time dateTime={item.dueAt}>{formatAcademyDateTime(item.dueAt)}</time></span>}
            {!item.required && <span>Optional</span>}
          </>} />
      )}
    </AcademySections>
  );
}
