"use client";

import { useState } from "react";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const PRESETS = [7, 14, 30];

export function AccessDuration({ value, onChange, disabled }: { value: number; onChange: (days: number) => void; disabled: boolean }) {
  const [custom, setCustom] = useState(!PRESETS.includes(value));
  return <div className="space-y-3">
    <Field><FieldLabel htmlFor="content-access-duration">Access duration</FieldLabel><Select disabled={disabled} value={custom ? "custom" : String(value)} onValueChange={choice => { setCustom(choice === "custom"); if (choice !== "custom") onChange(Number(choice)); }}><SelectTrigger id="content-access-duration" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{PRESETS.map(days => <SelectItem key={days} value={String(days)}>{days} days</SelectItem>)}<SelectItem value="custom">Custom</SelectItem></SelectContent></Select></Field>
    {custom && <Field><FieldLabel htmlFor="content-access-days">Access duration (days)</FieldLabel><Input id="content-access-days" type="number" min={1} max={2147483647} step={1} value={Number.isNaN(value) ? "" : value} disabled={disabled} onChange={event => onChange(event.target.valueAsNumber)} /></Field>}
  </div>;
}
