import { useEffect, useRef, useState } from "react";
import { Loading03Icon, MoreHorizontalIcon, SmileIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { useConcernCommands } from "../commands";
import type { ConcernFailure } from "../errors";
import { CONCERN_LIMITS } from "../contracts";
import { concernEmojiSchema, type ConcernMessage, type ConcernParticipant } from "../validation";
import { concernMediaLabel } from "../media";
import { ConcernAttachments } from "./attachments";
import { ConcernLocalFiles } from "./local";
import type { ConcernUpload } from "./uploads";
import { ConcernBody } from "./body";
import { ConcernIconButton } from "./icon-button";
import { ConcernMessageInput, mentionIds, type MentionChoice } from "./mentions";
import { ConcernReceipts } from "./receipts";
import { browserScopeGeneration } from "@/lib/browser-scope";

type Commands = ReturnType<typeof useConcernCommands>;
export function ConcernMessageItem({ message, outgoing, first = true, readSeq, academyId, userId, settled, commands, onReply, participants, receipts, avatarUrls }: {
  message: ConcernMessage; first?: boolean; readSeq?: number;
  /** Set while this is a local, not yet confirmed send. */
  outgoing?: { failure: ConcernFailure | null; files: ConcernUpload[]; onRetry: () => void; onDiscard: () => void }; academyId: string; userId: string; settled: boolean; commands: Commands; onReply: (message: ConcernMessage) => void;
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
  // Only deletion makes a placeholder: a live media-only message has no text.
  const deleted = message.deletedAt !== null;
  const hasMedia = message.attachments.length > 0;
  const editable = own && now < Date.parse(message.createdAt) + CONCERN_LIMITS.editWindowSeconds * 1000;
  useEffect(() => {
    if (!own || deleted || settled) return;
    const remaining = Date.parse(message.createdAt) + CONCERN_LIMITS.editWindowSeconds * 1000 - Date.now();
    if (remaining <= 0) return;
    const timer = setTimeout(() => setNow(Date.now()), remaining + 1);
    return () => clearTimeout(timer);
  }, [own, deleted, settled, message.createdAt]);
  async function run(action: () => ReturnType<Commands["remove"]>, onSuccess?: () => void, onFailure?: () => void) {
    if (busy.current) return;
    busy.current = true; setPending(true); setError(null);
    const generation = browserScopeGeneration();
    const result = await action();
    busy.current = false;
    if (generation !== browserScopeGeneration()) return;
    setPending(false);
    if (result.ok) onSuccess?.(); else { setError(result.message); onFailure?.(); }
  }
  function react(value: string) {
    if (!concernEmojiSchema.safeParse(value).success) { setError("Choose an emoji."); return; }
    const on = !message.reactions.some((reaction) => reaction.emoji === value && reaction.userIds.includes(userId));
    void run(() => commands.react(message.id, value, on), () => { setReactionOpen(false); setEmoji(""); });
  }
  const author = participants.find((participant) => participant.userId === message.authorId);
  const name = message.authorName ?? "Staff";
  const time = <time dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString()} className="text-xs text-muted-foreground">{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>;
  const mentioned = participants.filter((participant) => message.mentions.includes(participant.userId)).map((participant) => ({ userId: participant.userId, name: participant.name, avatarUrl: avatarUrls[participant.avatarPath ?? ""] }));
  // A send shows a spinner, then a brief check once the server confirms it.
  const sending = !!outgoing && !outgoing.failure;
  const [confirmed, setConfirmed] = useState(false);
  const wasSending = useRef(sending);
  useEffect(() => {
    const finished = wasSending.current && !outgoing;
    wasSending.current = sending;
    if (!finished) return;
    setConfirmed(true);
    const timer = setTimeout(() => setConfirmed(false), 1500);
    return () => clearTimeout(timer);
  }, [sending, outgoing]);
  const status = !deleted && (sending || confirmed) ? <span role="status" aria-label={outgoing ? "Sending…" : "Sent"} className="ms-1 inline-flex align-[-3px] text-muted-foreground">
    <HugeiconsIcon icon={outgoing ? Loading03Icon : Tick02Icon} strokeWidth={1.5} aria-hidden="true" className={cn("size-3.5", outgoing && "animate-spin")} /></span> : null;
  const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return <article data-concern-seq={outgoing ? undefined : message.seq} data-concern-read-seq={outgoing ? undefined : readSeq} data-concern-message={message.id} tabIndex={-1}
    className={cn("group/message relative flex min-w-0 gap-3 rounded-md ps-3 pe-1 py-0.5 hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring target:bg-muted", first && "mt-2 py-1", message.mentions.includes(userId) && "bg-primary/10 hover:bg-primary/15")}>
    <div className="flex w-12 shrink-0 justify-center">{first
      ? <Avatar aria-hidden="true" size="lg"><AvatarImage src={avatarUrls[author?.avatarPath ?? ""]} alt="" /><AvatarFallback className="text-xs">{initials}</AvatarFallback></Avatar>
      : <time dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString()} className="invisible flex h-5 items-center text-[10px] leading-none whitespace-nowrap tabular-nums text-muted-foreground group-hover/message:visible">{new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>}</div>
    <div className="flex min-w-0 flex-1 flex-col">
      {first && <div className="flex items-baseline gap-2"><span className="text-sm font-semibold break-words" dir="auto">{name}</span>{time}</div>}
      {editing && !settled && !deleted ? <form className="w-full" onSubmit={(event) => { event.preventDefault(); if (body.trim() || hasMedia) { setEditing(false); void run(() => commands.edit(message.id, { body: body.trim() ? body : null, mentions: body.trim() ? mentionIds(body, mentions) : [] }), undefined, () => setEditing(true)); } }}>
        <ConcernMessageInput id={`edit-${message.id}`} label="Edit message" value={body} onChange={setBody} disabled={pending} participants={participants} avatarUrls={avatarUrls}
          onMention={(participant) => setMentions((current) => [...current.filter((entry) => entry.userId !== participant.userId), participant])}>
          <div className="flex-1" />
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setEditing(false)}>Cancel</Button>
          <Button size="sm" type="submit" disabled={pending || (!body.trim() && !hasMedia)}>{pending ? "Saving…" : "Save"}</Button>
        </ConcernMessageInput>
      </form> : <div className={cn("min-w-0 text-sm transition-opacity", outgoing && !outgoing.failure && "opacity-70", deleted && "italic text-muted-foreground")}>
        {message.replyTo && <blockquote className="mb-1 rounded-md border-s-2 bg-muted/50 px-2 py-1 text-xs text-muted-foreground"><span className="block font-medium text-foreground" dir="auto">{message.replyTo.authorName ?? "Staff"}</span><span className="line-clamp-2 break-words" dir="auto">{message.replyTo.deleted ? "Message deleted" : message.replyTo.body ?? concernMediaLabel(message.replyTo.media)}</span></blockquote>}
        {deleted ? "Message deleted" : message.body !== null && <ConcernBody body={message.body} scope={{ academyId, userId }} mentions={mentioned} suffix={status} />}
        {!deleted && (outgoing ? <ConcernLocalFiles label="Attachments" files={outgoing.files} /> : <ConcernAttachments attachments={message.attachments} academyId={academyId} concernId={message.concernId} />)}
        {!deleted && message.body === null && status}
        {!deleted && message.editedAt && <span className="text-[11px] text-muted-foreground">(edited)</span>}
      </div>}
      {!deleted && message.reactions.length > 0 && <div className="mt-1 flex flex-wrap gap-1">
        {message.reactions.map((reaction) => {
          const mine = reaction.userIds.includes(userId);
          const people = reaction.userIds.map((id) => participants.find((participant) => participant.userId === id));
          return <Tooltip key={reaction.emoji}><TooltipTrigger asChild><button type="button"
            className={cn("inline-flex h-6 items-center gap-1 rounded-md border ps-1.5 pe-1 text-xs disabled:opacity-60", mine ? "border-foreground/30 bg-muted" : "bg-background hover:bg-muted")}
            aria-label={`${reaction.emoji}, ${reaction.userIds.length} reactions`} aria-pressed={mine} disabled={settled || pending} onClick={() => react(reaction.emoji)}>
            <span aria-hidden="true">{reaction.emoji}</span>
            <span className="flex -space-x-1" aria-hidden="true">{people.slice(0, 3).map((person, index) => <Avatar key={person?.userId ?? index} className="size-4 ring-1 ring-background"><AvatarImage src={avatarUrls[person?.avatarPath ?? ""]} alt="" /><AvatarFallback className="text-[8px]">{(person?.name ?? "S").slice(0, 1)}</AvatarFallback></Avatar>)}</span>
            {people.length > 3 && <span className="tabular-nums text-muted-foreground" aria-hidden="true">+{people.length - 3}</span>}
          </button></TooltipTrigger><TooltipContent>{people.map((person) => person?.name ?? "Staff").join(", ")}</TooltipContent></Tooltip>;
        })}
      </div>}
      {outgoing?.failure && <div role="alert" className="flex flex-wrap items-center gap-1 px-1 text-xs text-destructive">
        <span>{outgoing.failure.message}</span>
        <Button type="button" size="xs" variant="ghost" onClick={outgoing.onRetry}>Retry send</Button>
        {outgoing.failure.code !== "unavailable" && <Button type="button" size="xs" variant="ghost" onClick={outgoing.onDiscard}>Discard</Button>}
      </div>}
      {error && <p role="alert" className="px-1 text-sm text-destructive">{error}</p>}
    </div>
    {!settled && !deleted && !outgoing && !editing && <div className="absolute end-6 top-0 flex -translate-y-1/2 items-center rounded-md border bg-popover shadow-xs opacity-0 transition-opacity group-hover/message:opacity-100 focus-within:opacity-100 has-[[data-state=open]]:opacity-100">
      <Popover open={reactionOpen} onOpenChange={setReactionOpen}><PopoverTrigger asChild><ConcernIconButton label="Add reaction" icon={SmileIcon} disabled={pending} /></PopoverTrigger><PopoverContent className="w-60" side="top">
        <div className="flex flex-wrap gap-1">{["👍", "❤️", "✅", "👀", "🙏", "🎉"].map((value) => <Button key={value} type="button" variant="ghost" size="icon-sm" aria-label={`React ${value}`} disabled={pending} onClick={() => react(value)}>{value}</Button>)}</div>
        <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); react(emoji); }}><Input aria-label="Emoji" value={emoji} maxLength={16} onChange={(event) => setEmoji(event.target.value)} /><Button type="submit" size="sm" disabled={pending || !emoji}>Add</Button></form>
      </PopoverContent></Popover>
      <DropdownMenu><DropdownMenuTrigger asChild><ConcernIconButton label="Message actions" icon={MoreHorizontalIcon} disabled={pending} /></DropdownMenuTrigger><DropdownMenuContent align="end" onCloseAutoFocus={(event) => {
        if (!menuFocus.current) return;
        event.preventDefault();
        document.getElementById(menuFocus.current === "reply" ? "concern-message" : `edit-${message.id}`)?.focus();
        menuFocus.current = null;
      }}>
        <DropdownMenuItem onSelect={() => { menuFocus.current = "reply"; onReply(message); }}>Reply</DropdownMenuItem>
        {editable && <DropdownMenuItem onSelect={() => { menuFocus.current = "edit"; setBody(message.body ?? ""); setMentions(participants.filter((participant) => message.mentions.includes(participant.userId))); setEditing(true); }}>Edit</DropdownMenuItem>}
        {own && <DropdownMenuItem variant="destructive" onSelect={() => void run(() => commands.remove(message.id))}>Delete</DropdownMenuItem>}
      </DropdownMenuContent></DropdownMenu>
    </div>}
    <div className="w-4 shrink-0 self-end"><ConcernReceipts participants={receipts} avatarUrls={avatarUrls} /></div>
  </article>;
}
