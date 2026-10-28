import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";

import { Badge } from "@/components/ui/badge";
import { StudentAssignmentStatus } from "@/modules/assignments/server";
import { formatAcademyDateTime } from "@/lib/academy-time";
import { studentAcademyPath, studentListPath } from "@/lib/routing";

import { readMyAssignments, type Scope } from "../data";
import { AcademySections, ItemRow } from "./section";

/**
 * Assignments across the student's academies, or one academy's when scoped, each in server order.
 * A page scoped to one academy can narrow to one course (`unit`), as the course card's Assignments link does.
 */
export async function LearningAssignments({ scope, unit }: { scope?: Scope; unit?: string }) {
  const unitId = scope && unit ? unit : undefined;
  const groups = await readMyAssignments(scope, unitId);
  const course = unitId && groups.flatMap((group) => group.items ?? []).find((item) => item.unit?.id === unitId)?.unit?.title;
  return (
    <AcademySections title="Assignments" section="assignments" empty={unitId ? "No assignments in this course" : "No assignments"} groups={groups} scope={scope}
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
        <ItemRow key={item.id} href={studentAcademyPath(slug, `assignments/${item.id}`)} title={item.title} badge={<StudentAssignmentStatus item={item} />}
          meta={<>
            {item.unit && !unitId && <span>{item.unit.title}</span>}
            {item.dueAt && <span>Due <time dateTime={item.dueAt}>{formatAcademyDateTime(item.dueAt)}</time></span>}
            {!item.required && <span>Optional</span>}
          </>} />
      )}
    </AcademySections>
  );
}
