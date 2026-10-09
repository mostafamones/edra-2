"use client";

import { Controller, useFormContext, useWatch } from "react-hook-form";

import {
  Combobox, ComboboxChip, ComboboxChips, ComboboxChipsInput, ComboboxContent, ComboboxEmpty, ComboboxItem, ComboboxList,
  ComboboxValue, useComboboxAnchor,
} from "@/components/ui/combobox";
import { LevelTrackSelect } from "@/components/shared/level-track";
import { Segmented } from "@/components/shared/segmented";
import { Field, FieldError } from "@/components/ui/field";
import type { Group, Level, Track } from "@/modules/groups";
import type { AssignmentAudience } from "../../types";
import type { AssignmentFormValues } from "../../validation";

type Props = {
  groups: Group[];
  levels: Level[];
  tracks: Track[];
  levelNames: Record<string, string>;
  /** The audience is locked once the assignment is published. */
  disabled?: boolean;
};

type Option = { value: string; label: string; hint: string };

type Kind = "groups" | "program";

const KINDS: { value: Kind; label: string }[] = [
  { value: "program", label: "Level / track" },
  { value: "groups", label: "Groups" },
];

/** Who it's for, as on schedules: selected groups, or a level optionally narrowed to one track. */
export function AudienceFields({ groups, levels, tracks, levelNames, disabled }: Props) {
  const { control, setValue, formState: { errors } } = useFormContext<AssignmentFormValues>();
  const [audience, trackId] = useWatch({ control, name: ["audience", "trackId"] });
  const kind: Kind = audience === "groups" ? "groups" : "program";
  const trackNames = new Map(tracks.map((track) => [track.id, track.name]));
  const clear = { shouldDirty: true, shouldValidate: false } as const;

  function changeKind(next: Kind) {
    if (next === kind) return;
    const nextAudience: AssignmentAudience = next === "groups" ? "groups" : "level";
    setValue("audience", nextAudience, clear);
    setValue("levelId", "", clear);
    setValue("trackId", "", clear);
    setValue("groupIds", [], clear);
  }

  const groupOptions: Option[] = groups.map((group) => ({
    value: group.id,
    label: group.name,
    hint: `${levelNames[group.level_id] ?? group.level_id}${group.track_id && trackNames.get(group.track_id) ? ` · ${trackNames.get(group.track_id)}` : ""}`,
  }));

  return (
    <div className="flex flex-col gap-5">
      <Segmented label="Audience" value={kind} options={KINDS} onChange={changeKind} disabled={disabled} fill />

      {kind === "groups" ? (
        <Field data-invalid={Boolean(errors.groupIds) || undefined}>
          <Controller
            control={control}
            name="groupIds"
            render={({ field }) => <GroupPicker options={groupOptions} value={field.value} onChange={field.onChange} disabled={disabled} />}
          />
          <FieldError>{errors.groupIds?.message}</FieldError>
        </Field>
      ) : (
        <Controller
          control={control}
          name="levelId"
          render={({ field }) => (
            <LevelTrackSelect
              id="assignment" levels={levels} tracks={tracks} levelNames={levelNames} disabled={disabled}
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

function GroupPicker({ options, value, onChange, disabled }: {
  options: Option[]; value: string[]; onChange: (ids: string[]) => void; disabled?: boolean;
}) {
  const anchor = useComboboxAnchor();
  // Saved ids of groups archived since keep a chip so they can be removed.
  const selected = value.map((id) => options.find((option) => option.value === id) ?? { value: id, label: "Archived group", hint: "" });
  return (
    <Combobox
      multiple
      autoHighlight
      disabled={disabled}
      items={options}
      value={selected}
      onValueChange={(next: Option[]) => onChange(next.map((option) => option.value))}
      itemToStringLabel={(option: Option) => option.label}
      isItemEqualToValue={(a: Option, b: Option) => a.value === b.value}
    >
      <ComboboxChips ref={anchor} className="w-full">
        <ComboboxValue>
          {(values: Option[]) => (
            <>
              {values.map((option) => <ComboboxChip key={option.value}>{option.label}</ComboboxChip>)}
              <ComboboxChipsInput id="assignment-groups" placeholder={values.length > 0 ? "" : "Choose groups"} aria-label="Groups" />
            </>
          )}
        </ComboboxValue>
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>No matching groups.</ComboboxEmpty>
        <ComboboxList>
          {(option: Option) => (
            <ComboboxItem key={option.value} value={option}>
              <span className="flex-1 truncate">{option.label}</span>
              <span className="text-xs text-muted-foreground">{option.hint}</span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
