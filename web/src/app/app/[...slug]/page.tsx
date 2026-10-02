import { notFound, redirect } from "next/navigation";

import { StaffPreview } from "@/modules/navigation/components/staff-preview";
import { findStaffItem } from "@/modules/navigation/manifest";

export default async function StaffPreviewPage({ params }: PageProps<"/app/[...slug]">) {
  const { slug } = await params;
  const href = `/app/${slug.join("/")}`;
  const previousRoutes: Record<string, string> = {
    "/app/bookings": "/app/manage/bookings",
    "/app/bookings/review": "/app/manage/bookings/review",
    "/app/access": "/app/manage/access",
    "/app/communications": "/app/manage/messages",
    "/app/settings": "/app/manage",
    "/app/settings/academy": "/app/manage/academy",
    "/app/settings/structure": "/app/manage/structure",
    "/app/settings/booking": "/app/manage/booking-form",
    "/app/settings/team": "/app/manage/team",
    "/app/settings/notifications": "/app/manage/notifications",
    "/app/settings/integrations": "/app/manage/integrations",
    "/app/settings/account": "/app/manage/account",
    "/app/reports": "/app/students",
    "/app/reports/attendance": "/app/attendance",
    "/app/reports/progress": "/app/students",
    "/app/reports/parents": "/app/students",
  };
  if (previousRoutes[href]) redirect(previousRoutes[href]);

  const item = findStaffItem(href);
  const preview = item?.preview;
  if (!item || !preview) notFound();
  return <StaffPreview item={item} preview={preview} />;
}
