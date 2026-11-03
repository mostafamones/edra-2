import { createFileRoute } from "@tanstack/react-router";
import { notFound, redirect } from "@/lib/navigation";
import { StaffPreview } from "@/modules/navigation/components/staff-preview";
import { findStaffItem } from "@/modules/navigation/manifest";
import { staffAcademyPath } from "@/lib/routing";

function StaffPreviewPage() {
  const { _splat } = Route.useParams();
  const item = findStaffItem(`/app/${_splat ?? ""}`);
  if (!item || !item.preview) return null;
  return <StaffPreview item={item} preview={item.preview} />;
}
export const Route = createFileRoute("/app/$academySlug/$")({
  loader: async ({ params: { academySlug, _splat }, parentMatchPromise }) => {
    if ((await parentMatchPromise).loaderData?.status !== "ok") return;
    const slug = (_splat ?? "").split("/");
    // The sessions pages moved to /app/attendance; keep older links working.
    if (slug[0] === "sessions") redirect(staffAcademyPath(academySlug, `/attendance${slug.slice(1).map((part) => `/${part}`).join("")}`));
    const href = `/app/${slug.join("/")}`;
    const previousRoutes: Record<string, string> = {
      "/app/bookings": "/app/manage/bookings",
      "/app/bookings/review": "/app/manage/bookings",
      "/app/access": "/app/manage/access",
      "/app/communications": "/app/manage/messages",
      "/app/settings": "/app/manage",
      "/app/settings/academy": "/app/manage/academy",
      "/app/settings/structure": "/app/manage/academy/structure",
      "/app/settings/booking": "/app/manage/bookings",
      "/app/settings/team": "/app/manage/team",
      "/app/settings/notifications": "/app/manage/notifications",
      "/app/settings/integrations": "/app/manage/integrations",
      "/app/settings/account": "/app/manage/account",
      "/app/reports": "/app/students",
      "/app/reports/attendance": "/app/attendance",
      "/app/reports/progress": "/app/students",
      "/app/reports/parents": "/app/students",
    };
    if (previousRoutes[href]) redirect(staffAcademyPath(academySlug, previousRoutes[href].slice(4)));
    const item = findStaffItem(href);
    if (!item || !item.preview) notFound();
  },
  component: StaffPreviewPage,
});
