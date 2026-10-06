import { internalStaffPath, publicHref } from "../../lib/routing";
import { canViewStaffItem, findStaffItem, type StaffRole } from "./manifest";

/** Carry a permitted section, never source record identifiers or filters. */
export function academySwitchHref(pathname: string, sourceSlug: string | undefined, target: { slug: string; role: StaffRole }) {
  const internal = internalStaffPath(pathname.split(/[?#]/)[0], sourceSlug);
  const segments = internal.split("/");
  const section = segments[2] === "manage" && segments[3] ? `/app/manage/${segments[3]}` : segments[2] ? `/app/${segments[2]}` : "/app";
  const item = findStaffItem(section);
  const destination = item && canViewStaffItem(item, target.role) ? item.href : "/app";
  return publicHref(destination, target.slug);
}
