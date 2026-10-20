"use server";

import { studentFailure } from "./errors";
import { startMyExam } from "./data";
import type { StudentExamStartResult } from "./types";

/**
 * Student web commands (cookie session). Later save, submit and departure actions extend the same
 * StudentExamFailure convention. Server actions are reachable by direct POST, so each one validates
 * its input and the database reauthorizes the caller.
 */

/** Starts the caller's single timed attempt, or resumes it with its original deadline and departure count. */
export async function startStudentExam(value: { academyId: string; examId: string }): Promise<StudentExamStartResult> {
  if (!value || typeof value !== "object") return studentFailure("validation");
  return startMyExam({ academyId: value.academyId, examId: value.examId });
}
