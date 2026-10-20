"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { StudentExamQuestion } from "../types";

type Props = {
  /** Answerable questions only; excluded ones are skipped and nothing is renumbered. */
  questions: StudentExamQuestion[];
  currentId: string | null;
  answered: (questionId: string) => boolean;
  conflicts: ReadonlySet<string>;
  onSelect: (questionId: string) => void;
};

/** Numbered question navigator: current, answered and unanswered at a glance; any question can be revisited. */
export function StudentExamNavigator({ questions, currentId, answered, conflicts, onSelect }: Props) {
  return (
    <nav aria-label="Questions">
      <ol className="grid grid-cols-5 gap-2">
        {questions.map((question) => {
          const current = question.id === currentId;
          const done = answered(question.id);
          const state = conflicts.has(question.id) ? "changed elsewhere" : done ? "answered" : "unanswered";
          return (
            <li key={question.id}>
              <Button type="button" size="sm" variant={current ? "default" : done ? "secondary" : "outline"}
                aria-current={current ? "step" : undefined} aria-label={`Question ${question.number}, ${state}`}
                className={cn("relative w-full tabular-nums", conflicts.has(question.id) && "ring-2 ring-amber-500")}
                onClick={() => onSelect(question.id)}>
                {question.number}
              </Button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
