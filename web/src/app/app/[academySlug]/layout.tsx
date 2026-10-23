import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { BreadcrumbTitleProvider } from "@/components/shared/breadcrumb-title";
import { staffAcademyHref, validAcademySlug } from "@/lib/routing";
import { listStaffAcademies, listSuspendedStaffAcademies, wasRemovedFromAcademy } from "@/modules/academies/server";
import { ScopedAcademyProvider } from "@/modules/auth/components/provider";
import { SuspendedAccess } from "@/modules/auth/components/suspended-access";
import { PortalHeader } from "@/modules/navigation/components/header";
import { StaffSidebar } from "@/modules/navigation/components/staff-sidebar";

export default async function AcademyLayout({ children, params }: {
  children: React.ReactNode;
  params: Promise<{ academySlug: string }>;
}) {
  const { academySlug } = await params;
  // Unknown and inaccessible slugs both 404, without an alternative academy.
  const academies = validAcademySlug(academySlug) ? await listStaffAcademies() : [];
  const academy = academies.find(entry => entry.slug === academySlug);
  if (!academy) {
    if (!validAcademySlug(academySlug)) notFound();
    // Only the caller's own suspended membership or previous removal is disclosed.
    const suspended = (await listSuspendedStaffAcademies()).find(entry => entry.slug === academySlug);
    if (suspended) {
      return <SuspendedAccess academyName={suspended.name} retryHref={staffAcademyHref(academySlug)} otherAcademies={academies.length > 0} />;
    }
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
          {/* Icon collapse keeps its gap, so the inset needs no extra left margin; this keeps the rail's padding even on both sides. */}
          <SidebarInset className="min-h-0 overflow-y-auto overscroll-none md:peer-data-[collapsible=icon]:ml-0!">
            <PortalHeader portal="staff" />
            <div className="flex flex-1 flex-col">{children}</div>
          </SidebarInset>
        </BreadcrumbTitleProvider>
      </SidebarProvider>
    </ScopedAcademyProvider>
  );
}
