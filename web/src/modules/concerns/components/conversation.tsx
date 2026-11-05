import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { resolveProfileAvatars } from "@/modules/account/browser";
import { useConcernCommands, useConcernLifecycle } from "../commands";
import { useConcernLive } from "../live";
import { concernKeys, isConcernDenied, loadConcernTarget, syncConcernThread, useConcernDetail, useConcernThread, type ConcernScope } from "../queries";
import { ConcernFeedback } from "./feedback";
import { ConcernComposer } from "./composer";
import { ConcernMessageItem } from "./message";
import { ConcernHistory } from "./history";
import { ConcernIconButton } from "./icon-button";
import { ConcernLifecycleForm } from "./lifecycle";
import { ConcernPeople } from "./people";
import { useConcernFence } from "./use-fence";
import { useViewedConcernMessages } from "./use-viewed";

export type ConcernJump = { messageId: string; seq?: number | null };
export function ConcernConversation({ scope, concernId, active, target, onDenied }: {
  scope: ConcernScope; concernId: string; active: boolean; target: ConcernJump | null; onDenied: () => void;
}) {
  const client = useQueryClient();
  const detail = useConcernDetail(scope, concernId, active);
  const denied = isConcernDenied(detail.error);
  const thread = useConcernThread(scope, concernId, active && !!detail.data && !detail.isError);
  const [typing, setTyping] = useState(false);
  const [replyId, setReplyId] = useState<string | null>(null);
  const [jumping, setJumping] = useState(!!target);
  const [jumpError, setJumpError] = useState<string | null>(null);
  const [readError, setReadError] = useState(false);
  const [readRetry, setReadRetry] = useState(0);
  const isCurrent = useConcernFence();
  const commands = useConcernCommands(scope, concernId, () => { if (isCurrent()) onDenied(); });
  const lifecycle = useConcernLifecycle(scope, concernId, () => { if (isCurrent()) onDenied(); });
  const [section, setSection] = useState<"messages" | "people" | "history">("messages");
  const [deciding, setDeciding] = useState<"settle" | "reopen" | null>(null);
  const [copied, setCopied] = useState<boolean | null>(null);
  const reading = section === "messages";
  const live = useConcernLive({ scope, concernId: active && !!detail.data && !detail.isError ? concernId : null, typing: active && reading && !jumping && typing && detail.data?.status === "ongoing" });
  const scroll = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const initialized = useRef(false);
  const previous = useRef({ first: 0, last: 0, height: 0 });
  const consumedTarget = useRef<ConcernJump | null>(null);
  const focusedTarget = useRef<ConcernJump | null>(null);
  const [jumpRetry, setJumpRetry] = useState(0);
  const messages = useMemo(() => thread.data?.messages ?? [], [thread.data?.messages]);
  const version = messages.map((message) => `${message.id}:${message.revision}`).join(",");
  const paths = [...new Set(detail.data?.participants.flatMap((participant) => participant.avatarPath ?? []) ?? [])].sort();
  const avatars = useQuery({ queryKey: [...concernKeys.concern(scope, concernId), "avatars", paths], queryFn: () => resolveProfileAvatars(paths), enabled: active && !!detail.data && !detail.isError && paths.length > 0, staleTime: 45 * 60_000, refetchInterval: 45 * 60_000, gcTime: 50 * 60_000 });
  useEffect(() => { if (denied || isConcernDenied(thread.error) || isConcernDenied(thread.olderError)) onDenied(); }, [denied, thread.error, thread.olderError, onDenied]);

  useLayoutEffect(() => {
    const element = scroll.current;
    if (!active || !element || !messages.length || jumping) return;
    const first = messages[0].seq;
    const last = messages[messages.length - 1].seq;
    if (!initialized.current && !target) {
      element.scrollTop = element.scrollHeight; initialized.current = true;
      const panel = element.closest("[data-concern-panel]");
      if (panel?.contains(document.activeElement)) (panel.querySelector<HTMLElement>("textarea") ?? element).focus({ preventScroll: true });
    }
    else if (previous.current.first && first < previous.current.first) element.scrollTop += element.scrollHeight - previous.current.height;
    else if (pinned.current && last > previous.current.last && consumedTarget.current === target) element.scrollTop = element.scrollHeight;
    previous.current = { first, last, height: element.scrollHeight };
  }, [version, jumping, messages, target, active]);

  useEffect(() => {
    if (!active || !target || !thread.data || consumedTarget.current === target) return;
    let cancelled = false;
    const current = () => !cancelled && isCurrent();
    const jump = async () => {
      setJumping(true); setJumpError(null);
      try {
        await loadConcernTarget(client, scope, concernId, target, current);
        if (!current()) return;
        // Move focus after React commits the loaded messages.
        consumedTarget.current = target;
        pinned.current = false;
      } catch (error) {
        if (!current()) return;
        if (isConcernDenied(error)) onDenied();
        else setJumpError("Could not open this message. Retry or return to the conversation.");
      } finally { if (current()) setJumping(false); }
    };
    void jump();
    return () => { cancelled = true; };
    // The target is a deliberate selection, not a background thread revision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, target, !!thread.data, jumpRetry, client, scope, concernId, isCurrent, onDenied]);
  useLayoutEffect(() => {
    if (jumping || !target || consumedTarget.current !== target || focusedTarget.current === target || !active) return;
    const node = [...(scroll.current?.querySelectorAll<HTMLElement>("[data-concern-message]") ?? [])].find((item) => item.dataset.concernMessage === target.messageId);
    node?.scrollIntoView({ block: "center" }); node?.focus({ preventScroll: true });
    if (node) focusedTarget.current = target;
    // Only selection completion should move focus; message updates preserve the user's place.
  }, [jumping, target, active]);

  useViewedConcernMessages({ root: scroll, active: active && reading && !jumping && !jumpError && !!detail.data && !detail.isError,
    messageVersion: `${version}:${readRetry}`, onViewed: (seq) => { void commands.markRead(seq).then((result) => { if (isCurrent() && result) setReadError(!result.ok); }); } });
  if (denied) return <ConcernFeedback>Concern unavailable</ConcernFeedback>;
  if (detail.isLoading || thread.isLoading) return <ConcernFeedback>Loading conversation…</ConcernFeedback>;
  if ((detail.isError && !detail.data) || !detail.data) return <ConcernFeedback retry={() => void detail.refetch()}>Could not load concern</ConcernFeedback>;
  if (thread.isError && !thread.data) return <ConcernFeedback retry={() => void thread.refetch()}>Could not load messages</ConcernFeedback>;
  const settled = detail.data.status === "settled";
  const participants = detail.data.participants.filter((participant) => !participant.suspended);
  const reply = messages.find((message) => message.id === replyId) ?? null;
  // A form opened for one state closes itself once someone else changes it.
  const decision = deciding === (settled ? "reopen" : "settle") && detail.data.canManage && !detail.isError ? deciding : null;
  const copy = () => { void navigator.clipboard.writeText(concernId).then(() => { if (isCurrent()) setCopied(true); }, () => { if (isCurrent()) setCopied(false); }); };
  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2 text-xs text-muted-foreground">
      <span role="status">{settled ? "Settled" : live.status === "live" ? "Connected" : live.status === "connecting" ? "Connecting…" : "Connection interrupted"}</span>
      {live.status === "degraded" && <Button size="sm" variant="ghost" onClick={() => { void syncConcernThread(client, scope, concernId); void detail.refetch(); live.reconnect(); }}>Reconnect</Button>}
      {live.typers.length > 0 && !settled && <span role="status">Typing activity</span>}
      <span className="ms-auto flex items-center gap-1">
        <ConcernIconButton label={copied ? "Concern ID copied" : "Copy concern ID"} icon={Copy01Icon} onClick={copy} />
        {copied === false && <span role="alert">Could not copy</span>}
        {detail.data.canManage && !detail.isError && !decision && <Button size="sm" variant="outline" onClick={() => { setDeciding(settled ? "reopen" : "settle"); setSection("messages"); }}>{settled ? "Reopen" : "Settle"}</Button>}
      </span>
    </div>
    <Tabs value={section} onValueChange={(value) => setSection(value as typeof section)} className="shrink-0 border-b px-4 py-2">
      <TabsList className="w-full"><TabsTrigger value="messages">Messages</TabsTrigger><TabsTrigger value="people">People</TabsTrigger><TabsTrigger value="history">History</TabsTrigger></TabsList>
    </Tabs>
    {settled && detail.data.outcome && <div className="shrink-0 border-b bg-muted/40 px-4 py-3"><h3 className="mb-1 text-xs font-medium">Outcome</h3><p className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words text-sm" dir="auto">{detail.data.outcome}</p>
      {detail.data.settledAt && <p className="mt-1 text-xs text-muted-foreground" dir="auto">{detail.data.settledByName ?? "Staff"} · <time dateTime={detail.data.settledAt}>{new Date(detail.data.settledAt).toLocaleString()}</time></p>}</div>}
    {detail.isError && detail.data && <ConcernFeedback retry={() => void detail.refetch()}>Could not refresh concern</ConcernFeedback>}
    {jumpError && <div role="alert" className="px-4 py-2 text-sm"><p>{jumpError}</p><Button size="sm" variant="outline" onClick={() => setJumpRetry((value) => value + 1)}>Retry jump</Button></div>}
    {jumping && <p role="status" className="px-4 py-2 text-sm">Opening message…</p>}
    {section === "people" && <ConcernPeople scope={scope} detail={detail.data} lifecycle={lifecycle} />}
    {section === "history" && <ConcernHistory scope={scope} concernId={concernId} active={active} />}
    <div ref={scroll} hidden={!reading} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1" aria-label="Messages" tabIndex={0} onScroll={(event) => { const element = event.currentTarget; pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48; previous.current.height = element.scrollHeight; }}>
      {thread.data?.hasMore && <div className="p-2 text-center"><Button size="sm" variant="ghost" disabled={thread.loadingOlder || jumping} onClick={() => void thread.loadOlder()}>{thread.loadingOlder ? "Loading…" : "Load older messages"}</Button></div>}
      {!!thread.olderError && <ConcernFeedback retry={() => void thread.loadOlder()}>Could not load older messages</ConcernFeedback>}
      {!messages.length && !thread.isLoading && <ConcernFeedback>No messages</ConcernFeedback>}
      {messages.map((message) => <ConcernMessageItem key={message.id} message={message} userId={scope.userId} settled={settled || detail.isError} commands={commands} onReply={(item) => { setReplyId(item.id); }} participants={participants}
        receipts={participants.filter((participant) => participant.lastReadSeq === message.seq)} avatarUrls={avatars.data ?? {}} />)}
    </div>
    {readError && reading && <div role="alert" className="flex items-center gap-2 px-4 text-xs"><span>Could not update read receipt</span><Button size="sm" variant="ghost" onClick={() => setReadRetry((value) => value + 1)}>Retry receipt</Button></div>}
    {decision && <ConcernLifecycleForm key={decision} mode={decision} detail={detail.data} lifecycle={lifecycle} onClose={() => setDeciding(null)} />}
    {reading && !decision && !settled && !detail.isError && <ConcernComposer send={commands.send} participants={participants} reply={reply} onReplyChange={(message) => setReplyId(message?.id ?? null)} onTyping={setTyping} onSent={() => { pinned.current = true; scroll.current?.scrollTo({ top: scroll.current.scrollHeight }); }} />}
  </div>;
}
