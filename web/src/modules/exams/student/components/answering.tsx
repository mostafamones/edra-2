"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { IconAlertCircle, IconChevronLeft, IconChevronRight, IconFlag, IconFlagFilled, IconInfoCircle, IconLoader2, IconSend } from "@tabler/icons-react";

import { ImageSourceProvider } from "@/components/shared/assessment/images/context";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { SidebarTrigger } from "@/components/shared/sidebar-trigger";
import { Skeleton } from "@/components/ui/skeleton";
import { Toggle } from "@/components/ui/toggle";
import { newUuid } from "@/lib/uuid";

import type { ExamAnsweringLifecycle, ExamAnsweringProps } from "../integration";
import { answeringApi } from "../answering/api";
import { onExamAccountChange } from "../answering/cleanup";
import { AnsweringController } from "../answering/controller";
import { current, isAnswered } from "../answering/drafts";
import { studentImageSource } from "../answering/images";
import { indexedDbJournal } from "../answering/journal";
import { clearRecoveryToken, storeRecoveryToken } from "../answering/ownership";
import { StudentExamQuestionView } from "./question";
import { StudentExamSidebar } from "./sidebar";
import { StudentExamSubmitDialog } from "./submission";
import { StudentExamTimer } from "./timer";

/** EDRA-233 surface. Entry holds the browser lock; EDRA-234 supplies departure detection. */
/** `sidebarAction` renders above Submit, such as the development warnings toggle. */
type Props = ExamAnsweringProps & { sidebarAction?: React.ReactNode };

export function StudentExamAnswering(props: Props) {
  return <AnsweringSession key={`${props.academyId}:${props.examId}:${props.attempt.id}`} {...props} />;
}

function AnsweringSession({ academyId, examId, attempt, editor, onFinished, onLifecycle, sidebarAction }: Props) {
  const [controller] = useState(() => new AnsweringController({
    api: answeringApi(academyId, examId), journal: indexedDbJournal, examId, token: editor.token,
    generation: editor.generation, heartbeatSeconds: editor.heartbeatSeconds,
    onToken: (token) => storeRecoveryToken(examId, token), uuid: newUuid, now: () => performance.now(),
    setTimer: (run, ms) => setTimeout(run, ms), clearTimer: (handle) => clearTimeout(handle), online: () => navigator.onLine,
  }));
  // This isolated in-memory cache disappears with the attempt; it never shares or persists signed URLs.
  const [queryClient] = useState(() => new QueryClient());
  const [source] = useState(() => studentImageSource(newUuid(), academyId, examId, () => controller.currentToken(), () => controller.canReadImages()));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const lifetime = useRef({ epoch: 0 });
  const handedBack = useRef(false);
  const remaining = useCallback(() => controller.remaining(), [controller]);
  const [confirming, setConfirming] = useState(false);
  const [flags, setFlags] = useState(() => readFlags(attempt.id));
  const finished = useEffectEvent(onFinished);
  const lifecycle = useEffectEvent((value: ExamAnsweringLifecycle | null) => onLifecycle?.(value));

  useEffect(() => {
    // Deferring lets StrictMode's probe cleanup cancel the first start without releasing the real claim.
    const guard = lifetime.current;
    const epoch = ++guard.epoch;
    let cancelled = false;
    const start = setTimeout(() => { if (!cancelled) void controller.start(); }, 0);
    const resync = () => controller.resync();
    const visible = () => { if (document.visibilityState === "visible") resync(); };
    const stop = onExamAccountChange(() => controller.signedOut());
    window.addEventListener("online", resync);
    window.addEventListener("offline", resync);
    window.addEventListener("pageshow", resync);
    document.addEventListener("visibilitychange", visible);
    return () => {
      cancelled = true;
      clearTimeout(start);
      stop();
      window.removeEventListener("online", resync);
      window.removeEventListener("offline", resync);
      window.removeEventListener("pageshow", resync);
      document.removeEventListener("visibilitychange", visible);
      // A subsequent StrictMode setup cancels disposal. Actual unload keeps the claim for safe refresh recovery.
      queueMicrotask(() => { if (guard.epoch === epoch) { controller.dispose(); queryClient.clear(); } });
    };
  }, [controller, queryClient]);

  const attemptId = attempt.id;
  const lifecycleReady = state.phase !== "finished";
  useEffect(() => {
    if (!attemptId || !lifecycleReady) return;
    // The account is verified by the answering read, never taken from browser storage.
    lifecycle({
      attemptId,
      currentQuestionId: () => controller.getSnapshot().currentId,
      departureContext: () => controller.departureContext(),
      currentToken: () => controller.currentToken(),
      recordDeparture: (eventId, context) => controller.recordDeparture(eventId, context),
      setEditBlock: (reason) => controller.setEditBlock(reason),
      getState: () => {
        const snapshot = controller.getSnapshot();
        return { finished: snapshot.phase === "finished", departureCount: snapshot.attempt?.departureCount ?? 0,
          pendingDeparture: snapshot.pendingDeparture, editBlock: snapshot.editBlock ?? snapshot.block?.message ?? null };
      },
      subscribe: controller.subscribe,
    });
    return () => lifecycle(null);
  }, [controller, attemptId, lifecycleReady]);

  useEffect(() => {
    if (state.phase !== "finished" || handedBack.current) return;
    handedBack.current = true;
    clearRecoveryToken(examId);
    try { sessionStorage.removeItem(flagKey(attemptId)); } catch { /* Nothing to clear. */ }
    finished();
  }, [state.phase, examId, attemptId]);

  const eligible = state.questions.filter((question) => !state.excluded.has(question.id));
  const question = eligible.find((item) => item.id === state.currentId);
  const index = eligible.findIndex((item) => item.id === state.currentId);
  const conflicts = new Set(Object.keys(state.drafts.conflicts));
  const unanswered = eligible.filter((item) => !isAnswered(current(state.drafts, item.id))).length;

  const flaggedCount = eligible.filter((item) => flags.has(item.id)).length;
  const toggleFlag = (id: string) => setFlags((previous) => {
    const next = new Set(previous);
    if (!next.delete(id)) next.add(id);
    writeFlags(attemptId, next);
    return next;
  });

  if (state.phase === "finished") return <Centered><p role="status">Returning to exam overview…</p></Centered>;
  if (state.phase === "loading") return <Centered><div role="status" aria-label="Loading exam" className="w-full max-w-xl space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div></Centered>;
  if (state.phase === "blocked") return <Centered><Alert role="alert" className="max-w-xl"><IconAlertCircle /><AlertTitle>{state.block?.message}</AlertTitle></Alert></Centered>;

  return (
    <QueryClientProvider client={queryClient}>
      <ImageSourceProvider source={source}>
        {/* h-auto!: the dev preview frame sizes every sidebar wrapper around its bar, which the exam covers. */}
        <SidebarProvider className="h-auto! min-h-0 flex-1 overflow-hidden">
          <StudentExamSidebar state={state} remaining={remaining} questions={eligible} unanswered={unanswered} flagged={flags} conflicts={conflicts}
            answered={(id) => isAnswered(current(state.drafts, id))} disabled={!controller.editable} submitting={state.phase === "submitting"}
            onSelect={(id) => controller.goTo(id)} onSubmit={() => setConfirming(true)} action={sidebarAction} />
          <SidebarInset className="min-h-0 overflow-y-auto">
            <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-2 border-b bg-background px-4">
              <SidebarTrigger aria-label="Questions" className="md:hidden" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-semibold">{question ? `Question ${question.number} of ${eligible.length}` : "Review"}</span>
                {question && state.partInstructions[question.partId]?.title && <span className="truncate text-xs text-muted-foreground">{state.partInstructions[question.partId].title}</span>}
              </div>
              <StudentExamTimer remaining={remaining} className="md:hidden" />
              {state.instructions && (
                <Popover>
                  <PopoverTrigger asChild><Button variant="outline" size="sm"><IconInfoCircle />Instructions</Button></PopoverTrigger>
                  <PopoverContent align="end" className="w-96 max-w-[calc(100vw-2rem)] text-sm whitespace-pre-wrap">{state.instructions}</PopoverContent>
                </Popover>
              )}
              {question && (
                <Toggle variant="outline" size="sm" pressed={flags.has(question.id)} onPressedChange={() => toggleFlag(question.id)}
                  aria-label={`Flag question ${question.number}`} className="aria-pressed:text-amber-600 dark:aria-pressed:text-amber-400">
                  {flags.has(question.id) ? <IconFlagFilled /> : <IconFlag />}{flags.has(question.id) ? "Flagged" : "Flag"}
                </Toggle>
              )}
            </header>
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-8 md:px-10">
              {(state.notice || state.editBlock || state.journal === "unavailable") && <Alert role="status"><IconAlertCircle /><AlertTitle>
                {state.editBlock ?? state.notice ?? "Pending answers can’t be kept on this device. Keep this page open until they are saved."}
              </AlertTitle></Alert>}
              <div inert={state.editBlock !== null} className="flex flex-col gap-8">
                {question ? <StudentExamQuestionView key={`${question.id}:${state.editBlock !== null}`} question={question} part={state.partInstructions[question.partId]}
                  value={current(state.drafts, question.id)} conflict={state.drafts.conflicts[question.id]} editable={controller.editable}
                  onChange={(value) => controller.setAnswer(question.id, value)} onResolve={(choice) => controller.resolveConflict(question.id, choice)} />
                  : <p role="status">Choose a question or submit your exam.</p>}
              </div>
            </div>
            <footer className="sticky bottom-0 z-20 mt-auto flex shrink-0 items-center justify-between gap-3 bg-background px-4 py-3">
              <Button variant="outline" disabled={!controller.editable || (index <= 0 && state.currentId !== null) || eligible.length === 0} onClick={() => state.currentId === null ? controller.goTo(eligible[eligible.length - 1].id) : controller.step(-1)}><IconChevronLeft />Previous</Button>
              {index >= 0 && index === eligible.length - 1
                ? <Button disabled={!controller.editable} onClick={() => setConfirming(true)}>
                  {state.phase === "submitting" ? <IconLoader2 className="animate-spin" /> : <IconSend />}Submit exam
                </Button>
                : <Button variant="outline" disabled={!controller.editable || index < 0} onClick={() => controller.step(1)}>Next<IconChevronRight /></Button>}
            </footer>
          </SidebarInset>
          <StudentExamSubmitDialog open={confirming && controller.editable} onOpenChange={setConfirming} unanswered={unanswered} flagged={flaggedCount} conflicts={conflicts.size}
            onSubmit={() => { setConfirming(false); controller.confirmSubmit(); }} />
        </SidebarProvider>
      </ImageSourceProvider>
    </QueryClientProvider>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 items-center justify-center p-6">{children}</div>;
}

/** Personal flags live only in this tab for this attempt; they never reach the server. */
const flagKey = (attemptId: string) => `edra:exam-flags:${attemptId}`;

function readFlags(attemptId: string): Set<string> {
  try { return new Set(JSON.parse(sessionStorage.getItem(flagKey(attemptId)) ?? "[]") as string[]); } catch { return new Set(); }
}

function writeFlags(attemptId: string, flags: ReadonlySet<string>) {
  try { sessionStorage.setItem(flagKey(attemptId), JSON.stringify([...flags])); } catch { /* Flags are a convenience; storage may be unavailable. */ }
}
