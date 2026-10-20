"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { IconAlertCircle, IconChevronLeft, IconChevronRight, IconLoader2 } from "@tabler/icons-react";

import { ImageSourceProvider } from "@/components/shared/assessment/images/context";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { newUuid } from "@/lib/uuid";

import type { ExamAnsweringLifecycle, ExamAnsweringProps } from "../integration";
import { answeringApi } from "../answering/api";
import { onExamAccountChange } from "../answering/cleanup";
import { AnsweringController } from "../answering/controller";
import { current, isAnswered } from "../answering/drafts";
import { studentImageSource } from "../answering/images";
import { indexedDbJournal } from "../answering/journal";
import { clearRecoveryToken, storeRecoveryToken } from "../answering/ownership";
import { StudentExamNavigator } from "./navigator";
import { StudentExamQuestionView } from "./question";
import { StudentExamSaveStatus } from "./save-status";
import { StudentExamSubmitDialog } from "./submission";
import { StudentExamTimer } from "./timer";

/** EDRA-233 surface. Entry holds the browser lock; EDRA-234 supplies departure detection. */
export function StudentExamAnswering(props: ExamAnsweringProps) {
  return <AnsweringSession key={`${props.academyId}:${props.examId}:${props.attempt.id}`} {...props} />;
}

function AnsweringSession({ academyId, examId, editor, onFinished, onLifecycle }: ExamAnsweringProps) {
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

  const attemptId = state.attempt?.id;
  const lifecycleReady = state.phase !== "loading" && state.phase !== "finished";
  useEffect(() => {
    if (!attemptId || !lifecycleReady) return;
    // The account is verified by the answering read, never taken from browser storage.
    lifecycle({
      attemptId,
      currentQuestionId: () => controller.getSnapshot().currentId,
      recordDeparture: (eventId) => controller.recordDeparture(eventId),
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
    finished();
  }, [state.phase, examId]);

  const eligible = state.questions.filter((question) => !state.excluded.has(question.id));
  const question = eligible.find((item) => item.id === state.currentId);
  const index = eligible.findIndex((item) => item.id === state.currentId);
  const conflicts = new Set(Object.keys(state.drafts.conflicts));
  const unanswered = eligible.filter((item) => !isAnswered(current(state.drafts, item.id))).length;

  if (state.phase === "finished") return <p role="status">Returning to exam overview…</p>;
  if (state.phase === "loading") return <div role="status" aria-label="Loading exam" className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>;
  if (state.phase === "blocked") return <Alert role="alert"><IconAlertCircle /><AlertTitle>{state.block?.message}</AlertTitle></Alert>;

  return (
    <QueryClientProvider client={queryClient}>
      <ImageSourceProvider source={source}>
        <div className="flex flex-col gap-6">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-xl font-semibold">{state.title}</h1>
            <StudentExamTimer remaining={remaining} />
            <StudentExamSaveStatus state={state} />
          </header>
          {state.instructions && <p className="whitespace-pre-wrap">{state.instructions}</p>}
          {(state.notice || state.editBlock || state.journal === "unavailable") && <Alert role="status"><IconAlertCircle /><AlertTitle>
            {state.editBlock ?? state.notice ?? "Pending answers can’t be kept on this device. Keep this page open until they are saved."}
          </AlertTitle></Alert>}
          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_13rem]">
            <div className="min-w-0 space-y-6">
              {question ? <StudentExamQuestionView key={question.id} question={question} part={state.partInstructions[question.partId]}
                value={current(state.drafts, question.id)} conflict={state.drafts.conflicts[question.id]} editable={controller.editable}
                onChange={(value) => controller.setAnswer(question.id, value)} onResolve={(choice) => controller.resolveConflict(question.id, choice)} />
                : <p role="status">Choose a question or submit your exam.</p>}
              <div className="flex flex-wrap justify-between gap-3">
                <Button variant="outline" disabled={index <= 0 && state.currentId !== null} onClick={() => state.currentId === null ? controller.goTo(eligible[eligible.length - 1].id) : controller.step(-1)}><IconChevronLeft />Previous</Button>
                <Button variant="outline" disabled={index < 0 || index === eligible.length - 1} onClick={() => controller.step(1)}>Next<IconChevronRight /></Button>
              </div>
            </div>
            <div className="space-y-4">
              <StudentExamNavigator questions={eligible} currentId={state.currentId} answered={(id) => isAnswered(current(state.drafts, id))}
                conflicts={conflicts} onSelect={(id) => controller.goTo(id)} />
              <Button className="w-full" disabled={!controller.editable} onClick={() => setConfirming(true)}>
                {state.phase === "submitting" && <IconLoader2 className="animate-spin" />}Submit exam
              </Button>
            </div>
          </div>
          <StudentExamSubmitDialog open={confirming && state.phase === "ready"} onOpenChange={setConfirming} unanswered={unanswered} conflicts={conflicts.size}
            onSubmit={() => { setConfirming(false); controller.confirmSubmit(); }} />
        </div>
      </ImageSourceProvider>
    </QueryClientProvider>
  );
}
