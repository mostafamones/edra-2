import { createFileRoute } from "@tanstack/react-router";
import { useSearchParams } from "@/lib/navigation";
import { searchRecord } from "@/routes/-functions/search";

import { SignupForm } from "@/modules/auth/components/forms/signup";
import { safeNextPath } from "@/modules/auth/return-path";

export const Route = createFileRoute("/auth/signup")({ head: () => ({ meta: [{ title: "Create account · Edra" }] }), component: Page });

function Page() {
  const params = searchRecord(useSearchParams().toString());
  return <SignupForm nextPath={safeNextPath(params.next)} />;
}
