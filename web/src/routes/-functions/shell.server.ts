import "@tanstack/react-start/server-only";
import { headers, cookies } from "@/lib/server/request";
import { classifyHost, platformOrigin, staffAcademyHref, staffEntryHref, studentBookingHref, studentHref } from "@/lib/routing";
import { redirect } from "@/lib/navigation";
import { cookieAuthority } from "@/lib/supabase/authority";
import { listStaffAcademies } from "@/modules/academies/server";
import { isStaffAccount, getStaffJoinState } from "@/modules/staff/server";
import { getStudentProfile, listMyStudentAcademies, pendingStudentInviteToken, getStudentJoinState, pendingStudentEntry, getStudentBookingForm, previewStudentBookingEntry } from "@/modules/students/server";

export async function platform() { return classifyHost((await headers()).get("host") ?? ""); }
export async function signedIn() {
  try { return Boolean(await cookieAuthority()); }
  catch { return false; }
}
async function claims(path: string) {
  const authority = await cookieAuthority();
  if (!authority) throw redirect(`/auth/login?next=${path}`);
  return { sub: authority.userId };
}
export async function account() {
  await claims("/account");
  const academies = await listStaffAcademies();
  const remembered = (await cookies()).get("edra_last_academy_slug")?.value;
  const academy = academies.find(entry => entry.slug === remembered) ?? academies[0];
  if (academy) throw redirect(staffAcademyHref(academy.slug, "/manage/account"));
}
export async function onboarding() { await claims("/onboarding"); }
export async function student() {
  const auth = await claims("/onboarding/student");
  if (await isStaffAccount()) throw redirect(staffEntryHref());
  const { data: profile, error } = await getStudentProfile(auth.sub);
  if (error) return { kind: "error" as const };
  if (profile?.level_id && profile.parent_phone_verified_at) {
    if (await pendingStudentInviteToken()) throw redirect("/onboarding/student/join");
    if ((await listMyStudentAcademies()).length) throw redirect(studentHref());
    return { kind: "join" as const };
  }
  return { kind: "setup" as const, initialParentPhone: profile?.parent_phone_verified_at ? profile.parent_phone : null };
}
export async function studentJoin() {
  await claims("/onboarding/student/join");
  if (await isStaffAccount()) throw redirect(staffEntryHref());
  const state = await getStudentJoinState();
  if (state.kind === "setup_required") throw redirect("/onboarding/student");
  if (state.kind === "none") throw redirect(studentHref());
  if (state.kind === "form") { const entry = await pendingStudentEntry(); throw redirect(entry?.kind === "booking" ? studentBookingHref(entry.token) : studentHref()); }
  return state;
}
export async function instructorJoin() { await claims("/onboarding/instructor/join"); return getStaffJoinState(); }
export async function academyCreate() { return (await claims("/onboarding/academy/create")).sub; }
const ONBOARDING_STATES = ["connected", "existing", "enroll", "staff_help", "level_unavailable", "closed", "changed"];
export async function booking(token: string) {
  if ((await headers()).get("host")?.toLowerCase() !== new URL(platformOrigin("student")).host.toLowerCase()) throw redirect(studentBookingHref(token));
  const entry = await previewStudentBookingEntry(token);
  if (ONBOARDING_STATES.includes(entry.kind)) throw redirect(studentBookingHref(token, "/join"));
  const form = await getStudentBookingForm(token);
  return { form, prefill: entry.kind === "form" ? entry.prefill : null, signInHref: entry.kind === "unauthenticated" ? studentBookingHref(token, "/join") : null };
}
