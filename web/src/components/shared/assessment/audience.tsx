"use client";

import type { ReactNode } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";

import { LevelTrackSelect } from "@/components/shared/level-track";
import { Segmented } from "@/components/shared/segmented";
import {
  Combobox, ComboboxChip, ComboboxChips, ComboboxChipsInput, ComboboxContent, ComboboxEmpty, ComboboxItem, ComboboxList,
  ComboboxValue, useComboboxAnchor,
} from "@/components/ui/combobox";
import { Field, FieldDescription, FieldError } from "@/components/ui/field";
import type { Group, Level, Track } from "@/modules/groups";

/** The form values every audience picker reads and writes. `""` means no audience chosen yet. */
export type AudienceValues = {
  audience: "" | "level" | "program" | "groups";
  levelId: string;
  trackId: string;
  groupIds: string[];
};

type Props = {
  /** Prefix of the field ids, such as "quiz". */
  idPrefix: string;
  groups: Group[];
  levels: Level[];
  tracks: Track[];
  levelNames: Record<string, string>;
  disabled?: boolean;
  /** Offers “Decide later”: the audience may stay empty while the work is being prepared. */
  optional?: { hint: ReactNode };
  /** The advisory count of matching students, shown once the audience is complete. */
  count: ReactNode;
};

type Option = { value: string; label: string; hint: string };
type Kind = "none" | "groups" | "program";

/** Who it's for: selected groups, or a level optionally narrowed to one track. */
export function AudienceFields({ idPrefix, groups, levels, tracks, levelNames, disabled, optional, count }: Props) {
  const { control, setValue, formState: { errors } } = useFormContext<AudienceValues>();
  const [audience, trackId] = useWatch({ control, name: ["audience", "trackId"] });
  const kind: Kind = audience === "" ? "none" : audience === "groups" ? "groups" : "program";
  const trackNames = new Map(tracks.map((track) => [track.id, track.name]));
  const clear = { shouldDirty: true, shouldValidate: false } as const;

  function changeKind(next: Kind) {
    if (next === kind) return;
    setValue("audience", next === "none" ? "" : next === "groups" ? "groups" : "level", clear);
    setValue("levelId", "", clear);
    setValue("trackId", "", clear);
    setValue("groupIds", [], clear);
  }

  const groupOptions: Option[] = groups.map((group) => ({
    value: group.id,
    label: group.name,
    hint: `${levelNames[group.level_id] ?? group.level_id}${group.track_id && trackNames.get(group.track_id) ? ` · ${trackNames.get(group.track_id)}` : ""}`,
  }));
  const kinds: { value: Kind; label: string }[] = [
    ...(optional ? [{ value: "none" as const, label: "Decide later" }] : []),
    { value: "program", label: "Level / track" },
    { value: "groups", label: "Groups" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <Segmented label="Audience" value={kind} options={kinds} onChange={changeKind} disabled={disabled} fill />

      {kind === "groups" && (
        <Field data-invalid={Boolean(errors.groupIds) || undefined}>
          <Controller
            control={control}
            name="groupIds"
            render={({ field }) => <GroupPicker id={`${idPrefix}-groups`} options={groupOptions} value={field.value} onChange={field.onChange} disabled={disabled} />}
          />
          <FieldError>{errors.groupIds?.message}</FieldError>
        </Field>
      )}
      {kind === "program" && (
        <Controller
          control={control}
          name="levelId"
          render={({ field }) => (
            <LevelTrackSelect
              id={idPrefix} levels={levels} tracks={tracks} levelNames={levelNames} disabled={disabled}
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
      {kind === "none" ? <FieldDescription>{optional?.hint}</FieldDescription> : !disabled && count}
    </div>
  );
}

function GroupPicker({ id, options, value, onChange, disabled }: {
  id: string; options: Option[]; value: string[]; onChange: (ids: string[]) => void; disabled?: boolean;
}) {
  const anchor = useComboboxAnchor();
  // Saved ids of groups archived since keep a chip so they can be removed.
  const selected = value.map((groupId) => options.find((option) => option.value === groupId) ?? { value: groupId, label: "Archived group", hint: "" });
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
              <ComboboxChipsInput id={id} placeholder={values.length > 0 ? "" : "Choose groups"} aria-label="Groups" />
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
