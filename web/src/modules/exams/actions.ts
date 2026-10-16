"use server";

import {
  announceResults, archiveExam, configureAvailability, confirmPhysical, correctKey, createExam, excludeQuestion, saveMarks,
  savePhysicalDraft, updateExam,
} from "./data";
import { failure } from "./errors";
import type { AnnounceResult, ExamDraft, ExamResult, StudentWorkResult } from "./types";

/** Staff web actions. They run the same domain operations as the external API with the cookie session. */

const invalid = (value: unknown) => !value || typeof value !== "object";

export async function createNewExam(value: { academyId: string; academicYearId: string; examId: string; draft: ExamDraft }): Promise<ExamResult> {
  return invalid(value) ? failure("validation") : createExam(value);
}

export async function saveExam(value: { academyId: string; examId: string; expectedVersion: number; draft: ExamDraft }): Promise<ExamResult> {
  return invalid(value) ? failure("validation") : updateExam(value);
}

/** Owner/Head Admin/Admin. Times are UTC instants; null clears an unopened window. */
export async function setExamAvailability(
  value: { academyId: string; examId: string; expectedVersion: number; opensAt: string | null; closesAt: string | null },
): Promise<ExamResult> {
  return invalid(value) ? failure("validation") : configureAvailability(value);
}

export async function archiveExistingExam(value: { academyId: string; examId: string; expectedVersion: number }): Promise<ExamResult> {
  return invalid(value) ? failure("validation") : archiveExam(value);
}

export async function correctExamKey(
  value: { academyId: string; examId: string; questionId: string; choiceId: string; expectedScoringRevision: number; key: string },
): Promise<ExamResult> {
  return invalid(value) ? failure("validation") : correctKey(value);
}

export async function excludeExamQuestion(
  value: { academyId: string; examId: string; questionId: string; expectedScoringRevision: number; key: string },
): Promise<ExamResult> {
  return invalid(value) ? failure("validation") : excludeQuestion(value);
}

export async function savePhysicalAnswers(
  value: { academyId: string; examId: string; recordId: string; expectedVersion: number; answers: { questionId: string; choiceId: string | null }[]; key: string },
): Promise<StudentWorkResult> {
  return invalid(value) ? failure("validation") : savePhysicalDraft(value);
}

/** Records received physical work as final. It never announces a result. */
export async function confirmPhysicalWork(
  value: { academyId: string; examId: string; recordId: string; expectedVersion: number; key: string },
): Promise<StudentWorkResult> {
  return invalid(value) ? failure("validation") : confirmPhysical(value);
}

export async function saveExamMarks(
  value: { academyId: string; examId: string; recordId: string; expectedVersion: number; marks: { questionId: string; score: string | null }[]; feedback?: string; key: string },
): Promise<StudentWorkResult> {
  return invalid(value) ? failure("validation") : saveMarks(value);
}

/** Announces complete results; saving marks never does. */
export async function announceExamResults(
  value: { academyId: string; examId: string; expectedScoringRevision: number; key: string; items: { recordId: string; expectedVersion: number }[] },
): Promise<AnnounceResult> {
  return invalid(value) ? failure("validation") : announceResults(value);
}
