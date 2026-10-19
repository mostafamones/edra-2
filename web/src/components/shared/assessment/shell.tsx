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
import { adoptStoredIds, identifyDraft } from "./authoring";
import { StepFooter } from "./footer";
import type { FormStatus } from "./page";
import { StepPanel, StepTabs } from "./steps";

const STEPS = ["basics", "parts", "review"] as const;
type Step = (typeof STEPS)[number];
const LABELS: Record<Step, string> = { basics: "Basics", parts: "Parts", review: "Review" };

/** The outcome of one save, as the shell needs it. Each module maps its own result type onto this. */
export type SaveResult<E> = { ok: true; entity: E } | { ok: false; message: string; conflict?: boolean; uncertain?: boolean };

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
  const form = useForm<V, unknown, D>({ resolver, defaultValues: useMemo(() => identifyDraft(toValues(entity)) as never, [toValues, entity]) });
  const { formState: { isDirty, isSubmitting } } = form;
  const [step, setStep] = useState<Step>("basics");
  // The part open in the editor, which replaces the steps until it is closed.
  const [editing, setEditing] = useState<number | null>(null);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [formError, setFormError] = useState<FormError | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [uncertain, setUncertain] = useState(false);
  const auto = !locked;
  const current = useRef<E | undefined>(entity);
  const mounted = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const active = useRef<Promise<boolean> | null>(null);
  const queued = useRef(false);
  const paused = useRef(false);
  const unresolved = useRef<{ base: E | undefined; draft: D; values: V } | null>(null);
  const [hasSaved, setHasSaved] = useState(Boolean(entity));
  const [saved, setSaved] = useState(() => JSON.stringify(form.getValues()));
  const acknowledged = useRef(saved);
  const values = useWatch({ control: form.control });
  const dirty = JSON.stringify(values) !== saved;
  const saving = pendingCount > 0 || isSubmitting;

  function failed(result: Extract<SaveResult<E>, { ok: false }>) {
    setFormError({ title: `Couldn’t ${current.current ? "save" : "create"} the ${noun}`, message: result.message, conflict: result.conflict });
  }

  function writeIds(next: V) {
    const write = (value: unknown, path: string) => {
      if (Array.isArray(value)) value.forEach((item, index) => write(item, `${path}.${index}`));
      else if (value && typeof value === "object") for (const [key, child] of Object.entries(value)) {
        const childPath = path ? `${path}.${key}` : key;
        if (key === "id" || key === "_draftId") {
          if (form.getValues(childPath as never) !== child) form.setValue(childPath as never, child as never, { shouldDirty: false });
        } else write(child, childPath);
      }
    };
    write(next, "");
  }

  async function persist(): Promise<boolean> {
    if (active.current) { queued.current = true; await active.current; }
    if (!mounted.current || paused.current) return false;
    const targetAcademyId = academy.id;
    const captured = identifyDraft(form.getValues());
    writeIds(captured);
    const draft = parse(captured);
    if (!unresolved.current && draft === null) return false;
    if (!unresolved.current && JSON.stringify(captured) === acknowledged.current && current.current) return true;
    const request = unresolved.current ?? { base: current.current, draft: draft as D, values: captured };
    unresolved.current = request;
    setPendingCount(1);
    const work = (async () => {
      try {
        const result = await commit(request.base, request.draft, createId);
        if (!mounted.current || !isCurrentAcademy(targetAcademyId)) return false;
        if (!result.ok) {
          failed(result);
          if (!result.uncertain) unresolved.current = null;
          paused.current = Boolean(result.conflict);
          setUncertain(Boolean(result.uncertain));
          return false;
        }
        if (!request.base && "version" in result.entity && Number(result.entity.version) > 1) {
          unresolved.current = null; paused.current = true; setUncertain(false);
          failed({ ok: false, conflict: true, message: "This assessment changed after it was created. Your entries are kept; compare the latest version before continuing." });
          return false;
        }
        current.current = result.entity;
        setHasSaved(true);
        unresolved.current = null;
        setUncertain(false);
        setFormError(null);
        const stored = toValues(result.entity);
        const acceptedValues = adoptStoredIds(request.values, stored, request.values);
        // Only IDs are adopted into live fields. No reset/remount and no lost input focus.
        writeIds(adoptStoredIds(request.values, stored, form.getValues()));
        acknowledged.current = JSON.stringify(acceptedValues);
        setSaved(acknowledged.current);
        void queryClient.invalidateQueries({ queryKey: rootKey });
        return JSON.stringify(form.getValues()) === JSON.stringify(acceptedValues);
      } catch {
        if (mounted.current && isCurrentAcademy(targetAcademyId)) {
          setUncertain(true);
          setFormError({ title: "Save outcome unknown", message: "Retry the original save to check its outcome. Your newer entries are kept." });
        }
        return false;
      } finally {
        active.current = null;
        if (mounted.current) setPendingCount(0);
      }
    })();
    active.current = work;
    return work;
  }

  useEffect(() => {
    mounted.current = true;
    const unsubscribe = form.subscribe({ formState: { values: true }, callback: () => {
      clearTimeout(timer.current);
      if (!auto || paused.current || unresolved.current) { queued.current = Boolean(active.current); return; }
      queued.current = true;
      setPendingCount(1);
      timer.current = setTimeout(async () => {
        // Coalesce each later edit into a fresh snapshot after the previous acknowledgement.
        do {
          queued.current = false;
          await persist();
        } while (queued.current && !unresolved.current && !paused.current && mounted.current);
        if (!active.current && mounted.current) setPendingCount(0);
      }, 1200);
    } });
    return () => { mounted.current = false; clearTimeout(timer.current); queued.current = false; unsubscribe(); };
    // The subscription reads current form values; an entity refresh never replaces this draft owner.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, academy.id]);

  async function discard(): Promise<boolean> {
    paused.current = true;
    clearTimeout(timer.current);
    queued.current = false;
    if (active.current) await active.current;
    clearTimeout(timer.current);
    queued.current = false;
    setPendingCount(0);
    // An unknown result cannot be described as discarded; the original request remains retryable.
    if (unresolved.current) { paused.current = false; return false; }
    return true;
  }

  useEffect(() => { onStatusChange?.({ dirty, saving, uncertain, discard }); });
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty || saving || uncertain) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, saving, uncertain]);

  async function save() {
    clearTimeout(timer.current);
    queued.current = false;
    const clean = await persist();
    if (clean && current.current && isCurrentAcademy(academy.id)) {
      toast.success(savedMessage(current.current, !entity));
      onSaved(current.current);
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
              {uncertain && <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => void persist()}>Retry original save</Button>}
              {formError.conflict && entity && (
                <span>Your edits are still here. <a className="underline" href={href(`/app/${route}/${entity.id}`)} target="_blank" rel="noreferrer">Open the latest version</a> in a new tab to compare, then reload this page to start from it.</span>
              )}
            </AlertDescription>
          </Alert>
        )}
      </fieldset>

      <StepFooter value={((stepIndex + 1) / STEPS.length) * 100} label="Progress through the steps">
        <div className="flex items-center gap-3">
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
          {auto && (saving || (hasSaved && !dirty && !uncertain)) && (
            <span role="status" className="flex items-center gap-1.5 text-sm text-muted-foreground">
              {saving ? <><IconLoader2 className="size-4 animate-spin" />Saving…</> : <><IconCheck className="size-4" />Saved</>}
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
