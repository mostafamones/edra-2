import { isAcademyManager } from "@/modules/academies/roles";

import type { Exam, ExamStudent, StaffRole } from "./types";

/**
 * Which controls the staff UI offers. The database enforces the same rules in every command (live
 * role, suspension, year, archive, locks and window); these helpers never authorize anything.
 *
 * - Every staff role prepares exams, enters physical work, marks and announces complete results.
 * - Owner/Head Admin/Admin set availability, archive, and correct keys or exclude questions.
 * - A closed academic year or an archived exam is read-only.
 */
export type ExamPermissions = {
  edit: boolean;
  /** Parts, questions, choices, maxima and key (until answers or marks exist). */
  editStructure: boolean;
  /** Audience and timer (until work begins). */
  editTarget: boolean;
  availability: boolean;
  archive: boolean;
  /** Key corrections and exclusions (after the structure locks). */
  correct: boolean;
  /** Physical draft entry and confirmation (until actual closure). */
  enterWork: boolean;
  /** Private marks and announcement of accepted work. */
  mark: boolean;
};

const NONE: ExamPermissions = {
  edit: false, editStructure: false, editTarget: false, availability: false, archive: false, correct: false, enterWork: false, mark: false,
};

export function examPermissions(role: StaffRole, exam: Pick<Exam, "yearOpen" | "archivedAt" | "phase" | "ready" | "workStartedAt" | "structureLockedAt">): ExamPermissions {
  if (!exam.yearOpen || exam.archivedAt !== null) return NONE;
  const manager = isAcademyManager(role);
  const closed = exam.phase === "closed";
  return {
    edit: true,
    editStructure: exam.structureLockedAt === null,
    editTarget: exam.workStartedAt === null,
    availability: manager && !closed && exam.ready,
    archive: manager,
    correct: manager && exam.structureLockedAt !== null,
    enterWork: exam.ready && !closed,
    mark: true,
  };
}

/** A student's result can be announced once it is complete and differs from what was announced. */
export function announceable(student: Pick<ExamStudent, "submission" | "result" | "publicationState">): boolean {
  return student.submission !== null && student.result?.complete === true && student.publicationState !== "published";
}
