"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useFormContext, useWatch } from "react-hook-form";
import { IconArrowLeft, IconChevronDown, IconChevronLeft, IconChevronRight, IconX } from "@tabler/icons-react";

import { NumberInput } from "@/components/shared/app-input";
import { Segmented } from "@/components/shared/segmented";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatScore } from "../../../score";
import { PART_KINDS, type PartKind } from "../../../types";
import { formPartMax, MAX_QUESTIONS, type AssignmentFormValues, type FormPart } from "../../../validation";
import { countLabel, PART_KIND_HINTS, PART_KIND_LABELS } from "../../shared/labels";
import { JsonImport } from "./import";
import { blankChoices, QuestionsEditor } from "./questions";

type Question = FormPart["questions"][number];

/**
 * What the editor set aside while the form is open, per part: the choices a file upload dropped, and the
 * questions removed from the end. Both come back when the type or the count is changed back.
 */
export type PartStash = { choices: Map<string, Question["choices"][]>; removed: Map<string, Question[]> };

type Props = { locked: boolean; index: number; stash: PartStash; onSelect: (index: number) => void; onClose: () => void };

/** A question without stored ids: an autosave may already have deleted the original. */
const withoutIds = (question: Question): Question => ({
  prompt: question.prompt, maxScore: question.maxScore,
  choices: question.choices.map((choice) => ({ label: choice.label, isCorrect: choice.isCorrect })),
});

/** One part, edited on its own page: title, type and advanced settings, then its questions or entries. */
export function PartEditor({ locked, index, stash, onSelect, onClose }: Props) {
  const { control, register, setValue, getValues, formState: { errors } } = useFormContext<AssignmentFormValues>();
  const parts = useWatch({ control, name: "parts" }) ?? [];
  const part = parts[index];
  const [advanced, setAdvanced] = useState(false);
  const [history] = useState<{ stack: Question[][] }>(() => ({ stack: [] }));
  const [countText, setCountText] = useState<string | null>(null);
  const key = part?.id ?? String(index);

  /** Remembers the questions before a removal, so Cmd/Ctrl+Z can bring them back. */
  function snapshot() {
    history.stack.push(getValues(`parts.${index}.questions`).map(withoutIds));
    if (history.stack.length > 20) history.stack.shift();
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.key.toLowerCase() !== "z") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=true]")) return;
      const previous = history.stack.pop();
      if (!previous) return;
      event.preventDefault();
      stash.removed.delete(key);
      setValue(`parts.${index}.questions`, previous, { shouldDirty: true });
      toast("Removal undone");
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  if (!part) return null;
  const error = errors.parts?.[index];
  const kind = part.kind;
  const max = formPartMax(part);
  const count = part.questions.length;

  /**
   * Changing the type keeps the entered marks; choices follow the new type's shape. A file upload has no
   * choices, so the previous ones are kept aside and come back when the type is switched back.
   */
  function changeKind(next: PartKind) {
    const questions = getValues(`parts.${index}.questions`);
    if (next === "file_upload" && questions.some((question) => question.choices.length > 0)) stash.choices.set(key, questions.map((question) => question.choices));
    const kept = stash.choices.get(key);
    setValue(`parts.${index}.kind`, next, { shouldDirty: true });
    setValue(`parts.${index}.questions`, questions.map((question, position) => ({
      ...question,
      choices: next === "file_upload" ? [] : question.choices.length > 0 ? question.choices : kept?.[position]?.length ? kept[position] : blankChoices(next),
    })), { shouldDirty: true });
  }

  /**
   * Sets the number of questions. Removing always takes them from the end and keeps them aside; adding
   * brings those back first, with their content, then adds blank ones carrying the last mark.
   */
  function resize(target: number) {
    if (kind === "legacy") return;
    const next = Math.max(0, Math.min(MAX_QUESTIONS, Math.floor(target)));
    const questions = getValues(`parts.${index}.questions`);
    if (next === questions.length) return;
    const removed = stash.removed.get(key) ?? [];
    if (next < questions.length) {
      snapshot();
      stash.removed.set(key, [...questions.slice(next).map(withoutIds), ...removed]);
      setValue(`parts.${index}.questions`, questions.slice(0, next), { shouldDirty: true });
      return;
    }
    const needed = next - questions.length;
    const restored = removed.slice(0, needed).map((question) => ({
      ...question, choices: kind === "file_upload" ? [] : question.choices.length > 0 ? question.choices : blankChoices(kind),
    }));
    stash.removed.set(key, removed.slice(needed));
    const marks = (restored.at(-1) ?? questions.at(-1))?.maxScore || "1";
    const blanks = Array.from({ length: needed - restored.length }, () => ({ prompt: "", maxScore: marks, choices: blankChoices(kind) }));
    setValue(`parts.${index}.questions`, [...questions, ...restored, ...blanks], { shouldDirty: true });
  }

  const total = (
    <p className="text-right text-sm">
      Part total <span className="font-semibold tabular-nums">{max === null ? "—" : formatScore(max)}</span> marks
    </p>
  );

  return (
    <Collapsible open={advanced} onOpenChange={setAdvanced} className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" size="sm" className="-ml-2.5" onClick={onClose}><IconArrowLeft />All parts</Button>
        <div className="flex items-center gap-1">
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="mr-2 text-muted-foreground">
              Advanced
              <IconChevronDown aria-hidden="true" data-icon="inline-end" className={advanced ? "rotate-180 transition-transform" : "transition-transform"} />
            </Button>
          </CollapsibleTrigger>
          <span className="mr-1 text-sm text-muted-foreground tabular-nums">Part {index + 1} of {parts.length}</span>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Previous part" disabled={index === 0} onClick={() => onSelect(index - 1)}><IconChevronLeft /></Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Next part" disabled={index === parts.length - 1} onClick={() => onSelect(index + 1)}><IconChevronRight /></Button>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start gap-4">
          <Field data-invalid={Boolean(error?.title) || undefined} className="min-w-48 flex-1">
            <FieldLabel htmlFor="part-title">Part title</FieldLabel>
            <Input id="part-title" maxLength={200} placeholder={`Part ${index + 1}`}
              {...register(`parts.${index}.title`)} aria-invalid={Boolean(error?.title) || undefined} />
            <FieldError>{error?.title?.message}</FieldError>
          </Field>
          <Field className="w-auto">
            <FieldLabel>Type</FieldLabel>
            {kind === "legacy" ? (
              <Badge variant="outline" className="h-9">{PART_KIND_LABELS.legacy}</Badge>
            ) : (
              <Segmented label="Part type" value={kind} disabled={locked} onChange={changeKind} bordered className="h-9"
                options={PART_KINDS.map((value) => ({ value, label: PART_KIND_LABELS[value], hint: PART_KIND_HINTS[value] }))} />
            )}
          </Field>
        </div>
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
          <div className="relative flex flex-col gap-4 rounded-lg border bg-muted/20 p-4">
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Close advanced options" className="absolute top-2 right-2 text-muted-foreground! bg-transparent! hover:text-foreground! hover:bg-accent!"><IconX /></Button>
          </CollapsibleTrigger>
          <div className="flex flex-wrap items-end gap-3">
          {kind !== "legacy" && !locked && (
            <Field className="w-56">
              <FieldLabel htmlFor="part-count">Number of {kind === "online_questions" ? "questions" : "entries"}</FieldLabel>
              <NumberInput id="part-count" variant="md" min={0} max={MAX_QUESTIONS} step={1} className="text-center tabular-nums"
                value={countText ?? String(count)}
                onChange={(event) => {
                  const text = event.target.value;
                  setCountText(text);
                  if (/^\d+$/.test(text)) resize(Number(text));
                }}
                onBlur={() => setCountText(null)} />
            </Field>
          )}
          {kind === "online_questions" && !locked && process.env.NODE_ENV !== "production" && (
            <JsonImport onImport={(questions) => { setCountText(null); setValue(`parts.${index}.questions`, questions, { shouldDirty: true }); }} />
          )}
          </div>
          <Field data-invalid={Boolean(error?.instructions) || undefined}>
            <FieldLabel htmlFor="part-instructions">Instructions</FieldLabel>
            <Textarea id="part-instructions" rows={3} maxLength={5000} {...register(`parts.${index}.instructions`)} />
            <FieldError>{error?.instructions?.message}</FieldError>
          </Field>
          </div>
        </CollapsibleContent>
      </div>

      {kind === "legacy" ? (
        <Field data-invalid={Boolean(error?.maxScore) || undefined} className="sm:max-w-48">
          <FieldLabel htmlFor="part-max">Maximum mark</FieldLabel>
          <Input id="part-max" inputMode="decimal" autoComplete="off" readOnly={locked}
            {...register(`parts.${index}.maxScore`)} aria-invalid={Boolean(error?.maxScore) || undefined} />
          <FieldError>{error?.maxScore?.message}</FieldError>
        </Field>
      ) : locked ? (
        <p className="text-sm text-muted-foreground">{countLabel(kind, count)}</p>
      ) : (
        <QuestionsEditor partIndex={index} kind={kind} onResize={resize} onSnapshot={snapshot} footer={total} />
      )}

      {(kind === "legacy" || locked || kind === "online_questions") && total}
    </Collapsible>
  );
}
