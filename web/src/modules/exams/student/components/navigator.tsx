"use client";

import { IconFlagFilled } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { StudentExamQuestion } from "../types";

type Props = {
  /** Answerable questions only; excluded ones are skipped and nothing is renumbered. */
  questions: StudentExamQuestion[];
  currentId: string | null;
  disabled?: boolean;
  answered: (questionId: string) => boolean;
  conflicts: ReadonlySet<string>;
  flagged: ReadonlySet<string>;
  onSelect: (questionId: string) => void;
};

/** Numbered question navigator: current, answered, unanswered and flagged at a glance; any question can be revisited. */
export function StudentExamNavigator({ questions, currentId, answered, conflicts, flagged, onSelect, disabled }: Props) {
  return (
    <nav aria-label="Questions">
      <ol className="grid grid-cols-5 gap-2">
        {questions.map((question) => {
          const current = question.id === currentId;
          const done = answered(question.id);
          const flag = flagged.has(question.id);
          const state = conflicts.has(question.id) ? "changed elsewhere" : done ? "answered" : "unanswered";
          return (
            <li key={question.id}>
              <Button disabled={disabled} type="button" size="sm" variant={current ? "default" : done ? "secondary" : "outline"}
                aria-current={current ? "step" : undefined} aria-label={`Question ${question.number}, ${state}${flag ? ", flagged" : ""}`}
                className={cn("relative w-full tabular-nums", !done && !current && "border-dashed", conflicts.has(question.id) && "ring-2 ring-amber-500")}
                onClick={() => onSelect(question.id)}>
                {question.number}
                {flag && <IconFlagFilled className="absolute -top-1 -right-1 size-3.5! text-amber-500" aria-hidden="true" />}
              </Button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
