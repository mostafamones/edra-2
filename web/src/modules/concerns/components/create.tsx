import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Edit02Icon, SentIcon, Tick02Icon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Avatar, AvatarBadge, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Toggle } from "@/components/ui/toggle";
import { accountName } from "@/modules/account/browser";
import { fetchTeamMembers, staffQueryKeys } from "@/modules/staff";
import { useCreateConcern } from "../commands";
import type { ConcernScope } from "../queries";
import { CONCERN_TITLE_MAX, type CreateConcernInput } from "../validation";
import { useConcernFence } from "./use-fence";
import { ConcernFeedback } from "./feedback";
import { ConcernIconButton } from "./icon-button";
import { ConcernMessageInput, mentionIds, type MentionChoice } from "./mentions";

type Attempt = Omit<CreateConcernInput, "academyId">;
type Person = { userId: string; name: string | null; avatarUrl?: string };
const initials = (name: string | null) => (name ?? "Staff").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

function Face({ person, size }: { person: Person; size?: "sm" | "default" | "lg" }) {
  return <Avatar size={size} aria-hidden="true"><AvatarImage src={person.avatarUrl} alt="" /><AvatarFallback>{initials(person.name)}</AvatarFallback></Avatar>;
}

/** Pick a title and people first; the concern is created atomically by the first message sent from the draft chat. */
export function CreateConcern({ scope, isCurrent, onCreated, onTitle }: { scope: ConcernScope; isCurrent: () => boolean; onCreated: (id: string) => void; onTitle: (title: string | null) => void }) {
  const isMounted = useConcernFence();
  const members = useQuery({ queryKey: staffQueryKeys.members(scope.userId, scope.academyId), queryFn: ({ signal }) => fetchTeamMembers(scope.academyId, signal), staleTime: 5 * 60_000 });
  const others: Person[] = (members.data ?? []).filter((member) => !member.suspended_at && member.user_id !== scope.userId)
    .map((member) => ({ userId: member.user_id, name: accountName(member.profiles), avatarUrl: member.avatarUrl }));
  const [step, setStep] = useState<"details" | "chat">("details");
  const [title, setTitle] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [wholeTeam, setWholeTeam] = useState(false);
  const [body, setBody] = useState("");
  const [mentions, setMentions] = useState<MentionChoice[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const inFlight = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const create = useCreateConcern(scope);
  const chosen = others.filter((person) => wholeTeam || selected.includes(person.userId));
  const ready = title.trim().length > 0 && chosen.length > 0;

  useEffect(() => { onTitle(step === "chat" ? title.trim() : null); return () => onTitle(null); }, [onTitle, step, title]);
  useEffect(() => { if (step === "chat") input.current?.focus(); }, [step]);

  async function submit(payload: Attempt) {
    if (inFlight.current) return;
    inFlight.current = true; setPending(true); setError(null); setAttempt(payload);
    const result = await create(payload);
    inFlight.current = false;
    if (!isCurrent()) return;
    setPending(false);
    if (result.ok) { if (isMounted()) onCreated(payload.concernId); }
    else { setError(result.message); setUncertain(result.code === "unavailable"); }
  }

  if (step === "details") return <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => { event.preventDefault(); if (ready) setStep("chat"); }}>
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-4">
      <div className="space-y-2"><Label htmlFor="concern-title">Title</Label><Input id="concern-title" required maxLength={CONCERN_TITLE_MAX} value={title} onChange={(event) => setTitle(event.target.value)} /></div>
      <div className="space-y-3"><span className="text-sm font-medium">People</span>
        {members.isLoading ? <ConcernFeedback>Loading staff…</ConcernFeedback> : members.isError ? <ConcernFeedback retry={() => void members.refetch()}>Could not load staff</ConcernFeedback>
          : <div role="group" aria-label="People" className="grid grid-cols-4 gap-1">
            <Toggle pressed={wholeTeam} onPressedChange={setWholeTeam} aria-label="Everyone" className="h-auto flex-col gap-1.5 px-1 py-2 data-[state=on]:bg-transparent">
              <Avatar size="lg" aria-hidden="true" className={wholeTeam ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : undefined}>
                <AvatarFallback><HugeiconsIcon icon={UserGroupIcon} strokeWidth={1.5} className="size-5" /></AvatarFallback>
                {wholeTeam && <AvatarBadge><HugeiconsIcon icon={Tick02Icon} strokeWidth={1.5} /></AvatarBadge>}
              </Avatar>
              <span className="w-full truncate text-xs font-normal">Everyone</span>
            </Toggle>
            {others.map((person) => {
              const on = wholeTeam || selected.includes(person.userId);
              return <Toggle key={person.userId} pressed={on} disabled={wholeTeam} aria-label={person.name ?? "Staff"} className="h-auto flex-col gap-1.5 px-1 py-2 data-[state=on]:bg-transparent disabled:opacity-100"
                onPressedChange={(pressed) => setSelected((current) => pressed ? [...current, person.userId] : current.filter((id) => id !== person.userId))}>
                <Avatar size="lg" aria-hidden="true" className={on ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "opacity-70"}>
                  <AvatarImage src={person.avatarUrl} alt="" /><AvatarFallback>{initials(person.name)}</AvatarFallback>
                  {on && <AvatarBadge><HugeiconsIcon icon={Tick02Icon} strokeWidth={1.5} /></AvatarBadge>}
                </Avatar>
                <span className="w-full truncate text-xs font-normal" dir="auto">{person.name?.split(/\s+/)[0] ?? "Staff"}</span>
              </Toggle>;
            })}
          </div>}
      </div>
    </div>
    <div className="flex items-center gap-3 border-t p-4">
      {chosen.length > 0 && <AvatarGroup aria-hidden="true">{chosen.slice(0, 4).map((person) => <Face key={person.userId} person={person} size="sm" />)}{chosen.length > 4 && <AvatarGroupCount className="size-6 text-xs">+{chosen.length - 4}</AvatarGroupCount>}</AvatarGroup>}
      <div className="flex-1" />
      <Button type="submit" disabled={!ready}>Continue</Button>
    </div>
  </form>;

  const locked = pending || attempt !== null;
  const participants = chosen.map(({ userId, name }) => ({ userId, name }));
  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="flex items-center gap-2 border-b px-4 pb-3">
      <AvatarGroup aria-label={chosen.map((person) => person.name ?? "Staff").join(", ")}>{chosen.slice(0, 6).map((person) => <Face key={person.userId} person={person} size="sm" />)}{chosen.length > 6 && <AvatarGroupCount className="size-6 text-xs">+{chosen.length - 6}</AvatarGroupCount>}</AvatarGroup>
      <div className="flex-1" />
      <ConcernIconButton label="Edit details" icon={Edit02Icon} disabled={locked} onClick={() => setStep("details")} />
    </div>
    <div className="min-h-0 flex-1" />
    <form className="shrink-0 space-y-2 p-3" onSubmit={(event) => {
      event.preventDefault();
      if (!body.trim() || locked) return;
      void submit({ concernId: crypto.randomUUID(), messageId: crypto.randomUUID(), title: title.trim(), body, participantIds: selected, wholeTeam, mentions: mentionIds(body, mentions) });
    }}>
      <ConcernMessageInput id="concern-message" label="Message" inputRef={input} value={body} onChange={setBody} disabled={locked} participants={participants}
        onMention={(participant) => setMentions((current) => [...current.filter((entry) => entry.userId !== participant.userId), participant])}
       >
        <div className="flex-1" />
        {pending ? <span role="status" className="text-xs text-muted-foreground">Sending…</span>
          : attempt ? <><Button type="button" size="sm" onClick={() => void submit(attempt)}>Retry send</Button>{!uncertain && <Button type="button" size="sm" variant="outline" onClick={() => { setAttempt(null); setError(null); input.current?.focus(); }}>Edit message</Button>}</>
            : <ConcernIconButton label="Send message" icon={SentIcon} type="submit" variant="default" className="rounded-full" disabled={!body.trim()} />}
      </ConcernMessageInput>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </form>
  </div>;
}
