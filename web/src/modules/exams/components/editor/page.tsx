"use client";

import { IconAlertCircle } from "@tabler/icons-react";

import { AssessmentEditGate } from "@/components/shared/assessment/edit";
import { AssessmentFormPage } from "@/components/shared/assessment/page";
import { WorkspaceMissing } from "@/components/shared/assessment/workspace/missing";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { AcademyEntry } from "@/modules/academies";
import { AcademyGate } from "@/modules/auth";
import { examPermissions } from "../../permissions";
import { loadExam, examQueryKey } from "../../queries";
import type { Exam } from "../../types";
import { ExamForm } from "./form";

/** `/app/exams/new`: any staff member may create and prepare a exam. */
export function NewExamPage() {
  return <AcademyGate>{(academy) => <FormPage title="Create exam" academy={academy} />}</AcademyGate>;
}

/** `/app/exams/<id>/edit`: preparation, within the target/structure locks. */
export function EditExamPage({ id }: { id: string }) {
  return <AcademyGate>{(academy) => <EditContent academy={academy} examId={id} />}</AcademyGate>;
}

function EditContent({ academy, examId }: { academy: AcademyEntry; examId: string }) {
  return (
    <AssessmentEditGate
      academy={academy} noun="exam" queryKey={examQueryKey(academy.id, examId)} load={() => loadExam(academy.id, examId)} notFound={<WorkspaceMissing noun="exam" route="exams" />}
      blocked={(exam) => examPermissions(academy.role, exam).edit ? null : (
        <Alert><IconAlertCircle /><AlertTitle>Read-only</AlertTitle><AlertDescription>This exam is archived or belongs to a closed academic year.</AlertDescription></Alert>
      )}
    >
      {(exam) => <FormPage title="Edit exam" academy={academy} exam={exam} />}
    </AssessmentEditGate>
  );
}

function FormPage({ title, academy, exam }: { title: string; academy: AcademyEntry; exam?: Exam }) {
  return (
    <AssessmentFormPage noun="exam" route="exams" title={title} entity={exam}>
      {(handlers) => <ExamForm academy={academy} exam={exam} {...handlers} />}
    </AssessmentFormPage>
  );
}
