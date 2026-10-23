import { redirect } from "next/navigation";

import { staffAcademyPath } from "@/lib/routing";

// Moved under the General page; keep older links working.
export default async function Page({ params }: { params: Promise<{ academySlug: string }> }) {
  const { academySlug } = await params;
  redirect(staffAcademyPath(academySlug, "/manage/academy/structure"));
}
