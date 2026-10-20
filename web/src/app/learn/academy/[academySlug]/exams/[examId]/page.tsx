import { notFound } from "next/navigation";

import { StudentExamOverviewPage } from "@/modules/exams/server";
import { getMyStudentAcademy } from "@/modules/students/server";

/** One exam's overview in a connected academy. Reading it never starts an attempt. */
export default async function StudentExamPage({ params }: PageProps<"/learn/academy/[academySlug]/exams/[examId]">) {
  const { academySlug, examId } = await params;
  const connected = await getMyStudentAcademy(academySlug);
  if (!connected) notFound();
  const { academy, access } = connected;
  return <StudentExamOverviewPage academy={{ id: academy.id, slug: academy.slug, name: academy.name, access }} examId={examId} />;
}
