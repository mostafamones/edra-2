"use client";

import { useState, type MouseEvent, type ReactNode } from "react";
import { Controller, useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { IconChevronDown, IconChevronLeft, IconChevronRight, IconArrowBarToDown, IconArrowBarToUp, IconChevronUp, IconPlus, IconTrash, IconX } from "@tabler/icons-react";

import { NumberInput } from "@/components/shared/app-input";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldError } from "@/components/ui/field";
import { MAX_QUESTION_IMAGES, questionImageCount } from "../../../images";
import { isValidMaxScore } from "../../../score";
import type { PartKind } from "../../../types";
import { MAX_CHOICES, MAX_QUESTIONS, type AssignmentFormValues, type FormPart } from "../../../validation";
import { ImageTextField } from "../images/field";
import { countLabel, PART_KIND_ICONS } from "../../shared/labels";
import { MarkRanges } from "./ranges";
import { StepPanel } from "../steps";

const letter = (index: number) => String.fromCharCode(65 + index);
const BULK = [5, 10, 20] as const;
/** Question numbers shown while the number list is collapsed: a window around the open question. */
const WINDOW = 12;
const REMOVE_CLASS = "text-destructive hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20";

/** Four blank choices for a multiple-choice entry; file-upload entries have none. */
export const blankChoices = (kind: PartKind) => kind === "file_upload" ? [] : Array.from({ length: 4 }, () => ({ label: "", isCorrect: false }));

const questionDone = (question: FormPart["questions"][number]) =>
  question.prompt.trim() !== "" && question.choices.length >= 2 && question.choices.some((choice) => choice.isCorrect)
  && question.choices.every((choice) => choice.label.trim() !== "");

/** Sets the part's question count; removed questions are kept aside by the part editor and come back first. */
type Props = { partIndex: number; kind: PartKind; onResize: (count: number) => void; onSnapshot: () => void; footer?: ReactNode };

/** The marking scheme of one part: online questions one at a time, or a sheet of numbered entries. */
export function QuestionsEditor({ partIndex, kind, onResize, onSnapshot, footer }: Props) {
  const { control, setValue, formState: { errors } } = useFormContext<AssignmentFormValues>();
  const [selection, setSelection] = useState<Set<number>>(new Set());
  const [anchor, setAnchor] = useState<number | null>(null);
  const { fields, remove } = useFieldArray({ control, name: `parts.${partIndex}.questions`, keyName: "key" });
  const partErrors = errors.parts?.[partIndex];
  const noun = kind === "online_questions" ? "question" : "entry";
  const room = MAX_QUESTIONS - fields.length;
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

  const Icon = PART_KIND_ICONS[kind];
  if (fields.length === 0) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon"><Icon /></EmptyMedia>
          <EmptyTitle>No {noun === "entry" ? "entries" : "questions"} yet</EmptyTitle>
        </EmptyHeader>
        <EmptyContent className="flex-row justify-center">
          <Button type="button" variant="outline" size="sm" onClick={() => add(1)}><IconPlus />Add {noun}</Button>
          {kind !== "online_questions" && <Button type="button" variant="outline" size="sm" onClick={() => add(10)}>Add 10</Button>}
        </EmptyContent>
      </Empty>
    );
  }

  if (kind === "online_questions") return <QuestionPager partIndex={partIndex} keys={fields.map((field) => field.key)} onAdd={() => add(1)} onRemove={(position) => { onSnapshot(); remove(position); clear(); }} />;
  if (kind === "file_upload") return <MarkRanges partIndex={partIndex} onResize={onResize} footer={footer} />;

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
          <span className="flex-1">{kind === "answer_sheet" ? "Correct answer" : ""}</span>
          <span className="w-36 shrink-0 text-center">Marks</span>
        </div>
        <ol className="divide-y">
          {fields.map((field, index) => <SheetRow key={field.key} partIndex={partIndex} index={index} kind={kind} selected={selected.includes(index)} onPick={(event) => pick(index, event)}
            onRemove={() => { onSnapshot(); remove(index); clear(); }} onRemoveAfter={() => { onResize(index); clear(); }}
            onRemoveBefore={() => { onSnapshot(); remove(Array.from({ length: index + 1 }, (_, position) => position)); clear(); }} />)}
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

/** Online questions, one card at a time: numbered jumps above, back and next below. */
function QuestionPager({ partIndex, keys, onAdd, onRemove }: { partIndex: number; keys: string[]; onAdd: () => void; onRemove: (index: number) => void }) {
  const { control, formState: { errors } } = useFormContext<AssignmentFormValues>();
  const questions = useWatch({ control, name: `parts.${partIndex}.questions` }) ?? [];
  const [selected, setSelected] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [expanded, setExpanded] = useState(false);
  const reduce = useReducedMotion();
  // The count can shrink from the advanced settings; stay on the last remaining question.
  const current = Math.min(selected, keys.length - 1);
  const last = current === keys.length - 1;
  const partErrors = errors.parts?.[partIndex]?.questions;
  const first = Math.max(0, Math.min(current - Math.floor(WINDOW / 2), keys.length - WINDOW));
  const visible = expanded || keys.length <= WINDOW
    ? keys.map((_, index) => index)
    : Array.from({ length: WINDOW }, (_, offset) => first + offset);

  function open(index: number) {
    setDirection(index < current ? -1 : 1);
    setSelected(index);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <AnimatePresence initial={false} mode="wait">
          <motion.nav key={expanded || keys.length <= WINDOW ? "all" : "window"} aria-label="Questions" className="flex min-w-0 flex-1 flex-wrap gap-1.5 overflow-hidden"
            initial={reduce ? false : { height: 32, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={reduce ? undefined : { height: 32, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}>
            {visible.map((index) => {
              const question = questions[index];
              const flagged = Boolean(partErrors?.[index]) || (question !== undefined && !questionDone(question));
              return (
                <Button key={keys[index]} type="button" size="icon-sm" variant={index === current ? "default" : "outline"} aria-current={index === current ? "step" : undefined}
                  aria-label={`Question ${index + 1}${flagged ? ", unfinished" : ""}`} className="relative tabular-nums" onClick={() => open(index)}>
                  {index + 1}
                  {flagged && index !== current && <span aria-hidden="true" className="absolute top-1 right-1 size-1.5 rounded-full bg-destructive" />}
                </Button>
              );
            })}
            {keys.length < MAX_QUESTIONS && (expanded || visible.at(-1) === keys.length - 1) && (
              <Button type="button" size="icon-sm" variant="ghost" aria-label="Add question" className="text-muted-foreground"
                onClick={() => { onAdd(); open(keys.length); }}>
                <IconPlus />
              </Button>
            )}
          </motion.nav>
        </AnimatePresence>
        {keys.length > WINDOW && (
          <Button type="button" variant="ghost" size="sm" className="shrink-0 text-muted-foreground" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
            {expanded ? <>Less<IconChevronUp data-icon="inline-end" /></> : <>All {keys.length}<IconChevronDown data-icon="inline-end" /></>}
          </Button>
        )}
      </div>

      <div className="overflow-hidden">
        <StepPanel stepKey={keys[current]} direction={direction}>
          <OnlineQuestion partIndex={partIndex} index={current} onRemove={() => onRemove(current)} />
        </StepPanel>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="outline" size="sm" disabled={current === 0} onClick={() => open(current - 1)}><IconChevronLeft />Previous</Button>
        <span className="text-sm text-muted-foreground tabular-nums">{current + 1} / {keys.length}</span>
        {last ? (
          <Button type="button" variant="outline" size="sm" disabled={keys.length >= MAX_QUESTIONS} onClick={() => { onAdd(); open(keys.length); }}><IconPlus />Add question</Button>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={() => open(current + 1)}>Next<IconChevronRight /></Button>
        )}
      </div>
    </div>
  );
}

/** A marks stepper; the column header names it in a sheet, a label names it on a question card. */
function MarksInput({ partIndex, index, noun, small }: { partIndex: number; index: number; noun: string; small?: boolean }) {
  const { control } = useFormContext<AssignmentFormValues>();
  return (
    <Controller control={control} name={`parts.${partIndex}.questions.${index}.maxScore`}
      render={({ field, fieldState }) => (
        <NumberInput containerClassName={small ? "w-32 shrink-0" : "w-36 shrink-0"} variant={small ? "md" : undefined}
          className="text-center tabular-nums" min={0} max={1000} step={0.5}
          aria-label={`Marks for ${noun} ${index + 1}`} aria-invalid={fieldState.invalid || undefined} autoComplete="off"
          name={field.name} ref={field.ref} value={field.value} onBlur={field.onBlur}
          onChange={(event) => field.onChange(event.target.value)} />
      )} />
  );
}

/** One row of an answer sheet or a file-upload part. */
function SheetRow({ partIndex, index, kind, selected, onPick, onRemove, onRemoveAfter, onRemoveBefore }: { partIndex: number; index: number; kind: PartKind; selected: boolean; onPick: (event: MouseEvent) => void; onRemove: () => void; onRemoveAfter: () => void; onRemoveBefore: () => void }) {
  const { formState: { errors } } = useFormContext<AssignmentFormValues>();
  const error = errors.parts?.[partIndex]?.questions?.[index];
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
    <li className={`group/row cursor-default px-4 py-2 transition-colors ${selected ? "bg-primary/10 hover:bg-primary/15" : "hover:bg-muted/30"}`}
      onMouseDown={(event) => { if (event.shiftKey) event.preventDefault(); }}
      onClick={(event) => { if (!(event.target as HTMLElement).closest("button, input, [role=radio]")) onPick(event); }}>
      <div className="flex items-center gap-4">
        <span className="w-8 shrink-0 text-center text-sm font-medium tabular-nums text-muted-foreground">{index + 1}</span>
        <div className="flex min-w-0 flex-1 items-center">
          {kind === "answer_sheet" && <LetterBoxes partIndex={partIndex} questionIndex={index} />}
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

/** An online question: its text, the choices with the correct one marked, and its marks. */
function OnlineQuestion({ partIndex, index, onRemove }: { partIndex: number; index: number; onRemove: () => void }) {
  const { control, formState: { errors } } = useFormContext<AssignmentFormValues>();
  const question = useWatch({ control, name: `parts.${partIndex}.questions.${index}` });
  const error = errors.parts?.[partIndex]?.questions?.[index];
  const id = `part-${partIndex}-question-${index}`;
  const room = MAX_QUESTION_IMAGES - (question ? questionImageCount(question) : 0);
  return (
    <Card className="gap-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">Question {index + 1}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Marks</span>
          <MarksInput partIndex={partIndex} index={index} noun="question" small />
        </div>
      </div>
      <Field data-invalid={Boolean(error?.prompt) || undefined}>
        <Controller control={control} name={`parts.${partIndex}.questions.${index}.prompt`}
          render={({ field, fieldState }) => (
            <ImageTextField id={`${id}-prompt`} multiline room={room} aria-label={`Question ${index + 1} text`} placeholder="Question text, or paste an image"
              aria-invalid={fieldState.invalid || undefined} value={field.value} onChange={field.onChange} onBlur={field.onBlur} />
          )} />
        <FieldError>{error?.prompt?.message}</FieldError>
      </Field>
      <ChoicesEditor partIndex={partIndex} questionIndex={index} room={room} trailing={
        <Button type="button" variant="ghost" size="sm" className="text-destructive/80 hover:text-destructive" onClick={onRemove}>
          <IconTrash />Remove question
        </Button>} />
      <FieldError>{error?.maxScore?.message ?? error?.choices?.message ?? error?.choices?.root?.message}</FieldError>
    </Card>
  );
}

/** An online question's choices: a letter square per choice (green is correct) beside its text. */
function ChoicesEditor({ partIndex, questionIndex, room, trailing }: { partIndex: number; questionIndex: number; room: number; trailing?: ReactNode }) {
  const { control, setValue } = useFormContext<AssignmentFormValues>();
  const name = `parts.${partIndex}.questions.${questionIndex}.choices` as const;
  const { fields, append, remove } = useFieldArray({ control, name, keyName: "key" });
  const choices = useWatch({ control, name }) ?? [];

  function select(chosen: number) {
    choices.forEach((_, index) => setValue(`${name}.${index}.isCorrect`, index === chosen, { shouldDirty: true }));
  }

  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" aria-label={`Correct choice for question ${questionIndex + 1}`} className="flex flex-col gap-2">
        {fields.map((field, index) => {
          const selected = choices[index]?.isCorrect === true;
          return (
            <div key={field.key} className="group/choice flex items-center gap-2">
              <Button type="button" role="radio" aria-checked={selected} aria-label={`Choice ${letter(index)} is correct`}
                variant={selected ? "default" : "outline"} size="icon" className="shrink-0 font-semibold" onClick={() => select(index)}>
                {letter(index)}
              </Button>
              <div className="relative flex-1">
                <Controller control={control} name={`${name}.${index}.label`}
                  render={({ field: label }) => (
                    <ImageTextField room={room} placeholder={`Choice ${letter(index)}`} aria-label={`Choice ${letter(index)} text`}
                      className={`pr-9 ${selected ? "border-primary/60" : ""}`} value={label.value} onChange={label.onChange} onBlur={label.onBlur} />
                  )} />
                <Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove choice ${letter(index)}`} disabled={fields.length <= 2}
                  className={`${REMOVE_CLASS} absolute top-1/2 right-1.5 -translate-y-1/2 opacity-0 transition-opacity group-hover/choice:opacity-100 focus-visible:opacity-100`} onClick={() => remove(index)}>
                  <IconX />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-2 mt-2">
        <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" disabled={fields.length >= MAX_CHOICES}
          onClick={() => append({ label: "", isCorrect: false })}>
          <IconPlus />Add choice
        </Button>
        {trailing}
      </div>
    </div>
  );
}

/** An answer-sheet entry: one square per choice letter; the green one is the correct answer. Typing a letter picks it. */
function LetterBoxes({ partIndex, questionIndex }: { partIndex: number; questionIndex: number }) {
  const { control, setValue } = useFormContext<AssignmentFormValues>();
  const name = `parts.${partIndex}.questions.${questionIndex}.choices` as const;
  const { fields, append, remove } = useFieldArray({ control, name, keyName: "key" });
  const choices = useWatch({ control, name }) ?? [];

  function select(chosen: number) {
    choices.forEach((_, index) => setValue(`${name}.${index}.isCorrect`, index === chosen, { shouldDirty: true }));
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.metaKey || event.ctrlKey || event.altKey || event.key.length !== 1) return;
    const chosen = event.key.toUpperCase().charCodeAt(0) - 65;
    if (chosen < 0 || chosen >= fields.length) return;
    event.preventDefault();
    select(chosen);
    event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=radio]")[chosen]?.focus();
  }

  return (
    <div role="radiogroup" aria-label={`Correct choice for entry ${questionIndex + 1}`} onKeyDown={onKeyDown} className="flex items-center gap-1.5">
      {fields.map((field, index) => {
        const selected = choices[index]?.isCorrect === true;
        return (
          <div key={field.key} className="group/letter relative">
            <Button type="button" role="radio" aria-checked={selected} variant={selected ? "default" : "outline"} size="icon"
              className="font-semibold" onClick={() => select(index)}>
              {letter(index)}
            </Button>
            {fields.length > 2 && (
              <Button type="button" variant="secondary" size="icon-xs" aria-label={`Remove choice ${letter(index)}`}
                className="absolute -top-1.5 -right-1.5 size-4 rounded-full opacity-0 shadow-sm transition-opacity group-hover/letter:opacity-100 focus-visible:opacity-100 [&_svg]:size-2.5!"
                onClick={() => remove(index)}>
                <IconX />
              </Button>
            )}
          </div>
        );
      })}
      {fields.length < MAX_CHOICES && (
        <Button type="button" variant="ghost" size="icon" aria-label="Add choice"
          className="text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100"
          onClick={() => append({ label: "", isCorrect: false })}>
          <IconPlus />
        </Button>
      )}
    </div>
  );
}

/** Actions for the selected rows of an answer sheet. */
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
