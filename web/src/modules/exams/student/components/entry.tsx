"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { IconAlertCircle, IconLoader2, IconPlayerPlay } from "@tabler/icons-react";

import { useAuth } from "@/modules/auth";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { ExamDepartureMonitor } from "../departures/signals";
import { enterStudentExam } from "../actions";
import { acquireEditorLock, clearRecoveryToken, readRecoveryToken, storeRecoveryToken, type EditorLock } from "../answering/ownership";
import { recoverDeparture } from "../answering/recovery";
import { studentFailure } from "../errors";
import { examEntryIntegration } from "../integration";
import type { StudentExamEntry as Entry } from "../types";

/** Fullscreen first, then atomic start/claim. The Web Lock prevents copied sessionStorage reuse. */
export function StudentExamEntry({ academyId, examId, resume }: { academyId: string; examId: string; resume: boolean }) {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [entry, setEntry] = useState<(Entry & { departures: ExamDepartureMonitor }) | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef<EditorLock | null>(null);
  const entering = useRef(false);
  const mounted = useRef(true);
  const monitor = useRef<ExamDepartureMonitor | null>(null);
  const lifetime = useRef({ epoch: 0 });
  const integration = examEntryIntegration;

  useEffect(() => {
    mounted.current = true;
    const guard = lifetime.current;
    const current = ++guard.epoch;
    return () => {
      mounted.current = false;
      queueMicrotask(() => {
        if (guard.epoch !== current) return;
        monitor.current?.stop();
        if (lock.current?.status === "held") lock.current.release();
        void integration.exitFullscreen();
      });
    };
  }, [integration]);

  const finish = async () => {
    entering.current = true;
    setPending(true);
    monitor.current?.finish();
    monitor.current = null;
    clearRecoveryToken(examId);
    if (lock.current?.status === "held") lock.current.release();
    lock.current = null;
    setEntry(null);
    await integration.exitFullscreen();
    entering.current = false;
    if (mounted.current) { setPending(false); router.refresh(); }
  };

  if (integration && entry?.active && entry.editor?.status === "claimed") {
    const { Answering } = integration;
    return <Answering departures={entry.departures} academyId={academyId} examId={examId} attempt={entry.attempt} editor={entry.editor} onFinished={finish} />;
  }

  async function enter() {
    if (!integration || entering.current || loading || !user) return;
    setError(null);
    if (!integration.fullscreenSupported()) {
      setError("This browser can’t open the exam in fullscreen. Use a different browser to continue.");
      return;
    }
    // Keep acquisition inside the click's user activation, before the first awaited operation.
    const fullscreen = integration.enterFullscreen();
    entering.current = true;
    setPending(true);
    let removeEntrySignals = () => {};
    let departedDuringEntry = false;
    try {
      if (!(await fullscreen)) { setError("The exam needs fullscreen. Allow fullscreen and try again."); return; }
      if (!mounted.current) { await integration.exitFullscreen(); return; }
      const entrySignal = () => { if (document.visibilityState === "hidden" || document.fullscreenElement !== document.documentElement) departedDuringEntry = true; };
      document.addEventListener("visibilitychange", entrySignal);
      document.addEventListener("fullscreenchange", entrySignal);
      window.addEventListener("pagehide", entrySignal);
      removeEntrySignals = () => {
        document.removeEventListener("visibilitychange", entrySignal);
        document.removeEventListener("fullscreenchange", entrySignal);
        window.removeEventListener("pagehide", entrySignal);
      };
      entrySignal();
      lock.current = await acquireEditorLock(examId);
      if (!mounted.current) { if (lock.current.status === "held") lock.current.release(); return; }
      if (lock.current.status === "taken") {
        setError("This exam is open in another tab. Return to that tab or close it and try again.");
        await integration.exitFullscreen();
        return;
      }
      // Without an exclusive browser lock, wait for the old server lease instead of reusing a token.
      const previousToken = readRecoveryToken(examId);
      const recovered = await recoverDeparture(user.id, academyId, examId, previousToken);
      if (!recovered.ok) {
        if (lock.current.status === "held") lock.current.release();
        lock.current = null;
        await integration.exitFullscreen();
        setError(recovered.message);
        return;
      }
      const token = lock.current.status === "held" ? previousToken : null;
      const result = await enterStudentExam({ academyId, examId, token }).catch(() => studentFailure("unavailable"));
      if (!mounted.current) {
        if (result.ok && result.editor?.status === "claimed") storeRecoveryToken(examId, result.editor.token);
        if (lock.current?.status === "held") lock.current.release();
        await integration.exitFullscreen();
        return;
      }
      if (result.ok && result.active && result.editor?.status === "claimed") {
        storeRecoveryToken(examId, result.editor.token);
        monitor.current = new ExamDepartureMonitor({ accountId: user.id, academyId, examId, attemptId: result.attempt.id,
          token: result.editor.token, generation: result.editor.generation });
        if (recovered.warning) monitor.current.restore(recovered.warning.event, recovered.warning.count);
        monitor.current.start();
        if (departedDuringEntry) monitor.current.signal();
        setEntry({ ...result, departures: monitor.current });
        return;
      }
      if (lock.current.status === "held") lock.current.release();
      lock.current = null;
      await integration.exitFullscreen();
      if (!result.ok) setError(result.message);
      else if (result.editor?.status === "busy") setError(`This exam is open in another tab or device. Try again in ${result.editor.retryAfter} seconds.`);
      router.refresh();
    } catch {
      if (lock.current?.status === "held") lock.current.release();
      lock.current = null;
      if (mounted.current) setError("Couldn’t open the exam. Try again.");
      await integration.exitFullscreen();
    } finally {
      removeEntrySignals();
      entering.current = false;
      if (mounted.current) setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Button size="lg" className="self-start" disabled={!integration || pending || loading || !user} onClick={enter}>
        {pending ? <IconLoader2 className="animate-spin" aria-hidden="true" /> : <IconPlayerPlay aria-hidden="true" />}
        {resume ? "Resume exam" : "Start exam"}
      </Button>
      {error && <Alert variant="destructive" role="alert"><IconAlertCircle aria-hidden="true" /><AlertTitle>{error}</AlertTitle></Alert>}
    </div>
  );
}
