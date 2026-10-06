"use server";

import { changeAttendance, checkIn, publishAttendance } from "./data";
import { failure } from "./errors";
import type { AttendanceChange, ChangeResult, CheckInResult, PublishResult } from "./types";

/** Staff web actions. They run the same domain operations as the external API with the cookie session. */

type Target = { academyId: string; sessionId: string; idempotencyKey: string };

export async function recordCheckIn(value: Target & { lateAfterMinutes?: number } & ({ annualStudentRecordId: string } | { studentCode: string })): Promise<CheckInResult> {
  if (!value || typeof value !== "object") return failure("validation");
  return checkIn(value as Parameters<typeof checkIn>[0]);
}

export async function saveAttendanceChanges(value: Target & { changes: AttendanceChange[] }): Promise<ChangeResult> {
  if (!value || typeof value !== "object") return failure("validation");
  return changeAttendance(value);
}

export async function publishReviewedAttendance(value: Target & { expectedRevision: number }): Promise<PublishResult> {
  if (!value || typeof value !== "object") return failure("validation");
  return publishAttendance(value);
}
