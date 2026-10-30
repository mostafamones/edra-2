"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { IconAlertCircle } from "@tabler/icons-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { SheetFooter } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMarkingGuard } from "./guard";
import { olderVersion, reconcileSnapshot, sameSnapshot, type MarkBaseline, type MarkSnapshot } from "./snapshot";
import { answerEdits, invalidMark } from "./draft";
import { PartEntry, type EntryMode } from "./part";
import type { AnswerEdit, FastMark, MarkEdit, MarkPart, SaveOutcome, SavePayload } from "./types";

type Props = {
  baseline: MarkBaseline;
  parts: MarkPart[];
  /** Typed part totals and excused adjustments; types without them leave this out. */
  fast?: { saved: FastMark[] };
  /** Nothing can be entered: the viewer may look but not mark. */
  readOnly?: boolean;
  /** Above the parts: a conflict, an online attempt in progress, why something is locked. */
  notice?: ReactNode;
  /** Asks before saving, when saving does more than record marks (such as accepting physical work). */
  confirm?: { title: string; body: string; action: string };
  /** The save button's text, and whether it may be pressed with nothing entered (such as confirming received work). */
  saveLabel?: string;
  allowEmpty?: boolean;
  onSave: (payload: SavePayload) => Promise<SaveOutcome>;
  onDone: () => void;
};

/**
 * One student's marks inside a sheet: the parts (scrolling) and a footer with Save. Key it
 * by academy, assessment and annual record. Refreshes reconcile with its acknowledged baseline.
 * Types supply the scoring basis, authoritative save result and how a save is sent.
 */
export function MarksForm({ baseline: incoming, parts: source, fast: fastOptions, readOnly = false, notice, confirm, saveLabel = "Save marks", allowEmpty = false, onSave, onDone }: Props) {
  const fastEnabled = fastOptions !== undefined;
  const savedMarks = useMemo(() => fastOptions?.saved ?? [], [fastOptions]);
  const parts = useMemo(() => (readOnly
    ? source.map((part) => ({ ...part, questions: part.questions.map((question) => ({ ...question, locked: true })) }))
    : source), [source, readOnly]);
  // One mode for every part (legacy parts always take a total). A student marked only with fast or
  // excused marks opens in fast mode; everyone else starts question by question.
  const [mode, setMode] = useState<EntryMode>(() => {
    const typed = savedMarks.filter((mark) => parts.some((part) => part.id === mark.partId && part.entry !== "total"));
    return fastEnabled && typed.length > 0 && typed.every((mark) => !mark.fromAnswers) ? "fast" : "questions";
  });
  const [baseline, setBaseline] = useState(incoming);
  const [observed, setObserved] = useState(`${incoming.basis}:${incoming.version}`);
  const [draft, setDraft] = useState(incoming.snapshot);
  const live = useRef(draft);
  const mounted = useRef(false);
  const pending = useRef<{ snapshot: MarkSnapshot; payload: SavePayload; send: Props["onSave"] } | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [review, setReview] = useState(false);
  const [tab, setTab] = useState(parts[0]?.id);
  const feedback = draft.feedback;
  const fast = draft.fast;
  const answers = Object.fromEntries(parts.map((part) => [part.id, Object.fromEntries(part.questions.map((q) => [q.id, draft.values[q.id] ?? ""]))]));
  function change(next: MarkSnapshot) { live.current = next; setDraft(next); }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = !sameSnapshot(draft, baseline.snapshot, parts);
  useLayoutEffect(() => { live.current = draft; }, [draft]);
  if (!busy && !uncertain && !review && `${incoming.basis}:${incoming.version}` !== observed) {
    setObserved(`${incoming.basis}:${incoming.version}`);
    if (!olderVersion(incoming.version, baseline.version)) {
      if (incoming.basis !== baseline.basis || (incoming.version !== baseline.version && dirty)) setReview(true);
      else { setDraft(reconcileSnapshot(draft, baseline.snapshot, incoming.snapshot)); setBaseline(incoming); }
    }
  }

  const changes: MarkEdit[] = [];
  const edits: AnswerEdit[] = [];
  const values: Record<string, string> = {};
  let invalid = false;
  for (const part of parts) {
    Object.assign(values, answers[part.id]);
    if ((mode === "questions" || !fastEnabled) && part.entry !== "total") {
      const result = answerEdits(part, answers[part.id], baseline.snapshot.values);
      edits.push(...result.changes);
      if (result.invalid) invalid = true;
      continue;
    }
    if (!fastEnabled) continue;
    const draft = fast[part.id];
    const direct = baseline.snapshot.fast[part.id];
    const text = draft.score.trim();
    if (invalidMark(text, part.maxScore)) invalid = true;
    if (draft.excused && text !== "" && draft.reason.trim() === "") invalid = true;
    const unchanged = direct
      ? ((text === "" && direct.score === "") || (text !== "" && direct.score !== "" && Number(text) === Number(direct.score))) && draft.excused === direct.excused && (!draft.excused || draft.reason.trim() === direct.reason)
      : text === "";
    if (unchanged) continue;
    changes.push({ partId: part.id, score: text === "" ? null : text, ...(draft.excused && text !== "" ? { excusedReason: draft.reason.trim() } : {}) });
  }
  const lockedEdits = parts.flatMap((part) => part.questions).filter((q) => q.locked && draft.values[q.id] !== baseline.snapshot.values[q.id]);
  const feedbackChanged = feedback !== baseline.snapshot.feedback;
  const nothing = changes.length === 0 && edits.length === 0 && !feedbackChanged;

  async function save(finish = true): Promise<boolean> {
    if (busy || review || (invalid && !pending.current) || readOnly) return false;
    setAsking(false);
    setBusy(true);
    setError(null);
    // Keep both the payload and adapter closure on an uncertain retry: its expected version and
    // multi-stage progress belong to that request, even if the user has typed something newer.
    const request = pending.current ?? { snapshot: live.current, payload: { values, answers: edits, marks: changes, feedback: feedbackChanged ? feedback : undefined }, send: onSave };
    pending.current = request;
    try {
      const result = await request.send(request.payload);
      if (!mounted.current) return false;
      if (result.baseline) {
        change(reconcileSnapshot(live.current, request.snapshot, result.baseline.snapshot));
        setBaseline(result.baseline);
      }
      if (!result.ok) {
        setError(result.message);
        setUncertain(Boolean(result.uncertain));
        if (!result.uncertain) pending.current = null;
        return false;
      }
      pending.current = null;
      setUncertain(false);
      if (!result.saved || !result.baseline) {
        setReview(true);
        setError(result.message ?? "Saved information changed. Review the latest values before saving again.");
        return false;
      }
      const clean = sameSnapshot(live.current, result.baseline.snapshot, parts);
      if (clean && finish) onDone();
      return clean;
    } catch {
      if (mounted.current) { setUncertain(true); setError("The save outcome is unknown. Retry to check the original request. Your newer entries are kept."); }
      return false;
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  useMarkingGuard({ dirty: dirty || review, busy, uncertain, save: () => save(false) });

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pb-6">
        {notice}
        {lockedEdits.length > 0 && dirty && <Alert><IconAlertCircle /><AlertTitle>Some newer entries are now locked</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-2"><span>Final submission or a scoring correction locked these entries. Their saved values remain authoritative.</span>
            <Button type="button" variant="outline" size="sm" disabled={busy || uncertain} onClick={() => change({ ...live.current, values: { ...live.current.values, ...Object.fromEntries(lockedEdits.map((q) => [q.id, baseline.snapshot.values[q.id] ?? ""])) } })}>Use saved locked entries</Button>
          </AlertDescription></Alert>}
        {review && <Alert>
          <IconAlertCircle /><AlertTitle>Review changed information</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-2">
            <span>Your entries are kept. Compare them with the latest saved work and scoring basis before continuing.</span>
            <Button type="button" variant="outline" size="sm" onClick={() => {
              change(reconcileSnapshot(live.current, baseline.snapshot, incoming.snapshot));
              setBaseline(incoming); setObserved(`${incoming.basis}:${incoming.version}`); setReview(false); setError(null);
            }}>Review with latest basis</Button>
          </AlertDescription>
        </Alert>}
        {error && (
          <Alert variant="destructive">
            <IconAlertCircle />
            <AlertTitle>Not saved</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Tabs value={tab} onValueChange={setTab} className="gap-5">
          {parts.length > 1 && (
            <TabsList variant="line" className="w-full overflow-x-auto border-b">
              {parts.map((part) => <TabsTrigger key={part.id} value={part.id}>{part.title}</TabsTrigger>)}
            </TabsList>
          )}
          {parts.map((part, index) => (
            <TabsContent key={part.id} value={part.id}>
              <PartEntry part={part} saved={savedMarks.find((entry) => entry.partId === part.id)} fastEnabled={fastEnabled}
                mode={mode} onModeChange={setMode}
                onNextPart={index < parts.length - 1 ? () => setTab(parts[index + 1].id) : undefined}
                drafts={answers[part.id]}
                onDraftChange={(questionId, value) => change({ ...live.current, values: { ...live.current.values, [questionId]: value } })}
                fast={fast[part.id]} onFastChange={(next) => change({ ...live.current, fast: { ...live.current.fast, [part.id]: { ...live.current.fast[part.id], ...next } } })} />
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {!readOnly && (
        <SheetFooter className="border-t">
          <Button type="button" disabled={busy || review || (!uncertain && (invalid || (nothing && !allowEmpty)))} onClick={() => (confirm ? setAsking(true) : void save())}>
            {busy ? "Saving…" : uncertain ? "Retry original save" : saveLabel}
          </Button>
        </SheetFooter>
      )}

      {confirm && (
        <AlertDialog open={asking} onOpenChange={setAsking}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirm.title}</AlertDialogTitle>
              <AlertDialogDescription>{confirm.body}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void save()}>{confirm.action}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
