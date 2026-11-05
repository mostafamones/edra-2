import { AtIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

export type MentionChoice = { userId: string; name: string | null };
export function ConcernMentions({ participants, onSelect, disabled }: { participants: MentionChoice[]; onSelect: (participant: MentionChoice) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button type="button" size="sm" variant="ghost" disabled={disabled} aria-label="Mention participant"><HugeiconsIcon icon={AtIcon} strokeWidth={1.5} aria-hidden="true" /></Button></PopoverTrigger>
    <PopoverContent className="p-0" side="top" align="start"><Command label="Find participant"><CommandInput aria-label="Find participant" /><CommandList><CommandEmpty>No matching participants</CommandEmpty>
      {participants.map((participant) => <CommandItem key={participant.userId} value={`${participant.name ?? "Staff"} ${participant.userId}`} onSelect={() => { onSelect(participant); setOpen(false); }}>{participant.name ?? "Staff"}</CommandItem>)}
    </CommandList></Command></PopoverContent>
  </Popover>;
}

export function mentionIds(body: string, selected: MentionChoice[]) {
  return selected.filter((participant) => body.includes(`@${participant.name ?? "Staff"}`)).map((participant) => participant.userId);
}
