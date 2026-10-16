"use client";

import { AssessmentFormPage } from "@/components/shared/assessment/page";
import type { AcademyEntry } from "@/modules/academies";
import type { Assignment } from "../../types";
import { AssignmentForm } from "./form";

/** Full-page assignment form shared by the create and edit routes. Saving opens the workspace. */
export function AssignmentFormPage({ title, academy, assignment }: { title: string; academy: AcademyEntry; assignment?: Assignment }) {
  return (
    <AssessmentFormPage noun="assignment" route="assignments" title={title} entity={assignment}>
      {(handlers) => <AssignmentForm academy={academy} assignment={assignment} {...handlers} />}
    </AssessmentFormPage>
  );
}
