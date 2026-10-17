"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FormProvider, useForm, useWatch, type FieldErrors, type FieldValues, type Resolver } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { IconAlertCircle, IconCheck, IconLoader2 } from "@tabler/icons-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { newUuid } from "@/lib/uuid";
import type { AcademyEntry } from "@/modules/academies";
import { useAcademyScope } from "@/modules/auth";
import { useCanonicalHref } from "@/modules/navigation";
import { StepFooter } from "./footer";
import type { FormStatus } from "./page";
import { StepPanel, StepTabs } from "./steps";

const STEPS = ["basics", "parts", "review"] as const;
type Step = (typeof STEPS)[number];
const LABELS: Record<Step, string> = { basics: "Basics", parts: "Parts", review: "Review" };

/** The outcome of one save, as the shell needs it. Each module maps its own result type onto this. */
export type SaveResult<E> = { ok: true; entity: E } | { ok: false; message: string; conflict?: boolean };

type Props<V extends FieldValues & { parts: unknown[] }, D, E extends { id: string }> = {
  /** The parent re-mounts the form when the academy changes. */
  academy: AcademyEntry;
  /** "assignment", "quiz" or "exam". */
  noun: string;
  /** Route segment of the module, such as "assignments". */
  route: string;
  entity?: E;
  toValues: (entity?: E) => V;
  resolver: Resolver<V, unknown, D>;
  /** The draft of a form that is complete enough to save, otherwise null. Used by automatic saving, which stays silent. */
  parse: (values: V) => D | null;
  commit: (base: E | undefined, draft: D, createId: string) => Promise<SaveResult<E>>;
  /** Every query key of the module starts with this, so one invalidation refreshes lists and details. */
  rootKey: readonly unknown[];
  savedMessage: (entity: E, created: boolean) => string;
  /** The fields each step shows, so an invalid save can open the step that holds the first error. */
  basicsFields: readonly string[];
  /** Setup saves itself unless this is true (work has started); afterwards the form is saved explicitly. */
  locked: boolean;
  notice?: ReactNode;
  basics: ReactNode;
  parts: (api: { edit: (index: number) => void }) => ReactNode;
  review: (api: { editDetails: () => void; editPart: (index: number) => void }) => ReactNode;
  partEditor: (api: { index: number; select: (index: number) => void; close: () => void }) => ReactNode;
  /** Wraps the whole form, for providers the editors share. */
  wrap?: (children: ReactNode) => ReactNode;
  onSaved: (entity: E) => void;
  onCancel: () => void;
  onStatusChange?: (status: FormStatus) => void;
};

type FormError = { title: string; message: string; conflict?: boolean };

/** Writes every stored `id` in `next` that differs from the form's value at the same path. */
function adoptIds(next: unknown, path: string, set: (path: string, id: unknown) => void, get: (path: string) => unknown) {
  if (Array.isArray(next)) {
    next.forEach((item, index) => adoptIds(item, `${path}.${index}`, set, get));
  } else if (next && typeof next === "object") {
    for (const [key, value] of Object.entries(next)) {
      const child = path ? `${path}.${key}` : key;
      if (key === "id") { if (get(child) !== value) set(child, value); } else adoptIds(value, child, set, get);
    }
  }
}

/**
 * The create/edit form every assessment shares: Basics, Parts and Review steps, one part edited on its
 * own page, automatic saving until work starts, and the pinned step footer. Modules supply the fields,
 * validation and persistence; this owns the flow.
 */
export function AssessmentFormShell<V extends FieldValues & { parts: unknown[] }, D, E extends { id: string }>(props: Props<V, D, E>) {
  const { academy, noun, route, entity, toValues, resolver, parse, commit, rootKey, savedMessage, basicsFields, locked, onSaved, onCancel, onStatusChange } = props;
  const queryClient = useQueryClient();
  const isCurrentAcademy = useAcademyScope();
  const href = useCanonicalHref();
  // One id per create action: a retried submit returns the same entity instead of a second one.
  const [createId] = useState(newUuid);
  const form = useForm<V, unknown, D>({ resolver, defaultValues: useMemo(() => toValues(entity) as never, [toValues, entity]) });
  const { formState: { isDirty, isSubmitting } } = form;
  const [step, setStep] = useState<Step>("basics");
  // The part open in the editor, which replaces the steps until it is closed.
  const [editing, setEditing] = useState<number | null>(null);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [formError, setFormError] = useState<FormError | null>(null);
  const [autosave, setAutosave] = useState<"idle" | "saving" | "saved">("idle");
  const auto = !locked;
  // The latest saved entity, and a queue so an automatic and an explicit save never overlap.
  const current = useRef<E | undefined>(entity);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  // What automatic saving last stored: the form is not dirty while it still matches.
  const [saved, setSaved] = useState<string | null>(null);
  const values = useWatch({ control: form.control });
  const dirty = isDirty && (saved === null || JSON.stringify(values) !== saved);
  useEffect(() => { onStatusChange?.({ dirty, saving: isSubmitting }); }, [dirty, isSubmitting, onStatusChange]);

  function run(draft: D): Promise<SaveResult<E>> {
    const next = queue.current.then(async () => {
      const result = await commit(current.current, draft, createId);
      if (result.ok) current.current = result.entity;
      return result;
    });
    queue.current = next.catch(() => undefined);
    return next;
  }

  function failed(result: Extract<SaveResult<E>, { ok: false }>) {
    setFormError({ title: `Couldn’t ${current.current ? "save" : "create"} the ${noun}`, message: result.message, conflict: result.conflict });
  }

  // Automatic saving: after a pause in editing, a valid form is saved quietly. Invalid or unfinished
  // input is skipped without errors; it is checked only when the form is submitted.
  useEffect(() => {
    if (!auto) return;
    const targetAcademyId = academy.id;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let lastSaved = JSON.stringify(form.getValues());
    async function saveQuietly() {
      const values = form.getValues();
      const snapshot = JSON.stringify(values);
      if (stopped || snapshot === lastSaved) return;
      const draft = parse(values);
      if (draft === null) return;
      setAutosave("saving");
      try {
        const result = await run(draft);
        if (!isCurrentAcademy(targetAcademyId)) return;
        if (!result.ok) {
          stopped = Boolean(result.conflict);
          failed(result);
          setAutosave("idle");
          return;
        }
        setFormError(null);
        void queryClient.invalidateQueries({ queryKey: rootKey });
        lastSaved = snapshot;
        // Adopt the stored ids when nothing changed meanwhile; otherwise the next pause saves the newer edits.
        // Only the ids are written, in place: replacing the values would re-create every list item, which
        // remounts the editors (losing focus) and replays their animations.
        if (JSON.stringify(form.getValues()) === snapshot) {
          adoptIds(toValues(result.entity), "", (path, id) => form.setValue(path as never, id as never, { shouldDirty: false }), (path) => form.getValues(path as never));
          lastSaved = JSON.stringify(form.getValues());
          setSaved(lastSaved);
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
        timer = setTimeout(() => void saveQuietly(), 1200);
      },
    });
    return () => { clearTimeout(timer); unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, academy.id]);

  async function save(draft: D) {
    // Capture the academy before awaiting: the user may switch academies while this is pending.
    const targetAcademyId = academy.id;
    setFormError(null);
    try {
      const result = await run(draft);
      if (!isCurrentAcademy(targetAcademyId)) return;
      if (!result.ok) { failed(result); return; }
      await queryClient.invalidateQueries({ queryKey: rootKey });
      if (!isCurrentAcademy(targetAcademyId)) return;
      toast.success(savedMessage(result.entity, !entity));
      onSaved(result.entity);
    } catch {
      if (isCurrentAcademy(targetAcademyId)) setFormError({ title: `Couldn’t save the ${noun}`, message: "Check your connection and try again." });
    }
  }

  const partCount = (useWatch({ control: form.control, name: "parts" as never }) as unknown[] | undefined)?.length ?? 0;
  const stepIndex = STEPS.indexOf(step);

  /** Moving between steps never validates or discards edits; errors appear only on submit. */
  function go(next: Step) {
    setDirection(editing !== null || STEPS.indexOf(next) < stepIndex ? -1 : 1);
    setEditing(null);
    setStep(next);
  }

  /** Opens a part's editor, sliding forward from the list or between parts. */
  function edit(index: number) {
    setDirection(editing !== null && index < editing ? -1 : 1);
    setStep("parts");
    setEditing(index);
  }

  /** An invalid save opens the basics step or the first part with an error. */
  function showInvalid(invalid: FieldErrors<V>) {
    const partErrors = (invalid as FieldErrors<{ parts: unknown[] }>).parts;
    const part = Array.isArray(partErrors) ? partErrors.findIndex(Boolean) : -1;
    if (basicsFields.some((field) => field in invalid)) go("basics");
    else if (part >= 0) edit(part);
    else if ("parts" in invalid) go("parts");
  }

  const panel = {
    basics: props.basics,
    parts: props.parts({ edit }),
    review: props.review({ editDetails: () => go("basics"), editPart: edit }),
  }[step];
  const editingPart = editing !== null && editing < partCount ? editing : null;
  const formId = `${noun}-form`;

  const body = (
    <form id={formId} onSubmit={(event) => void form.handleSubmit(save, showInvalid)(event)} noValidate className="flex flex-col gap-6">
      <fieldset disabled={isSubmitting} className="flex min-w-0 flex-col gap-6">
        {props.notice}
        {/* The tabs stay put; only the content below them animates between steps. */}
        {editingPart === null && <StepTabs steps={STEPS.map((value) => ({ value, label: LABELS[value] }))} value={step} onChange={(value) => go(value as Step)} />}
        <StepPanel stepKey={editingPart === null ? step : `part-${editingPart}`} direction={direction}>
          {editingPart === null ? panel : props.partEditor({ index: editingPart, select: edit, close: () => go("parts") })}
        </StepPanel>
        {formError && (
          <Alert variant="destructive">
            <IconAlertCircle />
            <AlertTitle>{formError.title}</AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-2">
              <span>{formError.message}</span>
              {formError.conflict && entity && (
                <span>Your edits are still here. <a className="underline" href={href(`/app/${route}/${entity.id}`)} target="_blank" rel="noreferrer">Open the latest version</a> in a new tab to compare, then reload this page to start from it.</span>
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
              {autosave === "saving" ? <><IconLoader2 className="size-4 animate-spin" />Saving…</> : <><IconCheck className="size-4" />Saved</>}
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
              <Button type="button" variant="outline" disabled={stepIndex === 0 || isSubmitting} onClick={() => go(STEPS[stepIndex - 1])}>Back</Button>
              {stepIndex < STEPS.length - 1 && (
                <Button type="button" disabled={isSubmitting} onClick={() => go(STEPS[stepIndex + 1])}>Next</Button>
              )}
            </>
          )}
          {editingPart === null && (!auto || stepIndex === STEPS.length - 1) && (
            <Button type="submit" form={formId} disabled={isSubmitting || (entity !== undefined && !auto && !isDirty)}>
              {isSubmitting ? "Saving…" : auto ? "Done" : "Save changes"}
            </Button>
          )}
        </div>
      </StepFooter>
    </form>
  );
  return <FormProvider {...form}>{props.wrap ? props.wrap(body) : body}</FormProvider>;
}
