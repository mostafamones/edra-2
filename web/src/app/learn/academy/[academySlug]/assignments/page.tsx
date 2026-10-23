import { notFound } from "next/navigation";

import { StudentAssignmentList } from "@/modules/assignments/server";
import { getMyStudentAcademy } from "@/modules/students/server";

/** A connected academy's Assignments page. Unconnected or suspended accounts are not found. */
export default async function StudentAssignmentsPage({ params, searchParams }: PageProps<"/learn/academy/[academySlug]/assignments">) {
  const { academySlug } = await params;
  const { page } = await searchParams;
  const connected = await getMyStudentAcademy(academySlug);
  if (!connected || connected.access !== "active") notFound();
  const number = typeof page === "string" && /^[1-9]\d{0,3}$/.test(page) ? Number(page) : 1;
  const { academy } = connected;
  return <StudentAssignmentList academy={{ id: academy.id, slug: academy.slug, name: academy.name }} page={number} />;
}
