"use client";

import { IconAlertCircle } from "@tabler/icons-react";

import { AssessmentEditGate } from "@/components/shared/assessment/edit";
import { AssessmentFormPage } from "@/components/shared/assessment/page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { AcademyEntry } from "@/modules/academies";
import { AcademyGate } from "@/modules/auth";
import { quizPermissions } from "../../permissions";
import { loadQuiz, quizQueryKey } from "../../queries";
import type { Quiz } from "../../types";
import { QuizNotFound } from "../shared/not-found";
import { QuizForm } from "./form";

/** `/app/quizzes/new`: any staff member may create and prepare a quiz. */
export function NewQuizPage() {
  return <AcademyGate>{(academy) => <FormPage title="Create quiz" academy={academy} />}</AcademyGate>;
}

/** `/app/quizzes/<id>/edit`: preparation, within the target/structure locks. */
export function EditQuizPage({ id }: { id: string }) {
  return <AcademyGate>{(academy) => <EditContent academy={academy} quizId={id} />}</AcademyGate>;
}

function EditContent({ academy, quizId }: { academy: AcademyEntry; quizId: string }) {
  return (
    <AssessmentEditGate
      academy={academy} noun="quiz" queryKey={quizQueryKey(academy.id, quizId)} load={() => loadQuiz(academy.id, quizId)} notFound={<QuizNotFound />}
      blocked={(quiz) => quizPermissions(academy.role, quiz).edit ? null : (
        <Alert><IconAlertCircle /><AlertTitle>Read-only</AlertTitle><AlertDescription>This quiz is archived or belongs to a closed academic year.</AlertDescription></Alert>
      )}
    >
      {(quiz) => <FormPage title="Edit quiz" academy={academy} quiz={quiz} />}
    </AssessmentEditGate>
  );
}

function FormPage({ title, academy, quiz }: { title: string; academy: AcademyEntry; quiz?: Quiz }) {
  return (
    <AssessmentFormPage noun="quiz" route="quizzes" title={title} entity={quiz}>
      {(handlers) => <QuizForm academy={academy} quiz={quiz} {...handlers} />}
    </AssessmentFormPage>
  );
}
