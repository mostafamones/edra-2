"use server";

import { cleanupWorkFiles, finishWorkUpload, runAssignmentCommand, signWorkImages, startWorkUpload } from "./data";
import type { ClaimOutcome, EditorDocument, StudentAssignment, StudentAssignmentResult } from "./types";

/**
 * Student assignment commands (cookie session). Server actions are reachable by direct POST, so
 * each input is validated here and the database reauthorizes the caller, record and editor claim.
 */

export async function claimAssignmentEditor(value: unknown) {
  return runAssignmentCommand(value) as Promise<StudentAssignmentResult<ClaimOutcome>>;
}

export async function renewAssignmentEditor(value: unknown) {
  return runAssignmentCommand(value) as Promise<StudentAssignmentResult<{ leaseUntil: string; version: number }>>;
}

export async function readAssignmentEditor(value: unknown) {
  return runAssignmentCommand(value) as Promise<StudentAssignmentResult<EditorDocument>>;
}

export async function saveAssignmentAnswers(value: unknown) {
  return runAssignmentCommand(value) as Promise<StudentAssignmentResult<{ version: number }>>;
}

export async function submitAssignment(value: unknown) {
  const result = await runAssignmentCommand(value) as StudentAssignmentResult<StudentAssignment>;
  if (result.ok && typeof value === "object" && value) {
    const { academyId, assignmentId } = value as { academyId: string; assignmentId: string };
    await cleanupWorkFiles(academyId, assignmentId);
  }
  return result;
}

export async function startAssignmentUpload(value: unknown) {
  return startWorkUpload(value);
}

export async function finishAssignmentUpload(value: unknown) {
  return finishWorkUpload(value);
}

export async function removeAssignmentFile(value: unknown) {
  const result = await runAssignmentCommand(value) as StudentAssignmentResult<{ fileId: string; state: "removed" }>;
  if (result.ok && typeof value === "object" && value) {
    const { academyId, assignmentId } = value as { academyId: string; assignmentId: string };
    await cleanupWorkFiles(academyId, assignmentId);
  }
  return result;
}

export async function signAssignmentImages(value: unknown) {
  return signWorkImages(value);
}
