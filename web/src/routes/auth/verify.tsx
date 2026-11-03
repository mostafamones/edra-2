import { createFileRoute } from "@tanstack/react-router";
import { useSearchParams } from "@/lib/navigation";
import { searchRecord } from "@/routes/-functions/search";

import { VerifyForm } from "@/modules/auth/components/forms/verify";
import type { PendingAuthKind } from "@/modules/auth/pending-flow";

export const Route = createFileRoute("/auth/verify")({ head: () => ({ meta: [{ title: "Verify phone · Edra" }] }), component: Page });

const MODES = new Set<PendingAuthKind>(["signup", "recovery"]);

function Page() {
  const params = searchRecord(useSearchParams().toString());
  const requestedMode = typeof params.mode === "string" ? params.mode : "signup";
  const mode = MODES.has(requestedMode as PendingAuthKind) ? requestedMode as PendingAuthKind : "signup";
  return <VerifyForm mode={mode} />;
}
