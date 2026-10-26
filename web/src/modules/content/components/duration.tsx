"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { MinusSignIcon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { Field, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const PRESETS = [7, 14, 30];

export function AccessDuration({ value, onChange, disabled }: { value: number; onChange: (days: number) => void; disabled: boolean }) {
  const [custom, setCustom] = useState(!PRESETS.includes(value));
  const step = (delta: number) => onChange(Math.max(1, (Number.isNaN(value) ? 0 : value) + delta));
  return <Field><FieldLabel htmlFor="content-access-duration">Duration</FieldLabel>
    <div className="flex gap-2">
      <Select disabled={disabled} value={custom ? "custom" : String(value)} onValueChange={choice => { setCustom(choice === "custom"); if (choice !== "custom") onChange(Number(choice)); }}><SelectTrigger id="content-access-duration" className="min-w-0 flex-1"><SelectValue /></SelectTrigger><SelectContent>{PRESETS.map(days => <SelectItem key={days} value={String(days)}>{days} days</SelectItem>)}<SelectItem value="custom">Custom</SelectItem></SelectContent></Select>
      {custom && <InputGroup className="w-32">
        <InputGroupAddon><InputGroupButton size="icon-xs" aria-label="Fewer days" disabled={disabled || value <= 1} onClick={() => step(-1)}><HugeiconsIcon icon={MinusSignIcon} strokeWidth={1.5} /></InputGroupButton></InputGroupAddon>
        <InputGroupInput aria-label="Days" type="number" min={1} max={2147483647} step={1} className="text-center tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" value={Number.isNaN(value) ? "" : value} disabled={disabled} onChange={event => onChange(event.target.valueAsNumber)} />
        <InputGroupAddon align="inline-end"><InputGroupButton size="icon-xs" aria-label="More days" disabled={disabled} onClick={() => step(1)}><HugeiconsIcon icon={PlusSignIcon} strokeWidth={1.5} /></InputGroupButton></InputGroupAddon>
      </InputGroup>}
    </div>
  </Field>;
}
