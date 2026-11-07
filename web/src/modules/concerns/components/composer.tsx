import { newUuid } from "@/lib/uuid";
import { useRef, useState } from "react";
import { Attachment01Icon, Cancel01Icon, File01Icon, Mic01Icon, RefreshIcon, SentIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Progress } from "@/components/ui/progress";
import type { useConcernCommands, useConcernMedia } from "../commands";
import { CONCERN_LIMITS, type ConcernAttachment } from "../contracts";
import { concernMediaLabel, concernMediaSummary, formatBytes, formatDuration } from "../media";
import { type ConcernMessage, type ConcernParticipant } from "../validation";
import { ConcernIconButton } from "./icon-button";
import { ConcernMessageInput, mentionIds, type MentionChoice } from "./mentions";
import { ConcernRecorder } from "./recorder";
import { useConcernUploads, type ConcernUpload } from "./use-uploads";

export type ConcernSendPayload = Parameters<ReturnType<typeof useConcernCommands>["send"]>[0];
/** Hands each message to the conversation at once (it shows and delivers it) and clears for the next one. */
export function ConcernComposer({ onSend, media, participants, reply, onReplyChange, onTyping }: {
  onSend: (payload: ConcernSendPayload, preview: { reply: ConcernMessage | null; attachments: ConcernAttachment[] }) => void;
  media: ReturnType<typeof useConcernMedia>; participants: ConcernParticipant[];
  reply: ConcernMessage | null; onReplyChange: (message: ConcernMessage | null) => void; onTyping: (typing: boolean) => void;
}) {
  const [body, setBody] = useState("");
  const [mentions, setMentions] = useState<MentionChoice[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const uploads = useConcernUploads(media);
  const input = useRef<HTMLElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const uploading = uploads.items.some((item) => item.status !== "ready");
  const sendable = (body.trim().length > 0 || uploads.items.length > 0) && !uploading;
  const full = uploads.items.length >= CONCERN_LIMITS.attachmentsPerMessage;
  const add = (files: Parameters<typeof uploads.add>[0]) => { setProblem(uploads.add(files, uploads.items.length)); };
  return <form className="shrink-0 space-y-2 border-t p-3" onSubmit={(event) => {
    event.preventDefault();
    if (!sendable) return;
    onSend({ messageId: newUuid(), body: body.trim() ? body : null, mentions: body.trim() ? mentionIds(body, mentions) : [],
      replyToId: reply?.id ?? null, attachmentIds: uploads.items.map((item) => item.id) },
    { reply, attachments: uploads.items.flatMap((item) => item.attachment ?? []) });
    setBody(""); setMentions([]); setProblem(null); onReplyChange(null); uploads.clear(); onTyping(false); input.current?.focus();
  }}>
    {reply && <div className="flex items-start gap-2 border-s-2 ps-2 text-xs"><div className="min-w-0 flex-1"><span className="font-medium" dir="auto">Reply to {reply.authorName ?? "Staff"}</span><p className="line-clamp-2 break-words" dir="auto">{reply.deletedAt ? "Message deleted" : reply.body ?? concernMediaLabel(concernMediaSummary(reply.attachments))}</p></div><ConcernIconButton label="Cancel reply" icon={Cancel01Icon} onClick={() => onReplyChange(null)} /></div>}
    {uploads.items.length > 0 && <ul className="space-y-1" aria-label="Attachments to send">
      {uploads.items.map((item) => <PendingUpload key={item.id} item={item} onRetry={() => uploads.retry(item)} onRemove={() => { uploads.remove(item); setProblem(null); }} />)}
    </ul>}
    {recording && <ConcernRecorder onClose={() => setRecording(false)} onAttach={(voice) => add([{ ...voice, kind: "voice" }])} />}
    <input ref={picker} type="file" multiple hidden tabIndex={-1} aria-hidden="true" onChange={(event) => {
      const files = [...(event.currentTarget.files ?? [])];
      event.currentTarget.value = "";
      if (files.length) add(files.map((file) => ({ blob: file, name: file.name, kind: "file" as const })));
    }} />
    <ConcernMessageInput id="concern-message" label="Message" inputRef={input} value={body} participants={participants}
      onChange={(text) => { setBody(text); onTyping(text.trim().length > 0); }}
      onMention={(participant) => setMentions((current) => [...current.filter((entry) => entry.userId !== participant.userId), participant])}
      onBlur={() => onTyping(false)}>
      <ConcernIconButton label="Attach files" icon={Attachment01Icon} disabled={full} onClick={() => picker.current?.click()} />
      <ConcernIconButton label="Record voice note" icon={Mic01Icon} aria-pressed={recording} disabled={full} onClick={() => setRecording((value) => !value)} />
      <div className="flex-1" />
      <ConcernIconButton label="Send message" icon={SentIcon} type="submit" variant="default" className="rounded-full" disabled={!sendable} />
    </ConcernMessageInput>
    {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
  </form>;
}

function PendingUpload({ item, onRetry, onRemove }: { item: ConcernUpload; onRetry: () => void; onRemove: () => void }) {
  const status = item.status === "uploading" ? `Uploading ${Math.round(item.progress * 100)}%` : item.status === "verifying" ? "Checking…"
    : item.status === "failed" ? item.error : item.kind === "voice" && item.durationSeconds !== null ? formatDuration(item.durationSeconds) : formatBytes(item.bytes);
  return <li className="flex min-w-0 items-center gap-2 rounded-lg border px-2 py-1.5">
    <HugeiconsIcon icon={item.kind === "voice" ? Mic01Icon : File01Icon} strokeWidth={1.5} className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm" dir="auto" title={item.name}>{item.name}</span>
      <span role={item.status === "failed" ? "alert" : "status"} className={item.status === "failed" ? "block text-xs text-destructive" : "block text-xs text-muted-foreground"}>{status}</span>
      {item.status === "uploading" && <Progress value={item.progress * 100} className="mt-1" aria-label={`Uploading ${item.name}`} />}
    </span>
    {item.status === "failed" && <ConcernIconButton label="Retry upload" icon={RefreshIcon} onClick={onRetry} />}
    {<ConcernIconButton label={item.status === "ready" || item.status === "failed" ? "Remove attachment" : "Cancel upload"} icon={Cancel01Icon} onClick={onRemove} />}
  </li>;
}
