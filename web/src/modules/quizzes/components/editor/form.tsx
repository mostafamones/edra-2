"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { IconAlertCircle, IconInfoCircle, IconLoader2, IconLock, IconPlus } from "@tabler/icons-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { newUuid } from "@/lib/uuid";
import type { AcademyEntry } from "@/modules/academies";
import { useAcademyScope } from "@/modules/auth";
import { academicYearQueryKey, groupListQueryKey, loadActiveYear, loadGroups, loadStructure, structureQueryKey } from "@/modules/groups";
import { createNewQuiz, saveQuiz } from "../../actions";
import { quizPermissions } from "../../permissions";
import { quizzesRootKey } from "../../queries";
import type { Quiz, QuizPartKind } from "../../types";
import {
  draftIssues, emptyQuizValues, formErrors, MAX_PARTS, MAX_TIME_LIMIT, newPart, quizDraftSchema, quizToValues, valuesToDraft,
  type QuizFormValues,
} from "../../validation";
import { formatScore, sumScores } from "@/lib/score";
import { ISSUE_LABELS, KIND_LABELS } from "../shared/labels";
import { AudienceFields } from "./audience";
import { PartEditor } from "./part";

type Props = {
  academy: AcademyEntry;
  quiz?: Quiz;
  onSaved: (quiz: Quiz) => void;
  onCancel: (dirty: boolean) => void;
};

/** Create or edit a quiz's preparation. Loads the active year (new quizzes), levels, tracks and groups. */
export function QuizForm(props: Props) {
  const academyId = props.academy.id;
  const yearQuery = useQuery({ queryKey: academicYearQueryKey(academyId), queryFn: () => loadActiveYear(academyId), enabled: !props.quiz });
  const structureQuery = useQuery({ queryKey: structureQueryKey(academyId), queryFn: () => loadStructure(academyId) });
  const groupsQuery = useQuery({ queryKey: groupListQueryKey(academyId, false), queryFn: () => loadGroups(academyId) });
  const queries = [structureQuery, groupsQuery, ...(props.quiz ? [] : [yearQuery])];

  if (queries.some((query) => query.isError)) {
    return (
      <Alert variant="destructive">
        <IconAlertCircle />
        <AlertTitle>Couldn’t load the quiz form</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-3">
          <span>The academic year, levels or groups failed to load.</span>
          <Button variant="outline" size="sm" onClick={() => { for (const query of queries) if (query.isError) void query.refetch(); }}>Try again</Button>
        </AlertDescription>
      </Alert>
    );
  }
  if (!structureQuery.data || !groupsQuery.data || (!props.quiz && yearQuery.isPending)) {
    return <div role="status" aria-label="Loading the quiz form" className="flex flex-col gap-4"><Skeleton className="h-10" /><Skeleton className="h-40" /><Skeleton className="h-64" /></div>;
  }
  const yearId = props.quiz?.academicYearId ?? yearQuery.data?.id;
  if (!yearId) {
    return (
      <Alert>
        <IconInfoCircle />
        <AlertTitle>No active academic year</AlertTitle>
        <AlertDescription>Quizzes belong to an academic year. Start one before creating a quiz.</AlertDescription>
      </Alert>
    );
  }
  const groups = groupsQuery.data.year?.id === yearId ? groupsQuery.data.groups : [];
  return <FormBody {...props} academicYearId={yearId} structure={structureQuery.data} groups={groups} />;
}

type BodyProps = Props & {
  academicYearId: string;
  structure: Awaited<ReturnType<typeof loadStructure>>;
  groups: Awaited<ReturnType<typeof loadGroups>>["groups"];
};

function FormBody({ academy, quiz, onSaved, onCancel, academicYearId, structure, groups }: BodyProps) {
  const queryClient = useQueryClient();
  const isCurrentAcademy = useAcademyScope();
  const initial = useMemo(() => (quiz ? quizToValues(quiz) : emptyQuizValues()), [quiz]);
  const [values, setValues] = useState<QuizFormValues>(initial);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One id per create action, reused when the same create is retried.
  const createId = useRef(newUuid());
  const permissions = quiz ? quizPermissions(academy.role, quiz) : null;
  const structureLocked = permissions ? !permissions.editStructure : false;
  const targetLocked = permissions ? !permissions.editTarget : false;

  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  const errors = submitted ? formErrors(values) : {};
  const draft = valuesToDraft(values);
  const issues = draftIssues(draft);
  const total = sumScores(draft.parts.flatMap((part) => part.questions.map((question) => question.maxScore)));
  const set = (change: Partial<QuizFormValues>) => setValues((current) => ({ ...current, ...change }));

  async function save() {
    setSubmitted(true);
    setError(null);
    if (Object.keys(formErrors(values)).length > 0 || !quizDraftSchema.safeParse(draft).success) {
      setError("Some details aren’t valid. Check the highlighted fields.");
      return;
    }
    setSaving(true);
    try {
      const result = quiz
        ? await saveQuiz({ academyId: academy.id, quizId: quiz.id, expectedVersion: quiz.version, draft })
        : await createNewQuiz({ academyId: academy.id, academicYearId, quizId: createId.current, draft });
      if (!isCurrentAcademy(academy.id)) return;
      if (!result.ok) { setError(result.message); return; }
      void queryClient.invalidateQueries({ queryKey: quizzesRootKey(academy.id) });
      toast.success(result.quiz.ready ? "Quiz saved. It’s ready to receive work." : "Quiz saved. Finish setup before it can receive work.");
      onSaved(result.quiz);
    } catch {
      if (isCurrentAcademy(academy.id)) setError("Could not reach the server. Your changes are kept; try again.");
    } finally {
      setSaving(false);
    }
  }

  // Quiz-wide question numbers: each part starts after the questions of the parts before it.
  const firstNumbers = values.parts.map((_, index) => 1 + values.parts.slice(0, index).reduce((sum, part) => sum + part.questions.length, 0));
  const addPart = (kind: QuizPartKind) => set({ parts: [...values.parts, newPart(kind, values.parts.length + 1)] });

  return (
    <form className="flex flex-col gap-8" onSubmit={(event) => { event.preventDefault(); void save(); }} noValidate>
      {error && (
        <Alert variant="destructive">
          <IconAlertCircle />
          <AlertTitle>Not saved</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {(structureLocked || targetLocked) && (
        <Alert>
          <IconLock />
          <AlertTitle>{structureLocked ? "Questions are locked" : "Audience and timer are locked"}</AlertTitle>
          <AlertDescription>
            {structureLocked
              ? "Students or staff have recorded answers or marks, so parts, questions, choices and marks can’t change. You can still edit the title, instructions, model answers and solution notes. Owners, Head Admins and Admins can correct a key or exclude a question from the quiz page."
              : "Work has started, so the audience and timer can’t change. Parts and questions can change until answers or marks are recorded."}
          </AlertDescription>
        </Alert>
      )}

      <FieldSet>
        <FieldLegend>Basics</FieldLegend>
        <FieldGroup>
          <Field data-invalid={Boolean(errors.title) || undefined}>
            <FieldLabel htmlFor="quiz-title">Title</FieldLabel>
            <Input id="quiz-title" value={values.title} maxLength={200} aria-invalid={Boolean(errors.title) || undefined} onChange={(event) => set({ title: event.target.value })} />
            <FieldError>{errors.title}</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor="quiz-instructions">Instructions <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel>
            <Textarea id="quiz-instructions" value={values.instructions} rows={3} maxLength={10000} onChange={(event) => set({ instructions: event.target.value })} />
          </Field>
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend>Audience</FieldLegend>
        <AudienceFields academyId={academy.id} academicYearId={academicYearId} values={values} onChange={set} groups={groups}
          levels={structure.levels} tracks={structure.tracks} levelNames={structure.levelNames} errors={errors} disabled={targetLocked} />
      </FieldSet>

      <FieldSet>
        <FieldLegend>Timer</FieldLegend>
        <Field orientation="horizontal">
          <Switch id="quiz-timed" checked={values.timed} disabled={targetLocked} onCheckedChange={(timed) => set({ timed })} />
          <FieldLabel htmlFor="quiz-timed">Individual time limit</FieldLabel>
        </Field>
        {values.timed && (
          <Field data-invalid={Boolean(errors.timeLimit) || undefined} className="max-w-48">
            <FieldLabel htmlFor="quiz-time-limit">Minutes</FieldLabel>
            <Input id="quiz-time-limit" type="number" min={1} max={MAX_TIME_LIMIT} inputMode="numeric" value={values.timeLimit} disabled={targetLocked}
              aria-invalid={Boolean(errors.timeLimit) || undefined} onChange={(event) => set({ timeLimit: event.target.value })} />
            <FieldError>{errors.timeLimit}</FieldError>
          </Field>
        )}
        <FieldDescription>
          Each online attempt ends at the earlier of its own deadline and the window’s actual closure, two minutes after the scheduled close. Owners, Head Admins and Admins set the window on the quiz page.
        </FieldDescription>
      </FieldSet>

      <section className="flex flex-col gap-4" aria-labelledby="quiz-parts-heading">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="quiz-parts-heading" className="font-heading text-lg font-semibold">Parts</h2>
          <span className="text-sm text-muted-foreground tabular-nums">{total === null ? "—" : formatScore(total)} marks</span>
        </div>
        {errors.parts && <p className="text-sm text-destructive">{errors.parts}</p>}
        {values.parts.map((part, index) => (
          <PartEditor key={part.id ?? `new-${index}`} index={index} part={part} firstNumber={firstNumbers[index]} count={values.parts.length} errors={errors} locked={structureLocked}
            onChange={(next) => set({ parts: values.parts.map((entry, position) => position === index ? next : entry) })}
            onMove={(offset) => {
              const parts = [...values.parts];
              [parts[index], parts[index + offset]] = [parts[index + offset], parts[index]];
              set({ parts });
            }}
            onRemove={() => set({ parts: values.parts.filter((_, position) => position !== index) })} />
        ))}
        {!structureLocked && values.parts.length < MAX_PARTS && (
          <div className="flex flex-wrap gap-2">
            {(["question_sheet", "written_work"] as const).map((kind) => (
              <Button key={kind} type="button" variant="outline" onClick={() => addPart(kind)}><IconPlus />Add {KIND_LABELS[kind]} part</Button>
            ))}
          </div>
        )}
      </section>

      <FieldSet>
        <FieldLegend>Solutions</FieldLegend>
        <Field>
          <FieldLabel htmlFor="quiz-solutions">Solution notes <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel>
          <Textarea id="quiz-solutions" value={values.solutionNotes} rows={3} maxLength={10000} onChange={(event) => set({ solutionNotes: event.target.value })} />
          <FieldDescription>
            Released with the correct answers and model answers only to qualifying students: online submissions at actual closure, physical work once closed and its result is announced.
          </FieldDescription>
        </Field>
      </FieldSet>

      {issues.length > 0 && (
        <Alert>
          <IconInfoCircle />
          <AlertTitle>Not ready to receive work yet</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">{[...new Set(issues.map((issue) => ISSUE_LABELS[issue.issue]))].map((label) => <li key={label}>{label}.</li>)}</ul>
            You can save it as is and finish later.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col-reverse gap-2 border-t pt-6 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" disabled={saving} onClick={() => onCancel(dirty)}>Cancel</Button>
        <Button type="submit" disabled={saving}>{saving && <IconLoader2 className="animate-spin" />}{quiz ? "Save changes" : "Create quiz"}</Button>
      </div>
    </form>
  );
}
