"use client";

import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useFormContext, useWatch, type FieldValues } from "react-hook-form";

import { NumberInput } from "@/components/shared/app-input";
import { Segmented } from "@/components/shared/segmented";
import { Field, FieldLabel } from "@/components/ui/field";
import { formatScore } from "@/lib/score";
import { detachDraft } from "../authoring";
import { PartFrame } from "../part-frame";
import { countLabel, kindOf, type EditorChoice, type EditorPart, type EditorQuestion, type PartsConfig } from "./config";
import { QuestionsEditor } from "./questions";

/**
 * What the editor set aside while the form is open, per part: the choices a type without them dropped,
 * and the questions removed from the end. Both come back when the type or the count is changed back.
 */
export type PartStash = { choices: Map<string, EditorChoice[][]>; removed: Map<string, EditorQuestion[]> };

export const newStash = (): PartStash => ({ choices: new Map(), removed: new Map() });

type Props = {
  config: PartsConfig;
  locked: boolean;
  index: number;
  stash: PartStash;
  onSelect: (index: number) => void;
  onClose: () => void;
  /** Extra tools in the advanced options, such as an import. */
  tools?: (api: { kind: string; setQuestions: (questions: EditorQuestion[]) => void }) => ReactNode;
};

/** A question without stored ids: an autosave may already have deleted the original. */
const withoutIds = (question: EditorQuestion): EditorQuestion => detachDraft(question);

/** One part, edited on its own page: title, type and advanced settings, then its questions or entries. */
export function PartEditor({ config, locked, index, stash, onSelect, onClose, tools }: Props) {
  const { control, setValue, getValues } = useFormContext<FieldValues>();
  const parts = (useWatch({ control, name: "parts" }) ?? []) as EditorPart[];
  const part = parts[index];
  const [history] = useState<{ stack: EditorQuestion[][] }>(() => ({ stack: [] }));
  const [countText, setCountText] = useState<string | null>(null);
  const key = part?.id ?? String(index);
  const questionsPath = `parts.${index}.questions`;

  /** Remembers the questions before a removal, so Cmd/Ctrl+Z can bring them back. */
  function snapshot() {
    history.stack.push((getValues(questionsPath) as EditorQuestion[]).map(withoutIds));
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
      setValue(questionsPath, previous, { shouldDirty: true });
      toast("Removal undone");
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  if (!part) return null;
  const kind = kindOf(config, part.kind);
  const max = config.total(part);
  const count = part.questions.length;
  const readOnly = locked && config.lockedView === "readonly";

  /**
   * Changing the type keeps the entered marks; choices follow the new type's shape. A type without
   * choices sets the previous ones aside, and they come back when the type is switched back.
   */
  function changeKind(next: string) {
    const target = kindOf(config, next);
    const questions = getValues(questionsPath) as EditorQuestion[];
    if (!target.choices && questions.some((question) => question.choices.length > 0)) stash.choices.set(key, questions.map((question) => question.choices));
    const kept = stash.choices.get(key);
    setValue(`parts.${index}.kind`, next, { shouldDirty: true });
    setValue(questionsPath, questions.map((question, position) => ({
      ...question,
      choices: !target.choices ? [] : question.choices.length > 0 ? question.choices : kept?.[position]?.length ? kept[position] : config.blankChoices(target),
    })), { shouldDirty: true });
  }

  /**
   * Sets the number of questions. Removing always takes them from the end and keeps them aside; adding
   * brings those back first, with their content, then adds blank ones carrying the last mark.
   */
  function resize(target: number) {
    const next = Math.max(0, Math.min(config.maxQuestions, Math.floor(target)));
    const questions = getValues(questionsPath) as EditorQuestion[];
    if (next === questions.length) return;
    const removed = stash.removed.get(key) ?? [];
    if (next < questions.length) {
      snapshot();
      stash.removed.set(key, [...questions.slice(next).map(withoutIds), ...removed]);
      setValue(questionsPath, questions.slice(0, next), { shouldDirty: true });
      return;
    }
    const needed = next - questions.length;
    const restored = removed.slice(0, needed).map((question) => ({
      ...question, choices: !kind.choices ? [] : question.choices.length > 0 ? question.choices : config.blankChoices(kind),
    }));
    stash.removed.set(key, removed.slice(needed));
    const marks = (restored.at(-1) ?? questions.at(-1))?.maxScore || "1";
    const blanks = Array.from({ length: needed - restored.length }, () => config.blankQuestion(kind, marks));
    setValue(questionsPath, [...questions, ...restored, ...blanks], { shouldDirty: true });
  }

  const total = (
    <p className="text-right text-sm">
      Part total <span className="font-semibold tabular-nums">{max === null ? "—" : formatScore(max)}</span> marks
    </p>
  );
  const pager = kind.layout === "pager";

  return (
    <PartFrame index={index} count={parts.length} onSelect={onSelect} onClose={onClose} locked={locked}
      type={(
        <Field className="w-auto">
          <FieldLabel>Type</FieldLabel>
          <Segmented label="Part type" value={part.kind} disabled={locked} onChange={changeKind} className="h-9"
            options={config.kinds.map((value) => ({ value: value.value, label: value.label, hint: value.hint }))} />
        </Field>
      )}
      advanced={(
        <div className="flex flex-wrap items-end gap-3">
          {!locked && (
            <Field className="w-56">
              <FieldLabel htmlFor="part-count">Number of {kind.unit === "question" ? "questions" : "entries"}</FieldLabel>
              <NumberInput id="part-count" variant="md" min={0} max={config.maxQuestions} step={1} className="text-center tabular-nums"
                value={countText ?? String(count)}
                onChange={(event) => {
                  const text = event.target.value;
                  setCountText(text);
                  if (/^\d+$/.test(text)) resize(Number(text));
                }}
                onBlur={() => setCountText(null)} />
            </Field>
          )}
          {!locked && tools?.({ kind: part.kind, setQuestions: (questions) => { setCountText(null); setValue(questionsPath, questions, { shouldDirty: true }); } })}
        </div>
      )}>
      {locked && !readOnly ? (
        <p className="text-sm text-muted-foreground">{countLabel(kind, count)}</p>
      ) : (
        <QuestionsEditor config={config} partIndex={index} kind={kind} readOnly={readOnly} onResize={resize} onSnapshot={snapshot} footer={total} />
      )}

      {(locked || pager) && total}
    </PartFrame>
  );
}
