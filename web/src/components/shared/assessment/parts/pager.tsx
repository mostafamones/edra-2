"use client";

import { Fragment, useState } from "react";
import { Controller, useFormContext, useWatch, type FieldValues } from "react-hook-form";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { IconChevronDown, IconChevronLeft, IconChevronRight, IconChevronUp, IconPlus, IconTrash } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Field, FieldError } from "@/components/ui/field";
import { StepPanel } from "../steps";
import { ChoicesEditor } from "./choices";
import type { EditorQuestion, KindSpec, PartsConfig } from "./config";
import { MarksInput } from "./marks";
import { PlainTextField } from "./text";

type QuestionErrors = { prompt?: { message?: string }; maxScore?: { message?: string }; choices?: { message?: string; root?: { message?: string } } } | undefined;

/** Question numbers shown while the number list is collapsed: a window around the open question. */
const WINDOW = 12;

type Props = {
  config: PartsConfig;
  partIndex: number;
  kind: KindSpec;
  keys: string[];
  readOnly: boolean;
  onAdd: () => void;
  onRemove: (index: number) => void;
};

/** Questions one card at a time: numbered jumps above, back and next below. */
export function QuestionPager({ config, partIndex, kind, keys, readOnly, onAdd, onRemove }: Props) {
  const { control, formState: { errors } } = useFormContext<FieldValues>();
  const questions = (useWatch({ control, name: `parts.${partIndex}.questions` }) ?? []) as EditorQuestion[];
  const [selected, setSelected] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [expanded, setExpanded] = useState(false);
  const reduce = useReducedMotion();
  // The count can shrink from the advanced settings; stay on the last remaining question.
  const current = Math.min(selected, keys.length - 1);
  const last = current === keys.length - 1;
  const partErrors = (errors.parts as { questions?: QuestionErrors[] }[] | undefined)?.[partIndex]?.questions;
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
              const error = partErrors?.[index];
              const issues = [...new Set([
                error?.prompt?.message, error?.maxScore?.message, error?.choices?.message ?? error?.choices?.root?.message,
                ...(question ? config.questionIssues(question, kind) : []),
              ].filter((issue): issue is string => Boolean(issue)))];
              const flagged = issues.length > 0;
              const button = (
                <Button type="button" size="icon-sm" variant={index === current ? "default" : "outline"} aria-current={index === current ? "step" : undefined}
                  aria-label={`Question ${index + 1}${flagged ? `, unfinished: ${issues.join(" ")}` : ""}`} className="relative tabular-nums" onClick={() => open(index)}>
                  {index + 1}
                  {flagged && index !== current && <span aria-hidden="true" className="absolute top-1 right-1 size-1.5 rounded-full bg-destructive" />}
                </Button>
              );
              return flagged ? (
                <Tooltip key={keys[index]} delayDuration={500}>
                  <TooltipTrigger asChild>{button}</TooltipTrigger>
                  <TooltipContent className="max-w-64">
                    <ul className="flex flex-col gap-0.5">{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
                  </TooltipContent>
                </Tooltip>
              ) : <Fragment key={keys[index]}>{button}</Fragment>;
            })}
            {!readOnly && keys.length < config.maxQuestions && (expanded || visible.at(-1) === keys.length - 1) && (
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
        <StepPanel stepKey={String(current)} direction={direction}>
          <QuestionCard config={config} kind={kind} partIndex={partIndex} index={current} readOnly={readOnly} onRemove={() => onRemove(current)} />
        </StepPanel>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="outline" size="sm" disabled={current === 0} onClick={() => open(current - 1)}><IconChevronLeft />Previous</Button>
        <span className="text-sm text-muted-foreground tabular-nums">{current + 1} / {keys.length}</span>
        {last && !readOnly ? (
          <Button type="button" variant="outline" size="sm" disabled={keys.length >= config.maxQuestions} onClick={() => { onAdd(); open(keys.length); }}><IconPlus />Add question</Button>
        ) : (
          <Button type="button" variant="outline" size="sm" disabled={last} onClick={() => open(current + 1)}>Next<IconChevronRight /></Button>
        )}
      </div>
    </div>
  );
}

/** A question: its text, the choices with the correct one marked (when its type has them), and its marks. */
function QuestionCard({ config, kind, partIndex, index, readOnly, onRemove }: { config: PartsConfig; kind: KindSpec; partIndex: number; index: number; readOnly: boolean; onRemove: () => void }) {
  const { control, formState: { errors } } = useFormContext<FieldValues>();
  const path = `parts.${partIndex}.questions.${index}`;
  const question = useWatch({ control, name: path }) as EditorQuestion | undefined;
  const error = (errors.parts as { questions?: { prompt?: { message?: string }; maxScore?: { message?: string }; choices?: { message?: string; root?: { message?: string } } }[] }[] | undefined)?.[partIndex]?.questions?.[index];
  const id = `part-${partIndex}-question-${index}`;
  const room = question ? config.imageRoom?.(question) ?? 0 : 0;
  const Text = config.TextField ?? PlainTextField;
  const remove = !readOnly && (
    <Button type="button" variant="ghost" size="sm" className="text-destructive/80 hover:text-destructive" onClick={onRemove}>
      <IconTrash />Remove question
    </Button>
  );
  return (
    <Card className="gap-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">Question {index + 1}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Marks</span>
          <MarksInput partIndex={partIndex} index={index} noun="question" small disabled={readOnly} />
        </div>
      </div>
      <Field data-invalid={Boolean(error?.prompt) || undefined}>
        <Controller control={control} name={`${path}.prompt`}
          render={({ field, fieldState }) => (
            <Text id={`${id}-prompt`} multiline room={room} readOnly={readOnly} aria-label={`Question ${index + 1} text`} placeholder={config.promptPlaceholder}
              aria-invalid={fieldState.invalid || undefined} value={field.value} onChange={field.onChange} onBlur={field.onBlur} />
          )} />
        <FieldError>{error?.prompt?.message}</FieldError>
      </Field>
      {kind.choices
        ? <ChoicesEditor config={config} partIndex={partIndex} questionIndex={index} room={room} readOnly={readOnly} trailing={remove || undefined} />
        : remove && <div className="flex justify-end">{remove}</div>}
      <FieldError>{error?.maxScore?.message ?? error?.choices?.message ?? error?.choices?.root?.message}</FieldError>
    </Card>
  );
}
