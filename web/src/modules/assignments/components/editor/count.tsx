"use client";

import { useFormContext, useWatch } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";

import { FieldDescription } from "@/components/ui/field";
import { loadAudiencePreview, previewQueryKey } from "../../queries";
import type { AssignmentFormValues } from "../../validation";

const number = new Intl.NumberFormat("en");

/** The advisory count of students the audience matches now; saving takes the actual snapshot. */
export function AudienceCount({ academyId, academicYearId }: { academyId: string; academicYearId: string }) {
  const { control } = useFormContext<AssignmentFormValues>();
  const [audience, levelId, trackId, groupIds] = useWatch({ control, name: ["audience", "levelId", "trackId", "groupIds"] });
  const query = {
    academicYearId, audience, levelId: audience === "groups" ? null : levelId || null,
    trackId: audience === "program" ? trackId || null : null, groupIds: audience === "groups" ? [...groupIds].sort() : [],
  };
  const complete = audience === "groups" ? query.groupIds.length > 0 : Boolean(query.levelId) && (audience === "level" || Boolean(query.trackId));
  const preview = useQuery({
    queryKey: previewQueryKey(academyId, query),
    queryFn: () => loadAudiencePreview(academyId, query),
    enabled: complete,
  });
  if (!complete || preview.isError) return null;
  if (preview.isPending) return <FieldDescription>Counting matching students…</FieldDescription>;
  const { recipientCount, uncodedCount } = preview.data;
  return (
    <FieldDescription>
      {number.format(recipientCount)} matching students{uncodedCount > 0 ? ` · ${number.format(uncodedCount)} without a student code` : ""}
    </FieldDescription>
  );
}
