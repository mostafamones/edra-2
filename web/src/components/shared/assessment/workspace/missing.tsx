"use client";

import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, HelpCircleIcon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { useAssessmentListReturn } from "../list/return";

/** Shown when the assessment does not exist in this academy. */
export function WorkspaceMissing({ noun, route }: { noun: string; route: string }) {
  const back = useAssessmentListReturn(route);
  return (
    <Empty className="min-h-64 rounded-xl border border-dashed border-border py-20">
      <EmptyHeader className="gap-1">
        <EmptyMedia variant="icon"><HugeiconsIcon icon={HelpCircleIcon} strokeWidth={1.5} aria-hidden="true" /></EmptyMedia>
        <EmptyTitle className="text-xl font-semibold">{noun[0].toUpperCase() + noun.slice(1)} not found</EmptyTitle>
        <EmptyDescription>This {noun} does not exist in this academy.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button size="sm" variant="outline" asChild><Link href={back}><HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={1.5} aria-hidden="true" />Back to assessments</Link></Button>
      </EmptyContent>
    </Empty>
  );
}
