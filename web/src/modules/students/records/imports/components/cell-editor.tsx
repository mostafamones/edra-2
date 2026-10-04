"use client";

import { IconAlertCircle, IconInfoCircle } from "@tabler/icons-react";

import { PhoneInput } from "@/components/shared/app-input";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Group, Level, Track } from "@/modules/groups";
import {
  isCompatibleGroup, isParticipationType, PARTICIPATION_LABELS, PARTICIPATION_TYPES, type StudentFormValues,
} from "../../validation";
import { cellText } from "../corrections";
import { issueMessage } from "../issues";
import { FIELD_LABELS } from "../mapping";
import type { ImportField, ImportRow } from "../types";

const UNASSIGNED = "__unassigned__";

type Props = {
  field: ImportField;
  row: ImportRow;
  rowWord: "row" | "item";
  values: StudentFormValues;
  /** The check that failed when saving, shown instead of the import issue. */
  error?: string;
  /** Whether this field differs from the staged row. */
  changed: boolean;
  onChange: (change: Partial<StudentFormValues>) => void;
  levels: Level[];
  tracks: Track[];
  levelNames: Record<string, string>;
  groups: Group[];
  disabled?: boolean;
};

/** Corrects one invalid field of a staged row in place: text, phone, or a select for placement and type. */
export function ImportCellEditor({ field, row, rowWord, values, error, changed, onChange, levels, tracks, levelNames, groups, disabled }: Props) {
  const label = `${FIELD_LABELS[field]} for ${rowWord} ${row.sourceRow}`;
  const issue = row.issues.find((candidate) => candidate.field === field);
  const original = cellText(row.source[field]);
  const invalid = Boolean(error) || Boolean(issue && !changed);
  const levelTracks = tracks.filter((track) => track.level_id === values.levelId);
  const groupOptions = groups.filter((group) => isCompatibleGroup({ levelId: values.levelId, trackId: values.trackId, primaryGroupId: group.id }, { tracks, groups }));
  const keepGroup = (levelId: string, trackId: string) =>
    values.primaryGroupId && isCompatibleGroup({ levelId, trackId, primaryGroupId: values.primaryGroupId }, { tracks, groups }) ? values.primaryGroupId : "";

  let control;
  switch (field) {
    case "full_name":
      control = <Input aria-label={label} aria-invalid={invalid || undefined} dir="auto" className="text-left" value={values.fullName} disabled={disabled}
        onChange={(event) => onChange({ fullName: event.target.value })} />;
      break;
    case "student_phone":
    case "parent_phone": {
      const key = field === "student_phone" ? "studentPhone" : "parentPhone";
      control = <PhoneInput aria-label={label} aria-invalid={invalid || undefined} placeholder="10 1234 5678" value={values[key]} disabled={disabled}
        onChange={(event) => onChange({ [key]: event.target.value })} />;
      break;
    }
    case "level":
      control = (
        <Select value={values.levelId} disabled={disabled} onValueChange={(levelId) => onChange({ levelId, trackId: "", primaryGroupId: keepGroup(levelId, "") })}>
          <SelectTrigger className="w-full" aria-label={label} aria-invalid={invalid || undefined}><SelectValue placeholder="Choose a level" /></SelectTrigger>
          <SelectContent>
            {levels.map((level) => <SelectItem key={level.level_id} value={level.level_id}>{levelNames[level.level_id] ?? level.level_id}</SelectItem>)}
          </SelectContent>
        </Select>
      );
      break;
    case "track":
      control = (
        <Select value={values.trackId} disabled={disabled || !values.levelId || levelTracks.length === 0}
          onValueChange={(trackId) => onChange({ trackId, primaryGroupId: keepGroup(values.levelId, trackId) })}>
          <SelectTrigger className="w-full" aria-label={label} aria-invalid={invalid || undefined}><SelectValue placeholder={values.levelId ? "Choose a track" : "Choose a level first"} /></SelectTrigger>
          <SelectContent>
            {levelTracks.map((track) => <SelectItem key={track.id} value={track.id}>{track.name}</SelectItem>)}
          </SelectContent>
        </Select>
      );
      break;
    case "group":
      control = (
        // An unresolved group shows no choice until one is made; Unassigned is a valid one.
        <Select value={values.primaryGroupId || (issue && !changed ? "" : UNASSIGNED)} disabled={disabled || !values.levelId || (levelTracks.length > 0 && !values.trackId)}
          onValueChange={(value) => onChange({ primaryGroupId: value === UNASSIGNED ? "" : value })}>
          <SelectTrigger className="w-full" aria-label={label} aria-invalid={invalid || undefined}><SelectValue placeholder="Choose a group" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
            {groupOptions.map((group) => <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>)}
          </SelectContent>
        </Select>
      );
      break;
    case "student_type":
      control = (
        <Select value={values.participationType} disabled={disabled}
          onValueChange={(value) => { if (isParticipationType(value)) onChange({ participationType: value }); }}>
          <SelectTrigger className="w-full" aria-label={label} aria-invalid={invalid || undefined}><SelectValue placeholder="Choose a type" /></SelectTrigger>
          <SelectContent>
            {PARTICIPATION_TYPES.map((type) => <SelectItem key={type} value={type}>{PARTICIPATION_LABELS[type]}</SelectItem>)}
          </SelectContent>
        </Select>
      );
      break;
  }

  // The file's value and why it failed, or the check that failed on save, behind an icon.
  const details = [
    error,
    original && `In the file: “${original}”`,
    issue && issueMessage(issue),
  ].filter((line): line is string => Boolean(line));
  const Icon = error ? IconAlertCircle : IconInfoCircle;
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <div className="min-w-0 flex-1">{control}</div>
      {details.length > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} aria-label={`${FIELD_LABELS[field]}: ${details.join(". ")}`}
              className={`inline-flex shrink-0 cursor-help rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${error ? "text-destructive" : "text-muted-foreground hover:text-foreground"}`}>
              <Icon className="size-4" aria-hidden="true" />
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs flex-col items-start gap-1 whitespace-normal">
            {details.map((line, index) => <p key={index} dir="auto" className={index === 0 && error ? "font-medium" : undefined}>{line}</p>)}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
