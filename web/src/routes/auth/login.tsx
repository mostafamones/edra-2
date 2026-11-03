import { createFileRoute } from "@tanstack/react-router";
import { useSearchParams } from "@/lib/navigation";
import { searchRecord } from "@/routes/-functions/search";

import { LoginForm } from "@/modules/auth/components/forms/login";
import { safeNextPath } from "@/modules/auth/return-path";

export const Route = createFileRoute("/auth/login")({ head: () => ({ meta: [{ title: "Sign in · Edra" }] }), component: Page });

function Page() {
  const params = searchRecord(useSearchParams().toString());
  const nextPath = safeNextPath(params.next);

  return <LoginForm nextPath={nextPath} passwordReset={params.reset === "1"} phoneVerified={params.verified === "1"} />;
}
