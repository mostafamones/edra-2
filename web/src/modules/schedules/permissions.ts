import { isAcademyManager, type AcademyRole } from "@/modules/academies/roles";

import type { ScheduleKind } from "./validation";

/**
 * Schedule permissions shared by the UI and the server actions. RLS enforces the same rules in the
 * database; these helpers only decide what to offer and what to reject before a write.
 *
 * - Owners, Head Admins and Admins manage every schedule.
 * - Instructors create one-offs, edit any academy one-off, and archive only one-offs they created.
 */
export type StaffRole = AcademyRole;
type ScheduleRef = { kind: ScheduleKind; archived_at: string | null; created_by: string };

const isManager = isAcademyManager;

export function creatableKinds(role: StaffRole): ScheduleKind[] {
  return isManager(role) ? ["recurring", "one_off"] : ["one_off"];
}

export function canCreateSchedule(role: StaffRole, kind: ScheduleKind) {
  return creatableKinds(role).includes(kind);
}

export function canEditSchedule(role: StaffRole, schedule: Pick<ScheduleRef, "kind" | "archived_at">) {
  return !schedule.archived_at && (isManager(role) || schedule.kind === "one_off");
}

export function canArchiveSchedule(role: StaffRole, schedule: ScheduleRef, userId: string | undefined) {
  if (schedule.archived_at) return false;
  return isManager(role) || (schedule.kind === "one_off" && Boolean(userId) && schedule.created_by === userId);
}
