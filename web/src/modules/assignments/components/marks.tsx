"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { IconAlertCircle, IconChevronUp } from "@tabler/icons-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SheetFooter } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useAcademyScope } from "@/modules/auth";
import { saveStudentMarks } from "../actions";
import { assignmentsRootKey } from "../queries";
import { answerChanges, initialDrafts, invalidMark, type AnswerDrafts } from "../answers";
import { formatScore } from "../score";
import type { AnswerChange, Assignment, MarkChange, StudentWork } from "../types";
import { PartEntry, type EntryMode, type FastDraft } from "./part-entry";
import { useAttemptKey } from "./use-marks";

type FormProps = {
  assignment: Assignment;
  student: StudentWork;
  onChanged: (student: StudentWork) => void;
  /** A student found by code: saves send the code and are bound to this student. */
  resolvedCode?: string | null;
  /** Called with the saved row after marks were saved (not on a conflict). */
  onSaved?: (student: StudentWork) => void;
};

/**
 * One student's marks inside a sheet: the parts (scrolling) and a footer with feedback and Save. Key it
 * by the student's version so it always starts from the saved values.
 */
export function MarksForm({ assignment, student, onChanged, resolvedCode, onSaved }: FormProps) {
  const queryClient = useQueryClient();
  const isCurrentAcademy = useAcademyScope();
  const attempt = useAttemptKey();
  // One mode for every part (legacy parts always take a total). A student marked only with fast or
  // excused marks opens in fast mode; everyone else starts question by question.
  const [mode, setMode] = useState<EntryMode>(() => {
    const typedMarks = student.marks.filter((mark) => assignment.parts.some((part) => part.id === mark.partId && part.kind !== null));
    return typedMarks.length > 0 && typedMarks.every((mark) => !mark.fromAnswers) ? "fast" : "questions";
  });
  const [answers, setAnswers] = useState<Record<string, AnswerDrafts>>(() => Object.fromEntries(assignment.parts.map((part) => [
    part.id, initialDrafts(part, student.answers),
  ])));
  const [fast, setFast] = useState<Record<string, FastDraft>>(() => Object.fromEntries(assignment.parts.map((part) => {
    const mark = student.marks.find((entry) => entry.partId === part.id);
    const direct = mark && !mark.fromAnswers;
    return [part.id, { score: direct ? formatScore(mark.score) : "", excused: mark?.kind === "excused", reason: mark?.reason ?? "" }];
  })));
  const [tab, setTab] = useState(assignment.parts[0]?.id);
  const [feedback, setFeedback] = useState(student.feedback);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changes: MarkChange[] = [];
  const answerEdits: AnswerChange[] = [];
  let invalid = false;
  for (const part of assignment.parts) {
    if (mode === "questions" && part.kind !== null) {
      const result = answerChanges(part, answers[part.id], student.answers);
      answerEdits.push(...result.changes);
      if (result.invalid) invalid = true;
      continue;
    }
    const draft = fast[part.id];
    const saved = student.marks.find((entry) => entry.partId === part.id);
    // A mark derived from answers is not a fast mark: an empty fast field leaves it alone.
    const direct = saved && !saved.fromAnswers ? saved : undefined;
    const text = draft.score.trim();
    if (invalidMark(text, part.maxScore)) invalid = true;
    if (draft.excused && text !== "" && draft.reason.trim() === "") invalid = true;
    const unchanged = direct
      ? text !== "" && Number(text) === Number(direct.score) && draft.excused === (direct.kind === "excused") && (!draft.excused || draft.reason.trim() === direct.reason)
      : text === "";
    if (unchanged) continue;
    changes.push({ partId: part.id, score: text === "" ? null : text, ...(draft.excused && text !== "" ? { excusedReason: draft.reason.trim() } : {}) });
  }
  const feedbackChanged = feedback !== student.feedback;

  async function save() {
    const academyId = assignment.academyId;
    setBusy(true);
    setError(null);
    try {
      const payload = { marks: changes, answers: answerEdits, feedback: feedbackChanged ? feedback : undefined };
      const result = await saveStudentMarks({
        academyId, assignmentId: assignment.id, expectedVersion: student.version,
        ...(resolvedCode ? { recordId: null, code: resolvedCode, expectedRecordId: student.recordId } : { recordId: student.recordId, code: null }),
        ...payload, key: attempt.keyFor(JSON.stringify([resolvedCode, student.version, payload])),
      });
      if (!isCurrentAcademy(academyId)) return;
      if (!result.ok) { setError(result.message); return; }
      attempt.reset();
      onChanged(result.student);
      if (result.outcome === "conflict") toast.warning("This student was changed elsewhere. The latest values are shown; review and save again.");
      else {
        toast.success(result.outcome === "unchanged" ? "Nothing to change." : "Marks saved.");
        onSaved?.(result.student);
      }
      void queryClient.invalidateQueries({ queryKey: assignmentsRootKey(academyId) });
    } catch {
      if (isCurrentAcademy(academyId)) setError("Could not reach the server. Your entries are kept; try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pb-6">
        {error && (
          <Alert variant="destructive">
            <IconAlertCircle />
            <AlertTitle>Not saved</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Tabs value={tab} onValueChange={setTab} className="gap-5">
          {assignment.parts.length > 1 && (
            <TabsList variant="line" className="w-full overflow-x-auto border-b">
              {assignment.parts.map((part) => (
                <TabsTrigger key={part.id} value={part.id}>{part.title}</TabsTrigger>
              ))}
            </TabsList>
          )}
          {assignment.parts.map((part, index) => (
            <TabsContent key={part.id} value={part.id}>
              <PartEntry part={part} saved={student.marks.find((entry) => entry.partId === part.id)}
                mode={mode} onModeChange={setMode}
                onNextPart={index < assignment.parts.length - 1 ? () => setTab(assignment.parts[index + 1].id) : undefined}
                drafts={answers[part.id]}
                onDraftChange={(questionId, value) => setAnswers((current) => ({ ...current, [part.id]: { ...current[part.id], [questionId]: value } }))}
                fast={fast[part.id]} onFastChange={(next) => setFast((current) => ({ ...current, [part.id]: { ...current[part.id], ...next } }))} />
            </TabsContent>
          ))}
        </Tabs>
      </div>

      <SheetFooter className="border-t">
        {/* Opens upward: the content sits above its trigger, so Save stays at the bottom. */}
        <Collapsible defaultOpen={student.feedback !== ""} className="flex flex-col-reverse gap-2">
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="group -ml-2 self-start text-muted-foreground">
              <IconChevronUp className="transition-transform group-data-[state=open]:rotate-180" />Feedback
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Textarea id="feedback" aria-label="Feedback" rows={3} maxLength={5000} value={feedback} onChange={(event) => setFeedback(event.target.value)} />
          </CollapsibleContent>
        </Collapsible>
        <Button type="button" disabled={busy || invalid || (changes.length === 0 && answerEdits.length === 0 && !feedbackChanged)} onClick={() => void save()}>
          {busy ? "Saving…" : "Save marks"}
        </Button>
      </SheetFooter>
    </>
  );
}
