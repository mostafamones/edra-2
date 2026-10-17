"use client";

import { useMemo, useState, type ReactNode } from "react";
import { IconAlertCircle, IconChevronUp } from "@tabler/icons-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { SheetFooter } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatScore } from "@/lib/score";
import { answerEdits, initialDrafts, invalidMark, type AnswerDrafts } from "./draft";
import { PartEntry, type EntryMode, type FastDraft } from "./part";
import type { AnswerEdit, FastMark, MarkEdit, MarkPart, SaveOutcome, SavePayload } from "./types";

type Props = {
  parts: MarkPart[];
  /** The saved value of each question, by question id. */
  saved: Record<string, string>;
  feedback: string;
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
 * One student's marks inside a sheet: the parts (scrolling) and a footer with feedback and Save. Key it
 * by the student's version so it always starts from the saved values. Types supply the parts, the saved
 * values and how a save is sent.
 */
export function MarksForm({ parts: source, saved, feedback: savedFeedback, fast: fastOptions, readOnly = false, notice, confirm, saveLabel = "Save marks", allowEmpty = false, onSave, onDone }: Props) {
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
  const [answers, setAnswers] = useState<Record<string, AnswerDrafts>>(() => Object.fromEntries(parts.map((part) => [part.id, initialDrafts(part, saved)])));
  const [fast, setFast] = useState<Record<string, FastDraft>>(() => Object.fromEntries(parts.map((part) => {
    const mark = savedMarks.find((entry) => entry.partId === part.id);
    const direct = mark && !mark.fromAnswers;
    return [part.id, { score: direct ? formatScore(mark.score) : "", excused: mark?.kind === "excused", reason: mark?.reason ?? "" }];
  })));
  const [tab, setTab] = useState(parts[0]?.id);
  const [feedback, setFeedback] = useState(savedFeedback);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changes: MarkEdit[] = [];
  const edits: AnswerEdit[] = [];
  const values: Record<string, string> = {};
  let invalid = false;
  for (const part of parts) {
    Object.assign(values, answers[part.id]);
    if ((mode === "questions" || !fastEnabled) && part.entry !== "total") {
      const result = answerEdits(part, answers[part.id], saved);
      edits.push(...result.changes);
      if (result.invalid) invalid = true;
      continue;
    }
    if (!fastEnabled) continue;
    const draft = fast[part.id];
    const before = savedMarks.find((entry) => entry.partId === part.id);
    // A mark derived from answers is not a fast mark: an empty fast field leaves it alone.
    const direct = before && !before.fromAnswers ? before : undefined;
    const text = draft.score.trim();
    if (invalidMark(text, part.maxScore)) invalid = true;
    if (draft.excused && text !== "" && draft.reason.trim() === "") invalid = true;
    const unchanged = direct
      ? text !== "" && Number(text) === Number(direct.score) && draft.excused === (direct.kind === "excused") && (!draft.excused || draft.reason.trim() === direct.reason)
      : text === "";
    if (unchanged) continue;
    changes.push({ partId: part.id, score: text === "" ? null : text, ...(draft.excused && text !== "" ? { excusedReason: draft.reason.trim() } : {}) });
  }
  const feedbackChanged = feedback !== savedFeedback;
  const nothing = changes.length === 0 && edits.length === 0 && !feedbackChanged;

  async function save() {
    setAsking(false);
    setBusy(true);
    setError(null);
    try {
      const result = await onSave({ values, answers: edits, marks: changes, feedback: feedbackChanged ? feedback : undefined });
      if (!result.ok) setError(result.message);
      else if (result.saved) onDone();
    } catch {
      setError("Could not reach the server. Your entries are kept; try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pb-6">
        {notice}
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
                onDraftChange={(questionId, value) => setAnswers((current) => ({ ...current, [part.id]: { ...current[part.id], [questionId]: value } }))}
                fast={fast[part.id]} onFastChange={(next) => setFast((current) => ({ ...current, [part.id]: { ...current[part.id], ...next } }))} />
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {!readOnly && (
        <SheetFooter className="border-t">
          {/* Opens upward: the content sits above its trigger, so Save stays at the bottom. */}
          <Collapsible defaultOpen={savedFeedback !== ""} className="flex flex-col-reverse gap-2">
            <CollapsibleTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="group -ml-2 self-start text-muted-foreground">
                <IconChevronUp className="transition-transform group-data-[state=open]:rotate-180" />Feedback
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <Textarea id="feedback" aria-label="Feedback" rows={3} maxLength={5000} value={feedback} onChange={(event) => setFeedback(event.target.value)} />
            </CollapsibleContent>
          </Collapsible>
          <Button type="button" disabled={busy || invalid || (nothing && !allowEmpty)} onClick={() => (confirm ? setAsking(true) : void save())}>
            {busy ? "Saving…" : saveLabel}
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
