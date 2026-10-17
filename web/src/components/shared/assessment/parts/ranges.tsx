"use client";

import { useState, type ReactNode } from "react";
import { useFormContext, useWatch, type FieldValues } from "react-hook-form";
import { IconArrowBarToDown, IconArrowBarToUp, IconPlus, IconTrash } from "@tabler/icons-react";

import { NumberInput } from "@/components/shared/app-input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import { formatScore, isValidMaxScore, sumScores } from "@/lib/score";
import type { EditorQuestion } from "./config";

type Range = { id: number; end: number; marks: string };

let nextId = 1;

/** Consecutive questions with the same mark form one range. */
function deriveRanges(marks: string[]): Range[] {
  const ranges: Range[] = [];
  marks.forEach((mark, index) => {
    const last = ranges.at(-1);
    if (last && last.marks === mark) last.end = index + 1;
    else ranges.push({ id: nextId++, end: index + 1, marks: mark });
  });
  return ranges;
}

type Props = { partIndex: number; maxQuestions: number; onResize: (count: number) => void; footer?: ReactNode };

/**
 * A part's marks as ranges of question numbers, e.g. 1–57 at 1 mark, 58–59 at 1.5. Each
 * range starts after the previous one; editing a range's last number moves the boundary, and the last
 * range's end is the number of questions.
 */
export function MarkRanges({ partIndex, maxQuestions, onResize, footer }: Props) {
  const { control, setValue, getValues } = useFormContext<FieldValues>();
  const questions = (useWatch({ control, name: `parts.${partIndex}.questions` }) ?? []) as EditorQuestion[];
  const marks = questions.map((question) => question.maxScore.trim());
  const [local, setLocal] = useState<Range[] | null>(null);
  // Edits keep their own ranges (equal neighbours don't merge mid-edit) while they still describe the questions.
  const ranges = local && local.at(-1)?.end === marks.length && local.every((range, index) =>
    !isValidMaxScore(range.marks) || marks.slice(index === 0 ? 0 : local[index - 1].end, range.end).every((mark) => mark === range.marks))
    ? local : deriveRanges(marks);
  const highest = Math.max(1, ...ranges.map((range) => Number(range.marks) || 0));

  function apply(next: Range[]) {
    setLocal(next);
    const count = next.at(-1)?.end ?? 0;
    if (count !== (getValues(`parts.${partIndex}.questions`) as unknown[]).length) onResize(count);
    let start = 0;
    for (const range of next) {
      if (isValidMaxScore(range.marks)) {
        for (let index = start; index < range.end; index += 1) {
          if (getValues(`parts.${partIndex}.questions.${index}.maxScore`) !== range.marks) {
            setValue(`parts.${partIndex}.questions.${index}.maxScore`, range.marks, { shouldDirty: true });
          }
        }
      }
      start = range.end;
    }
  }

  function setEnd(position: number, value: number) {
    const start = position === 0 ? 1 : ranges[position - 1].end + 1;
    const limit = position === ranges.length - 1 ? maxQuestions : ranges[position + 1].end - 1;
    const end = Math.max(start, Math.min(limit, Math.floor(value)));
    apply(ranges.map((range, index) => index === position ? { ...range, end } : range));
  }

  function add() {
    const last = ranges.at(-1);
    const end = Math.min(maxQuestions, (last?.end ?? 0) + 5);
    const marks = last && isValidMaxScore(last.marks) ? String(Number(last.marks) + 1) : "1";
    apply([...ranges, { id: nextId++, end, marks }]);
  }

  /** The last range drops its questions; any other range is absorbed by its neighbour. */
  function removeRange(position: number) {
    if (position === ranges.length - 1) { apply(ranges.slice(0, -1)); return; }
    if (position === 0) { apply(ranges.slice(1)); return; }
    apply(ranges.filter((_, index) => index !== position).map((range) => range.id === ranges[position - 1].id ? { ...range, end: ranges[position].end } : range));
  }

  /** Drops this range and every range before it; the questions after them are renumbered from 1. */
  function removeBefore(position: number) {
    const shift = ranges[position].end;
    apply(ranges.slice(position + 1).map((range) => ({ ...range, end: range.end - shift })));
  }

  return (
    <div className="flex flex-col gap-3">
      {ranges.length > 0 && (
        <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
          {ranges.map((range, index) => (
            <div key={range.id} className="bg-primary transition-all" title={`${index === 0 ? 1 : ranges[index - 1].end + 1}–${range.end}`}
              style={{ flexGrow: range.end - (index === 0 ? 0 : ranges[index - 1].end), opacity: 0.35 + 0.65 * ((Number(range.marks) || 0) / highest) }} />
          ))}
        </div>
      )}
      <Card className="gap-0 py-0">
        <div className="grid grid-cols-[1fr_9rem_5rem] items-center gap-4 border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground">
          <span>Questions</span>
          <span className="text-center">Marks each</span>
          <span className="text-right">Subtotal</span>
        </div>
        <ol className="divide-y">
          {ranges.map((range, position) => {
            const start = position === 0 ? 1 : ranges[position - 1].end + 1;
            const length = range.end - start + 1;
            const subtotal = isValidMaxScore(range.marks) ? sumScores(Array.from({ length }, () => range.marks)) : null;
            return (
              <ContextMenu key={range.id}>
              <ContextMenuTrigger asChild>
              <li className="grid grid-cols-[1fr_9rem_5rem] items-center gap-4 px-4 py-2">
                <span className="flex items-center gap-2 text-sm">
                  <span className="w-8 text-right font-medium tabular-nums">{start}</span>
                  <span className="text-muted-foreground">to</span>
                  <EndInput key={`${range.id}-${range.end}`} value={range.end} min={start} max={position === ranges.length - 1 ? maxQuestions : ranges[position + 1].end - 1} label={`Last question of range ${position + 1}`}
                    onCommit={(value) => setEnd(position, value)} />
                  <span className="text-xs text-muted-foreground tabular-nums">{length} {length === 1 ? "question" : "questions"}</span>
                </span>
                <NumberInput variant="md" min={0} max={1000} step={0.5} className="text-center tabular-nums" aria-label={`Marks each for range ${position + 1}`}
                  aria-invalid={!isValidMaxScore(range.marks) || undefined} value={range.marks}
                  onChange={(event) => apply(ranges.map((entry) => entry.id === range.id ? { ...entry, marks: event.target.value } : entry))} />
                <span className="text-right text-sm font-medium tabular-nums">{subtotal === null ? "—" : formatScore(subtotal)}</span>
              </li>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem variant="destructive" disabled={ranges.length === 1} onSelect={() => removeRange(position)}><IconTrash />Remove this range</ContextMenuItem>
                <ContextMenuItem variant="destructive" onSelect={() => removeBefore(position)}><IconArrowBarToUp />Remove this and before</ContextMenuItem>
                <ContextMenuItem variant="destructive" onSelect={() => apply(ranges.slice(0, position))}><IconArrowBarToDown />Remove this and after</ContextMenuItem>
              </ContextMenuContent>
              </ContextMenu>
            );
          })}
        </ol>
      </Card>
      <div className="flex items-center justify-between gap-3">
      <Button type="button" variant="outline" size="sm" disabled={(ranges.at(-1)?.end ?? 0) >= maxQuestions} onClick={add}>
        <IconPlus />Add range
      </Button>
      {footer}
      </div>
    </div>
  );
}

/** A range's last question number. Typing is applied on Enter or blur, so "57" never passes through "5"; the − and + buttons apply at once. */
function EndInput({ value, min, max, label, onCommit }: { value: number; min: number; max: number; label: string; onCommit: (value: number) => void }) {
  const [text, setText] = useState(String(value));
  const commit = () => {
    const parsed = Number(text);
    if (/^\d+$/.test(text) && parsed !== value) onCommit(Math.max(min, parsed));
    else setText(String(value));
  };
  return (
    <NumberInput variant="md" min={min} max={max} step={1} aria-label={label} value={text} className="w-12 text-center tabular-nums" containerClassName="w-32"
      onChange={(event) => {
        const next = event.target.value;
        setText(next);
        if (!("nativeEvent" in event) && /^\d+$/.test(next)) onCommit(Number(next));
      }}
      onBlur={commit}
      onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commit(); } }} />
  );
}
