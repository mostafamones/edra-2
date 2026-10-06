/**
 * The narrow student-code contract other modules may import (attendance uses it to normalize a
 * scanned or typed code identically to the database's `normalize_student_code`).
 */
export { normalizeStudentCode, STUDENT_CODE_MAX_LENGTH } from "./codes/pattern";
