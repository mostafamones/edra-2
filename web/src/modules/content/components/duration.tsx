"use client";

import { useState } from "react";
import { SettingsRow } from "@/components/shared/settings-row";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const PRESETS = [7, 14, 30];

export function AccessDuration({ value, onChange, disabled }: { value: number; onChange: (days: number) => void; disabled: boolean }) {
  const [custom, setCustom] = useState(!PRESETS.includes(value));
  return <SettingsRow id="content-access-duration" title="Access duration">
    <div className="flex items-center gap-2">
      {custom && <Input aria-label="Access duration (days)" type="number" className="h-8 w-24 tabular-nums" min={1} max={2147483647} step={1} value={Number.isNaN(value) ? "" : value} disabled={disabled} onChange={event => onChange(event.target.valueAsNumber)} />}
      <Select disabled={disabled} value={custom ? "custom" : String(value)} onValueChange={choice => { setCustom(choice === "custom"); if (choice !== "custom") onChange(Number(choice)); }}><SelectTrigger id="content-access-duration" size="sm" className="w-32"><SelectValue /></SelectTrigger><SelectContent>{PRESETS.map(days => <SelectItem key={days} value={String(days)}>{days} days</SelectItem>)}<SelectItem value="custom">Custom</SelectItem></SelectContent></Select>
    </div>
  </SettingsRow>;
}
