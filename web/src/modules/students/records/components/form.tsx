"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, RotateCcw } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAcademyScope } from "@/modules/auth";
import type { AcademyEntry } from "@/modules/academies";
import {
  academicYearQueryKey, groupDependencyQueryKey, groupListQueryKey, loadActiveYear, loadGroups, loadStructure,
  structureQueryKey, type Group, type Level, type Track,
} from "@/modules/groups";
import { createStudentRecord, updateStudentRecord } from "../actions";
import { canEditStudentPlacement } from "../permissions";
import { studentsRootKey } from "../queries";
import type { StudentRecord, StudentRecordField, StudentRecordFailure } from "../types";
import { studentFormDefaults, studentFormSchema, type StudentFormValues, type StudentRecordInput } from "../validation";
import { StudentFormFields } from "./fields";

export type FormStatus = { dirty: boolean; saving: boolean };

type Props = {
  /** The academy this draft belongs to. The parent re-mounts the form when the academy changes. */
  academy: AcademyEntry;
  /** The record being edited; omitted when creating. */
  record?: StudentRecord;
  /** "sheet" scrolls the fields above a fixed action footer. */
  variant?: "page" | "sheet";
  /** Shows the record without editing, with `readOnlyActions` in place of the save buttons. */
  readOnly?: boolean;
  readOnlyActions?: ReactNode;
  onSaved: () => void;
  onCancel: () => void;
  /** Reloads the latest saved record after a conflicting edit; the parent re-mounts the form. */
  onReload?: () => void;
  onStatusChange?: (status: FormStatus) => void;
};

/** Create or edit a student record; loads the academic year, levels, tracks, and active groups it needs. */
export function StudentRecordForm(props: Props) {
  const academyId = props.academy.id;
  const yearQuery = useQuery({ queryKey: academicYearQueryKey(academyId), queryFn: () => loadActiveYear(academyId), enabled: !props.record });
  const structureQuery = useQuery({ queryKey: structureQueryKey(academyId), queryFn: () => loadStructure(academyId) });
  const groupsQuery = useQuery({ queryKey: groupListQueryKey(academyId, false), queryFn: () => loadGroups(academyId) });
  const queries = props.record ? [structureQuery, groupsQuery] : [yearQuery, structureQuery, groupsQuery];
  const padded = props.variant === "sheet" ? "px-6 py-5" : "";

  if (queries.some((query) => query.isError)) {
    const retrying = queries.some((query) => query.isFetching);
    return (
      <div className={padded}>
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Couldn’t load the student form</AlertTitle>
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
  if ((!props.record && yearQuery.isPending) || !structureQuery.data || !groupsQuery.data) return <FormSkeleton className={padded} />;

  const academicYearId = props.record?.academicYearId ?? yearQuery.data?.id;
  if (!academicYearId) {
    return (
      <div className={padded}>
        <Alert>
          <AlertCircle />
          <AlertTitle>No active academic year</AlertTitle>
          <AlertDescription>Student records belong to an academic year. Open one for this academy to add students.</AlertDescription>
        </Alert>
      </div>
    );
  }
  return (
    <StudentFields
      {...props}
      academicYearId={academicYearId}
      levels={structureQuery.data.levels}
      tracks={structureQuery.data.tracks}
      levelNames={structureQuery.data.levelNames}
      groups={groupsQuery.data.groups}
    />
  );
}

export function FormSkeleton({ className = "" }: { className?: string }) {
  return (
    <div role="status" aria-label="Loading student form" className={`flex flex-col gap-6 ${className}`}>
      {[10, 10, 10, 16].map((height, index) => (
        <div key={index} aria-hidden="true" className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="w-full" style={{ height: `${height * 0.25}rem` }} />
        </div>
      ))}
    </div>
  );
}

type FieldsProps = Props & { academicYearId: string; levels: Level[]; tracks: Track[]; levelNames: Record<string, string>; groups: Group[] };

function StudentFields({
  academy, record, variant = "page", readOnly = false, readOnlyActions, onSaved, onCancel, onReload, onStatusChange,
  academicYearId, levels, tracks, levelNames, groups,
}: FieldsProps) {
  const queryClient = useQueryClient();
  const isCurrentAcademy = useAcademyScope();
  const sheet = variant === "sheet";
  // Instructors choose placement when creating, but only Owners/Admins change it afterwards.
  const placementLocked = readOnly || (Boolean(record) && !canEditStudentPlacement(academy.role));
  const context = useMemo(() => ({ tracks, groups }), [tracks, groups]);
  const schema = useMemo(() => studentFormSchema({ academyId: academy.id, academicYearId }, context), [academy.id, academicYearId, context]);
  const form = useForm<StudentFormValues, unknown, StudentRecordInput>({
    resolver: zodResolver(schema),
    defaultValues: studentFormDefaults(record),
  });
  const { formState: { isDirty, isSubmitting } } = form;
  const [failure, setFailure] = useState<StudentRecordFailure | null>(null);
  // Which save button was pressed, to label it while saving.
  const [submitMode, setSubmitMode] = useState<"close" | "another">("close");

  useEffect(() => { onStatusChange?.({ dirty: isDirty, saving: isSubmitting }); }, [isDirty, isSubmitting, onStatusChange]);

  // Ask before leaving the page or closing the tab with unsaved changes.
  useEffect(() => {
    if (!isDirty || readOnly) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty, readOnly]);

  async function save(input: StudentRecordInput, mode: "close" | "another") {
    // Capture the academy before awaiting: the user may switch academies while this is pending.
    const targetAcademyId = academy.id;
    setFailure(null);
    try {
      const result = record
        ? await updateStudentRecord(record.id, record.version, input)
        : await createStudentRecord(input);
      if (!result.ok) {
        if (!isCurrentAcademy(targetAcademyId)) return;
        setFailure(result);
        for (const [field, message] of Object.entries(result.fieldErrors ?? {})) {
          form.setError(field as StudentRecordField, { type: "server", message });
        }
        return;
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: studentsRootKey(targetAcademyId) }),
        queryClient.invalidateQueries({ queryKey: groupDependencyQueryKey(targetAcademyId) }),
      ]);
      if (!isCurrentAcademy(targetAcademyId)) return;
      toast.success(record ? "Student saved." : `${input.fullName} was added.`);
      if (!record && mode === "another") {
        form.reset(studentFormDefaults());
        form.setFocus("fullName");
        return;
      }
      onSaved();
    } catch {
      if (isCurrentAcademy(targetAcademyId)) {
        setFailure({ ok: false, code: "unavailable", message: "Could not save the student. Check your connection and try again." });
      }
    }
  }

  return (
    <form
      onSubmit={form.handleSubmit((input) => save(input, "close"))}
      noValidate
      aria-busy={isSubmitting || undefined}
      className={sheet ? "flex min-h-0 flex-1 flex-col" : "flex flex-col gap-5"}
    >
      <fieldset disabled={isSubmitting || readOnly} className={sheet ? "min-h-0 flex-1 overflow-y-auto px-6 py-5" : "min-w-0"}>
        <div className="flex flex-col gap-6">
          <StudentFormFields
            form={form}
            levels={levels}
            tracks={tracks}
            levelNames={levelNames}
            groups={groups}
            placementLocked={placementLocked}
            placementNote={placementLocked && !readOnly ? "Only owners and admins can change a student’s level, track, group, or type." : undefined}
          />

          {failure && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>Couldn’t save the student</AlertTitle>
              <AlertDescription className="flex flex-col items-start gap-3">
                <span>{failure.message}</span>
                {failure.code === "stale_record" && onReload && (
                  <>
                    <span>Your changes are still here. Reload to see the latest version; your unsaved edits will be replaced.</span>
                    <Button type="button" variant="outline" size="sm" onClick={onReload}><RotateCcw />Reload latest</Button>
                  </>
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>
      </fieldset>

      {readOnly ? (
        <div className={sheet ? "flex shrink-0 justify-end gap-3 border-t bg-popover px-6 py-4" : "flex justify-end gap-2"}>{readOnlyActions}</div>
      ) : (
        <div className={sheet ? "grid shrink-0 grid-cols-2 gap-3 border-t bg-popover px-6 py-4" : "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"}>
          <Button type="button" variant="outline" className={sheet ? "w-full" : undefined} onClick={onCancel} disabled={isSubmitting}>Cancel</Button>
          {!record && (
            <Button type="button" variant="secondary" disabled={isSubmitting}
              onClick={() => { setSubmitMode("another"); void form.handleSubmit((input) => save(input, "another"))(); }}>
              {isSubmitting && submitMode === "another" ? "Saving…" : "Save and add another"}
            </Button>
          )}
          <Button type="submit" className={sheet ? "w-full" : undefined} disabled={isSubmitting} onClick={() => setSubmitMode("close")}>
            {isSubmitting && submitMode === "close" ? "Saving…" : record ? "Save changes" : "Save student"}
          </Button>
        </div>
      )}
    </form>
  );
}
