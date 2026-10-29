"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  AssignmentsIcon, CheckListIcon, CheckmarkSquare02Icon, ComputerIcon, File01Icon, FileUploadIcon, Layers01Icon, LeftToRightListBulletIcon,
  LeftToRightListNumberIcon, ListViewIcon, PencilEdit01Icon, UserGroupIcon,
} from "@hugeicons/core-free-icons";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatAcademyLong, formatAcademyRelative } from "@/lib/academy-time";
import { PART_KIND_LABELS, STATE_BADGE, STATE_LABELS } from "@/modules/assignments";
import { KIND_LABELS as EXAM_KIND_LABELS, PHASE_BADGE as EXAM_BADGE, PHASE_LABELS as EXAM_LABELS } from "@/modules/exams";
import { KIND_LABELS as QUIZ_KIND_LABELS, PHASE_BADGE as QUIZ_BADGE, PHASE_LABELS as QUIZ_LABELS } from "@/modules/quizzes";
import { TYPE_LABELS, type AssessmentListItem, type AssessmentType } from "../types";

type Icon = typeof AssignmentsIcon;
type Audience = "level" | "program" | "groups";

export const TYPE_ICONS: Record<AssessmentType, Icon> = { assignment: AssignmentsIcon, quiz: CheckListIcon, exam: File01Icon };
const PROGRAM_WIDE = { label: "Program-wide", icon: Layers01Icon };
/** A whole level and a level with its track are both program-wide. */
export const AUDIENCE_KINDS: Record<Audience, { label: string; icon: Icon }> = {
  level: PROGRAM_WIDE,
  program: PROGRAM_WIDE,
  groups: { label: "Group-wide", icon: UserGroupIcon },
};

const number = new Intl.NumberFormat("en");

const PART_ICONS: Record<string, Icon> = {
  online_questions: ComputerIcon, answer_sheet: CheckmarkSquare02Icon, file_upload: FileUploadIcon, legacy: LeftToRightListNumberIcon,
  question_sheet: LeftToRightListBulletIcon, written_work: PencilEdit01Icon,
};

/** Each part's kind label and icon, using the owning type's own names. */
function describeParts(item: AssessmentListItem) {
  return item.parts.map((part) => {
    const kind = part.kind ?? "legacy";
    const label = item.type === "assignment" ? PART_KIND_LABELS[kind as keyof typeof PART_KIND_LABELS]
      : (item.type === "quiz" ? QUIZ_KIND_LABELS : EXAM_KIND_LABELS)[kind as keyof typeof QUIZ_KIND_LABELS];
    return { title: part.title, label, icon: PART_ICONS[kind] };
  });
}

/** One part: its kind ("Manual marking"). Several: "3 parts", listed on a delayed hover. */
export function PartsSummary({ item }: { item: AssessmentListItem }) {
  const parts = describeParts(item);
  if (parts.length === 0) return <span>No parts yet</span>;
  const [first] = parts;
  const single = parts.length === 1;
  return (
    <Tooltip delayDuration={500}>
      {/* Above a card's stretched link so it can be hovered. */}
      <TooltipTrigger asChild>
        <span className="relative z-10 inline-flex min-w-0 cursor-default items-center gap-1.5">
          <HugeiconsIcon icon={single ? first.icon : ListViewIcon} strokeWidth={1.5} className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{single ? first.label : `${parts.length} parts`}</span>
          {!single && <span className="sr-only">: {parts.map((part) => `${part.title}, ${part.label}`).join("; ")}</span>}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-none">
        <ol className="flex flex-col gap-1 whitespace-nowrap">
          {parts.map((part, index) => (
            <li key={index} className="flex items-center gap-1.5">
              <HugeiconsIcon icon={part.icon} strokeWidth={1.5} className="size-3.5 shrink-0" aria-hidden="true" />
              <span>{part.title}</span>
              <span className="opacity-70">· {part.label}</span>
            </li>
          ))}
        </ol>
      </TooltipContent>
    </Tooltip>
  );
}

export function AssessmentTypeLabel({ type }: { type: AssessmentType }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <HugeiconsIcon icon={TYPE_ICONS[type]} strokeWidth={1.5} className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      {TYPE_LABELS[type]}
    </span>
  );
}

/** Muted audience name under a title, led by the audience kind's icon; the kind shows on a delayed hover. */
export function AudienceLine({ audience, name }: { audience: Audience | null; name: string }) {
  const kind = audience ? AUDIENCE_KINDS[audience] : null;
  return (
    <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
      {kind && (
        <Tooltip delayDuration={500}>
          {/* Above a card's stretched link so it can be hovered. */}
          <TooltipTrigger asChild>
            <span className="relative z-10 inline-flex shrink-0 cursor-default">
              <HugeiconsIcon icon={kind.icon} strokeWidth={1.5} className="size-3.5" aria-hidden="true" />
              <span className="sr-only">{kind.label}:</span>
            </span>
          </TooltipTrigger>
          <TooltipContent>{kind.label}</TooltipContent>
        </Tooltip>
      )}
      <span className="truncate">{name}</span>
    </span>
  );
}

/** "12 / 30": students fully marked of the audience. */
export function MarkedCount({ item }: { item: AssessmentListItem }) {
  return (
    <span className="tabular-nums">
      {number.format(item.markedCount)}<span className="text-muted-foreground"> / {number.format(item.audienceCount)}</span>
    </span>
  );
}

/** A status in its own type's words ("Active" for an assignment, "Finishing" for a quiz). */
export function statusLabel(type: AssessmentType, status: string): string {
  const labels: Record<string, string> = type === "assignment" ? STATE_LABELS : type === "quiz" ? QUIZ_LABELS : EXAM_LABELS;
  return labels[status] ?? status;
}

/** The type's own status badge: assignment state, or quiz/exam phase with pending closure processing. */
export function AssessmentStatus({ item }: { item: AssessmentListItem }) {
  if (item.type === "assignment") return <Badge variant={STATE_BADGE[item.status]}>{STATE_LABELS[item.status]}</Badge>;
  const [labels, badges] = item.type === "quiz" ? [QUIZ_LABELS, QUIZ_BADGE] : [EXAM_LABELS, EXAM_BADGE];
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <Badge variant={badges[item.status]}>{labels[item.status]}</Badge>
      {item.processingPending && <span className="text-xs text-muted-foreground">Processing closure</span>}
    </span>
  );
}

export function Missing() {
  return <><span aria-hidden="true">—</span><span className="sr-only">Not set</span></>;
}

/** One short line ("Due Friday 10pm"); the full dates show on a delayed hover and to screen readers. */
function DateLine({ short, details }: { short: string; details: [label: string, iso: string][] }) {
  return (
    <Tooltip delayDuration={500}>
      <TooltipTrigger asChild>
        <span className="relative z-10 block cursor-default truncate">
          <span aria-hidden="true">{short}</span>
          <span className="sr-only">{details.map(([label, iso]) => `${label} ${formatAcademyLong(iso)}`).join(", ")}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-none">
        <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 whitespace-nowrap">
          {details.map(([label, iso]) => (
            <div key={label} className="contents">
              <dt className="opacity-70">{label}</dt>
              <dd>{formatAcademyLong(iso)}</dd>
            </div>
          ))}
        </dl>
      </TooltipContent>
    </Tooltip>
  );
}

/** Due date for assignments; for quizzes and exams, the next window event (opens, closes) or when it closed. */
export function AssessmentDate({ item, now = new Date() }: { item: AssessmentListItem; now?: Date }) {
  if (item.type === "assignment") {
    if (!item.dueAt) return <Missing />;
    return <DateLine short={`Due ${formatAcademyRelative(item.dueAt, now)}`} details={[["Due", item.dueAt]]} />;
  }
  const { opensAt, closesAt } = item;
  if (!opensAt && !closesAt) return <Missing />;
  const details: [string, string][] = [];
  if (opensAt) details.push(["Opens", opensAt]);
  if (closesAt) details.push(["Closes", closesAt]);
  const short = opensAt && new Date(opensAt) > now ? `Opens ${formatAcademyRelative(opensAt, now)}`
    : closesAt ? `${new Date(closesAt) > now ? "Closes" : "Closed"} ${formatAcademyRelative(closesAt, now)}`
    : `Opened ${formatAcademyRelative(opensAt!, now)}`;
  return <DateLine short={short} details={details} />;
}
