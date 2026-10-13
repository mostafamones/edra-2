import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PUBLIC_PATH_HEADER, staffAcademyHref, staffEntryHref, studentHref } from "@/lib/routing";
import { listStaffAcademies, listSuspendedStaffAcademies } from "@/modules/academies/server";
import { SuspendedAccess } from "@/modules/auth/components/suspended-access";
import { getStudentProfile } from "@/modules/students/server";

/** Only entry/legacy links select an academy; explicit slugs never reach this page. */
export default async function StaffEntryPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const publicPath = (await headers()).get(PUBLIC_PATH_HEADER) ?? "/";
  if (!data?.claims) redirect(`/auth/login?next=${encodeURIComponent(publicPath)}`);
  const academies = await listStaffAcademies();
  const remembered = (await cookies()).get("edra_last_academy_slug")?.value;
  // Last-used academy if still accessible; otherwise the first staff membership.
  const academy = academies.find(entry => entry.slug === remembered) ?? academies[0];
  if (!academy) {
    // Every staff membership is suspended: explain that instead of offering onboarding again.
    const suspended = await listSuspendedStaffAcademies();
    if (suspended.length > 0) {
      return <SuspendedAccess academyName={suspended.length === 1 ? suspended[0].name : undefined} retryHref={staffEntryHref()} otherAcademies={false} />;
    }
    const { data: student, error } = await getStudentProfile(data.claims.sub);
    if (!error && student?.level_id && student.parent_phone_verified_at) redirect(studentHref());
    redirect("/onboarding");
  }
  // The proxy only supplies this header after trusted host/path classification.
  // Queries and record identifiers survive known old staff entry links unchanged.
  const legacy = /^\/app(?:\/|\?|$)/.test(publicPath);
  const parsed = new URL(publicPath, "https://routing.invalid");
  const destination = legacy ? parsed.pathname.slice(4) : "";
  redirect(staffAcademyHref(academy.slug, destination) + (legacy ? parsed.search : ""));
}
