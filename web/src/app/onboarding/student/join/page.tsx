import { redirect } from "next/navigation";

import { studentHref } from "@/lib/routing";
import { createClient } from "@/lib/supabase/server";
import { StudentJoin } from "@/modules/onboarding";
import { getStudentJoinState } from "@/modules/students/server";

export default async function StudentJoinPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/auth/login?next=/onboarding/student/join");
  const state = await getStudentJoinState();
  if (state.kind === "setup_required") redirect("/onboarding/student");
  if (state.kind === "none") redirect(studentHref());
  return <StudentJoin state={state} />;
}
