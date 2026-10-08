"use client";

import { Controller, useFormContext, useWatch } from "react-hook-form";

import { Field, FieldDescription, FieldError } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Group, Level, Track } from "@/modules/groups";
import type { ScheduleFormValues } from "../validation";
import { LevelTrackSelect } from "@/components/shared/level-track";
import { Segmented } from "@/components/shared/segmented";

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

/** Who the schedule is for: one group, or a program (a level, optionally narrowed to one track). */
export function AudienceFields({ groups, levels, tracks, levelNames, disabled }: Props) {
  const { control, setValue, formState: { errors } } = useFormContext<ScheduleFormValues>();
  const audience = useWatch({ control, name: "audience" });
  const trackId = useWatch({ control, name: "trackId" });
  const mode: Mode = audience === "group" ? "group" : "program";
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
        <Controller
          control={control}
          name="levelId"
          render={({ field }) => (
            <LevelTrackSelect
              id="schedule" levels={levels} tracks={tracks} levelNames={levelNames} disabled={disabled}
              levelId={field.value} trackId={trackId}
              levelError={errors.levelId?.message} trackError={errors.trackId?.message}
              onChange={(next) => {
                field.onChange(next.levelId);
                setValue("trackId", next.trackId, clear);
                setValue("audience", next.trackId ? "program" : "level", clear);
              }}
            />
          )}
        />
      )}
      <FieldError>{errors.audience?.message}</FieldError>
    </div>
  );
}
