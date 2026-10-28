import { notFound } from "next/navigation";

import { StudentAcademyHome } from "@/modules/students";
import { getMyStudentAcademy } from "@/modules/students/server";

/** A connected academy's details. Unconnected accounts and deeper academy pages are not found. */
export default async function AcademyHomePage({ params }: PageProps<"/learn/academy/[academySlug]/[[...path]]">) {
  const { academySlug, path } = await params;
  if (path?.length) notFound();
  const academy = await getMyStudentAcademy(academySlug);
  if (!academy) notFound();
  return <StudentAcademyHome academy={academy} />;
}
