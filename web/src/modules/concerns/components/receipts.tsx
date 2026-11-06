import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import type { ConcernParticipant } from "../validation";

export function ConcernReceipts({ participants, avatarUrls }: { participants: ConcernParticipant[]; avatarUrls: Record<string, string> }) {
  if (!participants.length) return null;
  return <div className="mt-1 flex flex-wrap justify-end -space-x-1" aria-label="Read receipts">{participants.map((participant) => <Popover key={participant.userId}>
    <PopoverTrigger asChild><Button variant="ghost" size="icon-xs" className="size-4 rounded-full p-0" aria-label={`Read by ${participant.name ?? "Staff"}`}><Avatar className="size-3.5 ring-1 ring-background"><AvatarImage src={avatarUrls[participant.avatarPath ?? ""]} alt="" /><AvatarFallback className="text-[7px]">{(participant.name ?? "Staff").slice(0, 1)}</AvatarFallback></Avatar></Button></PopoverTrigger>
    <PopoverContent className="w-auto max-w-72 space-y-1"><p className="font-medium break-words" dir="auto">{participant.name ?? "Staff"}</p>{participant.readAt && <time className="text-xs text-muted-foreground" dateTime={participant.readAt}>{new Date(participant.readAt).toLocaleString()}</time>}</PopoverContent>
  </Popover>)}</div>;
}
