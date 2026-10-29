"use client";

import { useRef } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { MinusSignIcon, PlusSignIcon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Props = { id: string; value: string; onChange: (value: string) => void; onBlur: () => void; disabled: boolean; invalid: boolean };

export function AssessmentTimer({ id, value, onChange, onBlur, disabled, invalid }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const minutes = Number(value);
  const valid = value.trim() !== "" && Number.isInteger(minutes) && minutes >= 1 && minutes <= 600;
  const step = (direction: 1 | -1, shift: boolean) => {
    const current = Number.isInteger(minutes) ? minutes : 0;
    onChange(String(Math.min(600, Math.max(1, current + direction * (shift ? 5 : 30)))));
    input.current?.focus({ preventScroll: true });
  };

  return (
    <ButtonGroup className="w-full" aria-label="Timer controls">
      <Tooltip delayDuration={500}>
        <TooltipTrigger asChild>
          <Button type="button" variant="outline" size="icon" aria-label="Decrease timer" disabled={disabled || minutes <= 1}
            onClick={(event) => step(-1, event.shiftKey)}>
            <HugeiconsIcon icon={MinusSignIcon} strokeWidth={1.5} aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Decrease by 30 minutes (Shift: 5)</TooltipContent>
      </Tooltip>
      <InputGroup className="min-w-0 flex-1">
        <InputGroupInput ref={input} id={id} type="text" role="spinbutton" inputMode="numeric" autoComplete="off"
          className="text-center tabular-nums" value={value} onChange={(event) => onChange(event.target.value)} onBlur={onBlur}
          disabled={disabled} aria-invalid={invalid || undefined} aria-valuemin={1} aria-valuemax={600} aria-valuenow={valid ? minutes : undefined}
          onFocus={(event) => event.currentTarget.select()}
          onKeyDown={(event) => {
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
            event.preventDefault();
            step(event.key === "ArrowUp" ? 1 : -1, event.shiftKey);
          }} />
        <InputGroupAddon align="inline-end"><InputGroupText>minutes</InputGroupText></InputGroupAddon>
      </InputGroup>
      <Tooltip delayDuration={500}>
        <TooltipTrigger asChild>
          <Button type="button" variant="outline" size="icon" aria-label="Increase timer" disabled={disabled || minutes >= 600}
            onClick={(event) => step(1, event.shiftKey)}>
            <HugeiconsIcon icon={PlusSignIcon} strokeWidth={1.5} aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Increase by 30 minutes (Shift: 5)</TooltipContent>
      </Tooltip>
    </ButtonGroup>
  );
}
