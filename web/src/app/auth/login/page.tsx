import type { Metadata } from "next";

import { LoginForm } from "@/modules/auth/components/forms/login";
import { safeNextPath } from "@/modules/auth/return-path";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const nextPath = safeNextPath(params.next);

  return <LoginForm nextPath={nextPath} passwordReset={params.reset === "1"} />;
}
