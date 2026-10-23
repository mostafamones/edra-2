"use client";

import { formatScore } from "@/lib/score";
import type { Exam, StudentDetail } from "../../types";
import { ExamTime } from "../shared/time";

/**
 * The departure log (question left, by original number, and the outcome) and every official revision,
 * newest first. Earlier revisions stay as announced. Departures are reported by the student's browser.
 */
export function WorkHistory({ exam, detail }: { exam: Exam; detail: StudentDetail }) {
  if (detail.publications.length === 0 && detail.departures.length === 0) return null;
  const numbers = new Map(exam.parts.flatMap((part) => part.questions).map((question) => [question.id, question.number]));
  return (
    <section aria-labelledby="work-history" className="flex flex-col gap-3">
      <h3 id="work-history" className="font-semibold">History</h3>
      {detail.departures.length > 0 && (
        <ol aria-label="Departures from the online exam" className="flex flex-col gap-1 text-sm">
          {detail.departures.map((departure) => (
            <li key={departure.eventId} className="flex flex-wrap gap-x-2">
              <span className="font-medium">Departure {departure.ordinal}</span>
              <span>{departure.questionNumber === null ? "left before a question was displayed" : `left at Q${departure.questionNumber}`}</span>
              <span className="text-muted-foreground"><ExamTime value={departure.recordedAt} /></span>
              <span className="text-muted-foreground">
                {departure.outcome === "kicked" ? "· Kicked: saved answers submitted"
                  : departure.nextQuestionId ? `· Warned, continued at Q${numbers.get(departure.nextQuestionId) ?? "?"}` : "· Warned, no later question"}
              </span>
            </li>
          ))}
        </ol>
      )}
      <ol className="flex flex-col gap-2">
        {detail.publications.map((publication) => (
          <li key={publication.revision} className="rounded-lg border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">Revision {publication.revision}</span>
              <span className="tabular-nums">{formatScore(publication.total)} / {formatScore(publication.maxScore)}</span>
              <span className="text-muted-foreground">
                {publication.automatic ? "Announced automatically" : "Announced"} <ExamTime value={publication.publishedAt} />
                {publication.scoringRevision !== exam.scoringRevision ? ` · scoring revision ${publication.scoringRevision}` : ""}
              </span>
            </div>
            {publication.feedback && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{publication.feedback}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}
