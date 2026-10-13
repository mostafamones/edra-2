import { isAcademyManager, type AcademyRole } from "@/modules/academies/roles";

type Role = AcademyRole;
export type InvitableRole = Exclude<AcademyRole, "owner">;

/**
 * Mirrors public.staff_role_can_invite: the roles an actor may appoint, which are also the existing
 * roles they may manage. The database decides; this only shapes the UI.
 */
export function invitableRoles(role: Role): InvitableRole[] {
  if (role === "owner") return ["head_admin", "admin", "instructor"];
  if (role === "head_admin") return ["admin", "instructor"];
  if (role === "admin") return ["instructor"];
  return [];
}

export function canViewInvitations(role: Role) {
  return isAcademyManager(role);
}

/** Suspend, restore or remove: never yourself, the Owner, or a role outside your authority. */
export function canManageMember(actorRole: Role, targetRole: Role, actorId: string, targetId: string) {
  if (actorId === targetId || targetRole === "owner") return false;
  return (invitableRoles(actorRole) as Role[]).includes(targetRole);
}

/** Roles the member may be changed to: both their current and the new role must be within authority. */
export function roleChoices(actorRole: Role, targetRole: Role, actorId: string, targetId: string): InvitableRole[] {
  if (!canManageMember(actorRole, targetRole, actorId, targetId)) return [];
  return invitableRoles(actorRole).filter((role) => role !== targetRole);
}
