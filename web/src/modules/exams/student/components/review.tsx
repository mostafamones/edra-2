"use client";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { IconCheck, IconChevronLeft, IconChevronRight } from "@tabler/icons-react";

import { ImageSourceProvider } from "@/components/shared/assessment/images/context";
import { RichText } from "@/components/shared/assessment/images/text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { onExamAccountChange } from "../answering/cleanup";
import { reviewImageSource } from "../answering/images";
import type { StudentExamReview, StudentExamReviewPart, StudentExamReviewQuestion } from "../types";

type Available = Extract<StudentExamReview, { status: "available" }>;
type Props = { academyId: string; examId: string; review: Available };

const letter = (index: number) => String.fromCharCode(65 + index);

/**
 * Read-only review of the accepted work beside the released solutions, one question at a time. It
 * holds no editor, draft, autosave or departure detection, and choosing a question only navigates.
 * Material comes from the server only once solutions qualify; an account change clears it.
 */
export function StudentExamReviewSection(props: Props) {
  return <ReviewSession key={`${props.review.accountId}:${props.academyId}:${props.examId}`} {...props} />;
}

function ReviewSession({ academyId, examId, review }: Props) {
  // Signed URLs live only in this mount's memory cache, scoped to the verified account and exam.
  const [queryClient] = useState(() => new QueryClient());
  const [images] = useState(() => {
    let open = true;
    return {
      source: reviewImageSource(`review:${review.accountId}:${examId}`, academyId, examId, () => open),
      setOpen: (value: boolean) => { open = value; },
    };
  });
  const [cleared, setCleared] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);

  useEffect(() => {
    images.setOpen(true);
    const stop = onExamAccountChange(() => {
      images.setOpen(false);
      queryClient.clear();
      setCleared(true);
    });
    return () => {
      stop();
      images.setOpen(false);
      queryClient.clear();
    };
  }, [images, queryClient]);

  if (cleared) return null;

  const parts = new Map(review.parts.map((part) => [part.id, part]));
  const questions = review.parts.flatMap((part) => part.questions.map((question) => ({ ...question, partId: part.id })));
  // A refreshed document keeps the selected question while it still exists.
  const index = Math.max(0, questions.findIndex((question) => question.id === currentId));
  const question = questions[index];

  return (
    <QueryClientProvider client={queryClient}>
      <ImageSourceProvider source={images.source}>
        <section aria-labelledby="exam-review" className="flex flex-col gap-4">
          <h2 id="exam-review" className="text-lg font-semibold">Answers and solutions</h2>
          {question && (
            <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_13rem]">
              <Card className="min-w-0">
                <CardContent className="flex flex-col gap-6">
                  <ReviewQuestion question={question} part={parts.get(question.partId)} />
                  <div className="flex flex-wrap justify-between gap-3">
                    <Button variant="outline" disabled={index === 0} onClick={() => setCurrentId(questions[index - 1].id)}>
                      <IconChevronLeft aria-hidden="true" />Previous
                    </Button>
                    <Button variant="outline" disabled={index === questions.length - 1} onClick={() => setCurrentId(questions[index + 1].id)}>
                      Next<IconChevronRight aria-hidden="true" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
              <nav aria-label="Review questions">
                <ol className="grid grid-cols-5 gap-2">
                  {questions.map((item) => {
                    const current = item.id === question.id;
                    return (
                      <li key={item.id}>
                        <Button type="button" size="sm" variant={current ? "default" : "outline"} aria-current={current ? "step" : undefined}
                          aria-label={`Question ${item.number}${item.excluded ? ", excluded" : ""}`}
                          className={cn("w-full tabular-nums", item.excluded && "line-through")} onClick={() => setCurrentId(item.id)}>
                          {item.number}
                        </Button>
                      </li>
                    );
                  })}
                </ol>
              </nav>
            </div>
          )}
          {review.notes && (
            <Card>
              <CardHeader><CardTitle>Solution notes</CardTitle></CardHeader>
              <CardContent className="whitespace-pre-wrap leading-7"><RichText value={review.notes} /></CardContent>
            </Card>
          )}
        </section>
      </ImageSourceProvider>
    </QueryClientProvider>
  );
}

/** One question: the accepted answer next to the released key or model answer. Never a mark. */
function ReviewQuestion({ question, part }: { question: StudentExamReviewQuestion; part: StudentExamReviewPart | undefined }) {
  const heading = `review-question-${question.id}`;
  const { answer } = question;
  return (
    <section aria-labelledby={heading} className="flex flex-col gap-5">
      {part && (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-muted-foreground">{part.title}</p>
          {part.instructions && <p className="whitespace-pre-wrap text-sm">{part.instructions}</p>}
        </div>
      )}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h3 id={heading} className="text-lg font-semibold">Question {question.number}</h3>
          {question.excluded && <Badge variant="outline">Excluded</Badge>}
        </div>
        {question.prompt && <div className="whitespace-pre-wrap leading-7"><RichText value={question.prompt} /></div>}
      </div>
      {question.kind === "question_sheet" ? (
        <div className="flex flex-col gap-2">
          <ul className="flex flex-col gap-2">
            {question.choices.map((choice, index) => {
              const yours = answer.state === "choice" && answer.choiceId === choice.id;
              const correct = question.correctChoiceId === choice.id;
              return (
                <li key={choice.id} className={cn("flex flex-wrap items-start gap-3 rounded-md border p-3", correct && "border-primary")}>
                  <span className="font-medium tabular-nums">{letter(index)}.</span>
                  <span className="min-w-0 flex-1 whitespace-pre-wrap"><RichText value={choice.label} /></span>
                  {(yours || correct) && (
                    <span className="flex shrink-0 flex-wrap gap-1">
                      {yours && <Badge variant="secondary">Your answer</Badge>}
                      {correct && <Badge><IconCheck aria-hidden="true" />Correct answer</Badge>}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {answer.state === "blank" && <p className="text-sm text-muted-foreground">No answer</p>}
        </div>
      ) : (
        <Labeled title="Your answer">
          {answer.state === "text" ? <p className="whitespace-pre-wrap">{answer.text}</p>
            : <p className="text-muted-foreground">{answer.state === "paper_work" ? "Completed on paper" : "No answer"}</p>}
        </Labeled>
      )}
      {question.modelAnswer && (
        <Labeled title="Model answer"><div className="whitespace-pre-wrap leading-7"><RichText value={question.modelAnswer} /></div></Labeled>
      )}
    </section>
  );
}

function Labeled({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}
