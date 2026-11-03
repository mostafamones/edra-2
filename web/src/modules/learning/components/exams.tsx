import { StudentExamStatus } from "@/modules/exams/student/components/status";
import { formatAcademyDateTime } from "@/lib/academy-time";
import { studentAcademyPath } from "@/lib/routing";

import type { LearningExamsData } from "../server";
import { AcademySections, ItemRow } from "./section";

/** Exams across the student's academies, or one academy's when scoped, open and resumable first. */
export function LearningExams({ data: { scope, groups, academies } }: { data: LearningExamsData }) {
  return (
    <AcademySections title="Exams" section="exams" empty="No exams" groups={groups} scope={scope} academies={academies}>
      {(exam, slug) => (
        <ItemRow key={exam.examId} href={studentAcademyPath(slug, `exams/${exam.examId}`)} title={exam.title} badge={<StudentExamStatus action={exam.action} />}
          meta={<>
            {exam.opensAt && <span>Opens <time dateTime={exam.opensAt}>{formatAcademyDateTime(exam.opensAt)}</time></span>}
            {exam.closesAt && <span>Closes <time dateTime={exam.closesAt}>{formatAcademyDateTime(exam.closesAt)}</time></span>}
            {exam.timeLimitMinutes && <span>{exam.timeLimitMinutes} min</span>}
          </>} />
      )}
    </AcademySections>
  );
}
