import type { Assignment, StaffRole } from "./types";

/**
 * What the UI offers for an assignment. The database enforces the same rules in every command;
 * these helpers only decide which controls to show.
 *
 * - Every staff role creates assignments and edits the whole setup (structure and audience) of an
 *   active assignment until marking starts. There is no Publish step.
 * - Once work, marks, or results exist (or the assignment is closed), the structure and recipients
 *   are frozen and only Owner/Admin edit the text details.
 * - Owner/Admin close, reopen, and archive (active without activity, or closed).
 * - Every staff role records work, enters marks, and announces individual results of an active or
 *   closed assignment whose parts are all complete.
 * - A closed academic year makes everything read-only.
 */
export const isManager = (role: StaffRole) => role === "owner" || role === "admin";

export type AssignmentPermissions = {
  edit: boolean;
  editStructure: boolean;
  close: boolean;
  reopen: boolean;
  archive: boolean;
  /** Record work, enter marks, and announce results: every staff role, once every part is complete. */
  mark: boolean;
};

const NONE: AssignmentPermissions = { edit: false, editStructure: false, close: false, reopen: false, archive: false, mark: false };

export function assignmentPermissions(
  role: StaffRole, assignment: Pick<Assignment, "state" | "yearOpen" | "hasActivity" | "ready">,
): AssignmentPermissions {
  if (!assignment.yearOpen || assignment.state === "archived") return NONE;
  const manager = isManager(role);
  const active = assignment.state === "active";
  const setup = active && !assignment.hasActivity;
  return {
    edit: setup || manager,
    editStructure: setup,
    close: manager && active,
    reopen: manager && assignment.state === "closed",
    archive: manager && (setup || assignment.state === "closed"),
    mark: assignment.ready,
  };
}
