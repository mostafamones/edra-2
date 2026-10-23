"use client";

import { IconAlertTriangle, IconX } from "@tabler/icons-react";

import { RichText } from "@/components/shared/assessment/images/text";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import type { Answer } from "../answering/drafts";
import type { StudentExamQuestion } from "../types";

type Props = {
  question: StudentExamQuestion;
  part: { title: string; instructions: string } | undefined;
  value: Answer;
  /** The newer acknowledged value when this device's pending answer conflicts with it. */
  conflict: Answer | undefined;
  editable: boolean;
  onChange: (value: Answer) => void;
  onResolve: (choice: "mine" | "saved") => void;
};

const letter = (index: number) => String.fromCharCode(65 + index);

/** One question: authored text and images, then choices (Question Sheet) or a text answer (Written Work). */
export function StudentExamQuestionView({ question, part, value, conflict, editable, onChange, onResolve }: Props) {
  const heading = `question-${question.id}`;
  return (
    <section aria-labelledby={heading} className="flex flex-col gap-5">
      {part?.instructions && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{part.instructions}</p>}
      <div className="flex flex-col gap-2">
        <h2 id={heading} className="sr-only">Question {question.number}</h2>
        {question.prompt && <div className="whitespace-pre-wrap leading-7"><RichText value={question.prompt} /></div>}
      </div>
      <Separator />
      {conflict && <Conflict question={question} saved={conflict} disabled={!editable} onResolve={onResolve} />}
      {question.kind === "question_sheet" ? (
        <div className="flex flex-col gap-2">
          <div role="radiogroup" aria-labelledby={heading} className="flex flex-col gap-2" onKeyDown={(event) => {
            // As in the answer-sheet editor: typing a choice letter picks it.
            if (!editable || event.metaKey || event.ctrlKey || event.altKey || event.key.length !== 1) return;
            const chosen = question.choices[event.key.toUpperCase().charCodeAt(0) - 65];
            if (!chosen) return;
            event.preventDefault();
            onChange({ choiceId: chosen.id, text: null });
            document.getElementById(`choice-key-${chosen.id}`)?.focus();
          }}>
            {question.choices.map((choice, index) => {
              const selected = value.choiceId === choice.id;
              const pick = () => { if (editable) onChange({ choiceId: choice.id, text: null }); };
              return (
                <div key={choice.id} className="flex items-start gap-2">
                  <Button type="button" role="radio" aria-checked={selected} id={`choice-key-${choice.id}`}
                    aria-labelledby={`choice-key-${choice.id} choice-text-${choice.id}`} disabled={!editable}
                    variant={selected ? "default" : "outline"} size="icon" className="shrink-0 font-semibold disabled:opacity-100" onClick={pick}>
                    {letter(index)}
                  </Button>
                  {/* The letter is the keyboard control; the text is a larger pointer target for the same choice. */}
                  <div id={`choice-text-${choice.id}`} onClick={(event) => { if (!(event.target as HTMLElement).closest("[data-image-id]")) pick(); }}
                    className={cn("min-h-9 flex-1 rounded-md border px-3 py-1.5 text-sm leading-6 whitespace-pre-wrap transition-colors",
                      editable && "cursor-pointer hover:bg-muted/50", selected && "border-primary/60 bg-primary/5")}>
                    <RichText value={choice.label} />
                  </div>
                </div>
              );
            })}
          </div>
          {value.choiceId && editable && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ choiceId: null, text: null })}
              className="self-end text-destructive hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20">
              <IconX aria-hidden="true" />Clear answer
            </Button>
          )}
        </div>
      ) : (
        <Textarea value={value.text ?? ""} disabled={!editable} maxLength={10_000} rows={10} aria-labelledby={heading}
          onChange={(event) => onChange({ choiceId: null, text: event.target.value })} />
      )}
    </section>
  );
}

function Conflict({ question, saved, disabled, onResolve }: {
  question: StudentExamQuestion; saved: Answer; disabled: boolean; onResolve: (choice: "mine" | "saved") => void;
}) {
  const index = question.choices.findIndex((choice) => choice.id === saved.choiceId);
  const savedText = question.kind === "written_work" ? saved.text : index >= 0 ? `Choice ${letter(index)}` : null;
  return (
    <Alert>
      <IconAlertTriangle aria-hidden="true" />
      <AlertTitle>This answer was changed in another tab or device</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <span className="line-clamp-4 whitespace-pre-wrap">Saved answer: {savedText ?? "No answer"}</span>
        <span className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onResolve("mine")}>Keep my answer</Button>
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onResolve("saved")}>Use saved answer</Button>
        </span>
      </AlertDescription>
    </Alert>
  );
}
