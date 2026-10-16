"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { IconAlertCircle } from "@tabler/icons-react";

import { useBreadcrumbTitle } from "@/components/shared/breadcrumb-title";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { AcademyEntry } from "@/modules/academies";
import { AcademyGate } from "@/modules/auth";
import { useCanonicalHref } from "@/modules/navigation";
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
  const query = useQuery({ queryKey: quizQueryKey(academy.id, quizId), queryFn: () => loadQuiz(academy.id, quizId) });
  if (query.isPending) {
    return <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6" role="status" aria-label="Loading quiz"><Skeleton className="h-8 w-48" /><Skeleton className="mt-6 h-64" /></main>;
  }
  if (query.isError) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <Alert variant="destructive">
          <IconAlertCircle />
          <AlertTitle>Couldn’t load this quiz</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            Check your connection and try again.
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>Retry</Button>
          </AlertDescription>
        </Alert>
      </main>
    );
  }
  if (!query.data) return <main className="page-shell"><QuizNotFound /></main>;
  if (!query.data.yearOpen || query.data.archivedAt) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <Alert><IconAlertCircle /><AlertTitle>Read-only</AlertTitle><AlertDescription>This quiz is archived or belongs to a closed academic year.</AlertDescription></Alert>
      </main>
    );
  }
  // The form keeps its own unsaved input across background refreshes and offers a choice when a newer version arrives.
  return <FormPage title="Edit quiz" academy={academy} quiz={query.data} />;
}

function FormPage({ title, academy, quiz }: { title: string; academy: AcademyEntry; quiz?: Quiz }) {
  const href = useCanonicalHref();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  useBreadcrumbTitle(quiz ? "Edit quiz" : "New quiz");
  const back = href(quiz ? `/app/quizzes/${quiz.id}` : "/app/quizzes");
  const leave = () => router.push(back);
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="mb-8 font-heading text-2xl font-semibold">{title}</h1>
      <QuizForm academy={academy} quiz={quiz} onSaved={(saved) => router.push(href(`/app/quizzes/${saved.id}`))}
        onCancel={(dirty) => { if (dirty) setConfirming(true); else leave(); }} />
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>Your unsaved changes to this quiz will be lost.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={leave}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
