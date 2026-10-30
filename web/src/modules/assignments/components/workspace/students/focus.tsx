"use client";

import { IconCheck, IconSlash, IconX } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { MarkFocus } from "../../../focus";

const OUTCOMES = [
  { value: "lost", label: "Lost marks", Icon: IconX, color: "text-destructive hover:text-destructive" },
  { value: "unmarked", label: "Unmarked", Icon: IconSlash, color: "text-muted-foreground hover:text-foreground" },
  { value: "full", label: "Full marks", Icon: IconCheck, color: "text-emerald-600 hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-400" },
] as const;

/** Outcome controls for the part or question selected from the graph. */
export function FocusFilter({ focus, onChange }: { focus: MarkFocus; onChange: (focus: MarkFocus) => void }) {
  return (
    <ButtonGroup aria-label="Marks on selected part or question" className="shrink-0">
      {OUTCOMES.map(({ value, label, Icon, color }) => (
        <Tooltip key={value}>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={label} aria-pressed={focus.outcome === value}
              className={`w-11 aria-pressed:bg-muted ${color}`}
              onClick={() => onChange({ ...focus, outcome: value })}><Icon className="size-5" /></Button>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      ))}
    </ButtonGroup>
  );
}
