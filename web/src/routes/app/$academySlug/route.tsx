import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { BreadcrumbTitleProvider } from "@/components/shared/breadcrumb-title";
import { ScopedAcademyProvider } from "@/modules/auth/components/provider";
import { SuspendedAccess } from "@/modules/auth/components/suspended-access";
import { PortalHeader } from "@/modules/navigation/components/header";
import { StaffSidebar } from "@/modules/navigation/components/staff-sidebar";
import { ConcernPanelProvider } from "@/modules/concerns";
import { loadStaffAcademy } from "@/routes/-functions/staff";

function AcademyLayout() {
  const result = Route.useLoaderData();
  if (result.status === "suspended") return <SuspendedAccess academyName={result.academyName} retryHref={result.retryHref} otherAcademies={result.otherAcademies} />;
  const { academy, defaultOpen } = result;
  return (
    <ScopedAcademyProvider academy={academy}>
      <ConcernPanelProvider>
      <SidebarProvider defaultOpen={defaultOpen} className="h-svh min-h-0 overflow-hidden"
        style={{ "--sidebar-width": "calc(var(--spacing) * 68)", "--header-height": "calc(var(--spacing) * 16)" } as React.CSSProperties}>
        <StaffSidebar />
        <BreadcrumbTitleProvider>
          {/* Icon collapse keeps its gap, so the inset needs no extra left margin; this keeps the rail's padding even on both sides. */}
          <SidebarInset className="min-h-0 overflow-y-auto overscroll-none md:peer-data-[collapsible=icon]:ml-0!">
            <PortalHeader portal="staff" />
            <div className="flex flex-1 flex-col"><Outlet /></div>
          </SidebarInset>
        </BreadcrumbTitleProvider>
      </SidebarProvider>
      </ConcernPanelProvider>
    </ScopedAcademyProvider>
  );
}
export const Route = createFileRoute("/app/$academySlug")({ loader: ({ params }) => loadStaffAcademy({ data: params.academySlug }), shouldReload: ({ cause }) => cause !== "stay", component: AcademyLayout });
