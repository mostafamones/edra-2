"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";

import { AudienceFields } from "@/components/shared/assessment/audience";
import { BasicsStep } from "@/components/shared/assessment/basics";
import { AssessmentFormLoader, type FormContext } from "@/components/shared/assessment/load";
import type { FormStatus } from "@/components/shared/assessment/page";
import { AssessmentFormShell, type SaveResult } from "@/components/shared/assessment/shell";
import type { AcademyEntry } from "@/modules/academies";
import { createNewAssignment, saveAssignment } from "../../actions";
import { assignmentPermissions } from "../../permissions";
import { assignmentsRootKey } from "../../queries";
import type { Assignment, AssignmentDraft } from "../../types";
import { assignmentFormDefaults, assignmentFormSchema } from "../../validation";
import { AudienceCount } from "./count";
import { DueFields } from "./due";
import { ImagesProvider } from "@/components/shared/assessment/images/context";
import { newStash } from "@/components/shared/assessment/parts/editor";
import { PartEditor, type PartStash } from "./parts/editor";
import { PartsList } from "./parts/list";
import { ReviewStep } from "./review";

export type { FormStatus };

type Props = {
  /** The parent re-mounts the form when the academy changes. */
  academy: AcademyEntry;
  assignment?: Assignment;
  onSaved: (assignment: Assignment) => void;
  onCancel: () => void;
  onStatusChange?: (status: FormStatus) => void;
};

const BASICS_FIELDS = ["title", "instructions", "dueDate", "dueTime", "audience", "levelId", "trackId", "groupIds"];

const resolver = zodResolver(assignmentFormSchema);
const parse = (values: Parameters<typeof assignmentFormSchema.safeParse>[0]): AssignmentDraft | null => {
  const parsed = assignmentFormSchema.safeParse(values);
  return parsed.success ? parsed.data : null;
};

/** Create or edit an assignment; loads the academic year, levels, tracks, and groups it needs. */
export function AssignmentForm(props: Props) {
  return (
    <AssessmentFormLoader academyId={props.academy.id} noun="assignment" entityYearId={props.assignment?.academicYearId}>
      {(context) => <AssignmentFields {...props} context={context} />}
    </AssessmentFormLoader>
  );
}

async function commit(academyId: string, context: FormContext, base: Assignment | undefined, draft: AssignmentDraft, createId: string): Promise<SaveResult<Assignment>> {
  const result = base
    ? await saveAssignment({ academyId, assignmentId: base.id, expectedVersion: base.version, draft })
    : await createNewAssignment({ academyId, academicYearId: context.academicYearId, assignmentId: createId, draft });
  return result.ok ? { ok: true, entity: result.assignment } : { ok: false, message: result.message, conflict: result.code === "assignment_conflict" };
}

function AssignmentFields({ academy, assignment, onSaved, onCancel, onStatusChange, context }: Props & { context: FormContext }) {
  const { academicYearId, levels, tracks, levelNames, groups } = context;
  // Marking started: the structure and audience are read-only, and text details are saved explicitly.
  const locked = assignment ? !assignmentPermissions(academy.role, assignment).editStructure : false;
  // What the part editor set aside while the form is open; it survives moving between parts.
  const [stash] = useState<PartStash>(newStash);

  return (
    <AssessmentFormShell
      academy={academy} noun="assignment" route="assignments" entity={assignment} locked={locked}
      toValues={assignmentFormDefaults} resolver={resolver} parse={parse}
      commit={(base, draft, createId) => commit(academy.id, context, base, draft, createId)}
      rootKey={assignmentsRootKey(academy.id)} savedMessage={(_, created) => (created ? "Assignment created." : "Assignment saved.")}
      basicsFields={BASICS_FIELDS}
      basics={(
        <BasicsStep idPrefix="assignment" titlePlaceholder="e.g. Unit 3 homework" aside={<DueFields />} sections={[{
          label: "Audience",
          content: (
            <AudienceFields idPrefix="assignment" groups={groups} levels={levels} tracks={tracks} levelNames={levelNames} disabled={locked}
              count={<AudienceCount academyId={academy.id} academicYearId={academicYearId} />} />
          ),
        }]} />
      )}
      parts={({ edit }) => <PartsList locked={locked} onEdit={edit} />}
      review={({ editDetails, editPart }) => (
        <ReviewStep levelNames={levelNames} tracks={tracks} groups={groups} onEditDetails={editDetails} onEditPart={editPart} />
      )}
      partEditor={({ index, select, close }) => <PartEditor locked={locked} index={index} stash={stash} onSelect={select} onClose={close} />}
      wrap={(children) => <ImagesProvider academyId={academy.id}>{children}</ImagesProvider>}
      onSaved={onSaved} onCancel={onCancel} onStatusChange={onStatusChange}
    />
  );
}
