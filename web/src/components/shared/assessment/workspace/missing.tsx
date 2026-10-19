"use client";

import Link from "next/link";
import { IconArrowLeft, IconQuestionMark } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { useCanonicalHref } from "@/modules/navigation";

/** Shown when the assessment does not exist in this academy. */
export function WorkspaceMissing({ noun, route }: { noun: string; route: string }) {
  const href = useCanonicalHref();
  return (
    <Empty className="min-h-64 rounded-xl border border-dashed border-border py-20">
      <EmptyHeader className="gap-1">
        <EmptyMedia variant="icon"><IconQuestionMark aria-hidden="true" /></EmptyMedia>
        <EmptyTitle className="text-xl font-semibold">{noun[0].toUpperCase() + noun.slice(1)} not found</EmptyTitle>
        <EmptyDescription>This {noun} does not exist in this academy.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button size="sm" variant="outline" asChild><Link href={href(`/app/${route}`)}><IconArrowLeft />Back to {route}</Link></Button>
      </EmptyContent>
    </Empty>
  );
}
