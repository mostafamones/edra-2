"use client";

import { useFormContext, useWatch } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";

import { FieldDescription } from "@/components/ui/field";
import { loadQuizAudiencePreview, quizPreviewQueryKey } from "../../queries";
import type { QuizFormValues } from "../../validation";

const number = new Intl.NumberFormat("en");

/** Advisory: students matching now. Eligibility stays live, so later joiners qualify too. */
export function AudienceCount({ academyId, academicYearId }: { academyId: string; academicYearId: string }) {
  const { control } = useFormContext<QuizFormValues>();
  const [audience, levelId, trackId, groupIds] = useWatch({ control, name: ["audience", "levelId", "trackId", "groupIds"] });
  const kind = audience === "groups" ? "groups" : trackId ? "program" : "level";
  const query = {
    academicYearId, audience: kind, levelId: kind === "groups" ? null : levelId || null,
    trackId: kind === "program" ? trackId : null, groupIds: kind === "groups" ? [...groupIds].sort() : [],
  } as const;
  const complete = kind === "groups" ? query.groupIds.length > 0 : Boolean(query.levelId);
  const preview = useQuery({
    queryKey: quizPreviewQueryKey(academyId, query),
    queryFn: () => loadQuizAudiencePreview(academyId, { ...query, groupIds: [...query.groupIds] }),
    enabled: complete,
  });
  if (!complete || preview.isError) return null;
  if (preview.isPending) return <FieldDescription>Counting matching students…</FieldDescription>;
  return (
    <FieldDescription>
      {number.format(preview.data)} active student{preview.data === 1 ? "" : "s"} match now. Students who join this audience later can still take the quiz;
      students who leave it keep any work they already have.
    </FieldDescription>
  );
}
