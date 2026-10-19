import { studentHref } from "@/lib/routing";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { StudentJoinPrompt, StudentOnboarding } from "@/modules/onboarding";
import { studentOnboardingCopy } from "@/modules/onboarding/copy/student";
import { getStudentProfile, listMyStudentAcademies, pendingStudentInviteToken } from "@/modules/students/server";

export default async function StudentOnboardingPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) redirect("/auth/login?next=/onboarding/student");

  const { data: profile, error } = await getStudentProfile(auth.claims.sub);
  if (error) {
    return <main className="mx-auto flex min-h-svh max-w-xl items-center px-6"><p role="alert">{studentOnboardingCopy.loadError}</p></main>;
  }
  if (profile?.level_id && profile.parent_phone_verified_at) {
    if (await pendingStudentInviteToken()) redirect("/onboarding/student/join");
    // Students without an academy are asked to join one (or skip) instead of landing on an empty portal.
    if ((await listMyStudentAcademies()).length) redirect(studentHref());
    return <StudentJoinPrompt />;
  }

  return <StudentOnboarding initialParentPhone={profile?.parent_phone_verified_at ? profile.parent_phone : null} />;
}
