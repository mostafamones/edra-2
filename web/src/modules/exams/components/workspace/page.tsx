"use client";

import { IconClock, IconUsersGroup } from "@tabler/icons-react";

import { useAudienceNames, describeAudience } from "@/components/shared/assessment/workspace/names";
import { AssessmentWorkspacePage } from "@/components/shared/assessment/workspace/page";
import { WorkspaceView } from "@/components/shared/assessment/workspace/view";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatScore } from "@/lib/score";
import type { AcademyEntry } from "@/modules/academies";
import { examPermissions } from "../../permissions";
import { loadExam, examQueryKey } from "../../queries";
import type { Exam } from "../../types";
import { ExamMarking } from "../marking/sheet";
import { ISSUE_LABELS, PHASE_BADGE, PHASE_HINTS, PHASE_LABELS } from "../shared/labels";
import { ExamStudents } from "../students/list";
import { ArchiveExam } from "./archive";
import { AvailabilityDialog } from "./availability";
import { ExamOverview } from "./overview";

const ONLINE_NOTE =
  "Students can’t take exams online until student accounts are linked to their academy records. Exams don’t need released content. Physical entry, marking and announcement work now.";

/**
 * `/app/exams/<id>`: one workspace for an exam: a header (title, phase, audience, timer, actions),
 * then an Overview tab (stats, window, parts, questions and key, corrections) and a Students tab
 * (roster and historical participants, marking, announcement and result history).
 */
export function ExamWorkspace({ id }: { id: string }) {
  return (
    // Phases move with time; refreshing also lets due deadlines settle on read.
    <AssessmentWorkspacePage id={id} noun="exam" route="exams" queryKey={examQueryKey} load={loadExam} refetchMs={30_000}>
      {(academy, exam) => <Workspace academy={academy} exam={exam} />}
    </AssessmentWorkspacePage>
  );
}

function Workspace({ academy, exam }: { academy: AcademyEntry; exam: Exam }) {
  const names = useAudienceNames(academy.id);
  const permissions = examPermissions(academy.role, exam);
  return (
    <WorkspaceView
      noun="exam" route="exams" id={exam.id} title={exam.title}
      badge={(
        <Tooltip>
          <TooltipTrigger asChild><Badge variant={PHASE_BADGE[exam.phase]} tabIndex={0}>{PHASE_LABELS[exam.phase]}</Badge></TooltipTrigger>
          <TooltipContent className="max-w-72">{PHASE_HINTS[exam.phase]} {ONLINE_NOTE}</TooltipContent>
        </Tooltip>
      )}
      meta={(
        <>
          <span className="flex items-center gap-1.5"><IconUsersGroup className="size-4" aria-hidden="true" />{describeAudience(exam, names)}</span>
          <span className="flex items-center gap-1.5"><IconClock className="size-4" aria-hidden="true" />{exam.timeLimitMinutes ? `${exam.timeLimitMinutes} min timer` : "No timer yet"}</span>
          <span className="tabular-nums">
            {formatScore(exam.effectiveMaxScore)} marks{exam.effectiveMaxScore !== exam.maxScore ? ` (of ${formatScore(exam.maxScore)} authored)` : ""}
          </span>
        </>
      )}
      mark={permissions.mark ? <ExamMarking academy={academy} exam={exam} /> : undefined}
      canEdit={permissions.edit}
      archive={permissions.archive ? <ArchiveExam exam={exam} /> : undefined}
      more={(
        <>
          {permissions.availability && <AvailabilityDialog key={exam.version} exam={exam} />}
        </>
      )}
      yearOpen={exam.yearOpen} archived={exam.archivedAt !== null} ready={exam.ready}
      setup={<ul className="list-disc pl-4">{[...new Set(exam.issues.map((issue) => ISSUE_LABELS[issue.issue]))].map((label) => <li key={label}>{label}.</li>)}</ul>}
      studentCount={`${exam.counts.submitted}/${exam.counts.eligible}`}
      overview={({ showStudents }) => <ExamOverview academy={academy} exam={exam} onViewStudents={showStudents} />}
      students={<ExamStudents academy={academy} exam={exam} permissions={permissions} />}
    />
  );
}
