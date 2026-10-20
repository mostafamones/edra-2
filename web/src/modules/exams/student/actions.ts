"use server";

import { studentFailure } from "./errors";
import {
  claimMyExamEditor, enterMyExam, getMyExamAnswering, recordMyExamDeparture, releaseMyExamEditor, renewMyExamEditor, saveMyExamAnswers,
  submitMyExam,
} from "./data";
import { signMyExamImages } from "./images";
import type {
  StudentExamAnswerPatch, StudentExamClaimOutcome, StudentExamCommandResult, StudentExamDepartureOutcome, StudentExamEntry,
  StudentExamHeartbeatOutcome, StudentExamImagesOutcome, StudentExamReadOutcome, StudentExamReleaseOutcome, StudentExamSaveOutcome,
  StudentExamSubmitOutcome,
} from "./types";

/**
 * Student web commands (cookie session). Server actions are reachable by direct POST, so each one
 * validates its input and the database reauthorizes the caller, the attempt and the editor claim.
 * Responses are allowlisted DTOs and never shared-cached.
 */

type Exam = { academyId: string; examId: string };
type Editor = Exam & { token: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Starts the caller's single timed attempt (or resumes it with its original deadline and departure
 * count) and claims the answering editor. A busy claim returns no question material.
 */
export async function enterStudentExam(value: Exam & { token: string | null }): Promise<StudentExamCommandResult<StudentExamEntry>> {
  if (!isObject(value)) return studentFailure("validation");
  return enterMyExam({ academyId: value.academyId, examId: value.examId, token: value.token });
}

export async function claimStudentExamEditor(value: Exam & { token: string | null }): Promise<StudentExamCommandResult<StudentExamClaimOutcome>> {
  if (!isObject(value)) return studentFailure("validation");
  return claimMyExamEditor({ academyId: value.academyId, examId: value.examId, token: value.token });
}

export async function renewStudentExamEditor(value: Editor): Promise<StudentExamCommandResult<StudentExamHeartbeatOutcome>> {
  if (!isObject(value)) return studentFailure("validation");
  return renewMyExamEditor({ academyId: value.academyId, examId: value.examId, token: value.token });
}

export async function releaseStudentExamEditor(value: Editor): Promise<StudentExamCommandResult<StudentExamReleaseOutcome>> {
  if (!isObject(value)) return studentFailure("validation");
  return releaseMyExamEditor({ academyId: value.academyId, examId: value.examId, token: value.token });
}

export async function readStudentExamAnswering(value: Editor): Promise<StudentExamCommandResult<StudentExamReadOutcome>> {
  if (!isObject(value)) return studentFailure("validation");
  return getMyExamAnswering({ academyId: value.academyId, examId: value.examId, token: value.token });
}

export async function saveStudentExamAnswers(
  value: Editor & { generation: number; expectedVersion: number; key: string; answers: StudentExamAnswerPatch[] },
): Promise<StudentExamCommandResult<StudentExamSaveOutcome>> {
  if (!isObject(value)) return studentFailure("validation");
  return saveMyExamAnswers({
    academyId: value.academyId, examId: value.examId, token: value.token,
    generation: value.generation, expectedVersion: value.expectedVersion, key: value.key, answers: value.answers,
  });
}

export async function submitStudentExam(value: Editor & { generation: number; expectedVersion: number; key: string }): Promise<StudentExamCommandResult<StudentExamSubmitOutcome>> {
  if (!isObject(value)) return studentFailure("validation");
  return submitMyExam({ academyId: value.academyId, examId: value.examId, token: value.token, generation: value.generation, expectedVersion: value.expectedVersion, key: value.key });
}

export async function recordStudentExamDeparture(
  value: Editor & { generation: number; eventId: string; questionId: string | null },
): Promise<StudentExamCommandResult<StudentExamDepartureOutcome>> {
  if (!isObject(value)) return studentFailure("validation");
  return recordMyExamDeparture({
    academyId: value.academyId, examId: value.examId, token: value.token, generation: value.generation, eventId: value.eventId, questionId: value.questionId,
  });
}

export async function signStudentExamImages(value: Editor & { imageIds: string[] }): Promise<StudentExamCommandResult<StudentExamImagesOutcome>> {
  if (!isObject(value)) return studentFailure("validation");
  return signMyExamImages({ academyId: value.academyId, examId: value.examId, token: value.token, imageIds: value.imageIds });
}
