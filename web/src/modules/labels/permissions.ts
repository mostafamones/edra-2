import { isAcademyManager, type AcademyRole } from "@/modules/academies";

/**
 * Owner, Head Admin and Admin create, rename, recolor and delete labels; every active staff member
 * applies and removes them. UI hints only: the database decides.
 */
export const canManageLabels = (role: AcademyRole) => isAcademyManager(role);
