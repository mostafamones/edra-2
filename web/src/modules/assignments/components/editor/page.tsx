"use client";

import { AssessmentFormPage } from "@/components/shared/assessment/page";
import type { AcademyEntry } from "@/modules/academies";
import type { Assignment } from "../../types";
import { AssignmentForm } from "./form";
import { AssignmentScoring } from "../workspace/scoring";

/** Full-page assignment form shared by the create and edit routes. Saving opens the workspace. */
export function AssignmentFormPage({ title, academy, assignment }: { title: string; academy: AcademyEntry; assignment?: Assignment }) {
  return (
    <AssessmentFormPage noun="assignment" route="assignments" title={title} entity={assignment}>
      {(handlers) => <div className="flex flex-col gap-8"><AssignmentForm academy={academy} assignment={assignment} {...handlers} />{assignment && <AssignmentScoring assignment={assignment} role={academy.role} />}</div>}
    </AssessmentFormPage>
  );
}
