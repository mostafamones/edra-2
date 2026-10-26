import { redirect } from "next/navigation";

import { staffAcademyPath } from "@/lib/routing";

// Bookings register students directly; there is no review queue. Keep older links working.
export default async function Page({ params }: { params: Promise<{ academySlug: string }> }) {
  const { academySlug } = await params;
  redirect(staffAcademyPath(academySlug, "/manage/bookings"));
}
