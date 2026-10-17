"use client";

import { useState, type MouseEvent, type ReactNode } from "react";
import { useFieldArray, useFormContext, type FieldValues } from "react-hook-form";
import { IconArrowBarToDown, IconArrowBarToUp, IconChevronDown, IconPlus, IconTrash, IconX } from "@tabler/icons-react";

import { NumberInput } from "@/components/shared/app-input";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Card } from "@/components/ui/card";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { FieldError } from "@/components/ui/field";
import { isValidMaxScore } from "@/lib/score";
import { countLabel, type KindSpec, type PartsConfig } from "./config";
import { LetterBoxes } from "./letters";
import { MarksInput } from "./marks";
import { QuestionPager } from "./pager";
import { MarkRanges } from "./ranges";

const BULK = [5, 10, 20] as const;

type Props = {
  config: PartsConfig;
  partIndex: number;
  kind: KindSpec;
  readOnly: boolean;
  /** Sets the part's question count; removed questions are kept aside by the part editor and come back first. */
  onResize: (count: number) => void;
  onSnapshot: () => void;
  footer?: ReactNode;
};

/** The marking scheme of one part, laid out as its type says: a pager, numbered rows, or mark ranges. */
export function QuestionsEditor({ config, partIndex, kind, readOnly, onResize, onSnapshot, footer }: Props) {
  const { control, setValue, formState: { errors } } = useFormContext<FieldValues>();
  const [selection, setSelection] = useState<Set<number>>(new Set());
  const [anchor, setAnchor] = useState<number | null>(null);
  const { fields, remove } = useFieldArray({ control, name: `parts.${partIndex}.questions`, keyName: "key" });
  const partErrors = (errors.parts as { questions?: { message?: string; root?: { message?: string } } }[] | undefined)?.[partIndex];
  const noun = kind.unit;
  const room = config.maxQuestions - fields.length;
  const add = (count: number) => onResize(fields.length + Math.min(count, room));
  const selected = [...selection].filter((position) => position < fields.length).sort((a, b) => a - b);
  const clear = () => { setSelection(new Set()); setAnchor(null); };

  /** Click selects one row, shift-click the rows in between, and cmd/ctrl-click adds or removes a row. */
  function pick(index: number, event: MouseEvent) {
    if (event.shiftKey && anchor !== null) {
      const [from, to] = anchor < index ? [anchor, index] : [index, anchor];
      setSelection(new Set(Array.from({ length: to - from + 1 }, (_, offset) => from + offset)));
    } else if (event.metaKey || event.ctrlKey) {
      const next = new Set(selection);
      if (!next.delete(index)) next.add(index);
      setSelection(next);
      setAnchor(index);
    } else {
      setSelection(selection.size === 1 && selection.has(index) ? new Set() : new Set([index]));
      setAnchor(index);
    }
  }

  const Icon = kind.icon;
  if (fields.length === 0) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon"><Icon /></EmptyMedia>
          <EmptyTitle>No {noun === "entry" ? "entries" : "questions"} yet</EmptyTitle>
        </EmptyHeader>
        <EmptyContent className="flex-row justify-center">
          <Button type="button" variant="outline" size="sm" onClick={() => add(1)}><IconPlus />Add {noun}</Button>
          {kind.layout !== "pager" && <Button type="button" variant="outline" size="sm" onClick={() => add(10)}>Add 10</Button>}
        </EmptyContent>
      </Empty>
    );
  }

  if (kind.layout === "pager") {
    return <QuestionPager config={config} partIndex={partIndex} kind={kind} keys={fields.map((field) => field.key)} readOnly={readOnly}
      onAdd={() => add(1)} onRemove={(position) => { onSnapshot(); remove(position); clear(); }} />;
  }
  if (kind.layout === "ranges") return <MarkRanges partIndex={partIndex} maxQuestions={config.maxQuestions} onResize={onResize} footer={footer} />;

  return (
    <div className="flex flex-col gap-3">
      {selected.length > 0 && (
        <SelectionBar count={selected.length}
          onClear={clear}
          onRemove={() => { onSnapshot(); remove(selected); clear(); }}
          onSetMarks={(marks) => { selected.forEach((position) => setValue(`parts.${partIndex}.questions.${position}.maxScore`, marks, { shouldDirty: true, shouldValidate: true })); }} />
      )}
      <Card className="gap-0 py-0">
        <div className="flex items-center gap-4 border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground">
          <span className="w-8 shrink-0 text-center">No.</span>
          <span className="flex-1">{kind.choices ? "Correct answer" : ""}</span>
          <span className="w-36 shrink-0 text-center">Marks</span>
        </div>
        <ol className="divide-y">
          {fields.map((field, index) => (
            <SheetRow key={field.key} config={config} partIndex={partIndex} index={index} kind={kind} selected={selected.includes(index)} onPick={(event) => pick(index, event)}
              onRemove={() => { onSnapshot(); remove(index); clear(); }} onRemoveAfter={() => { onResize(index); clear(); }}
              onRemoveBefore={() => { onSnapshot(); remove(Array.from({ length: index + 1 }, (_, position) => position)); clear(); }} />
          ))}
        </ol>
      </Card>
      <FieldError>{partErrors?.questions?.message ?? partErrors?.questions?.root?.message}</FieldError>
      <div className="flex items-center justify-between gap-3">
        <ButtonGroup>
          <Button type="button" variant="outline" size="sm" disabled={room <= 0} onClick={() => add(1)}><IconPlus />Add {noun}</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="icon-sm" aria-label="Add several entries" disabled={room <= 0}><IconChevronDown /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {BULK.map((count) => <DropdownMenuItem key={count} onSelect={() => add(count)}>Add {countLabel(kind, count)}</DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
        </ButtonGroup>
        {footer}
      </div>
    </div>
  );
}

type RowProps = {
  config: PartsConfig; partIndex: number; index: number; kind: KindSpec; selected: boolean;
  onPick: (event: MouseEvent) => void; onRemove: () => void; onRemoveAfter: () => void; onRemoveBefore: () => void;
};

/** One numbered row of a sheet part. */
function SheetRow({ config, partIndex, index, kind, selected, onPick, onRemove, onRemoveAfter, onRemoveBefore }: RowProps) {
  const { formState: { errors } } = useFormContext<FieldValues>();
  const error = (errors.parts as { questions?: { maxScore?: { message?: string }; choices?: { message?: string; root?: { message?: string } } }[] }[] | undefined)?.[partIndex]?.questions?.[index];
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <li className={`group/row cursor-default px-4 py-2 transition-colors ${selected ? "bg-primary/10 hover:bg-primary/15" : "hover:bg-muted/30"}`}
          onMouseDown={(event) => { if (event.shiftKey) event.preventDefault(); }}
          onClick={(event) => { if (!(event.target as HTMLElement).closest("button, input, [role=radio]")) onPick(event); }}>
          <div className="flex items-center gap-4">
            <span className="group/num relative flex size-8 shrink-0 items-center justify-center">
              <span className="text-sm font-medium tabular-nums text-muted-foreground transition-opacity group-hover/num:opacity-0 group-has-focus-visible/num:opacity-0">{index + 1}</span>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${kind.unit} ${index + 1}`}
                className="absolute inset-0 size-8 text-destructive opacity-0 transition-opacity group-hover/num:opacity-100 hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 dark:hover:bg-destructive/20"
                onClick={onRemove}>
                <IconX />
              </Button>
            </span>
            <div className="flex min-w-0 flex-1 items-center">
              {kind.choices && <LetterBoxes config={config} partIndex={partIndex} questionIndex={index} />}
            </div>
            <MarksInput partIndex={partIndex} index={index} noun="entry" />
          </div>
          <FieldError className="mt-1 pl-12">{error?.maxScore?.message ?? error?.choices?.message ?? error?.choices?.root?.message}</FieldError>
        </li>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem variant="destructive" onSelect={onRemove}><IconTrash />Remove this row</ContextMenuItem>
        <ContextMenuItem variant="destructive" onSelect={onRemoveBefore}><IconArrowBarToUp />Remove this and before</ContextMenuItem>
        <ContextMenuItem variant="destructive" onSelect={onRemoveAfter}><IconArrowBarToDown />Remove this and after</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** Actions for the selected rows of a sheet. */
function SelectionBar({ count, onClear, onRemove, onSetMarks }: { count: number; onClear: () => void; onRemove: () => void; onSetMarks: (marks: string) => void }) {
  const [marks, setMarks] = useState("1");
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-muted/40 py-1 pr-1 pl-3 whitespace-nowrap">
      <span className="text-sm font-medium tabular-nums">{count} selected</span>
      <div className="ml-auto flex items-center gap-1.5">
        <NumberInput variant="md" min={0} max={1000} step={0.5} className="w-20 text-center tabular-nums" aria-label="Marks for selected rows"
          value={marks} onChange={(event) => setMarks(event.target.value)} />
        <Button type="button" variant="outline" size="sm" disabled={!isValidMaxScore(marks)} onClick={() => onSetMarks(marks)}>Set marks</Button>
        <Button type="button" variant="destructive" size="sm" onClick={onRemove}><IconTrash />Remove</Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Clear selection" onClick={onClear}><IconX /></Button>
      </div>
    </div>
  );
}
