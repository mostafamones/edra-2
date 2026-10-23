"use client";

import { formatScore } from "@/lib/score";
import type { Quiz, StudentDetail } from "../../types";
import { QuizTime } from "../shared/time";

/** Every official revision, newest first. Earlier revisions stay as announced. */
export function WorkHistory({ quiz, detail }: { quiz: Quiz; detail: StudentDetail }) {
  if (detail.publications.length === 0 && detail.departures.length === 0) return null;
  return (
    <section aria-labelledby="work-history" className="flex flex-col gap-3">
      <h3 id="work-history" className="font-semibold">History</h3>
      {detail.departures.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Left the online quiz at {detail.departures.map((at, index) => <span key={at}>{index > 0 ? ", " : ""}<QuizTime value={at} /></span>)}.
        </p>
      )}
      <ol className="flex flex-col gap-2">
        {detail.publications.map((publication) => (
          <li key={publication.revision} className="rounded-lg border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">Revision {publication.revision}</span>
              <span className="tabular-nums">{formatScore(publication.total)} / {formatScore(publication.maxScore)}</span>
              <span className="text-muted-foreground">
                {publication.automatic ? "Announced automatically" : "Announced"} <QuizTime value={publication.publishedAt} />
                {publication.scoringRevision !== quiz.scoringRevision ? ` · scoring revision ${publication.scoringRevision}` : ""}
              </span>
            </div>
            {publication.feedback && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{publication.feedback}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}
