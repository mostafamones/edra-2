"use client";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { SettingsRow } from "@/components/shared/settings-row";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { saveTimeFormat } from "../preference-actions";
import { timeFormatKey, useTimeFormat } from "../preferences";

export function DisplaySettings() {
  const preference = useTimeFormat(), client = useQueryClient();
  const [pending, setPending] = useState(false), [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  async function change(value: string) {
    if (busy.current || !preference.userId) return;
    busy.current = true; setPending(true); setError(null);
    try {
      const result = await saveTimeFormat(value);
      if (!result.ok) { setError(result.message); return; }
      client.setQueryData(timeFormatKey(result.userId), result.format);
    } catch { setError("Couldn’t save your time format. Try again."); }
    finally { busy.current = false; setPending(false); }
  }
  return <div>
    <SettingsRow id="time-format" title="Time format">
      <Select value={preference.format} onValueChange={value => void change(value)} disabled={pending || preference.isPending || preference.isError}>
        <SelectTrigger id="time-format" aria-label="Time format" className="w-40"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="12h">12-hour (AM/PM)</SelectItem><SelectItem value="24h">24-hour</SelectItem></SelectContent>
      </Select>
    </SettingsRow>
    {(error || preference.isError) && <div role="alert" className="flex flex-wrap items-center gap-2 px-6 pb-4 text-sm text-destructive">{error ?? "Couldn’t load your time format."}{preference.isError && <Button size="sm" variant="outline" onClick={() => void preference.refetch()}>Retry</Button>}</div>}
  </div>;
}
