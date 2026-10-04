"use client";

import { AcademyGate } from "@/modules/auth";
import { StudentFormPage } from "./form-page";

export function NewStudentPage() {
  // The gate re-mounts the form per academy so a draft never carries over to another academy.
  return <AcademyGate>{(academy) => <StudentFormPage academy={academy} title="Add student" />}</AcademyGate>;
}
