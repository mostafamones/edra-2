import { isAcademyManager, isAcademyRole, type AcademyRole } from "@/modules/academies/roles";

type Role = AcademyRole;

/** Mirrors save_student_code_settings; the database decides, this only shapes the UI. */
export function canConfigureStudentCodes(role: Role) {
  return isAcademyManager(role);
}

/** Every staff role reads the effective configuration. */
export function canViewStudentCodeSettings(role: Role) {
  return isAcademyRole(role);
}
