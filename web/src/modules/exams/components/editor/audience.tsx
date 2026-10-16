"use client";

import { useQuery } from "@tanstack/react-query";

import { LevelTrackSelect } from "@/components/shared/level-track";
import { Segmented } from "@/components/shared/segmented";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import type { Group, Level, Track } from "@/modules/groups";
import { loadExamAudiencePreview, examPreviewQueryKey } from "../../queries";
import type { ExamFormValues } from "../../validation";

type Props = {
  academyId: string;
  academicYearId: string;
  values: Pick<ExamFormValues, "audience" | "levelId" | "trackId" | "groupIds">;
  onChange: (change: Partial<ExamFormValues>) => void;
  groups: Group[];
  levels: Level[];
  tracks: Track[];
  levelNames: Record<string, string>;
  errors: Record<string, string>;
  /** Locked once work begins. */
  disabled: boolean;
};

const KINDS = [
  { value: "none", label: "Decide later" },
  { value: "program", label: "Level / track" },
  { value: "groups", label: "Groups" },
] as const;

/** Who the exam is for: nobody yet (incomplete preparation), a level with an optional track, or groups. */
export function AudienceFields({ academyId, academicYearId, values, onChange, groups, levels, tracks, levelNames, errors, disabled }: Props) {
  const kind = values.audience === "" ? "none" : values.audience;
  const trackNames = new Map(tracks.map((track) => [track.id, track.name]));
  return (
    <div className="flex flex-col gap-4">
      <Segmented label="Audience" value={kind} options={[...KINDS]} disabled={disabled} fill
        onChange={(next) => onChange({ audience: next === "none" ? "" : next, levelId: "", trackId: "", groupIds: [] })} />
      {kind === "program" && (
        <LevelTrackSelect id="exam" levels={levels} tracks={tracks} levelNames={levelNames} disabled={disabled}
          levelId={values.levelId} trackId={values.trackId} levelError={errors.levelId}
          onChange={(next) => onChange({ levelId: next.levelId, trackId: next.trackId })} />
      )}
      {kind === "groups" && (
        <Field data-invalid={Boolean(errors.groupIds) || undefined}>
          <FieldLabel>Groups</FieldLabel>
          {groups.length === 0 ? <FieldDescription>This academic year has no active groups.</FieldDescription> : (
            <div className="grid max-h-56 gap-2 overflow-y-auto rounded-lg border p-3 sm:grid-cols-2">
              {groups.map((group) => (
                <label key={group.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={values.groupIds.includes(group.id)} disabled={disabled}
                    onCheckedChange={(on) => onChange({ groupIds: on === true ? [...values.groupIds, group.id] : values.groupIds.filter((id) => id !== group.id) })} />
                  <span className="truncate">{group.name}</span>
                  <span className="ml-auto truncate text-xs text-muted-foreground">
                    {levelNames[group.level_id] ?? group.level_id}{group.track_id && trackNames.get(group.track_id) ? ` · ${trackNames.get(group.track_id)}` : ""}
                  </span>
                </label>
              ))}
            </div>
          )}
          <FieldError>{errors.groupIds}</FieldError>
        </Field>
      )}
      {kind === "none" ? (
        <FieldDescription>You can save without an audience; the exam can’t receive work until it has one.</FieldDescription>
      ) : <AudienceCount academyId={academyId} academicYearId={academicYearId} values={values} />}
    </div>
  );
}

const number = new Intl.NumberFormat("en");

/** Advisory: students matching now. Eligibility stays live, so later joiners qualify too. */
function AudienceCount({ academyId, academicYearId, values }: { academyId: string; academicYearId: string; values: Props["values"] }) {
  const audience = values.audience === "groups" ? "groups" : values.trackId ? "program" : "level";
  const query = {
    academicYearId, audience, levelId: audience === "groups" ? null : values.levelId || null,
    trackId: audience === "program" ? values.trackId : null, groupIds: audience === "groups" ? [...values.groupIds].sort() : [],
  } as const;
  const complete = audience === "groups" ? query.groupIds.length > 0 : Boolean(query.levelId);
  const preview = useQuery({
    queryKey: examPreviewQueryKey(academyId, query),
    queryFn: () => loadExamAudiencePreview(academyId, { ...query, groupIds: [...query.groupIds] }),
    enabled: complete,
  });
  if (!complete || preview.isError) return null;
  if (preview.isPending) return <FieldDescription>Counting matching students…</FieldDescription>;
  return (
    <FieldDescription>
      {number.format(preview.data)} active student{preview.data === 1 ? "" : "s"} match now. Students who join this audience later can still take the exam;
      students who leave it keep any work they already have.
    </FieldDescription>
  );
}
