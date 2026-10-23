import { notFound } from "next/navigation";
import { z } from "zod";

import { StudentAssignmentPage } from "@/modules/assignments/server";
import { getMyStudentAcademy } from "@/modules/students/server";

/** One assignment in a connected academy. Reading it never creates a draft. */
export default async function StudentAssignmentRoute({ params }: PageProps<"/learn/academy/[academySlug]/assignments/[assignmentId]">) {
  const { academySlug, assignmentId } = await params;
  if (!z.guid().safeParse(assignmentId).success) notFound();
  const connected = await getMyStudentAcademy(academySlug);
  if (!connected || connected.access !== "active") notFound();
  const { academy } = connected;
  return <StudentAssignmentPage academy={{ id: academy.id, slug: academy.slug, name: academy.name }} assignmentId={assignmentId} />;
}
