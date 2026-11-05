import { Activity, createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircleIcon, ArrowLeft01Icon, Cancel01Icon, Message01Icon, PlusSignIcon, SquareUnlock02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FloatingSheet, FloatingSheetContent, FloatingSheetTitle } from "@/components/ui/floating-sheet";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import { browserScopeGeneration } from "@/lib/browser-scope";
import { useAuth } from "@/modules/auth";
import { isAcademyManager } from "@/modules/academies";
import type { ConcernTarget } from "../contracts";
import { concernKeys, forgetConcern, forgetConcernScope, isConcernDenied, loadConcernDetail, useConcernUnread, type ConcernScope } from "../queries";
import { useConcernInboxLive } from "../live";
import { ConcernConversation, type ConcernJump } from "./conversation";
import { CreateConcern } from "./create";
import { ConcernFeedback } from "./feedback";
import { ConcernIconButton } from "./icon-button";
import { ConcernInbox } from "./inbox";
import { useConcernFence } from "./use-fence";
import { RecoverConcern } from "./recover";

export type OpenConcernResult = "opened" | "different_academy" | "unavailable" | "superseded";
type PanelContext = { openConcern: (target: ConcernTarget) => Promise<OpenConcernResult> };
const Context = createContext<PanelContext | null>(null);

/** Notification adapters can route academies first, then call this access-rechecking entry point. */
export function useConcernPanel() { return useContext(Context); }

/** Mount once in the persistent academy layout, inside auth and the shared QueryClient. */
export function ConcernPanelProvider({ children }: { children: ReactNode }) {
  const { activeAcademy, user } = useAuth();
  if (!activeAcademy || !user) return children;
  return <ScopedConcernPanel key={`${activeAcademy.id}:${user.id}:${browserScopeGeneration()}`} academyId={activeAcademy.id} userId={user.id} manager={isAcademyManager(activeAcademy.role)} owner={activeAcademy.role === "owner"}>{children}</ScopedConcernPanel>;
}

/** `manager`/`owner` only choose which entry points to show; the database decides every command. */
function ScopedConcernPanel({ academyId, userId, manager, owner, children }: ConcernScope & { manager: boolean; owner: boolean; children: ReactNode }) {
  const scope = useMemo(() => ({ academyId, userId }), [academyId, userId]);
  const client = useQueryClient();
  const current = useConcernFence();
  const mobile = useIsMobile();
  const unread = useConcernUnread(scope);
  useConcernInboxLive(scope);
  const [open, setOpenState] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const setOpen = useCallback((value: boolean) => { setEverOpened(true); setOpenState(value); }, []);
  const [view, setView] = useState<"list" | "create" | "recover" | "chat" | "loading" | "error">("list");
  // The concern an Owner was just denied, offered for explicit recovery.
  const [deniedId, setDeniedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ id: string; title: string; target: ConcernJump | null } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const activation = useRef(0);
  const launcher = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => () => { void forgetConcernScope(client, scope); }, [client, scope]);
  useLayoutEffect(() => {
    if (!open) return;
    if (view === "list" || view === "create" || view === "recover") content.current?.querySelector<HTMLInputElement>("input")?.focus();
    else if (view === "loading") content.current?.querySelector<HTMLButtonElement>("header button")?.focus();
  }, [open, view]);
  const selectedId = useRef<string | null>(null);
  useEffect(() => { selectedId.current = selected?.id ?? null; }, [selected]);
  const denied = useCallback(() => {
    if (!current()) return;
    activation.current += 1; setDeniedId(selectedId.current); setSelected(null); setView("error"); setFailure("You no longer have access to this concern.");
  }, [current]);
  const activate = useCallback(async (target: ConcernTarget, seq?: number | null): Promise<OpenConcernResult> => {
    if (target.academyId !== academyId) return "different_academy";
    const request = ++activation.current;
    setOpen(true); setSelected(null); setView("loading"); setFailure(null); setDeniedId(null);
    try {
      const detail = await client.fetchQuery({ queryKey: concernKeys.detail(scope, target.concernId), queryFn: () => loadConcernDetail(scope, target.concernId), staleTime: 0, retry: false });
      if (!current() || request !== activation.current) return "superseded";
      setSelected({ id: target.concernId, title: detail.title, target: target.messageId ? { messageId: target.messageId, seq } : null }); setView("chat");
      return "opened";
    } catch (error) {
      if (!current() || request !== activation.current) return "superseded";
      if (isConcernDenied(error)) await forgetConcern(client, scope, target.concernId);
      if (!current() || request !== activation.current) return "superseded";
      if (isConcernDenied(error)) setDeniedId(target.concernId);
      setFailure(isConcernDenied(error) ? "You no longer have access to this concern." : "Could not open concern. Return to the list and try again."); setView("error");
      return "unavailable";
    }
  }, [academyId, client, current, scope, setOpen]);
  const context = useMemo(() => ({ openConcern: (target: ConcernTarget) => activate(target) }), [activate]);
  const back = () => { activation.current += 1; setView("list"); setFailure(null); setDeniedId(null); };
  const title = view === "create" ? "New concern" : view === "recover" ? "Recover concern" : view === "chat" ? selected?.title ?? "Concern" : "Concerns";
  return <Context.Provider value={context}>{children}<TooltipProvider delayDuration={350}>
    <Button ref={launcher} className="fixed end-4 bottom-4 z-40 rounded-full shadow-lg" aria-label="Open concerns" aria-expanded={open} onClick={() => setOpen(true)}>
      <HugeiconsIcon icon={Message01Icon} strokeWidth={1.5} aria-hidden="true" /><span>Concerns</span>{unread.data && unread.data.messages > 0 && <Badge variant="secondary" aria-label={`${unread.data.messages} unread messages`}>{unread.data.messages}</Badge>}
      {unread.isError && <HugeiconsIcon icon={AlertCircleIcon} strokeWidth={1.5} aria-label="Unread count unavailable" />}
    </Button>
    {(open || everOpened) && <Activity mode={open ? "visible" : "hidden"}>
    <FloatingSheet open modal={mobile} onOpenChange={setOpen}>
      <FloatingSheetContent ref={content} data-concern-panel="" aria-modal={mobile || undefined} aria-describedby={undefined} showCloseButton={false}
        className={mobile ? "gap-0 rounded-none border-0" : "gap-0"}
        style={{ top: mobile ? 0 : undefined, bottom: mobile ? 0 : 80, right: mobile ? 0 : 16, width: mobile ? "100%" : 440, height: mobile ? "100dvh" : "min(720px, calc(100dvh - 104px))", maxWidth: "100%" }}
        onInteractOutside={(event) => { if (!mobile) event.preventDefault(); }}
        onOpenAutoFocus={(event) => { event.preventDefault(); const input = content.current?.querySelector<HTMLElement>("input:not([disabled]),textarea:not([disabled])") ?? content.current?.querySelector<HTMLElement>("button"); input?.focus(); }}
        onCloseAutoFocus={(event) => { event.preventDefault(); launcher.current?.focus(); }}>
        <header className="flex shrink-0 items-center gap-2 px-3 py-3">
          {view !== "list" && <ConcernIconButton label="Back to concerns" icon={ArrowLeft01Icon} onClick={back} />}
          <FloatingSheetTitle className="min-w-0 flex-1 truncate" title={title} dir="auto">{title}</FloatingSheetTitle>
          {view === "list" && owner && <ConcernIconButton label="Recover concern" icon={SquareUnlock02Icon} onClick={() => setView("recover")} />}
          {view === "list" && manager && <ConcernIconButton label="New concern" icon={PlusSignIcon} onClick={() => setView("create")} />}
          <ConcernIconButton label="Close concerns" icon={Cancel01Icon} onClick={() => setOpen(false)} />
        </header>
        <div className={view === "list" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
          {unread.isError && <ConcernFeedback retry={() => void unread.refetch()}>Could not load unread count</ConcernFeedback>}
          <ConcernInbox scope={scope} active={open && view === "list"} onSelect={(hit) => { void activate({ academyId, concernId: hit.concernId, ...(hit.messageId ? { messageId: hit.messageId } : {}) }, hit.seq); }} />
        </div>
        {view === "loading" && <ConcernFeedback>Opening concern…</ConcernFeedback>}
        {view === "error" && <ConcernFeedback>{failure}</ConcernFeedback>}
        {view === "error" && owner && deniedId && <RecoverConcern key={deniedId} scope={scope} initialId={deniedId} onRecovered={(id) => { void activate({ academyId, concernId: id }); }} />}
        {view === "recover" && owner && <RecoverConcern scope={scope} onRecovered={(id) => { void activate({ academyId, concernId: id }); }} />}
        {view === "create" && manager && <CreateConcern scope={scope} isCurrent={current} onCreated={(id) => { void activate({ academyId, concernId: id }); }} />}
        {selected && <div className={view === "chat" ? "flex min-h-0 flex-1 flex-col" : "hidden"}><ConcernConversation key={selected.id} scope={scope} concernId={selected.id} active={open && view === "chat"} target={selected.target} onDenied={denied} /></div>}
      </FloatingSheetContent>
    </FloatingSheet>
    </Activity>}
  </TooltipProvider></Context.Provider>;
}
