import { z } from "zod";

/**
 * The fixed academy staff roles, highest authority first. This is the shared role contract for
 * parsers, labels and capability helpers; the database decides every permission.
 */
export const ACADEMY_ROLES = ["owner", "head_admin", "admin", "instructor"] as const;

export const academyRoleSchema = z.enum(ACADEMY_ROLES);

export type AcademyRole = (typeof ACADEMY_ROLES)[number];

export const ACADEMY_ROLE_LABELS: Record<AcademyRole, string> = {
  owner: "Owner",
  head_admin: "Head Admin",
  admin: "Admin",
  instructor: "Instructor",
};

/** Sort rank: Owner first, then Head Admin, Admin and Instructor. */
export const academyRoleRank = (role: AcademyRole) => ACADEMY_ROLES.indexOf(role);

export function isAcademyRole(value: unknown): value is AcademyRole {
  return academyRoleSchema.safeParse(value).success;
}

/** Ordinary academy management (Owner, Head Admin and Admin). Mirrors public.is_academy_manager. */
export function isAcademyManager(role: AcademyRole) {
  return role === "owner" || role === "head_admin" || role === "admin";
}
