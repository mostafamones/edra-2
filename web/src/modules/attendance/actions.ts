"use server";

import { addAttendee, changeAttendance, checkIn, markUnrecordedAbsent, publishAttendance, searchAttendees } from "./data";
import { failure } from "./errors";
import type {
  AddAttendeeResult, AttendanceChange, AttendeeSearchResult, ChangeResult, CheckInResult, PublishResult, UnrecordedAbsenceResult,
} from "./types";

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

export async function markRemainingAbsent(value: Target & { expectedRevision: number }): Promise<UnrecordedAbsenceResult> {
  if (!value || typeof value !== "object") return failure("validation");
  return markUnrecordedAbsent(value);
}

export async function findAttendees(value: { academyId: string; sessionId: string; query: string; offset?: number }): Promise<AttendeeSearchResult> {
  if (!value || typeof value !== "object") return failure("validation");
  return searchAttendees({ academyId: value.academyId, sessionId: value.sessionId, query: value.query, offset: value.offset });
}

export async function addSessionAttendee(value: Target & { annualStudentRecordId: string; expectedRevision: number }): Promise<AddAttendeeResult> {
  if (!value || typeof value !== "object") return failure("validation");
  return addAttendee(value);
}
