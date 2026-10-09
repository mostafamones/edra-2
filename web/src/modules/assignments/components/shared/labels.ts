import { IconDeviceLaptop, IconFileUpload, IconListCheck, IconNumbers, type Icon } from "@tabler/icons-react";

import type { AssignmentAudience, AssignmentState, PartIssue, PartKind, PublicationState, WorkStatus } from "../../types";

export const STATE_LABELS: Record<AssignmentState, string> = {
  draft: "Draft",
  published: "Published",
  closed: "Closed",
  archived: "Archived",
};

export const STATE_BADGE: Record<AssignmentState, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline",
  published: "default",
  closed: "secondary",
  archived: "secondary",
};

export const WORK_LABELS: Record<WorkStatus, string> = {
  expected: "Not received",
  submitted: "Received",
  late: "Received late",
  missing: "Missing",
  excused: "Excused",
};

export const WORK_BADGE: Record<WorkStatus, "default" | "secondary" | "outline" | "destructive"> = {
  expected: "outline",
  submitted: "default",
  late: "secondary",
  missing: "destructive",
  excused: "secondary",
};

export const RESULT_LABELS: Record<PublicationState, string> = {
  unpublished: "Not published",
  published: "Published",
  pending_correction: "Correction pending",
};

export const RESULT_BADGE: Record<PublicationState, "default" | "secondary" | "outline" | "destructive"> = {
  unpublished: "outline",
  published: "default",
  pending_correction: "secondary",
};

export const AUDIENCE_LABELS: Record<AssignmentAudience, string> = {
  level: "Entire level",
  program: "Level and track",
  groups: "Selected groups",
};

export type AudienceNames = {
  levelNames: Record<string, string>;
  trackNames: Map<string, string>;
  groupNames: Map<string, string>;
};

/** "Grade 10", "Grade 10 · Science", or "Group A, Group B" (unknown ids fall back to a count). */
export function describeAudience(
  value: { audience: AssignmentAudience; levelId: string | null; trackId: string | null; groupIds: readonly string[] },
  names: AudienceNames,
): string {
  if (value.audience === "groups") {
    const known = value.groupIds.map((id) => names.groupNames.get(id)).filter((name): name is string => Boolean(name));
    if (known.length === value.groupIds.length && known.length <= 3) return known.join(", ");
    return `${value.groupIds.length} group${value.groupIds.length === 1 ? "" : "s"}`;
  }
  const level = value.levelId ? names.levelNames[value.levelId] ?? value.levelId : "";
  const track = value.trackId ? names.trackNames.get(value.trackId) : undefined;
  return track ? `${level} · ${track}` : level;
}

export const PART_KIND_HINTS: Record<PartKind, string> = {
  online_questions: "Questions are written here, with choices; students answer them in Edra",
  answer_sheet: "Questions are on a separate sheet; you set the correct answer and marks for each",
  file_upload: "No answer key: you mark each question by hand, from uploaded work or in person",
};

export const PART_KIND_LABELS: Record<PartKind | "legacy", string> = {
  online_questions: "Edra questions",
  answer_sheet: "Answer key",
  file_upload: "Manual marking",
  legacy: "Marks only (legacy)",
};

export const PART_KIND_ICONS: Record<PartKind | "legacy", Icon> = {
  online_questions: IconDeviceLaptop,
  answer_sheet: IconListCheck,
  file_upload: IconFileUpload,
  legacy: IconNumbers,
};

/** "3 questions", "1 entry". */
export const countLabel = (kind: PartKind | "legacy", count: number) =>
  `${count} ${kind === "online_questions" ? (count === 1 ? "question" : "questions") : (count === 1 ? "entry" : "entries")}`;

export const PART_ISSUE_LABELS: Record<PartIssue, string> = {
  maximum: "needs a maximum mark",
  questions: "needs at least one question or entry",
  choices: "every question needs at least two choices",
  correct_choice: "every question needs a correct choice",
  prompt: "every question needs its text",
  choice_text: "every choice needs its text",
};
