import { redirect } from "next/navigation";

import { staffAcademyPath } from "@/lib/routing";

// The staff list is the shared Assessments page; keep older links working with this type selected.
export default async function Page({ params }: { params: Promise<{ academySlug: string }> }) {
  const { academySlug } = await params;
  redirect(staffAcademyPath(academySlug, "/assessments?type=assignment"));
}
