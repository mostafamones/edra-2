import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { accountName } from "@/modules/account/browser";
import { fetchTeamMembers, staffQueryKeys } from "@/modules/staff";
import { useCreateConcern } from "../commands";
import type { ConcernScope } from "../queries";
import { CONCERN_BODY_MAX, CONCERN_TITLE_MAX, type CreateConcernInput } from "../validation";
import { useConcernFence } from "./use-fence";
import { ConcernFeedback } from "./feedback";
import { ConcernMentions, mentionIds, type MentionChoice } from "./mentions";

type Attempt = Omit<CreateConcernInput, "academyId">;
export function CreateConcern({ scope, isCurrent, onCreated }: { scope: ConcernScope; isCurrent: () => boolean; onCreated: (id: string) => void }) {
  const isMounted = useConcernFence();
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const members = useQuery({ queryKey: staffQueryKeys.members(scope.userId, scope.academyId), queryFn: ({ signal }) => fetchTeamMembers(scope.academyId, signal), staleTime: 5 * 60_000 });
  const active = members.data?.filter((member) => !member.suspended_at) ?? [];
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [mentions, setMentions] = useState<MentionChoice[]>([]);
  const [wholeTeam, setWholeTeam] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const inFlight = useRef(false);
  const create = useCreateConcern(scope);
  const participants = active.filter((member) => wholeTeam || selected.includes(member.user_id) || member.user_id === scope.userId)
    .map((member) => ({ userId: member.user_id, name: accountName(member.profiles) }));
  async function submit(payload: Attempt) {
    if (inFlight.current) return;
    inFlight.current = true; setPending(true); setError(null); setAttempt(payload);
    const result = await create(payload);
    inFlight.current = false;
    if (!isCurrent()) return;
    setPending(false);
    if (result.ok) {
      setAttempt(null); setTitle(""); setBody(""); setCreatedId(payload.concernId);
      if (isMounted()) onCreated(payload.concernId);
    }
    else { setError(result.message); setUncertain(result.code === "unavailable"); }
  }
  if (createdId) return <ConcernFeedback>Concern created<Button onClick={() => onCreated(createdId)}>Open concern</Button></ConcernFeedback>;
  return <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => { event.preventDefault(); if (!title.trim() || !body.trim() || attempt) return; void submit({ concernId: crypto.randomUUID(), messageId: crypto.randomUUID(), title: title.trim(), body, participantIds: selected, wholeTeam, mentions: mentionIds(body, mentions) }); }}>
    <fieldset disabled={pending || !!attempt} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4">
      <div className="space-y-2"><Label htmlFor="concern-title">Title</Label><Input id="concern-title" required maxLength={CONCERN_TITLE_MAX} value={title} onChange={(event) => setTitle(event.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="concern-opening">Opening message</Label><Textarea id="concern-opening" required maxLength={CONCERN_BODY_MAX} value={body} onChange={(event) => setBody(event.target.value)} className="min-h-28" />
        <ConcernMentions participants={participants} disabled={pending || !!attempt} onSelect={(participant) => { setBody((current) => `${current}${current ? " " : ""}@${participant.name ?? "Staff"} `); setMentions((current) => [...current.filter((entry) => entry.userId !== participant.userId), participant]); }} />
      </div>
      <fieldset className="space-y-3"><legend className="mb-3 text-sm font-medium">Participants</legend>
        <label className="flex items-center gap-2"><Checkbox checked={wholeTeam} onCheckedChange={(checked) => setWholeTeam(checked === true)} />Whole team</label>
        {members.isLoading ? <ConcernFeedback>Loading staff…</ConcernFeedback> : members.isError ? <ConcernFeedback retry={() => void members.refetch()}>Could not load staff</ConcernFeedback> : active.map((member) => <label key={member.user_id} className="flex items-center gap-2 text-sm">
          <Checkbox checked={wholeTeam || member.user_id === scope.userId || selected.includes(member.user_id)} disabled={wholeTeam || member.user_id === scope.userId} onCheckedChange={(checked) => setSelected((current) => checked ? [...current, member.user_id] : current.filter((id) => id !== member.user_id))} />
          <span className="break-words" dir="auto">{accountName(member.profiles) ?? "Staff"}{member.user_id === scope.userId ? " (you)" : ""}</span>
        </label>)}
      </fieldset>
    </fieldset>
    <div className="space-y-2 border-t p-4">
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {attempt && !pending ? <div className="flex gap-2"><Button type="button" onClick={() => void submit(attempt)}>Retry creation</Button>{!uncertain && <Button type="button" variant="outline" onClick={() => { setAttempt(null); setError(null); }}>Edit details</Button>}</div>
        : <Button type="submit" disabled={pending || members.isLoading || members.isError || !title.trim() || !body.trim()}>{pending ? "Creating…" : "Create concern"}</Button>}
    </div>
  </form>;
}
