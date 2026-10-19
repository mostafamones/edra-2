"use client";

import { useState } from "react";
import { IconLock } from "@tabler/icons-react";

import { AudienceFields } from "@/components/shared/assessment/audience";
import { ImagesProvider } from "@/components/shared/assessment/images/context";
import { BasicsStep } from "@/components/shared/assessment/basics";
import { draftValidation } from "@/components/shared/assessment/draft-form";
import { AssessmentFormLoader, type FormContext } from "@/components/shared/assessment/load";
import type { FormStatus } from "@/components/shared/assessment/page";
import { AssessmentFormShell, type SaveResult } from "@/components/shared/assessment/shell";
import { newStash, PartEditor, type PartStash } from "@/components/shared/assessment/parts/editor";
import { sheetTotal, summarizeSheetPart } from "@/components/shared/assessment/sheet/types";
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
import { ReviewStep } from "./review";
import { KIND_LABELS } from "../shared/labels";
import { detach, KINDS, PARTS } from "./sheet";
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
  return result.ok ? { ok: true, entity: result.quiz } : { ok: false, message: result.message, conflict: result.code === "quiz_conflict", uncertain: result.code === "unavailable" };
}

function QuizFields({ academy, quiz, onSaved, onCancel, onStatusChange, context }: Props & { context: FormContext }) {
  // What the part editor set aside while the form is open; it survives moving between parts.
  const [stash] = useState<PartStash>(newStash);
  const { levels, tracks, levelNames, groups } = context;
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
              ? "Students or staff have recorded answers or marks, so parts, questions, choices and marks can’t change. You can still edit the title, instructions. Owners, Head Admins and Admins can correct a key or exclude a question from the quiz page."
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
                optional />
            ),
          },
          { label: "Timer", content: <TimerFields disabled={targetLocked} /> },
        ]} />
      )}
      parts={({ edit }) => (
        <PartsList<FormPart> locked={structureLocked} onEdit={edit} maxParts={MAX_PARTS} minParts={0}
          summarize={(part, index) => summarizeSheetPart(part, index, KIND_LABELS)} kinds={KINDS}
          create={(kind, position) => newPart(kind as QuizPartKind, position)} detach={detach} total={sheetTotal} />
      )}
      review={({ editDetails, editPart }) => (
        <ReviewStep levelNames={levelNames} tracks={tracks} groups={groups} onEditDetails={editDetails} onEditPart={editPart} />
      )}
      partEditor={({ index, select, close }) => <PartEditor config={PARTS} index={index} locked={structureLocked} stash={stash} onSelect={select} onClose={close} />}
      wrap={(children) => <ImagesProvider academyId={academy.id}>{children}</ImagesProvider>}
      onSaved={onSaved} onCancel={onCancel} onStatusChange={onStatusChange}
    />
  );
}
