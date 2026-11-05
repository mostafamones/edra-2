import { useRef, useState } from "react";
import { browserScopeGeneration } from "@/lib/browser-scope";
import { Cancel01Icon, SentIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { useConcernCommands } from "../commands";
import { CONCERN_BODY_MAX, type ConcernMessage, type ConcernParticipant } from "../validation";
import type { ConcernFailure } from "../errors";
import { ConcernIconButton } from "./icon-button";
import { ConcernMentions, mentionIds, type MentionChoice } from "./mentions";
import { useConcernFence } from "./use-fence";

type Payload = Parameters<ReturnType<typeof useConcernCommands>["send"]>[0];
export function ConcernComposer({ send, participants, reply, onReplyChange, onTyping, onSent }: {
  send: ReturnType<typeof useConcernCommands>["send"]; participants: ConcernParticipant[];
  reply: ConcernMessage | null; onReplyChange: (message: ConcernMessage | null) => void;
  onTyping: (typing: boolean) => void; onSent: () => void;
}) {
  const [body, setBody] = useState("");
  const [mentions, setMentions] = useState<MentionChoice[]>([]);
  const [attempt, setAttempt] = useState<Payload | null>(null);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ConcernFailure | null>(null);
  const busy = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const isCurrent = useConcernFence();
  async function submit(payload: Payload) {
    if (busy.current) return;
    busy.current = true; setPending(true); setAttempt(payload); setFailure(null); onTyping(false);
    const generation = browserScopeGeneration();
    const result = await send(payload);
    busy.current = false;
    if (generation !== browserScopeGeneration()) return;
    setPending(false);
    if (result.ok) {
      setAttempt(null); setBody(""); setMentions([]); onReplyChange(null);
      if (isCurrent()) { onSent(); input.current?.focus(); }
    } else setFailure(result);
  }
  const locked = pending || attempt !== null;
  return <form className="shrink-0 space-y-2 border-t p-3" onSubmit={(event) => {
    event.preventDefault();
    if (!body.trim() || locked) return;
    void submit({ messageId: crypto.randomUUID(), body, mentions: mentionIds(body, mentions), replyToId: reply?.id ?? null });
  }}>
    {reply && <div className="flex items-start gap-2 border-s-2 ps-2 text-xs"><div className="min-w-0 flex-1"><span className="font-medium" dir="auto">Reply to {reply.authorName ?? "Staff"}</span><p className="line-clamp-2 break-words" dir="auto">{reply.deletedAt || !reply.body ? "Message deleted" : reply.body}</p></div><ConcernIconButton label="Cancel reply" icon={Cancel01Icon} disabled={locked} onClick={() => onReplyChange(null)} /></div>}
    <Label htmlFor="concern-message" className="sr-only">Message</Label>
    <Textarea ref={input} id="concern-message" value={body} maxLength={CONCERN_BODY_MAX} disabled={locked} className="max-h-40 min-h-20 resize-none overflow-y-auto" onChange={(event) => { setBody(event.target.value); onTyping(event.target.value.trim().length > 0); }} onBlur={() => onTyping(false)} />
    <div className="flex items-center gap-2"><ConcernMentions participants={participants} disabled={locked} onSelect={(participant) => {
      setBody((current) => `${current}${current ? " " : ""}@${participant.name ?? "Staff"} `);
      setMentions((current) => [...current.filter((entry) => entry.userId !== participant.userId), participant]); input.current?.focus();
    }} />
      <div className="flex-1" />
      {pending ? <span role="status" className="text-xs text-muted-foreground">Sending…</span>
        : attempt ? <><Button type="button" size="sm" onClick={() => void submit(attempt)}>Retry send</Button>{failure?.code !== "unavailable" && <Button type="button" size="sm" variant="outline" onClick={() => { setAttempt(null); setFailure(null); input.current?.focus(); }}>Edit message</Button>}</>
          : <ConcernIconButton label="Send message" icon={SentIcon} type="submit" disabled={!body.trim()} />}
    </div>
    {failure && <p role="alert" className="text-sm text-destructive">{failure.message}</p>}
  </form>;
}
