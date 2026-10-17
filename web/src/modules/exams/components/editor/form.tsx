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
import { createNewExam, saveExam } from "../../actions";
import { examPermissions } from "../../permissions";
import { examsRootKey } from "../../queries";
import type { Exam, ExamDraft, ExamPartKind } from "../../types";
import {
  emptyExamValues, formErrors, MAX_PARTS, newPart, examDraftSchema, examToValues, valuesToDraft, type FormPart, type ExamFormValues,
} from "../../validation";
import { ReviewStep } from "./review";
import { KIND_LABELS } from "../shared/labels";
import { detach, KINDS, PARTS } from "./sheet";
import { TimerFields } from "./timer";

export type { FormStatus };

type Props = {
  /** The parent re-mounts the form when the academy changes. */
  academy: AcademyEntry;
  exam?: Exam;
  onSaved: (exam: Exam) => void;
  onCancel: () => void;
  onStatusChange?: (status: FormStatus) => void;
};

const BASICS_FIELDS = ["title", "instructions", "audience", "levelId", "trackId", "groupIds", "timeLimit", "solutionNotes"];

const { resolver, parse } = draftValidation<ExamFormValues, ExamDraft>({ check: formErrors, toDraft: valuesToDraft, schema: examDraftSchema });
const toValues = (exam?: Exam) => (exam ? examToValues(exam) : emptyExamValues());

/** Create or edit a exam's preparation. Loads the active year (new exams), levels, tracks and groups. */
export function ExamForm(props: Props) {
  return (
    <AssessmentFormLoader academyId={props.academy.id} noun="exam" entityYearId={props.exam?.academicYearId}>
      {(context) => <ExamFields {...props} context={context} />}
    </AssessmentFormLoader>
  );
}

async function commit(academyId: string, context: FormContext, base: Exam | undefined, draft: ExamDraft, createId: string): Promise<SaveResult<Exam>> {
  const result = base
    ? await saveExam({ academyId, examId: base.id, expectedVersion: base.version, draft })
    : await createNewExam({ academyId, academicYearId: context.academicYearId, examId: createId, draft });
  return result.ok ? { ok: true, entity: result.exam } : { ok: false, message: result.message, conflict: result.code === "exam_conflict" };
}

function ExamFields({ academy, exam, onSaved, onCancel, onStatusChange, context }: Props & { context: FormContext }) {
  // What the part editor set aside while the form is open; it survives moving between parts.
  const [stash] = useState<PartStash>(newStash);
  const { levels, tracks, levelNames, groups } = context;
  const permissions = exam ? examPermissions(academy.role, exam) : null;
  const structureLocked = permissions ? !permissions.editStructure : false;
  const targetLocked = permissions ? !permissions.editTarget : false;

  return (
    <AssessmentFormShell
      academy={academy} noun="exam" route="exams" entity={exam} locked={structureLocked || targetLocked}
      toValues={toValues} resolver={resolver} parse={parse}
      commit={(base, draft, createId) => commit(academy.id, context, base, draft, createId)}
      rootKey={examsRootKey(academy.id)}
      savedMessage={(saved) => (saved.ready ? "Exam saved. It’s ready to receive work." : "Exam saved. Finish setup before it can receive work.")}
      basicsFields={BASICS_FIELDS}
      notice={(structureLocked || targetLocked) && (
        <Alert>
          <IconLock />
          <AlertTitle>{structureLocked ? "Questions are locked" : "Audience and timer are locked"}</AlertTitle>
          <AlertDescription>
            {structureLocked
              ? "Students or staff have recorded answers or marks, so parts, questions, choices and marks can’t change. You can still edit the title, instructions. Owners, Head Admins and Admins can correct a key or exclude a question from the exam page."
              : "Work has started, so the audience and timer can’t change. Parts and questions can change until answers or marks are recorded."}
          </AlertDescription>
        </Alert>
      )}
      basics={(
        <BasicsStep idPrefix="exam" titlePlaceholder="e.g. Unit 3 exam" sections={[
          {
            label: "Audience",
            content: (
              <AudienceFields idPrefix="exam" groups={groups} levels={levels} tracks={tracks} levelNames={levelNames} disabled={targetLocked}
                optional />
            ),
          },
          { label: "Timer", content: <TimerFields disabled={targetLocked} /> },
        ]} />
      )}
      parts={({ edit }) => (
        <PartsList<FormPart> locked={structureLocked} onEdit={edit} maxParts={MAX_PARTS} minParts={0}
          summarize={(part, index) => summarizeSheetPart(part, index, KIND_LABELS)} kinds={KINDS}
          create={(kind, position) => newPart(kind as ExamPartKind, position)} detach={detach} total={sheetTotal} />
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
