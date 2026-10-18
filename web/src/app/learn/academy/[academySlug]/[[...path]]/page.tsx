import { notFound } from "next/navigation";

import { StudentAcademyHome } from "@/modules/students";
import { getMyStudentAcademy } from "@/modules/students/server";

/** Academy home for a connected student. Unconnected accounts and deeper academy pages are not found. */
export default async function AcademyLearningPage({ params }: PageProps<"/learn/academy/[academySlug]/[[...path]]">) {
  const { academySlug, path } = await params;
  if (path?.length) notFound();
  const academy = await getMyStudentAcademy(academySlug);
  if (!academy) notFound();
  return <StudentAcademyHome academy={academy} />;
}
