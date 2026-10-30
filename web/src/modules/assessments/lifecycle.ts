import { changeAssignment } from "@/modules/assignments";
import { archiveExistingExam, setExamAvailability } from "@/modules/exams";
import { archiveExistingQuiz, setQuizAvailability } from "@/modules/quizzes";
import { loadDetails } from "./details";
import type { AssessmentListItem } from "./types";

export type LifecycleAction = "close" | "archive";

/** Long enough for the command to arrive before the new closing time, which must still be ahead. */
export const CLOSE_DELAY_SECONDS = 30;

/**
 * Closes or archives through the owning module's public commands, which keep every role, state and lock
 * rule. Quizzes and exams close by moving their scheduled close, so the two-minute completion period
 * still applies, and the database refuses it once students have started. List rows carry no version, so
 * the latest record is read first.
 */
export async function changeLifecycle(academyId: string, item: AssessmentListItem, action: LifecycleAction): Promise<{ ok: true } | { ok: false; message: string }> {
  const record = await loadDetails(academyId, item.type, item.id);
  const { id, version: expectedVersion } = record.value;
  if (record.type === "assignment") {
    if (action === "archive" && record.value.state === "active" && record.value.hasActivity) return { ok: false, message: "Close this assignment before archiving it." };
    return changeAssignment({ academyId, assignmentId: id, expectedVersion, action });
  }
  if (action === "archive") {
    return record.type === "quiz" ? archiveExistingQuiz({ academyId, quizId: id, expectedVersion }) : archiveExistingExam({ academyId, examId: id, expectedVersion });
  }
  if (record.value.phase !== "open") return { ok: false, message: "This assessment is no longer open." };
  const window = { opensAt: record.value.opensAt, closesAt: new Date(Date.parse(record.value.serverNow) + CLOSE_DELAY_SECONDS * 1000).toISOString() };
  const result = record.type === "quiz"
    ? await setQuizAvailability({ academyId, quizId: id, expectedVersion, ...window })
    : await setExamAvailability({ academyId, examId: id, expectedVersion, ...window });
  return !result.ok && result.code === "window_locked" ? { ok: false, message: "Students have started, so this can’t close early." } : result;
}
