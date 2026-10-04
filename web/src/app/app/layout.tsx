import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { BreadcrumbTitleProvider } from "@/components/shared/breadcrumb-title";
import { createClient } from "@/lib/supabase/server";
import { getStudentProfile } from "@/modules/students/server";
import { PortalHeader } from "@/modules/navigation/components/header";
import { StaffSidebar } from "@/modules/navigation/components/staff-sidebar";

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/auth/login?next=/app");

  const { data: memberships, error } = await supabase
    .from("academy_memberships")
    .select("academy_id")
    .eq("user_id", data.claims.sub)
    .limit(1);
  if (error) throw error;

  if (!memberships?.length) {
    const { data: student, error: studentError } = await getStudentProfile(data.claims.sub);
    if (!studentError && student?.level_id && student.parent_phone_verified_at) redirect("/learn");
    redirect("/onboarding");
  }

  const defaultOpen = (await cookies()).get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider
      defaultOpen={defaultOpen}
      className="h-svh min-h-0 overflow-hidden"
      style={{ "--sidebar-width": "calc(var(--spacing) * 68)", "--header-height": "calc(var(--spacing) * 16)" } as React.CSSProperties}
    >
      <StaffSidebar />
      <BreadcrumbTitleProvider>
        <SidebarInset className="min-h-0 overflow-y-auto">
          <PortalHeader portal="staff" />
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </SidebarInset>
      </BreadcrumbTitleProvider>
    </SidebarProvider>
  );
}
