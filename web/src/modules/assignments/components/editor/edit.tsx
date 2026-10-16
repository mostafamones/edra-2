"use client";

import Link from "next/link";
import { IconAlertCircle, IconArrowLeft } from "@tabler/icons-react";

import { AssessmentEditGate } from "@/components/shared/assessment/edit";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { AcademyEntry } from "@/modules/academies";
import { AcademyGate } from "@/modules/auth";
import { useCanonicalHref } from "@/modules/navigation";
import { assignmentPermissions } from "../../permissions";
import { assignmentQueryKey, loadAssignment } from "../../queries";
import { AssignmentFormPage } from "./page";
import { NotFound } from "../shared/not-found";

/** `/app/assignments/<id>/edit`: the whole setup until marking starts, then only text details (Owner/Head Admin/Admin). */
export function EditAssignmentPage({ id }: { id: string }) {
  return <AcademyGate>{(academy) => <EditContent academy={academy} assignmentId={id} />}</AcademyGate>;
}

function EditContent({ academy, assignmentId }: { academy: AcademyEntry; assignmentId: string }) {
  const href = useCanonicalHref();
  return (
    <AssessmentEditGate
      academy={academy} noun="assignment" queryKey={assignmentQueryKey(academy.id, assignmentId)} load={() => loadAssignment(academy.id, assignmentId)}
      notFound={<NotFound />}
      blocked={(assignment) => assignmentPermissions(academy.role, assignment).edit ? null : (
        <Alert>
          <IconAlertCircle />
          <AlertTitle>This assignment can’t be edited</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3">
            {assignment.state === "archived" || !assignment.yearOpen
              ? "Archived assignments and assignments of a closed academic year are read-only."
              : "Only an Owner or Admin can edit an assignment once marking has started."}
            <Button variant="outline" size="sm" asChild><Link href={href(`/app/assignments/${assignment.id}`)}><IconArrowLeft />Back to assignment</Link></Button>
          </AlertDescription>
        </Alert>
      )}
    >
      {(assignment) => (
        <AssignmentFormPage
          title={assignmentPermissions(academy.role, assignment).editStructure ? "Edit assignment" : "Edit assignment details"}
          academy={academy} assignment={assignment}
        />
      )}
    </AssessmentEditGate>
  );
}
