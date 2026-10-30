"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { IconBolt, IconCheck, IconChevronLeft, IconChevronRight, IconMinus, IconPlus, IconX } from "@tabler/icons-react";

import { Segmented } from "@/components/shared/segmented";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatScore } from "@/lib/score";
import { ANSWERS_PER_PAGE, BLANK, draftTotal, invalidMark, type AnswerDrafts } from "./draft";
import type { FastMark, MarkPart } from "./types";

export type EntryMode = "questions" | "fast";
export type FastDraft = { score: string; excused: boolean; reason: string };

type Props = {
  part: MarkPart;
  saved: FastMark | undefined;
  /** Typed parts can also be marked with one total; types without it only enter questions. */
  fastEnabled: boolean;
  mode: EntryMode;
  onModeChange: (mode: EntryMode) => void;
  drafts: AnswerDrafts;
  onDraftChange: (questionId: string, value: string) => void;
  fast: FastDraft;
  onFastChange: (next: Partial<FastDraft>) => void;
  /** Space on the last question moves on to the next part. */
  onNextPart?: () => void;
};

type Quick = "none" | "half" | "full" | "";

/** The quick-mark switch position a typed mark corresponds to, if any. */
const quickValue = (value: string, max: string): Quick => {
  if (value.trim() === "") return "";
  const mark = Number(value);
  return mark === 0 ? "none" : mark === Number(max) ? "full" : mark === Number(max) / 2 ? "half" : "";
};
const quickMark = (quick: Quick, max: string) => String(quick === "none" ? 0 : quick === "full" ? Number(max) : Math.round(Number(max) * 50) / 100);
/** One step up or down (by `delta`), kept within 0 to the question's maximum. */
const stepMark = (value: string, delta: number, max: string) => String(Math.min(Math.max(Math.round(((Number(value) || 0) + delta) * 100) / 100, 0), Number(max)));

const letter = (position: number) => String.fromCharCode(64 + position);

/**
 * One part of a student's marks. Parts are entered question by question (a letter per choice
 * question, a mark per manual question), five at a time, or, where the type allows it, fast-marked
 * with a typed part total. Legacy parts only take a part total.
 */
/** A mark: stepper input with its maximum, and a quick-mark switch (zero, half, full) at the far right. */
function MarkControl({ id, label, step = 0.5, value, max, disabled, index, onFocus, onKeyDown, onChange }: {
  id?: string; label: string; /** Increment; holding Shift always steps by 1. */ step?: number; value: string; max: string; disabled?: boolean; index?: number;
  onFocus?: () => void; onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void; onChange: (value: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const stepBy = (direction: 1 | -1, shift: boolean) => onChange(stepMark(value, direction * (shift ? 1 : step), max));
  // Clicking a step button hands focus to the number, so the arrow keys carry on from there.
  const click = (direction: 1 | -1, shift: boolean) => { stepBy(direction, shift); input.current?.focus(); };
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <ButtonGroup>
        <Button type="button" variant="outline" size="icon" aria-label={`Decrease ${label}`} disabled={disabled} onClick={(event) => click(-1, event.shiftKey)}><IconMinus /></Button>
        <Input ref={input} id={id} aria-label={label} data-index={index} onFocus={(event) => { event.target.select(); onFocus?.(); }} onMouseUp={(event) => event.preventDefault()} onKeyDown={(event) => {
          if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); stepBy(event.key === "ArrowUp" ? 1 : -1, event.shiftKey); return; }
          onKeyDown?.(event);
        }} inputMode="decimal" autoComplete="off" className="w-16 text-center"
          value={value} aria-invalid={invalidMark(value, max) || undefined} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
        <Button type="button" variant="outline" size="icon" aria-label={`Increase ${label}`} disabled={disabled} onClick={(event) => click(1, event.shiftKey)}><IconPlus /></Button>
      </ButtonGroup>
      <span className="text-sm text-muted-foreground">/ {formatScore(max)}</span>
      <Segmented label={`${label} quick mark`} value={quickValue(value, max)} disabled={disabled} className="ml-auto h-9 items-stretch"
        onChange={(next) => onChange(quickMark(next, max))}
        options={[
          { value: "none", label: <IconX className="size-4" />, hint: "Zero" },
          { value: "half", label: "½", hint: "Half marks" },
          { value: "full", label: <IconCheck className="size-4" />, hint: "Full marks" },
        ]} />
    </div>
  );
}

export function PartEntry({ part, saved, fastEnabled, mode, onModeChange, drafts, onDraftChange, fast, onFastChange, onNextPart }: Props) {
  const [page, setPage] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLOListElement>(null);
  // The question the keyboard acts on, as an index into all of the part's questions.
  const [active, setActive] = useState(0);
  const typed = part.entry !== "total" && part.questions.length > 0;
  const choice = part.entry === "choice";
  const pages = Math.max(1, Math.ceil(part.questions.length / ANSWERS_PER_PAGE));
  const visible = part.questions.slice(page * ANSWERS_PER_PAGE, (page + 1) * ANSWERS_PER_PAGE);
  const { total, entered } = draftTotal(part, drafts);
  const fastText = fast.score.trim();
  const fastInvalid = invalidMark(fastText, part.maxScore);
  const fastMarked = fastEnabled && saved?.kind === "mark" && !saved.fromAnswers && typed;

  // Focus the answer box when the part opens (and when the way of marking changes). Retried a few times:
  // a closing dropdown, sheet or tab hands focus back on its own schedule and must not win.
  useEffect(() => {
    const target = () => list.current ?? root.current?.querySelector<HTMLElement>("input:not([type=checkbox])");
    const timers = [0, 60, 200, 400].map((delay) => setTimeout(() => {
      const element = target();
      if (element && !element.contains(document.activeElement)) element.focus();
    }, delay));
    return () => timers.forEach(clearTimeout);
  }, [mode]);

  /** Enter in a mark box moves to the next question's box (Alt+Enter to the previous one) (across pages), and past the last one to the next part. */
  const pendingFocus = useRef(false);
  useEffect(() => {
    if (!pendingFocus.current) return;
    pendingFocus.current = false;
    root.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.focus();
  }, [active, page]);

  /** Moves the keyboard target (and the visible page with it). */
  function focusRow(index: number) {
    const next = Math.min(Math.max(index, 0), part.questions.length - 1);
    setActive(next);
    setPage(Math.floor(next / ANSWERS_PER_PAGE));
  }

  /** Up/Down move between questions, Left/Right between pages; A–D or 1–4 answer the target and move down; 0 is blank; Backspace clears; Space confirms and moves down, or on to the next part after the last question. */
  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!choice && event.key === "Enter" && !event.shiftKey && event.target instanceof HTMLElement && event.target.dataset.index !== undefined) {
      event.preventDefault();
      const index = Number(event.target.dataset.index);
      if (event.altKey) { // Alt+Enter goes back a question
        if (index > 0) { focusRow(index - 1); pendingFocus.current = true; }
        return;
      }
      if (index >= part.questions.length - 1) { onNextPart?.(); return; }
      focusRow(index + 1);
      pendingFocus.current = true;
      return;
    }
    if (!choice || event.metaKey || event.ctrlKey || event.altKey) return;
    const question = part.questions[active];
    if (!question) return;
    const key = event.key.toLowerCase();
    if (key === "arrowdown" || key === "arrowup") {
      event.preventDefault();
      focusRow(active + (key === "arrowdown" ? 1 : -1));
      return;
    }
    if (key === "arrowright" || key === "arrowleft") {
      event.preventDefault();
      const target = Math.min(Math.max(page + (key === "arrowright" ? 1 : -1), 0), pages - 1);
      if (target !== page) goToPage(target);
      return;
    }
    if (key === " ") {
      event.preventDefault();
      if (active >= part.questions.length - 1) onNextPart?.();
      else focusRow(active + 1);
      return;
    }
    let value: string | null = null;
    if (key === "0") value = BLANK;
    else if (key === "backspace" || key === "delete") value = "";
    else {
      const position = /^[a-z]$/.test(key) ? key.charCodeAt(0) - 96 : /^[1-9]$/.test(key) ? Number(key) : 0;
      value = question.choices.find((entry) => entry.position === position)?.id ?? null;
    }
    if (value === null) return;
    event.preventDefault();
    if (!question.locked) onDraftChange(question.id, value);
    focusRow(active + 1);
  }

  function goToPage(next: number) {
    setPage(next);
    setActive(next * ANSWERS_PER_PAGE);
  }

  return (
    <div ref={root} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 empty:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate font-medium">{part.title}</p>
          {fastMarked && <Badge variant="secondary"><IconBolt aria-hidden="true" />Fast marked</Badge>}
          {saved?.requiresRemark && <Badge variant="destructive">Re-mark required</Badge>}
          {fastEnabled && saved?.kind === "excused" && <Badge variant="secondary">Excused</Badge>}
        </div>
        <div className="ml-auto flex items-center gap-2 empty:hidden">
          {typed && fastEnabled && (
            <Segmented label="How to mark" value={mode} onChange={onModeChange}
              options={[
                { value: "questions", label: "By question" },
                { value: "fast", label: "Fast mark" },
              ]} />
          )}
        </div>
      </div>

      {typed && mode === "questions" ? (
        <>
          <ol className="flex flex-col gap-2 outline-none"
            ref={list} tabIndex={choice ? 0 : undefined} onKeyDown={onKeyDown}
            // Keep focus on the list so the keyboard keeps working after a click on a letter.
            onMouseDown={(event) => { if (choice && event.target instanceof Element && event.target.closest("button")) event.preventDefault(); }}>
            {visible.map((question, offset) => {
              const value = drafts[question.id] ?? "";
              const index = page * ANSWERS_PER_PAGE + offset;
              return (
                <li key={question.id} onClick={() => choice && setActive(index)}
                  className={cn("flex flex-col gap-2 rounded-xl bg-muted/50 px-4 py-2.5", choice && index === active && "bg-muted", question.excluded && "opacity-60")}>
                  <div className="flex items-center gap-4">
                    <span className="w-8 shrink-0 text-sm font-medium text-muted-foreground tabular-nums" title={question.prompt || undefined}>{question.position}</span>
                    {choice ? (
                      <div role="radiogroup" aria-label={`Question ${question.position}`} className="flex flex-wrap gap-2">
                        {question.choices.map((entry) => {
                          const chosen = value === entry.id;
                          return (
                            <Button key={entry.id} type="button" size="icon" role="radio" tabIndex={-1} aria-checked={chosen}
                              variant={chosen ? "default" : "outline"} disabled={question.locked}
                              // The default unselected fill would vanish on the highlighted row.
                              className={cn(!chosen && "bg-background/60 hover:bg-background", chosen && !entry.isCorrect && "bg-destructive text-white hover:bg-destructive/90 disabled:opacity-100")}
                              title={entry.isCorrect ? "Correct answer" : undefined}
                              onClick={() => onDraftChange(question.id, chosen ? "" : entry.id)}>
                              {letter(entry.position)}
                            </Button>
                          );
                        })}
                        <Button type="button" role="radio" tabIndex={-1} aria-checked={value === BLANK} variant={value === BLANK ? "secondary" : "ghost"}
                          disabled={question.locked} className="text-muted-foreground" onClick={() => onDraftChange(question.id, value === BLANK ? "" : BLANK)}>
                          Blank
                        </Button>
                      </div>
                    ) : (
                      <MarkControl label={`Question ${question.position} mark`} value={value} max={question.maxScore} disabled={question.locked} index={index}
                        onFocus={() => setActive(index)} onChange={(next) => onDraftChange(question.id, next)} />
                    )}
                    {question.excluded && <Badge variant="outline" className="ml-auto">Excluded</Badge>}
                  </div>
                  {question.note}
                </li>
              );
            })}
          </ol>
          <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
            <span className="tabular-nums">
              <span className="font-semibold text-foreground">{formatScore(String(total))}</span> / {formatScore(part.maxScore)}
            </span>
            <span className="flex items-center gap-3">
              <span className="tabular-nums">{entered}/{part.questions.length} entered</span>
              {pages > 1 && (
              <span className="flex items-center gap-1.5">
                <span className="tabular-nums">{page * ANSWERS_PER_PAGE + 1}–{Math.min((page + 1) * ANSWERS_PER_PAGE, part.questions.length)}</span>
                <Button type="button" variant="outline" size="icon-sm" aria-label="Previous questions" disabled={page === 0} onClick={() => goToPage(page - 1)}><IconChevronLeft /></Button>
                <Button type="button" variant="outline" size="icon-sm" aria-label="Next questions" disabled={page >= pages - 1} onClick={() => goToPage(page + 1)}><IconChevronRight /></Button>
              </span>
              )}
            </span>
          </div>
        </>
      ) : (
        <>
          <Field data-invalid={fastInvalid || undefined}>
            <FieldLabel htmlFor={`mark-${part.id}`} className="sr-only">Part {part.position} mark</FieldLabel>
            <MarkControl id={`mark-${part.id}`} label={`Part ${part.position} mark`} value={fast.score} max={part.maxScore} step={1}
              onKeyDown={(event) => { if (event.key === "Enter" && onNextPart) { event.preventDefault(); onNextPart(); } }}
              onChange={(next) => onFastChange({ score: next })} />
            {fastInvalid && <FieldDescription className="text-destructive">Enter 0 to {formatScore(part.maxScore)}, with at most two decimals.</FieldDescription>}
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={fast.excused} onCheckedChange={(checked) => onFastChange({ excused: checked === true })} />
            Excused adjustment
          </label>
          {fast.excused && (
            <Input aria-label={`Reason for excusing part ${part.position}`} placeholder="Reason" maxLength={500} value={fast.reason}
              onChange={(event) => onFastChange({ reason: event.target.value })} />
          )}
        </>
      )}
    </div>
  );
}
