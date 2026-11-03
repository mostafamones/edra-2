import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { BreadcrumbTitleProvider } from "@/components/shared/breadcrumb-title";
import { PortalHeader } from "@/modules/navigation/components/header";
import { StudentMobileNav } from "@/modules/navigation/components/student-mobile-nav";
import { StudentSidebar } from "@/modules/navigation/components/student-sidebar";
import { loadStudentLayout } from "@/routes/-functions/student";
export const Route = createFileRoute("/learn")({
  loader: ({ location }) => loadStudentLayout({ data: location.publicHref.split("#", 1)[0] }),
  shouldReload: ({ cause }) => cause !== "stay",
  component: LearnLayout,
});
function LearnLayout() {
  const { defaultOpen, academies } = Route.useLoaderData();
  return <SidebarProvider defaultOpen={defaultOpen} className="h-svh min-h-0 overflow-hidden"><StudentSidebar academies={academies} /><SidebarInset className="min-h-0 overflow-y-auto overscroll-none"><BreadcrumbTitleProvider><PortalHeader portal="student" academies={academies} /><div className="flex min-h-0 flex-1 flex-col pb-20 md:pb-0"><Outlet /></div></BreadcrumbTitleProvider></SidebarInset><StudentMobileNav /></SidebarProvider>;
}
