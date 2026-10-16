"use client";

import { useMemo, type ReactNode } from "react";
import { Controller, useWatch, type UseFormReturn } from "react-hook-form";

import { ChoiceCards } from "@/components/shared/choice-cards";
import { PhoneInput } from "@/components/shared/app-input";
import {
  Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import type { Group, Level, Track } from "@/modules/groups";
import type { StudentRecordField } from "../types";
import {
  isCompatibleGroup, isGroupCompatible, PARTICIPATION_LABELS, PARTICIPATION_TYPES, type StudentFormValues, type StudentRecordInput,
} from "../validation";

type Props = {
  form: UseFormReturn<StudentFormValues, unknown, StudentRecordInput>;
  levels: Level[];
  tracks: Track[];
  levelNames: Record<string, string>;
  /** The year's active groups. */
  groups: Group[];
  placementLocked: boolean;
  /** Explains why placement is locked, under the Placement heading. */
  placementNote?: ReactNode;
  /** Extra context under individual fields, such as an import file's unresolved value. */
  hints?: Partial<Record<StudentRecordField, ReactNode>>;
};

const UNASSIGNED = "__unassigned__";
const FIELD_IDS: Record<StudentRecordField, string> = {
  fullName: "student-name",
  studentPhone: "student-phone",
  parentPhone: "student-parent-phone",
  levelId: "student-level",
  trackId: "student-track",
  primaryGroupId: "student-group",
  participationType: "student-type",
};

/**
 * The student name, phone, and placement fields shared by the create/edit form and import
 * corrections. Changing the level or track clears a group that no longer matches.
 */
export function StudentFormFields({ form, levels, tracks, levelNames, groups, placementLocked, placementNote, hints }: Props) {
  const { control, register, setValue, formState: { errors } } = form;
  const [levelId, trackId] = useWatch({ control, name: ["levelId", "trackId"] });
  const context = useMemo(() => ({ tracks, groups }), [tracks, groups]);
  const levelTracks = tracks.filter((track) => track.level_id === levelId);
  const needsTrack = levelTracks.length > 0;
  const groupOptions = levelId && (!needsTrack || trackId)
    ? groups.filter((group) => isGroupCompatible(group, levelId, trackId))
    : [];
  const quiet = { shouldDirty: true, shouldValidate: false } as const;

  /** Clears the group when the new level/track no longer matches it. */
  function keepCompatibleGroup(next: { levelId: string; trackId: string }) {
    const primaryGroupId = form.getValues("primaryGroupId");
    if (primaryGroupId && !isCompatibleGroup({ ...next, primaryGroupId }, context)) setValue("primaryGroupId", "", quiet);
  }

  const describedBy = (field: StudentRecordField) =>
    [errors[field]?.message && `${FIELD_IDS[field]}-error`, hints?.[field] && `${FIELD_IDS[field]}-hint`].filter(Boolean).join(" ") || undefined;
  const errorProps = (field: StudentRecordField) => ({
    "aria-invalid": Boolean(errors[field]?.message) || undefined,
    "aria-describedby": describedBy(field),
  });
  const fieldNotes = (field: StudentRecordField) => (
    <>
      {hints?.[field] && <FieldDescription id={`${FIELD_IDS[field]}-hint`}>{hints[field]}</FieldDescription>}
      <FieldError id={`${FIELD_IDS[field]}-error`}>{errors[field]?.message}</FieldError>
    </>
  );

  return (
    <>
      <FieldSet className="gap-5">
        <FieldLegend className="mb-2">Student</FieldLegend>
        <FieldGroup className="gap-5">
          <Field data-invalid={Boolean(errors.fullName) || undefined}>
            <FieldLabel htmlFor={FIELD_IDS.fullName}>Full name</FieldLabel>
            <Input id={FIELD_IDS.fullName} maxLength={200} autoComplete="off" required {...register("fullName")} {...errorProps("fullName")} />
            {fieldNotes("fullName")}
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field data-invalid={Boolean(errors.studentPhone) || undefined}>
              <FieldLabel htmlFor={FIELD_IDS.studentPhone}>Student phone</FieldLabel>
              <Controller control={control} name="studentPhone" render={({ field }) => (
                <PhoneInput id={FIELD_IDS.studentPhone} placeholder="10 1234 5678" ref={field.ref} name={field.name}
                  value={field.value} onChange={field.onChange} onBlur={field.onBlur} {...errorProps("studentPhone")} />
              )} />
              {fieldNotes("studentPhone")}
            </Field>
            <Field data-invalid={Boolean(errors.parentPhone) || undefined}>
              <FieldLabel htmlFor={FIELD_IDS.parentPhone}>Parent phone</FieldLabel>
              <Controller control={control} name="parentPhone" render={({ field }) => (
                <PhoneInput id={FIELD_IDS.parentPhone} placeholder="10 1234 5678" ref={field.ref} name={field.name}
                  value={field.value} onChange={field.onChange} onBlur={field.onBlur} {...errorProps("parentPhone")} />
              )} />
              {fieldNotes("parentPhone")}
            </Field>
          </div>
        </FieldGroup>
      </FieldSet>

      <Separator />

      <FieldSet className="gap-5">
        <FieldLegend className="mb-2">Placement</FieldLegend>
        {placementNote && <FieldDescription className="-mt-3">{placementNote}</FieldDescription>}
        <FieldGroup className="gap-5">
          <div className={`grid gap-5 ${needsTrack ? "sm:grid-cols-2" : ""}`}>
            <Field data-invalid={Boolean(errors.levelId) || undefined}>
              <FieldLabel htmlFor={FIELD_IDS.levelId}>Level</FieldLabel>
              <Controller control={control} name="levelId" render={({ field }) => (
                <Select value={field.value} disabled={placementLocked} onValueChange={(value) => {
                  field.onChange(value);
                  setValue("trackId", "", quiet);
                  keepCompatibleGroup({ levelId: value, trackId: "" });
                }}>
                  <SelectTrigger id={FIELD_IDS.levelId} className="w-full" onBlur={field.onBlur} {...errorProps("levelId")}>
                    <SelectValue placeholder="Choose a level" />
                  </SelectTrigger>
                  <SelectContent>
                    {levels.map((level) => <SelectItem key={level.level_id} value={level.level_id}>{levelNames[level.level_id] ?? level.level_id}</SelectItem>)}
                  </SelectContent>
                </Select>
              )} />
              {fieldNotes("levelId")}
            </Field>
            {needsTrack && (
              <Field data-invalid={Boolean(errors.trackId) || undefined}>
                <FieldLabel htmlFor={FIELD_IDS.trackId}>Track</FieldLabel>
                <Controller control={control} name="trackId" render={({ field }) => (
                  <Select value={field.value} disabled={placementLocked} onValueChange={(value) => {
                    field.onChange(value);
                    keepCompatibleGroup({ levelId, trackId: value });
                  }}>
                    <SelectTrigger id={FIELD_IDS.trackId} className="w-full" onBlur={field.onBlur} {...errorProps("trackId")}>
                      <SelectValue placeholder="Choose a track" />
                    </SelectTrigger>
                    <SelectContent>
                      {levelTracks.map((track) => <SelectItem key={track.id} value={track.id}>{track.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )} />
                {fieldNotes("trackId")}
              </Field>
            )}
          </div>

          <Field data-invalid={Boolean(errors.primaryGroupId) || undefined}>
            <FieldLabel htmlFor={FIELD_IDS.primaryGroupId}>Group<span className="text-muted-foreground">(optional)</span></FieldLabel>
            <Controller control={control} name="primaryGroupId" render={({ field }) => (
              <Select value={field.value || UNASSIGNED} disabled={placementLocked || !levelId || (needsTrack && !trackId)}
                onValueChange={(value) => field.onChange(value === UNASSIGNED ? "" : value)}>
                <SelectTrigger id={FIELD_IDS.primaryGroupId} className="w-full" onBlur={field.onBlur} {...errorProps("primaryGroupId")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                  {groupOptions.map((group) => <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )} />
            {fieldNotes("primaryGroupId")}
          </Field>

          <Field data-invalid={Boolean(errors.participationType) || undefined}>
            <FieldLabel id={`${FIELD_IDS.participationType}-label`}>Student type</FieldLabel>
            <Controller control={control} name="participationType" render={({ field }) => (
              <ChoiceCards name={FIELD_IDS.participationType} label="Student type" value={field.value}
                options={PARTICIPATION_TYPES.map((type) => ({ value: type, title: PARTICIPATION_LABELS[type] }))}
                onChange={field.onChange} disabled={placementLocked} />
            )} />
            {fieldNotes("participationType")}
          </Field>
        </FieldGroup>
      </FieldSet>
    </>
  );
}
