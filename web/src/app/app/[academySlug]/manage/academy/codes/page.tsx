import { redirect } from "next/navigation";

import { staffAcademyPath } from "@/lib/routing";

// Student codes now open in a sheet on the Enrollment page; keep older links working.
export default async function Page({ params }: { params: Promise<{ academySlug: string }> }) {
  const { academySlug } = await params;
  redirect(staffAcademyPath(academySlug, "/manage/academy/enrollment"));
}
