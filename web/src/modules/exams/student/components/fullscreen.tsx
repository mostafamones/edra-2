"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { IconAlertTriangle, IconArrowsMaximize, IconBug, IconLoader2 } from "@tabler/icons-react";

import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogMedia, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { ExamAnsweringProps } from "../integration";
import { enterFullscreen, examFullscreen } from "../fullscreen";
import { StudentExamAnswering } from "./answering";

/**
 * The exam's own environment: a portal over the whole page (portal sidebar and header included).
 * A departure or lost window focus blurs everything; departures also raise the warning dialog.
 * The answering timer stays mounted throughout.
 */
export function FullscreenExamAnswering(props: ExamAnsweringProps) {
  const monitor = props.departures!;
  const { onLifecycle } = props;
  const state = useSyncExternalStore(monitor.subscribe, monitor.getSnapshot, monitor.getSnapshot);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(() => document.hasFocus());
  const [warnings, setWarnings] = useState(true);
  const lifecycle = useCallback((value: Parameters<typeof monitor.attach>[0]) => { monitor.attach(value); onLifecycle?.(value); }, [monitor, onLifecycle]);

  useEffect(() => {
    const focus = () => setFocused(true);
    const blur = () => setFocused(false);
    window.addEventListener("focus", focus);
    window.addEventListener("blur", blur);
    return () => { window.removeEventListener("focus", focus); window.removeEventListener("blur", blur); };
  }, []);

  // Development only: stop departure detection so tabbing out to devtools or the editor isn't recorded.
  const toggleWarnings = () => {
    if (warnings) monitor.stop(); else monitor.start();
    setWarnings(!warnings);
  };

  const inFullscreen = examFullscreen();
  const resume = () => {
    if (examFullscreen()) { monitor.continue(); return; }
    void enterFullscreen().then((ok) => { if (ok) { setError(null); monitor.continue(); } else setError("Allow fullscreen to continue the exam."); });
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex bg-background text-foreground">
      <div aria-hidden={state.blocked || undefined} className={cn("flex min-h-0 min-w-0 flex-1 transition-[filter] duration-200",
        (state.blocked || (!focused && warnings)) && "pointer-events-none blur-xl select-none")}>
        <StudentExamAnswering {...props} sidebarAction={process.env.NODE_ENV !== "production" && (
          <Button variant="outline" className="w-full" onClick={toggleWarnings}>
            <IconBug aria-hidden="true" />{warnings ? "Dev: disable warnings" : "Dev: enable warnings"}
          </Button>
        )} onLifecycle={lifecycle} onFinished={() => { monitor.finish(); props.onFinished(); }} />
      </div>
      <AlertDialog open={state.blocked}>
        <AlertDialogContent onEscapeKeyDown={(event) => event.preventDefault()}>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive"><IconAlertTriangle /></AlertDialogMedia>
            <AlertDialogTitle>{state.pending ? "Recording departure…" : `Warning ${state.count} of 2`}</AlertDialogTitle>
            <AlertDialogDescription>
              {state.message ?? "You left the exam. Leaving again may end your attempt."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <AlertDialogFooter>
            <Button disabled={state.pending} onClick={resume}>
              {state.pending ? <IconLoader2 className="animate-spin" aria-hidden="true" /> : <IconArrowsMaximize aria-hidden="true" />}
              {inFullscreen ? "Continue" : "Return to fullscreen"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>,
    document.body,
  );
}
