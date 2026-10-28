"use client";

import { useState } from "react";
import { Bug01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { browserOperations } from "../browser";
import { FAILURE_CHANGE_EVENT, FAILURE_KINDS, isWrite, type FailureKind, type FailureMode, type FailureStatus } from "../shared";

async function operations(page?: string): Promise<string[]> {
  const response = await fetch(`/api/development/failures${page ? `?page=${encodeURIComponent(page)}` : ""}`, { cache: "no-store" });
  if (!response.ok) return [];
  return ((await response.json()) as FailureStatus).operations;
}

/** Developer mode control that arms a failure for an operation observed on this page or elsewhere. */
export function FailurePanel() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FailureKind>("network");
  const [mode, setMode] = useState<FailureMode>("once");
  const [catalog, setCatalog] = useState<{ here: string[]; elsewhere: string[] } | null>(null);

  async function load() {
    setCatalog(null);
    const page = window.location.pathname;
    const [server, all] = await Promise.all([operations(page), operations()]);
    const here = [...new Set([...server, ...browserOperations(page)])].sort();
    setCatalog({ here, elsewhere: all.filter((operation) => !here.includes(operation)) });
  }

  async function arm(operation: string) {
    const response = await fetch("/api/development/failures", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", cache: "no-store",
      body: JSON.stringify({ action: "arm", operation, kind, mode }),
    }).catch(() => null);
    if (!response?.ok) {
      toast.error("Couldn't arm the failure.");
      return;
    }
    window.dispatchEvent(new Event(FAILURE_CHANGE_EVENT));
    setOpen(false);
  }

  const item = (operation: string) => (
    <CommandItem key={operation} value={operation} disabled={kind === "conflict" && !isWrite(operation)} onSelect={() => void arm(operation)}>
      <span className="truncate font-mono text-xs">{operation}</span>
    </CommandItem>
  );

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) void load(); }}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost"><HugeiconsIcon icon={Bug01Icon} strokeWidth={1.5} />Failures</Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 max-w-[calc(100vw-1rem)] gap-2 p-2">
        <div className="grid grid-cols-2 gap-2">
          <Select value={kind} onValueChange={(value) => setKind(value as FailureKind)}>
            <SelectTrigger size="sm" aria-label="Failure" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(FAILURE_KINDS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={mode} onValueChange={(value) => setMode(value as FailureMode)}>
            <SelectTrigger size="sm" aria-label="Repeat" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="once">Next request</SelectItem>
              <SelectItem value="persistent">Every request</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Command className="rounded-md border">
          <CommandInput placeholder="Search operations" />
          <CommandList>
            <CommandEmpty>{!catalog ? "Loading…" : "No operations recorded"}</CommandEmpty>
            {catalog && catalog.here.length > 0 && <CommandGroup heading="This page">{catalog.here.map(item)}</CommandGroup>}
            {catalog && catalog.elsewhere.length > 0 && <CommandGroup heading="Other pages">{catalog.elsewhere.map(item)}</CommandGroup>}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
