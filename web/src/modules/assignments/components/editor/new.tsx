"use client";

import { AcademyGate } from "@/modules/auth";
import { AssignmentFormPage } from "./page";

/** `/app/assignments/new`: create a draft. Any staff member may prepare drafts. */
export function NewAssignmentPage() {
  return <AcademyGate>{(academy) => <AssignmentFormPage title="Create assignment" academy={academy} />}</AcademyGate>;
}
