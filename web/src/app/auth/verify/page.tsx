import type { Metadata } from "next";

import { VerifyForm } from "@/modules/auth/components/forms/verify";
import type { PendingAuthKind } from "@/modules/auth/pending-flow";

export const metadata: Metadata = { title: "Verify phone" };

const MODES = new Set<PendingAuthKind>(["signup", "recovery"]);

export default async function VerifyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const requestedMode = typeof params.mode === "string" ? params.mode : "signup";
  const mode = MODES.has(requestedMode as PendingAuthKind) ? requestedMode as PendingAuthKind : "signup";
  return <VerifyForm mode={mode} />;
}
