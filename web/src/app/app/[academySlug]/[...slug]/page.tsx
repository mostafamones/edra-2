import { notFound, redirect } from "next/navigation";

import { StaffPreview } from "@/modules/navigation/components/staff-preview";
import { findStaffItem } from "@/modules/navigation/manifest";
import { staffAcademyPath } from "@/lib/routing";

export default async function StaffPreviewPage({ params }: { params: Promise<{ academySlug: string; slug: string[] }> }) {
  const { academySlug, slug } = await params;
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
  const preview = item?.preview;
  if (!item || !preview) notFound();
  return <StaffPreview item={item} preview={preview} />;
}
