import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { createClient } from "@/lib/supabase/server";
import { PUBLIC_PATH_HEADER, staffEntryHref } from "@/lib/routing";
import { isStaffAccount } from "@/modules/staff/server";
import { getStudentProfile, listMyStudentAcademies } from "@/modules/students/server";
import { PortalHeader } from "@/modules/navigation/components/header";
import { StudentMobileNav } from "@/modules/navigation/components/student-mobile-nav";
import { StudentSidebar } from "@/modules/navigation/components/student-sidebar";

export default async function LearnLayout({ children }: LayoutProps<"/learn">) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    const path = (await headers()).get(PUBLIC_PATH_HEADER) ?? "/";
    redirect(`/auth/login?next=${encodeURIComponent(path)}`);
  }

  if (await isStaffAccount()) redirect(staffEntryHref());

  const { data: profile, error } = await getStudentProfile(data.claims.sub);
  if (error) throw error;
  if (!profile?.level_id || !profile.parent_phone || !profile.parent_phone_verified_at) {
    redirect("/onboarding/student");
  }

  const defaultOpen = (await cookies()).get("sidebar_state")?.value !== "false";
  const academies = await listMyStudentAcademies();

  return (
    <SidebarProvider defaultOpen={defaultOpen} className="min-h-svh">
      <StudentSidebar academies={academies} />
      <SidebarInset className="min-h-svh">
        <PortalHeader portal="student" />
        <div className="flex min-h-0 flex-1 flex-col pb-20 md:pb-0">{children}</div>
      </SidebarInset>
      <StudentMobileNav />
    </SidebarProvider>
  );
}
