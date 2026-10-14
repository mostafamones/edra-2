"use client";

import Link from "next/link";
import { IconArrowLeft, IconQuestionMark } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { useCanonicalHref } from "@/modules/navigation";

export function QuizNotFound() {
  const href = useCanonicalHref();
  return (
    <Empty className="min-h-64 rounded-xl border border-dashed border-border py-20">
      <EmptyHeader className="gap-1">
        <EmptyMedia variant="icon"><IconQuestionMark aria-hidden="true" /></EmptyMedia>
        <EmptyTitle className="text-xl font-semibold">Quiz not found</EmptyTitle>
        <EmptyDescription>This quiz does not exist in this academy.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button size="sm" variant="outline" asChild><Link href={href("/app/quizzes")}><IconArrowLeft />Back to quizzes</Link></Button>
      </EmptyContent>
    </Empty>
  );
}
