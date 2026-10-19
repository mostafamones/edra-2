import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { staffAcademyHref, staffEntryHref } from "@/lib/routing";
import { listStaffAcademies } from "@/modules/academies/server";
import { AccountSettings } from "@/modules/account";

/** Account settings are global; no academy membership authorizes or is required for them. */
export default async function AccountPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/auth/login?next=/account");
  // With an academy the page opens inside its workspace layout; without one it stands alone.
  const academies = await listStaffAcademies();
  const remembered = (await cookies()).get("edra_last_academy_slug")?.value;
  const academy = academies.find(entry => entry.slug === remembered) ?? academies[0];
  if (academy) redirect(staffAcademyHref(academy.slug, "/manage/account"));
  return <div className="flex min-h-svh flex-col">
    <Link href={staffEntryHref()} className="m-6 mb-0 self-start text-sm underline underline-offset-4">Back to your workspace</Link>
    <AccountSettings />
  </div>;
}
