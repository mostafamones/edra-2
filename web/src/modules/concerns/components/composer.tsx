import { useRef, useState } from "react";
import { browserScopeGeneration } from "@/lib/browser-scope";
import { Attachment01Icon, Cancel01Icon, File01Icon, Mic01Icon, RefreshIcon, SentIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { useConcernCommands, useConcernMedia } from "../commands";
import { CONCERN_LIMITS } from "../contracts";
import { concernMediaLabel, concernMediaSummary, formatBytes, formatDuration } from "../media";
import { type ConcernMessage, type ConcernParticipant } from "../validation";
import type { ConcernFailure } from "../errors";
import { ConcernIconButton } from "./icon-button";
import { ConcernMessageInput, mentionIds, type MentionChoice } from "./mentions";
import { ConcernRecorder } from "./recorder";
import { useConcernFence } from "./use-fence";
import { useConcernUploads, type ConcernUpload } from "./use-uploads";

type Payload = Parameters<ReturnType<typeof useConcernCommands>["send"]>[0];
export function ConcernComposer({ send, media, participants, reply, onReplyChange, onTyping, onSent }: {
  send: ReturnType<typeof useConcernCommands>["send"]; media: ReturnType<typeof useConcernMedia>; participants: ConcernParticipant[];
  reply: ConcernMessage | null; onReplyChange: (message: ConcernMessage | null) => void;
  onTyping: (typing: boolean) => void; onSent: () => void;
}) {
  const [body, setBody] = useState("");
  const [mentions, setMentions] = useState<MentionChoice[]>([]);
  const [attempt, setAttempt] = useState<Payload | null>(null);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ConcernFailure | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const uploads = useConcernUploads(media);
  const busy = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const isCurrent = useConcernFence();
  async function submit(payload: Payload) {
    if (busy.current) return;
    busy.current = true; setPending(true); setAttempt(payload); setFailure(null); setProblem(null); onTyping(false);
    const generation = browserScopeGeneration();
    const result = await send(payload);
    busy.current = false;
    if (generation !== browserScopeGeneration()) return;
    setPending(false);
    if (result.ok) {
      setAttempt(null); setBody(""); setMentions([]); onReplyChange(null); uploads.clear();
      if (isCurrent()) { onSent(); input.current?.focus(); }
    } else setFailure(result);
  }
  // An unconfirmed send keeps its exact text, reply and media until it is retried or definitely refused.
  const locked = pending || attempt !== null;
  const uploading = uploads.items.some((item) => item.status !== "ready");
  const sendable = (body.trim().length > 0 || uploads.items.length > 0) && !uploading;
  const full = uploads.items.length >= CONCERN_LIMITS.attachmentsPerMessage;
  const add = (files: Parameters<typeof uploads.add>[0]) => { setProblem(uploads.add(files, uploads.items.length)); };
  return <form className="shrink-0 space-y-2 border-t p-3" onSubmit={(event) => {
    event.preventDefault();
    if (!sendable || locked) return;
    void submit({ messageId: crypto.randomUUID(), body: body.trim() ? body : null, mentions: body.trim() ? mentionIds(body, mentions) : [],
      replyToId: reply?.id ?? null, attachmentIds: uploads.items.map((item) => item.id) });
  }}>
    {reply && <div className="flex items-start gap-2 border-s-2 ps-2 text-xs"><div className="min-w-0 flex-1"><span className="font-medium" dir="auto">Reply to {reply.authorName ?? "Staff"}</span><p className="line-clamp-2 break-words" dir="auto">{reply.deletedAt ? "Message deleted" : reply.body ?? concernMediaLabel(concernMediaSummary(reply.attachments))}</p></div><ConcernIconButton label="Cancel reply" icon={Cancel01Icon} disabled={locked} onClick={() => onReplyChange(null)} /></div>}
    {uploads.items.length > 0 && <ul className="space-y-1" aria-label="Attachments to send">
      {uploads.items.map((item) => <PendingUpload key={item.id} item={item} locked={locked} onRetry={() => uploads.retry(item)} onRemove={() => { uploads.remove(item); setProblem(null); }} />)}
    </ul>}
    {recording && !locked && <ConcernRecorder onClose={() => setRecording(false)} onAttach={(voice) => add([{ ...voice, kind: "voice" }])} />}
    <input ref={picker} type="file" multiple hidden tabIndex={-1} aria-hidden="true" onChange={(event) => {
      const files = [...(event.currentTarget.files ?? [])];
      event.currentTarget.value = "";
      if (files.length) add(files.map((file) => ({ blob: file, name: file.name, kind: "file" as const })));
    }} />
    <ConcernMessageInput id="concern-message" label="Message" inputRef={input} value={body} disabled={locked} participants={participants}
      onChange={(text) => { setBody(text); onTyping(text.trim().length > 0); }}
      onMention={(participant) => setMentions((current) => [...current.filter((entry) => entry.userId !== participant.userId), participant])}
      onBlur={() => onTyping(false)}>
      <ConcernIconButton label="Attach files" icon={Attachment01Icon} disabled={locked || full} onClick={() => picker.current?.click()} />
      <ConcernIconButton label="Record voice note" icon={Mic01Icon} aria-pressed={recording} disabled={locked || full} onClick={() => setRecording((value) => !value)} />
      <div className="flex-1" />
      {pending ? <span role="status" className="text-xs text-muted-foreground">Sending…</span>
        : attempt ? <><Button type="button" size="sm" onClick={() => void submit(attempt)}>Retry send</Button>{failure?.code !== "unavailable" && <Button type="button" size="sm" variant="outline" onClick={() => { setAttempt(null); setFailure(null); input.current?.focus(); }}>Edit message</Button>}</>
          : <ConcernIconButton label="Send message" icon={SentIcon} type="submit" variant="default" className="rounded-full" disabled={!sendable} />}
    </ConcernMessageInput>
    {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
    {failure && <p role="alert" className="text-sm text-destructive">{failure.message}</p>}
  </form>;
}

function PendingUpload({ item, locked, onRetry, onRemove }: { item: ConcernUpload; locked: boolean; onRetry: () => void; onRemove: () => void }) {
  const status = item.status === "uploading" ? `Uploading ${Math.round(item.progress * 100)}%` : item.status === "verifying" ? "Checking…"
    : item.status === "failed" ? item.error : item.kind === "voice" && item.durationSeconds !== null ? formatDuration(item.durationSeconds) : formatBytes(item.bytes);
  return <li className="flex min-w-0 items-center gap-2 rounded-lg border px-2 py-1.5">
    <HugeiconsIcon icon={item.kind === "voice" ? Mic01Icon : File01Icon} strokeWidth={1.5} className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm" dir="auto" title={item.name}>{item.name}</span>
      <span role={item.status === "failed" ? "alert" : "status"} className={item.status === "failed" ? "block text-xs text-destructive" : "block text-xs text-muted-foreground"}>{status}</span>
      {item.status === "uploading" && <Progress value={item.progress * 100} className="mt-1" aria-label={`Uploading ${item.name}`} />}
    </span>
    {item.status === "failed" && !locked && <ConcernIconButton label="Retry upload" icon={RefreshIcon} onClick={onRetry} />}
    {!locked && <ConcernIconButton label={item.status === "ready" || item.status === "failed" ? "Remove attachment" : "Cancel upload"} icon={Cancel01Icon} onClick={onRemove} />}
  </li>;
}
