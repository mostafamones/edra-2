import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import type { ConcernParticipant } from "../validation";

export function ConcernReceipts({ participants, avatarUrls }: { participants: ConcernParticipant[]; avatarUrls: Record<string, string> }) {
  if (!participants.length) return null;
  const shown = participants.slice(0, 3);
  const rest = participants.slice(3);
  return <div className="flex flex-col items-center -space-y-1" aria-label="Read receipts">{shown.map((participant) => <Popover key={participant.userId}>
    <PopoverTrigger asChild><Button variant="ghost" size="icon-xs" className="size-4 rounded-full p-0" aria-label={`Read by ${participant.name ?? "Staff"}`}><Avatar className="size-3.5 ring-1 ring-background"><AvatarImage src={avatarUrls[participant.avatarPath ?? ""]} alt="" /><AvatarFallback className="text-[7px]">{(participant.name ?? "Staff").slice(0, 1)}</AvatarFallback></Avatar></Button></PopoverTrigger>
    <PopoverContent className="w-auto max-w-72 space-y-1"><p className="font-medium break-words" dir="auto">{participant.name ?? "Staff"}</p>{participant.readAt && <time className="text-xs text-muted-foreground" dateTime={participant.readAt}>{new Date(participant.readAt).toLocaleString()}</time>}</PopoverContent>
  </Popover>)}
    {rest.length > 0 && <Popover><PopoverTrigger asChild><Button variant="ghost" size="icon-xs" className="mt-0.5 size-4 rounded-full p-0 text-[9px] tabular-nums text-muted-foreground" aria-label={`Read by ${rest.length} more`}>+{rest.length}</Button></PopoverTrigger>
      <PopoverContent className="w-auto max-w-72 space-y-1">{rest.map((participant) => <p key={participant.userId} className="text-sm break-words" dir="auto">{participant.name ?? "Staff"}</p>)}</PopoverContent></Popover>}
  </div>;
}
