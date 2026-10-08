"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { IconBolt, IconChevronLeft, IconChevronRight } from "@tabler/icons-react";

import { Segmented } from "@/components/shared/segmented";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ANSWERS_PER_PAGE, BLANK, draftTotal, invalidMark, isChoicePart, type AnswerDrafts } from "../answers";
import { formatScore } from "../score";
import type { AssignmentPart, StudentMark } from "../types";

export type EntryMode = "questions" | "fast";
export type FastDraft = { score: string; excused: boolean; reason: string };

type Props = {
  part: AssignmentPart;
  saved: StudentMark | undefined;
  mode: EntryMode;
  onModeChange: (mode: EntryMode) => void;
  drafts: AnswerDrafts;
  onDraftChange: (questionId: string, value: string) => void;
  fast: FastDraft;
  onFastChange: (next: Partial<FastDraft>) => void;
  /** Space on the last question moves on to the next part. */
  onNextPart?: () => void;
};

const letter = (position: number) => String.fromCharCode(64 + position);

/**
 * One part of a student's marks. Typed parts are entered question by question (a letter per choice
 * question, a mark per manual question), five at a time, or fast-marked with a typed part total.
 * Legacy parts only take a part total.
 */
export function PartEntry({ part, saved, mode, onModeChange, drafts, onDraftChange, fast, onFastChange, onNextPart }: Props) {
  const [page, setPage] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLOListElement>(null);
  // The question the keyboard acts on, as an index into all of the part's questions.
  const [active, setActive] = useState(0);
  const typed = part.kind !== null && part.questions.length > 0;
  const choice = isChoicePart(part);
  const pages = Math.max(1, Math.ceil(part.questions.length / ANSWERS_PER_PAGE));
  const visible = part.questions.slice(page * ANSWERS_PER_PAGE, (page + 1) * ANSWERS_PER_PAGE);
  const { total, entered } = draftTotal(part, drafts);
  const fastText = fast.score.trim();
  const fastInvalid = invalidMark(fastText, part.maxScore);
  const fastMarked = saved?.kind === "mark" && !saved.fromAnswers && typed;

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

  /** Enter in a mark box moves to the next question's box (across pages), and past the last one to the next part. */
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
    onDraftChange(question.id, value);
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
          {saved?.kind === "excused" && <Badge variant="secondary">Excused</Badge>}
        </div>
        <div className="ml-auto flex items-center gap-2 empty:hidden">
          {typed && (
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
          <ol className={cn("flex flex-col divide-y rounded-xl border outline-none", choice && "focus-visible:ring-3 focus-visible:ring-ring/50")}
            ref={list} tabIndex={choice ? 0 : undefined} onKeyDown={onKeyDown}
            // Keep focus on the list so the keyboard keeps working after a click on a letter.
            onMouseDown={(event) => { if (choice && event.target instanceof Element && event.target.closest("button")) event.preventDefault(); }}>
            {visible.map((question, offset) => {
              const value = drafts[question.id] ?? "";
              const index = page * ANSWERS_PER_PAGE + offset;
              return (
                <li key={question.id} onClick={() => choice && setActive(index)}
                  className={cn("flex items-center gap-4 px-4 py-2.5", choice && index === active && "bg-muted/60")}>
                  <span className="w-8 shrink-0 text-sm font-medium text-muted-foreground tabular-nums">{question.position}</span>
                  {choice ? (
                    <div role="radiogroup" aria-label={`Question ${question.position}`} className="flex flex-wrap gap-2">
                      {question.choices.map((entry) => {
                        const chosen = value === entry.id;
                        return (
                          <Button key={entry.id} type="button" size="icon" role="radio" tabIndex={-1} aria-checked={chosen}
                            variant={chosen ? "default" : "outline"}
                            className={cn(chosen && !entry.isCorrect && "bg-destructive text-white hover:bg-destructive/90")}
                            title={entry.isCorrect ? "Correct answer" : undefined}
                            onClick={() => onDraftChange(question.id, chosen ? "" : entry.id)}>
                            {letter(entry.position)}
                          </Button>
                        );
                      })}
                      <Button type="button" role="radio" tabIndex={-1} aria-checked={value === BLANK} variant={value === BLANK ? "secondary" : "ghost"}
                        className="text-muted-foreground" onClick={() => onDraftChange(question.id, value === BLANK ? "" : BLANK)}>
                        Blank
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Input aria-label={`Question ${question.position} mark`} data-index={index} onFocus={() => setActive(index)} inputMode="decimal" autoComplete="off" className="w-24"
                        value={value} aria-invalid={invalidMark(value, question.maxScore) || undefined}
                        onChange={(event) => onDraftChange(question.id, event.target.value)} />
                      <span className="text-sm text-muted-foreground">/ {formatScore(question.maxScore)}</span>
                    </div>
                  )}
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
            <Input id={`mark-${part.id}`} inputMode="decimal" autoComplete="off" placeholder={`Mark out of ${formatScore(part.maxScore)}`} value={fast.score} aria-invalid={fastInvalid || undefined}
              onKeyDown={(event) => { if (event.key === "Enter" && onNextPart) { event.preventDefault(); onNextPart(); } }}
              onChange={(event) => onFastChange({ score: event.target.value })} />
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
