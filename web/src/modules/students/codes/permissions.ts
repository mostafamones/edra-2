import type { AcademyEntry } from "@/modules/academies";

type Role = AcademyEntry["role"];

/** Mirrors save_student_code_settings; the database decides, this only shapes the UI. */
export function canConfigureStudentCodes(role: Role) {
  return role === "owner" || role === "admin";
}

/** Every staff role reads the effective configuration. */
export function canViewStudentCodeSettings(role: Role) {
  return role === "owner" || role === "admin" || role === "instructor";
}
