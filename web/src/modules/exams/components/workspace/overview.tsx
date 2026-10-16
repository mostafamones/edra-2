"use client";

import { useState } from "react";
import { IconCheck, IconEyeOff, IconKey } from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatScore } from "@/lib/score";
import type { ExamPermissions } from "../../permissions";
import type { Exam, ExamQuestion } from "../../types";
import { choiceLetter, KIND_LABELS, PHASE_HINTS, PROCESSING_PENDING_HINT } from "../shared/labels";
import { ExamTime } from "../shared/time";
import { CorrectionDialog } from "./correction";

/** Window, counts, the questions with their key, and the correction history. */
export function ExamOverview({ exam, permissions }: { exam: Exam; permissions: ExamPermissions }) {
  const [correcting, setCorrecting] = useState<{ question: ExamQuestion; mode: "key" | "exclude" } | null>(null);
  const questions = new Map(exam.parts.flatMap((part) => part.questions).map((question) => [question.id, question]));
  const stats = [
    { label: "Eligible now", value: exam.counts.eligible },
    { label: "Answering online", value: exam.counts.inProgress },
    { label: "Submitted", value: exam.counts.submitted },
    { label: "Announced", value: exam.counts.announced },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} size="sm">
            <CardHeader><CardTitle className="text-sm font-normal text-muted-foreground">{stat.label}</CardTitle></CardHeader>
            <CardContent className="text-2xl font-semibold tabular-nums">{stat.value}</CardContent>
          </Card>
        ))}
      </div>

      <Card size="sm">
        <CardHeader><CardTitle>Window</CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><span className="block text-xs text-muted-foreground">Opens</span><ExamTime value={exam.opensAt} fallback="Not set" /></div>
          <div><span className="block text-xs text-muted-foreground">Scheduled close</span><ExamTime value={exam.closesAt} fallback="Not set" /></div>
          <div><span className="block text-xs text-muted-foreground">Actual closure</span><ExamTime value={exam.actualClosesAt} fallback="Not set" /></div>
          <div><span className="block text-xs text-muted-foreground">Timer</span>{exam.timeLimitMinutes ? `${exam.timeLimitMinutes} minutes per attempt` : "Not set"}</div>
          <p className="text-muted-foreground sm:col-span-2 lg:col-span-4">
            {PHASE_HINTS[exam.phase]} {exam.processingPending ? `${PROCESSING_PENDING_HINT} ` : ""}{exam.fullyAutomatic ? "Every scored question is automatic, so accepted online work is announced as soon as it’s submitted; physical work is announced by staff." : "Written Work needs marking before results can be announced."}
          </p>
        </CardContent>
      </Card>

      {exam.parts.map((part) => (
        <section key={part.id} aria-labelledby={`overview-part-${part.id}`} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={`overview-part-${part.id}`} className="font-heading font-semibold">{part.title}</h2>
            <Badge variant="secondary">{KIND_LABELS[part.kind]}</Badge>
          </div>
          {part.instructions && <p className="text-sm whitespace-pre-wrap text-muted-foreground">{part.instructions}</p>}
          <ol className="flex flex-col gap-2">
            {part.questions.map((question) => (
              <li key={question.id} className={cn("rounded-lg border p-3", question.excluded && "opacity-60")}>
                <div className="flex flex-wrap items-start gap-2">
                  <span className="font-medium tabular-nums">Q{question.number}</span>
                  <span className="min-w-0 flex-1 whitespace-pre-wrap text-sm">{question.prompt || <span className="text-muted-foreground">No question text</span>}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{formatScore(question.maxScore)} marks</span>
                  {question.excluded && <Badge variant="outline"><IconEyeOff />Excluded</Badge>}
                </div>
                {question.choices.length > 0 && (
                  <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                    {question.choices.map((choice) => (
                      <li key={choice.id} className={cn("flex items-center gap-1.5", choice.isCorrect && "font-medium")}>
                        <span className="w-4 text-muted-foreground">{choiceLetter(choice.position)}</span>
                        {choice.label}
                        {choice.isCorrect && <IconCheck className="size-4 text-primary" aria-label="Correct answer" />}
                      </li>
                    ))}
                  </ul>
                )}
                {question.modelAnswer && <p className="mt-2 text-xs whitespace-pre-wrap text-muted-foreground">Model answer: {question.modelAnswer}</p>}
                {permissions.correct && !question.excluded && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {part.kind === "question_sheet" && (
                      <Button size="sm" variant="outline" onClick={() => setCorrecting({ question, mode: "key" })}><IconKey />Correct key</Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setCorrecting({ question, mode: "exclude" })}><IconEyeOff />Exclude</Button>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </section>
      ))}

      {exam.solutionNotes && (
        <Card size="sm">
          <CardHeader><CardTitle>Solution notes</CardTitle></CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">{exam.solutionNotes}</CardContent>
        </Card>
      )}

      {exam.corrections.length > 0 && (
        <section aria-labelledby="exam-corrections" className="flex flex-col gap-2">
          <h2 id="exam-corrections" className="font-heading font-semibold">Corrections</h2>
          <ol className="flex flex-col gap-1 text-sm">
            {exam.corrections.map((correction) => {
              const question = questions.get(correction.questionId);
              const choice = (id: string | null) => question?.choices.find((entry) => entry.id === id);
              return (
                <li key={correction.revision} className="flex flex-wrap gap-x-2">
                  <span className="text-muted-foreground"><ExamTime value={correction.createdAt} /></span>
                  <span>
                    {correction.kind === "key"
                      ? `Q${question?.number ?? "?"} key changed from ${choice(correction.previousChoiceId) ? choiceLetter(choice(correction.previousChoiceId)!.position) : "none"} to ${choice(correction.choiceId) ? choiceLetter(choice(correction.choiceId)!.position) : "?"}`
                      : `Q${question?.number ?? "?"} excluded`}
                  </span>
                  <span className="text-xs text-muted-foreground">(scoring revision {correction.revision})</span>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <CorrectionDialog key={correcting ? `${correcting.question.id}-${correcting.mode}` : "none"} exam={exam}
        question={correcting?.question ?? null} mode={correcting?.mode ?? "key"} onClose={() => setCorrecting(null)} />
    </div>
  );
}
