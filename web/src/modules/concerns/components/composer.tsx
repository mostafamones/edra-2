import { newUuid } from "@/lib/uuid";
import { useRef, useState } from "react";
import { Attachment01Icon, Cancel01Icon, Mic01Icon, SentIcon } from "@hugeicons/core-free-icons";
import type { useConcernCommands } from "../commands";
import { CONCERN_LIMITS } from "../contracts";
import { concernMediaLabel, concernMediaSummary } from "../media";
import { type ConcernMessage, type ConcernParticipant } from "../validation";
import { ConcernIconButton } from "./icon-button";
import { ConcernMessageInput, mentionIds, type MentionChoice } from "./mentions";
import { ConcernRecorder } from "./recorder";
import { ConcernLocalFiles } from "./local";
import { releasePreviews, stageUploads, type ConcernUpload } from "./uploads";

export type ConcernSendPayload = Parameters<ReturnType<typeof useConcernCommands>["send"]>[0];
/** Hands each message to the conversation at once (it shows, uploads its files and delivers it) and clears for the next one. */
export function ConcernComposer({ onSend, participants, reply, onReplyChange, onTyping }: {
  onSend: (payload: ConcernSendPayload, preview: { reply: ConcernMessage | null; files: ConcernUpload[] }) => void;
  participants: ConcernParticipant[];
  reply: ConcernMessage | null; onReplyChange: (message: ConcernMessage | null) => void; onTyping: (typing: boolean) => void;
}) {
  const [body, setBody] = useState("");
  const [mentions, setMentions] = useState<MentionChoice[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  // Files stay on this device until the message is sent.
  const [staged, setStaged] = useState<ConcernUpload[]>([]);
  const input = useRef<HTMLElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const sendable = body.trim().length > 0 || staged.length > 0;
  const full = staged.length >= CONCERN_LIMITS.attachmentsPerMessage;
  const add = (files: Parameters<typeof stageUploads>[0]) => {
    const result = stageUploads(files, staged.length);
    if ("error" in result) setProblem(result.error); else { setProblem(null); setStaged((current) => [...current, ...result.items]); }
  };
  return <form className="shrink-0 space-y-2 border-t p-3" onSubmit={(event) => {
    event.preventDefault();
    if (!sendable) return;
    onSend({ messageId: newUuid(), body: body.trim() ? body : null, mentions: body.trim() ? mentionIds(body, mentions) : [],
      replyToId: reply?.id ?? null, attachmentIds: staged.map((item) => item.id) },
    { reply, files: staged });
    setBody(""); setMentions([]); setProblem(null); onReplyChange(null); setStaged([]); onTyping(false); input.current?.focus();
  }}>
    {reply && <div className="flex items-start gap-2 border-s-2 ps-2 text-xs"><div className="min-w-0 flex-1"><span className="font-medium" dir="auto">Reply to {reply.authorName ?? "Staff"}</span><p className="line-clamp-2 break-words" dir="auto">{reply.deletedAt ? "Message deleted" : reply.body ?? concernMediaLabel(concernMediaSummary(reply.attachments))}</p></div><ConcernIconButton label="Cancel reply" icon={Cancel01Icon} onClick={() => onReplyChange(null)} /></div>}
    <ConcernLocalFiles compact label="Attachments to send" files={staged} onRemove={(file) => { releasePreviews([file]); setStaged((current) => current.filter((item) => item !== file)); setProblem(null); }} />
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
