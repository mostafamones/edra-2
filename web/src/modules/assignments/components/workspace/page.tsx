"use client";

import { useState } from "react";
import { IconCalendarDue, IconUsersGroup } from "@tabler/icons-react";

import { AssessmentWorkspacePage } from "@/components/shared/assessment/workspace/page";
import { WorkspaceView } from "@/components/shared/assessment/workspace/view";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AcademyEntry } from "@/modules/academies";
import { formatAcademyDateTime } from "../../due";
import type { MarkFocus } from "../../focus";
import { assignmentPermissions } from "../../permissions";
import { assignmentQueryKey, loadAssignment } from "../../queries";
import type { Assignment } from "../../types";
import { AssignmentMarking } from "../marking/sheet";
import { AUDIENCE_LABELS, STATE_BADGE, STATE_LABELS } from "../shared/labels";
import { AssignmentScoring } from "./scoring";
import { LifecycleActions } from "./lifecycle";
import { AssignmentOverview } from "./overview/content";
import { AssignmentStudents } from "./students/list";
import { describeAudience, useAudienceNames } from "@/components/shared/assessment/workspace/names";

/**
 * `/app/assignments/<id>`: one workspace for an assignment: a header (title, state, audience, due date,
 * actions), then an Overview tab (stats, marks chart, parts, top students) and a Students tab (the full
 * student list with result announcement).
 */
export function AssignmentWorkspace({ id }: { id: string }) {
  return (
    <AssessmentWorkspacePage id={id} noun="assignment" route="assignments" queryKey={assignmentQueryKey} load={loadAssignment}>
      {(academy, assignment) => <Workspace academy={academy} assignment={assignment} />}
    </AssessmentWorkspacePage>
  );
}

function Workspace({ academy, assignment }: { academy: AcademyEntry; assignment: Assignment }) {
  const [focus, setFocus] = useState<MarkFocus | null>(null);
  const permissions = assignmentPermissions(academy.role, assignment);
  const names = useAudienceNames(academy.id);

  return (
    <WorkspaceView
      noun="assignment" route="assignments" id={assignment.id} title={assignment.title}
      badge={<Badge variant={STATE_BADGE[assignment.state]}>{STATE_LABELS[assignment.state]}</Badge>}
      meta={(
        <>
          <span className="flex items-center gap-1.5">
            <IconUsersGroup className="size-4" aria-hidden="true" />
            {describeAudience(assignment, names)}<span className="text-muted-foreground/70">· {AUDIENCE_LABELS[assignment.audience]}</span>
          </span>
          {assignment.dueAt ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex cursor-default items-center gap-1.5">
                  <IconCalendarDue className="size-4" aria-hidden="true" />Due {formatAcademyDateTime(assignment.dueAt)}
                </span>
              </TooltipTrigger>
              <TooltipContent>Advisory only: nothing closes or is rejected when it passes.</TooltipContent>
            </Tooltip>
          ) : (
            <span className="flex items-center gap-1.5"><IconCalendarDue className="size-4" aria-hidden="true" />No due date</span>
          )}
        </>
      )}
      mark={permissions.mark ? <AssignmentMarking assignment={assignment} /> : undefined}
      canEdit={permissions.edit}
      more={<LifecycleActions assignment={assignment} permissions={permissions} />}
      yearOpen={assignment.yearOpen} archived={assignment.state === "archived"} ready={assignment.ready}
      setup="Finish every part’s questions and marks before recording work or marking. Nothing needs to be published."
      studentCount={`${assignment.currentRequiredCount ?? assignment.recipientCount} required · ${assignment.optionalEligibleCount ?? 0} optional`}
      overview={({ showStudents }) => (
        <div className="flex flex-col gap-4"><AssignmentOverview assignment={assignment} onViewStudents={showStudents}
          onSelectBar={(target) => { setFocus({ ...target, outcome: "lost" }); showStudents(); }} /><AssignmentScoring assignment={assignment} role={academy.role} /></div>
      )}
      students={<AssignmentStudents academy={academy} assignment={assignment} focus={focus} onFocusChange={setFocus} />}
    />
  );
}
