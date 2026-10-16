"use client";

import { IconLock } from "@tabler/icons-react";

import { AudienceFields } from "@/components/shared/assessment/audience";
import { BasicsStep } from "@/components/shared/assessment/basics";
import { draftValidation } from "@/components/shared/assessment/draft-form";
import { AssessmentFormLoader, type FormContext } from "@/components/shared/assessment/load";
import type { FormStatus } from "@/components/shared/assessment/page";
import { AssessmentFormShell, type SaveResult } from "@/components/shared/assessment/shell";
import { SheetPartEditor } from "@/components/shared/assessment/sheet/part";
import { sheetTotal, summarizeSheetPart } from "@/components/shared/assessment/sheet/types";
import { SolutionsFields } from "@/components/shared/assessment/solutions";
import { PartsList } from "@/components/shared/assessment/parts-list";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { AcademyEntry } from "@/modules/academies";
import { createNewQuiz, saveQuiz } from "../../actions";
import { quizPermissions } from "../../permissions";
import { quizzesRootKey } from "../../queries";
import type { Quiz, QuizDraft, QuizPartKind } from "../../types";
import {
  emptyQuizValues, formErrors, MAX_PARTS, newPart, quizDraftSchema, quizToValues, valuesToDraft, type FormPart, type QuizFormValues,
} from "../../validation";
import { AudienceCount } from "./count";
import { ReviewStep } from "./review";
import { detach, KINDS, SHEET } from "./sheet";
import { TimerFields } from "./timer";

export type { FormStatus };

type Props = {
  /** The parent re-mounts the form when the academy changes. */
  academy: AcademyEntry;
  quiz?: Quiz;
  onSaved: (quiz: Quiz) => void;
  onCancel: () => void;
  onStatusChange?: (status: FormStatus) => void;
};

const BASICS_FIELDS = ["title", "instructions", "audience", "levelId", "trackId", "groupIds", "timed", "timeLimit", "solutionNotes"];

const { resolver, parse } = draftValidation<QuizFormValues, QuizDraft>({ check: formErrors, toDraft: valuesToDraft, schema: quizDraftSchema });
const toValues = (quiz?: Quiz) => (quiz ? quizToValues(quiz) : emptyQuizValues());

/** Create or edit a quiz's preparation. Loads the active year (new quizzes), levels, tracks and groups. */
export function QuizForm(props: Props) {
  return (
    <AssessmentFormLoader academyId={props.academy.id} noun="quiz" entityYearId={props.quiz?.academicYearId}>
      {(context) => <QuizFields {...props} context={context} />}
    </AssessmentFormLoader>
  );
}

async function commit(academyId: string, context: FormContext, base: Quiz | undefined, draft: QuizDraft, createId: string): Promise<SaveResult<Quiz>> {
  const result = base
    ? await saveQuiz({ academyId, quizId: base.id, expectedVersion: base.version, draft })
    : await createNewQuiz({ academyId, academicYearId: context.academicYearId, quizId: createId, draft });
  return result.ok ? { ok: true, entity: result.quiz } : { ok: false, message: result.message, conflict: result.code === "quiz_conflict" };
}

function QuizFields({ academy, quiz, onSaved, onCancel, onStatusChange, context }: Props & { context: FormContext }) {
  const { academicYearId, levels, tracks, levelNames, groups } = context;
  const permissions = quiz ? quizPermissions(academy.role, quiz) : null;
  const structureLocked = permissions ? !permissions.editStructure : false;
  const targetLocked = permissions ? !permissions.editTarget : false;

  return (
    <AssessmentFormShell
      academy={academy} noun="quiz" route="quizzes" entity={quiz} locked={structureLocked || targetLocked}
      toValues={toValues} resolver={resolver} parse={parse}
      commit={(base, draft, createId) => commit(academy.id, context, base, draft, createId)}
      rootKey={quizzesRootKey(academy.id)}
      savedMessage={(saved) => (saved.ready ? "Quiz saved. It’s ready to receive work." : "Quiz saved. Finish setup before it can receive work.")}
      basicsFields={BASICS_FIELDS}
      notice={(structureLocked || targetLocked) && (
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
      basics={(
        <BasicsStep idPrefix="quiz" titlePlaceholder="e.g. Unit 3 quiz" sections={[
          {
            label: "Audience",
            content: (
              <AudienceFields idPrefix="quiz" groups={groups} levels={levels} tracks={tracks} levelNames={levelNames} disabled={targetLocked}
                optional={{ hint: "You can save without an audience; the quiz can’t receive work until it has one." }}
                count={<AudienceCount academyId={academy.id} academicYearId={academicYearId} />} />
            ),
          },
          { label: "Timer", content: <TimerFields disabled={targetLocked} /> },
          {
            label: "Solutions",
            content: (
              <SolutionsFields idPrefix="quiz"
                description="Released with the correct answers and model answers only to qualifying students: online submissions at actual closure, physical work once closed and its result is announced." />
            ),
          },
        ]} />
      )}
      parts={({ edit }) => (
        <PartsList<FormPart> locked={structureLocked} onEdit={edit} maxParts={MAX_PARTS} minParts={0}
          summarize={(part, index) => summarizeSheetPart(part, index, SHEET)} kinds={KINDS}
          create={(kind, position) => newPart(kind as QuizPartKind, position)} detach={detach} total={sheetTotal} />
      )}
      review={({ editDetails, editPart }) => (
        <ReviewStep levelNames={levelNames} tracks={tracks} groups={groups} onEditDetails={editDetails} onEditPart={editPart} />
      )}
      partEditor={({ index, select, close }) => <SheetPartEditor config={SHEET} index={index} locked={structureLocked} onSelect={select} onClose={close} />}
      onSaved={onSaved} onCancel={onCancel} onStatusChange={onStatusChange}
    />
  );
}
