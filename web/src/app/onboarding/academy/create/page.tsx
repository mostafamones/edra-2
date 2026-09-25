import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { AcademyCreation } from "@/modules/onboarding";

export default async function CreateAcademyPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/auth/login?next=/onboarding/academy/create");
  return <AcademyCreation userId={data.claims.sub} />;
}
