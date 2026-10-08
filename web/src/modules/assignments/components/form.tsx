"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { IconAlertCircle, IconCheck, IconLoader2 } from "@tabler/icons-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { newUuid } from "@/lib/uuid";
import { useCanonicalHref } from "@/modules/navigation";
import type { AcademyEntry } from "@/modules/academies";
import { useAcademyScope } from "@/modules/auth";
import {
  academicYearQueryKey, groupListQueryKey, loadActiveYear, loadGroups, loadStructure, structureQueryKey,
  type AcademicYear, type Group, type Level, type Track,
} from "@/modules/groups";
import { createAssignmentDraft, saveAssignment } from "../actions";
import { assignmentPermissions } from "../permissions";
import { assignmentsRootKey } from "../queries";
import type { Assignment, AssignmentDraft, AssignmentResult } from "../types";
import { assignmentFormDefaults, assignmentFormSchema, type AssignmentFormValues } from "../validation";
import { AudienceFields } from "./audience";
import { DueFields } from "./due";
import { PartsList } from "./parts";
import { PartEditor, type PartStash } from "./part";
import { ImagesProvider } from "./images/context";
import { ReviewStep } from "./review";
import { StepFooter } from "./progress";
import { StepPanel, StepTabs } from "./steps";

const STEPS = [
  { value: "basics", label: "Basics", fields: ["title", "instructions", "dueDate", "dueTime", "audience", "levelId", "trackId", "groupIds"] },
  { value: "parts", label: "Parts", fields: ["parts"] },
  { value: "review", label: "Review", fields: [] },
] as const;
type Step = (typeof STEPS)[number]["value"];

export type FormStatus = { dirty: boolean; saving: boolean };

type Props = {
  /** The parent re-mounts the form when the academy changes. */
  academy: AcademyEntry;
  assignment?: Assignment;
  onSaved: (assignment: Assignment) => void;
  onCancel: () => void;
  onStatusChange?: (status: FormStatus) => void;
};

/** Create or edit an assignment; loads the academic year, levels, tracks, and groups it needs. */
export function AssignmentForm(props: Props) {
  const academyId = props.academy.id;
  const yearQuery = useQuery({ queryKey: academicYearQueryKey(academyId), queryFn: () => loadActiveYear(academyId) });
  const structureQuery = useQuery({ queryKey: structureQueryKey(academyId), queryFn: () => loadStructure(academyId) });
  const groupsQuery = useQuery({ queryKey: groupListQueryKey(academyId, false), queryFn: () => loadGroups(academyId) });
  const queries = [yearQuery, structureQuery, groupsQuery];

  if (queries.some((query) => query.isError)) {
    return (
      <Alert variant="destructive">
        <IconAlertCircle />
        <AlertTitle>Couldn’t load the assignment form</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-3">
          <span>The academic year, levels, or groups failed to load.</span>
          <Button variant="outline" size="sm" disabled={queries.some((query) => query.isFetching)}
            onClick={() => { for (const query of queries) if (query.isError) void query.refetch(); }}>
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  if (yearQuery.isPending || !structureQuery.data || !groupsQuery.data) {
    return (
      <div role="status" aria-label="Loading assignment form" className="flex flex-col gap-6">
        {[10, 24, 16, 30].map((height, index) => (
          <div key={index} aria-hidden="true" className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="w-full" style={{ height: `${height * 0.25}rem` }} />
          </div>
        ))}
      </div>
    );
  }
  const year = yearQuery.data;
  if (!year || (props.assignment && props.assignment.academicYearId !== year.id)) {
    return (
      <Alert>
        <IconAlertCircle />
        <AlertTitle>{year ? "This academic year is closed" : "No active academic year"}</AlertTitle>
        <AlertDescription>
          {year ? "Assignments of a closed year are read-only." : "Assignments belong to an academic year. Open one for this academy to create assignments."}
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <AssignmentFields {...props} year={year} levels={structureQuery.data.levels} tracks={structureQuery.data.tracks}
      levelNames={structureQuery.data.levelNames} groups={groupsQuery.data.groups} />
  );
}

type FieldsProps = Props & { year: AcademicYear; levels: Level[]; tracks: Track[]; levelNames: Record<string, string>; groups: Group[] };

function AssignmentFields({ academy, assignment, onSaved, onCancel, onStatusChange, year, levels, tracks, levelNames, groups }: FieldsProps) {
  const queryClient = useQueryClient();
  const isCurrentAcademy = useAcademyScope();
  // One id per create action: a retried submit returns the same draft instead of a second one.
  const [createId] = useState(newUuid);
  const locked = assignment ? !assignmentPermissions(academy.role, assignment).editStructure : false;
  const form = useForm<AssignmentFormValues, unknown, AssignmentDraft>({
    resolver: zodResolver(assignmentFormSchema),
    defaultValues: useMemo(() => assignmentFormDefaults(assignment), [assignment]),
  });
  const { register, formState: { errors, isDirty, isSubmitting } } = form;
  const href = useCanonicalHref();
  const [step, setStep] = useState<Step>("basics");
  // The part open in the editor, which replaces the steps until it is closed.
  const [editing, setEditing] = useState<number | null>(null);
  const [stash] = useState<PartStash>(() => ({ choices: new Map(), removed: new Map() }));
  const [direction, setDirection] = useState<1 | -1>(1);
  const [formError, setFormError] = useState<{ title: string; message: string; conflict?: boolean } | null>(null);
  const [autosave, setAutosave] = useState<"idle" | "saving" | "saved">("idle");
  // Drafts save themselves; a published assignment's text details are saved explicitly.
  const auto = !assignment || assignment.state === "draft";
  // The latest saved version, and a queue so an automatic and an explicit save never overlap.
  const current = useRef<Assignment | undefined>(assignment);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => { onStatusChange?.({ dirty: isDirty, saving: isSubmitting }); }, [isDirty, isSubmitting, onStatusChange]);

  function commit(draft: AssignmentDraft): Promise<AssignmentResult> {
    const run = queue.current.then(async () => {
      const base = current.current;
      const result = base
        ? await saveAssignment({ academyId: academy.id, assignmentId: base.id, expectedVersion: base.version, draft })
        : await createAssignmentDraft({ academyId: academy.id, academicYearId: year.id, assignmentId: createId, draft });
      if (result.ok) current.current = result.assignment;
      return result;
    });
    queue.current = run.catch(() => undefined);
    return run;
  }

  function failed(result: Extract<AssignmentResult, { ok: false }>) {
    setFormError({
      title: current.current ? "Couldn’t save the assignment" : "Couldn’t create the assignment", message: result.message,
      conflict: result.code === "assignment_conflict",
    });
  }

  // Automatic drafting: after a pause in editing, a valid form is saved quietly. Invalid or unfinished
  // input is skipped without errors; it is checked only when the form is submitted.
  useEffect(() => {
    if (!auto) return;
    const targetAcademyId = academy.id;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let lastSaved = JSON.stringify(form.getValues());
    async function run() {
      const values = form.getValues();
      const snapshot = JSON.stringify(values);
      if (stopped || snapshot === lastSaved) return;
      const parsed = assignmentFormSchema.safeParse(values);
      if (!parsed.success) return;
      setAutosave("saving");
      try {
        const result = await commit(parsed.data);
        if (!isCurrentAcademy(targetAcademyId)) return;
        if (!result.ok) {
          stopped = result.code === "assignment_conflict";
          failed(result);
          setAutosave("idle");
          return;
        }
        setFormError(null);
        void queryClient.invalidateQueries({ queryKey: assignmentsRootKey(targetAcademyId) });
        lastSaved = snapshot;
        // Adopt the stored ids when nothing changed meanwhile; otherwise the next pause saves the newer edits.
        if (JSON.stringify(form.getValues()) === snapshot) {
          const stored = assignmentFormDefaults(result.assignment);
          form.reset(stored);
          lastSaved = JSON.stringify(form.getValues());
        }
        setAutosave("saved");
      } catch {
        setAutosave("idle");
      }
    }
    const unsubscribe = form.subscribe({
      formState: { values: true },
      callback: () => {
        clearTimeout(timer);
        timer = setTimeout(() => void run(), 1200);
      },
    });
    return () => { clearTimeout(timer); unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, academy.id]);

  async function save(draft: AssignmentDraft) {
    // Capture the academy before awaiting: the user may switch academies while this is pending.
    const targetAcademyId = academy.id;
    setFormError(null);
    try {
      const result = await commit(draft);
      if (!isCurrentAcademy(targetAcademyId)) return;
      if (!result.ok) { failed(result); return; }
      await queryClient.invalidateQueries({ queryKey: assignmentsRootKey(targetAcademyId) });
      if (!isCurrentAcademy(targetAcademyId)) return;
      toast.success(assignment ? "Assignment saved." : "Draft saved.");
      onSaved(result.assignment);
    } catch {
      if (isCurrentAcademy(targetAcademyId)) setFormError({ title: "Couldn’t save the assignment", message: "Check your connection and try again." });
    }
  }

  const partCount = useWatch({ control: form.control, name: "parts" }).length;
  const titleError = errors.title?.message;
  const stepIndex = STEPS.findIndex((entry) => entry.value === step);

  /** Moving between steps never validates or discards edits; errors appear only on submit. */
  function go(next: Step) {
    setDirection(editing !== null || STEPS.findIndex((entry) => entry.value === next) < stepIndex ? -1 : 1);
    setEditing(null);
    setStep(next);
  }

  /** Opens a part's editor, sliding forward from the list or between parts. */
  function edit(index: number) {
    setDirection(editing !== null && index < editing ? -1 : 1);
    setStep("parts");
    setEditing(index);
  }

  /** An invalid save opens the first step with an error, or the first part with one. */
  function showInvalid(invalid: typeof errors) {
    const first = STEPS.find((entry) => entry.fields.some((field) => field in invalid));
    if (!first) return;
    const part = Array.isArray(invalid.parts) ? invalid.parts.findIndex(Boolean) : -1;
    if (first.value === "parts" && part >= 0) edit(part);
    else go(first.value);
  }

  const panel = {
    basics: (
      <div className="flex flex-col gap-8">
      <FieldSet className="gap-5">
        <FieldGroup className="gap-5">
          <div className="grid grid-cols-[3fr_2fr] gap-4">
            <Field data-invalid={Boolean(titleError) || undefined}>
              <FieldLabel htmlFor="assignment-title">Title</FieldLabel>
              <Input id="assignment-title" maxLength={200} placeholder="e.g. Unit 3 homework" {...register("title")} aria-invalid={Boolean(titleError) || undefined} />
              <FieldError>{titleError}</FieldError>
            </Field>
            <DueFields />
          </div>
          <Field data-invalid={Boolean(errors.instructions) || undefined}>
            <FieldLabel htmlFor="assignment-instructions">Instructions<span className="text-muted-foreground">(optional)</span></FieldLabel>
            <Textarea id="assignment-instructions" rows={6} maxLength={10000} {...register("instructions")} />
            <FieldError>{errors.instructions?.message}</FieldError>
          </Field>
        </FieldGroup>
      </FieldSet>
      <div role="separator" aria-label="Audience" className="mx-auto flex w-[70%] items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-sm text-muted-foreground">Audience</span>
        <Separator className="flex-1" />
      </div>
      <FieldSet className="gap-4">
        <AudienceFields groups={groups} levels={levels} tracks={tracks} levelNames={levelNames} disabled={locked} />
      </FieldSet>
      </div>
    ),
    parts: <PartsList locked={locked} onEdit={edit} />,
    review: <ReviewStep levelNames={levelNames} tracks={tracks} groups={groups} onEditDetails={() => go("basics")} onEditPart={edit} />,
  }[step];
  const editingPart = editing !== null && editing < partCount ? editing : null;

  return (
    <FormProvider {...form}>
      <ImagesProvider academyId={academy.id}>
      <form id="assignment-form" onSubmit={(event) => void form.handleSubmit(save, showInvalid)(event)} noValidate className="flex flex-col gap-6">
        <fieldset disabled={isSubmitting} className="flex min-w-0 flex-col gap-6">
          <StepPanel stepKey={editingPart === null ? step : `part-${editingPart}`} direction={direction}>
            {editingPart === null ? (
              <div className="flex flex-col gap-6">
                <StepTabs steps={STEPS} value={step} onChange={(value) => go(value as Step)} />
                {panel}
              </div>
            ) : (
              <PartEditor locked={locked} index={editingPart} stash={stash} onSelect={edit} onClose={() => go("parts")} />
            )}
          </StepPanel>
          {formError && (
            <Alert variant="destructive">
              <IconAlertCircle />
              <AlertTitle>{formError.title}</AlertTitle>
              <AlertDescription className="flex flex-col items-start gap-2">
                <span>{formError.message}</span>
                {formError.conflict && assignment && (
                  <span>Your edits are still here. <a className="underline" href={href(`/app/assignments/${assignment.id}`)} target="_blank" rel="noreferrer">Open the latest version</a> in a new tab to compare, then reload this page to start from it.</span>
                )}
              </AlertDescription>
            </Alert>
          )}
        </fieldset>

        <StepFooter value={((stepIndex + 1) / STEPS.length) * 100} label="Progress through the steps">
        <div className="flex items-center gap-3">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>Cancel</Button>
          {auto && autosave !== "idle" && (
            <span role="status" className="flex items-center gap-1.5 text-sm text-muted-foreground">
              {autosave === "saving" ? <><IconLoader2 className="size-4 animate-spin" />Saving…</> : <><IconCheck className="size-4" />Draft saved</>}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {editingPart !== null ? (
            <>
              <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => go("parts")}>All parts</Button>
              {editingPart < partCount - 1
                ? <Button type="button" disabled={isSubmitting} onClick={() => edit(editingPart + 1)}>Next part</Button>
                : <Button type="button" disabled={isSubmitting} onClick={() => go("parts")}>Done</Button>}
            </>
          ) : (
            <>
              <Button type="button" variant="outline" disabled={stepIndex === 0 || isSubmitting} onClick={() => go(STEPS[stepIndex - 1].value)}>Back</Button>
              {stepIndex < STEPS.length - 1 && (
                <Button type="button" disabled={isSubmitting} onClick={() => go(STEPS[stepIndex + 1].value)}>Next</Button>
              )}
            </>
          )}
          {editingPart === null && (!auto || stepIndex === STEPS.length - 1) && (
            <Button type="submit" form="assignment-form" disabled={isSubmitting || (assignment !== undefined && !auto && !isDirty)}>
              {isSubmitting ? "Saving…" : auto ? "Done" : "Save changes"}
            </Button>
          )}
        </div>
        </StepFooter>
      </form>
      </ImagesProvider>
    </FormProvider>
  );
}
