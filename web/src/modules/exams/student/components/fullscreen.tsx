"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ExamAnsweringProps } from "../integration";
import { enterFullscreen, examFullscreen } from "../fullscreen";
import { StudentExamAnswering } from "./answering";

/** Alert and Button compose existing shadcn foundations; the answering timer stays mounted. */
export function FullscreenExamAnswering(props: ExamAnsweringProps) {
  const monitor = props.departures!;
  const { onLifecycle } = props;
  const state = useSyncExternalStore(monitor.subscribe, monitor.getSnapshot, monitor.getSnapshot);
  const [error, setError] = useState<string | null>(null);
  const lifecycle = useCallback((value: Parameters<typeof monitor.attach>[0]) => { monitor.attach(value); onLifecycle?.(value); }, [monitor, onLifecycle]);
  return <div className="min-h-screen overflow-y-auto space-y-4">
    {state.blocked && <Alert role="alert"><AlertTitle>{state.message ?? (state.pending ? "Recording departure…" : `Warning ${state.count} of 2`)}</AlertTitle>
      {!state.pending && <Button onClick={() => {
        if (examFullscreen()) { monitor.continue(); return; }
        void enterFullscreen().then((ok) => { if (ok) { setError(null); monitor.continue(); } else setError("Allow fullscreen to continue the exam."); });
      }}>{typeof document !== "undefined" && examFullscreen() ? "Continue" : "Return to fullscreen"}</Button>}
      {error && <p role="alert">{error}</p>}
    </Alert>}
    <StudentExamAnswering {...props} onLifecycle={lifecycle} onFinished={() => { monitor.finish(); props.onFinished(); }} />
  </div>;
}
