import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { BreadcrumbTitleProvider } from "@/components/shared/breadcrumb-title";
import { resolveStaffAcademy, wasRemovedFromAcademy } from "@/modules/academies/server";
import { ScopedAcademyProvider } from "@/modules/auth/components/provider";
import { PortalHeader } from "@/modules/navigation/components/header";
import { StaffSidebar } from "@/modules/navigation/components/staff-sidebar";

export default async function AcademyLayout({ children, params }: {
  children: React.ReactNode;
  params: Promise<{ academySlug: string }>;
}) {
  const { academySlug } = await params;
  const academy = await resolveStaffAcademy(academySlug);
  if (!academy) {
    if (await wasRemovedFromAcademy(academySlug)) redirect("/onboarding/instructor/join");
    notFound();
  }
  const defaultOpen = (await cookies()).get("sidebar_state")?.value !== "false";
  return (
    <ScopedAcademyProvider academy={academy}>
      <SidebarProvider defaultOpen={defaultOpen} className="h-svh min-h-0 overflow-hidden"
        style={{ "--sidebar-width": "calc(var(--spacing) * 68)", "--header-height": "calc(var(--spacing) * 16)" } as React.CSSProperties}>
        <StaffSidebar />
        <BreadcrumbTitleProvider>
          <SidebarInset className="min-h-0 overflow-y-auto">
            <PortalHeader portal="staff" />
            <div className="flex min-h-0 flex-1 flex-col">{children}</div>
          </SidebarInset>
        </BreadcrumbTitleProvider>
      </SidebarProvider>
    </ScopedAcademyProvider>
  );
}
