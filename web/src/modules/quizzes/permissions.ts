import { isAcademyManager } from "@/modules/academies/roles";

import type { Quiz, QuizStudent, StaffRole } from "./types";

/**
 * Which controls the staff UI offers. The database enforces the same rules in every command (live
 * role, suspension, year, archive, locks and window); these helpers never authorize anything.
 *
 * - Every staff role prepares quizzes, enters physical work, marks and announces complete results.
 * - Owner/Head Admin/Admin set availability, archive, and correct keys or exclude questions.
 * - A closed academic year or an archived quiz is read-only.
 */
export type QuizPermissions = {
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

const NONE: QuizPermissions = {
  edit: false, editStructure: false, editTarget: false, availability: false, archive: false, correct: false, enterWork: false, mark: false,
};

export function quizPermissions(role: StaffRole, quiz: Pick<Quiz, "yearOpen" | "archivedAt" | "phase" | "ready" | "workStartedAt" | "structureLockedAt">): QuizPermissions {
  if (!quiz.yearOpen || quiz.archivedAt !== null) return NONE;
  const manager = isAcademyManager(role);
  const closed = quiz.phase === "closed";
  return {
    edit: true,
    editStructure: quiz.structureLockedAt === null,
    editTarget: quiz.workStartedAt === null,
    availability: manager && !closed && quiz.ready,
    archive: manager,
    correct: manager && quiz.structureLockedAt !== null,
    enterWork: quiz.ready && !closed,
    mark: true,
  };
}

/** A student's result can be announced once it is complete and differs from what was announced. */
export function announceable(student: Pick<QuizStudent, "submission" | "result" | "publicationState">): boolean {
  return student.submission !== null && student.result?.complete === true && student.publicationState !== "published";
}
