import type { Assignment, StaffRole } from "./types";

/**
 * What the UI offers for an assignment. The database enforces the same rules in every command;
 * these helpers only decide which controls to show.
 *
 * - Every staff role creates and edits drafts (structure included).
 * - Owner/Admin publish, unpublish before activity, close, reopen, archive, and edit the text
 *   details of a published or closed assignment. Its structure is locked once published.
 * - Every staff role records work, enters marks, and publishes individual results of a published or
 *   closed assignment.
 * - A closed academic year makes everything read-only.
 */
export const isManager = (role: StaffRole) => role === "owner" || role === "admin";

export type AssignmentPermissions = {
  edit: boolean;
  editStructure: boolean;
  publish: boolean;
  unpublish: boolean;
  close: boolean;
  reopen: boolean;
  archive: boolean;
  /** Record work, enter marks, and publish results: every staff role, once published. */
  mark: boolean;
};

const NONE: AssignmentPermissions = {
  edit: false, editStructure: false, publish: false, unpublish: false, close: false, reopen: false, archive: false, mark: false,
};

export function assignmentPermissions(role: StaffRole, assignment: Pick<Assignment, "state" | "yearOpen" | "hasActivity">): AssignmentPermissions {
  if (!assignment.yearOpen || assignment.state === "archived") return NONE;
  const manager = isManager(role);
  const draft = assignment.state === "draft";
  return {
    edit: draft || manager,
    editStructure: draft,
    publish: manager && draft,
    unpublish: manager && assignment.state === "published" && !assignment.hasActivity,
    close: manager && assignment.state === "published",
    reopen: manager && assignment.state === "closed",
    archive: manager && (draft || assignment.state === "closed"),
    mark: assignment.state === "published" || assignment.state === "closed",
  };
}
