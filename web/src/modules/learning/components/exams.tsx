import { StudentExamStatus } from "@/modules/exams/server";
import { formatAcademyDateTime } from "@/lib/academy-time";
import { studentAcademyPath } from "@/lib/routing";

import { readMyExams, type Scope } from "../data";
import { AcademySections, ItemRow } from "./section";

/** Exams across the student's academies, or one academy's when scoped, open and resumable first. */
export async function LearningExams({ scope }: { scope?: Scope }) {
  return (
    <AcademySections title="Exams" section="exams" empty="No exams" groups={await readMyExams(scope)} scope={scope}>
      {(exam, slug) => (
        <ItemRow key={exam.examId} href={studentAcademyPath(slug, `exams/${exam.examId}`)} title={exam.title} badge={<StudentExamStatus action={exam.action} />}
          meta={<>
            {exam.opensAt && exam.action === "not_yet_open" && <span>Opens <time dateTime={exam.opensAt}>{formatAcademyDateTime(exam.opensAt)}</time></span>}
            {exam.closesAt && ["start", "resume"].includes(exam.action) && <span>Closes <time dateTime={exam.closesAt}>{formatAcademyDateTime(exam.closesAt)}</time></span>}
            {exam.timeLimitMinutes && <span>{exam.timeLimitMinutes} min</span>}
          </>} />
      )}
    </AcademySections>
  );
}
