"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconAlertCircle, IconLoader2, IconPlayerPlay } from "@tabler/icons-react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { startStudentExam } from "../actions";
import { studentFailure } from "../errors";
import { examEntryIntegration } from "../integration";
import type { StudentExamAttempt } from "../types";

/**
 * Start exam / Resume exam. One explicit click: fullscreen is requested from the click itself, the
 * trusted start runs only after it succeeds, and the acknowledged attempt is handed to the answering
 * integration. Disabled until the answering and fullscreen integrations are registered.
 */
export function StudentExamEntry({ academyId, examId, resume }: { academyId: string; examId: string; resume: boolean }) {
  const router = useRouter();
  const [attempt, setAttempt] = useState<StudentExamAttempt | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const integration = examEntryIntegration;

  if (integration && attempt) {
    const { Answering } = integration;
    return <Answering academyId={academyId} examId={examId} attempt={attempt} onFinished={() => { setAttempt(null); router.refresh(); }} />;
  }

  async function enter() {
    if (!integration || pending) return;
    setError(null);
    if (!integration.fullscreenSupported()) {
      setError("This browser can’t open the exam in fullscreen. Use a different browser to continue.");
      return;
    }
    // Requested synchronously inside the click so the browser keeps the user activation.
    const fullscreen = integration.enterFullscreen();
    setPending(true);
    try {
      if (!(await fullscreen)) {
        setError("The exam needs fullscreen. Allow fullscreen and try again.");
        return;
      }
      // A lost acknowledgment is retried by clicking again: the server returns the same attempt.
      const result = await startStudentExam({ academyId, examId }).catch(() => studentFailure("unavailable"));
      if (result.ok && result.active) {
        setAttempt(result.attempt);
        return;
      }
      await integration.exitFullscreen();
      if (!result.ok) setError(result.message);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Button size="lg" className="self-start" disabled={!integration || pending} onClick={enter}>
        {pending ? <IconLoader2 className="animate-spin" aria-hidden="true" /> : <IconPlayerPlay aria-hidden="true" />}
        {resume ? "Resume exam" : "Start exam"}
      </Button>
      {error && (
        <Alert variant="destructive" role="alert">
          <IconAlertCircle aria-hidden="true" />
          <AlertTitle>{error}</AlertTitle>
        </Alert>
      )}
    </div>
  );
}
