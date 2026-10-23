"use client";

import { IconClock } from "@tabler/icons-react";

import { useAudienceNames } from "@/components/shared/assessment/workspace/names";
import { AudienceFact } from "@/components/shared/assessment/workspace/audience";
import { AssessmentWorkspacePage } from "@/components/shared/assessment/workspace/page";
import { WorkspaceMenu, WorkspaceView } from "@/components/shared/assessment/workspace/view";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatScore } from "@/lib/score";
import type { AcademyEntry } from "@/modules/academies";
import { quizPermissions } from "../../permissions";
import { loadQuiz, quizQueryKey } from "../../queries";
import type { Quiz } from "../../types";
import { QuizMarking } from "../marking/sheet";
import { ISSUE_LABELS, PHASE_BADGE, PHASE_HINTS, PHASE_LABELS } from "../shared/labels";
import { QuizStudents } from "../students/list";
import { ArchiveQuiz } from "./archive";
import { AvailabilityDialog } from "./availability";
import { QuizOverview } from "./overview";

const ONLINE_NOTE =
  "Students can’t open quizzes online until student accounts are linked to their academy records and the quiz is attached to released content. Physical entry, marking and announcement work now.";

/**
 * `/app/quizzes/<id>`: one workspace for a quiz: a header (title, phase, audience, timer, actions),
 * then an Overview tab (stats, window, parts, questions and key, corrections) and a Students tab
 * (roster and historical participants, marking, announcement and result history).
 */
export function QuizWorkspace({ id }: { id: string }) {
  return (
    // Phases move with time; refreshing also lets due deadlines settle on read.
    <AssessmentWorkspacePage id={id} noun="quiz" route="quizzes" queryKey={quizQueryKey} load={loadQuiz} refetchMs={30_000}>
      {(academy, quiz) => <Workspace academy={academy} quiz={quiz} />}
    </AssessmentWorkspacePage>
  );
}

function Workspace({ academy, quiz }: { academy: AcademyEntry; quiz: Quiz }) {
  const names = useAudienceNames(academy.id);
  const permissions = quizPermissions(academy.role, quiz);
  return (
    <WorkspaceView
      noun="quiz" route="quizzes" id={quiz.id} title={quiz.title}
      badge={(
        <Tooltip>
          <TooltipTrigger asChild><Badge variant={PHASE_BADGE[quiz.phase]} tabIndex={0}>{PHASE_LABELS[quiz.phase]}</Badge></TooltipTrigger>
          <TooltipContent className="max-w-72">{PHASE_HINTS[quiz.phase]} {ONLINE_NOTE}</TooltipContent>
        </Tooltip>
      )}
      meta={(
        <>
          <AudienceFact value={quiz} names={names} />
          <span className="flex items-center gap-1.5"><IconClock className="size-4" aria-hidden="true" />{quiz.timeLimitMinutes ? `${quiz.timeLimitMinutes} min timer` : "Untimed"}</span>
          <span className="tabular-nums">
            {formatScore(quiz.effectiveMaxScore)} marks{quiz.effectiveMaxScore !== quiz.maxScore ? ` (of ${formatScore(quiz.maxScore)} authored)` : ""}
          </span>
        </>
      )}
      mark={permissions.mark ? <QuizMarking academy={academy} quiz={quiz} /> : undefined}
      canEdit={permissions.edit} editInMenu={!permissions.editStructure}
      archive={permissions.archive ? <ArchiveQuiz quiz={quiz} /> : undefined}
      more={(edit) => (
        <>
          {permissions.availability && <AvailabilityDialog key={quiz.version} quiz={quiz} />}
          {edit && <WorkspaceMenu>{edit}</WorkspaceMenu>}
        </>
      )}
      yearOpen={quiz.yearOpen} archived={quiz.archivedAt !== null} ready={quiz.ready}
      setup={<ul className="list-disc pl-4">{[...new Set(quiz.issues.map((issue) => ISSUE_LABELS[issue.issue]))].map((label) => <li key={label}>{label}.</li>)}</ul>}
      studentCount={`${quiz.counts.submitted}/${quiz.counts.eligible}`}
      overview={({ showStudents }) => <QuizOverview academy={academy} quiz={quiz} onViewStudents={showStudents} />}
      students={<QuizStudents academy={academy} quiz={quiz} permissions={permissions} />}
    />
  );
}
