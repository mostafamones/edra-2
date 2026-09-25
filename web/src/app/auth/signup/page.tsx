import type { Metadata } from "next";

import { SignupForm } from "@/modules/auth/components/forms/signup";
import { safeNextPath } from "@/modules/auth/return-path";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  return <SignupForm nextPath={safeNextPath(params.next)} />;
}
