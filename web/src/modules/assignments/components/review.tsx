"use client";

import { useFormContext, useWatch } from "react-hook-form";
import { format, parseISO } from "date-fns";
import { IconAlertTriangle, IconChevronRight, IconCircleCheck, IconPencil } from "@tabler/icons-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Group, Track } from "@/modules/groups";
import { formPartIssues } from "../readiness";
import { formatScore } from "../score";
import { formMaxScore, formPartMax, type AssignmentFormValues } from "../validation";
import { countLabel, describeAudience, PART_ISSUE_LABELS, PART_KIND_ICONS, PART_KIND_LABELS } from "./labels";

type Props = {
  levelNames: Record<string, string>;
  tracks: Track[];
  groups: Group[];
  onEditDetails: () => void;
  onEditPart: (index: number) => void;
};

/** The last step: the assignment at a glance, and what still blocks publishing. Drafts can always be saved. */
export function ReviewStep({ levelNames, tracks, groups, onEditDetails, onEditPart }: Props) {
  const { control } = useFormContext<AssignmentFormValues>();
  const values = useWatch({ control });
  const parts = (values.parts ?? []) as AssignmentFormValues["parts"];
  const total = formMaxScore(parts);
  const unfinished = parts.map((part, index) => ({ index, part, issues: formPartIssues(part) })).filter((entry) => entry.issues.length > 0);
  const audience = describeAudience(
    { audience: values.audience ?? "level", levelId: values.levelId || null, trackId: values.trackId || null, groupIds: (values.groupIds ?? []) as string[] },
    { levelNames, trackNames: new Map(tracks.map((track) => [track.id, track.name])), groupNames: new Map(groups.map((group) => [group.id, group.name])) },
  );
  const questions = parts.reduce((sum, part) => sum + (part.kind === "legacy" ? 0 : part.questions.length), 0);

  return (
    <div className="flex flex-col gap-6">
      {unfinished.length === 0 ? (
        <Alert>
          <IconCircleCheck className="text-primary" />
          <AlertTitle>Ready to publish</AlertTitle>
          <AlertDescription>Every part is complete.</AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <IconAlertTriangle className="text-destructive" />
          <AlertTitle>{unfinished.length === 1 ? "One part needs" : `${unfinished.length} parts need`} attention before publishing</AlertTitle>
          <AlertDescription>
            <ul className="flex flex-col gap-0.5">
              {unfinished.map(({ index, part, issues }) => (
                <li key={index}>
                  <button type="button" className="text-left underline-offset-4 hover:underline" onClick={() => onEditPart(index)}>
                    <span className="font-medium text-foreground">{part.title.trim() || `Part ${index + 1}`}</span> {issues.map((issue) => PART_ISSUE_LABELS[issue]).join("; ")}
                  </button>
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <Card className="gap-0 py-0">
        <div className="flex items-start justify-between gap-4 p-5">
          <div className="min-w-0">
            <h2 className="truncate font-heading text-xl font-semibold">{values.title?.trim() || "Untitled assignment"}</h2>
            {values.instructions?.trim() && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{values.instructions.trim()}</p>}
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onEditDetails}><IconPencil />Edit</Button>
        </div>
        <dl className="grid grid-cols-2 border-t sm:grid-cols-4 [&>div]:p-4 [&>div:not(:last-child)]:border-r max-sm:[&>div:nth-child(2)]:border-r-0 max-sm:[&>div:nth-child(-n+2)]:border-b">
          <div><dt className="text-xs text-muted-foreground">Due</dt><dd className="mt-1 font-medium">{values.dueDate ? format(parseISO(values.dueDate), "MMM d, yyyy") : "No due date"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Audience</dt><dd className="mt-1 truncate font-medium">{audience || "—"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Parts</dt><dd className="mt-1 font-medium tabular-nums">{parts.length} · {questions} {questions === 1 ? "item" : "items"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Total</dt><dd className="mt-1 font-medium tabular-nums">{total === null ? "—" : `${formatScore(total)} marks`}</dd></div>
        </dl>
      </Card>

      <Card className="gap-0 py-0">
        <ol className="divide-y">
          {parts.map((part, index) => {
            const issues = formPartIssues(part);
            const max = formPartMax(part);
            const Icon = PART_KIND_ICONS[part.kind];
            return (
              <li key={part.id ?? index}>
                <button type="button" onClick={() => onEditPart(index)}
                  className="group flex w-full items-center gap-3 px-4 py-3 text-left text-sm outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/40">
                  <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{part.title.trim() || `Part ${index + 1}`}</span>
                    <span className="block text-muted-foreground">
                      {PART_KIND_LABELS[part.kind]}{part.kind !== "legacy" && ` · ${countLabel(part.kind, part.questions.length)}`}
                    </span>
                  </span>
                  <span className="tabular-nums">{max === null ? "—" : formatScore(max)} marks</span>
                  {issues.length === 0
                    ? <IconCircleCheck className="size-4 text-primary" aria-label="Complete" />
                    : <IconAlertTriangle className="size-4 text-destructive" aria-label="Unfinished" />}
                  <IconChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ol>
      </Card>
    </div>
  );
}
