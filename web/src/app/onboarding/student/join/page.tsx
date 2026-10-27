import { redirect } from "next/navigation";

import { staffEntryHref, studentBookingHref, studentHref } from "@/lib/routing";
import { createClient } from "@/lib/supabase/server";
import { StudentJoin } from "@/modules/onboarding";
import { isStaffAccount } from "@/modules/staff/server";
import { getStudentJoinState, pendingStudentEntry } from "@/modules/students/server";

export default async function StudentJoinPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/auth/login?next=/onboarding/student/join");
  if (await isStaffAccount()) redirect(staffEntryHref());
  const state = await getStudentJoinState();
  if (state.kind === "setup_required") redirect("/onboarding/student");
  if (state.kind === "none") redirect(studentHref());
  if (state.kind === "form") {
    // Booking entry for a first-time student: the public form registers them, prefilled.
    const entry = await pendingStudentEntry();
    redirect(entry?.kind === "booking" ? studentBookingHref(entry.token) : studentHref());
  }
  return <StudentJoin state={state} />;
}
