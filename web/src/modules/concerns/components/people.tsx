import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { UserAdd01Icon, UserRemove01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { accountName } from "@/modules/account/browser";
import { fetchTeamMembers, staffQueryKeys } from "@/modules/staff";
import type { useConcernLifecycle } from "../commands";
import type { ConcernScope } from "../queries";
import type { ConcernDetail, ConcernParticipant } from "../validation";
import { ConcernFeedback } from "./feedback";
import { ConcernIconButton } from "./icon-button";
import { useConcernAttempt } from "./use-attempt";

/** Current participants. Participating leadership adds or removes staff while the concern is ongoing. */
export function ConcernPeople({ scope, detail, lifecycle }: {
  scope: ConcernScope; detail: ConcernDetail; lifecycle: ReturnType<typeof useConcernLifecycle>;
}) {
  const manage = detail.canManage && detail.status === "ongoing";
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState<ConcernParticipant | null>(null);
  const attempt = useConcernAttempt();
  // The complete paginated staff catalog; suspended staff cannot be added.
  const members = useQuery({ queryKey: staffQueryKeys.members(scope.userId, scope.academyId), queryFn: ({ signal }) => fetchTeamMembers(scope.academyId, signal), staleTime: 5 * 60_000, enabled: manage });
  const current = new Set(detail.participants.map((participant) => participant.userId));
  const candidates = (members.data ?? []).filter((member) => !member.suspended_at && !current.has(member.user_id));
  return <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
    {manage && <div className="flex items-center justify-end gap-2 px-4 py-2">
      <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button type="button" size="sm" variant="outline" disabled={attempt.pending || attempt.uncertain}>
        <HugeiconsIcon icon={UserAdd01Icon} strokeWidth={1.5} aria-hidden="true" />Add people</Button></PopoverTrigger>
        <PopoverContent className="p-0" align="end">
          {members.isLoading ? <ConcernFeedback>Loading staff…</ConcernFeedback>
            : members.isError ? <ConcernFeedback retry={() => void members.refetch()}>Could not load staff</ConcernFeedback>
            : <Command label="Find staff"><CommandInput aria-label="Find staff" /><CommandList><CommandEmpty>No staff to add</CommandEmpty>
              {candidates.map((member) => <CommandItem key={member.user_id} value={`${accountName(member.profiles) ?? "Staff"} ${member.user_id}`}
                onSelect={() => { setOpen(false); void attempt.run((requestId) => lifecycle.add([member.user_id], requestId)); }}>
                <span className="break-words" dir="auto">{accountName(member.profiles) ?? "Staff"}</span></CommandItem>)}
            </CommandList></Command>}
        </PopoverContent></Popover>
    </div>}
    {attempt.pending && <p role="status" className="px-4 text-xs text-muted-foreground">Updating participants…</p>}
    {attempt.failure && <div role="alert" className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm text-destructive">
      <span>{attempt.failure.message}</span>{attempt.uncertain && <Button type="button" size="sm" variant="outline" onClick={attempt.retry}>Retry</Button>}
    </div>}
    <ul aria-label="Participants">{detail.participants.map((participant) => <li key={participant.userId} className="flex items-center gap-2 border-b px-4 py-2 text-sm">
      <span className="min-w-0 flex-1 break-words" dir="auto">{participant.name ?? "Staff"}{participant.userId === scope.userId ? " (you)" : ""}</span>
      {participant.suspended && <span className="text-xs text-muted-foreground">Suspended</span>}
      {manage && <ConcernIconButton label={`Remove ${participant.name ?? "Staff"}`} icon={UserRemove01Icon} disabled={attempt.pending || attempt.uncertain} onClick={() => setRemoving(participant)} />}
    </li>)}</ul>
    <AlertDialog open={removing !== null} onOpenChange={(value) => { if (!value) setRemoving(null); }}>
      <AlertDialogContent aria-describedby={undefined}>
        <AlertDialogHeader><AlertDialogTitle dir="auto">Remove {removing?.name ?? "Staff"}{removing?.userId === scope.userId ? " (you)" : ""}?</AlertDialogTitle></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => { const target = removing; setRemoving(null); if (target) void attempt.run((requestId) => lifecycle.remove(target.userId, requestId)); }}>Remove</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
