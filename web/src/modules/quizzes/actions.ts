"use server";

import {
  announceResults, archiveQuiz, configureAvailability, confirmPhysical, correctKey, createQuiz, excludeQuestion, saveMarks,
  savePhysicalDraft, updateQuiz,
} from "./data";
import { failure } from "./errors";
import type { AnnounceResult, QuizDraft, QuizResult, StudentWorkResult } from "./types";

/** Staff web actions. They run the same domain operations as the external API with the cookie session. */

const invalid = (value: unknown) => !value || typeof value !== "object";

export async function createNewQuiz(value: { academyId: string; academicYearId: string; quizId: string; draft: QuizDraft }): Promise<QuizResult> {
  return invalid(value) ? failure("validation") : createQuiz(value);
}

export async function saveQuiz(value: { academyId: string; quizId: string; expectedVersion: number; draft: QuizDraft }): Promise<QuizResult> {
  return invalid(value) ? failure("validation") : updateQuiz(value);
}

/** Owner/Head Admin/Admin. Times are UTC instants; null clears an unopened window. */
export async function setQuizAvailability(
  value: { academyId: string; quizId: string; expectedVersion: number; opensAt: string | null; closesAt: string | null },
): Promise<QuizResult> {
  return invalid(value) ? failure("validation") : configureAvailability(value);
}

export async function archiveExistingQuiz(value: { academyId: string; quizId: string; expectedVersion: number }): Promise<QuizResult> {
  return invalid(value) ? failure("validation") : archiveQuiz(value);
}

export async function correctQuizKey(
  value: { academyId: string; quizId: string; questionId: string; choiceId: string; expectedScoringRevision: number; key: string },
): Promise<QuizResult> {
  return invalid(value) ? failure("validation") : correctKey(value);
}

export async function excludeQuizQuestion(
  value: { academyId: string; quizId: string; questionId: string; expectedScoringRevision: number; key: string },
): Promise<QuizResult> {
  return invalid(value) ? failure("validation") : excludeQuestion(value);
}

export async function savePhysicalAnswers(
  value: { academyId: string; quizId: string; recordId: string; expectedVersion: number; answers: { questionId: string; choiceId: string | null }[]; key: string },
): Promise<StudentWorkResult> {
  return invalid(value) ? failure("validation") : savePhysicalDraft(value);
}

/** Records received physical work as final. It never announces a result. */
export async function confirmPhysicalWork(
  value: { academyId: string; quizId: string; recordId: string; expectedVersion: number; key: string },
): Promise<StudentWorkResult> {
  return invalid(value) ? failure("validation") : confirmPhysical(value);
}

export async function saveQuizMarks(
  value: { academyId: string; quizId: string; recordId: string; expectedVersion: number; marks: { questionId: string; score: string | null }[]; feedback?: string; key: string },
): Promise<StudentWorkResult> {
  return invalid(value) ? failure("validation") : saveMarks(value);
}

/** Announces complete results; saving marks never does. */
export async function announceQuizResults(
  value: { academyId: string; quizId: string; expectedScoringRevision: number; key: string; items: { recordId: string; expectedVersion: number }[] },
): Promise<AnnounceResult> {
  return invalid(value) ? failure("validation") : announceResults(value);
}
