"use client";

import { AcademyGate } from "@/modules/auth";
import { ScheduleFormPage } from "./form-page";

export function NewSchedulePage() {
  return (
    <AcademyGate>
      {(academy) => (
        <ScheduleFormPage
          academy={academy}
          title="Create schedule"
        />
      )}
    </AcademyGate>
  );
}
