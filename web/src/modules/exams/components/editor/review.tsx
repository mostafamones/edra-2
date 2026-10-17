"use client";

import { useFormContext, useWatch } from "react-hook-form";

import { ReviewStep as SharedReviewStep } from "@/components/shared/assessment/review";
import { sheetPartIssues, sheetTotal, summarizeSheetPart } from "@/components/shared/assessment/sheet/types";
import { formatScore } from "@/lib/score";
import type { Group, Track } from "@/modules/groups";
import { draftIssues, valuesToDraft, type ExamFormValues } from "../../validation";
import { ISSUE_LABELS, KIND_LABELS } from "../shared/labels";
import { describeAudience } from "@/components/shared/assessment/workspace/names";

type Props = {
  levelNames: Record<string, string>;
  tracks: Track[];
  groups: Group[];
  onEditDetails: () => void;
  onEditPart: (index: number) => void;
};

/** The last step: the exam at a glance, and what still blocks it from receiving work. Unfinished setup can always be saved. */
export function ReviewStep({ levelNames, tracks, groups, onEditDetails, onEditPart }: Props) {
  const { control } = useFormContext<ExamFormValues>();
  const values = useWatch({ control }) as ExamFormValues;
  const parts = values.parts ?? [];
  const summaries = parts.map((part, index) => summarizeSheetPart(part, index, KIND_LABELS));
  const total = sheetTotal(parts);
  const questions = parts.reduce((sum, part) => sum + part.questions.length, 0);
  const draft = valuesToDraft({ ...values, parts, groupIds: values.groupIds ?? [] });
  const examIssues = [...new Set(draftIssues(draft).filter((issue) => issue.scope === "exam").map((issue) => issue.issue))];
  const unfinished = summaries.map((summary, index) => ({ summary, index })).filter((entry) => entry.summary.unfinished);
  const audience = describeAudience(draft, { levelNames, trackNames: new Map(tracks.map((track) => [track.id, track.name])), groupNames: new Map(groups.map((group) => [group.id, group.name])) });
  const items = [
    ...examIssues.map((issue) => ({ label: ISSUE_LABELS[issue], detail: "", onClick: issue === "parts" ? undefined : onEditDetails })),
    ...unfinished.map(({ summary, index }) => ({
      label: summary.title, detail: [...new Set(sheetPartIssues(parts[index]).map((issue) => ISSUE_LABELS[issue].toLowerCase()))].join("; "), onClick: () => onEditPart(index),
    })),
  ];

  return (
    <SharedReviewStep
      title={values.title?.trim() || "Untitled exam"} instructions={values.instructions?.trim() ?? ""}
      facts={[
        { label: "Audience", value: audience },
        { label: "Timer", value: values.timeLimit?.trim() ? `${values.timeLimit.trim()} min` : "Not set" },
        { label: "Parts", value: `${parts.length} · ${questions} ${questions === 1 ? "question" : "questions"}` },
        { label: "Total", value: total === null ? "—" : `${formatScore(total)} marks` },
      ]}
      parts={summaries}
      status={items.length === 0
        ? { ready: true, title: "Ready to receive work", message: "The audience and every part are complete." }
        : { ready: false, title: "Not ready to receive work yet", items }}
      onEditDetails={onEditDetails} onEditPart={onEditPart}
    />
  );
}
