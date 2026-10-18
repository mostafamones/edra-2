import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { staffEntryHref } from "@/lib/routing";
import { AccountSettings } from "@/modules/account";

/** Account settings are global; no academy membership authorizes or is required for them. */
export default async function AccountPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/auth/login?next=/account");
  return <div className="flex min-h-svh flex-col">
    <Link href={staffEntryHref()} className="m-6 mb-0 self-start text-sm underline underline-offset-4">Back to your workspace</Link>
    <AccountSettings />
  </div>;
}
