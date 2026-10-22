"use server";

import { changeAssignmentState, correctScoring, createAssignment, publishResults, recordWork, resolveStudent, saveMarks, updateAssignment } from "./data";
import { failure } from "./errors";
import { getOnlineSetting, listReceivedFiles, openReceivedFile, setOnlineSetting } from "./received";
import type { AssignmentAction, AssignmentDraft, AssignmentResult, AnswerChange, MarkChange, PublishResult, SaveMarksResult, StudentLookup, WorkResult, WorkStatus } from "./types";

/** Staff web actions. They run the same domain operations as the external API with the cookie session. */

export async function createNewAssignment(
  value: { academyId: string; academicYearId: string; assignmentId: string; draft: AssignmentDraft },
): Promise<AssignmentResult> {
  if (!value || typeof value !== "object") return failure("validation");
  return createAssignment(value);
}

export async function saveAssignment(
  value: { academyId: string; assignmentId: string; expectedVersion: number; draft: AssignmentDraft },
): Promise<AssignmentResult> {
  if (!value || typeof value !== "object") return failure("validation");
  return updateAssignment(value);
}

export async function changeAssignment(
  value: { academyId: string; assignmentId: string; expectedVersion: number; action: AssignmentAction },
): Promise<AssignmentResult> {
  if (!value || typeof value !== "object") return failure("validation");
  return changeAssignmentState(value);
}

export async function saveStudentMarks(
  value: { academyId: string; assignmentId: string; recordId: string | null; code: string | null; expectedRecordId?: string | null; expectedVersion: number; marks: MarkChange[]; answers?: AnswerChange[]; feedback?: string; key: string },
): Promise<SaveMarksResult> {
  if (!value || typeof value !== "object") return failure("validation");
  return saveMarks(value);
}

export async function recordStudentWork(
  value: { academyId: string; assignmentId: string; recordId: string; expectedVersion: number; status: WorkStatus; receivedAt: string | null; note: string },
): Promise<WorkResult> {
  if (!value || typeof value !== "object") return failure("validation");
  return recordWork(value);
}

/** Announces complete results; saving marks never does. */
export async function announceStudentResults(
  value: { academyId: string; assignmentId: string; key: string; items: { recordId: string; expectedVersion: number }[] },
): Promise<PublishResult> {
  if (!value || typeof value !== "object") return failure("validation");
  return publishResults(value);
}

export async function lookUpStudent(value: { academyId: string; assignmentId: string; code: string }): Promise<StudentLookup> {
  if (!value || typeof value !== "object") return failure("validation");
  return resolveStudent(value);
}

/** Only active managers may correct the shared scoring scheme; ordinary marking stays separate. */
export async function correctAssignmentKey(value: { academyId: string; assignmentId: string; questionId: string; choiceId: string; expectedScoringRevision: number; key: string }): Promise<AssignmentResult> {
  return !value || typeof value !== "object" ? failure("validation") : correctScoring(value);
}
export async function excludeAssignmentQuestion(value: { academyId: string; assignmentId: string; questionId: string; expectedScoringRevision: number; key: string }): Promise<AssignmentResult> {
  return !value || typeof value !== "object" ? failure("validation") : correctScoring(value);
}

export async function loadReceivedFiles(value: { academyId: string; assignmentId: string; recordId: string }) {
  if (!value || typeof value !== "object") return failure("validation");
  return listReceivedFiles(value);
}

export async function openAssignmentReceivedFile(value: { academyId: string; fileId: string }) {
  if (!value || typeof value !== "object") return failure("validation");
  return openReceivedFile(value);
}

export async function loadOnlineSetting(academyId: string) {
  return getOnlineSetting(academyId);
}

export async function changeOnlineSetting(value: { academyId: string; enabled: boolean; version: number }) {
  if (!value || typeof value !== "object") return failure("validation");
  return setOnlineSetting(value);
}
