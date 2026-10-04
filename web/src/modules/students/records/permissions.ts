/**
 * Student-record permissions shared by the UI and the server actions. The database RPCs enforce
 * the same rules; these helpers only decide what to offer and what to reject before a write.
 *
 * - Every staff role reads records and contacts, creates records, and edits names and phones.
 * - Owners and admins also change placement (level, track, group) and student type, archive or restore,
 *   import students, and change groups in bulk.
 */
export type StaffRole = "owner" | "admin" | "instructor";

const isManager = (role: StaffRole) => role === "owner" || role === "admin";

export const canCreateStudentRecord = (role: StaffRole) => Boolean(role);
export const canEditStudentContact = (role: StaffRole) => Boolean(role);
export const canEditStudentPlacement = (role: StaffRole) => isManager(role);
export const canArchiveStudentRecords = (role: StaffRole) => isManager(role);
export const canImportStudents = (role: StaffRole) => isManager(role);
export const canChangeStudentGroups = (role: StaffRole) => isManager(role);
