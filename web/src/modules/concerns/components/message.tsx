import { useEffect, useRef, useState } from "react";
import { MoreHorizontalIcon, SmileIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { useConcernCommands } from "../commands";
import { CONCERN_LIMITS } from "../contracts";
import { CONCERN_BODY_MAX, concernEmojiSchema, type ConcernMessage, type ConcernParticipant } from "../validation";
import { ConcernBody } from "./body";
import { ConcernIconButton } from "./icon-button";
import { ConcernMentions, mentionIds, type MentionChoice } from "./mentions";
import { ConcernReceipts } from "./receipts";
import { browserScopeGeneration } from "@/lib/browser-scope";

type Commands = ReturnType<typeof useConcernCommands>;
export function ConcernMessageItem({ message, userId, settled, commands, onReply, participants, receipts, avatarUrls }: {
  message: ConcernMessage; userId: string; settled: boolean; commands: Commands; onReply: (message: ConcernMessage) => void;
  participants: ConcernParticipant[]; receipts: ConcernParticipant[]; avatarUrls: Record<string, string>;
}) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(message.body ?? "");
  const [mentions, setMentions] = useState<MentionChoice[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emoji, setEmoji] = useState("");
  const [reactionOpen, setReactionOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const busy = useRef(false);
  const menuFocus = useRef<"reply" | "edit" | null>(null);
  const own = message.authorId === userId;
  const deleted = message.deletedAt !== null || message.body === null;
  const editable = own && now < Date.parse(message.createdAt) + CONCERN_LIMITS.editWindowSeconds * 1000;
  useEffect(() => {
    if (!own || deleted || settled) return;
    const remaining = Date.parse(message.createdAt) + CONCERN_LIMITS.editWindowSeconds * 1000 - Date.now();
    if (remaining <= 0) return;
    const timer = setTimeout(() => setNow(Date.now()), remaining + 1);
    return () => clearTimeout(timer);
  }, [own, deleted, settled, message.createdAt]);
  async function run(action: () => ReturnType<Commands["remove"]>, onSuccess?: () => void) {
    if (busy.current) return;
    busy.current = true; setPending(true); setError(null);
    const generation = browserScopeGeneration();
    const result = await action();
    busy.current = false;
    if (generation !== browserScopeGeneration()) return;
    setPending(false);
    if (result.ok) onSuccess?.(); else setError(result.message);
  }
  function react(value: string) {
    if (!concernEmojiSchema.safeParse(value).success) { setError("Choose an emoji."); return; }
    const on = !message.reactions.some((reaction) => reaction.emoji === value && reaction.userIds.includes(userId));
    void run(() => commands.react(message.id, value, on), () => { setReactionOpen(false); setEmoji(""); });
  }
  return <article data-concern-seq={message.seq} data-concern-message={message.id} tabIndex={-1} className="min-w-0 rounded-lg px-3 py-3 focus-visible:outline-2 focus-visible:outline-ring target:bg-muted">
    <div className="mb-1 flex items-start gap-2"><span className="min-w-0 flex-1 text-xs font-medium break-words" dir="auto">{message.authorName ?? "Staff"}</span><time dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString()} className="text-xs text-muted-foreground">{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
      {!settled && !deleted && <DropdownMenu><DropdownMenuTrigger asChild><ConcernIconButton label="Message actions" icon={MoreHorizontalIcon} disabled={pending} /></DropdownMenuTrigger><DropdownMenuContent align="end" onCloseAutoFocus={(event) => {
        if (!menuFocus.current) return;
        event.preventDefault();
        document.getElementById(menuFocus.current === "reply" ? "concern-message" : `edit-${message.id}`)?.focus();
        menuFocus.current = null;
      }}>
        <DropdownMenuItem onSelect={() => { menuFocus.current = "reply"; onReply(message); }}>Reply</DropdownMenuItem>
        {editable && <DropdownMenuItem onSelect={() => { menuFocus.current = "edit"; setBody(message.body ?? ""); setMentions(participants.filter((participant) => message.mentions.includes(participant.userId))); setEditing(true); }}>Edit</DropdownMenuItem>}
        {own && <DropdownMenuItem variant="destructive" onSelect={() => void run(() => commands.remove(message.id))}>Delete</DropdownMenuItem>}
      </DropdownMenuContent></DropdownMenu>}
    </div>
    {message.replyTo && <blockquote className="mb-2 border-s-2 ps-2 text-xs text-muted-foreground"><span className="block font-medium" dir="auto">{message.replyTo.authorName ?? "Staff"}</span><span className="line-clamp-2 break-words" dir="auto">{message.replyTo.deleted || !message.replyTo.body ? "Message deleted" : message.replyTo.body}</span></blockquote>}
    {deleted ? <p className="text-sm italic text-muted-foreground">Message deleted</p> : editing && !settled ? <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); if (body.trim()) void run(() => commands.edit(message.id, { body, mentions: mentionIds(body, mentions) }), () => setEditing(false)); }}>
      <Label htmlFor={`edit-${message.id}`} className="sr-only">Edit message</Label><Textarea id={`edit-${message.id}`} value={body} maxLength={CONCERN_BODY_MAX} disabled={pending} onChange={(event) => setBody(event.target.value)} />
      <div className="flex flex-wrap gap-2"><ConcernMentions participants={participants} disabled={pending} onSelect={(participant) => { setBody((current) => `${current} @${participant.name ?? "Staff"} `); setMentions((current) => [...current.filter((entry) => entry.userId !== participant.userId), participant]); }} /><Button size="sm" type="submit" disabled={pending || !body.trim()}>{pending ? "Saving…" : "Save"}</Button><Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setEditing(false)}>Cancel</Button></div>
    </form> : <ConcernBody body={message.body!} />}
    {!deleted && message.editedAt && <span className="text-xs text-muted-foreground">Edited</span>}
    {!deleted && <div className="mt-2 flex flex-wrap items-center gap-1">
      {message.reactions.map((reaction) => <Button key={reaction.emoji} type="button" size="sm" variant={reaction.userIds.includes(userId) ? "secondary" : "outline"} aria-label={`${reaction.emoji}, ${reaction.userIds.length} reactions`} aria-pressed={reaction.userIds.includes(userId)} disabled={settled || pending} onClick={() => react(reaction.emoji)}>{reaction.emoji} {reaction.userIds.length}</Button>)}
      {!settled && <Popover open={reactionOpen} onOpenChange={setReactionOpen}><PopoverTrigger asChild><ConcernIconButton label="Add reaction" icon={SmileIcon} disabled={pending} /></PopoverTrigger><PopoverContent className="w-60" side="top">
        <div className="flex flex-wrap gap-1">{["👍", "❤️", "✅", "👀", "🙏", "🎉"].map((value) => <Button key={value} type="button" variant="ghost" size="icon-sm" aria-label={`React ${value}`} disabled={pending} onClick={() => react(value)}>{value}</Button>)}</div>
        <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); react(emoji); }}><Input aria-label="Emoji" value={emoji} maxLength={16} onChange={(event) => setEmoji(event.target.value)} /><Button type="submit" size="sm" disabled={pending || !emoji}>Add</Button></form>
      </PopoverContent></Popover>}
    </div>}
    {pending && <p role="status" className="text-xs text-muted-foreground">Updating…</p>}
    {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    <ConcernReceipts participants={receipts} avatarUrls={avatarUrls} />
  </article>;
}
