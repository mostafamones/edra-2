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
import { loadExam, examQueryKey } from "../../queries";
import type { Exam } from "../../types";
import { ExamNotFound } from "../shared/not-found";
import { ExamForm } from "./form";

/** `/app/exams/new`: any staff member may create and prepare an exam. */
export function NewExamPage() {
  return <AcademyGate>{(academy) => <FormPage title="Create exam" academy={academy} />}</AcademyGate>;
}

/** `/app/exams/<id>/edit`: preparation, within the target/structure locks. */
export function EditExamPage({ id }: { id: string }) {
  return <AcademyGate>{(academy) => <EditContent academy={academy} examId={id} />}</AcademyGate>;
}

function EditContent({ academy, examId }: { academy: AcademyEntry; examId: string }) {
  const query = useQuery({ queryKey: examQueryKey(academy.id, examId), queryFn: () => loadExam(academy.id, examId) });
  if (query.isPending) {
    return <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6" role="status" aria-label="Loading exam"><Skeleton className="h-8 w-48" /><Skeleton className="mt-6 h-64" /></main>;
  }
  if (query.isError) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <Alert variant="destructive">
          <IconAlertCircle />
          <AlertTitle>Couldn’t load this exam</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            Check your connection and try again.
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>Retry</Button>
          </AlertDescription>
        </Alert>
      </main>
    );
  }
  if (!query.data) return <main className="page-shell"><ExamNotFound /></main>;
  if (!query.data.yearOpen || query.data.archivedAt) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <Alert><IconAlertCircle /><AlertTitle>Read-only</AlertTitle><AlertDescription>This exam is archived or belongs to a closed academic year.</AlertDescription></Alert>
      </main>
    );
  }
  // The form keeps its own unsaved input across background refreshes and offers a choice when a newer version arrives.
  return <FormPage title="Edit exam" academy={academy} exam={query.data} />;
}

function FormPage({ title, academy, exam }: { title: string; academy: AcademyEntry; exam?: Exam }) {
  const href = useCanonicalHref();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  useBreadcrumbTitle(exam ? "Edit exam" : "New exam");
  const back = href(exam ? `/app/exams/${exam.id}` : "/app/exams");
  const leave = () => router.push(back);
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="mb-8 font-heading text-2xl font-semibold">{title}</h1>
      <ExamForm academy={academy} exam={exam} onSaved={(saved) => router.push(href(`/app/exams/${saved.id}`))}
        onCancel={(dirty) => { if (dirty) setConfirming(true); else leave(); }} />
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>Your unsaved changes to this exam will be lost.</AlertDialogDescription>
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
