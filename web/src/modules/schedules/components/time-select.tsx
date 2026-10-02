"use client";

import { useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "cn";

import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatTime, parseTimeInput } from "../time";

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  disabled?: boolean;
  "aria-describedby"?: string;
};

const HOURS = Array.from({ length: 12 }, (_, index) => index + 1);
const MINUTE_STEPS = Array.from({ length: 12 }, (_, index) => index * 5);

function parse(value: string) {
  if (!value) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return { hour: hours % 12 || 12, minute: minutes, pm: hours >= 12 };
}

function toValue(hour: number, minute: number, pm: boolean) {
  const hours = (hour % 12) + (pm ? 12 : 0);
  return `${String(hours).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function Column({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="listbox" aria-label={label} className="flex max-h-56 w-14 flex-col gap-0.5 overflow-y-auto p-1">
      {children}
    </div>
  );
}

function Option({ selected, onSelect, children }: { selected: boolean; onSelect: () => void; children: React.ReactNode }) {
  return (
    <Button type="button" role="option" aria-selected={selected} size="sm" variant={selected ? "default" : "ghost"}
      className={cn("w-full justify-center px-0 tabular-nums")} onClick={onSelect}
      ref={(node) => { if (selected) node?.scrollIntoView({ block: "center" }); }}>
      {children}
    </Button>
  );
}

/** A time field you can type into ("4:30 pm", "1630") or fill from the picker; stores "HH:mm". */
export function TimeSelect({ id, value, onChange, invalid, disabled, ...props }: Props) {
  const [open, setOpen] = useState(false);
  // While typing, `draft` holds the raw text; otherwise the field shows the saved value.
  const [draft, setDraft] = useState<string | null>(null);
  const current = parse(value);
  // Keep a saved off-grid minute (e.g. 16:07) selectable next to the five-minute steps.
  const minutes = current && !MINUTE_STEPS.includes(current.minute)
    ? [...MINUTE_STEPS, current.minute].sort((a, b) => a - b) : MINUTE_STEPS;
  const pick = (patch: Partial<NonNullable<typeof current>>) => {
    const next = { hour: 12, minute: 0, pm: false, ...current, ...patch };
    onChange(toValue(next.hour, next.minute, next.pm));
  };

  function commit() {
    if (draft === null) return;
    if (draft.trim() === "") onChange("");
    else {
      const parsed = parseTimeInput(draft);
      if (parsed) onChange(parsed);
    }
    setDraft(null);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <InputGroup>
          <InputGroupInput
            id={id}
            inputMode="text"
            autoComplete="off"
            placeholder="e.g. 4:30 PM"
            disabled={disabled}
            value={draft ?? (value ? formatTime(value) : "")}
            aria-invalid={invalid || undefined}
            aria-describedby={props["aria-describedby"]}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commit(); } }}
          />
          <InputGroupAddon align="inline-end">
            <PopoverTrigger asChild>
              <InputGroupButton size="icon-xs" aria-label="Pick a time" disabled={disabled} onClick={() => setDraft(null)}>
                <Clock />
              </InputGroupButton>
            </PopoverTrigger>
          </InputGroupAddon>
        </InputGroup>
      </PopoverAnchor>
      <PopoverContent align="end" className="w-auto flex-row gap-0 p-1">
        <Column label="Hour">
          {HOURS.map((hour) => <Option key={hour} selected={current?.hour === hour} onSelect={() => pick({ hour })}>{hour}</Option>)}
        </Column>
        <Column label="Minute">
          {minutes.map((minute) => (
            <Option key={minute} selected={current?.minute === minute} onSelect={() => pick({ minute })}>{String(minute).padStart(2, "0")}</Option>
          ))}
        </Column>
        <Column label="AM or PM">
          {["AM", "PM"].map((label) => (
            <Option key={label} selected={current ? current.pm === (label === "PM") : false} onSelect={() => pick({ pm: label === "PM" })}>{label}</Option>
          ))}
        </Column>
      </PopoverContent>
    </Popover>
  );
}
