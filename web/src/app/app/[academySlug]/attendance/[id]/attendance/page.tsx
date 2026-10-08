import { redirect } from "next/navigation";

import { staffAcademyPath } from "@/lib/routing";

/** Attendance now lives on the session page; keep older links working. */
export default async function Page({ params }: { params: Promise<{ academySlug: string; id: string }> }) {
  const { academySlug, id } = await params;
  redirect(staffAcademyPath(academySlug, `/attendance/${encodeURIComponent(id)}`));
}
