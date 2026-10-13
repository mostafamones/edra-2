"use client";

import { useEffect, useMemo, useState } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { IconAlertCircle, IconInfoCircle } from "@tabler/icons-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet,
} from "@/components/ui/field";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { useAcademyScope } from "@/modules/auth";
import type { AcademyEntry } from "@/modules/academies";
import {
  academicYearQueryKey, groupDependencyQueryKey, groupListQueryKey, loadActiveYear, loadGroups,
  loadStructure, structureQueryKey, type AcademicYear, type Group, type Level, type Track,
} from "@/modules/groups";
import { createSchedule, updateSchedule } from "../actions";
import { creatableKinds } from "../permissions";
import { schedulesRootKey, type Schedule, type ScheduleSession, type ScheduleSlot } from "../queries";
import {
  scheduleFormDefaults, scheduleFormSchema, type ScheduleFormValues, type ScheduleInput, type ScheduleKind,
} from "../validation";
import { AudienceFields } from "./audience-fields";
import { ChoiceCards } from "@/components/shared/choice-cards";
import { Segmented } from "@/components/shared/segmented";
import { SessionFields } from "./session-fields";
import { SlotFields } from "./slot-fields";
import { Separator } from "@/components/ui/separator";

export type FormStatus = { dirty: boolean; saving: boolean };

type Props = {
  /** The academy this draft belongs to. The parent re-mounts the form when the academy changes. */
  academy: AcademyEntry;
  schedule?: Schedule;
  slots?: ScheduleSlot[];
  sessions?: ScheduleSession[];
  /** "sheet" scrolls the fields above a fixed action footer. */
  variant?: "page" | "sheet";
  onSaved: () => void;
  onCancel: () => void;
  onStatusChange?: (status: FormStatus) => void;
};

/** Create or edit a schedule; loads the academic year, programs, and active groups it needs. */
export function ScheduleForm(props: Props) {
  const academyId = props.academy.id;
  const yearQuery = useQuery({ queryKey: academicYearQueryKey(academyId), queryFn: () => loadActiveYear(academyId) });
  const structureQuery = useQuery({ queryKey: structureQueryKey(academyId), queryFn: () => loadStructure(academyId) });
  const groupsQuery = useQuery({ queryKey: groupListQueryKey(academyId, false), queryFn: () => loadGroups(academyId) });
  const queries = [yearQuery, structureQuery, groupsQuery];
  const padded = props.variant === "sheet" ? "px-6 py-5" : "";

  if (queries.some((query) => query.isError)) {
    const retrying = queries.some((query) => query.isFetching);
    return (
      <div className={padded}>
        <Alert variant="destructive">
          <IconAlertCircle />
          <AlertTitle>Couldn’t load the schedule form</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3">
            <span>The academic year, levels, or groups failed to load.</span>
            <Button variant="outline" size="sm" disabled={retrying}
              onClick={() => { for (const query of queries) if (query.isError) void query.refetch(); }}>
              {retrying ? "Retrying…" : "Try again"}
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  if (yearQuery.isPending || !structureQuery.data || !groupsQuery.data) {
    return (
      <div role="status" aria-label="Loading schedule form" className={`flex flex-col gap-6 ${padded}`}>
        {[10, 24, 16, 10].map((height, index) => (
          <div key={index} aria-hidden="true" className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="w-full" style={{ height: `${height * 0.25}rem` }} />
          </div>
        ))}
      </div>
    );
  }
  if (!yearQuery.data) {
    return (
      <div className={padded}>
        <Alert>
          <IconAlertCircle />
          <AlertTitle>No active academic year</AlertTitle>
          <AlertDescription>Schedules belong to an academic year. Open one for this academy to schedule classes.</AlertDescription>
        </Alert>
      </div>
    );
  }
  return (
    <ScheduleFields
      {...props}
      year={yearQuery.data}
      levels={structureQuery.data.levels}
      tracks={structureQuery.data.tracks}
      levelNames={structureQuery.data.levelNames}
      groups={groupsQuery.data.groups}
    />
  );
}

type FieldsProps = Props & { year: AcademicYear; levels: Level[]; tracks: Track[]; levelNames: Record<string, string>; groups: Group[] };

const KIND_OPTIONS: { value: ScheduleKind; title: string; description: string }[] = [
  { value: "recurring", title: "Recurring", description: "Meets every week on the same days." },
  { value: "one_off", title: "One-off", description: "Meets once on a specific date." },
];

const ATTENDANCE_OPTIONS = [
  { value: "mandatory", label: "Mandatory" },
  { value: "optional", label: "Optional" },
];

function ScheduleFields({
  academy, schedule, slots, sessions, variant = "page", onSaved, onCancel, onStatusChange, year, levels, tracks, levelNames, groups,
}: FieldsProps) {
  const queryClient = useQueryClient();
  const isCurrentAcademy = useAcademyScope();
  const kinds = creatableKinds(academy.role);
  const schema = useMemo(() => scheduleFormSchema(academy.id, year), [academy.id, year]);
  const form = useForm<ScheduleFormValues, unknown, ScheduleInput>({
    resolver: zodResolver(schema),
    defaultValues: scheduleFormDefaults(kinds[0], schedule, slots, sessions),
  });
  const { control, register, formState: { errors, isDirty, isSubmitting } } = form;
  const [kind, mandatory] = useWatch({ control, name: ["kind", "mandatory"] });
  const [formError, setFormError] = useState("");
  const sheet = variant === "sheet";

  useEffect(() => { onStatusChange?.({ dirty: isDirty, saving: isSubmitting }); }, [isDirty, isSubmitting, onStatusChange]);

  async function save(input: ScheduleInput) {
    // Capture the academy before awaiting: the user may switch academies while this is pending.
    const targetAcademyId = academy.id;
    setFormError("");
    try {
      const result = schedule ? await updateSchedule(schedule.id, input) : await createSchedule(input);
      if (!result.ok) { if (isCurrentAcademy(targetAcademyId)) setFormError(result.message); return; }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: schedulesRootKey(targetAcademyId) }),
        queryClient.invalidateQueries({ queryKey: groupDependencyQueryKey(targetAcademyId) }),
      ]);
      if (!isCurrentAcademy(targetAcademyId)) return;
      toast.success(schedule ? "Schedule saved." : "Schedule created.");
      onSaved();
    } catch {
      if (isCurrentAcademy(targetAcademyId)) setFormError("Could not save the schedule. Check your connection and try again.");
    }
  }

  const titleError = errors.title?.message;
  const locationError = errors.location?.message;
  const errorProps = (message: string | undefined, id: string) =>
    ({ "aria-invalid": Boolean(message) || undefined, "aria-describedby": message ? `${id}-error` : undefined });

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(save)} noValidate className={sheet ? "flex min-h-0 flex-1 flex-col" : "flex flex-col gap-5"}>
        <fieldset disabled={isSubmitting} className={sheet ? "min-h-0 flex-1 overflow-y-auto px-6 py-5" : "min-w-0"}>
          <div className="flex flex-col gap-6">
            <FieldSet className="gap-6">
              <FieldLegend className="mb-3">Details</FieldLegend>
              <FieldGroup className="grid gap-5 sm:grid-cols-2">
                <Field data-invalid={Boolean(titleError) || undefined}>
                  <FieldLabel htmlFor="schedule-title">Name</FieldLabel>
                  <Input id="schedule-title" maxLength={100} placeholder="e.g. Grade 10 weekly class" {...register("title")} {...errorProps(titleError, "schedule-title")} />
                  <FieldError id="schedule-title-error">{titleError}</FieldError>
                </Field>
                <Field data-invalid={Boolean(locationError) || undefined}>
                  <FieldLabel htmlFor="schedule-location">Location<span className="text-muted-foreground">(optional)</span></FieldLabel>
                  <Input id="schedule-location" maxLength={120} placeholder="e.g. Room 3" {...register("location")} {...errorProps(locationError, "schedule-location")} />
                  <FieldError id="schedule-location-error">{locationError}</FieldError>
                </Field>
              </FieldGroup>
              <Separator />
              <FieldGroup className="gap-5">
                <FieldLegend className="mb-[-12]">Schedule type</FieldLegend>
                {!schedule && kinds.length > 1 ? (
                  <ChoiceCards
                    name="kind"
                    label="Schedule type"
                    value={kind}
                    options={KIND_OPTIONS}
                    onChange={(value) => { form.setValue("kind", value, { shouldDirty: true }); form.clearErrors(); }}
                  />
                ) : (
                  <FieldDescription>
                    {kind === "recurring" ? "Recurring schedule" : "One-off schedule"}
                    {schedule ? " · The type can’t change after creation." : " · Instructors can create one-off schedules."}
                  </FieldDescription>
                )}

                {kind === "recurring" ? (
                  <SlotFields />
                ) : (
                  <SessionFields minDate={year.starts_on} maxDate={year.ends_on} />
                )}
              </FieldGroup>
            </FieldSet>

            <Separator />
            <FieldSet className="gap-0">
              <FieldLegend className="mb-2">Audience</FieldLegend>
              <AudienceFields groups={groups} levels={levels} tracks={tracks} levelNames={levelNames} />
            </FieldSet>

            <FieldSet className="gap-10">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5">
                  <FieldLegend className="mb-0">Attendance</FieldLegend>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" aria-label="About attendance types" className="rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
                        <IconInfoCircle className="size-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" align="start" className="max-w-xs">
                      <p><strong>Mandatory:</strong> matching students are expected to attend, and absences are recorded.</p>
                      <p><strong>Optional:</strong> matching students may attend. Missing it has no absence consequences.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Segmented
                  label="Attendance"
                  value={mandatory ? "mandatory" : "optional"}
                  options={ATTENDANCE_OPTIONS}
                  onChange={(value) => form.setValue("mandatory", value === "mandatory", { shouldDirty: true })}
                />
              </div>
            </FieldSet>

            {formError && (
              <Alert variant="destructive">
                <IconAlertCircle />
                <AlertTitle>Couldn’t save the schedule</AlertTitle>
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
          </div>
        </fieldset>

        <div className={sheet ? "grid shrink-0 grid-cols-2 gap-3 border-t bg-popover px-6 py-4" : "flex justify-end gap-2"}>
          <Button type="button" variant="outline" className={sheet ? "w-full" : undefined} onClick={onCancel} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" className={sheet ? "w-full" : undefined} disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : schedule ? "Save changes" : "Create schedule"}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
