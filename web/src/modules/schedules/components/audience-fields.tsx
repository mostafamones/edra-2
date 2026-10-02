"use client";

import { Controller, useFormContext, useWatch } from "react-hook-form";

import { Field, FieldDescription, FieldError } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Group, Level, Track } from "@/modules/groups";
import type { ScheduleFormValues } from "../validation";
import { Segmented } from "./segmented";

type Props = {
  groups: Group[];
  levels: Level[];
  tracks: Track[];
  levelNames: Record<string, string>;
  disabled?: boolean;
};

type Mode = "group" | "program";

const MODES: { value: Mode; label: string }[] = [
  { value: "group", label: "Group" },
  { value: "program", label: "Level / track" },
];

const ALL_TRACKS = "__all__";

/** Who the schedule is for: one group, or a program (a level, optionally narrowed to one track). */
export function AudienceFields({ groups, levels, tracks, levelNames, disabled }: Props) {
  const { control, setValue, formState: { errors } } = useFormContext<ScheduleFormValues>();
  const audience = useWatch({ control, name: "audience" });
  const levelId = useWatch({ control, name: "levelId" });
  const mode: Mode = audience === "group" ? "group" : "program";
  const levelTracks = tracks.filter((track) => track.level_id === levelId);
  const trackNames = new Map(tracks.map((track) => [track.id, track.name]));
  const levelName = (id: string) => levelNames[id] ?? id;
  const clear = { shouldDirty: true, shouldValidate: false } as const;

  function changeMode(next: Mode) {
    if (next === mode) return;
    if (next === "group") {
      setValue("audience", "group", clear); setValue("levelId", "", clear); setValue("trackId", "", clear);
    } else {
      setValue("audience", "level", clear); setValue("groupId", "", clear);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Segmented label="Audience" value={mode} options={MODES} onChange={changeMode} disabled={disabled} fill />

      {mode === "group" ? (
        <Field data-invalid={Boolean(errors.groupId) || undefined}>
          <Controller
            control={control}
            name="groupId"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} disabled={disabled || groups.length === 0}>
                <SelectTrigger id="schedule-group" aria-label="Group" className="w-full" aria-invalid={Boolean(errors.groupId) || undefined}>
                  <SelectValue placeholder={groups.length ? "Choose a group" : "No active groups"} />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                      <span className="text-muted-foreground">
                        {" · "}{levelName(group.level_id)}{group.track_id && trackNames.get(group.track_id) ? ` · ${trackNames.get(group.track_id)}` : ""}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {groups.length === 0 && <FieldDescription>Create a group first, or choose a level instead.</FieldDescription>}
          <FieldError>{errors.groupId?.message}</FieldError>
        </Field>
      ) : (
        <div className={`grid gap-5 ${levelTracks.length ? "sm:grid-cols-2" : ""}`}>
          <Field data-invalid={Boolean(errors.levelId) || undefined}>
            <Controller
              control={control}
              name="levelId"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(value) => { field.onChange(value); setValue("trackId", "", clear); setValue("audience", "level", clear); }}
                  disabled={disabled}
                >
                  <SelectTrigger id="schedule-level" aria-label="Level" className="w-full" aria-invalid={Boolean(errors.levelId) || undefined}>
                    <SelectValue placeholder="Choose a level" />
                  </SelectTrigger>
                  <SelectContent>
                    {levels.map((level) => <SelectItem key={level.level_id} value={level.level_id}>{levelName(level.level_id)}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError>{errors.levelId?.message}</FieldError>
          </Field>
          {levelTracks.length > 0 && (
            <Field data-invalid={Boolean(errors.trackId) || undefined}>
              <Controller
                control={control}
                name="trackId"
                render={({ field }) => (
                  <Select
                    value={field.value || ALL_TRACKS}
                    onValueChange={(value) => {
                      const trackId = value === ALL_TRACKS ? "" : value;
                      field.onChange(trackId);
                      setValue("audience", trackId ? "program" : "level", clear);
                    }}
                    disabled={disabled}
                  >
                    <SelectTrigger id="schedule-track" aria-label="Track" className="w-full" aria-invalid={Boolean(errors.trackId) || undefined}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_TRACKS}>All tracks</SelectItem>
                      {levelTracks.map((track) => <SelectItem key={track.id} value={track.id}>{track.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError>{errors.trackId?.message}</FieldError>
            </Field>
          )}
        </div>
      )}
      <FieldError>{errors.audience?.message}</FieldError>
    </div>
  );
}
