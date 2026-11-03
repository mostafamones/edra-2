import "@tanstack/react-start/server-only";
import { cookies, headers } from "@/lib/server/request";
import { redirect, notFound } from "@/lib/navigation";
import { cookieAuthority } from "@/lib/supabase/authority";
import { PUBLIC_PATH_HEADER, staffAcademyHref, staffEntryHref, studentHref, validAcademySlug } from "@/lib/routing";
import { listStaffAcademies, listSuspendedStaffAcademies, wasRemovedFromAcademy } from "@/modules/academies/server";
import { getStudentProfile } from "@/modules/students/server";
import { getAcademyProfile } from "@/modules/academies/profile/server";
import { getStructure } from "@/modules/academies/structure/server";

const LEGACY_ENTRY = /^\/app(?:\/|\?|$)/;

export async function staffEntry(routerPath: string) {
  // The gateway lands legacy URLs on /app and keeps the original only in its trusted header; server-function requests carry their own path there.
  const trusted = (await headers()).get(PUBLIC_PATH_HEADER);
  const publicPath = trusted && LEGACY_ENTRY.test(trusted) ? trusted : routerPath;
  const authority = await cookieAuthority();
  if (!authority) redirect(`/auth/login?next=${encodeURIComponent(publicPath)}`);
  const academies = await listStaffAcademies();
  const remembered = (await cookies()).get("edra_last_academy_slug")?.value;
  // Last-used academy if still accessible; otherwise the first staff membership.
  const academy = academies.find(entry => entry.slug === remembered) ?? academies[0];
  if (!academy) {
    // Every staff membership is suspended: explain that instead of offering onboarding again.
    const suspended = await listSuspendedStaffAcademies();
    if (suspended.length > 0) return { academyName: suspended.length === 1 ? suspended[0].name : undefined, retryHref: staffEntryHref(), otherAcademies: false };
    const { data: student, error } = await getStudentProfile(authority.userId);
    if (!error && student?.level_id && student.parent_phone_verified_at) redirect(studentHref());
    redirect("/onboarding");
  }
  // Queries and record identifiers survive known old staff entry links unchanged.
  const legacy = LEGACY_ENTRY.test(publicPath);
  const parsed = new URL(publicPath, "https://routing.invalid");
  const destination = legacy ? parsed.pathname.slice(4) : "";
  redirect(staffAcademyHref(academy.slug, destination) + (legacy ? parsed.search : ""));
}

export async function staffAcademy(academySlug: string) {
  // Unknown and inaccessible slugs both 404, without an alternative academy.
  if (!validAcademySlug(academySlug)) notFound();
  const academies = await listStaffAcademies();
  const academy = academies.find(entry => entry.slug === academySlug);
  if (!academy) {
    // Only the caller's own suspended membership or previous removal is disclosed.
    const suspended = (await listSuspendedStaffAcademies()).find(entry => entry.slug === academySlug);
    if (suspended) return { status: "suspended" as const, academyName: suspended.name, retryHref: staffAcademyHref(academySlug), otherAcademies: academies.length > 0 };
    if (await wasRemovedFromAcademy(academySlug)) redirect("/onboarding/instructor/join");
    notFound();
  }
  const defaultOpen = (await cookies()).get("sidebar_state")?.value !== "false";
  return { status: "ok" as const, academy, defaultOpen };
}

export async function academyProfile(slug: string) {
  let profile;
  try { profile = await getAcademyProfile(slug); }
  catch { return { profile: null }; }
  // The layout already handles unknown and inaccessible academies; this covers a membership lost in between.
  if (!profile) notFound();
  return { profile };
}

export async function academyStructure(slug: string) {
  let structure;
  try { structure = await getStructure(slug); }
  catch { return { structure: null }; }
  if (!structure) notFound();
  return { structure };
}
