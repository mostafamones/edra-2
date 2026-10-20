import { notFound } from "next/navigation";

import { StudentExamList } from "@/modules/exams/server";
import { getMyStudentAcademy } from "@/modules/students/server";

/** A connected academy's Exams page. Unconnected accounts are not found. */
export default async function StudentExamsPage({ params, searchParams }: PageProps<"/learn/academy/[academySlug]/exams">) {
  const { academySlug } = await params;
  const { page } = await searchParams;
  const connected = await getMyStudentAcademy(academySlug);
  if (!connected) notFound();
  const number = typeof page === "string" && /^[1-9]\d{0,3}$/.test(page) ? Number(page) : 1;
  const { academy, access } = connected;
  return <StudentExamList academy={{ id: academy.id, slug: academy.slug, name: academy.name, access }} page={number} />;
}
