import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { InstructorJoin } from "@/modules/onboarding";

export default async function InstructorJoinPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/auth/login?next=/onboarding/instructor/join");
  return <InstructorJoin />;
}
