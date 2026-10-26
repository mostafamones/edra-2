"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandItem, CommandShortcut } from "@/components/ui/command";
import { searchScore } from "@/lib/search";

type Props = {
  label: string; value: string; selectedLabel?: string;
  choices: { id: string; label: string; count: number }[];
  onSelect: (id: string) => void; onDone: () => void;
};

export function AudienceFilterPicker({ label, value, selectedLabel, choices, onSelect, onDone }: Props) {
  const [open, setOpen] = useState(false), [search, setSearch] = useState("");
  const visible = choices.filter(choice => searchScore(choice.label, search) !== null);
  function choose(id: string) { onSelect(id); setOpen(false); }
  return <Popover open={open} onOpenChange={next => { setOpen(next); if (next) setSearch(""); }}>
    <PopoverTrigger asChild>
      <Button type="button" variant={value ? "secondary" : "outline"} size="sm" aria-label={`Filter ${label.toLowerCase()}${selectedLabel ? `: ${selectedLabel}` : ""}`}
        className="h-7 max-w-52 gap-1.5 rounded-lg px-2 text-xs font-normal shadow-none">
        <span className="truncate">{selectedLabel ?? label}</span><HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={1.5} className="size-3 text-muted-foreground" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" aria-label={`${label} filter`} className="w-80 max-w-[calc(100vw-2rem)] gap-0 p-0" onCloseAutoFocus={event => { event.preventDefault(); onDone(); }} onEscapeKeyDown={event => event.stopPropagation()}>
      <Command shouldFilter={false} label={`Filter ${label.toLowerCase()}`} onKeyDown={event => event.stopPropagation()}>
        <CommandInput value={search} onValueChange={setSearch} placeholder={`Search ${label.toLowerCase()}s`} maxLength={100} />
        <CommandList className="max-h-64 p-1">
          {!search.trim() && <CommandItem value="all" onSelect={() => choose("")} data-checked={!value}>All {label.toLowerCase()}s</CommandItem>}
          {visible.map(choice => <CommandItem key={choice.id} value={choice.id} onSelect={() => choose(choice.id)} data-checked={value === choice.id} className="min-h-10 gap-3">
            <span dir="auto" className="min-w-0 flex-1">{choice.label}</span>
            <CommandShortcut className="tracking-normal" aria-label={`${choice.count} schedules`}>{choice.count}</CommandShortcut>
          </CommandItem>)}
          {!visible.length && <p role="status" className="py-6 text-center text-sm text-muted-foreground">No matching audiences</p>}
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>;
}
