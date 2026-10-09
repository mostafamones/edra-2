"use client";

import { AcademyGate } from "@/modules/auth";
import { AssignmentFormPage } from "./page";

/** `/app/assignments/new`: create an assignment. Any staff member may create and prepare one. */
export function NewAssignmentPage() {
  return <AcademyGate>{(academy) => <AssignmentFormPage title="Create assignment" academy={academy} />}</AcademyGate>;
}
