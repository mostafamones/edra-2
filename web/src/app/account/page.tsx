import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { staffEntryHref } from "@/lib/routing";
import { PagePreviewView } from "@/modules/navigation/components/preview";
import { findStaffItem } from "@/modules/navigation/manifest";

/** Account settings are global; no academy membership authorizes this preview. */
export default async function AccountPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/auth/login?next=/account");
  return <main className="flex min-h-svh flex-col">
    <Link href={staffEntryHref()} className="m-6 self-start text-sm underline underline-offset-4">Back to your workspace</Link>
    <PagePreviewView preview={findStaffItem("/app/manage/account")!.preview!} />
  </main>;
}
