"use client";

import { useFormContext, useWatch } from "react-hook-form";
import { format, parseISO } from "date-fns";

import { ReviewStep as SharedReviewStep } from "@/components/shared/assessment/review";
import type { Group, Track } from "@/modules/groups";
import { formPartIssues } from "../../readiness";
import { formatScore } from "../../score";
import { formMaxScore, type AssignmentFormValues } from "../../validation";
import { PART_ISSUE_LABELS } from "../shared/labels";
import { summarizePart } from "./parts/summary";
import { describeAudience } from "@/components/shared/assessment/workspace/names";

type Props = {
  levelNames: Record<string, string>;
  tracks: Track[];
  groups: Group[];
  onEditDetails: () => void;
  onEditPart: (index: number) => void;
};

/** The last step: the assignment at a glance, and what still blocks marking. Unfinished setup can always be saved. */
export function ReviewStep({ levelNames, tracks, groups, onEditDetails, onEditPart }: Props) {
  const { control } = useFormContext<AssignmentFormValues>();
  const values = useWatch({ control });
  const parts = (values.parts ?? []) as AssignmentFormValues["parts"];
  const total = formMaxScore(parts);
  const summaries = parts.map(summarizePart);
  const unfinished = summaries.map((summary, index) => ({ summary, index })).filter((entry) => entry.summary.unfinished);
  const audience = describeAudience(
    { audience: values.audience || "level", levelId: values.levelId || null, trackId: values.trackId || null, groupIds: (values.groupIds ?? []) as string[] },
    { levelNames, trackNames: new Map(tracks.map((track) => [track.id, track.name])), groupNames: new Map(groups.map((group) => [group.id, group.name])) },
  );
  const questions = parts.reduce((sum, part) => sum + (part.kind === "legacy" ? 0 : part.questions.length), 0);

  return (
    <SharedReviewStep
      title={values.title?.trim() || "Untitled assignment"} instructions={values.instructions?.trim() ?? ""}
      facts={[
        { label: "Due", value: values.dueDate ? format(parseISO(values.dueDate), "MMM d, yyyy") : "No due date" },
        { label: "Audience", value: audience || "—" },
        { label: "Parts", value: `${parts.length} · ${questions} ${questions === 1 ? "item" : "items"}` },
        { label: "Total", value: total === null ? "—" : `${formatScore(total)} marks` },
      ]}
      parts={summaries}
      status={unfinished.length === 0
        ? { ready: true, title: "Ready for marking", message: "Every part is complete." }
        : {
          ready: false,
          title: `${unfinished.length === 1 ? "One part needs" : `${unfinished.length} parts need`} attention before marking`,
          items: unfinished.map(({ summary, index }) => ({
            label: summary.title, detail: formPartIssues(parts[index]).map((issue) => PART_ISSUE_LABELS[issue]).join("; "), onClick: () => onEditPart(index),
          })),
        }}
      onEditDetails={onEditDetails} onEditPart={onEditPart}
    />
  );
}
