import "@tanstack/react-start/server-only";
import { notFound } from "@/lib/navigation";
import { getMyExamOverview, getMyExamReview } from "./data";
import type { ExamSource, FinalizationReason } from "../types";
import type { StudentExamAcademy, StudentExamAction, StudentExamOverview, StudentExamReview } from "./types";

type AvailableReview = Extract<StudentExamReview, { status: "available" }>;
type When = { label: string; value: string };

/** What the overview page renders: fields the page does not show (and the derived state it needs) stay on the server. */
export type StudentExamOverviewData =
  | { kind: "access"; access: Exclude<StudentExamAcademy["access"], "active"> }
  | { kind: "notice"; message: string }
  | {
    kind: "exam";
    exam: {
      examId: string; title: string; instructions: string; timeLimitMinutes: number | null; action: StudentExamAction; serverNow: string;
      availability: { opensAt: string; label: string; at: string } | null;
      attempt: { startedAt: string; deadline: string | null } | null;
      submission: { submittedAt: string; reason: FinalizationReason; source: ExamSource } | null;
      result: { total: string; maxScore: string; corrected: boolean; when: When } | null;
    };
    review: { status: "available"; data: AvailableReview } | { status: "unavailable"; reason: "awaiting_closure" | "awaiting_result"; closesAt: string | null } | null;
    failure: boolean;
    processing: boolean;
    awaiting: boolean;
    closing: string | null;
  };

function availability(exam: StudentExamOverview) {
  if (!exam.opensAt || !exam.closesAt || !exam.actualClosesAt) return null;
  if (exam.phase === "closed" || exam.phase === "archived") return { opensAt: exam.opensAt, label: "Closed", at: exam.actualClosesAt };
  return { opensAt: exam.opensAt, label: exam.phase === "headroom" ? "Closed to new starts" : "Closes", at: exam.closesAt };
}

export async function loadStudentExamOverview({ academy, examId }: { academy: StudentExamAcademy; examId: string }): Promise<StudentExamOverviewData> {
  if (academy.access !== "active") return { kind: "access", access: academy.access };
  const result = await getMyExamOverview({ academyId: academy.id, examId });
  if (!result.ok) {
    if (result.code === "not_found" || result.code === "validation") notFound();
    if (result.code === "unavailable") throw new Error(result.message);
    return { kind: "notice", message: result.message };
  }
  const exam = result.data;
  const review = exam.submission ? await getMyExamReview({ academyId: academy.id, examId: exam.examId }) : null;
  // A due attempt not yet settled by this read: recheck rather than infer a submission or a zero.
  const processing = !exam.submission && exam.action === "submitted" && exam.attempt !== null && exam.attempt.finalizedAt === null && !exam.attempt.superseded;
  const awaiting = processing || (exam.submission !== null && (exam.result === null || !review?.ok || review.data.status === "unavailable"));
  const closing = exam.actualClosesAt && Date.parse(exam.actualClosesAt) > Date.parse(exam.serverNow) ? exam.actualClosesAt : null;
  const read = review?.ok ? review.data : null;
  const { attempt, submission, result: score } = exam;
  return {
    kind: "exam", processing, awaiting, closing, failure: !!review && !review.ok,
    exam: {
      examId: exam.examId, title: exam.title, instructions: exam.instructions, timeLimitMinutes: exam.timeLimitMinutes, action: exam.action, serverNow: exam.serverNow,
      availability: availability(exam),
      attempt: attempt && { startedAt: attempt.startedAt, deadline: exam.action === "resume" ? attempt.cutoffAt : null },
      submission: submission && { submittedAt: submission.submittedAt, reason: submission.reason, source: submission.source },
      result: score && {
        total: score.total, maxScore: score.maxScore, corrected: score.corrected,
        when: score.corrected && score.correctedAt ? { label: "Corrected", value: score.correctedAt } : { label: "Published", value: score.publishedAt },
      },
    },
    review: !read ? null : read.status === "available" ? { status: "available", data: read }
      : read.reason === "not_submitted" ? null : { status: "unavailable", reason: read.reason, closesAt: read.reason === "awaiting_closure" ? exam.actualClosesAt : null },
  };
}
