"use client";

import { IconX } from "@tabler/icons-react";

import { Segmented } from "@/components/shared/segmented";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { MarkFocus } from "../focus";
import type { Assignment } from "../types";

const ANY = "any";
const encode = (focus: Pick<MarkFocus, "kind" | "id">) => `${focus.kind}:${focus.id}`;

/**
 * Narrows the student list to one part or question, then to the students who lost marks on it or got
 * full marks. Selecting a bar in the marks chart sets it too.
 */
export function FocusFilter({ assignment, focus, onChange }: { assignment: Assignment; focus: MarkFocus | null; onChange: (focus: MarkFocus | null) => void }) {
  function pick(value: string) {
    if (value === ANY) { onChange(null); return; }
    const [kind, id] = value.split(":") as [MarkFocus["kind"], string];
    onChange({ kind, id, outcome: focus?.outcome ?? "lost" });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={focus ? encode(focus) : ANY} onValueChange={pick}>
        <SelectTrigger aria-label="Part or question" className="w-48"><SelectValue /></SelectTrigger>
        <SelectContent position="popper" className="max-h-80">
          <SelectItem value={ANY}>Any part or question</SelectItem>
          {assignment.parts.map((part) => (
            <SelectGroup key={part.id}>
              <SelectSeparator />
              <SelectLabel>{part.position}. {part.title}</SelectLabel>
              <SelectItem value={encode({ kind: "part", id: part.id })}>Whole part</SelectItem>
              {part.questions.map((question) => (
                <SelectItem key={question.id} value={encode({ kind: "question", id: question.id })}>
                  Question {part.position}.{question.position}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      {focus && (
        <>
          <Segmented label="Outcome" value={focus.outcome} onChange={(outcome) => onChange({ ...focus, outcome })}
            options={[{ value: "lost", label: "Lost marks" }, { value: "full", label: "Full marks" }]} />
          <Button variant="ghost" size="icon-sm" aria-label="Clear part or question filter" onClick={() => onChange(null)}><IconX /></Button>
        </>
      )}
    </div>
  );
}
