"use client";

import { useEffect, useState, type MouseEvent } from "react";
import Link from "next/link";
import { Controller, FormProvider, useForm, type Path } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { LinkSquare02Icon, Loading03Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import { DiscardDialog } from "@/components/shared/assessment/discard";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import type { AcademyEntry } from "@/modules/academies";
import { assignmentsRootKey } from "@/modules/assignments";
import { useAcademyScope } from "@/modules/auth";
import { examsRootKey } from "@/modules/exams";
import { quizzesRootKey } from "@/modules/quizzes";
import { detailsPermissions, loadDetails, localDate, quickErrors, quickValues, savedInstant, saveDetails, type AssessmentDetails, type DetailsResult, type QuickValues } from "../details";
import { assessmentsRootKey } from "../queries";
import { QuickAudience } from "./quick-audience";
import { AssessmentDateTime } from "./date-time";
import { partKindLabel } from "./facts";
import { AssessmentTimer } from "./timer";

export type EditStatus = { dirty: boolean; busy: boolean; uncertain: boolean };
type Props = {
  academy: AcademyEntry; initial: AssessmentDetails; onStatus: (status: EditStatus) => void;
  onCancel: () => void; onSaved: () => void; fullEditor: string; onOpenEditor: (event: MouseEvent<HTMLAnchorElement>) => void;
};
const windowValues = (record: AssessmentDetails) => record.type === "assignment" ? { opensAt: "", closesAt: "" }
  : { opensAt: localDate(record.value.opensAt), closesAt: localDate(record.value.closesAt) };

export function QuickEditForm({ academy, initial, onStatus, onCancel, onSaved, fullEditor, onOpenEditor }: Props) {
  // Adopt newer versions only after our own save or an explicit reload, preserving the user's draft.
  const [record, setRecord] = useState(initial);
  const form = useForm<QuickValues>({ defaultValues: quickValues(initial) });
  const [window, setWindow] = useState(() => windowValues(initial));
  const [busy, setBusy] = useState<"save" | "reload" | null>(null);
  const [problem, setProblem] = useState<{ message: string; reload: boolean; uncertain: boolean } | null>(null);
  const [reloading, setReloading] = useState(false);
  const queryClient = useQueryClient();
  const isCurrent = useAcademyScope();
  const permissions = detailsPermissions(academy.role, record);
  const originalWindow = windowValues(record);
  const windowDirty = window.opensAt !== originalWindow.opensAt || window.closesAt !== originalWindow.closesAt;
  const dirty = form.formState.isDirty || windowDirty;
  const disabled = busy !== null || !permissions.edit || Boolean(problem?.reload);
  const errors = form.formState.errors;

  useEffect(() => { onStatus({ dirty, busy: busy !== null, uncertain: problem?.uncertain ?? false }); }, [dirty, busy, problem, onStatus]);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: assessmentsRootKey(academy.id) });
    const key = record.type === "assignment" ? assignmentsRootKey(academy.id) : record.type === "quiz" ? quizzesRootKey(academy.id) : examsRootKey(academy.id);
    void queryClient.invalidateQueries({ queryKey: key });
  }

  async function commit(run: () => Promise<DetailsResult>) {
    if (busy) return;
    setBusy("save");
    setProblem(null);
    try {
      const result = await run();
      if (result.ok) invalidate();
      if (!isCurrent(academy.id)) return;
      if (!result.ok) {
        const uncertain = result.code === "unavailable";
        setProblem({ message: uncertain ? "The save could not be confirmed. Reload the latest details before editing again." : result.message,
          reload: uncertain || result.code.endsWith("_conflict") || ["target_locked", "structure_locked", "forbidden", "year_unavailable", "invalid_state", "already_open", "window_locked"].includes(result.code), uncertain });
        return;
      }
      setRecord(result.record);
      form.reset(quickValues(result.record));
      setWindow(windowValues(result.record));
      toast.success("Assessment saved.");
      onSaved();
    } catch {
      if (isCurrent(academy.id)) setProblem({ message: "The save could not be confirmed. Reload the latest details before editing again.", reload: true, uncertain: true });
    } finally {
      if (isCurrent(academy.id)) setBusy(null);
    }
  }

  const submit = form.handleSubmit((values) => {
    if (disabled || !dirty) return;
    form.clearErrors();
    const issues = quickErrors(record, values);
    for (const [path, message] of Object.entries(issues)) form.setError(path as Path<QuickValues>, { message });
    if (Object.keys(issues).length) return;
    let availability: { opensAt: string | null; closesAt: string | null } | undefined;
    if (windowDirty && record.type !== "assignment") {
      const opensAt = savedInstant(window.opensAt, record.value.opensAt);
      const closesAt = savedInstant(window.closesAt, record.value.closesAt);
      if ((window.opensAt && !opensAt) || (window.closesAt && !closesAt) || (opensAt === null) !== (closesAt === null) || (opensAt && closesAt && Date.parse(opensAt) >= Date.parse(closesAt))) {
        setProblem({ message: "Enter an opening and closing time, with closing after opening, or clear both dates.", reload: false, uncertain: false });
        return;
      }
      availability = { opensAt, closesAt };
    }
    return commit(() => saveDetails(record, values, availability));
  });

  async function reload() {
    setReloading(false);
    setBusy("reload");
    try {
      const latest = await loadDetails(academy.id, record.type, record.value.id);
      if (!isCurrent(academy.id)) return;
      setRecord(latest);
      form.reset(quickValues(latest));
      setWindow(windowValues(latest));
      setProblem(null);
      invalidate();
    } catch {
      if (isCurrent(academy.id)) setProblem({ message: "Couldn’t reload the latest details. Try again.", reload: true, uncertain: problem?.uncertain ?? false });
    } finally { if (isCurrent(academy.id)) setBusy(null); }
  }

  const opened = record.type !== "assignment" && record.value.opensAt !== null
    && Date.parse(record.value.serverNow) >= Date.parse(record.value.opensAt);

  return (
    <FormProvider {...form}>
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
          {!permissions.edit && <p role="status" className="text-muted-foreground">This assessment is read-only.</p>}
          {problem && <div role="alert" className="space-y-2 rounded-lg border border-destructive/40 p-3 text-destructive">
            <p>{problem.message}</p>
            {problem.reload && <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => setReloading(true)}>Reload latest</Button>}
          </div>}
          <Field data-invalid={Boolean(errors.title) || undefined}>
            <FieldLabel htmlFor="quick-title">Name</FieldLabel>
            <Input id="quick-title" dir="auto" maxLength={200} disabled={disabled} aria-invalid={Boolean(errors.title)} {...form.register("title")} />
            <FieldError>{errors.title?.message}</FieldError>
          </Field>
          <Separator className="bg-border/70" />
          <QuickAudience academyId={academy.id} yearId={record.value.academicYearId} disabled={disabled || !permissions.audience} optional={record.type !== "assignment"} />
          <Separator className="bg-border/70" />
          <section className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground">Timing</h3>
            <FieldGroup className="gap-4">
              {record.type === "assignment" ? (
                <Field orientation="horizontal" className="items-center!" data-invalid={Boolean(errors.dueAt) || undefined}>
                  <FieldLabel htmlFor="quick-due" className="min-w-24 flex-none!">Due date</FieldLabel>
                  <FieldContent className="min-w-0 max-w-sm">
                    <Controller control={form.control} name="dueAt" render={({ field }) => (
                      <AssessmentDateTime id="quick-due" label="Due date" value={field.value} onChange={field.onChange}
                        defaultTime="23:59" disabled={disabled} invalid={Boolean(errors.dueAt)} />
                    )} />
                    <FieldError>{errors.dueAt?.message}</FieldError>
                  </FieldContent>
                </Field>
              ) : <>
                <Field orientation="horizontal" className="items-center!" data-invalid={Boolean(errors.timeLimit) || undefined}>
                  <FieldLabel htmlFor="quick-timer" className="min-w-24 flex-none!">Timer</FieldLabel>
                  <FieldContent className="min-w-0 max-w-sm">
                    <Controller control={form.control} name="timeLimit" render={({ field }) => (
                      <AssessmentTimer id="quick-timer" value={field.value} onChange={field.onChange} onBlur={field.onBlur}
                        disabled={disabled || !permissions.timer} invalid={Boolean(errors.timeLimit)} />
                    )} />
                    <FieldError>{errors.timeLimit?.message}</FieldError>
                  </FieldContent>
                </Field>
                <Field orientation="horizontal"><FieldLabel htmlFor="quick-opens" className="min-w-24 flex-none!">Opens</FieldLabel>
                  <div className="min-w-0 max-w-sm flex-1">
                    <AssessmentDateTime id="quick-opens" label="Opens" disabled={disabled || !permissions.availability || opened}
                      value={window.opensAt} onChange={(opensAt) => setWindow({ ...window, opensAt })} />
                  </div>
                </Field>
                <Field orientation="horizontal"><FieldLabel htmlFor="quick-closes" className="min-w-24 flex-none!">Closes</FieldLabel>
                  <div className="min-w-0 max-w-sm flex-1">
                    <AssessmentDateTime id="quick-closes" label="Closes" disabled={disabled || !permissions.availability}
                      value={window.closesAt} onChange={(closesAt) => setWindow({ ...window, closesAt })} />
                  </div>
                </Field>
              </>}
            </FieldGroup>
          </section>
          <Separator className="bg-border/70" />
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-medium text-muted-foreground">Part Names</h3>
              <Button type="button" variant="ghost" size="sm" asChild disabled={busy !== null}>
                <Link href={fullEditor} onClick={onOpenEditor} aria-disabled={busy !== null}>Edit questions<HugeiconsIcon icon={LinkSquare02Icon} strokeWidth={1.5} aria-hidden="true" /></Link>
              </Button>
            </div>
            {record.value.parts.length === 0 && <p className="text-muted-foreground">No parts yet</p>}
            {record.value.parts.map((part, index) => (
              <Field key={part.id} orientation="horizontal" data-invalid={Boolean(errors.parts?.[index]?.title) || undefined}>
                <div className="min-w-24 shrink-0 space-y-1 pt-1">
                  <FieldLabel htmlFor={`quick-part-${part.id}`}>Part {index + 1}</FieldLabel>
                  <p className="text-xs text-muted-foreground">{partKindLabel(record.type, part.kind)}</p>
                </div>
                <FieldContent className="min-w-0 max-w-sm">
                  <Input id={`quick-part-${part.id}`} dir="auto" maxLength={200} disabled={disabled || !permissions.parts} aria-invalid={Boolean(errors.parts?.[index]?.title)} {...form.register(`parts.${index}.title`)} />
                  <FieldError>{errors.parts?.[index]?.title?.message}</FieldError>
                </FieldContent>
              </Field>
            ))}
          </section>
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t px-6 py-4">
          <Button type="button" variant="outline" className="flex-1" disabled={busy !== null} onClick={onCancel}>Cancel</Button>
          {permissions.edit && <Button type="submit" className="flex-1" disabled={disabled || !dirty}>
            {busy === "save" && <HugeiconsIcon icon={Loading03Icon} strokeWidth={1.5} className="animate-spin" aria-hidden="true" />}Save
          </Button>}
        </div>
      </form>
      <DiscardDialog noun={record.type} open={reloading} onOpenChange={setReloading} onDiscard={reload} />
    </FormProvider>
  );
}
