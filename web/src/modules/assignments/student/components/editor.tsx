"use client";

import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconAlertCircle, IconChevronLeft, IconChevronRight, IconCircleCheck, IconCloudOff, IconDeviceFloppy, IconLoader2 } from "@tabler/icons-react";

import { ImageSourceProvider, type ImageSource } from "@/components/shared/assessment/images/context";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { newUuid } from "@/lib/uuid";
import { cn } from "@/lib/utils";

import { claimAssignmentEditor, readAssignmentEditor, renewAssignmentEditor, saveAssignmentAnswers, signAssignmentImages, submitAssignment } from "../actions";
import { blockedMessage } from "../errors";
import { clearLocalDraft, conflictsAgainst, editorToken, loadLocalDraft, reconcile, storeLocalDraft, type PendingOperation } from "../local";
import type { Answers, EditorDocument, StudentAssignmentErrorCode, StudentAssignmentFailure } from "../types";
import { StudentAssignmentPart } from "./part";
import { StudentAssignmentSubmit } from "./submit";
import { StudentAssignmentWrittenWork } from "./written";

type Props = { academyId: string; assignmentId: string; userId: string; dueAt: string | null };
type Phase = "claiming" | "busy" | "editing" | "stale" | "blocked" | "failed";
type SaveState = "idle" | "saving" | "retrying" | "failed";

const BLOCKING = new Set<StudentAssignmentErrorCode>([
  "submitted", "result_announced", "assignment_closed", "online_unavailable", "not_recipient", "in_person_disabled", "entitlement_required",
  "not_found", "student_unavailable", "forbidden",
]);
const RENEW_MS = 30_000;

/** Conflicts only for questions still answerable (an excluded question cannot be resolved or saved). */
function answerable(conflicts: Answers, doc: EditorDocument): Answers {
  const ids = new Set(doc.parts.flatMap((part) => part.questions.map((question) => question.id)));
  return Object.fromEntries(Object.entries(conflicts).filter(([id]) => ids.has(id)));
}

/**
 * The single active editor for one assignment draft: claims an expiring server-owned generation,
 * autosaves choices (kept on this device until acknowledged), uploads Written Work and submits once.
 * Another tab or device stays read-blocked until the student explicitly moves editing to it.
 */
export function StudentAssignmentEditor({ academyId, assignmentId, userId, dueAt }: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("claiming");
  const [doc, setDoc] = useState<EditorDocument | null>(null);
  const [pending, setPending] = useState<Answers>({});
  const [conflicts, setConflicts] = useState<Answers>({});
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [kept, setKept] = useState(true);
  const [online, setOnline] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [partIndex, setPartIndex] = useState(0);
  const [uploading, setUploading] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const token = useRef<string | null>(null);
  const docRef = useRef<EditorDocument | null>(null);
  const pendingRef = useRef<Answers>({});
  const conflictsRef = useRef<Answers>({});
  const operation = useRef<PendingOperation | null>(null);
  const saving = useRef(false);
  // Refs mirror the latest state for async save/submit callbacks.
  const applyDoc = useCallback((next: EditorDocument | null) => { docRef.current = next; setDoc(next); }, []);
  const applyPending = useCallback((next: Answers) => { pendingRef.current = next; setPending(next); }, []);
  const applyConflicts = useCallback((next: Answers) => { conflictsRef.current = next; setConflicts(next); }, []);

  const base = useCallback(() => ({ academyId, assignmentId, token: token.current! }), [academyId, assignmentId]);
  const persist = useCallback((next: Answers, current: EditorDocument | null = docRef.current) => {
    if (!current) return;
    setKept(storeLocalDraft(userId, current.recordId, assignmentId, {
      generation: current.generation, baseVersion: current.version, pending: next, conflicts: conflictsRef.current, operation: operation.current,
    }));
  }, [userId, assignmentId]);
  const forget = useCallback(() => { const current = docRef.current; if (current) clearLocalDraft(userId, current.recordId, assignmentId); }, [userId, assignmentId]);

  const reclaim = useRef<(() => void) | null>(null);
  const fail = useCallback((failure: StudentAssignmentFailure) => {
    // A lapsed lease (e.g. a throttled background tab) recovers with this tab's own token; a live
    // editor elsewhere answers busy, and a newer generation turns pending choices into conflicts.
    if (failure.code === "editor_stale") { if (reclaim.current) reclaim.current(); else setPhase("stale"); }
    else if (BLOCKING.has(failure.code)) { setProblem(failure.message); setPhase("blocked"); }
    return failure;
  }, []);

  const claim = useCallback(async (transfer: boolean, recovering = false) => {
    token.current ??= editorToken(userId, assignmentId);
    const result = await claimAssignmentEditor({ ...base(), operation: "claim", ...(transfer ? { transfer: true } : {}) });
    if (!result.ok) {
      if (BLOCKING.has(result.code)) fail(result);
      else { setProblem(result.message); setPhase("failed"); }
      return;
    }
    if ("busy" in result.data) { setPhase(recovering ? "stale" : "busy"); return; }
    const claimed = result.data;
    const outcome = reconcile(loadLocalDraft(userId, claimed.recordId, assignmentId), claimed);
    operation.current = outcome.kind === "resume" ? outcome.draft.operation : null;
    applyDoc(claimed);
    applyPending(outcome.kind === "resume" ? outcome.draft.pending : {});
    applyConflicts(answerable(outcome.kind === "resume" ? outcome.draft.conflicts : outcome.kind === "conflicts" ? outcome.conflicts : {}, claimed));
    persist(pendingRef.current, claimed);
    setPhase("editing");
  }, [applyConflicts, applyDoc, applyPending, assignmentId, base, fail, persist, userId]);

  // A repeated claim with this tab's token is harmless (StrictMode probes run it twice).
  const start = useEffectEvent(() => { void claim(false); });
  useEffect(() => { const timer = setTimeout(start, 0); return () => clearTimeout(timer); }, []);
  const retryClaim = (transfer: boolean) => { setPhase("claiming"); void claim(transfer); };
  useEffect(() => { reclaim.current = () => { setPhase("claiming"); void claim(false, true); }; }, [claim]);

  // Keep the claim alive; a lost lease or a transfer elsewhere stops editing here.
  useEffect(() => {
    if (phase !== "editing") return;
    const timer = setInterval(async () => {
      const result = await renewAssignmentEditor({ ...base(), operation: "renew" });
      if (!result.ok) fail(result);
    }, RENEW_MS);
    return () => clearInterval(timer);
  }, [phase, base, fail]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);

  // Newer saved work wins the display; this device's differing choices wait as conflicts.
  const reload = useCallback(async () => {
    const result = await readAssignmentEditor({ ...base(), operation: "read" });
    if (!result.ok) { fail(result); return; }
    operation.current = null;
    applyConflicts(answerable(conflictsAgainst({ ...conflictsRef.current, ...pendingRef.current }, result.data.answers), result.data));
    applyDoc(result.data);
    applyPending({});
    persist({}, result.data);
  }, [applyConflicts, applyDoc, applyPending, base, fail, persist]);

  // One save in flight. An uncertain save is retried with its exact payload until answered.
  const flush = useCallback(async () => {
    const current = docRef.current;
    if (saving.current || !current || phase !== "editing") return;
    if (!operation.current) {
      const answers = pendingRef.current;
      if (Object.keys(answers).length === 0) return;
      operation.current = { kind: "save", payload: { ...base(), operation: "save", generation: current.generation, version: current.version, key: newUuid(), answers } };
      persist(answers, current);
    }
    if (operation.current.kind !== "save") return;
    const sent = operation.current.payload as { answers: Answers };
    saving.current = true;
    setSaveState("saving");
    const result = await saveAssignmentAnswers(operation.current.payload);
    saving.current = false;
    if (result.ok) {
      operation.current = null;
      const next = Object.fromEntries(Object.entries(pendingRef.current).filter(([id, value]) => sent.answers[id] !== value));
      const acknowledged = { ...current, version: result.data.version, answers: { ...current.answers, ...sent.answers } };
      applyDoc(acknowledged);
      applyPending(next);
      persist(next, acknowledged);
      setSaveState("idle");
      return;
    }
    if (result.code === "unavailable" || result.code === "throttled") { setSaveState("retrying"); setAttempt((count) => count + 1); return; }
    operation.current = null;
    setSaveState("failed");
    if (result.code === "draft_conflict" || result.code === "question_excluded" || result.code === "idempotency_conflict") {
      if (result.code === "question_excluded") setNotice(result.message);
      await reload();
      setSaveState("idle");
      return;
    }
    fail(result);
    setProblem(result.message);
  }, [applyDoc, applyPending, base, fail, persist, phase, reload]);

  useEffect(() => {
    if (phase !== "editing" || Object.keys(pending).length === 0) return;
    const timer = setTimeout(() => { void flush(); }, saveState === "retrying" ? 4000 : 600);
    return () => clearTimeout(timer);
  }, [pending, phase, flush, saveState, online, attempt]);

  const choose = (questionId: string, choiceId: string | null) => {
    const next = { ...pendingRef.current, [questionId]: choiceId };
    if (questionId in conflictsRef.current) applyConflicts(Object.fromEntries(Object.entries(conflictsRef.current).filter(([id]) => id !== questionId)));
    applyPending(next);
    persist(next);
  };
  // Explicit per-question resolution; keeping this device's answer saves it under the current editor.
  const resolve = (questionId: string, keep: "saved" | "mine") => {
    const mine = conflictsRef.current[questionId] ?? null;
    applyConflicts(Object.fromEntries(Object.entries(conflictsRef.current).filter(([id]) => id !== questionId)));
    if (keep === "mine") choose(questionId, mine);
    else persist(pendingRef.current);
  };

  const images = useMemo<ImageSource>(() => ({
    scope: `assignment:${userId}:${assignmentId}:${doc?.generation ?? 0}`,
    lifetimeSeconds: 60,
    resolve: async (id) => {
      const result = await signAssignmentImages({ ...base(), imageIds: [id] });
      if (!result.ok || !result.data[id]) throw new Error("Image unavailable");
      return result.data[id];
    },
  }), [assignmentId, base, doc?.generation, userId]);

  const submit = useCallback(async () => {
    const current = docRef.current;
    if (!current) return null;
    if (operation.current?.kind !== "submit") {
      operation.current = { kind: "submit", payload: { ...base(), operation: "submit", generation: current.generation, version: current.version, key: newUuid(), scoringRevision: current.scoringRevision } };
      persist({}, current);
    }
    const result = await submitAssignment(operation.current.payload);
    if (result.ok) {
      operation.current = null;
      forget();
      router.refresh();
      return null;
    }
    // A lost response keeps the same identity for the next attempt; other answers end this one.
    if (result.code !== "unavailable" && result.code !== "throttled") { operation.current = null; persist({}, current); }
    if (result.code === "draft_conflict") await reload();
    if (result.code === "editor_stale" || result.code === "submitted" || BLOCKING.has(result.code)) fail(result);
    if (result.code === "submitted") router.refresh();
    return result.message;
  }, [base, fail, forget, persist, reload, router]);

  if (phase === "claiming") return <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><IconLoader2 className="size-4 animate-spin" aria-hidden="true" />Opening your work…</p>;
  if (phase === "busy" || phase === "stale") {
    return (
      <Alert>
        <IconAlertCircle aria-hidden="true" />
        <AlertTitle>{phase === "busy" ? "This assignment is open on another device or tab" : "Editing moved to another device or tab"}</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-3">
          {phase === "stale" && Object.keys(pending).length > 0 && <span>Answers not yet saved here are kept on this device. If you continue here, you can choose which to keep.</span>}
          <Button onClick={() => retryClaim(true)}>Continue on this device</Button>
        </AlertDescription>
      </Alert>
    );
  }
  if (phase === "blocked" || phase === "failed" || !doc) {
    return (
      <Alert variant={phase === "failed" ? "destructive" : "default"}>
        <IconAlertCircle aria-hidden="true" />
        <AlertTitle>{problem ?? blockedMessage("unavailable")}</AlertTitle>
        {phase === "failed" && <AlertDescription><Button variant="outline" onClick={() => retryClaim(false)}>Try again</Button></AlertDescription>}
      </Alert>
    );
  }

  const answers = { ...doc.answers, ...pending };
  const part = doc.parts[Math.min(partIndex, doc.parts.length - 1)];
  // Pending choices stay listed until acknowledged, including those of an uncertain save.
  const unsaved = Object.keys(pending).length > 0;
  return (
    <ImageSourceProvider source={images}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="Parts" className="flex flex-wrap gap-2">
            {doc.parts.map((entry, index) => (
              <Button key={entry.id} type="button" size="sm" variant={entry.id === part.id ? "default" : "outline"}
                aria-current={entry.id === part.id ? "step" : undefined} onClick={() => setPartIndex(index)}>
                {entry.title || `Part ${index + 1}`}
                {entry.questions.some((question) => question.id in conflicts) && <span className="sr-only">, has answers to resolve</span>}
                {entry.questions.some((question) => question.id in conflicts) && <IconAlertCircle aria-hidden="true" className="text-amber-600" />}
              </Button>
            ))}
          </nav>
          <SaveStatus unsaved={unsaved} state={saveState} online={online} kept={kept} />
        </div>
        {Object.keys(conflicts).length > 0 && (
          <Alert>
            <IconAlertCircle aria-hidden="true" />
            <AlertTitle>Some answers on this device differ from your saved work</AlertTitle>
            <AlertDescription>Choose which answer to keep for each marked question.</AlertDescription>
          </Alert>
        )}
        {notice && (
          <Alert>
            <IconAlertCircle aria-hidden="true" />
            <AlertTitle>{notice}</AlertTitle>
            <AlertDescription><Button variant="outline" size="sm" onClick={() => setNotice(null)}>Dismiss</Button></AlertDescription>
          </Alert>
        )}
        {part.kind === "file_upload" ? (
          <StudentAssignmentWrittenWork part={part} doc={doc} editor={base} onDocument={applyDoc} onUploading={(delta) => setUploading((count) => count + delta)} onFailure={fail} />
        ) : (
          <StudentAssignmentPart part={part} answers={answers} conflicts={conflicts} onChoose={choose} onResolve={resolve} />
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={partIndex === 0} onClick={() => setPartIndex(partIndex - 1)}><IconChevronLeft aria-hidden="true" />Previous part</Button>
            <Button type="button" variant="outline" disabled={partIndex >= doc.parts.length - 1} onClick={() => setPartIndex(partIndex + 1)}>Next part<IconChevronRight aria-hidden="true" /></Button>
          </div>
          <StudentAssignmentSubmit doc={doc} answers={answers} dueAt={dueAt} conflicts={Object.keys(conflicts).length}
            busy={unsaved || saveState === "saving" || uploading > 0} onSubmit={submit} />
        </div>
      </div>
    </ImageSourceProvider>
  );
}

function SaveStatus({ unsaved, state, online, kept }: { unsaved: boolean; state: SaveState; online: boolean; kept: boolean }) {
  const status = !unsaved ? { icon: IconCircleCheck, text: "All answers saved", warn: false, spin: false }
    : state === "failed" ? { icon: IconCloudOff, text: "Not saved", warn: true, spin: false }
    : !online || state === "retrying" ? (kept ? { icon: IconDeviceFloppy, text: "Offline · Kept on this device", warn: true, spin: false } : { icon: IconCloudOff, text: "Offline · Not saved", warn: true, spin: false })
    : state === "saving" ? { icon: IconLoader2, text: "Saving…", warn: false, spin: true }
    : { icon: IconDeviceFloppy, text: kept ? "Pending · Kept on this device" : "Pending", warn: false, spin: false };
  return (
    <span role="status" aria-live="polite" className={cn("inline-flex items-center gap-1.5 text-sm", status.warn ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
      <status.icon className={cn("size-4", status.spin && "animate-spin")} aria-hidden="true" />{status.text}
    </span>
  );
}
