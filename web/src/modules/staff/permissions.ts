import type { AcademyEntry } from "@/modules/academies";

type Role = AcademyEntry["role"];
export type InvitableRole = "admin" | "instructor";

/** Mirrors public.staff_role_can_invite; the database decides, this only shapes the UI. */
export function invitableRoles(role: Role): InvitableRole[] {
  if (role === "owner") return ["admin", "instructor"];
  if (role === "admin") return ["instructor"];
  return [];
}

export function canViewInvitations(role: Role) {
  return role === "owner" || role === "admin";
}

export function canRemoveMember(actorRole: Role, targetRole: Role, actorId: string, targetId: string) {
  if (actorId === targetId || targetRole === 'owner') return false;
  return actorRole === 'owner' || (actorRole === 'admin' && targetRole === 'instructor');
}

export function canPromoteMember(actorRole: Role, targetRole: Role, actorId: string, targetId: string) {
  return actorRole === "owner" && targetRole === "instructor" && actorId !== targetId;
}

export function canDemoteMember(actorRole: Role, targetRole: Role, actorId: string, targetId: string) {
  return actorRole === "owner" && targetRole === "admin" && actorId !== targetId;
}
