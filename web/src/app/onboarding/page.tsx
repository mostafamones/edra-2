import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { RoleChoice } from "@/modules/onboarding";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/auth/login?next=/onboarding");
  const { mode } = await searchParams;
  return <RoleChoice initialScreen={mode === "instructor" ? "instructor" : "role"} />;
}
